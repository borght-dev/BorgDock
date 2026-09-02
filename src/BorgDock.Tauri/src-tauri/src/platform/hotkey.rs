use std::sync::Mutex;
use tauri::webview::WebviewWindowBuilder;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Static description of a window opened by a global hotkey. All windows that
/// fit this shape (the four palettes + SQL workbench) go through one
/// `open_or_toggle_palette` code path. Agent Overview is excluded — it has
/// settings-driven geometry that doesn't fit a const spec.
struct PaletteSpec {
    /// Stable label used by Tauri to look up the window.
    label: &'static str,
    /// Title shown in Alt+Tab and in OS chrome (when `decorations` is true).
    title: &'static str,
    /// Frontend HTML asset path, e.g. "sql.html". Resolved by Tauri's bundler.
    url: &'static str,
    /// Initial size in DIPs.
    inner_size: (f64, f64),
    /// Optional minimum size in DIPs.
    min_inner_size: Option<(f64, f64)>,
    /// Show OS chrome? Palettes and SQL run chromeless and render their own
    /// title bar via WindowTitleBar.
    decorations: bool,
    /// Hide from taskbar / Alt+Tab. True for HUD-style palettes; SQL stays in
    /// the taskbar so users can app-switch back to it.
    skip_taskbar: bool,
    /// User-resizable.
    resizable: bool,
}

const SQL_SPEC: PaletteSpec = PaletteSpec {
    label: "sql",
    title: "BorgDock SQL",
    url: "sql.html",
    inner_size: (900.0, 650.0),
    min_inner_size: None,
    decorations: false,
    skip_taskbar: false,
    resizable: true,
};

const FILE_PALETTE_SPEC: PaletteSpec = PaletteSpec {
    label: "file-palette",
    title: "BorgDock File Palette",
    url: "file-palette.html",
    inner_size: (1100.0, 600.0),
    min_inner_size: Some((800.0, 400.0)),
    decorations: false,
    skip_taskbar: true,
    resizable: true,
};

const WORK_ITEM_PALETTE_SPEC: PaletteSpec = PaletteSpec {
    label: "work-item-palette",
    title: "BorgDock Work Item Palette",
    url: "work-item-palette.html",
    inner_size: (720.0, 640.0),
    min_inner_size: Some((480.0, 400.0)),
    decorations: false,
    skip_taskbar: true,
    resizable: true,
};

const WORKTREE_PALETTE_SPEC: PaletteSpec = PaletteSpec {
    label: "worktree-palette",
    title: "BorgDock Worktrees",
    url: "worktree.html",
    inner_size: (520.0, 420.0),
    min_inner_size: None,
    decorations: false,
    skip_taskbar: true,
    resizable: false,
};

/// Hotkey → spec table. Used to build all four fixed hotkey callbacks
/// identically in `register_fixed_hotkeys`.
const PALETTE_HOTKEYS: &[(&str, &PaletteSpec)] = &[
    ("Ctrl+F7", &WORKTREE_PALETTE_SPEC),
    ("Ctrl+F8", &FILE_PALETTE_SPEC),
    ("Ctrl+F9", &WORK_ITEM_PALETTE_SPEC),
    ("Ctrl+F10", &SQL_SPEC),
];

/// Smart-toggle entry point used by every palette/SQL hotkey.
///
/// Behavior table:
/// - window doesn't exist            → build it (invisible; React reveals via window_ready)
/// - window exists, focused+visible  → hide it (user is dismissing)
/// - window exists, visible, !focused → unminimize + show + focus (raise to front).
///   Don't emit `palette-shown` — the user expects existing input/state to
///   be preserved when raising from the background.
/// - window exists, hidden            → unminimize + show + focus + emit
///   `palette-shown` so the React side resets transient state (clears query,
///   refocuses input).
///
/// Replaces the previous `is_visible`-only toggle, which conflated "occluded"
/// with "hidden" and made hotkey-from-other-app require two presses to focus.
/// SQL previously had no toggle at all (re-press always raised), which fixed
/// the focus issue but broke press-twice-to-dismiss. This unifies both.
///
/// MUST run on the main GUI thread — does WebviewWindowBuilder work and Win32
/// focus APIs that have thread affinity.
fn open_or_toggle_palette(app: &tauri::AppHandle, spec: &PaletteSpec) {
    let label = spec.label;
    if let Some(win) = app.get_webview_window(label) {
        let is_focused = win.is_focused().unwrap_or(false);
        let is_visible = win.is_visible().unwrap_or(false);
        log::info!("palette[{label}]: existing (visible={is_visible}, focused={is_focused})");
        if is_focused && is_visible {
            log::info!("palette[{label}]: focused → hide");
            let _ = win.hide();
        } else {
            log::info!("palette[{label}]: not focused → raise + focus");
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
            if !is_visible {
                let _ = win.emit("palette-shown", ());
            }
        }
        return;
    }

    log::info!("palette[{label}]: building new window");
    let t0 = std::time::Instant::now();
    let mut builder =
        WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App(spec.url.into()))
            .title(spec.title)
            .inner_size(spec.inner_size.0, spec.inner_size.1)
            .decorations(spec.decorations)
            .resizable(spec.resizable)
            .center()
            .visible(false)
            .focused(true);
    if spec.skip_taskbar {
        builder = builder.skip_taskbar(true);
    }
    if let Some((w, h)) = spec.min_inner_size {
        builder = builder.min_inner_size(w, h);
    }
    match builder.build() {
        Ok(win) => {
            log::info!("palette[{label}]: build succeeded in {:?}", t0.elapsed());
            crate::platform::window_geometry::persist_window_geometry(app, &win, spec.label);
        }
        Err(e) => log::error!("palette[{label}]: build failed in {:?}: {e}", t0.elapsed()),
    }
}

