use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[tauri::command]
pub fn register_hotkey(
    app: tauri::AppHandle,
    shortcut: String,
) -> Result<(), String> {
    // Unregister previous shortcuts
    let _ = app.global_shortcut().unregister_all();

    let app_clone = app.clone();
    app.global_shortcut()
        .on_shortcut(
            shortcut.as_str(),
            move |_app, _shortcut, _event| {
                if let Some(win) = app_clone.get_webview_window("main") {
                    let visible = win.is_visible().unwrap_or(false);
                    if visible {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            },
        )
        .map_err(|e| format!("Failed to register hotkey: {e}"))
}

#[tauri::command]
pub fn unregister_hotkey(app: tauri::AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister hotkeys: {e}"))
}
