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

/// Move the main window to a 1×1 off-screen position. Used so its React tree
/// keeps running (WebView2 throttles JS in hidden windows on Windows) without
/// being visible to the user. Called at startup and whenever the user hides
/// the sidebar.
pub(crate) fn park_main_offscreen(app: &tauri::AppHandle) -> Result<(), String> {
    let win = get_main_window(app)?;
    let scale = win.scale_factor().unwrap_or(1.0);
    // Prefer the primary monitor so the parked window's "home" stays anchored
    // there — otherwise the next show_main_window picks whichever monitor the
    // OS originally spawned the window on, which on Windows is often the
    // secondary display.
    let mon_x = win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten())
        .map(|m| m.position().x)
        .unwrap_or(0);
    let off_x = mon_x - (32000.0 * scale) as i32;
    let off_y = -(32000.0 * scale) as i32;
    win.set_position(tauri::Position::Physical(PhysicalPosition::new(off_x, off_y)))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::Size::Physical(PhysicalSize::new(1, 1)))
        .map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    SIDEBAR_VISIBLE.store(false, Ordering::SeqCst);
    Ok(())
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

    // The window may be parked off-screen at 1×1 (from startup or a hide).
    // Re-apply the configured sidebar edge/width so it docks correctly before
    // we show it. Load settings synchronously — this is a fast file read.
    match crate::settings::load_settings_internal() {
        Ok(settings) => {
            let edge = &settings.ui.sidebar_edge;
            let width = settings.ui.sidebar_width_px;
            if let Err(e) = apply_sidebar_position(&win, edge, width) {
                log::warn!("show_main_window: apply_sidebar_position failed: {e}");
            }
        }
        Err(e) => {
            log::warn!("show_main_window: could not load settings for position: {e}");
        }
    }

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

    if let Err(e) = win.set_focus() {
        log::warn!("show_main_window: set_focus() failed: {e}");
    }

    SIDEBAR_VISIBLE.store(true, Ordering::SeqCst);
    log::info!("show_main_window: done");
    Ok(())
}

/// Hide the main sidebar window by parking it off-screen. Idempotent.
/// Parking (rather than calling `win.hide()`) keeps the React tree alive and
/// prevents WebView2 from throttling the JS polling loop on Windows.
pub(crate) fn hide_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    park_main_offscreen(app)
}

// ---------------------------------------------------------------------------
// Flyout window (replaces the old floating badge)
// ---------------------------------------------------------------------------

const FLYOUT_GLANCE_W: f64 = 412.0;
const FLYOUT_GLANCE_H: f64 = 512.0;

const CHROME_OFFSET_WIN: i32 = 52;
const CHROME_OFFSET_MAC: i32 = 32;
const CHROME_OFFSET_LINUX: i32 = 36;

fn chrome_offset_for_os() -> i32 {
    if cfg!(target_os = "windows") {
        CHROME_OFFSET_WIN
    } else if cfg!(target_os = "macos") {
        CHROME_OFFSET_MAC
    } else {
        CHROME_OFFSET_LINUX
    }
}

/// Build the flyout window invisibly. Called once, from Tauri `setup`.
/// Position is computed from the current primary monitor.
pub(crate) fn build_flyout_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    let win = WebviewWindowBuilder::new(
        app,
        "flyout",
        WebviewUrl::App("flyout.html".into()),
    )
    .title("BorgDock")
    .inner_size(FLYOUT_GLANCE_W, FLYOUT_GLANCE_H)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .shadow(false)
    .visible(false)
    .focused(false)
    .build()
    .map_err(|e| e.to_string())?;

    if let Err(e) = position_flyout_near_tray(&win, FLYOUT_GLANCE_W, FLYOUT_GLANCE_H) {
        log::warn!("initial flyout positioning failed: {e}");
    }
    Ok(win)
}

