mod car_render;
mod commands;
mod damage;
pub mod db;
pub mod demo;
mod engine;
#[cfg(target_os = "linux")]
mod viewport;
pub mod lmu;
mod mobile_server;
pub mod model;
pub mod online;
pub mod recorder;
pub mod schedule;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AppShortcuts {
    #[serde(default = "default_edit_mode_sc")]
    pub edit_mode: String,
    #[serde(default = "default_toggle_overlay_sc")]
    pub toggle_overlay: String,
    #[serde(default = "default_toggle_spotter_sc")]
    pub toggle_spotter: String,
    #[serde(default = "default_next_profile_sc")]
    pub next_profile: String,
    #[serde(default = "default_toggle_broadcast_sc")]
    pub toggle_broadcast: String,
    #[serde(default = "default_reset_focus_sc")]
    pub reset_focus: String,
}

fn default_edit_mode_sc() -> String { "Ctrl+Shift+F9".into() }
fn default_toggle_overlay_sc() -> String { "Ctrl+Shift+F10".into() }
fn default_toggle_spotter_sc() -> String { "Ctrl+Shift+F8".into() }
fn default_next_profile_sc() -> String { "Ctrl+Shift+F7".into() }
fn default_toggle_broadcast_sc() -> String { "Ctrl+Shift+F6".into() }
fn default_reset_focus_sc() -> String { "Ctrl+Shift+F5".into() }

impl Default for AppShortcuts {
    fn default() -> Self {
        Self {
            edit_mode: default_edit_mode_sc(),
            toggle_overlay: default_toggle_overlay_sc(),
            toggle_spotter: default_toggle_spotter_sc(),
            next_profile: default_next_profile_sc(),
            toggle_broadcast: default_toggle_broadcast_sc(),
            reset_focus: default_reset_focus_sc(),
        }
    }
}

pub fn update_global_shortcuts(app: &tauri::AppHandle, shortcuts: &AppShortcuts) {
    let global_shortcut = app.global_shortcut();
    let _ = global_shortcut.unregister_all();
    let sc_list = [
        &shortcuts.edit_mode,
        &shortcuts.toggle_overlay,
        &shortcuts.toggle_spotter,
        &shortcuts.next_profile,
        &shortcuts.toggle_broadcast,
        &shortcuts.reset_focus,
    ];
    for s in sc_list {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(sc) = trimmed.parse::<Shortcut>() {
            if let Err(e) = global_shortcut.register(sc) {
                eprintln!("[MDT] No se pudo registrar el atajo global '{trimmed}': {e}");
            }
        }
    }
}

pub struct AppState {
    pub shared: Arc<engine::Shared>,
    pub db: Arc<db::Db>,
    pub config_path: PathBuf,
    pub data_dir: PathBuf,
    pub edit_mode: AtomicBool,
    pub overlay_visible: AtomicBool,
    /// Created on first use by the companion's widget previews.
    pub preview: Mutex<Option<engine::PreviewSim>>,
    /// Wakes the lap uploader after laps are queued.
    pub uploads: Arc<tokio::sync::Notify>,
    /// Monitor the overlay currently covers, as stored in `general.monitor` ("" = primary).
    pub overlay_monitor: Mutex<String>,
    /// Shared state for the mobile/tablet LAN server.
    pub mobile: Arc<Mutex<mobile_server::MobileRelayState>>,
    /// Dynamic global keyboard shortcuts
    pub configured_shortcuts: Mutex<AppShortcuts>,
}

/// Detect the non-composited GTK path before constructing the overlay. Keep
/// full-view invalidation off machines that can render composited buffers.
#[cfg(target_os = "linux")]
fn needs_full_repaint() -> bool {
    use gtk::prelude::*;
    if ["WEBKIT_DISABLE_DMABUF_RENDERER", "WEBKIT_DISABLE_COMPOSITING_MODE"].iter()
        .any(|key| std::env::var(key).is_ok_and(|value| value != "0")) {
        return true;
    }
    let probe = gtk::Window::new(gtk::WindowType::Popup);
    probe.realize();
    let can_composite = probe.window()
        .and_then(|window| window.create_gl_context().ok())
        .is_some_and(|context| context.realize().is_ok());
    probe.close();
    !can_composite
}

