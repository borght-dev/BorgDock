//! Tauri commands for workstream files. Every one is async and does its file
//! I/O on a blocking thread, never inline on the GUI thread.

use super::storage::{self, CopyReport, TrashedWorkstream, WorkstreamFile, WriteOutcome};
use std::path::PathBuf;

/// The sync folder keeps workstreams in a folder of their own.
const SYNC_SUBFOLDER: &str = "BorgDock Workstreams";

/// The folder workstreams live in: a folder of their own inside the sync
/// folder when one is set in settings, else the app's own data folder.
fn folder_of(folder: Option<String>) -> PathBuf {
    match folder.filter(|f| !f.trim().is_empty()) {
        Some(folder) => PathBuf::from(folder.trim()).join(SYNC_SUBFOLDER),
        None => crate::app_data::directory().join("workstreams"),
    }
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}

/// The folder workstreams are kept in for `folder` (the sync folder, or none).
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_folder_path(folder: Option<String>) -> Result<String, String> {
    Ok(folder_of(folder).to_string_lossy().to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_list(folder: Option<String>) -> Result<Vec<WorkstreamFile>, String> {
    blocking(move || storage::list(&folder_of(folder))).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_read(folder: Option<String>, file_name: String) -> Result<String, String> {
    blocking(move || storage::read(&folder_of(folder), &file_name)).await
}

/// Write a workstream over `expected_revision`; `None` creates it.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_write(
    folder: Option<String>,
    id: String,
    contents: String,
    expected_revision: Option<u32>,
) -> Result<WriteOutcome, String> {
    blocking(move || {
        storage::write(
            &folder_of(folder),
            &id,
            &contents,
            expected_revision.map(u64::from),
        )
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_trash(folder: Option<String>, file_name: String) -> Result<(), String> {
    blocking(move || storage::trash(&folder_of(folder), &file_name)).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_trashed(folder: Option<String>) -> Result<Vec<TrashedWorkstream>, String> {
    blocking(move || storage::trashed(&folder_of(folder))).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_restore(folder: Option<String>, id: String) -> Result<(), String> {
    blocking(move || storage::restore(&folder_of(folder), &id)).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_restore_backup(folder: Option<String>, id: String) -> Result<(), String> {
    blocking(move || storage::restore_backup(&folder_of(folder), &id)).await
}

/// The computer's name: what a new device is called until it is renamed.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_device_name() -> Result<String, String> {
    blocking(|| {
        let name = std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .ok()
            .filter(|n| !n.trim().is_empty())
            .or_else(|| {
                crate::git::hidden_command("hostname")
                    .output()
                    .ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                    .filter(|n| !n.is_empty())
            })
            .unwrap_or_else(|| "This computer".to_string());
        Ok(name)
    })
    .await
}

/// Copy every workstream of `from` into `to` (each a sync folder or none,
/// for this machine's own folder). A workstream both hold in different
/// versions lands as a copy named after `device`, offered for merging.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_copy_into(
    from: Option<String>,
    to: Option<String>,
    device: String,
) -> Result<CopyReport, String> {
    blocking(move || storage::copy_into(&folder_of(from), &folder_of(to), &device)).await
}

/// An import is a workstream file, not anything bigger.
const IMPORT_LIMIT: u64 = 4 * 1024 * 1024;

/// Write an exported workstream to the file the user picked.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_export_file(path: String, contents: String) -> Result<(), String> {
    blocking(move || std::fs::write(&path, contents).map_err(|e| e.to_string())).await
}

/// Read a workstream file the user picked to import.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn workstreams_import_file(path: String) -> Result<String, String> {
    blocking(move || {
        let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if size > IMPORT_LIMIT {
            return Err("That file is too big to be a workstream.".to_string());
        }
        std::fs::read_to_string(&path).map_err(|e| e.to_string())
    })
    .await
}
