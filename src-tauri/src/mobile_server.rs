use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::engine::PreviewSim;
use crate::AppState;

struct MobileRelayState {
    page: i64,
    page_seq: u64,
    pages: Option<Value>,
    mobile_theme: Option<String>,
    auto_popups: bool,
    config_seq: u64,
    pushed_snap: Option<Value>,
}

impl Default for MobileRelayState {
    fn default() -> Self {
        Self {
            page: 0,
            page_seq: 0,
            pages: None,
            mobile_theme: None,
            auto_popups: false,
            config_seq: 0,
            pushed_snap: None,
        }
    }
}

fn detect_lan_ips() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                let ip = addr.ip().to_string();
                if !ip.starts_with("127.") && ip != "0.0.0.0" {
                    ips.push(ip);
                }
            }
        }
    }
    if ips.is_empty() {
        ips.push("localhost".to_string());
    }
    ips
}

pub fn spawn(app: AppHandle) {
    let relay = Arc::new(Mutex::new(MobileRelayState::default()));
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
    let clean_path = raw_path.split('?').next().unwrap_or("/");

    let mut content_length = 0usize;
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }

    let mut body_bytes = buf[header_end..total_read].to_vec();
    while body_bytes.len() < content_length && body_bytes.len() < 512_000 {
        let mut chunk = [0u8; 8192];
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        body_bytes.extend_from_slice(&chunk[..n]);
    }

    if method.eq_ignore_ascii_case("OPTIONS") {
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        stream.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if clean_path == "/__mobile_info" {
        let ips = detect_lan_ips();
        let body = serde_json::to_vec(&json!({
            "ips": ips,
            "port": 1420,
            "url": format!("http://{}:1420/#mobile", ips[0]),
        }))
        .unwrap_or_default();
        return send_response(&mut stream, "200 OK", "application/json", &body);
    }

    if clean_path == "/__mobile_state" {
        if method.eq_ignore_ascii_case("POST") {
            let mut st = relay.lock().unwrap_or_else(|e| e.into_inner());
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
                if let Some(snap) = parsed.get("snap") {
                    if !snap.is_null() {
                        st.pushed_snap = Some(snap.clone());
                    }
                }
            }
            let body = serde_json::to_vec(&json!({
                "page": st.page,
                "pageSeq": st.page_seq,
                "configSeq": st.config_seq,
            }))
            .unwrap_or_default();
            return send_response(&mut stream, "200 OK", "application/json", &body);
        }

        // GET /__mobile_state
        let state = app.state::<AppState>();
        let live_snap = state.shared.latest.read().ok().map(|s| s.clone());
        let snap_val = if let Some(ref s) = live_snap {
            if s.player.is_some() {
                serde_json::to_value(s).ok()
            } else {
                None
            }
        } else {
            None
        };

        let final_snap = if snap_val.is_some() {
            snap_val
        } else {
            let pushed = relay
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .pushed_snap
                .clone();
            if pushed.is_some() {
                pushed
            } else {
                let mut guard = state.preview.lock().unwrap_or_else(|e| e.into_inner());
                let sim = guard.get_or_insert_with(|| PreviewSim::new(state.db.clone()));
                serde_json::to_value(sim.next()).ok()
            }
        };

        let st = relay.lock().unwrap_or_else(|e| e.into_inner());
        let body = serde_json::to_vec(&json!({
            "page": st.page,
            "pageSeq": st.page_seq,
            "pages": st.pages,
            "mobileTheme": st.mobile_theme,
            "autoPopups": st.auto_popups,
            "configSeq": st.config_seq,
            "snap": final_snap,
        }))
        .unwrap_or_default();
        return send_response(&mut stream, "200 OK", "application/json", &body);
    }

    // Serve static frontend assets embedded in Tauri
    let asset_path = match clean_path {
        "/" | "/mobile" | "/dash" | "/ddu" | "/pitwall" => "index.html".to_string(),
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
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body)?;
    Ok(())
}