/// Position the flyout's bottom-right (Windows) or top-right (macOS/Linux)
/// corner near the tray/indicator area.
pub(crate) fn position_flyout_near_tray(
    win: &WebviewWindow,
    inner_w: f64,
    inner_h: f64,
) -> Result<(), String> {
    use crate::flyout::position::{compute_flyout_position, default_anchor_for_os};

    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| win.primary_monitor().ok().flatten())
        .ok_or("No monitor found")?;
    let scale = win.scale_factor().unwrap_or(1.0);

    let w = (inner_w * scale) as i32;
    let h = (inner_h * scale) as i32;
    let ws = monitor.size();
    let wp = monitor.position();

    let chrome = (chrome_offset_for_os() as f64 * scale) as i32;
    let (x, y) = compute_flyout_position(
        wp.x, wp.y, ws.width as i32, ws.height as i32,
        w, h, default_anchor_for_os(), chrome,
    );

    win.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::Size::Physical(PhysicalSize::new(w as u32, h as u32)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Toggle the flyout window: show + focus if hidden, hide if visible.
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

    let win = app
        .get_webview_window("flyout")
        .ok_or_else(|| "flyout window not built yet".to_string())?;
    let visible = win.is_visible().unwrap_or(false);
    if visible {
        log::info!("toggle_flyout: hiding");
        #[cfg(target_os = "windows")]
        super::click_outside::uninstall_hook();
        win.hide().map_err(|e| e.to_string())?;
    } else {
        log::info!("toggle_flyout: showing");
        position_flyout_near_tray(&win, FLYOUT_GLANCE_W, FLYOUT_GLANCE_H)?;
        win.show().map_err(|e| e.to_string())?;
        let _ = win.set_always_on_top(true);
        force_repaint(&win);
        let _ = win.set_focus();
        install_click_outside_hook(app, &win);
        // Nudge the main window to send fresh data to the flyout
        let _ = app.emit_to("main", "flyout-request-data", ());
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

/// Resize the flyout and reposition so the correct corner stays anchored to
/// the tray/indicator area. On Windows (BottomRight anchor) the flyout's
/// bottom edge stays fixed relative to the taskbar; on macOS/Linux
/// (TopRight) the top edge stays fixed relative to the menu bar.
#[tauri::command]
pub async fn resize_flyout(
    app: tauri::AppHandle,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let win = app_for_run
                .get_webview_window("flyout")
                .ok_or_else(|| "flyout window not built".to_string())?;
            position_flyout_near_tray(&win, width as f64, height as f64)?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}

/// Resize the main window into a centered ~520×640 modal and show it. Used
/// on first run to host the setup wizard. The main window is normally parked
/// off-screen at 1×1 (see park_main_offscreen); this command reshapes it
/// into a centered modal for the duration of setup, then hide_sidebar can
/// park it again once setup completes.
#[tauri::command]
pub async fn show_setup_wizard(app: tauri::AppHandle) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let win = get_main_window(&app_for_run)?;
            let scale = win.scale_factor().unwrap_or(1.0);
            let ww = (520.0 * scale) as i32;
            let wh = (640.0 * scale) as i32;
            win.set_size(tauri::Size::Physical(PhysicalSize::new(ww as u32, wh as u32)))
                .map_err(|e| e.to_string())?;
            if let Ok(Some(monitor)) = win.current_monitor() {
                let mw = monitor.size().width as i32;
                let mh = monitor.size().height as i32;
                let mp = monitor.position();
                let x = mp.x + (mw - ww) / 2;
                let y = mp.y + (mh - wh) / 2;
                win.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)))
                    .map_err(|e| e.to_string())?;
            }
            win.show().map_err(|e| e.to_string())?;
            let _ = win.set_focus();
            SIDEBAR_VISIBLE.store(true, Ordering::SeqCst);
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_pr_detail_window(
    app: tauri::AppHandle,
    owner: String,
    repo: String,
    number: u32,
) -> Result<(), String> {
    // Sanitize label: replace characters that aren't valid in Tauri window
    // labels (e.g. '.', '/') so things like "user.name/repo" don't break the
    // get_webview_window lookup.
    let safe = |s: &str| s.replace(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_', "_");
    let label = format!("pr-detail-{}-{}-{}", safe(&owner), safe(&repo), number);
    log::info!("open_pr_detail_window: entry label={label}, owner={owner}, repo={repo}, number={number}");

    // If the window already exists, just show and focus it
    if let Some(existing) = app.get_webview_window(&label) {
        log::info!("open_pr_detail_window: reusing existing window {label}");
        existing.show().map_err(|e| {
            log::error!("open_pr_detail_window: existing.show() failed: {e}");
            e.to_string()
        })?;
        existing.set_focus().map_err(|e| {
            log::error!("open_pr_detail_window: existing.set_focus() failed: {e}");
            e.to_string()
        })?;
        return Ok(());
    }

    // We avoid putting params in the URL query string because Tauri routes
    // WebviewUrl::App through a PathBuf — on Windows '?' is reserved and gets
    // percent-encoded, so `pr-detail.html?owner=...` becomes
    // `pr-detail.html%3Fowner=...`, which Vite / the asset resolver 404s on.
    // Inject params as a global instead; PRDetailApp.tsx reads them.
    let owner_json = serde_json::to_string(&owner).map_err(|e| e.to_string())?;
    let repo_json = serde_json::to_string(&repo).map_err(|e| e.to_string())?;
    let init_script = format!(
        "window.__BORGDOCK_PR_DETAIL__ = {{ owner: {}, repo: {}, number: {} }};",
        owner_json, repo_json, number
    );
    log::info!("open_pr_detail_window: init_script built, dispatching to main thread");

    // Window creation must happen on the main (GUI) thread. When this command
    // runs on a worker thread (which async tauri commands do), calling
    // WebviewWindowBuilder::build() directly can hang because it dispatches to
    // the main thread synchronously and deadlocks against itself. Using
    // run_on_main_thread + a oneshot channel lets us wait for the real result.
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_build = app.clone();
    let label_for_build = label.clone();
    let title = format!("PR #{} - {}/{}", number, owner, repo);

    app.run_on_main_thread(move || {
        log::info!("open_pr_detail_window: on main thread, calling WebviewWindowBuilder::build for {label_for_build}");
        let result = WebviewWindowBuilder::new(
            &app_for_build,
            &label_for_build,
            WebviewUrl::App("pr-detail.html".into()),
        )
        .title(title)
        .inner_size(800.0, 900.0)
        .decorations(false)
        .resizable(true)
        .skip_taskbar(true)
        .center()
        .focused(true)
        .initialization_script(&init_script)
        .build();

        let send_result = match result {
            Ok(win) => {
                log::info!("open_pr_detail_window: build succeeded for {label_for_build}");
                let _ = win.show();
                let _ = win.set_focus();
                // Re-apply skip_taskbar — on Windows the builder flag is
                // sometimes ignored once the window is actually shown, and the
                // entry shows up in the OS taskbar. Re-applying here forces
                // the ITaskbarList2 removal to happen after the HWND is real.
                if let Err(e) = win.set_skip_taskbar(true) {
                    log::warn!("open_pr_detail_window: set_skip_taskbar failed for {label_for_build}: {e}");
                }

                // Schedule a delayed repaint so the window doesn't render blank
                // on Windows if another window held focus at creation time.
                let win_repaint = win.clone();
                let label_repaint = label_for_build.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(250));
                    let _ = win_repaint.set_focus();
                    let _ = win_repaint.set_skip_taskbar(true);
                    force_repaint(&win_repaint);
                    log::debug!("open_pr_detail_window: post-show repaint done for {label_repaint}");
                });
                Ok(())
            }
            Err(e) => {
                log::error!("open_pr_detail_window: build failed for {label_for_build}: {e}");
                Err(e.to_string())
            }
        };

        if tx.send(send_result).is_err() {
            log::warn!("open_pr_detail_window: receiver for {label_for_build} was dropped before result arrived");
        }
    })
    .map_err(|e| {
        log::error!("open_pr_detail_window: run_on_main_thread dispatch failed: {e}");
        e.to_string()
    })?;

    match rx.await {
        Ok(inner) => {
            log::info!("open_pr_detail_window: command returning for {label}, ok={}", inner.is_ok());
            inner
        }
        Err(e) => {
            log::error!("open_pr_detail_window: oneshot recv failed for {label}: {e}");
            Err(format!("main-thread build channel closed: {e}"))
        }
    }
}

