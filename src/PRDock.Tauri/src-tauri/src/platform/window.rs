use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, PhysicalPosition, PhysicalSize};

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
    if let Ok(size) = win.outer_size() {
        if size.width > 1 {
            let shrunk = PhysicalSize::new(size.width - 1, size.height);
            let _ = win.set_size(tauri::Size::Physical(shrunk));
        }
        let _ = win.set_size(tauri::Size::Physical(size));
    }
    if let Ok(pos) = win.outer_position() {
        let _ = win.set_position(tauri::Position::Physical(pos));
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

/// Build the badge window (hidden). Must be called from the main thread —
/// `WebviewWindowBuilder::build()` on Windows deadlocks when called from a
/// background tokio task because WebView2 window creation needs the main
/// thread. We call this once at startup so `show_badge` can later just fetch
/// the existing window via `get_webview_window`.
pub(crate) fn create_badge_window(app: &tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window("badge").is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "badge", WebviewUrl::App("badge.html".into()))
        .title("PRDock Badge")
        .inner_size(340.0, 48.0)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .transparent(true)
        .shadow(false)
        .visible(false)
        .skip_taskbar(true)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn position_sidebar(app: tauri::AppHandle, edge: String, width: u32) -> Result<(), String> {
    let win = get_main_window(&app)?;
    apply_sidebar_position(&win, &edge, width)
}

#[tauri::command]
pub fn toggle_sidebar(app: tauri::AppHandle) -> Result<bool, String> {
    // Despite the name, this command is only ever invoked from paths that want
    // to *show* the sidebar (badge expand, etc.). The old implementation
    // branched on `win.is_visible()`, but on Windows that returns false for
    // transparent always-on-top WebView2 windows even when they're visible, so
    // the hide branch never fired and the show branch was a no-op. Callers
    // that want to hide now invoke `hide_sidebar` directly.
    show_main_window(&app)?;
    Ok(true)
}

#[tauri::command]
pub fn show_badge(app: tauri::AppHandle, _count: u32) -> Result<(), String> {
    log::info!("show_badge: begin");
    // The badge window is created eagerly during setup on the main thread.
    // Don't try to build it here — Tauri's window builder deadlocks when
    // called from a tokio task on Windows.
    let badge_win = app
        .get_webview_window("badge")
        .ok_or_else(|| "badge window not found (should be created at startup)".to_string())?;
    log::info!("show_badge: got badge window");

    // Position badge at top-center of primary monitor
    if let Ok(Some(monitor)) = badge_win.current_monitor() {
        let screen_size = monitor.size();
        let screen_pos = monitor.position();
        let scale = badge_win.scale_factor().unwrap_or(1.0);
        let badge_width = (340.0 * scale) as u32;
        let badge_height = (48.0 * scale) as u32;
        let x = screen_pos.x + (screen_size.width as i32 - badge_width as i32) / 2;
        let y = screen_pos.y + 8;
        let _ = badge_win.set_position(tauri::Position::Physical(
            PhysicalPosition::new(x, y),
        ));
        let _ = badge_win.set_size(tauri::Size::Physical(PhysicalSize::new(
            badge_width,
            badge_height,
        )));
    }
    badge_win.show().map_err(|e| {
        log::error!("show_badge: show() failed: {e}");
        e.to_string()
    })?;
    badge_win.set_always_on_top(true).map_err(|e| {
        log::error!("show_badge: set_always_on_top failed: {e}");
        e.to_string()
    })?;

    // Force the compositor to repaint the transparent window.
    // Without this, WebView2 transparent windows can render as a blank
    // (fully invisible) rectangle — same workaround used in toggle_sidebar.
    if let Ok(size) = badge_win.outer_size() {
        let _ = badge_win.set_size(tauri::Size::Physical(size));
    }

    log::info!("show_badge: done");
    Ok(())
}

/// Resize the badge window, keeping it centered horizontally.
/// `anchor`: `"top"` keeps the top edge fixed, `"bottom"` keeps the bottom edge fixed,
///           `"auto"` grows upward only if the window would go off-screen.
/// Returns `"up"` if the window grew/anchored upward, `"down"` otherwise.
#[tauri::command]
pub fn resize_badge(
    app: tauri::AppHandle,
    width: u32,
    height: u32,
    anchor: Option<String>,
) -> Result<String, String> {
    let mut direction = "down".to_string();
    let anchor = anchor.unwrap_or_else(|| "auto".to_string());

    if let Some(badge_win) = app.get_webview_window("badge") {
        let scale = badge_win.scale_factor().unwrap_or(1.0);
        let pw = (width as f64 * scale) as u32;
        let ph = (height as f64 * scale) as u32;

        if let (Ok(cur_pos), Ok(cur_size)) = (badge_win.outer_position(), badge_win.outer_size()) {
            let mid_x = cur_pos.x + cur_size.width as i32 / 2;
            let new_x = mid_x - pw as i32 / 2;
            let cur_bottom = cur_pos.y + cur_size.height as i32;

            let new_y = if anchor == "bottom" {
                // Keep bottom edge fixed
                direction = "up".to_string();
                cur_bottom - ph as i32
            } else if anchor == "top" {
                // Keep top edge fixed
                cur_pos.y
            } else {
                // Auto: grow upward only if expanding would go off-screen
                let mut y = cur_pos.y;
                if let Ok(Some(monitor)) = badge_win.current_monitor() {
                    let screen_bottom = monitor.position().y + monitor.size().height as i32;
                    if cur_pos.y + ph as i32 > screen_bottom {
                        y = cur_bottom - ph as i32;
                        direction = "up".to_string();
                    }
                }
                y
            };

            let _ = badge_win.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(new_x, new_y),
            ));
        }

        badge_win
            .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(pw, ph)))
            .map_err(|e| e.to_string())?;
    }
    Ok(direction)
}

#[tauri::command]
pub fn hide_badge(app: tauri::AppHandle) -> Result<(), String> {
    log::info!("hide_badge: begin");
    if let Some(badge_win) = app.get_webview_window("badge") {
        badge_win.hide().map_err(|e| {
            log::error!("hide_badge: hide() failed: {e}");
            e.to_string()
        })?;
    }
    log::info!("hide_badge: done");
    Ok(())
}

#[tauri::command]
pub fn hide_sidebar(app: tauri::AppHandle) -> Result<(), String> {
    hide_main_window(&app)
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
