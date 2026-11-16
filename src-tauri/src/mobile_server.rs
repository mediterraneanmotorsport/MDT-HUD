use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream, UdpSocket};
use std::process::Command;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::engine::PreviewSim;
use crate::AppState;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub const FIREWALL_RULE_NAME: &str = "MDT-HUD Mobile DDU (TCP 1420)";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MobileNetworkInfo {
    pub ips: Vec<String>,
    pub port: u16,
    pub url: String,
    pub pitwall_url: String,
    pub firewall_open: bool,
}

pub struct MobileRelayState {
    pub page: i64,
    pub page_seq: u64,
    pub pages: Option<Value>,
    pub mobile_theme: Option<String>,
    pub auto_popups: bool,
    pub config_seq: u64,
    pub pushed_snap: Option<Value>,
    pub pushed_at: Option<Instant>,
    pub app_config: Option<Value>,
    pub app_config_mtime: Option<SystemTime>,
    pub last_live_et: f64,
    pub last_live_change: Instant,
}

impl Default for MobileRelayState {
    fn default() -> Self {
        Self {
            page: 0,
            page_seq: 0,
            pages: None,
            mobile_theme: None,
            auto_popups: false,
            config_seq: 1,
            pushed_snap: None,
            pushed_at: None,
            app_config: None,
            app_config_mtime: None,
            last_live_et: -1.0,
            last_live_change: Instant::now(),
        }
    }
}

fn ip_priority(ip: &Ipv4Addr) -> u8 {
    let o = ip.octets();
    // VirtualBox Host-Only default subnet (192.168.56.x) -> low priority
    if o[0] == 192 && o[1] == 168 && o[2] == 56 {
        return 50;
    }
    // Standard home/office Wi-Fi & Ethernet LAN (192.168.x.x) -> highest priority
    if o[0] == 192 && o[1] == 168 {
        return 1;
    }
    // Private 10.x.x.x LAN
    if o[0] == 10 {
        return 2;
    }
    // Private 172.16.0.0 - 172.31.255.255 (often WSL/Docker/Hyper-V on .17-.31, so rank below 192.168/10)
    if o[0] == 172 && (16..=31).contains(&o[1]) {
        return 30;
    }
    // Carrier-grade NAT / Tailscale / ZeroTier (100.64.0.0/10)
    if o[0] == 100 && (64..=127).contains(&o[1]) {
        return 40;
    }
    20
}

fn is_usable_lan_ip(ip: &Ipv4Addr) -> bool {
    let o = ip.octets();
    if ip.is_loopback() || ip.is_unspecified() || ip.is_broadcast() {
        return false;
    }
    // Ignore link-local APIPA 169.254.x.x
    if o[0] == 169 && o[1] == 254 {
        return false;
    }
    true
}

