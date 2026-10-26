use tauri::Manager;
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub fn runtime_visibility(app: tauri::AppHandle) -> bool {
    app.webview_windows().values().any(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
    })
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(test, derive(specta::Type, tauri_specta::Event))]
#[serde(transparent)]
pub struct RuntimeVisibility(pub bool);
