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
    if let Some(sc_val) = config.pointer("/general/shortcuts") {
        if let Ok(parsed_sc) = serde_json::from_value::<crate::AppShortcuts>(sc_val.clone()) {
            if let Ok(mut lock) = state.configured_shortcuts.lock() {
                *lock = parsed_sc.clone();
            }
            crate::update_global_shortcuts(&app, &parsed_sc);
        }
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
        let fx_ed = state.fx_editor_mode.load(Ordering::Acquire);
        let _ = overlay.set_ignore_cursor_events(!enabled && !fx_ed && !broadcast);
        let mon = state.overlay_monitor.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if mon == "__all__" {
            // Span across all monitors ONLY if the user explicitly configured "__all__"
            if let Some((pos, size)) = crate::get_all_monitors_bounds(app) {
                let _ = overlay.set_position(pos);
                let _ = overlay.set_size(size);
            }
        } else {
            // Stay strictly on the chosen monitor (Primary); NEVER hijack or block other displays!
            let _ = crate::place_overlay(app, &mon);
        }
        if enabled {
            let _ = overlay.show();
            let _ = overlay.set_focus();
        }
    }
    let _ = app.emit("edit-mode", enabled);
}

pub fn apply_fx_editor_mode(app: &AppHandle, enabled: bool) {
    let state = app.state::<AppState>();
    state.fx_editor_mode.store(enabled, Ordering::Release);
    if let Some(overlay) = app.get_webview_window("overlay") {
        let broadcast = state.shared.broadcast_mode.load(Ordering::Acquire);
        let edit = state.edit_mode.load(Ordering::Acquire);
        let _ = overlay.set_ignore_cursor_events(!enabled && !edit && !broadcast);
        if enabled {
            let _ = overlay.show();
            let _ = overlay.set_focus();
        }
    }
    let _ = app.emit("fx-editor-mode", enabled);
}

#[tauri::command]
pub fn set_fx_editor_mode(app: AppHandle, enabled: bool) {
    apply_fx_editor_mode(&app, enabled);
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

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    /// Id stored in `general.monitor`.
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    primary: bool,
    scale_factor: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OverlayLayoutInfo {
    pub is_multi_monitor: bool,
    pub primary_offset_x: i32,
    pub primary_offset_y: i32,
    pub primary_width: u32,
    pub primary_height: u32,
    pub bounds_x: i32,
    pub bounds_y: i32,
    pub bounds_width: u32,
    pub bounds_height: u32,
    pub scale_factor: f64,
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
                scale_factor: m.scale_factor(),
                name,
            })
        })
        .collect())
}

#[tauri::command]
pub fn get_overlay_layout(app: AppHandle, state: State<'_, AppState>) -> CmdResult<OverlayLayoutInfo> {
    let mon = state.overlay_monitor.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let is_multi = mon == "__all__";
    let window = app.get_webview_window("overlay");
    let scale_factor = window.as_ref().and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);

    let primary = app.primary_monitor().ok().flatten();
    let (p_x, p_y, p_w, p_h) = primary
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
        .unwrap_or((0, 0, 1920, 1080));

    if is_multi {
        if let Some((pos, size)) = crate::get_all_monitors_bounds(&app) {
            let offset_x = p_x - pos.x;
            let offset_y = p_y - pos.y;
            return Ok(OverlayLayoutInfo {
                is_multi_monitor: true,
                primary_offset_x: offset_x,
                primary_offset_y: offset_y,
                primary_width: p_w,
                primary_height: p_h,
                bounds_x: pos.x,
                bounds_y: pos.y,
                bounds_width: size.width,
                bounds_height: size.height,
                scale_factor,
            });
        }
    }

    Ok(OverlayLayoutInfo {
        is_multi_monitor: false,
        primary_offset_x: 0,
        primary_offset_y: 0,
        primary_width: p_w,
        primary_height: p_h,
        bounds_x: p_x,
        bounds_y: p_y,
        bounds_width: p_w,
        bounds_height: p_h,
        scale_factor,
    })
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

/// Copies new/modified files and removes orphan files from dst that no longer exist in src.
pub fn sync_dir_recursive(src: &Path, dst: &Path) {
    if !src.exists() {
        return;
    }
    copy_dir_recursive(src, dst);

    if let Ok(entries) = std::fs::read_dir(dst) {
        for entry in entries.flatten() {
            let dest_path = entry.path();
            let src_path = src.join(entry.file_name());
            if !src_path.exists() {
                if dest_path.is_file() {
                    let _ = std::fs::remove_file(&dest_path);
                } else if dest_path.is_dir() {
                    let _ = std::fs::remove_dir_all(&dest_path);
                }
            } else if dest_path.is_dir() && src_path.is_dir() {
                sync_dir_recursive(&src_path, &dest_path);
            }
        }
    }
}

/// Recursively deletes any legacy audio file named Audio*.wav or starting with "audio"
pub fn purge_legacy_audio_files(dir: &Path) {
    if !dir.exists() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                purge_legacy_audio_files(&path);
            } else if path.is_file() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.starts_with("audio") && (name.ends_with(".wav") || name.ends_with(".mp3") || name.ends_with(".ogg")) {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
    }
}

pub fn ensure_spotter_profiles(data_dir: &Path) {
    let spotter_dir = data_dir.join("Perfil");
    let _ = std::fs::create_dir_all(&spotter_dir);

    // Clean up any legacy Audio*.wav in the user's Perfil folder
    purge_legacy_audio_files(&spotter_dir);

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
            for built_in in ["Sara", "Antonio"] {
                let src_prof = src.join(built_in);
                let dst_prof = spotter_dir.join(built_in);
                if src_prof.is_dir() {
                    sync_dir_recursive(&src_prof, &dst_prof);
                }
            }
            copy_dir_recursive(&src, &spotter_dir);
            break;
        }
    }

    let readme_path = spotter_dir.join("LEEME_VOCES_SPOTTER.txt");
    if !readme_path.exists() {
        let _ = std::fs::write(
            readme_path,
            "MDT-HUD · Perfiles de Voz para Spotter e Ingeniero de Pista\n\nAquí puedes añadir nuevos perfiles de voz o sustituir audios .wav.\nCrea una subcarpeta con el nombre de la voz (ej: Perfil/MiVoz/) y dentro subcarpetas de eventos (ej: yellow_flag, blue_flag, pit_limiter, low_fuel, box_this_lap, tc_up, etc.) con archivos 1.wav, 2.wav..."
        );
    }

    // Ensure Sound folder (Spotter alert and Batalla) is available in data_dir
    let sound_dir = data_dir.join("Sound");
    let _ = std::fs::create_dir_all(&sound_dir);
    let mut sound_candidates: Vec<PathBuf> = Vec::new();
    if let Some(ref ed) = exe_dir {
        sound_candidates.push(ed.join("resources").join("_up_").join("public").join("Sound"));
        sound_candidates.push(ed.join("resources").join("_up_").join("Sound"));
        sound_candidates.push(ed.join("resources").join("public").join("Sound"));
        sound_candidates.push(ed.join("resources").join("Sound"));
        sound_candidates.push(ed.join("_up_").join("public").join("Sound"));
        sound_candidates.push(ed.join("_up_").join("Sound"));
        sound_candidates.push(ed.join("public").join("Sound"));
        sound_candidates.push(ed.join("Sound"));
    }
    sound_candidates.push(PathBuf::from("public/Sound"));
    sound_candidates.push(PathBuf::from("../public/Sound"));
    sound_candidates.push(PathBuf::from("Sound"));
    sound_candidates.push(PathBuf::from("../Sound"));
    if let Some(parent) = data_dir.parent() {
        sound_candidates.push(parent.join("Sound"));
    }
    for src in sound_candidates {
        if src.is_dir() && (src.join("Batalla").is_dir() || src.join("Spotter alert").is_dir()) {
            copy_dir_recursive(&src, &sound_dir);
            break;
        }
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
                                if fname_lower.starts_with("audio") {
                                    let _ = std::fs::remove_file(&fp);
                                    continue;
                                }
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

/// Checks whether MDT-HUD is registered to start automatically with Windows (HKCU Run key).
#[tauri::command]
pub fn get_auto_start() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let out = std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "MDT-HUD",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        return out.is_ok_and(|o| o.status.success());
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// Enables or disables automatic launch on Windows startup (HKCU Run key).
#[tauri::command]
pub fn set_auto_start(enabled: bool) -> CmdResult<bool> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let val = format!("\"{}\"", exe.display());
            let out = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "MDT-HUD",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &val,
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| e.to_string())?;
            Ok(out.status.success())
        } else {
            let _ = std::process::Command::new("reg")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "MDT-HUD",
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            Ok(false)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Ok(false)
    }
}

