use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, PhysicalPosition, PhysicalSize};

/// Tracks whether the main sidebar window is currently shown.
///
/// We can't rely on `WebviewWindow::is_visible()` on Windows: for transparent
/// always-on-top WebView2 windows it returns `false` even when the window is
/// actually on screen. Every code path that shows or hides the main window
/// must update this flag so the hotkey and tray can decide which direction
/// to toggle.
static SIDEBAR_VISIBLE: AtomicBool = AtomicBool::new(true);

/// Returns whether the sidebar is currently shown (according to our tracked
/// state).
pub(crate) fn sidebar_visible() -> bool {
    SIDEBAR_VISIBLE.load(Ordering::SeqCst)
}

/// Show the main sidebar window, focus it, and force a repaint.
///
/// Windows + transparent + always-on-top WebView2 windows need aggressive
/// prodding after `.show()` to actually render — size/position must be
/// reapplied and the Z-order toggled. This helper exists so every call site
/// (hotkey, tray, toggle command) goes through the same sequence.
pub(crate) fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    log::info!("show_main_window: begin");
    let win = get_main_window(app)?;

    // If minimized, unminimize first — `show()` alone won't restore it.
    let _ = win.unminimize();

    win.show().map_err(|e| {
        log::error!("show_main_window: show() failed: {e}");
        e.to_string()
    })?;

    // Toggle always-on-top to force a Z-order refresh. Transparent WebView2
    // windows sometimes stay behind other windows after a hide→show cycle.
    let _ = win.set_always_on_top(false);
    let _ = win.set_always_on_top(true);

    // Reapply position and size to force the compositor to repaint.
    // A single set_size is sometimes not enough — resize by 1px and back so
    // the WM_SIZE message definitely fires.
    // Also clamp the position so the window is fully on-screen.
    if let Ok(size) = win.outer_size() {
        if size.width > 1 {
            let shrunk = PhysicalSize::new(size.width - 1, size.height);
            let _ = win.set_size(tauri::Size::Physical(shrunk));
        }
        let _ = win.set_size(tauri::Size::Physical(size));

        // Clamp position to keep the window within the current monitor.
        if let Ok(pos) = win.outer_position() {
            let mut x = pos.x;
            let mut y = pos.y;
            if let Ok(Some(monitor)) = win.current_monitor() {
                let mon_pos = monitor.position();
                let mon_size = monitor.size();
                let mon_right = mon_pos.x + mon_size.width as i32;
                let mon_bottom = mon_pos.y + mon_size.height as i32;

                // Clamp right/bottom edge
                if x + size.width as i32 > mon_right {
                    x = mon_right - size.width as i32;
                }
                if y + size.height as i32 > mon_bottom {
                    y = mon_bottom - size.height as i32;
                }
                // Clamp left/top edge
                if x < mon_pos.x {
                    x = mon_pos.x;
                }
                if y < mon_pos.y {
                    y = mon_pos.y;
                }
            }
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)));
        }
    }

    if let Err(e) = win.set_focus() {
        log::warn!("show_main_window: set_focus() failed: {e}");
    }

    SIDEBAR_VISIBLE.store(true, Ordering::SeqCst);
    log::info!("show_main_window: done");
    Ok(())
}

/// Hide the main sidebar window. Idempotent.
pub(crate) fn hide_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    log::info!("hide_main_window: begin");
    let win = get_main_window(app)?;
    win.hide().map_err(|e| {
        log::error!("hide_main_window: hide() failed: {e}");
        e.to_string()
    })?;
    SIDEBAR_VISIBLE.store(false, Ordering::SeqCst);
    log::info!("hide_main_window: done");
    Ok(())
}

// ---------------------------------------------------------------------------
// Flyout window (replaces the old floating badge)
// ---------------------------------------------------------------------------

/// Toggle the flyout window: show + focus if hidden/absent, hide if visible.
/// Called from the tray icon left-click handler.
pub(crate) fn toggle_flyout(app: &tauri::AppHandle) -> Result<(), String> {
    // If the mouse hook just hid the flyout (e.g. the tray click itself was
    // detected as a click-outside), don't immediately re-show it.
    #[cfg(target_os = "windows")]
    {
        if super::click_outside::millis_since_outside_hide() < 300 {
            log::info!("toggle_flyout: suppressing show (recent click-outside hide)");
            return Ok(());
        }
    }
    if let Some(win) = app.get_webview_window("flyout") {
        // Window exists — toggle visibility
        let visible = win.is_visible().unwrap_or(false);
        if visible {
            log::info!("toggle_flyout: hiding");
            #[cfg(target_os = "windows")]
            super::click_outside::uninstall_hook();
            win.hide().map_err(|e| e.to_string())?;
        } else {
            log::info!("toggle_flyout: showing existing");
            position_flyout_above_tray(app, &win)?;
            win.show().map_err(|e| e.to_string())?;
            let _ = win.set_always_on_top(true);
            force_repaint(&win);
            let _ = win.set_focus();
            install_click_outside_hook(app, &win);
            // Nudge the main window to send fresh data to the flyout
            let _ = app.emit_to("main", "flyout-request-data", ());
        }
    } else {
        // Create lazily on first open
        log::info!("toggle_flyout: creating new window");
        let win = WebviewWindowBuilder::new(
            app,
            "flyout",
            WebviewUrl::App("flyout.html".into()),
        )
        .title("PRDock")
        .inner_size(412.0, 512.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .visible(false) // position first, then show
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;

        position_flyout_above_tray(app, &win)?;
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        force_repaint(&win);
        let _ = win.set_focus();
        install_click_outside_hook(app, &win);

        // Auto-hide on focus loss — only on non-Windows.
        // On Windows Focused(false) fires spuriously during the window's
        // initial setup (two events before React even mounts), which would
        // hide the freshly-created flyout before it's usable. The
        // WH_MOUSE_LL hook is the real click-outside mechanism on Windows.
        #[cfg(not(target_os = "windows"))]
        {
            let app_handle = app.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(false) = event {
                    log::info!("flyout lost focus — hiding");
                    if let Some(fw) = app_handle.get_webview_window("flyout") {
                        let _ = fw.hide();
                    }
                }
            });
        }
    }
    Ok(())
}

