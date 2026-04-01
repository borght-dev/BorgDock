use std::path::PathBuf;
use serde::Deserialize;
use tauri::{Emitter, Manager};
use tauri_winrt_notification::{IconCrop, Toast};

#[derive(Deserialize, Clone)]
pub struct NotificationButton {
    pub label: String,
    pub action: String,
}

fn app_icon_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path: PathBuf = app.path().resource_dir().ok()?.join("icons").join("icon.png");
    if path.exists() { Some(path) } else { None }
}

#[tauri::command]
pub fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    pr_owner: Option<String>,
    pr_repo: Option<String>,
    pr_number: Option<u32>,
    buttons: Option<Vec<NotificationButton>>,
) -> Result<(), String> {
    let app_id = app.config().identifier.clone();

    let mut toast = Toast::new(&app_id)
        .title(&title)
        .text1(&body);

    if let Some(icon) = app_icon_path(&app) {
        toast = toast.icon(&icon, IconCrop::Square, "PRDock");
    }

    // Add action buttons
    if let Some(ref buttons) = buttons {
        for btn in buttons {
            toast = toast.add_button(&btn.label, &btn.action);
        }
    }

    // Handle activation (toast body click or button click)
    let owner = pr_owner.unwrap_or_default();
    let repo = pr_repo.unwrap_or_default();
    let number = pr_number.unwrap_or(0);

    if !owner.is_empty() && !repo.is_empty() && number > 0 {
        let app_handle = app.clone();
        toast = toast.on_activated(move |action_arg| {
            let action = action_arg.unwrap_or_else(|| "open".to_string());
            let payload = serde_json::json!({
                "action": action,
                "owner": owner,
                "repo": repo,
                "number": number,
            });
            let _ = app_handle.emit("notification-action", payload);
            Ok(())
        });
    }

    toast.show().map_err(|e| format!("Notification failed: {e}"))
}