/// Transparent, click-through, always-on-top window covering the primary
/// monitor, following the game client on Linux. All widgets render inside it at their configured positions.
/// Linux fullscreen stacking is supplied by the experimental compositor integration.
fn create_overlay(app: &tauri::App, monitor: &str) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    let full_repaint = needs_full_repaint();
    #[cfg(not(target_os = "linux"))]
    let full_repaint = false;
    let window = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("index.html#overlay".into()))
        .title("MDT-HUD")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(false)
        .initialization_script(format!("window.__MULSANNE_FULL_REPAINT__ = {full_repaint};"))
        .skip_taskbar(true)
        // Must be resizable so Windows and GTK allow multi-monitor programmatic sizing
        .resizable(true)
        .focused(false)
        .visible(false)
        .build()?;
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;
        let gtk_window = window.gtk_window()?;
        // Tiling compositors need a dock hint before mapping the window; an
        // always-on-top hint alone does not keep a normal client out of tiling.
        gtk_window.set_type_hint(gtk::gdk::WindowTypeHint::Dock);
    }
    place_overlay(app.handle(), monitor)?;
    // GTK creates the underlying GdkWindow on show. Tao's input-shape call
    // requires that window to exist, so enabling click-through before show
    // panics on Linux.
    window.show()?;
    window.set_ignore_cursor_events(true)?;
    Ok(())
}

/// Computes the bounding rectangle enclosing all connected monitors.
pub(crate) fn get_all_monitors_bounds(app: &tauri::AppHandle) -> Option<(PhysicalPosition<i32>, PhysicalSize<u32>)> {
    let window = app.get_webview_window("overlay").or_else(|| app.get_webview_window("main"))?;
    let monitors = window.available_monitors().ok()?;
    if monitors.is_empty() {
        return None;
    }
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;

    for m in &monitors {
        let pos = m.position();
        let size = m.size();
        min_x = min_x.min(pos.x);
        min_y = min_y.min(pos.y);
        max_x = max_x.max(pos.x + size.width as i32);
        max_y = max_y.max(pos.y + size.height as i32);
    }

    if min_x < max_x && min_y < max_y {
        let w = (max_x - min_x) as u32;
        let h = (max_y - min_y) as u32;
        Some((PhysicalPosition::new(min_x, min_y), PhysicalSize::new(w, h)))
    } else {
        None
    }
}