fn resolve_official_discord_webhook() -> String {
    if let Some(env_url) = option_env!("MDT_DISCORD_WEBHOOK_URL") {
        let trimmed = env_url.trim();
        if trimmed.starts_with("https://") {
            return trimmed.to_string();
        }
    }
    const MASK: [u8; 12] = [0x4d, 0x44, 0x54, 0x2d, 0x48, 0x55, 0x44, 0x21, 0x5a, 0x93, 0xa7, 0x3c];
    const ENC: [u8; 121] = [
        37, 48, 32, 93, 59, 111, 107, 14, 62, 250, 212, 95, 34, 54, 48, 3, 43, 58, 41, 14, 59, 227,
        206, 19, 58, 33, 54, 69, 39, 58, 47, 82, 117, 162, 146, 11, 126, 115, 101, 26, 125, 103,
        118, 21, 107, 164, 146, 4, 123, 118, 97, 27, 103, 2, 34, 120, 23, 164, 145, 120, 18, 41,
        58, 24, 4, 102, 42, 126, 5, 213, 205, 90, 62, 45, 45, 95, 36, 28, 3, 83, 56, 213, 224,
        109, 62, 5, 44, 90, 12, 35, 16, 75, 21, 209, 236, 117, 5, 0, 59, 104, 125, 19, 38, 84, 3,
        252, 214, 86, 35, 27, 16, 103, 34, 13, 52, 110, 99, 249, 151, 123, 46,
    ];
    let bytes: Vec<u8> = ENC.iter().enumerate().map(|(i, b)| b ^ MASK[i % MASK.len()]).collect();
    String::from_utf8(bytes).unwrap_or_default()
}

/// Sends a session report (text + optional PNG image) to Discord from the Rust backend
/// so the official default webhook URL is never exposed to the frontend, config.json, or DevTools.
#[tauri::command]
pub async fn send_discord_webhook(
    custom_webhook: Option<String>,
    username: String,
    content: String,
    image_png_base64: Option<String>,
    filename: Option<String>,
) -> CmdResult<()> {
    let target = custom_webhook
        .map(|s| s.trim().to_string())
        .filter(|s| s.starts_with("https://"))
        .unwrap_or_else(resolve_official_discord_webhook);

    if !target.starts_with("https://") {
        return Err("URL del webhook de Discord no configurada".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    let resp = if let Some(b64) = image_png_base64.filter(|s| !s.is_empty()) {
        use base64::Engine;
        let png_bytes = base64::engine::general_purpose::STANDARD
            .decode(b64.trim())
            .map_err(|e| format!("Error decodificando imagen PNG: {e}"))?;
        let fname = filename.unwrap_or_else(|| "mdt-session.png".to_string());
        let payload_json = serde_json::json!({
            "username": username,
            "content": content,
        })
        .to_string();

        let boundary = "----MdtHudDiscordBoundary7MA4YWxkTrZu0gW";
        let mut body: Vec<u8> = Vec::with_capacity(png_bytes.len() + payload_json.len() + 512);
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n{payload_json}\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"{fname}\"\r\nContent-Type: image/png\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(&png_bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

        client
            .post(&target)
            .header("Content-Type", format!("multipart/form-data; boundary={boundary}"))
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Error de red enviando a Discord: {e}"))?
    } else {
        let payload_json = serde_json::json!({
            "username": username,
            "content": content,
        })
        .to_string();
        client
            .post(&target)
            .header("Content-Type", "application/json")
            .body(payload_json)
            .send()
            .await
            .map_err(|e| format!("Error de red enviando a Discord: {e}"))?
    };

    let status = resp.status();
    if !status.is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Discord respondió error HTTP {}: {}", status.as_u16(), err_text.chars().take(200).collect::<String>()));
    }
    Ok(())
}

// =========================================================================
// INGENIERO DE PISTA IA LOCAL + VOCES CLONADAS (.ONNX / PIPER TTS)
// =========================================================================

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnnxVoiceInfo {
    pub name: String,
    pub file_name: String,
    pub path: String,
    pub has_config: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnnxVoicesStatus {
    pub dir: String,
    pub piper_found: bool,
    pub piper_path: String,
    pub voices: Vec<OnnxVoiceInfo>,
}

fn find_piper_binary(voices_dir: &std::path::Path) -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    let exe_name = "piper.exe";
    #[cfg(not(target_os = "windows"))]
    let exe_name = "piper";

    let candidates = [
        voices_dir.join(exe_name),
        voices_dir.join("piper").join(exe_name),
    ];
    for c in candidates {
        if c.is_file() {
            return Some(c);
        }
    }
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let p = dir.join(exe_name);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

#[tauri::command]
pub fn list_onnx_voices(state: State<AppState>) -> CmdResult<OnnxVoicesStatus> {
    let voices_dir = state.data_dir.join("VocesONNX");
    let _ = std::fs::create_dir_all(&voices_dir);

    let piper = find_piper_binary(&voices_dir);
    let mut voices: Vec<OnnxVoiceInfo> = Vec::new();

    let mut scan_dirs = vec![voices_dir.clone()];
    if let Ok(entries) = std::fs::read_dir(&voices_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                scan_dirs.push(p);
            }
        }
    }

    for dir in scan_dirs {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                        if ext.eq_ignore_ascii_case("onnx") {
                            let file_name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
                            let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or(&file_name).to_string();
                            let cfg_path = std::path::PathBuf::from(format!("{}.json", p.display()));
                            voices.push(OnnxVoiceInfo {
                                name,
                                file_name,
                                path: p.to_string_lossy().to_string(),
                                has_config: cfg_path.is_file(),
                            });
                        }
                    }
                }
            }
        }
    }
    voices.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(OnnxVoicesStatus {
        dir: voices_dir.to_string_lossy().to_string(),
        piper_found: piper.is_some(),
        piper_path: piper.map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        voices,
    })
}

#[tauri::command]
pub fn open_onnx_voices_folder(state: State<AppState>) -> CmdResult<()> {
    let voices_dir = state.data_dir.join("VocesONNX");
    let _ = std::fs::create_dir_all(&voices_dir);
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&voices_dir).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&voices_dir).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&voices_dir).spawn();
    }
    Ok(())
}

