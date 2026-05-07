use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

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

            let url = match section.as_deref() {
                Some(s) => format!("settings.html#section={}", s),
                None => "settings.html".to_string(),
            };

            let builder = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url.into()))
                .title("BorgDock — Settings")
                .inner_size(DEFAULT_W, DEFAULT_H)
                .min_inner_size(MIN_W, MIN_H)
                .decorations(false)
                .resizable(true)
                .skip_taskbar(false)
                .shadow(true)
                .center()
                .visible(false);

            let win = builder.build().map_err(|e| e.to_string())?;

            crate::platform::window_geometry::persist_window_geometry(&app, &win, "settings");

            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