/// Moves the overlay to cover the monitor named `monitor` (`general.monitor`),
/// falling back to the primary monitor when it's empty or not connected.
/// If `monitor == "__all__"`, spans across all available monitors.
pub(crate) fn place_overlay(app: &tauri::AppHandle, monitor: &str) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("overlay") else { return Ok(()) };
    if monitor == "__all__" {
        if let Some((pos, size)) = get_all_monitors_bounds(app) {
            window.set_position(pos)?;
            window.set_size(size)?;
            *app.state::<AppState>().overlay_monitor.lock().unwrap_or_else(|e| e.into_inner()) = monitor.to_string();
            let _ = app.emit("overlay-layout-changed", ());
            return Ok(());
        }
    }

    let chosen = match monitor {
        "" => None,
        name => window.available_monitors()?.into_iter().find(|m| m.name().is_some_and(|n| n == name)),
    };
    let Some(target) = chosen.or(window.primary_monitor()?) else { return Ok(()) };
    let (pos, size) = (target.position(), target.size());
    window.set_position(PhysicalPosition::new(pos.x, pos.y))?;
    // Sized after the move: crossing to a monitor with a different DPI rescales the window.
    window.set_size(PhysicalSize::new(size.width, size.height))?;
    *app.state::<AppState>().overlay_monitor.lock().unwrap_or_else(|e| e.into_inner()) = monitor.to_string();
    let _ = app.emit("overlay-layout-changed", ());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Overlay placement, stacking, click-through, and global shortcuts use X11.
    // Wayland sessions can run the app through XWayland; select it before GTK
    // initializes rather than silently creating an unsupported native surface.
    #[cfg(target_os = "linux")]
    if std::env::var_os("GDK_BACKEND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }

    // Keep the compositing renderer, but transport buffers through shared
    // memory to avoid NVIDIA/XWayland DMA-BUF allocation failures. Disabling
    // the renderer itself breaks transparent damage painting on WebKit 2.54.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DMABUF_RENDERER_FORCE_SHM").is_none() {
        std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
    }

    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(car_render::SCHEME, car_render::handle)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let state = app.state::<AppState>();
                    let sc_map = match state.configured_shortcuts.lock() {
                        Ok(guard) => (*guard).clone(),
                        Err(_) => return,
                    };
                    if let Ok(edit_sc) = sc_map.edit_mode.parse::<Shortcut>() {
                        if shortcut == &edit_sc {
                            let enabled = !state.edit_mode.load(Ordering::Acquire);
                            commands::apply_edit_mode(app, enabled);
                            return;
                        }
                    }
                    if let Ok(vis_sc) = sc_map.toggle_overlay.parse::<Shortcut>() {
                        if shortcut == &vis_sc {
                            let visible = !state.overlay_visible.load(Ordering::Acquire);
                            commands::apply_overlay_visible(app, visible);
                            return;
                        }
                    }
                    if let Ok(sp_sc) = sc_map.toggle_spotter.parse::<Shortcut>() {
                        if shortcut == &sp_sc {
                            let _ = app.emit("shortcut-toggle-spotter", ());
                            return;
                        }
                    }
                    if let Ok(prof_sc) = sc_map.next_profile.parse::<Shortcut>() {
                        if shortcut == &prof_sc {
                            let _ = app.emit("shortcut-next-profile", ());
                            return;
                        }
                    }
                    if let Ok(bc_sc) = sc_map.toggle_broadcast.parse::<Shortcut>() {
                        if shortcut == &bc_sc {
                            let _ = app.emit("shortcut-toggle-broadcast", ());
                            return;
                        }
                    }
                    if let Ok(foc_sc) = sc_map.reset_focus.parse::<Shortcut>() {
                        if shortcut == &foc_sc {
                            let _ = app.emit("shortcut-reset-focus", ());
                            return;
                        }
                    }
                })
                .build(),
        )
        .setup(move |app| {
            // Dev builds keep their own laps, identity key and config so they never touch the installed app's.
            let (mut data_dir, mut config_dir) = (
                app.path().app_data_dir()?.with_file_name("MDT-HUD"),
                app.path().app_config_dir()?.with_file_name("MDT-HUD"),
            );
            // Carry data over from before the folder was renamed
            for legacy_name in ["xyz.mulsanne", "mulsanne", "com.lm-overlay.app"] {
                let legacy_data = data_dir.with_file_name(legacy_name);
                if !data_dir.exists() && legacy_data.is_dir() {
                    let _ = std::fs::rename(&legacy_data, &data_dir);
                }
                let legacy_config = config_dir.with_file_name(legacy_name);
                if !config_dir.exists() && legacy_config.is_dir() {
                    let _ = std::fs::rename(&legacy_config, &config_dir);
                }
            }
            if cfg!(debug_assertions) {
                data_dir.push("dev");
                config_dir.push("dev");
            }
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(&config_dir)?;
            commands::ensure_spotter_profiles(&data_dir);

            let db = Arc::new(db::Db::open(&data_dir.join("laps.db")).map_err(|e| format!("database: {e}"))?);
            let shared = Arc::new(engine::Shared::new());
            *shared.game_dir.write().unwrap_or_else(|e| e.into_inner()) = car_render::load_game_dir(&data_dir);
            let config_path = config_dir.join("config.json");
            let uploads = Arc::new(tokio::sync::Notify::new());

            let stored = std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
            let general = |key: &str| stored.as_ref().and_then(|c| c.pointer(&format!("/general/{key}")).cloned());
            if let Some(hz) = general("updateHz").and_then(|v| v.as_u64()) {
                shared.emit_hz.store(hz as u32, Ordering::Relaxed);
            }
            let monitor = general("monitor").and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_default();

            let mobile = Arc::new(Mutex::new(mobile_server::MobileRelayState::default()));
            if let Some(ref cfg) = stored {
                if let Ok(mut st) = mobile.lock() {
                    st.app_config = Some(cfg.clone());
                    if let Some(t) = cfg.pointer("/general/theme").and_then(|v| v.as_str()) {
                        if t != "custom" {
                            st.mobile_theme = Some(t.to_string());
                        }
                    }
                }
            }

            let initial_shortcuts: AppShortcuts = stored
                .as_ref()
                .and_then(|c| c.pointer("/general/shortcuts"))
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            app.manage(AppState {
                shared: shared.clone(),
                db: db.clone(),
                config_path,
                data_dir,
                edit_mode: AtomicBool::new(false),
                overlay_visible: AtomicBool::new(true),
                preview: Mutex::new(None),
                uploads: uploads.clone(),
                overlay_monitor: Mutex::new(String::new()),
                mobile: mobile.clone(),
                configured_shortcuts: Mutex::new(initial_shortcuts.clone()),
            });

            create_overlay(app, &monitor)?;

            update_global_shortcuts(app.handle(), &initial_shortcuts);

            engine::spawn(app.handle().clone(), shared, db);
            online::spawn_uploader(app.handle().clone(), uploads);
            mobile_server::spawn(app.handle().clone(), mobile);

            // #20 Native System Tray icon with quick actions (Open, Toggle Overlay, Edit Overlay, Quit)
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                if let (Ok(show_i), Ok(toggle_i), Ok(edit_i), Ok(quit_i)) = (
                    MenuItem::with_id(app, "tray_show", "Abrir MDT-HUD", true, None::<&str>),
                    MenuItem::with_id(app, "tray_toggle_overlay", "Mostrar / Ocultar Overlay", true, None::<&str>),
                    MenuItem::with_id(app, "tray_edit_overlay", "Editar Overlay", true, None::<&str>),
                    MenuItem::with_id(app, "tray_quit", "Salir", true, None::<&str>),
                ) {
                    if let Ok(menu) = Menu::with_items(app, &[&show_i, &toggle_i, &edit_i, &quit_i]) {
                        let mut builder = TrayIconBuilder::new()
                            .menu(&menu)
                            .tooltip("MDT-HUD · Telemetría LMU")
                            .on_menu_event(|app, event| match event.id.as_ref() {
                                "tray_show" => {
                                    if let Some(w) = app.get_webview_window("main") {
                                        let _ = w.show();
                                        let _ = w.unminimize();
                                        let _ = w.set_focus();
                                    }
                                }
                                "tray_toggle_overlay" => {
                                    let st = app.state::<AppState>();
                                    let next = !st.overlay_visible.load(Ordering::Acquire);
                                    let _ = commands::set_overlay_visible(app.clone(), next);
                                }
                                "tray_edit_overlay" => {
                                    let st = app.state::<AppState>();
                                    let next = !st.edit_mode.load(Ordering::Acquire);
                                    let _ = commands::set_edit_mode(app.clone(), next);
                                }
                                "tray_quit" => {
                                    app.exit(0);
                                }
                                _ => {}
                            })
                            .on_tray_icon_event(|tray, event| {
                                if let TrayIconEvent::Click {
                                    button: MouseButton::Left,
                                    button_state: MouseButtonState::Up,
                                    ..
                                } = event
                                {
                                    if let Some(w) = tray.app_handle().get_webview_window("main") {
                                        let _ = w.show();
                                        let _ = w.unminimize();
                                        let _ = w.set_focus();
                                    }
                                }
                            });
                        if let Some(icon) = app.default_window_icon().cloned() {
                            builder = builder.icon(icon);
                        }
                        let _ = builder.build(app);
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the companion app minimizes to tray if enabled, otherwise exits cleanly.
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let st = window.app_handle().state::<AppState>();
                    let minimize_to_tray = std::fs::read_to_string(&st.config_path)
                        .ok()
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                        .and_then(|v| v.pointer("/general/minimizeToTray").and_then(|b| b.as_bool()))
                        .unwrap_or(false);
                    if minimize_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::get_status,
            commands::latest_release,
            commands::get_config,
            commands::save_config,
            commands::get_mobile_network_info,
            commands::open_mobile_firewall,
            commands::set_edit_mode,
            commands::set_overlay_visible,
            commands::set_demo_mode,
            commands::list_monitors,
            commands::get_preview_snapshot,
            commands::list_sessions,
            commands::list_laps,
            commands::list_track_laps,
            commands::get_lap_trace,
            commands::personal_bests,
            commands::get_filters,
            commands::get_track_map,
            commands::delete_lap,
            commands::delete_session,
            commands::daily_races,
            commands::online_register,
            commands::online_me,
            commands::online_set_display_name,
            commands::online_delete_data,
            commands::upload_laps,
            commands::lap_upload_states,
            commands::remove_lap_upload,
            commands::leaderboard,
            commands::leaderboard_boards,
            commands::ranked_lap_trace,
            commands::focus_vehicle,
            commands::set_focused_slot,
            commands::set_broadcast_mode,
            commands::get_spotter_manifest,
            commands::open_spotter_folder,
            commands::get_overlay_layout,
            commands::get_auto_start,
            commands::set_auto_start,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