fn install_click_outside_hook(_app: &tauri::AppHandle, _win: &WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        match _win.hwnd() {
            Ok(hwnd) => {
                let hwnd_val = hwnd.0 as isize;
                if let Err(e) = super::click_outside::install_hook(_app.clone(), hwnd_val) {
                    log::error!("click_outside install_hook failed: {e}");
                }
            }
            Err(e) => log::error!("flyout hwnd() failed: {e}"),
        }
    }
}

/// Position the flyout window above the system tray area.
/// We approximate the tray position: Windows puts it in the bottom-right.
fn position_flyout_above_tray(app: &tauri::AppHandle, win: &WebviewWindow) -> Result<(), String> {
    let scale = win.scale_factor().unwrap_or(1.0);
    // 380px panel + 32px padding (16px each side) for shadow overflow
    let flyout_w = (412.0 * scale) as i32;
    let flyout_h = (512.0 * scale) as i32;

    // Try to use the primary monitor's work area
    let (screen_w, screen_h, screen_x, screen_y) = if let Some(monitor) = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
    {
        let s = monitor.size();
        let p = monitor.position();
        (s.width as i32, s.height as i32, p.x, p.y)
    } else {
        (1920, 1080, 0, 0)
    };

    // Place it so the panel (380px inner) sits above the taskbar.
    // The window is 420px wide — the extra 40px is shadow padding.
    // Anchor the panel's right edge near the tray area.
    let taskbar_h = (48.0 * scale) as i32;
    let x = screen_x + screen_w - flyout_w;
    let y = screen_y + screen_h - taskbar_h - flyout_h;

    win.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::Size::Physical(PhysicalSize::new(
        flyout_w as u32,
        flyout_h as u32,
    )))
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Force a repaint on transparent WebView2 windows (Windows workaround).
fn force_repaint(win: &WebviewWindow) {
    if let Ok(size) = win.outer_size() {
        if size.width > 1 {
            let shrunk = PhysicalSize::new(size.width - 1, size.height);
            let _ = win.set_size(tauri::Size::Physical(shrunk));
        }
        let _ = win.set_size(tauri::Size::Physical(size));
    }
}

// ---------------------------------------------------------------------------
// Existing commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn position_sidebar(app: tauri::AppHandle, edge: String, width: u32) -> Result<(), String> {
    let win = get_main_window(&app)?;
    apply_sidebar_position(&win, &edge, width)
}

#[tauri::command]
pub fn toggle_sidebar(app: tauri::AppHandle) -> Result<bool, String> {
    show_main_window(&app)?;
    Ok(true)
}

#[tauri::command]
pub fn hide_sidebar(app: tauri::AppHandle) -> Result<(), String> {
    hide_main_window(&app)
}

#[tauri::command]
pub fn hide_flyout(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    crate::platform::click_outside::uninstall_hook();
    if let Some(win) = app.get_webview_window("flyout") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_pr_detail_window(
    app: tauri::AppHandle,
    owner: String,
    repo: String,
    number: u32,
) -> Result<(), String> {
    let label = format!("pr-detail-{}-{}-{}", owner, repo, number);

    // If the window already exists, just show and focus it
    if let Some(existing) = app.get_webview_window(&label) {
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let url_str = format!(
        "pr-detail.html?owner={}&repo={}&number={}",
        urlencoding::encode(&owner),
        urlencoding::encode(&repo),
        number
    );

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url_str.into()))
        .title(format!("PR #{} - {}/{}", number, owner, repo))
        .inner_size(800.0, 900.0)
        .decorations(false)
        .resizable(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn get_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}

fn apply_sidebar_position(win: &WebviewWindow, edge: &str, width: u32) -> Result<(), String> {
    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor found")?;

    let screen_size = monitor.size();
    let screen_pos = monitor.position();
    let scale = win.scale_factor().unwrap_or(1.0);

    let physical_width = (width as f64 * scale) as u32;
    let height = screen_size.height;

    let x = match edge {
        "left" => screen_pos.x,
        _ => screen_pos.x + (screen_size.width as i32 - physical_width as i32),
    };

    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
        x,
        screen_pos.y,
    )))
    .map_err(|e| e.to_string())?;
    win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
        physical_width,
        height,
    )))
    .map_err(|e| e.to_string())?;

    Ok(())
}
