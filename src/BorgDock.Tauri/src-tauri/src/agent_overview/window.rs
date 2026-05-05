use crate::settings::load_settings_internal;
use tauri::{
    Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

const DEFAULT_W: f64 = 1280.0;
const DEFAULT_H: f64 = 820.0;

/// Show the existing agent-overview window if any, otherwise create it.
/// **Must be called on the main thread** (window-creation APIs deadlock
/// against the worker-thread oneshot pattern that bare `#[tauri::command]`
/// async functions use — see `CLAUDE.md`'s "Tauri sync commands and
/// main-thread operations" section).
pub(crate) fn show_or_create_agent_overview(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("agent-overview") {
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let settings = load_settings_internal().ok();
    let win_state = settings
        .as_ref()
        .and_then(|s| s.agent_overview.window_state.clone());

    let mut builder = WebviewWindowBuilder::new(
        app,
        "agent-overview",
        WebviewUrl::App("agent-overview.html".into()),
    )
    .title("BorgDock — Agent Overview")
    .inner_size(DEFAULT_W, DEFAULT_H)
    .min_inner_size(720.0, 480.0)
    .decorations(false)
    .resizable(true)
    .skip_taskbar(false)
    .shadow(true)
    .visible(false);

    if let Some(g) = &win_state {
        builder = builder
            .inner_size(g.width as f64, g.height as f64)
            .position(g.x as f64, g.y as f64);
    }

    let win = builder.build().map_err(|e| e.to_string())?;

    // Snap to stored geometry BEFORE first show to avoid a flash at the
    // default size/position. The window stays hidden until the React app
    // calls `window_ready`, so the user never sees the unstyled chrome.
    if let Some(g) = &win_state {
        win.set_size(tauri::Size::Physical(PhysicalSize::new(g.width, g.height)))
            .ok();
        win.set_position(tauri::Position::Physical(PhysicalPosition::new(g.x, g.y)))
            .ok();
    }

    // Persist window geometry on close so the next launch restores it.
    let win_for_close = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            let pos = win_for_close.outer_position().ok();
            let size = win_for_close.outer_size().ok();
            if let (Some(p), Some(s)) = (pos, size) {
                let geom = crate::settings::models::WindowGeometry {
                    x: p.x,
                    y: p.y,
                    width: s.width,
                    height: s.height,
                };
                if let Ok(mut settings) = crate::settings::load_settings_internal() {
                    settings.agent_overview.window_state = Some(geom);
                    let _ = crate::settings::save_settings_internal(&settings);
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn open_agent_overview_window(app: tauri::AppHandle) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = show_or_create_agent_overview(&app_for_run);
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
