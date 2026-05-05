use crate::settings::{load_settings_internal, save_settings_internal};
use tauri::{
    Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

const DEFAULT_W: f64 = 1080.0;
const DEFAULT_H: f64 = 760.0;
const MIN_W: f64 = 880.0;
const MIN_H: f64 = 560.0;

#[tauri::command]
pub async fn open_settings_window(
    app: tauri::AppHandle,
    section: Option<String>,
) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let app = app_for_run;
        let result = (|| -> Result<(), String> {
            // Singleton: focus existing window and emit deep-link event
            if let Some(existing) = app.get_webview_window("settings") {
                existing.show().map_err(|e| e.to_string())?;
                existing.set_focus().map_err(|e| e.to_string())?;
                if let Some(s) = section.clone() {
                    let _ = existing.emit("settings:deep-link", s);
                }
                return Ok(());
            }

            let settings = load_settings_internal().ok();
            let win_state = settings
                .as_ref()
                .and_then(|s| s.settings_window.clone());

            let url = match section.as_deref() {
                Some(s) => format!("settings.html#section={}", s),
                None => "settings.html".to_string(),
            };

            let mut builder = WebviewWindowBuilder::new(
                &app,
                "settings",
                WebviewUrl::App(url.into()),
            )
            .title("BorgDock — Settings")
            .inner_size(DEFAULT_W, DEFAULT_H)
            .min_inner_size(MIN_W, MIN_H)
            .decorations(false)
            .resizable(true)
            .skip_taskbar(false)
            .shadow(true)
            .visible(false);

            if let Some(g) = &win_state {
                builder = builder
                    .inner_size(g.width as f64, g.height as f64)
                    .position(g.x as f64, g.y as f64);
            }

            let win = builder.build().map_err(|e| e.to_string())?;

            // Snap to stored geometry BEFORE first show to avoid a flash at the
            // default size/position. Tauri sometimes ignores `inner_size` /
            // `position` builder args on first build under HiDPI, so re-apply
            // here while the window is still hidden. The window stays hidden
            // until the React app calls `settings_window_ready`, so the user
            // never sees the unstyled default chrome.
            if let Some(g) = &win_state {
                win.set_size(tauri::Size::Physical(PhysicalSize::new(g.width, g.height))).ok();
                win.set_position(tauri::Position::Physical(PhysicalPosition::new(g.x, g.y))).ok();
            }

            // Persist geometry on close
            let win_for_close = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    let pos = win_for_close.outer_position().ok();
                    let size = win_for_close.outer_size().ok();
                    if let (Some(p), Some(s)) = (pos, size) {
                        let geom = crate::settings::models::WindowGeometry {
                            x: p.x,
                            y: p.y,
                            width: s.width,
                            height: s.height,
                        };
                        if let Ok(mut settings) = load_settings_internal() {
                            settings.settings_window = Some(geom);
                            let _ = save_settings_internal(&settings);
                        }
                    }
                }
            });

            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
