//! Tauri commands for the notes vault. Every one is async and does its file
//! I/O on a blocking thread, never inline on the GUI thread.

use super::storage::{self, NoteContent, NoteFile, NoteWriteOutcome};
use std::path::PathBuf;

/// The sync folder keeps notes in a folder of their own, next to
/// `BorgDock Workstreams`.
const SYNC_SUBFOLDER: &str = "BorgDock Notes";

/// The vault: a folder of its own inside the sync folder when one is set in
/// settings, else the app's own data folder.
fn folder_of(folder: Option<String>) -> PathBuf {
    match folder.filter(|f| !f.trim().is_empty()) {
        Some(folder) => PathBuf::from(folder.trim()).join(SYNC_SUBFOLDER),
        None => crate::app_data::directory().join("notes"),
    }
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}

/// The vault folder for `folder` (the sync folder, or none).
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn notes_folder_path(folder: Option<String>) -> Result<String, String> {
    Ok(folder_of(folder).to_string_lossy().to_string())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn notes_list(folder: Option<String>) -> Result<Vec<NoteFile>, String> {
    blocking(move || storage::list(&folder_of(folder))).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn notes_read_many(
    folder: Option<String>,
    paths: Vec<String>,
) -> Result<Vec<NoteContent>, String> {
    blocking(move || Ok(storage::read_many(&folder_of(folder), &paths))).await
}

/// Write a note over `base`, the text last read; `None` creates it.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn notes_write(
    folder: Option<String>,
    path: String,
    contents: String,
    base: Option<String>,
) -> Result<NoteWriteOutcome, String> {
    blocking(move || storage::write(&folder_of(folder), &path, &contents, base.as_deref())).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn notes_rename(folder: Option<String>, from: String, to: String) -> Result<(), String> {
    blocking(move || storage::rename(&folder_of(folder), &from, &to)).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn notes_trash(folder: Option<String>, path: String) -> Result<(), String> {
    blocking(move || storage::trash(&folder_of(folder), &path)).await
}
