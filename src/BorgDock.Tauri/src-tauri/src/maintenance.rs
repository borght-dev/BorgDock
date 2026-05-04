//! Maintenance commands invoked from the Settings → Maintenance section:
//! - `clear_cache`: drop the SQLite cache DB so it rebuilds on next use.
//! - `get_cache_size`: report current cache file size for the UI.
//! - `reset_all_settings`: wipe settings file + every keychain entry, then
//!   restart the app so the user lands fresh in the setup wizard.
//! - `estimate_worktree_prune_size`: sum sizes of caller-supplied prune
//!   candidate paths (called from the frontend after it computes which
//!   worktrees are orphaned/closed).

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

use crate::cache::PrCache;

// ─── helpers ──────────────────────────────────────────────────────────────

fn cache_db_path() -> Result<PathBuf, String> {
    Ok(dirs::config_dir()
        .ok_or("could not determine config dir")?
        .join("BorgDock")
        .join("prcache.db"))
}

/// Returns the settings.json path.
/// NOTE: `settings::settings_path()` and `settings::settings_dir()` are
/// private (non-pub) in settings/mod.rs so they cannot be called here.
/// Duplicating the path logic is intentional; if that helper is ever made
/// pub(crate), switch this to call it.
fn settings_file_path() -> Result<PathBuf, String> {
    Ok(dirs::config_dir()
        .ok_or("could not determine config dir")?
        .join("BorgDock")
        .join("settings.json"))
}

fn dir_size(p: &Path) -> u64 {
    let Ok(rd) = std::fs::read_dir(p) else { return 0 };
    let mut total = 0u64;
    for entry in rd.flatten() {
        let m = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        total += if m.is_dir() {
            dir_size(&entry.path())
        } else {
            m.len()
        };
    }
    total
}

// ─── clear_cache + get_cache_size ─────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheClearResult {
    pub bytes_freed: u64,
}

#[tauri::command]
pub fn clear_cache(state: State<'_, PrCache>) -> Result<CacheClearResult, String> {
    let path = cache_db_path()?;
    let bytes = if path.exists() {
        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    // Drop the open SQLite connection so the file isn't locked on Windows.
    if let Ok(mut lock) = state.conn.lock() {
        *lock = None;
    }

    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to remove cache: {e}"))?;
    }
    // Also clear WAL/SHM siblings that live alongside the main DB
    if let Some(parent) = path.parent() {
        for sibling in &["prcache.db-wal", "prcache.db-shm"] {
            let sp = parent.join(sibling);
            if sp.exists() {
                let _ = std::fs::remove_file(&sp);
            }
        }
    }
    Ok(CacheClearResult { bytes_freed: bytes })
}

#[tauri::command]
pub fn get_cache_size() -> Result<u64, String> {
    let path = cache_db_path()?;
    Ok(if path.exists() {
        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    })
}

// ─── reset_all_settings ───────────────────────────────────────────────────

#[tauri::command]
pub async fn reset_all_settings(app: tauri::AppHandle) -> Result<(), String> {
    let svc = "borgdock";

    // Wipe all known credential entries
    let mut users: Vec<String> = vec![
        "borgdock:github".to_string(),
        "borgdock:azure_devops".to_string(),
        "borgdock:claude_api".to_string(),
    ];
    if let Ok(s) = crate::settings::load_settings_internal() {
        for c in &s.sql.connections {
            users.push(format!("borgdock:sql:{}", c.name));
        }
    }
    for user in &users {
        if let Ok(entry) = keyring::Entry::new(svc, user) {
            let _ = entry.delete_credential();
        }
    }

    // Drop settings file
    let settings_path = settings_file_path()?;
    if settings_path.exists() {
        std::fs::remove_file(&settings_path)
            .map_err(|e| format!("Failed to remove settings: {e}"))?;
    }

    // Restart so onboarding flow runs
    app.restart();
}

// ─── estimate_worktree_prune_size ─────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PruneEstimate {
    pub count: u32,
    pub bytes: u64,
}

#[tauri::command]
pub async fn estimate_worktree_prune_size(paths: Vec<String>) -> Result<PruneEstimate, String> {
    let result = tokio::task::spawn_blocking(move || {
        let mut bytes = 0u64;
        let mut count = 0u32;
        for p in &paths {
            let pb = PathBuf::from(p);
            if pb.is_dir() {
                bytes += dir_size(&pb);
                count += 1;
            }
        }
        PruneEstimate { count, bytes }
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    Ok(result)
}

// ─── tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn dir_size_sums_files_recursively() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"hello").unwrap();
        std::fs::create_dir(dir.path().join("nested")).unwrap();
        std::fs::write(dir.path().join("nested/b.txt"), b"world!").unwrap();
        assert_eq!(dir_size(dir.path()), 11); // 5 + 6
    }

    #[test]
    fn dir_size_returns_zero_for_missing_path() {
        let phantom = std::path::PathBuf::from("/nonexistent/path/here");
        assert_eq!(dir_size(&phantom), 0);
    }
}
