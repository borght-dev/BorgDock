use std::sync::Mutex;
use tauri::webview::WebviewWindowBuilder;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Currently-registered sidebar toggle shortcut (user-configurable via
/// settings). Tracked so a later `register_user_hotkeys` call can unregister
/// just this one, without touching the fixed palette shortcuts
/// (Ctrl+F7/F8/F9/F10) that are registered once at app setup.
static SIDEBAR_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);

/// Currently-registered flyout toggle shortcut (user-configurable via
/// settings). Tracked so a later `register_user_hotkeys` call can unregister
/// just this one, without touching the fixed palette shortcuts.
static FLYOUT_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);

/// Registers the fixed palette + SQL hotkeys (Ctrl+F7/F8/F9/F10). These are
/// code-defined, not user-configurable, so they're registered once at setup
/// and never churned. Previously these lived inside `register_hotkey`, which
/// is called on every settings load — each call did `unregister_all()` and
/// re-registered, briefly leaving palette shortcuts unbound and racing
/// against in-flight keypresses.
pub fn register_fixed_hotkeys(app: &tauri::AppHandle) -> Result<(), String> {
    // Ctrl+F9 — command palette. Toggles: re-press closes the window so each
    // open starts with fresh state, matching PaletteApp's Escape-to-close.
    let app_palette = app.clone();
    app.global_shortcut()
        .on_shortcut("Ctrl+F9", move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let app_cb = app_palette.clone();
            let _ = app_palette.run_on_main_thread(move || {
                if let Some(win) = app_cb.get_webview_window("palette") {
                    let _ = win.close();
                    return;
                }
                let _ = WebviewWindowBuilder::new(
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
                .build();
                // The palette's frontend calls `palette_ready` once its DOM
                // is mounted to re-assert OS focus on the main thread. No
                // background-thread focus kick — that pattern violated
                // Windows' thread affinity for focus APIs and, combined
                // with a JS-side retry loop, saturated WebView2's
                // PostMessage queue and crashed the process.
            });
        })
        .map_err(|e| format!("Failed to register command palette hotkey: {e}"))?;

    // Ctrl+F7 — worktree palette.
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
                let _ = WebviewWindowBuilder::new(
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
                .build();
            });
        })
        .map_err(|e| format!("Failed to register worktree palette hotkey: {e}"))?;

    // Ctrl+F8 — file palette. Files opened from it pop out into separate
    // first-class viewer windows (see file_palette::windows).
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
                let _ = WebviewWindowBuilder::new(
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
                .build();
            });
        })
        .map_err(|e| format!("Failed to register file palette hotkey: {e}"))?;

    // Ctrl+F10 — SQL workbench. Unlike the palettes, the SQL window is a
    // persistent workbench: it shows in the taskbar / Alt+Tab and stays open
    // until the user closes it. A re-press brings the existing window to
    // front (it's easily occluded by the always-on-top main sidebar).
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
                let _ = WebviewWindowBuilder::new(
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
                .build();
            });
        })
        .map_err(|e| format!("Failed to register SQL hotkey: {e}"))?;

    Ok(())
}

/// Register (or re-register) both user-configurable hotkeys: the sidebar
/// toggle and the flyout toggle. Called from the frontend whenever either
/// `settings.ui.globalHotkey` or `settings.ui.flyoutHotkey` changes. Only
/// touches the user shortcuts; the fixed palette/SQL shortcuts are owned by
/// `register_fixed_hotkeys` and live for the process lifetime.
#[tauri::command]
pub fn register_user_hotkeys(
    app: tauri::AppHandle,
    sidebar_shortcut: String,
    flyout_shortcut: String,
) -> Result<(), String> {
    // Unregister only the previous user shortcuts, if any.
    if let Ok(mut guard) = SIDEBAR_SHORTCUT.lock() {
        if let Some(prev) = guard.take() {
            let _ = app.global_shortcut().unregister(prev.as_str());
        }
    }
    if let Ok(mut guard) = FLYOUT_SHORTCUT.lock() {
        if let Some(prev) = guard.take() {
            let _ = app.global_shortcut().unregister(prev.as_str());
        }
    }

    // Sidebar toggle
    let app_toggle = app.clone();
    app.global_shortcut()
        .on_shortcut(sidebar_shortcut.as_str(), move |_app, _shortcut, event| {
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
        .map_err(|e| format!("Failed to register sidebar hotkey: {e}"))?;

    if let Ok(mut guard) = SIDEBAR_SHORTCUT.lock() {
        *guard = Some(sidebar_shortcut);
    }

    // Flyout toggle
    let app_flyout = app.clone();
    app.global_shortcut()
        .on_shortcut(flyout_shortcut.as_str(), move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let app_cb = app_flyout.clone();
            let _ = app_flyout.run_on_main_thread(move || {
                if let Err(e) = super::window::toggle_flyout(&app_cb) {
                    log::error!("flyout hotkey: toggle_flyout failed: {e}");
                }
            });
        })
        .map_err(|e| format!("Failed to register flyout hotkey: {e}"))?;

    if let Ok(mut guard) = FLYOUT_SHORTCUT.lock() {
        *guard = Some(flyout_shortcut);
    }

    Ok(())
}

#[tauri::command]
pub fn unregister_hotkey(app: tauri::AppHandle) -> Result<(), String> {
    let prev_sidebar = SIDEBAR_SHORTCUT.lock().ok().and_then(|mut g| g.take());
    if let Some(shortcut) = prev_sidebar {
        app.global_shortcut()
            .unregister(shortcut.as_str())
            .map_err(|e| format!("Failed to unregister sidebar hotkey: {e}"))?;
    }
    let prev_flyout = FLYOUT_SHORTCUT.lock().ok().and_then(|mut g| g.take());
    if let Some(shortcut) = prev_flyout {
        app.global_shortcut()
            .unregister(shortcut.as_str())
            .map_err(|e| format!("Failed to unregister flyout hotkey: {e}"))?;
    }
    Ok(())
}

/// Frontend handshake: a palette window calls this once its DOM is mounted
/// and the input is reachable. We re-assert OS-level focus on the main
/// thread so Windows' foreground-lock rules don't leave the new window
/// focus-less. Replaces the old `std::thread::spawn` + `sleep(200ms)` +
/// `set_focus()` pattern, which called Win32 focus APIs from a non-UI
/// thread and, combined with a JS-side 50ms focus retry loop, saturated
/// WebView2's PostMessage queue and hard-crashed the process.
#[tauri::command]
pub async fn palette_ready(
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    let label = window.label().to_string();
    if !matches!(
        label.as_str(),
        "palette" | "worktree-palette" | "file-palette"
    ) {
        return Err(format!("palette_ready: not a palette window: {label}"));
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let win = app_for_run
                .get_webview_window(&label)
                .ok_or_else(|| format!("palette window '{label}' vanished"))?;
            win.set_focus().map_err(|e| e.to_string())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}