#[tauri::command]
pub async fn open_whats_new_window(
    app: tauri::AppHandle,
    version: Option<String>,
) -> Result<(), String> {
    let label = "whats-new";
    log::info!("open_whats_new_window: entry version={:?}", version);

    if let Some(existing) = app.get_webview_window(label) {
        log::info!("open_whats_new_window: reusing existing window");
        if let Some(ref v) = version {
            let v_json = serde_json::to_string(v).map_err(|e| e.to_string())?;
            let _ = existing.eval(&format!(
                "window.dispatchEvent(new CustomEvent('whats-new:navigate', {{ detail: {} }}))",
                v_json
            ));
        }
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let version_json = match &version {
        Some(v) => serde_json::to_string(v).map_err(|e| e.to_string())?,
        None => "null".to_string(),
    };
    let init_script = format!(
        "window.__BORGDOCK_WHATS_NEW__ = {{ version: {} }};",
        version_json
    );

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_build = app.clone();

    app.run_on_main_thread(move || {
        let result = WebviewWindowBuilder::new(
            &app_for_build,
            label,
            WebviewUrl::App("whats-new.html".into()),
        )
        .title("What's new in BorgDock")
        .inner_size(520.0, 640.0)
        .min_inner_size(480.0, 480.0)
        .decorations(false)
        .resizable(true)
        .skip_taskbar(true)
        .center()
        .focused(true)
        .initialization_script(&init_script)
        .build();

        let send_result = match result {
            Ok(win) => {
                let _ = win.show();
                let _ = win.set_focus();
                let _ = win.set_skip_taskbar(true);
                let win_repaint = win.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    let _ = win_repaint.set_focus();
                    force_repaint(&win_repaint);
                });
                Ok(())
            }
            Err(e) => {
                log::error!("open_whats_new_window: build failed: {e}");
                Err(e.to_string())
            }
        };
        let _ = tx.send(send_result);
    })
    .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}

fn get_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}

fn apply_sidebar_position(win: &WebviewWindow, edge: &str, width: u32) -> Result<(), String> {
    // Always dock to the primary monitor so the sidebar lands on the user's
    // main display regardless of where Tauri/WebView2 happened to spawn the
    // window initially. We fall back to current_monitor only if the platform
    // can't report a primary (rare — typically headless test environments).
    let monitor = win
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| win.current_monitor().ok().flatten())
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
