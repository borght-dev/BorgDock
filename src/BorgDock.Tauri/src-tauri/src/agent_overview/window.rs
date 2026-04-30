use crate::settings::load_settings_internal;
use tauri::{
    Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

const DEFAULT_W: f64 = 1280.0;
const DEFAULT_H: f64 = 820.0;

#[tauri::command]
pub async fn open_agent_overview_window(app: tauri::AppHandle) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let app = app_for_run;
        let result = (|| -> Result<(), String> {
            if let Some(existing) = app.get_webview_window("agent-overview") {
                existing.show().map_err(|e| e.to_string())?;
                existing.set_focus().map_err(|e| e.to_string())?;
                return Ok(());
            }

            let settings = load_settings_internal().ok();
            let win_state = settings
                .as_ref()
                .and_then(|s| s.agent_overview.window_state.clone());

            let mut builder = WebviewWindowBuilder::new(
                &app,
                "agent-overview",
                WebviewUrl::App("agent-overview.html".into()),
            )
            .title("BorgDock — Agent Overview")
            .inner_size(DEFAULT_W, DEFAULT_H)
            .min_inner_size(720.0, 480.0)
            .decorations(false)
            .resizable(true)
            .skip_taskbar(false)
            .shadow(true)
            .visible(true);

            if let Some(g) = &win_state {
                builder = builder
                    .inner_size(g.width as f64, g.height as f64)
                    .position(g.x as f64, g.y as f64);
            }

            let win = builder.build().map_err(|e| e.to_string())?;

            // Persist window geometry on close so the next launch restores it.
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
                        if let Ok(mut settings) = crate::settings::load_settings_internal() {
                            settings.agent_overview.window_state = Some(geom);
                            let _ = crate::settings::save_settings_internal(&settings);
                        }
                    }
                }
            });

            // Snap to stored geometry as a second pass; some Tauri versions
            // ignore inner_size on first build under HiDPI.
            if let Some(g) = win_state {
                win.set_size(tauri::Size::Physical(PhysicalSize::new(g.width, g.height)))
                    .ok();
                win.set_position(tauri::Position::Physical(PhysicalPosition::new(g.x, g.y)))
                    .ok();
            }
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