/// Downloads and installs Piper TTS (`piper.exe` + `espeak-ng-data`) and optionally
/// a default Spanish `.onnx` starter voice (`es_ES-davefx-medium`) into `VocesONNX/`.
/// Runs cleanly from inside the app so any user can enable local `.onnx` voices in 1 click.
#[tauri::command]
pub async fn install_piper_tts(
    app: AppHandle,
    state: State<'_, AppState>,
    install_default_voice: bool,
) -> CmdResult<OnnxVoicesStatus> {
    let voices_dir = state.data_dir.join("VocesONNX");
    std::fs::create_dir_all(&voices_dir).map_err(|e| format!("Error creando VocesONNX: {e}"))?;

    let emit_prog = |stage: &str, msg: &str, pct: u8| {
        let _ = app.emit(
            "piper-install-progress",
            serde_json::json!({ "stage": stage, "message": msg, "percent": pct }),
        );
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    // 1. Download & extract piper_windows_amd64.zip if piper.exe is missing
    if find_piper_binary(&voices_dir).is_none() {
        #[cfg(target_os = "windows")]
        let piper_url = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
        #[cfg(not(target_os = "windows"))]
        let piper_url = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz";

        emit_prog("piper", "Descargando motor Piper TTS (22 MB)...", 15);
        let resp = client
            .get(piper_url)
            .send()
            .await
            .map_err(|e| format!("Error descargando Piper TTS: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("Error HTTP {} descargando Piper TTS", resp.status().as_u16()));
        }
        let zip_bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Error leyendo paquete Piper TTS: {e}"))?
            .to_vec();

        emit_prog("piper", "Extrayendo Piper TTS en VocesONNX...", 45);
        let target_dir = voices_dir.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let cursor = std::io::Cursor::new(zip_bytes);
            let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("ZIP Piper inválido: {e}"))?;
            for i in 0..archive.len() {
                let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
                let Some(rel) = file.enclosed_name().map(|p| p.to_path_buf()) else {
                    continue;
                };
                let out_path = target_dir.join(rel);
                if file.is_dir() {
                    std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
                } else {
                    if let Some(parent) = out_path.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut out_file).map_err(|e| e.to_string())?;
                }
            }
            Ok(())
        })
        .await
        .map_err(|e| format!("Error extrayendo Piper: {e}"))??;
    }

    // 2. Optionally download starter Castilian Spanish .onnx voices (Carlos + Elena) if not present
    if install_default_voice {
        let starters: [(&str, &str, &str, u8); 2] = [
            (
                "Carlos_MDT",
                "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx",
                "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json",
                65,
            ),
            (
                "Elena_MDT",
                "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx",
                "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json",
                85,
            ),
        ];

        for (name, onnx_url, json_url, pct) in starters {
            let model_path = voices_dir.join(format!("{name}.onnx"));
            let cfg_path = voices_dir.join(format!("{name}.onnx.json"));

            if !cfg_path.is_file() {
                if let Ok(r) = client.get(json_url).send().await {
                    if r.status().is_success() {
                        if let Ok(bytes) = r.bytes().await {
                            let _ = std::fs::write(&cfg_path, &bytes);
                        }
                    }
                }
            }
            if !model_path.is_file() {
                emit_prog("voice", &format!("Descargando voz española nativa {name} (.onnx)..."), pct);
                let r = client
                    .get(onnx_url)
                    .send()
                    .await
                    .map_err(|e| format!("Error descargando {name}: {e}"))?;
                if !r.status().is_success() {
                    return Err(format!("Error HTTP {} descargando {name}", r.status().as_u16()));
                }
                let bytes = r.bytes().await.map_err(|e| e.to_string())?;
                std::fs::write(&model_path, &bytes).map_err(|e| e.to_string())?;
            }
        }
    }

    emit_prog("done", "✓ Piper TTS instalado y listo", 100);
    list_onnx_voices(state)
}

/// Synthesizes Spanish/multilingual speech locally using Piper TTS + a user-provided `.onnx` voice model.
/// Returns a base64-encoded WAV data URL ready for Web Audio / WEC radio filter playback.
#[tauri::command]
pub async fn synthesize_onnx_tts(
    state: State<'_, AppState>,
    text: String,
    model_path: String,
    length_scale: Option<f32>,
    noise_scale: Option<f32>,
    noise_w: Option<f32>,
    speaker_id: Option<u32>,
) -> CmdResult<String> {
    let clean_text = text.trim().to_string();
    if clean_text.is_empty() {
        return Err("Texto vacío".into());
    }
    let voices_dir = state.data_dir.join("VocesONNX");
    let piper_bin = find_piper_binary(&voices_dir)
        .ok_or_else(|| "No se encontró piper.exe en VocesONNX ni en el PATH del sistema.".to_string())?;
    let model = std::path::PathBuf::from(model_path.trim());
    if !model.is_file() {
        return Err(format!("Modelo .onnx no encontrado: {}", model.display()));
    }

    // Sanitize `.onnx.json` phoneme_id_map: Piper C++ on Windows aborts if any key has >1 Unicode codepoint
    // (a known issue in official Spanish HuggingFace models like `es_ES-davefx-medium.onnx.json`).
    let cfg_json_path = std::path::PathBuf::from(format!("{}.json", model.display()));
    if cfg_json_path.is_file() {
        if let Ok(raw) = std::fs::read_to_string(&cfg_json_path) {
            if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(map) = val.get_mut("phoneme_id_map").and_then(|v| v.as_object_mut()) {
                    let before = map.len();
                    map.retain(|k, _| k.chars().count() <= 1);
                    if map.len() != before {
                        if let Ok(fixed) = serde_json::to_string(&val) {
                            let _ = std::fs::write(&cfg_json_path, fixed);
                        }
                    }
                }
            }
        }
    }

    tokio::task::spawn_blocking(move || {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let out_wav = std::env::temp_dir().join(format!("mdt_onnx_tts_{ts}.wav"));

        let mut cmd = Command::new(&piper_bin);
        cmd.arg("--model")
            .arg(&model)
            .arg("--output_file")
            .arg(&out_wav)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        if let Some(ls) = length_scale {
            cmd.arg("--length_scale").arg(format!("{:.2}", ls.clamp(0.6, 1.6)));
        }
        if let Some(ns) = noise_scale {
            cmd.arg("--noise_scale").arg(format!("{:.3}", ns.clamp(0.2, 1.0)));
        }
        if let Some(nw) = noise_w {
            cmd.arg("--noise_w").arg(format!("{:.3}", nw.clamp(0.2, 1.0)));
        }
        if let Some(spk) = speaker_id {
            cmd.arg("--speaker").arg(spk.to_string());
        }
        if let Some(parent) = piper_bin.parent() {
            cmd.current_dir(parent);
        }
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }

        let mut child = cmd.spawn().map_err(|e| format!("Error iniciando piper: {e}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(clean_text.as_bytes());
            let _ = stdin.write_all(b"\n");
        }
        let output = child.wait_with_output().map_err(|e| format!("Error ejecutando piper: {e}"))?;
        if !output.status.success() {
            let _ = std::fs::remove_file(&out_wav);
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Piper devolvió error: {}", stderr.chars().take(240).collect::<String>()));
        }

        let wav_bytes = std::fs::read(&out_wav).map_err(|e| format!("No se pudo leer el WAV generado: {e}"))?;
        let _ = std::fs::remove_file(&out_wav);

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);
        Ok(format!("data:audio/wav;base64,{b64}"))
    })
    .await
    .map_err(|e| format!("Error en hilo TTS ONNX: {e}"))?
}

/// Calls a local LLM server (Ollama or LM Studio / OpenAI-compatible) with live telemetry context.
#[tauri::command]
pub async fn ai_engineer_chat(
    endpoint: String,
    model: String,
    system_prompt: String,
    user_prompt: String,
) -> CmdResult<String> {
    let base = endpoint.trim().trim_end_matches('/').to_string();
    if !base.starts_with("http://") && !base.starts_with("https://") {
        return Err("URL del servidor IA local no válida".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Error cliente HTTP IA: {e}"))?;

    let is_ollama = base.contains(":11434") || base.ends_with("/api/chat");
    let (url, payload) = if is_ollama {
        let u = if base.ends_with("/api/chat") { base } else { format!("{base}/api/chat") };
        let body = serde_json::json!({
            "model": model,
            "stream": false,
            "options": { "temperature": 0.45, "num_predict": 110 },
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ]
        });
        (u, body)
    } else {
        let u = if base.ends_with("/chat/completions") {
            base
        } else if base.ends_with("/v1") {
            format!("{base}/chat/completions")
        } else {
            format!("{base}/v1/chat/completions")
        };
        let body = serde_json::json!({
            "model": model,
            "temperature": 0.45,
            "max_tokens": 110,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ]
        });
        (u, body)
    };

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(payload.to_string())
        .send()
        .await
        .map_err(|e| format!("No se pudo conectar con la IA local ({url}): {e}"))?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let err = resp.text().await.unwrap_or_default();
        return Err(format!("IA local devolvió HTTP {code}: {}", err.chars().take(180).collect::<String>()));
    }

    let val: serde_json::Value = serde_json::from_str(&resp.text().await.unwrap_or_default())
        .map_err(|e| format!("Respuesta JSON inválida de IA local: {e}"))?;

    let content = val
        .pointer("/message/content")
        .or_else(|| val.pointer("/choices/0/message/content"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if content.is_empty() {
        return Err("La IA local devolvió una respuesta vacía".into());
    }
    Ok(content)
}

fn find_whisper_stt(data_dir: &std::path::Path) -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    #[cfg(target_os = "windows")]
    let exe_name = "whisper-cli.exe";
    #[cfg(not(target_os = "windows"))]
    let exe_name = "whisper-cli";

    let mut dirs = vec![data_dir.join("SttWhisper")];
    if let Some(parent) = data_dir.parent() {
        dirs.push(parent.join("SttWhisper"));
    }
    for dir in dirs {
        let cli = dir.join(exe_name);
        if !cli.is_file() {
            continue;
        }
        let model_candidates = [
            "ggml-base-q5_1.bin",
            "ggml-small-q5_1.bin",
            "ggml-base.bin",
            "ggml-tiny-q5_1.bin",
            "ggml-tiny.bin",
        ];
        for m in model_candidates {
            let mp = dir.join(m);
            if mp.is_file() {
                return Some((cli, mp));
            }
        }
    }
    None
}

