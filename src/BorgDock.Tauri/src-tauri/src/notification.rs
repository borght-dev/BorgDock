use serde::Deserialize;

#[derive(Deserialize, Clone)]
pub struct NotificationButton {
    pub label: String,
    pub action: String,
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::path::PathBuf;
    use tauri::{Emitter, Manager};
    use tauri_winrt_notification::{IconCrop, Toast};

    fn app_icon_path(app: &tauri::AppHandle) -> Option<PathBuf> {
        let path: PathBuf = app.path().resource_dir().ok()?.join("icons").join("icon.png");
        if path.exists() { Some(path) } else { None }
    }

    pub fn send(
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
            toast = toast.icon(&icon, IconCrop::Square, "BorgDock");
        }

        if let Some(ref buttons) = buttons {
            for btn in buttons {
                toast = toast.add_button(&btn.label, &btn.action);
            }
        }

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
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    /// Escape a string for safe interpolation into an AppleScript double-quoted string.
    /// Backslashes must be escaped first, then double quotes.
    fn escape_applescript(s: &str) -> String {
        s.replace('\\', "\\\\").replace('"', "\\\"")
    }

    pub fn send(
        _app: tauri::AppHandle,
        title: String,
        body: String,
        _pr_owner: Option<String>,
        _pr_repo: Option<String>,
        _pr_number: Option<u32>,
        _buttons: Option<Vec<NotificationButton>>,
    ) -> Result<(), String> {
        // Use macOS native notification via osascript
        let script = format!(
            "display notification \"{}\" with title \"{}\"",
            escape_applescript(&body),
            escape_applescript(&title),
        );
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| format!("Notification failed: {e}"))?;
        Ok(())
    }
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
    platform::send(app, title, body, pr_owner, pr_repo, pr_number, buttons)
}
