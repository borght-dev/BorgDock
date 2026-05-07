use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

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

    let builder = WebviewWindowBuilder::new(
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
    .center()
    .visible(false);

    let win = builder.build().map_err(|e| e.to_string())?;

    crate::platform::window_geometry::persist_window_geometry(app, &win, "agent-overview");

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
