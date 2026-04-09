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
            log::info!("hotkey callback invoked (about to dispatch to main thread)");

            // Marshal onto the main thread — window show/hide on Windows
            // should run on the thread that owns the window, and
            // SetForegroundWindow in particular has thread restrictions.
            let app_cb = app_toggle.clone();
            match app_toggle.run_on_main_thread(move || {
                log::info!(
                    "hotkey toggle running on main thread, sidebar_visible={}",
                    super::window::sidebar_visible()
                );
                // `win.is_visible()` is unreliable for transparent always-on-top
                // WebView2 windows on Windows (returns false even when visible).
                // Use the tracked state instead.
                if super::window::sidebar_visible() {
                    if let Err(e) = super::window::hide_main_window(&app_cb) {
                        log::error!("hotkey: hide_main_window failed: {e}");
                    }
                    if let Err(e) = super::window::show_badge(app_cb.clone(), 0) {
                        log::error!("hotkey: show_badge failed: {e}");
                    }
                } else {
                    if let Err(e) = super::window::show_main_window(&app_cb) {
                        log::error!("hotkey: show_main_window failed: {e}");
                    }
                    if let Err(e) = super::window::hide_badge(app_cb.clone()) {
                        log::error!("hotkey: hide_badge failed: {e}");
                    }
                }
                log::info!("hotkey toggle main thread work complete");
            }) {
                Ok(()) => log::info!("hotkey: run_on_main_thread dispatch succeeded"),
                Err(e) => log::error!("hotkey: run_on_main_thread dispatch failed: {e}"),
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

    // Register worktree palette shortcut (Ctrl+F7)
    let app_worktree = app.clone();
    app.global_shortcut()
        .on_shortcut("Ctrl+F7", move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            // If worktree palette already exists, focus it
            if let Some(win) = app_worktree.get_webview_window("worktree-palette") {
                let _ = win.set_focus();
                return;
            }

            // Create a new worktree palette window
            if let Ok(win) = WebviewWindowBuilder::new(
                &app_worktree,
                "worktree-palette",
                tauri::WebviewUrl::App("worktree.html".into()),
            )
            .title("PRDock Worktrees")
            .inner_size(520.0, 420.0)
            .decorations(false)
            .always_on_top(true)
            .resizable(false)
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
        .map_err(|e| format!("Failed to register worktree palette hotkey: {e}"))?;

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

            // Create a new SQL window (temporarily using test page to isolate crash)
            if let Ok(win) = WebviewWindowBuilder::new(
                &app_sql,
                "sql",
                tauri::WebviewUrl::App("test-window.html".into()),
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