/// Captures a single spoken Spanish voice command from a recorded WAV (app-selected mic)
/// using local offline `whisper.cpp` (high-accuracy Spanish neural STT) with automatic
/// fallback to Windows native `System.Speech.Recognition`.
#[tauri::command]
pub async fn listen_voice_command(
    state: State<'_, AppState>,
    timeout_secs: Option<u32>,
    wav_base64: Option<String>,
) -> CmdResult<String> {
    let secs = timeout_secs.unwrap_or(6).clamp(3, 12);
    let data_dir = state.data_dir.clone();

    #[cfg(target_os = "windows")]
    {
        tokio::task::spawn_blocking(move || {
            use std::os::windows::process::CommandExt;
            use std::process::Command;

            let mut tmp_wav: Option<std::path::PathBuf> = None;
            if let Some(b64) = wav_base64.filter(|s| !s.trim().is_empty()) {
                use base64::Engine;
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(b64.trim())
                    .map_err(|e| format!("Error decodificando WAV del micrófono: {e}"))?;
                let ts = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0);
                let p = std::env::temp_dir().join(format!("mdt_mic_ptt_{ts}.wav"));
                std::fs::write(&p, &bytes).map_err(|e| format!("Error guardando WAV temporal: {e}"))?;
                tmp_wav = Some(p);
            }

            // Priority 1: Local offline Whisper.cpp (fast & accurate natural Spanish STT on CPU)
            if let (Some(ref wav_path), Some((whisper_cli, whisper_model))) =
                (&tmp_wav, find_whisper_stt(&data_dir))
            {
                let mut cmd = Command::new(&whisper_cli);
                cmd.args([
                    "-m",
                    &whisper_model.to_string_lossy(),
                    "-l",
                    "es",
                    "-f",
                    &wav_path.to_string_lossy(),
                    "--no-timestamps",
                    "-nt",
                    "-np",
                    "-t",
                    "8",
                    "--prompt",
                    "Ingeniero de pista de simracing en español: neumáticos, gasolina, energía virtual, boxes, vuelta rápida, posición, líder, frenos, lluvia, daños, sanciones, ritmo.",
                ])
                .creation_flags(0x0800_0000);
                if let Some(parent) = whisper_cli.parent() {
                    cmd.current_dir(parent);
                }
                if let Ok(out) = cmd.output() {
                    if out.status.success() {
                        let _ = std::fs::remove_file(wav_path);
                        let raw = String::from_utf8_lossy(&out.stdout);
                        let cleaned: String = raw
                            .lines()
                            .map(|l| l.trim())
                            .filter(|l| {
                                !l.is_empty()
                                    && !l.contains("[BLANK_AUDIO]")
                                    && !l.starts_with('[')
                                    && !l.starts_with('(')
                            })
                            .collect::<Vec<_>>()
                            .join(" ")
                            .trim()
                            .to_string();
                        return Ok(cleaned);
                    }
                }
            }

            // Priority 2: Fallback to Windows native System.Speech.Recognition (es-ES)
            let input_setup = if let Some(ref p) = tmp_wav {
                let escaped = p.to_string_lossy().replace('\'', "''");
                format!("$rec.SetInputToWaveFile('{escaped}')\n$res = $rec.Recognize()")
            } else {
                format!(
                    "$rec.SetInputToDefaultAudioDevice()\n$rec.InitialSilenceTimeout = [TimeSpan]::FromSeconds({secs})\n$rec.BabbleTimeout = [TimeSpan]::FromSeconds(4)\n$rec.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(650)\n$res = $rec.Recognize([TimeSpan]::FromSeconds({secs}))"
                )
            };

            let ps_script = format!(
                r#"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$rec = $null
try {{
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::GetCultureInfo('es-ES'))
}} catch {{
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
}}
$dict = New-Object System.Speech.Recognition.DictationGrammar
$rec.LoadGrammar($dict)
$choices = New-Object System.Speech.Recognition.Choices @(
  'cuál es el tiempo más rápido de la sesión',
  'vuelta rápida',
  'mejor tiempo',
  'mi mejor vuelta',
  'mi última vuelta',
  'mi ritmo',
  'cuánto queda',
  'cuántas vueltas quedan',
  'tiempo restante',
  'combustible',
  'cuánta gasolina tengo',
  'energía virtual',
  'cuándo paro en boxes',
  'estrategia',
  'cómo van los neumáticos',
  'cómo van las gomas',
  'desgaste de ruedas',
  'temperatura de frenos',
  'frenos',
  'posición',
  'quién va primero',
  'quién va líder',
  'a cuánto estoy del de delante',
  'quién viene detrás',
  'sanciones',
  'penalizaciones',
  'límites de pista',
  'banderas',
  'daños del coche',
  'cómo está el coche',
  'va a llover',
  'qué tiempo hace',
  'temperatura de pista',
  'informe de carrera',
  'resumen'
)
$gb = New-Object System.Speech.Recognition.GrammarBuilder
$gb.Culture = $rec.RecognizerInfo.Culture
$gb.Append($choices)
$g = New-Object System.Speech.Recognition.Grammar($gb)
$rec.LoadGrammar($g)
{input_setup}
if ($res -and $res.Text) {{
  Write-Output $res.Text
}}
$rec.Dispose()"#
            );

            let out = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &ps_script])
                .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
                .output()
                .map_err(|e| format!("Error iniciando micrófono Windows: {e}"))?;

            if let Some(p) = tmp_wav {
                let _ = std::fs::remove_file(p);
            }

            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr);
                return Err(format!("Error reconocimiento de voz Windows: {}", err.chars().take(200).collect::<String>()));
            }
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            Ok(text)
        })
        .await
        .map_err(|e| format!("Error hilo micrófono: {e}"))?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (secs, wav_base64, data_dir);
        Err("Reconocimiento de voz nativo solo disponible en Windows".into())
    }
}

// =========================================================================
// QWEN3-TTS 0.6B LOCAL (CLONACIÓN ZERO-SHOT · CUDA / ROCm · FP16)
// =========================================================================

const QWEN3_SERVER_SCRIPT: &str = include_str!("../qwen3_tts_server.py");
const QWEN3_DEFAULT_ENDPOINT: &str = "http://127.0.0.1:18421";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Qwen3VoiceProfile {
    pub name: String,
    pub dir: String,
    pub audio_file: String,
    pub has_audio: bool,
    pub has_transcript: bool,
    pub preloaded: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Qwen3VoicesStatus {
    pub dir: String,
    pub endpoint: String,
    pub venv_found: bool,
    pub whisper_found: bool,
    pub server_running: bool,
    pub server_ready: bool,
    pub server_loading: bool,
    pub backend: String,
    pub gpu: String,
    pub dtype: String,
    pub model: String,
    pub error: String,
    pub cache_files: u32,
    pub cache_bytes: u64,
    pub profiles: Vec<Qwen3VoiceProfile>,
}

fn resolve_qwen3_voices_dir(data_dir: &std::path::Path) -> std::path::PathBuf {
    // 1. Inside the project root (`<project>/VocesMDTQwen`) during development or if present
    if let Some(project_root) = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
        if project_root.is_dir() {
            return project_root.join("VocesMDTQwen");
        }
    }
    // 2. Alongside the executable (`<exe_dir>/VocesMDTQwen`) for portable/installed builds
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let candidate = exe_dir.join("VocesMDTQwen");
            if candidate.is_dir() || std::fs::create_dir_all(&candidate).is_ok() {
                return candidate;
            }
        }
    }
    // 3. Fallback if exe directory is read-only (e.g. Program Files)
    data_dir.join("VocesMDTQwen")
}

