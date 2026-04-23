use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => {
            log::info!(
                "updater: current={} latest={}",
                update.current_version,
                update.version
            );
            Ok(Some(UpdateInfo {
                version: update.version.clone(),
                body: update.body.clone(),
            }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;

    let progress_handle = app.clone();
    let finish_handle = app.clone();

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
                let _ = progress_handle.emit("update-download-progress", payload);
            },
            move || {
                let _ = finish_handle.emit(
                    "update-download-progress",
                    serde_json::json!({ "event": "Finished" }),
                );
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
