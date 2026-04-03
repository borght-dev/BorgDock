use tauri::webview::WebviewWindowBuilder;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[tauri::command]
pub fn register_hotkey(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    // Unregister previous shortcuts
    let _ = app.global_shortcut().unregister_all();

    // Register sidebar toggle shortcut
    let app_toggle = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut.as_str(), move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            if let Some(win) = app_toggle.get_webview_window("main") {
                let visible = win.is_visible().unwrap_or(false);
                if visible {
                    let _ = win.hide();
                    // Show badge when sidebar is hidden via hotkey
                    if let Some(badge) = app_toggle.get_webview_window("badge") {
                        let _ = badge.show();
                        let _ = badge.set_always_on_top(true);
                    }
                } else {
                    let _ = win.show();
                    let _ = win.set_focus();
                    // Hide badge when sidebar is shown
                    if let Some(badge) = app_toggle.get_webview_window("badge") {
                        let _ = badge.hide();
                    }
                }
            }
        })
        .map_err(|e| format!("Failed to register hotkey: {e}"))?;

    // Register command palette shortcut (Ctrl+F9)
    let app_palette = app.clone();
    app.global_shortcut()
        .on_shortcut("Ctrl+F9", move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            // If palette already exists, focus it
            if let Some(win) = app_palette.get_webview_window("palette") {
                let _ = win.set_focus();
                return;
            }

            // Create a new palette window
            if let Ok(win) = WebviewWindowBuilder::new(
                &app_palette,
                "palette",
                tauri::WebviewUrl::App("palette.html".into()),
            )
            .title("PRDock Command Palette")
            .inner_size(480.0, 500.0)
            .decorations(false)
            .always_on_top(true)
            .resizable(false)
            .skip_taskbar(true)
            .center()
            .focused(true)
            .build()
            {
                // Re-focus after webview has loaded
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    let _ = win.set_focus();
                });
            }
        })
        .map_err(|e| format!("Failed to register command palette hotkey: {e}"))?;

    // Register SQL window shortcut (Ctrl+F10)
    let app_sql = app.clone();
    app.global_shortcut()
        .on_shortcut("Ctrl+F10", move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            // If SQL window already exists, focus it
            if let Some(win) = app_sql.get_webview_window("sql") {
                let _ = win.set_focus();
                return;
            }

            // Create a new SQL window
            if let Ok(win) = WebviewWindowBuilder::new(
                &app_sql,
                "sql",
                tauri::WebviewUrl::App("sql.html".into()),
            )
            .title("PRDock SQL")
            .inner_size(900.0, 650.0)
            .decorations(false)
            .resizable(true)
            .skip_taskbar(true)
            .center()
            .focused(true)
            .build()
            {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    let _ = win.set_focus();
                });
            }
        })
        .map_err(|e| format!("Failed to register SQL hotkey: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn unregister_hotkey(app: tauri::AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister hotkeys: {e}"))
}
