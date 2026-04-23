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
                if super::window::sidebar_visible() {
                    if let Err(e) = super::window::hide_main_window(&app_cb) {
                        log::error!("hotkey: hide_main_window failed: {e}");
                    }
                } else {
                    if let Err(e) = super::window::show_main_window(&app_cb) {
                        log::error!("hotkey: show_main_window failed: {e}");
                    }
                }
                log::info!("hotkey toggle main thread work complete");
            }) {
                Ok(()) => log::info!("hotkey: run_on_main_thread dispatch succeeded"),
                Err(e) => log::error!("hotkey: run_on_main_thread dispatch failed: {e}"),
            }
        })
        .map_err(|e| format!("Failed to register hotkey: {e}"))?;

    // Register command palette shortcut (Ctrl+F9) — toggles the window:
    // if it's open, the re-press closes it; otherwise the window is created.
    // We close (not hide) to match PaletteApp's Escape-to-close behavior so
    // the re-opened window always starts with fresh state.
    let app_palette = app.clone();
    app.global_shortcut()
        .on_shortcut("Ctrl+F9", move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            // Marshal onto the main thread — WebView2 window creation on
            // Windows must happen on the thread that owns the message loop,
            // otherwise the app hangs with "Not Responding".
            let app_cb = app_palette.clone();
            let _ = app_palette.run_on_main_thread(move || {
                if let Some(win) = app_cb.get_webview_window("palette") {
                    let _ = win.close();
                    return;
                }

                if let Ok(win) = WebviewWindowBuilder::new(
                    &app_cb,
                    "palette",
                    tauri::WebviewUrl::App("palette.html".into()),
                )
                .title("BorgDock Command Palette")
                .inner_size(480.0, 500.0)
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
            });
        })
        .map_err(|e| format!("Failed to register command palette hotkey: {e}"))?;

    // Register worktree palette shortcut (Ctrl+F7) — toggles the same way
    // as the command palette.
    let app_worktree = app.clone();
    app.global_shortcut()
        .on_shortcut("Ctrl+F7", move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let app_cb = app_worktree.clone();
            let _ = app_worktree.run_on_main_thread(move || {
                if let Some(win) = app_cb.get_webview_window("worktree-palette") {
                    let _ = win.close();
                    return;
                }

                if let Ok(win) = WebviewWindowBuilder::new(
                    &app_cb,
                    "worktree-palette",
                    tauri::WebviewUrl::App("worktree.html".into()),
                )
                .title("BorgDock Worktrees")
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
            });
        })
        .map_err(|e| format!("Failed to register worktree palette hotkey: {e}"))?;

    // Register file palette shortcut (Ctrl+F8) — toggles the same way as the
    // command and worktree palettes. The palette window itself is keyboard-
    // dismissed and skipTaskbar=true. Files opened from it pop out into
    // separate first-class viewer windows (see file_palette::windows).
    let app_file_palette = app.clone();
    app.global_shortcut()
        .on_shortcut("Ctrl+F8", move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let app_cb = app_file_palette.clone();
            let _ = app_file_palette.run_on_main_thread(move || {
                if let Some(win) = app_cb.get_webview_window("file-palette") {
                    let _ = win.close();
                    return;
                }

                if let Ok(win) = WebviewWindowBuilder::new(
                    &app_cb,
                    "file-palette",
                    tauri::WebviewUrl::App("file-palette.html".into()),
                )
                .title("BorgDock File Palette")
                .inner_size(1100.0, 600.0)
                .min_inner_size(800.0, 400.0)
                .decorations(false)
                .always_on_top(true)
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
            });
        })
        .map_err(|e| format!("Failed to register file palette hotkey: {e}"))?;

    // Register SQL window shortcut (Ctrl+F10) — unlike the palettes, the SQL
    // window is a persistent workbench: it shows in the taskbar / Alt+Tab and
    // stays open until the user closes it via Escape or the title bar. A
    // re-press brings the existing window to front (it's easily occluded by
    // the always-on-top main sidebar), it does not close it.
    let app_sql = app.clone();
    app.global_shortcut()
        .on_shortcut("Ctrl+F10", move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let app_cb = app_sql.clone();
            let _ = app_sql.run_on_main_thread(move || {
                if let Some(win) = app_cb.get_webview_window("sql") {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                    return;
                }

                if let Ok(win) = WebviewWindowBuilder::new(
                    &app_cb,
                    "sql",
                    tauri::WebviewUrl::App("sql.html".into()),
                )
                .title("BorgDock SQL")
                .inner_size(900.0, 650.0)
                .decorations(false)
                .resizable(true)
                .center()
                .focused(true)
                .build()
                {
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(200));
                        let _ = win.set_focus();
                    });
                }
            });
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