fn ensure_qwen3_voices_dir(data_dir: &std::path::Path) -> std::path::PathBuf {
    let dir = resolve_qwen3_voices_dir(data_dir);
    let _ = std::fs::create_dir_all(&dir);

    // Create starter profile folders so the user can drop ref.wav (+ optional ref.txt) directly inside each one
    for starter in ["Antonio", "Sara", "Ingeniero_Custom"] {
        let p = dir.join(starter);
        let _ = std::fs::create_dir_all(&p);
    }

    let readme = dir.join("README.txt");
    if !readme.is_file() {
        let _ = std::fs::write(
            &readme,
            "=== MDT-HUD · VOCES DE REFERENCIA QWEN3-TTS 0.6B (CUDA / ROCm · FP16) ===\r\n\
             \r\n\
             Cada subcarpeta dentro de VocesMDTQwen es un perfil/voz distinto (ej: Antonio, Sara, Ingeniero_Custom).\r\n\
             Puedes crear todas las subcarpetas que quieras.\r\n\
             \r\n\
             Dentro de cada carpeta de perfil coloca:\r\n\
               1. ref.wav  (audio limpio de 5 a 15 segundos de la voz que quieres clonar; también vale .mp3 o .flac)\r\n\
               2. ref.txt  (OPCIONAL pero recomendado: transcripción exacta de lo que dice ref.wav para máxima fidelidad)\r\n\
             \r\n\
             Al iniciar Qwen3-TTS 0.6B desde MDT-HUD, todos los perfiles se precargan automáticamente en VRAM\r\n\
             (en FP16 sobre CUDA o ROCm) para responder con latencia mínima.\r\n",
        );
    }

    // Seed Antonio/ref.wav & ref.txt from repo dev folder if available and missing
    let antonio_wav = dir.join("Antonio").join("ref.wav");
    if !antonio_wav.is_file() {
        let dev_seed = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("qwen_voices")
            .join("Antonio")
            .join("ref.wav");
        if dev_seed.is_file() {
            let _ = std::fs::copy(&dev_seed, &antonio_wav);
            let dev_txt = dev_seed.with_extension("txt");
            if dev_txt.is_file() {
                let _ = std::fs::copy(&dev_txt, dir.join("Antonio").join("ref.txt"));
            }
        }
    }

    dir
}