/// Currently-registered main-window toggle shortcut (user-configurable via
/// settings). The hotkey calls `show_or_focus_main_sync`, which shows /
/// focuses / hides the main BorgDock window. Tracked so a later
/// `register_user_hotkeys` call can unregister just this one, without
/// touching the fixed palette shortcuts (Ctrl+F7/F8/F9/F10) that are
/// registered once at app setup. Name predates the main-window rewrite
/// (was the dock sidebar) but kept as-is to avoid churning the storage
/// key in user settings.
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
///
/// Each shortcut is registered independently: one that is already taken by
/// another app (or a zombie BorgDock) is logged and skipped, it never
/// prevents the remaining ones from being bound. Always returns `Ok`.
pub fn register_fixed_hotkeys(app: &tauri::AppHandle) -> Result<(), String> {
    for &(shortcut, spec) in PALETTE_HOTKEYS {
        let app_for_cb = app.clone();
        let registered =
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    log::info!("{shortcut}: shortcut fired");
                    let app_inner = app_for_cb.clone();
                    if let Err(e) = app_for_cb.run_on_main_thread(move || {
                        open_or_toggle_palette(&app_inner, spec);
                    }) {
                        log::error!("{shortcut}: run_on_main_thread dispatch failed: {e}");
                    }
                });
        if let Err(e) = registered {
            log::error!("Failed to register {shortcut} hotkey: {e}");
        }
    }

    Ok(())
}

/// Register (or re-register) both user-configurable hotkeys: the
/// main-window show/focus/hide toggle (via `show_or_focus_main_sync`) and
/// the flyout toggle. Called from the frontend whenever either
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

    // Main window show/focus/hide toggle
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
                log::info!("hotkey: running show_or_focus_main_sync on main thread");
                super::window::show_or_focus_main_sync(&app_cb);
                log::info!("hotkey toggle main thread work complete");
            }) {
                Ok(()) => log::info!("hotkey: run_on_main_thread dispatch succeeded"),
                Err(e) => log::error!("hotkey: run_on_main_thread dispatch failed: {e}"),
            }
        })
        .map_err(|e| format!("Failed to register main-window hotkey: {e}"))?;

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
            .map_err(|e| format!("Failed to unregister main-window hotkey: {e}"))?;
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
pub async fn palette_ready(app: tauri::AppHandle, window: tauri::Window) -> Result<(), String> {
    let label = window.label().to_string();
    log::info!("palette_ready[{label}]: entry");
    if !matches!(
        label.as_str(),
        "work-item-palette" | "worktree-palette" | "file-palette"
    ) {
        log::warn!("palette_ready[{label}]: rejecting — not a palette window");
        return Err(format!("palette_ready: not a palette window: {label}"));
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    let label_for_log = label.clone();
    log::info!("palette_ready[{label}]: dispatching to main thread");
    app.run_on_main_thread(move || {
        log::info!("palette_ready[{label_for_log}]: on main thread");
        let result = (|| -> Result<(), String> {
            let win = app_for_run
                .get_webview_window(&label_for_log)
                .ok_or_else(|| format!("palette window '{label_for_log}' vanished"))?;
            win.set_focus().map_err(|e| e.to_string())
        })();
        match &result {
            Ok(_) => log::info!("palette_ready[{label_for_log}]: set_focus ok"),
            Err(e) => log::error!("palette_ready[{label_for_log}]: set_focus failed: {e}"),
        }
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    let r = crate::platform::window::main_thread_result(rx).await;
    log::info!("palette_ready[{label}]: returning ok={}", r.is_ok());
    r
}
