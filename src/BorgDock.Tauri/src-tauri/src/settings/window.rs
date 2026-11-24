//! The Settings window: built once and kept. Closing it hides it
//! (`platform::window::hides_when_closed`), so opening it again only shows it.
//!
//! Building a WebView2 window blocks the GUI thread until the browser has a
//! renderer for it: 0.4–3 s as a rule, 6–14 s measured while the disk was
//! busy (borgdock.log, 2026-11-24). Settings used to be built on every click,
//! which froze every window's IPC that long and timed the click out after
//! `MAIN_THREAD_TIMEOUT`. `prewarm` builds it ahead of the first click.

use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub(crate) const LABEL: &str = "settings";

/// The window came back from hidden; its app drops what the last visit left.
const SHOWN_EVENT: &str = "settings:shown";
const DEEP_LINK_EVENT: &str = "settings:deep-link";

/// Long enough after launch for the main window's first poll to be through.
const PREWARM_AFTER: Duration = Duration::from_secs(20);

const DEFAULT_W: f64 = 1080.0;
const DEFAULT_H: f64 = 760.0;
const MIN_W: f64 = 880.0;
const MIN_H: f64 = 560.0;

/// Builds the window invisible. GUI thread only; blocks it while WebView2
/// starts the window's renderer. `take_focus` is false for a build nobody
/// asked for: a new webview that takes the keyboard would take it from the
/// window you are typing in.
fn build(
    app: &tauri::AppHandle,
    section: Option<&str>,
    take_focus: bool,
) -> Result<WebviewWindow, String> {
    let started = Instant::now();
    let url = match section {
        Some(section) => format!("settings.html#section={section}"),
        None => "settings.html".to_string(),
    };
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(url.into()))
        .title("BorgDock — Settings")
        .inner_size(DEFAULT_W, DEFAULT_H)
        .min_inner_size(MIN_W, MIN_H)
        .decorations(false)
        .resizable(true)
        .skip_taskbar(false)
        .shadow(true)
        .center()
        .visible(false)
        .focused(take_focus)
        .build()
        .map_err(|e| e.to_string())?;
    crate::platform::window_geometry::persist_window_geometry(app, &window, LABEL);
    log::info!("settings: window built in {:?}", started.elapsed());
    Ok(window)
}

/// Brings the kept window forward. GUI thread only.
fn show(window: &WebviewWindow, section: Option<String>) -> Result<(), String> {
    let was_hidden = !window.is_visible().unwrap_or(false);
    window.unminimize().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    if was_hidden {
        let _ = window.emit(SHOWN_EVENT, ());
    }
    if let Some(section) = section {
        let _ = window.emit(DEEP_LINK_EVENT, section);
    }
    Ok(())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn open_settings_window(
    app: tauri::AppHandle,
    section: Option<String>,
) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = match app_for_run.get_webview_window(LABEL) {
            Some(existing) => show(&existing, section),
            // Not built yet (a click before `prewarm` ran): the app reveals
            // the window itself through `window_ready` once it has painted.
            None => build(&app_for_run, section.as_deref(), true).map(|_| ()),
        };
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    crate::platform::window::main_thread_result(rx).await
}

/// Builds the window hidden a while after launch, so the first click on
/// Settings shows it instead of waiting for WebView2.
pub fn prewarm(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(PREWARM_AFTER).await;
        let app_for_run = app.clone();
        let queued = app.run_on_main_thread(move || {
            if app_for_run.get_webview_window(LABEL).is_some() {
                return;
            }
            match build(&app_for_run, None, false) {
                // Its app calls `window_ready` once it has painted; nobody
                // asked for the window yet, so it stays hidden until a click.
                Ok(_) => crate::platform::window::keep_hidden_when_ready(LABEL),
                Err(error) => log::warn!("settings: prewarm failed: {error}"),
            }
        });
        if let Err(error) = queued {
            log::warn!("settings: prewarm not queued: {error}");
        }
    });
}