fn scan_qwen3_profiles(
    voices_dir: &std::path::Path,
    preloaded_set: &std::collections::HashSet<String>,
) -> Vec<Qwen3VoiceProfile> {
    let exts = ["wav", "mp3", "flac", "ogg", "m4a"];
    let mut profiles = Vec::new();
    if let Ok(entries) = std::fs::read_dir(voices_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() {
                continue;
            }
            let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            if name.is_empty() || name.starts_with('.') || name.starts_with("__") {
                continue;
            }
            let mut audio_file = String::new();
            for cand in ["ref.wav", "ref.flac", "ref.mp3", "ref.ogg"] {
                if p.join(cand).is_file() {
                    audio_file = cand.to_string();
                    break;
                }
            }
            if audio_file.is_empty() {
                if let Ok(sub) = std::fs::read_dir(&p) {
                    let mut files: Vec<std::path::PathBuf> = sub.flatten().map(|e| e.path()).collect();
                    files.sort();
                    for f in files {
                        if f.is_file() {
                            if let Some(ext) = f.extension().and_then(|e| e.to_str()) {
                                if exts.iter().any(|x| x.eq_ignore_ascii_case(ext)) {
                                    audio_file = f.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            let has_transcript = p
                .join("ref.txt")
                .is_file()
                && std::fs::read_to_string(p.join("ref.txt"))
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false);
            let preloaded = preloaded_set.contains(&name);
            profiles.push(Qwen3VoiceProfile {
                name,
                dir: p.to_string_lossy().to_string(),
                has_audio: !audio_file.is_empty(),
                audio_file,
                has_transcript,
                preloaded,
            });
        }
    }
    profiles.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    profiles
}

#[tauri::command]
pub async fn list_qwen3_voices(
    state: State<'_, AppState>,
    endpoint: Option<String>,
) -> CmdResult<Qwen3VoicesStatus> {
    let voices_dir = ensure_qwen3_voices_dir(&state.data_dir);
    let base = endpoint
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
        .unwrap_or_else(|| QWEN3_DEFAULT_ENDPOINT.to_string());

    let mut server_running = false;
    let mut server_ready = false;
    let mut server_loading = false;
    let mut backend = String::new();
    let mut gpu = String::new();
    let mut dtype = String::new();
    let mut model = "Qwen/Qwen3-TTS-12Hz-0.6B-Base".to_string();
    let mut error = String::new();
    let mut preloaded_set = std::collections::HashSet::new();

    if let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(800))
        .build()
    {
        if let Ok(resp) = client.get(format!("{base}/health")).send().await {
            if resp.status().is_success() {
                server_running = true;
                if let Ok(val) = resp.json::<serde_json::Value>().await {
                    server_ready = val.get("ready").and_then(|v| v.as_bool()).unwrap_or(false);
                    server_loading = val.get("loading").and_then(|v| v.as_bool()).unwrap_or(false);
                    backend = val.get("backend").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    gpu = val.get("gpu").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    dtype = val.get("dtype").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if let Some(m) = val.get("model").and_then(|v| v.as_str()) {
                        model = m.to_string();
                    }
                    error = val.get("error").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if let Some(arr) = val.get("cachedPrompts").and_then(|v| v.as_array()) {
                        for item in arr {
                            if let Some(s) = item.as_str() {
                                preloaded_set.insert(s.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    let profiles = scan_qwen3_profiles(&voices_dir, &preloaded_set);
    let mut cache_files: u32 = 0;
    let mut cache_bytes: u64 = 0;
    if let Ok(entries) = std::fs::read_dir(&voices_dir) {
        for entry in entries.flatten() {
            let cache_dir = entry.path().join(".cache");
            if cache_dir.is_dir() {
                if let Ok(files) = std::fs::read_dir(&cache_dir) {
                    for f in files.flatten() {
                        if let Ok(meta) = f.metadata() {
                            if meta.is_file() {
                                cache_files += 1;
                                cache_bytes += meta.len();
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    let venv_found = voices_dir.join(".venv").join("Scripts").join("python.exe").is_file();
    #[cfg(not(target_os = "windows"))]
    let venv_found = voices_dir.join(".venv").join("bin").join("python").is_file();
    let whisper_found = find_whisper_stt(&state.data_dir).is_some();

    Ok(Qwen3VoicesStatus {
        dir: voices_dir.to_string_lossy().to_string(),
        endpoint: base,
        venv_found,
        whisper_found,
        server_running,
        server_ready,
        server_loading,
        backend,
        gpu,
        dtype,
        model,
        error,
        cache_files,
        cache_bytes,
        profiles,
    })
}

#[tauri::command]
pub fn open_qwen3_voices_folder(state: State<AppState>) -> CmdResult<()> {
    let voices_dir = ensure_qwen3_voices_dir(&state.data_dir);
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&voices_dir).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&voices_dir).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&voices_dir).spawn();
    }
    Ok(())
}

#[tauri::command]
pub async fn start_qwen3_tts_server(
    state: State<'_, AppState>,
    python_path: Option<String>,
    device: Option<String>,
    dtype: Option<String>,
    model_id: Option<String>,
    endpoint: Option<String>,
) -> CmdResult<Qwen3VoicesStatus> {
    let voices_dir = ensure_qwen3_voices_dir(&state.data_dir);
    let script_path = voices_dir.join("qwen3_tts_server.py");
    std::fs::write(&script_path, QWEN3_SERVER_SCRIPT)
        .map_err(|e| format!("No se pudo escribir qwen3_tts_server.py: {e}"))?;

    let base = endpoint
        .clone()
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
        .unwrap_or_else(|| QWEN3_DEFAULT_ENDPOINT.to_string());

    // If already running, trigger /reload so any newly added reference audios are preloaded in VRAM
    if let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        if let Ok(r) = client.get(format!("{base}/health")).send().await {
            if r.status().is_success() {
                let _ = client.post(format!("{base}/reload")).send().await;
                return list_qwen3_voices(state, Some(base)).await;
            }
        }
    }

    let port: u16 = base
        .rsplit(':')
        .next()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(18421);

    let py = python_path
        .map(|s| s.trim().trim_matches('"').to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            #[cfg(target_os = "windows")]
            let local_venv = voices_dir.join(".venv").join("Scripts").join("python.exe");
            #[cfg(not(target_os = "windows"))]
            let local_venv = voices_dir.join(".venv").join("bin").join("python");
            if local_venv.is_file() {
                local_venv.to_string_lossy().to_string()
            } else {
                "python".to_string()
            }
        });

    let dev = device.unwrap_or_else(|| "auto".to_string());
    let dt = dtype.unwrap_or_else(|| "fp16".to_string());
    let mdl = model_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Qwen/Qwen3-TTS-12Hz-0.6B-Base".to_string());

    let log_path = voices_dir.join("qwen3_server.log");
    let log_file = std::fs::File::create(&log_path).ok();
    let log_err = log_file.as_ref().and_then(|f| f.try_clone().ok());

    let mut cmd = std::process::Command::new(&py);
    cmd.arg(&script_path)
        .arg("--voices-dir")
        .arg(&voices_dir)
        .arg("--model")
        .arg(&mdl)
        .arg("--device")
        .arg(&dev)
        .arg("--dtype")
        .arg(&dt)
        .arg("--port")
        .arg(port.to_string())
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONUTF8", "1");

    if let Some(f) = log_file {
        cmd.stdout(std::process::Stdio::from(f));
    }
    if let Some(f) = log_err {
        cmd.stderr(std::process::Stdio::from(f));
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "No se pudo iniciar Python ('{py}'): {e}. Indica la ruta exacta al python.exe de tu entorno ROCm/CUDA."
        )
    })?;

    // Give the HTTP server 900ms to bind; if Python exited immediately (e.g. WindowsApps stub or missing module), surface log!
    tokio::time::sleep(std::time::Duration::from_millis(900)).await;
    if let Ok(Some(exit_status)) = child.try_wait() {
        let log_txt = std::fs::read_to_string(&log_path).unwrap_or_default();
        let snippet: String = log_txt.trim().chars().take(320).collect();
        return Err(format!(
            "El proceso Python terminó al iniciar (código {:?}): {}",
            exit_status.code(),
            if snippet.is_empty() {
                "Revisa la ruta a python.exe (entorno ROCm/CUDA con qwen-tts instalado)."
            } else {
                &snippet
            }
        ));
    }
    list_qwen3_voices(state, Some(base)).await
}

#[tauri::command]
pub async fn stop_qwen3_tts_server(endpoint: Option<String>) -> CmdResult<()> {
    let base = endpoint
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
        .unwrap_or_else(|| QWEN3_DEFAULT_ENDPOINT.to_string());
    if let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        let _ = client.post(format!("{base}/shutdown")).send().await;
    }
    Ok(())
}

/// Deletes all cached `.wav` files in `VocesMDTQwen/<Profile>/.cache/` and asks the live server (if running) to clear its RAM cache.
#[tauri::command]
pub async fn clear_qwen3_cache(state: State<'_, AppState>, endpoint: Option<String>) -> CmdResult<u32> {
    let voices_dir = ensure_qwen3_voices_dir(&state.data_dir);
    let mut removed: u32 = 0;

    if let Ok(entries) = std::fs::read_dir(&voices_dir) {
        for entry in entries.flatten() {
            let cache_dir = entry.path().join(".cache");
            if cache_dir.is_dir() {
                if let Ok(files) = std::fs::read_dir(&cache_dir) {
                    for f in files.flatten() {
                        if f.path().is_file() && std::fs::remove_file(f.path()).is_ok() {
                            removed += 1;
                        }
                    }
                }
                let _ = std::fs::remove_dir(&cache_dir);
            }
        }
    }

    let base = endpoint
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
        .unwrap_or_else(|| QWEN3_DEFAULT_ENDPOINT.to_string());
    if let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        let _ = client.post(format!("{base}/reload")).send().await;
    }

    Ok(removed)
}

#[tauri::command]
pub async fn synthesize_qwen3_tts(
    text: String,
    profile: String,
    endpoint: Option<String>,
    language: Option<String>,
) -> CmdResult<String> {
    let clean = text.trim().to_string();
    if clean.is_empty() {
        return Err("Texto vacío".into());
    }
    let base = endpoint
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
        .unwrap_or_else(|| QWEN3_DEFAULT_ENDPOINT.to_string());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| format!("Error cliente HTTP Qwen3-TTS: {e}"))?;

    let payload = serde_json::json!({
        "text": clean,
        "profile": profile,
        "language": language.unwrap_or_else(|| "Spanish".to_string()),
    });

    let resp = client
        .post(format!("{base}/synthesize"))
        .header("Content-Type", "application/json")
        .body(payload.to_string())
        .send()
        .await
        .map_err(|e| format!("Servidor Qwen3-TTS no responde en {base} ({e}). Inícialo en Ajustes."))?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let err = resp.text().await.unwrap_or_default();
        return Err(format!("Qwen3-TTS error HTTP {code}: {}", err.chars().take(240).collect::<String>()));
    }

    let wav_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Error leyendo WAV de Qwen3-TTS: {e}"))?;

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);
    Ok(format!("data:audio/wav;base64,{b64}"))
}

/// 1-Click Automatic Installer for MDT-QWEN (uv + Python 3.12 + PyTorch CUDA/ROCm + qwen-tts + soundfile)
/// AND local offline Whisper.cpp Spanish STT if not installed yet!
#[tauri::command]
pub async fn install_mdt_qwen(
    app: AppHandle,
    state: State<'_, AppState>,
    gpu_pref: Option<String>,
    endpoint: Option<String>,
) -> CmdResult<Qwen3VoicesStatus> {
    let voices_dir = ensure_qwen3_voices_dir(&state.data_dir);
    let data_dir = state.data_dir.clone();

    let emit_prog = |stage: &str, msg: &str, pct: u8| {
        let _ = app.emit(
            "mdt-qwen-install-progress",
            serde_json::json!({ "stage": stage, "message": msg, "percent": pct }),
        );
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Error cliente HTTP: {e}"))?;

    // 1. Detect GPU vendor on Windows (NVIDIA CUDA vs AMD ROCm vs CPU)
    emit_prog("gpu", "Detectando tarjeta gráfica (NVIDIA / AMD)...", 5);
    let pref = gpu_pref.unwrap_or_else(|| "auto".to_string()).to_lowercase();
    let gpu_mode: String = if pref == "cuda" || pref == "rocm" || pref == "cpu" {
        pref
    } else {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let out = std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ';'",
                ])
                .creation_flags(0x0800_0000)
                .output()
                .ok();
            let names = out
                .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase())
                .unwrap_or_default();
            if names.contains("nvidia") {
                "cuda".to_string()
            } else if names.contains("amd") || names.contains("radeon") {
                "rocm".to_string()
            } else {
                "cpu".to_string()
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            "cpu".to_string()
        }
    };

    // 2. Locate or download standalone `uv.exe` into VocesMDTQwen/bin/uv.exe (no shell restart needed!)
    let bin_dir = voices_dir.join("bin");
    let _ = std::fs::create_dir_all(&bin_dir);
    #[cfg(target_os = "windows")]
    let local_uv = bin_dir.join("uv.exe");
    #[cfg(not(target_os = "windows"))]
    let local_uv = bin_dir.join("uv");

    let mut uv_bin: Option<std::path::PathBuf> = None;
    if local_uv.is_file() {
        uv_bin = Some(local_uv.clone());
    } else if let Ok(path_var) = std::env::var("PATH") {
        #[cfg(target_os = "windows")]
        let uv_name = "uv.exe";
        #[cfg(not(target_os = "windows"))]
        let uv_name = "uv";
        for d in std::env::split_paths(&path_var) {
            let p = d.join(uv_name);
            if p.is_file() {
                uv_bin = Some(p);
                break;
            }
        }
    }
    #[cfg(target_os = "windows")]
    if uv_bin.is_none() {
        if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
            let winget_uv = std::path::PathBuf::from(local_app)
                .join("Microsoft")
                .join("WinGet")
                .join("Links")
                .join("uv.exe");
            if winget_uv.is_file() {
                uv_bin = Some(winget_uv);
            }
        }
    }

    let uv_path = if let Some(p) = uv_bin {
        p
    } else {
        emit_prog("uv", "Descargando gestor Python ultrarrápido (uv)...", 12);
        #[cfg(target_os = "windows")]
        let uv_url = "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip";
        #[cfg(not(target_os = "windows"))]
        let uv_url = "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-gnu.tar.gz";

        let resp = client
            .get(uv_url)
            .send()
            .await
            .map_err(|e| format!("Error descargando uv: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("Error HTTP {} descargando uv", resp.status().as_u16()));
        }
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
        let target_bin = bin_dir.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
                .map_err(|e| format!("ZIP uv inválido: {e}"))?;
            for i in 0..archive.len() {
                let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
                if let Some(name) = f.enclosed_name().and_then(|p| p.file_name().map(|s| s.to_owned())) {
                    let out = target_bin.join(name);
                    if !f.is_dir() {
                        let mut of = std::fs::File::create(&out).map_err(|e| e.to_string())?;
                        std::io::copy(&mut f, &mut of).map_err(|e| e.to_string())?;
                    }
                }
            }
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
        local_uv
    };

    // 3. Create VocesMDTQwen/.venv (Python 3.12)
    let venv_dir = voices_dir.join(".venv");
    #[cfg(target_os = "windows")]
    let venv_py = venv_dir.join("Scripts").join("python.exe");
    #[cfg(not(target_os = "windows"))]
    let venv_py = venv_dir.join("bin").join("python");

    if !venv_py.is_file() {
        emit_prog("venv", "Creando entorno Python 3.12 en VocesMDTQwen/.venv...", 25);
        let uv_c = uv_path.clone();
        let vd = venv_dir.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut cmd = std::process::Command::new(&uv_c);
            cmd.args(["venv", &vd.to_string_lossy(), "--python", "3.12"]);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000);
            }
            let out = cmd.output().map_err(|e| format!("Error creando .venv: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "uv venv falló: {}",
                    String::from_utf8_lossy(&out.stderr).chars().take(240).collect::<String>()
                ));
            }
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
    }

    // 4. Install PyTorch (NVIDIA CUDA 12.4 / AMD ROCm 7.2.1 / CPU)
    let gpu_label = match gpu_mode.as_str() {
        "cuda" => "NVIDIA CUDA 12.4",
        "rocm" => "AMD ROCm 7.2.1",
        _ => "CPU",
    };
    emit_prog(
        "torch",
        &format!("Instalando PyTorch ({gpu_label}) para MDT-QWEN (~1.8 GB)..."),
        45,
    );
    {
        let uv_c = uv_path.clone();
        let py_c = venv_py.clone();
        let mode_c = gpu_mode.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut cmd = std::process::Command::new(&uv_c);
            cmd.args(["pip", "install", "--python", &py_c.to_string_lossy()]);
            if mode_c == "cuda" {
                cmd.args([
                    "torch",
                    "torchaudio",
                    "--index-url",
                    "https://download.pytorch.org/whl/cu124",
                ]);
            } else if mode_c == "rocm" {
                let base = "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1";
                cmd.args([
                    "--no-cache-dir",
                    &format!("{base}/rocm_sdk_core-7.2.1-py3-none-win_amd64.whl"),
                    &format!("{base}/rocm_sdk_libraries_custom-7.2.1-py3-none-win_amd64.whl"),
                    &format!("{base}/rocm-7.2.1.tar.gz"),
                    &format!("{base}/torch-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl"),
                    &format!("{base}/torchaudio-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl"),
                ]);
            } else {
                cmd.args(["torch", "torchaudio"]);
            }
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000);
            }
            let out = cmd.output().map_err(|e| format!("Error instalando PyTorch: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "Error instalando PyTorch ({mode_c}): {}",
                    String::from_utf8_lossy(&out.stderr).chars().take(260).collect::<String>()
                ));
            }
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
    }

    // 5. Install qwen-tts + soundfile
    emit_prog("qwen", "Instalando paquete qwen-tts y soundfile...", 78);
    {
        let uv_c = uv_path.clone();
        let py_c = venv_py.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut cmd = std::process::Command::new(&uv_c);
            cmd.args(["pip", "install", "--python", &py_c.to_string_lossy(), "qwen-tts", "soundfile"]);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000);
            }
            let out = cmd.output().map_err(|e| format!("Error instalando qwen-tts: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "Error instalando qwen-tts: {}",
                    String::from_utf8_lossy(&out.stderr).chars().take(260).collect::<String>()
                ));
            }
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
    }

    // 6. Install local offline Whisper.cpp Spanish STT if missing
    if find_whisper_stt(&data_dir).is_none() {
        emit_prog("whisper", "Instalando Whisper STT español offline (68 MB)...", 88);
        let stt_dir = data_dir.join("SttWhisper");
        let _ = std::fs::create_dir_all(&stt_dir);

        if let Ok(resp) = client
            .get("https://github.com/ggml-org/whisper.cpp/releases/download/b5907/whisper-bin-x64.zip")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(zip_bytes) = resp.bytes().await {
                    let sd = stt_dir.clone();
                    let _ = tokio::task::spawn_blocking(move || {
                        if let Ok(mut archive) = zip::ZipArchive::new(std::io::Cursor::new(zip_bytes.to_vec())) {
                            for i in 0..archive.len() {
                                if let Ok(mut f) = archive.by_index(i) {
                                    if !f.is_dir() {
                                        if let Some(fname) = f.enclosed_name().and_then(|p| p.file_name().map(|s| s.to_owned())) {
                                            if let Ok(mut of) = std::fs::File::create(sd.join(fname)) {
                                                let _ = std::io::copy(&mut f, &mut of);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    })
                    .await;
                }
            }
        }
        let model_dest = stt_dir.join("ggml-base-q5_1.bin");
        if !model_dest.is_file() {
            if let Ok(resp) = client
                .get("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin")
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(bytes) = resp.bytes().await {
                        let _ = std::fs::write(&model_dest, &bytes);
                    }
                }
            }
        }
    }

    emit_prog("done", "✓ MDT-QWEN + Whisper STT instalados y listos", 100);
    list_qwen3_voices(state, endpoint).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Qwen3VoiceBundle {
    pub profile_name: String,
    pub audio_file: String,
    pub audio_base64: String,
    pub ref_text: String,
}

/// Reads a profile's `ref.wav` (or `.mp3`/`.flac`) + optional `ref.txt` as base64 so it can be exported inside a portable `.mdtvoice.json` pack.
#[tauri::command]
pub fn read_qwen3_voice_bundle(state: State<AppState>, profile_name: String) -> CmdResult<Qwen3VoiceBundle> {
    let clean_name: String = profile_name
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == ' ')
        .collect();
    if clean_name.is_empty() {
        return Err("Nombre de perfil no válido".into());
    }
    let voices_dir = ensure_qwen3_voices_dir(&state.data_dir);
    let prof_dir = voices_dir.join(&clean_name);
    if !prof_dir.is_dir() {
        return Err(format!("No existe la carpeta de voz VocesMDTQwen/{clean_name}"));
    }

    let mut audio_path: Option<std::path::PathBuf> = None;
    for cand in ["ref.wav", "ref.flac", "ref.mp3", "ref.ogg"] {
        let p = prof_dir.join(cand);
        if p.is_file() {
            audio_path = Some(p);
            break;
        }
    }
    if audio_path.is_none() {
        if let Ok(entries) = std::fs::read_dir(&prof_dir) {
            for e in entries.flatten() {
                let p = e.path();
                if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                        if ["wav", "mp3", "flac", "ogg", "m4a"].iter().any(|x| x.eq_ignore_ascii_case(ext)) {
                            audio_path = Some(p);
                            break;
                        }
                    }
                }
            }
        }
    }
    let audio_p = audio_path.ok_or_else(|| format!("La carpeta VocesMDTQwen/{clean_name} no contiene ningún audio de referencia."))?;
    let bytes = std::fs::read(&audio_p).map_err(|e| format!("Error leyendo audio de referencia: {e}"))?;
    use base64::Engine;
    let audio_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let audio_file = audio_p.file_name().and_then(|s| s.to_str()).unwrap_or("ref.wav").to_string();
    let ref_text = std::fs::read_to_string(prof_dir.join("ref.txt")).unwrap_or_default().trim().to_string();

    Ok(Qwen3VoiceBundle {
        profile_name: clean_name,
        audio_file,
        audio_base64,
        ref_text,
    })
}

