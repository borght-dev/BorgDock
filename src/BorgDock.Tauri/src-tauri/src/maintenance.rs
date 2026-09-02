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
    let Ok(rd) = std::fs::read_dir(p) else {
        return 0;
    };
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
pub async fn clear_cache(state: State<'_, PrCache>) -> Result<CacheClearResult, String> {
    let conn_handle = state.conn.clone();
    tokio::task::spawn_blocking(move || {
        let path = cache_db_path()?;
        let bytes = if path.exists() {
            std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        // Drop the open SQLite connection so the file isn't locked on Windows.
        {
            let mut lock = conn_handle.lock().unwrap_or_else(|p| p.into_inner());
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
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn get_cache_size() -> Result<u64, String> {
    tokio::task::spawn_blocking(|| {
        let path = cache_db_path()?;
        Ok(if path.exists() {
            std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

// ─── reset_all_settings ───────────────────────────────────────────────────

#[tauri::command]
pub async fn reset_all_settings(app: tauri::AppHandle) -> Result<(), String> {
    let svc = "borgdock";

    // Keychain + file I/O off the async runtime threads.
    tokio::task::spawn_blocking(move || {
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
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

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

// ─── run_self_test ───────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfTestResult {
    pub service: String,
    pub ok: bool,
    pub message: String,
}

#[tauri::command]
pub async fn run_self_test() -> Result<Vec<SelfTestResult>, String> {
    let mut out = Vec::new();

    // GitHub: try gh CLI token, then validate it.
    let gh_result = (|| async {
        let token = crate::auth::gh_cli_token(None)
            .await
            .map_err(|e| format!("gh CLI not available: {e}"))?;
        crate::auth::validate_pat(token).await?;
        Ok::<_, String>(())
    })()
    .await;
    out.push(match gh_result {
        Ok(()) => SelfTestResult {
            service: "GitHub".into(),
            ok: true,
            message: "Authenticated via gh CLI".into(),
        },
        Err(e) => SelfTestResult {
            service: "GitHub".into(),
            ok: false,
            message: e,
        },
    });

    // Azure DevOps: check whether az CLI is available (subprocess, off-thread).
    let ado_available = crate::auth::ado::az_cli_available().await;
    out.push(SelfTestResult {
        service: "Azure DevOps".into(),
        ok: ado_available,
        message: if ado_available {
            "az CLI on PATH".into()
        } else {
            "az CLI not found — install Azure CLI or use a PAT".into()
        },
    });

    // Cache: check whether the SQLite db exists.
    let cache_ok = dirs::config_dir()
        .map(|d| d.join("BorgDock").join("prcache.db").exists())
        .unwrap_or(false);
    out.push(SelfTestResult {
        service: "Cache".into(),
        ok: cache_ok,
        message: if cache_ok {
            "Cache database present".into()
        } else {
            "Cache will be initialized on next launch".into()
        },
    });

    Ok(out)
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
