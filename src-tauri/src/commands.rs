use std::sync::atomic::Ordering;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::{Filters, LapRecord, LapTrace, PersonalBest, SessionSummary, TrackMap, UploadState};
use crate::engine::PreviewSim;
use crate::model::Snapshot;
use crate::online::{BoardSummary, Leaderboard, LeaderboardQuery, Me};
use crate::schedule::Schedule;
use crate::AppState;

type CmdResult<T> = Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    demo: bool,
    edit_mode: bool,
    overlay_visible: bool,
    game_focused: bool,
    data_dir: String,
    experimental_linux: bool,
}

#[tauri::command]
pub fn get_snapshot(state: State<AppState>) -> Snapshot {
    state.shared.latest.read().map(|s| s.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn get_status(state: State<AppState>) -> Status {
    Status {
        demo: state.shared.demo.load(Ordering::Acquire),
        edit_mode: state.edit_mode.load(Ordering::Acquire),
        overlay_visible: state.overlay_visible.load(Ordering::Acquire),
        game_focused: state.shared.game_focused.load(Ordering::Acquire),
        data_dir: state.data_dir.display().to_string(),
        experimental_linux: cfg!(target_os = "linux"),
    }
}

#[derive(serde::Serialize)]
pub struct LatestRelease {
    version: String,
    notes: String,
}

/// Latest published GitHub release. Used where the app cannot update itself
/// (Linux package managers) to tell the user a newer version exists.
#[tauri::command]
pub async fn latest_release() -> Result<LatestRelease, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("MDT-HUD/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let text = client
        .get("https://api.github.com/repos/mediterraneanmotorsport/MDT-HUD/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Could not reach GitHub: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let version = json["tag_name"]
        .as_str()
        .map(|t| t.trim_start_matches('v').to_owned())
        .filter(|v| !v.is_empty())
        .ok_or("The latest release has no version")?;
    Ok(LatestRelease { version, notes: json["body"].as_str().unwrap_or_default().to_owned() })
}

/// Layout and widget settings. The frontend owns the schema; the backend
/// persists it as opaque JSON.
#[tauri::command]
pub fn get_config(state: State<AppState>) -> Value {
    std::fs::read_to_string(&state.config_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

#[tauri::command]
pub fn save_config(app: AppHandle, state: State<AppState>, config: Value) -> CmdResult<()> {
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&state.config_path, text).map_err(|e| e.to_string())?;
    if let Ok(mut st) = state.mobile.lock() {
        st.app_config = Some(config.clone());
        if let Ok(meta) = std::fs::metadata(&state.config_path) {
            st.app_config_mtime = meta.modified().ok();
        }
        if let Some(t) = config.pointer("/general/theme").and_then(Value::as_str) {
            if t != "custom" {
                st.mobile_theme = Some(t.to_string());
            }
        }
        st.config_seq += 1;
    }
    if let Some(hz) = config.pointer("/general/updateHz").and_then(Value::as_u64) {
        state.shared.emit_hz.store(hz as u32, Ordering::Relaxed);
    }
    let monitor = config.pointer("/general/monitor").and_then(Value::as_str).unwrap_or_default();
    let moved = *state.overlay_monitor.lock().unwrap_or_else(|e| e.into_inner()) != monitor;
    if moved {
        crate::place_overlay(&app, monitor).map_err(|e| e.to_string())?;
    }
    if state.overlay_visible.load(Ordering::Acquire) {
        if let Some(overlay) = app.get_webview_window("overlay") {
            let _ = overlay.show();
            let _ = overlay.set_always_on_top(true);
        }
    }
    app.emit("config-changed", &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mobile_network_info() -> crate::mobile_server::MobileNetworkInfo {
    crate::mobile_server::get_network_info()
}

#[tauri::command]
pub fn open_mobile_firewall() -> CmdResult<bool> {
    crate::mobile_server::open_firewall_port()
}

pub fn apply_edit_mode(app: &AppHandle, enabled: bool) {
    let state = app.state::<AppState>();
    state.edit_mode.store(enabled, Ordering::Release);
    if let Some(overlay) = app.get_webview_window("overlay") {
        let broadcast = state.shared.broadcast_mode.load(Ordering::Acquire);
        let _ = overlay.set_ignore_cursor_events(!enabled && !broadcast);
        if enabled {
            let _ = overlay.show();
            let _ = overlay.set_focus();
        }
    }
    let _ = app.emit("edit-mode", enabled);
}

pub fn apply_overlay_visible(app: &AppHandle, visible: bool) {
    let state = app.state::<AppState>();
    state.overlay_visible.store(visible, Ordering::Release);
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = if visible { overlay.show() } else { overlay.hide() };
    }
    let _ = app.emit("overlay-visible", visible);
}

#[tauri::command]
pub fn set_edit_mode(app: AppHandle, enabled: bool) {
    apply_edit_mode(&app, enabled);
}

#[tauri::command]
pub fn set_overlay_visible(app: AppHandle, visible: bool) {
    apply_overlay_visible(&app, visible);
}

#[tauri::command]
pub fn set_demo_mode(app: AppHandle, state: State<AppState>, enabled: bool) {
    state.shared.demo.store(enabled, Ordering::Release);
    let _ = app.emit("demo-mode", enabled);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    /// Id stored in `general.monitor`.
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    primary: bool,
}

/// Connected monitors the overlay can be placed on.
#[tauri::command]
pub fn list_monitors(app: AppHandle) -> CmdResult<Vec<MonitorInfo>> {
    let primary = app.primary_monitor().map_err(|e| e.to_string())?.and_then(|m| m.name().cloned());
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .into_iter()
        .filter_map(|m| {
            let name = m.name()?.clone();
            Some(MonitorInfo {
                primary: primary.as_ref() == Some(&name),
                width: m.size().width,
                height: m.size().height,
                x: m.position().x,
                y: m.position().y,
                name,
            })
        })
        .collect())
}

/// Next frame of the companion's preview-only demo data (see `PreviewSim`).
#[tauri::command]
pub async fn get_preview_snapshot(state: State<'_, AppState>) -> CmdResult<Snapshot> {
    let mut preview = state.preview.lock().unwrap_or_else(|e| e.into_inner());
    Ok(preview.get_or_insert_with(|| PreviewSim::new(state.db.clone())).next())
}

#[tauri::command]
pub fn list_sessions(
    state: State<AppState>,
    track: Option<String>,
    car: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> CmdResult<Vec<SessionSummary>> {
    state.db.list_sessions(track.as_deref(), car.as_deref(), limit.unwrap_or(100), offset.unwrap_or(0))
}

#[tauri::command]
pub fn list_laps(state: State<AppState>, session_id: i64) -> CmdResult<Vec<LapRecord>> {
    state.db.list_laps(session_id)
}

#[tauri::command]
pub fn list_track_laps(
    state: State<AppState>,
    track: String,
    car: Option<String>,
    valid_only: Option<bool>,
    limit: Option<i64>,
) -> CmdResult<Vec<LapRecord>> {
    state.db.list_track_laps(&track, car.as_deref(), valid_only.unwrap_or(false), limit.unwrap_or(200))
}

#[tauri::command]
pub fn get_lap_trace(state: State<AppState>, lap_id: i64) -> CmdResult<LapTrace> {
    state.db.lap_trace(lap_id)
}

#[tauri::command]
pub fn personal_bests(state: State<AppState>) -> CmdResult<Vec<PersonalBest>> {
    state.db.personal_bests()
}

#[tauri::command]
pub fn get_filters(state: State<AppState>) -> CmdResult<Filters> {
    state.db.filters()
}

#[tauri::command]
pub fn get_track_map(state: State<AppState>, track: String) -> CmdResult<Option<TrackMap>> {
    state.db.track_map(&track)
}

#[tauri::command]
pub fn delete_lap(state: State<AppState>, lap_id: i64) -> CmdResult<()> {
    state.db.delete_lap(lap_id)?;
    state.shared.reload_reference.store(true, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub fn delete_session(state: State<AppState>, session_id: i64) -> CmdResult<()> {
    state.db.delete_session(session_id)?;
    state.shared.reload_reference.store(true, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub async fn daily_races(state: State<'_, AppState>, force: bool) -> CmdResult<Schedule> {
    crate::schedule::daily_races(&state.data_dir, force).await
}

#[tauri::command]
pub async fn online_register(state: State<'_, AppState>, display_name: Option<String>) -> CmdResult<Me> {
    crate::online::register(&state.data_dir, display_name).await
}

#[tauri::command]
pub async fn online_me(state: State<'_, AppState>) -> CmdResult<Me> {
    crate::online::me(&state.data_dir).await
}

#[tauri::command]
pub async fn online_set_display_name(state: State<'_, AppState>, display_name: Option<String>) -> CmdResult<Me> {
    crate::online::set_display_name(&state.data_dir, display_name).await
}

#[tauri::command]
pub async fn online_delete_data(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    crate::online::delete_data(&state.data_dir).await?;
    state.db.clear_uploads()?;
    let _ = app.emit("lap-uploads-changed", ());
    Ok(())
}

/// Queues laps for the online rankings. Returns how many qualified.
#[tauri::command]
pub fn upload_laps(app: AppHandle, state: State<AppState>, lap_ids: Vec<i64>) -> CmdResult<usize> {
    let settings = crate::online::require_enabled(&state.config_path)?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let queued = state.db.enqueue_uploads(&lap_ids, settings.anonymous, now)?;
    if queued > 0 {
        state.uploads.notify_one();
        let _ = app.emit("lap-uploads-changed", ());
    }
    Ok(queued)
}

#[tauri::command]
pub fn lap_upload_states(state: State<AppState>) -> CmdResult<Vec<UploadState>> {
    state.db.upload_states()
}

/// Removes a lap from the online rankings (and forgets a queued upload).
#[tauri::command]
pub async fn remove_lap_upload(app: AppHandle, state: State<'_, AppState>, lap_id: i64) -> CmdResult<()> {
    if let Some(remote_id) = state.db.upload_remote_id(lap_id)? {
        crate::online::delete_lap(&state.data_dir, &remote_id).await?;
    }
    state.db.remove_upload(lap_id)?;
    let _ = app.emit("lap-uploads-changed", lap_id);
    Ok(())
}

#[tauri::command]
pub async fn leaderboard(state: State<'_, AppState>, query: LeaderboardQuery) -> CmdResult<Leaderboard> {
    crate::online::require_enabled(&state.config_path)?;
    crate::online::leaderboard(&query).await
}

#[tauri::command]
pub async fn leaderboard_boards(state: State<'_, AppState>) -> CmdResult<Vec<BoardSummary>> {
    crate::online::require_enabled(&state.config_path)?;
    crate::online::boards().await
}

/// Telemetry of a ranked lap from the online leaderboards.
#[tauri::command]
pub async fn ranked_lap_trace(state: State<'_, AppState>, remote_id: String) -> CmdResult<LapTrace> {
    crate::online::require_enabled(&state.config_path)?;
    crate::online::ranked_lap_trace(&remote_id).await
}

use std::path::{Path, PathBuf};

fn copy_dir_recursive(src: &Path, dst: &Path) {
    if !src.exists() || !src.is_dir() {
        return;
    }
    let _ = std::fs::create_dir_all(dst);
    if let Ok(entries) = std::fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            let dest = dst.join(entry.file_name());
            if path.is_dir() {
                copy_dir_recursive(&path, &dest);
            } else if path.is_file() {
                let should_copy = match std::fs::metadata(&dest) {
                    Ok(dm) => {
                        if let Ok(sm) = std::fs::metadata(&path) {
                            sm.len() != dm.len()
                        } else {
                            false
                        }
                    }
                    Err(_) => true,
                };
                if should_copy {
                    let _ = std::fs::copy(&path, &dest);
                }
            }
        }
    }
}

pub fn ensure_spotter_profiles(data_dir: &Path) {
    let spotter_dir = data_dir.join("Perfil");
    let _ = std::fs::create_dir_all(&spotter_dir);

    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf()));
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(ref ed) = exe_dir {
        // Tauri v2 NSIS bundle resource structures
        candidates.push(ed.join("resources").join("_up_").join("public").join("Perfil"));
        candidates.push(ed.join("resources").join("_up_").join("Perfil"));
        candidates.push(ed.join("resources").join("public").join("Perfil"));
        candidates.push(ed.join("resources").join("Perfil"));
        candidates.push(ed.join("_up_").join("public").join("Perfil"));
        candidates.push(ed.join("_up_").join("Perfil"));
        candidates.push(ed.join("public").join("Perfil"));
        candidates.push(ed.join("Perfil"));
    }
    // Development and local paths
    candidates.push(PathBuf::from("public/Perfil"));
    candidates.push(PathBuf::from("../public/Perfil"));
    candidates.push(PathBuf::from("Perfil"));
    candidates.push(PathBuf::from("../Perfil"));

    // Also check parent AppData (for dev builds to inherit from main AppData)
    if let Some(parent) = data_dir.parent() {
        candidates.push(parent.join("Perfil"));
    }

    for src in candidates {
        if src.is_dir() && (src.join("Sara").is_dir() || src.join("Antonio").is_dir()) {
            copy_dir_recursive(&src, &spotter_dir);
            break;
        }
    }

    let readme_path = spotter_dir.join("LEEME_VOCES_SPOTTER.txt");
    if !readme_path.exists() {
        let _ = std::fs::write(
            readme_path,
            "MDT-HUD · Perfiles de Voz para Spotter e Ingeniero de Pista\n\nAquí puedes añadir nuevos perfiles de voz o sustituir audios .wav.\nCrea una subcarpeta con el nombre de la voz (ej: Perfil/MiVoz/) y dentro subcarpetas de eventos (ej: yellow_flag, blue_flag, pit_limiter, low_fuel, box_this_lap, tc_up, etc.) con archivos Audio1.wav, Audio2.wav..."
        );
    }
}

fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            b' ' => out.push_str("%20"),
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

pub fn scan_spotter_manifest(spotter_dir: &Path) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    if let Ok(entries) = std::fs::read_dir(spotter_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let profile_name = entry.file_name().to_string_lossy().to_string();
            let mut events_map = serde_json::Map::new();

            if let Ok(ev_entries) = std::fs::read_dir(&path) {
                for ev_entry in ev_entries.flatten() {
                    let ev_path = ev_entry.path();
                    if !ev_path.is_dir() {
                        continue;
                    }
                    let event_name = ev_entry.file_name().to_string_lossy().to_string();
                    let mut file_urls = Vec::new();

                    if let Ok(files) = std::fs::read_dir(&ev_path) {
                        for f in files.flatten() {
                            let fp = f.path();
                            if fp.is_file() {
                                let fname = f.file_name().to_string_lossy().to_string();
                                let fname_lower = fname.to_lowercase();
                                if fname_lower.ends_with(".wav") || fname_lower.ends_with(".mp3") || fname_lower.ends_with(".ogg") {
                                    let url = format!(
                                        "/Perfil/{}/{}/{}",
                                        percent_encode(&profile_name),
                                        percent_encode(&event_name),
                                        percent_encode(&fname)
                                    );
                                    file_urls.push(serde_json::Value::String(url));
                                }
                            }
                        }
                    }
                    let norm = event_name.to_lowercase().trim().to_string();
                    events_map.insert(event_name.clone(), serde_json::Value::Array(file_urls.clone()));
                    if norm != event_name {
                        events_map.insert(norm, serde_json::Value::Array(file_urls));
                    }
                }
            }
            map.insert(profile_name, serde_json::Value::Object(events_map));
        }
    }
    serde_json::Value::Object(map)
}

/// Sends HTTP PUT /rest/watch/focus/{slot_id} to LMU's local REST server at 127.0.0.1:6397.
/// Uses a direct, synchronous TCP connection with explicit Content-Length: 0 and timeout to avoid CORS,
/// chunked transfer issues, and async runtime dependencies.
pub fn lmu_rest_focus(slot_id: i64) -> bool {
    use std::io::{Read, Write};
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;

    let targets = ["127.0.0.1:6397", "localhost:6397"];
    for target in targets {
        if let Ok(addrs) = target.to_socket_addrs() {
            for addr in addrs {
                if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(800)) {
                    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
                    let _ = stream.set_write_timeout(Some(Duration::from_millis(1000)));

                    let http_request = format!(
                        "PUT /rest/watch/focus/{slot_id} HTTP/1.1\r\n\
                         Host: {target}\r\n\
                         User-Agent: MDT-HUD/1.0.4\r\n\
                         Accept: application/json\r\n\
                         Content-Length: 0\r\n\
                         Connection: close\r\n\
                         \r\n"
                    );

                    if stream.write_all(http_request.as_bytes()).is_ok() {
                        let mut resp_buf = [0u8; 1024];
                        if let Ok(n) = stream.read(&mut resp_buf) {
                            let resp = String::from_utf8_lossy(&resp_buf[..n]);
                            if resp.starts_with("HTTP/1.1 200")
                                || resp.starts_with("HTTP/1.0 200")
                                || resp.starts_with("HTTP/1.1 204")
                                || resp.starts_with("HTTP/1.0 204")
                            {
                                eprintln!("[LMU-FOCUS] Slot {slot_id} focused successfully via {addr}");
                                return true;
                            } else {
                                eprintln!("[LMU-FOCUS] Target {addr} responded: {}", resp.lines().next().unwrap_or(""));
                            }
                        }
                    }
                }
            }
        }
    }
    eprintln!("[LMU-FOCUS] Could not reach LMU REST API on port 6397 for slot {slot_id}");
    false
}

/// Focuses/spectates a driver in Le Mans Ultimate via its local REST API.
#[tauri::command]
pub async fn focus_vehicle(app: AppHandle, slot_id: i64) -> CmdResult<bool> {
    let state = app.state::<AppState>();
    state.shared.focused_slot.store(slot_id as i32, Ordering::Release);
    let ok = tokio::task::spawn_blocking(move || lmu_rest_focus(slot_id))
        .await
        .unwrap_or(false);
    Ok(ok)
}

/// Sets or clears the focused vehicle slot for telemetry overlays.
#[tauri::command]
pub fn set_focused_slot(app: AppHandle, slot_id: Option<i32>) {
    let state = app.state::<AppState>();
    state.shared.focused_slot.store(slot_id.unwrap_or(-1), Ordering::Release);
}

/// Enables or disables broadcast mode, updating overlay click-through state.
#[tauri::command]
pub fn set_broadcast_mode(app: AppHandle, enabled: bool) {
    let state = app.state::<AppState>();
    state.shared.broadcast_mode.store(enabled, Ordering::Release);
    if let Some(overlay) = app.get_webview_window("overlay") {
        let editing = state.edit_mode.load(Ordering::Acquire);
        let _ = overlay.set_ignore_cursor_events(!editing && !enabled);
    }
}

/// Returns the dynamic manifest of all spotter profiles found in %APPDATA%/MDT-HUD/Perfil/
#[tauri::command]
pub fn get_spotter_manifest(state: State<AppState>) -> CmdResult<serde_json::Value> {
    ensure_spotter_profiles(&state.data_dir);
    let spotter_dir = state.data_dir.join("Perfil");
    Ok(scan_spotter_manifest(&spotter_dir))
}

/// Opens the Spotter voice profiles (.wav) folder in the OS file explorer.
#[tauri::command]
pub fn open_spotter_folder(state: State<AppState>) -> CmdResult<()> {
    ensure_spotter_profiles(&state.data_dir);
    let spotter_dir = state.data_dir.join("Perfil");
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&spotter_dir).spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = open::that(&spotter_dir);
    }
    Ok(())
}