/// Writes an imported voice bundle (`ref.wav` + optional `ref.txt`) into `VocesMDTQwen/<profile_name>/`.
#[tauri::command]
pub fn write_qwen3_voice_bundle(
    state: State<AppState>,
    profile_name: String,
    audio_file: String,
    audio_base64: String,
    ref_text: Option<String>,
) -> CmdResult<String> {
    let clean_name: String = profile_name
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == ' ')
        .collect();
    if clean_name.is_empty() {
        return Err("Nombre de perfil no válido".into());
    }
    let clean_file: String = audio_file
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == '.')
        .collect();
    let final_file = if clean_file.is_empty() { "ref.wav".to_string() } else { clean_file };

    let voices_dir = ensure_qwen3_voices_dir(&state.data_dir);
    let prof_dir = voices_dir.join(&clean_name);
    std::fs::create_dir_all(&prof_dir).map_err(|e| format!("Error creando carpeta de perfil: {e}"))?;

    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_base64.trim())
        .map_err(|e| format!("Error decodificando audio del paquete: {e}"))?;
    std::fs::write(prof_dir.join(&final_file), &bytes)
        .map_err(|e| format!("Error guardando audio importado: {e}"))?;

    if let Some(txt) = ref_text.filter(|s| !s.trim().is_empty()) {
        let _ = std::fs::write(prof_dir.join("ref.txt"), txt.trim());
    }
    Ok(clean_name)
}

