use std::path::PathBuf;
use tauri::Manager;
use tauri_winrt_notification::{IconCrop, Toast};

fn app_icon_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path: PathBuf = app.path().resource_dir().ok()?.join("icons").join("icon.png");
    if path.exists() { Some(path) } else { None }
}

#[tauri::command]
pub fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    let app_id = app.config().identifier.clone();

    let mut toast = Toast::new(&app_id)
        .title(&title)
        .text1(&body);

    if let Some(icon) = app_icon_path(&app) {
        toast = toast.icon(&icon, IconCrop::Square, "PRDock");
    }

    toast.show().map_err(|e| format!("Notification failed: {e}"))
}
