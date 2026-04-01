use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
}

/// Resolve a GitHub token from gh CLI or settings PAT.
fn resolve_github_token() -> Option<String> {
    if let Ok(token) = crate::auth::gh_cli_token() {
        return Some(token);
    }
    if let Ok(settings) = crate::settings::load_settings() {
        if let Some(pat) = settings.git_hub.personal_access_token {
            if !pat.trim().is_empty() {
                return Some(pat);
            }
        }
    }
    None
}

/// Build an Updater, adding an auth header if a GitHub token is available.
fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder();

    if let Some(token) = resolve_github_token() {
        builder = builder
            .header("Authorization", format!("token {token}"))
            .map_err(|e| e.to_string())?;
    }

    builder.build().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = build_updater(&app)?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfo {
            version: update.version.clone(),
            body: update.body.clone(),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    let updater = build_updater(&app)?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;

    let handle = app.clone();
    let on_finish = {
        let handle = app.clone();
        move || {
            let _ = handle.emit(
                "update-download-progress",
                serde_json::json!({ "event": "Finished" }),
            );
        }
    };

    update
        .download_and_install(
            move |chunk_length, content_length| {
                let payload = serde_json::json!({
                    "event": "Progress",
                    "data": {
                        "chunkLength": chunk_length,
                        "contentLength": content_length
                    }
                });
                let _ = handle.emit("update-download-progress", payload);
            },
            on_finish,
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