#[tauri::command]
pub fn update_native_fx(
    state: State<'_, AppState>,
    params: crate::fx_engine::NativeFxParams,
) {
    state.fx.update_params(params);
}

#[tauri::command]
pub fn get_native_fx_status(
    state: State<'_, AppState>,
) -> crate::fx_engine::NativeFxStatus {
    state.fx.get_status()
}

#[tauri::command]
pub fn load_native_fx_lut(
    state: State<'_, AppState>,
    name: String,
    content: String,
) -> CmdResult<u32> {
    state.fx.load_cube_lut_text(name, &content)
}

#[tauri::command]
pub fn clear_native_fx_lut(state: State<'_, AppState>) {
    state.fx.clear_cube_lut();
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FxCubeLutEntry {
    pub name: String,
    pub path: String,
}

fn find_fx_presets_dirs(data_dir: &Path) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut push_unique = |p: PathBuf| {
        if let Ok(canon) = std::fs::canonicalize(&p) {
            if !dirs.contains(&canon) {
                dirs.push(canon);
            }
        } else if p.is_dir() && !dirs.contains(&p) {
            dirs.push(p);
        }
    };

    // 1. User app data folder (create if absent so user always has a writable folder)
    let app_presets = data_dir.join("MDT-FX-Presets");
    let _ = std::fs::create_dir_all(&app_presets);
    push_unique(app_presets);

    // 2. Next to current working directory & up to 2 parent folders (dev/portable builds)
    if let Ok(mut cur) = std::env::current_dir() {
        for _ in 0..3 {
            let cand = cur.join("MDT-FX-Presets");
            if cand.is_dir() {
                push_unique(cand);
            }
            if !cur.pop() {
                break;
            }
        }
    }

    // 3. Next to executable & parent
    if let Ok(exe) = std::env::current_exe() {
        if let Some(mut cur) = exe.parent().map(|p| p.to_path_buf()) {
            for _ in 0..3 {
                let cand = cur.join("MDT-FX-Presets");
                if cand.is_dir() {
                    push_unique(cand);
                }
                if !cur.pop() {
                    break;
                }
            }
        }
    }

    dirs
}

#[tauri::command]
pub fn list_fx_cube_luts(state: State<'_, AppState>) -> Vec<FxCubeLutEntry> {
    let mut out: Vec<FxCubeLutEntry> = Vec::new();
    let mut seen_names = std::collections::HashSet::<String>::new();

    for dir in find_fx_presets_dirs(&state.data_dir) {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for entry in rd.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                        if ext.eq_ignore_ascii_case("cube") {
                            let file_name = p
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("LUT.cube")
                                .to_string();
                            let key = file_name.to_lowercase();
                            if seen_names.insert(key) {
                                out.push(FxCubeLutEntry {
                                    name: file_name,
                                    path: p.to_string_lossy().into_owned(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

#[tauri::command]
pub fn load_fx_cube_lut_file(
    state: State<'_, AppState>,
    path: String,
) -> CmdResult<(String, u32)> {
    let p = PathBuf::from(&path);
    let content = std::fs::read_to_string(&p)
        .map_err(|e| format!("No se pudo leer el archivo .cube: {e}"))?;
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Custom.cube")
        .to_string();
    let size = state.fx.load_cube_lut_text(name.clone(), &content)?;
    Ok((name, size))
}

#[tauri::command]
pub fn open_fx_presets_folder(state: State<'_, AppState>) -> CmdResult<String> {
    let dirs = find_fx_presets_dirs(&state.data_dir);
    // Prefer workspace/portable MDT-FX-Presets if it has files, else app data folder
    let target = dirs
        .iter()
        .find(|d| {
            std::fs::read_dir(d)
                .map(|mut rd| rd.next().is_some())
                .unwrap_or(false)
        })
        .cloned()
        .unwrap_or_else(|| state.data_dir.join("MDT-FX-Presets"));
    let _ = std::fs::create_dir_all(&target);
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&target).spawn();
    }
    Ok(target.to_string_lossy().into_owned())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCubeLut {
    pub name: String,
    pub path: String,
    pub size: u32,
}

#[tauri::command]
pub fn save_fx_cube_lut_file(
    state: State<'_, AppState>,
    name: String,
    content: String,
) -> CmdResult<SavedCubeLut> {
    let clean_stem: String = name
        .trim()
        .trim_end_matches(".cube")
        .trim_end_matches(".CUBE")
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string();
    let file_name = if clean_stem.is_empty() {
        "MDT-Custom-LUT.cube".to_string()
    } else {
        format!("{clean_stem}.cube")
    };

    let dirs = find_fx_presets_dirs(&state.data_dir);
    let target_dir = dirs
        .iter()
        .find(|d| {
            std::fs::read_dir(d)
                .map(|mut rd| rd.next().is_some())
                .unwrap_or(false)
        })
        .cloned()
        .unwrap_or_else(|| state.data_dir.join("MDT-FX-Presets"));
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("No se pudo crear la carpeta MDT-FX-Presets: {e}"))?;

    let full_path = target_dir.join(&file_name);
    // Validate & upload to GPU first so we never write a broken .cube
    let size = state.fx.load_cube_lut_text(file_name.clone(), &content)?;
    std::fs::write(&full_path, content.as_bytes())
        .map_err(|e| format!("No se pudo guardar el archivo .cube: {e}"))?;

    Ok(SavedCubeLut {
        name: file_name,
        path: full_path.to_string_lossy().into_owned(),
        size,
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FxPresetFileEntry {
    pub name: String,
    pub category: String,
    pub path: String,
}

fn scan_fx_presets_recursive(
    root: &Path,
    cur: &Path,
    out: &mut Vec<FxPresetFileEntry>,
    seen: &mut std::collections::HashSet<String>,
) {
    if let Ok(rd) = std::fs::read_dir(cur) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                scan_fx_presets_recursive(root, &p, out, seen);
            } else if p.is_file() {
                let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if fname.to_lowercase().ends_with(".mdtfx.json") {
                    let display = fname
                        .strip_suffix(".mdtfx.json")
                        .or_else(|| fname.strip_suffix(".MDTFX.JSON"))
                        .unwrap_or(fname)
                        .to_string();
                    let rel_cat = cur
                        .strip_prefix(root)
                        .ok()
                        .and_then(|r| r.to_str())
                        .unwrap_or("")
                        .replace('\\', "/");
                    let category = if rel_cat.is_empty() {
                        "General".to_string()
                    } else {
                        rel_cat
                    };
                    let key = format!("{}/{}", category.to_lowercase(), display.to_lowercase());
                    if seen.insert(key) {
                        out.push(FxPresetFileEntry {
                            name: display,
                            category,
                            path: p.to_string_lossy().into_owned(),
                        });
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub fn list_fx_preset_files(state: State<'_, AppState>) -> Vec<FxPresetFileEntry> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for dir in find_fx_presets_dirs(&state.data_dir) {
        scan_fx_presets_recursive(&dir, &dir, &mut out, &mut seen);
    }
    out.sort_by(|a, b| {
        a.category
            .to_lowercase()
            .cmp(&b.category.to_lowercase())
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    out
}

#[tauri::command]
pub fn read_fx_preset_file(path: String) -> CmdResult<String> {
    std::fs::read_to_string(&path).map_err(|e| format!("No se pudo leer el preset: {e}"))
}

#[tauri::command]
pub fn update_audio3d(
    state: State<'_, AppState>,
    params: crate::audio3d_engine::Audio3DParams,
) {
    state.audio3d.update_params(params);
}

#[tauri::command]
pub fn get_audio3d_status(
    state: State<'_, AppState>,
) -> crate::audio3d_engine::Audio3DStatus {
    state.audio3d.get_status()
}
