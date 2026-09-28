use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

pub struct PendingUpdate<T> {
    update: Mutex<Option<T>>,
}

impl<T> Default for PendingUpdate<T> {
    fn default() -> Self {
        Self {
            update: Mutex::new(None),
        }
    }
}

impl<T> PendingUpdate<T> {
    fn stage(&self, update: T) {
        *self.update.lock().unwrap() = Some(update);
    }

    fn take(&self) -> Option<T> {
        self.update.lock().unwrap().take()
    }

    fn install_with(&self, install: impl FnOnce(T)) {
        if let Some(update) = self.take() {
            install(update);
        }
    }
}

pub type DownloadedUpdate = (tauri_plugin_updater::Update, Vec<u8>);

pub fn install_pending_update(app: &AppHandle) {
    app.state::<PendingUpdate<DownloadedUpdate>>()
        .install_with(|(update, bytes)| {
            if let Err(error) = update.install(bytes) {
                log::error!("updater: install on exit failed: {error}");
            }
        });
}

#[tauri::command]
pub async fn restart_to_apply_update(app: AppHandle) -> Result<(), String> {
    let pending = app.state::<PendingUpdate<DownloadedUpdate>>();
    let (update, bytes) = pending.take().ok_or("No downloaded update ready")?;
    if let Err(error) = update.install(&bytes) {
        pending.stage((update, bytes));
        return Err(error.to_string());
    }
    app.restart()
}

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
pub async fn download_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate<DownloadedUpdate>>,
) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;

    let progress_handle = app.clone();
    let bytes = update
        .download(
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
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    pending.stage((update, bytes));
    let _ = app.emit(
        "update-download-progress",
        serde_json::json!({ "event": "Finished" }),
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::PendingUpdate;

    #[test]
    fn downloaded_update_waits_until_exit() {
        let pending = PendingUpdate::default();
        pending.stage("verified update");
        let mut installed = Vec::new();

        assert!(installed.is_empty());
        pending.install_with(|update| installed.push(update));
        pending.install_with(|update| installed.push(update));

        assert_eq!(installed, ["verified update"]);
    }
}