pub fn detect_lan_ips() -> Vec<String> {
    let mut found: Vec<Ipv4Addr> = Vec::new();

    // 1. Probe routing table toward common private LAN gateways first, then public DNS
    for target in [
        "192.168.1.1:80",
        "192.168.0.1:80",
        "192.168.100.1:80",
        "10.0.0.1:80",
        "8.8.8.8:80",
    ] {
        if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
            if sock.connect(target).is_ok() {
                if let Ok(addr) = sock.local_addr() {
                    if let std::net::SocketAddr::V4(v4) = addr {
                        let ip = *v4.ip();
                        if is_usable_lan_ip(&ip) && !found.contains(&ip) {
                            found.push(ip);
                        }
                    }
                }
            }
        }
    }

    // 2. On Windows, also inspect `ipconfig` output to capture all active Wi-Fi/Ethernet IPv4 adapters
    // even if a VPN tunnel overrides the default route.
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("ipconfig");
        cmd.creation_flags(CREATE_NO_WINDOW);
        if let Ok(output) = cmd.output() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("IPv4") || line.contains("IP Address") {
                    if let Some((_, right)) = line.split_once(':') {
                        let candidate = right
                            .trim()
                            .trim_end_matches("(Preferred)")
                            .trim_end_matches("(Preferido)")
                            .trim();
                        // Extract first valid IPv4 token
                        for token in candidate.split(|c: char| !c.is_ascii_digit() && c != '.') {
                            if !token.is_empty() {
                                if let Ok(ip) = token.parse::<Ipv4Addr>() {
                                    if is_usable_lan_ip(&ip) && !found.contains(&ip) {
                                        found.push(ip);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    found.sort_by_key(|ip| ip_priority(ip));

    let mut ips: Vec<String> = found.into_iter().map(|ip| ip.to_string()).collect();
    if ips.is_empty() {
        ips.push("localhost".to_string());
    }
    ips
}

pub fn check_firewall_rule() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("netsh");
        cmd.args([
            "advfirewall",
            "firewall",
            "show",
            "rule",
            &format!("name={FIREWALL_RULE_NAME}"),
        ])
        .creation_flags(CREATE_NO_WINDOW);
        if let Ok(out) = cmd.output() {
            return out.status.success();
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

pub fn open_firewall_port() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let exe_path = std::env::current_exe()
            .ok()
            .and_then(|p| p.to_str().map(str::to_owned))
            .unwrap_or_default();

        // 1. Try adding the rule directly without UAC (succeeds if already running as Admin)
        let mut direct = Command::new("netsh");
        direct
            .args([
                "advfirewall",
                "firewall",
                "add",
                "rule",
                &format!("name={FIREWALL_RULE_NAME}"),
                "dir=in",
                "action=allow",
                "protocol=TCP",
                "localport=1420",
                "profile=any",
            ])
            .creation_flags(CREATE_NO_WINDOW);
        if let Ok(out) = direct.output() {
            if out.status.success() {
                if !exe_path.is_empty() {
                    let _ = Command::new("netsh")
                        .args([
                            "advfirewall",
                            "firewall",
                            "add",
                            "rule",
                            "name=MDT-HUD App (LAN)",
                            "dir=in",
                            "action=allow",
                            &format!("program={exe_path}"),
                            "profile=any",
                        ])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                }
                return Ok(true);
            }
        }

        // 2. Request elevation via PowerShell Start-Process -Verb RunAs
        let mut cmd_str = format!(
            "netsh advfirewall firewall delete rule name=\"{FIREWALL_RULE_NAME}\" >nul 2>&1 & netsh advfirewall firewall add rule name=\"{FIREWALL_RULE_NAME}\" dir=in action=allow protocol=TCP localport=1420 profile=any"
        );
        if !exe_path.is_empty() {
            cmd_str.push_str(&format!(
                " & netsh advfirewall firewall delete rule name=\"MDT-HUD App (LAN)\" >nul 2>&1 & netsh advfirewall firewall add rule name=\"MDT-HUD App (LAN)\" dir=in action=allow program=\"{exe_path}\" profile=any"
            ));
        }

        let ps_script = format!(
            "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c {}' -Verb RunAs -WindowStyle Hidden -Wait",
            cmd_str.replace('\'', "''")
        );

        let mut ps = Command::new("powershell");
        ps.args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &ps_script,
        ])
        .creation_flags(CREATE_NO_WINDOW);

        let _ = ps.output().map_err(|e| e.to_string())?;
        Ok(check_firewall_rule())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(true)
    }
}

pub fn get_network_info() -> MobileNetworkInfo {
    let ips = detect_lan_ips();
    let primary = ips.first().cloned().unwrap_or_else(|| "localhost".to_string());
    MobileNetworkInfo {
        ips,
        port: 1420,
        url: format!("http://{primary}:1420/#mobile"),
        pitwall_url: format!("http://{primary}:1420/#pitwall"),
        firewall_open: check_firewall_rule(),
    }
}

fn url_decode(input: &str) -> String {
    let mut out = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (
                (bytes[i + 1] as char).to_digit(16),
                (bytes[i + 2] as char).to_digit(16),
            ) {
                out.push(((h << 4) | l) as u8);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

pub fn spawn(app: AppHandle, relay: Arc<Mutex<MobileRelayState>>) {
    // Automatically ensure the Windows Firewall port 1420 rule is registered on first launch
    let app_for_fw = app.clone();
    thread::Builder::new()
        .name("mobile-firewall-check".into())
        .spawn(move || {
            #[cfg(target_os = "windows")]
            {
                if !check_firewall_rule() {
                    let state = app_for_fw.state::<AppState>();
                    let marker = state.data_dir.join("firewall_port_1420_v1.flag");
                    if !marker.exists() {
                        let _ = std::fs::write(&marker, b"1");
                        let _ = open_firewall_port();
                    }
                }
            }
        })
        .ok();

    thread::Builder::new()
        .name("mobile-http".into())
        .spawn(move || {
            let listener = loop {
                match TcpListener::bind("0.0.0.0:1420") {
                    Ok(l) => break l,
                    Err(_) => thread::sleep(Duration::from_secs(2)),
                }
            };
            for stream in listener.incoming().flatten() {
                let app = app.clone();
                let relay = relay.clone();
                thread::spawn(move || {
                    let _ = handle_client(stream, &app, &relay);
                });
            }
        })
        .expect("spawn mobile http server");
}

fn handle_client(
    mut stream: TcpStream,
    app: &AppHandle,
    relay: &Arc<Mutex<MobileRelayState>>,
) -> std::io::Result<()> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let mut buf = vec![0u8; 65536];
    let mut total_read = 0usize;
    let header_end;
    loop {
        let n = stream.read(&mut buf[total_read..])?;
        if n == 0 {
            return Ok(());
        }
        total_read += n;
        if let Some(pos) = buf[..total_read].windows(4).position(|w| w == b"\r\n\r\n") {
            header_end = pos + 4;
            break;
        }
        if total_read >= buf.len() {
            return Ok(());
        }
    }

    let header_str = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let mut lines = header_str.lines();
    let req_line = lines.next().unwrap_or("");
    let mut parts = req_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let raw_path = parts.next().unwrap_or("/");
    let (clean_path, query_str) = raw_path.split_once('?').unwrap_or((raw_path, ""));

    let mut content_length = 0usize;
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }

    let mut body_bytes = buf[header_end..total_read].to_vec();
    while body_bytes.len() < content_length && body_bytes.len() < 2_097_152 {
        let mut chunk = [0u8; 8192];
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        body_bytes.extend_from_slice(&chunk[..n]);
    }

    if method.eq_ignore_ascii_case("OPTIONS") {
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Accept, *\r\nAccess-Control-Allow-Private-Network: true\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        stream.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if clean_path == "/__spotter_files" {
        let state = app.state::<AppState>();
        crate::commands::ensure_spotter_profiles(&state.data_dir);
        let manifest = crate::commands::scan_spotter_manifest(&state.data_dir.join("Perfil"));
        let body = serde_json::to_vec(&manifest).unwrap_or_default();
        return send_response(&mut stream, "200 OK", "application/json", &body);
    }

    if clean_path == "/__mobile_info" {
        let info = get_network_info();
        let body = serde_json::to_vec(&info).unwrap_or_default();
        return send_response(&mut stream, "200 OK", "application/json", &body);
    }

    if clean_path == "/__mobile_track_map" {
        let mut track_name = String::new();
        for kv in query_str.split('&') {
            if let Some((k, v)) = kv.split_once('=') {
                if k == "track" {
                    track_name = url_decode(v);
                }
            }
        }
        let state = app.state::<AppState>();
        let map = if !track_name.is_empty() {
            state.db.track_map(&track_name).ok().flatten()
        } else {
            None
        };
        let body = serde_json::to_vec(&map).unwrap_or_else(|_| b"null".to_vec());
        return send_response(&mut stream, "200 OK", "application/json", &body);
    }

    if clean_path.starts_with("/lmu-api/rest/watch/focus/")
        || clean_path.starts_with("/rest/watch/focus/")
        || clean_path == "/__focus_vehicle"
    {
        let slot_id = if clean_path.starts_with("/lmu-api/rest/watch/focus/") {
            clean_path.trim_start_matches("/lmu-api/rest/watch/focus/").trim_matches('/').parse::<i64>().ok()
        } else if clean_path.starts_with("/rest/watch/focus/") {
            clean_path.trim_start_matches("/rest/watch/focus/").trim_matches('/').parse::<i64>().ok()
        } else {
            query_str.split('&').find_map(|part| {
                if let Some((k, v)) = part.split_once('=') {
                    if k == "slotId" {
                        return v.parse::<i64>().ok();
                    }
                }
                None
            })
        };

        if let Some(id) = slot_id {
            let ok = crate::commands::lmu_rest_focus(id);
            let resp = if ok {
                b"{\"ok\":true}".to_vec()
            } else {
                b"{\"ok\":false,\"error\":\"lmu_unreachable\"}".to_vec()
            };
            return send_response(&mut stream, "200 OK", "application/json", &resp);
        }
    }

    if clean_path == "/__mobile_focus" {
        let state = app.state::<AppState>();
        if let Ok(parsed) = serde_json::from_slice::<Value>(&body_bytes) {
            if let Some(slot) = parsed.get("slotId").or_else(|| parsed.get("focusSlotId")).and_then(Value::as_i64) {
                state.shared.focused_slot.store(slot as i32, Ordering::Release);
                let _ = tokio::task::spawn_blocking(move || crate::commands::lmu_rest_focus(slot));
            }
        }
        return send_response(&mut stream, "200 OK", "application/json", b"{\"ok\":true}");
    }

    if clean_path == "/__mobile_stream" {
        let state = app.state::<AppState>();
        let _ = stream.set_nodelay(true);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(3600)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(8)));

        let sse_init = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache, no-transform\r\nConnection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Private-Network: true\r\n\r\n";
        if stream.write_all(sse_init.as_bytes()).is_err() || stream.flush().is_err() {
            return Ok(());
        }

        loop {
            let live_snap = state.shared.latest.read().ok().map(|s| s.clone());
            let demo_on = state.shared.demo.load(Ordering::Acquire);

            let mut st = relay.lock().unwrap_or_else(|e| e.into_inner());

            // Check if disk config.json was updated
            if let Ok(meta) = std::fs::metadata(&state.config_path) {
                if let Ok(mtime) = meta.modified() {
                    if st.app_config_mtime != Some(mtime) {
                        if let Ok(text) = std::fs::read_to_string(&state.config_path) {
                            if let Ok(val) = serde_json::from_str::<Value>(&text) {
                                if st.mobile_theme.is_none() {
                                    if let Some(t) = val.pointer("/general/theme").and_then(Value::as_str) {
                                        if t != "custom" {
                                            st.mobile_theme = Some(t.to_string());
                                        }
                                    }
                                }
                                st.app_config = Some(val);
                                st.app_config_mtime = Some(mtime);
                                st.config_seq += 1;
                            }
                        }
                    }
                }
            }

            let snap_val = if let Some(ref s) = live_snap {
                if s.player.is_some() {
                    serde_json::to_value(s).ok()
                } else {
                    None
                }
            } else {
                None
            };

            let is_pushed_fresh = st.pushed_at.map_or(false, |t| t.elapsed() < Duration::from_millis(2000));
            let pushed = if is_pushed_fresh { st.pushed_snap.clone() } else { None };

            let page = st.page;
            let page_seq = st.page_seq;
            let pages = st.pages.clone();
            let mobile_theme = st.mobile_theme.clone();
            let auto_popups = st.auto_popups;
            let config_seq = st.config_seq;
            let app_config = st.app_config.clone();
            drop(st);

            let final_snap = if snap_val.is_some() {
                snap_val
            } else if pushed.is_some() {
                pushed
            } else if demo_on {
                let mut guard = state.preview.lock().unwrap_or_else(|e| e.into_inner());
                let sim = guard.get_or_insert_with(|| PreviewSim::new(state.db.clone()));
                serde_json::to_value(sim.next()).ok()
            } else {
                None
            };

            let payload = json!({
                "page": page,
                "pageSeq": page_seq,
                "pages": pages,
                "mobileTheme": mobile_theme,
                "autoPopups": auto_popups,
                "configSeq": config_seq,
                "appConfig": app_config,
                "snap": final_snap,
            });

            if let Ok(body) = serde_json::to_string(&payload) {
                let chunk = format!("data: {}\n\n", body);
                if stream.write_all(chunk.as_bytes()).is_err() || stream.flush().is_err() {
                    break;
                }
            }

            thread::sleep(Duration::from_millis(33)); // 30Hz streaming
        }

        return Ok(());
    }

    if clean_path == "/__mobile_state" {
        let state = app.state::<AppState>();
        if method.eq_ignore_ascii_case("POST") {
            let mut st = relay.lock().unwrap_or_else(|e| e.into_inner());
            let mut emit_cfg: Option<Value> = None;
            if let Ok(parsed) = serde_json::from_slice::<Value>(&body_bytes) {
                if let Some(p) = parsed.get("page").and_then(Value::as_i64) {
                    st.page = p;
                    st.page_seq += 1;
                }
                if let Some(pages) = parsed.get("pages") {
                    if pages.is_array() {
                        st.pages = Some(pages.clone());
                        st.config_seq += 1;
                    }
                }
                if let Some(theme) = parsed.get("mobileTheme").and_then(Value::as_str) {
                    st.mobile_theme = Some(theme.to_string());
                    st.config_seq += 1;
                }
                if let Some(ap) = parsed.get("autoPopups").and_then(Value::as_bool) {
                    st.auto_popups = ap;
                    st.config_seq += 1;
                }
                if let Some(cfg) = parsed.get("appConfig") {
                    if cfg.is_object() {
                        if let Ok(text) = serde_json::to_string_pretty(cfg) {
                            let _ = std::fs::write(&state.config_path, text);
                            if let Ok(meta) = std::fs::metadata(&state.config_path) {
                                st.app_config_mtime = meta.modified().ok();
                            }
                        }
                        st.app_config = Some(cfg.clone());
                        st.config_seq += 1;
                        emit_cfg = Some(cfg.clone());
                    }
                }
                if let Some(slot) = parsed.get("focusSlotId").or_else(|| parsed.get("slotId")).and_then(Value::as_i64) {
                    state.shared.focused_slot.store(slot as i32, Ordering::Release);
                    let _ = tokio::task::spawn_blocking(move || crate::commands::lmu_rest_focus(slot));
                }
                if let Some(snap) = parsed.get("snap") {
                    if !snap.is_null() {
                        st.pushed_snap = Some(snap.clone());
                        st.pushed_at = Some(Instant::now());
                    }
                }
            }
            let resp_json = json!({
                "page": st.page,
                "pageSeq": st.page_seq,
                "configSeq": st.config_seq,
            });
            drop(st);
            if let Some(cfg) = emit_cfg {
                let _ = app.emit("config-changed", &cfg);
            }
            let body = serde_json::to_vec(&resp_json).unwrap_or_default();
            return send_response(&mut stream, "200 OK", "application/json", &body);
        }

        // GET /__mobile_state
        let live_snap = state.shared.latest.read().ok().map(|s| s.clone());
        let demo_on = state.shared.demo.load(std::sync::atomic::Ordering::Acquire);

        let mut st = relay.lock().unwrap_or_else(|e| e.into_inner());

        // Check if disk config.json was updated
        if let Ok(meta) = std::fs::metadata(&state.config_path) {
            if let Ok(mtime) = meta.modified() {
                if st.app_config_mtime != Some(mtime) {
                    if let Ok(text) = std::fs::read_to_string(&state.config_path) {
                        if let Ok(val) = serde_json::from_str::<Value>(&text) {
                            if st.mobile_theme.is_none() {
                                if let Some(t) = val.pointer("/general/theme").and_then(Value::as_str) {
                                    if t != "custom" {
                                        st.mobile_theme = Some(t.to_string());
                                    }
                                }
                            }
                            st.app_config = Some(val);
                            st.app_config_mtime = Some(mtime);
                            st.config_seq += 1;
                        }
                    }
                }
            }
        }

        let snap_val = if let Some(ref s) = live_snap {
            if s.player.is_some() {
                serde_json::to_value(s).ok()
            } else {
                None
            }
        } else {
            None
        };

        let is_pushed_fresh = st.pushed_at.map_or(false, |t| t.elapsed() < Duration::from_millis(2000));
        let pushed = if is_pushed_fresh { st.pushed_snap.clone() } else { None };
        let page = st.page;
        let page_seq = st.page_seq;
        let pages = st.pages.clone();
        let mobile_theme = st.mobile_theme.clone();
        let auto_popups = st.auto_popups;
        let config_seq = st.config_seq;
        let app_config = st.app_config.clone();
        drop(st);

        let final_snap = if snap_val.is_some() {
            snap_val
        } else if pushed.is_some() {
            pushed
        } else if demo_on {
            let mut guard = state.preview.lock().unwrap_or_else(|e| e.into_inner());
            let sim = guard.get_or_insert_with(|| PreviewSim::new(state.db.clone()));
            serde_json::to_value(sim.next()).ok()
        } else {
            None
        };

        let body = serde_json::to_vec(&json!({
            "page": page,
            "pageSeq": page_seq,
            "pages": pages,
            "mobileTheme": mobile_theme,
            "autoPopups": auto_popups,
            "configSeq": config_seq,
            "appConfig": app_config,
            "snap": final_snap,
        }))
        .unwrap_or_default();
        return send_response(&mut stream, "200 OK", "application/json", &body);
    }

    // Check if custom audio exists on disk in %APPDATA%/MDT-HUD/Perfil/
    if clean_path.starts_with("/Perfil/") {
        let state = app.state::<AppState>();
        let rel = clean_path.trim_start_matches("/Perfil/");
        let disk_file = state.data_dir.join("Perfil").join(rel);
        if disk_file.is_file() {
            if let Ok(bytes) = std::fs::read(&disk_file) {
                return send_response(&mut stream, "200 OK", "audio/wav", &bytes);
            }
        }
    }

    // Serve static frontend assets embedded in Tauri
    let asset_path = match clean_path {
        "/" | "/mobile" | "/dash" | "/ddu" | "/pitwall" | "/broadcast" | "/overlay" => "index.html".to_string(),
        p => p.trim_start_matches('/').to_string(),
    };

    let resolver = app.asset_resolver();
    if let Some(asset) = resolver
        .get(asset_path.clone())
        .or_else(|| resolver.get("index.html".to_string()))
    {
        return send_response(&mut stream, "200 OK", asset.mime_type(), asset.bytes());
    }

    send_response(&mut stream, "404 Not Found", "text/plain", b"Not Found")
}

fn send_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Accept, *\r\nAccess-Control-Allow-Private-Network: true\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body)?;
    Ok(())
}
