//! Native scheduling and the small desktop capture window share the existing notes database.
use super::{CommandError, knowledge_ai::err};
use crate::db::{AppDb, repo::note_reminder as repo};
use chrono::Local;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

pub const WINDOW: &str = "desktop-note";
#[derive(Default)]
pub struct ReminderRuntime {
    error: std::sync::Mutex<Option<String>>,
}

/// Tauri's macOS `show()` calls makeKeyAndOrderFront, even for a window built with
/// focused(false). Timed delivery must instead order the existing NSWindow without
/// making it key or activating the application. All callers run on the main thread.
#[cfg(target_os = "macos")]
fn show_quietly(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use std::ffi::{c_char, c_void};
    #[link(name = "objc")]
    unsafe extern "C" {
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }
    let native = window.ns_window()?;
    unsafe {
        let send: unsafe extern "C" fn(*mut c_void, *mut c_void) =
            std::mem::transmute(objc_msgSend as *const ());
        send(native, sel_registerName(c"orderFrontRegardless".as_ptr()));
    }
    Ok(())
}
#[cfg(target_os = "windows")]
fn windows_visibility(window: &tauri::WebviewWindow, command: i32) -> tauri::Result<()> {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn ShowWindow(window: *mut std::ffi::c_void, command: i32) -> i32;
    }
    // SW_SHOWNOACTIVATE (4) shows without stealing the foreground input window.
    // Its return value describes previous visibility, not success/failure.
    unsafe {
        ShowWindow(window.hwnd()?.0, command);
    }
    Ok(())
}
#[cfg(target_os = "windows")]
fn show_quietly(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    windows_visibility(window, 4)
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn show_quietly(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    window.show()
}
pub fn hide(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(WINDOW) {
        // Also hide the actual HWND when quiet showing bypassed Tao's visibility flag.
        #[cfg(target_os = "windows")]
        windows_visibility(&window, 0)?;
        window.hide()?;
    }
    Ok(())
}

#[tauri::command]
pub fn note_reminder_get(
    db: State<AppDb>,
    runtime: State<ReminderRuntime>,
) -> Result<Value, CommandError> {
    let c = db.conn.lock().map_err(err)?;
    let (config, state) = repo::load(&c).map_err(err)?;
    let error = state
        .last_error
        .or_else(|| runtime.error.lock().ok().and_then(|e| e.clone()));
    Ok(json!({"config":config,"lastError":error}))
}
#[tauri::command]
pub fn note_reminder_set(
    app: AppHandle,
    db: State<AppDb>,
    config: repo::Config,
) -> Result<(), CommandError> {
    let c = db.conn.lock().map_err(err)?;
    repo::configure(&c, &config).map_err(err)?;
    drop(c);
    if let Ok(mut error) = app.state::<ReminderRuntime>().error.lock() {
        *error = None;
    }
    if let Some(tray) = app.tray_by_id("resumer") {
        tray.set_visible(config.enabled).map_err(err)?;
    }
    let _ = app.emit("note-reminder-changed", ());
    Ok(())
}
pub fn enabled(app: &AppHandle) -> bool {
    app.state::<AppDb>()
        .conn
        .lock()
        .ok()
        .and_then(|c| repo::load(&c).ok())
        .is_some_and(|(config, _)| config.enabled)
}

pub fn create_window(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(WINDOW).is_none() {
        WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("desktop-note".into()))
            .title("随手记 · Resumer")
            .inner_size(300.0, 204.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .skip_taskbar(true)
            .visible(false)
            .focused(false)
            .accept_first_mouse(true)
            .build()?;
    }
    Ok(())
}
pub fn show(app: &AppHandle, focus: bool) -> tauri::Result<()> {
    create_window(app)?;
    if let Some(window) = app.get_webview_window(WINDOW) {
        if !window.is_visible()? {
            // Use the screen under the pointer, including its work area and scale factor.
            let monitor = app
                .cursor_position()
                .ok()
                .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
                .or(app.primary_monitor()?);
            if let Some(monitor) = monitor {
                let area = monitor.work_area();
                let scale = monitor.scale_factor();
                let width = (300.0_f64).min(f64::from(area.size.width) / scale - 24.0);
                let current_height = window.inner_size()?.height as f64 / window.scale_factor()?;
                let height = current_height
                    .clamp(188.0, 520.0)
                    .min(f64::from(area.size.height) / scale - 24.0);
                window.set_size(tauri::LogicalSize::new(width.max(240.0), height.max(188.0)))?;
                window.set_position(tauri::PhysicalPosition::new(
                    area.position.x + (f64::from(area.size.width) - (width + 12.0) * scale) as i32,
                    area.position.y
                        + (f64::from(area.size.height) - (height + 12.0) * scale) as i32,
                ))?;
            }
            if focus {
                window.show()?;
            } else {
                show_quietly(&window)?;
            }
        }
        // Timed delivery never calls set_focus; manual preview / tray entry may focus.
        if focus {
            window.set_focus()?;
        }
        let _ = window.emit("desktop-note-shown", ());
    }
    Ok(())
}
/// The compact capture surface grows only when its content needs more space.
#[tauri::command]
pub fn note_reminder_resize(app: AppHandle, height: f64) -> Result<(), CommandError> {
    if !height.is_finite() {
        return Err(err("无效的小窗尺寸"));
    }
    if let Some(window) = app.get_webview_window(WINDOW) {
        let scale = window.scale_factor().map_err(err)?;
        let before = window.outer_size().map_err(err)?;
        let position = window.outer_position().map_err(err)?;
        let monitor = window.current_monitor().map_err(err)?;
        let available = monitor
            .as_ref()
            .map(|m| f64::from(m.work_area().size.height) / scale - 24.0)
            .unwrap_or(520.0);
        let height = height.clamp(188.0, 520.0).min(available.max(188.0));
        window
            .set_size(tauri::LogicalSize::new(300.0, height))
            .map_err(err)?;
        if window.is_visible().unwrap_or(false) {
            let y = position.y + before.height as i32 - (height * scale) as i32;
            let top = monitor
                .as_ref()
                .map(|m| m.work_area().position.y + 12)
                .unwrap_or(y);
            window
                .set_position(tauri::PhysicalPosition::new(position.x, y.max(top)))
                .map_err(err)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn note_reminder_preview(app: AppHandle) -> Result<(), CommandError> {
    let handle = app.clone();
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(show(&handle, true).map_err(|e| e.to_string()));
    })
    .map_err(err)?;
    rx.await.map_err(err)?.map_err(err)
}
#[tauri::command]
pub fn note_reminder_dismiss(
    app: AppHandle,
    db: State<AppDb>,
    action: String,
) -> Result<(), CommandError> {
    if !matches!(action.as_str(), "close" | "skip" | "snooze" | "saved") {
        return Err(err("未知提醒操作"));
    }
    if action != "close" {
        let c = db.conn.lock().map_err(err)?;
        let (config, mut state) = repo::load(&c).map_err(err)?;
        state.last_day = Some(Local::now().format("%Y-%m-%d").to_string());
        state.snooze_until = if action == "snooze" && config.enabled {
            Some(Local::now().timestamp() + 900)
        } else {
            None
        };
        repo::save_receipt(&c, &state).map_err(err)?;
    }
    hide(&app).map_err(err)?;
    Ok(())
}
#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), CommandError> {
    if let Some(window) = app.get_webview_window("main") {
        window.unminimize().map_err(err)?;
        window.show().map_err(err)?;
        window.set_focus().map_err(err)?;
    }
    Ok(())
}
fn has_started_experience(c: &rusqlite::Connection, today: &str) -> Result<bool, String> {
    c.query_row(
        "SELECT EXISTS(SELECT 1 FROM work_experiences WHERE current=1 AND started_on<=?1)",
        [today],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}
fn tick(app: &AppHandle) -> Result<(), String> {
    // No extra interruption while the user is already working in Resumer.
    if app
        .get_webview_window("main")
        .is_some_and(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
    {
        return Ok(());
    }
    let db = app.state::<AppDb>();
    let claimed = {
        let c = db.conn.lock().map_err(|e| e.to_string())?;
        if !has_started_experience(&c, &Local::now().format("%Y-%m-%d").to_string())? {
            return Ok(());
        }
        repo::claim(&c, Local::now())?
    };
    if claimed && let Err(error) = show(app, false) {
        let c = db.conn.lock().map_err(|e| e.to_string())?;
        let (_, mut state) = repo::load(&c)?;
        state.last_error = Some(format!("桌面提醒没有打开：{error}。可点击“试一下”重试。"));
        repo::save_receipt(&c, &state)?;
        let _ = app.emit("note-reminder-changed", ());
        return Err(error.to_string());
    }
    if claimed && let Ok(mut error) = app.state::<ReminderRuntime>().error.lock() {
        *error = None;
    }
    Ok(())
}
pub fn install(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(ReminderRuntime::default());
    use tauri::{
        menu::{Menu, MenuItem},
        tray::TrayIconBuilder,
    };
    let open = MenuItem::with_id(app, "open", "打开 Resumer", true, None::<&str>)?;
    let note = MenuItem::with_id(app, "note", "随手记一段", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Resumer", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &note, &quit])?;
    let mut tray = TrayIconBuilder::with_id("resumer")
        .tooltip("Resumer · 随手记")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                let _ = show_main_window(app.clone());
            }
            "note" => {
                if let Err(e) = show(app, true) {
                    log::error!("open desktop note: {e}");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?.set_visible(enabled(app))?;
    // Create hidden once; hiding never destroys an unsent draft or an in-flight analysis.
    create_window(app)?;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            let handle = app.clone();
            if app
                .run_on_main_thread(move || {
                    if let Err(e) = tick(&handle) {
                        log::error!("note reminder: {e}");
                        // If writing the durable receipt itself fails, retain a visible
                        // runtime error instead of relying on that same broken write path.
                        if let Ok(mut error) = handle.state::<ReminderRuntime>().error.lock()
                            && error.as_deref() != Some(e.as_str())
                        {
                            *error = Some(e);
                            let _ = handle.emit("note-reminder-changed", ());
                        }
                    }
                })
                .is_err()
            {
                break;
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod capture_gate_tests {
    use super::*;
    #[test]
    fn reminders_only_run_for_started_current_experiences() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&c).unwrap();
        assert!(!has_started_experience(&c, "2026-11-02").unwrap());
        c.execute("INSERT INTO work_experiences(id,company,position,kind,started_on,current) VALUES('future','A','Intern','internship','2026-12-01',1),('ended','B','Designer','work','2025-01-01',0)", []).unwrap();
        assert!(!has_started_experience(&c, "2026-11-02").unwrap());
        c.execute(
            "UPDATE work_experiences SET started_on='2026-11-02' WHERE id='future'",
            [],
        )
        .unwrap();
        assert!(has_started_experience(&c, "2026-11-02").unwrap());
        c.execute(
            "UPDATE work_experiences SET current=0 WHERE id='future'",
            [],
        )
        .unwrap();
        assert!(!has_started_experience(&c, "2026-11-02").unwrap());
    }
}
