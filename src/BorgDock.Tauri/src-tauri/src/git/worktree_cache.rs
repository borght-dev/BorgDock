//! Process-wide cache of every configured repo's worktree list.
//!
//! Modelled on `platform::flyout_cache`: Tauri-managed state that any window
//! can read instantly via `worktree_cache_get_all`, refreshed by
//! `worktree_cache_refresh` (per-repo concurrent `git worktree list`) which
//! then broadcasts the new snapshot as a `worktrees-updated` event to every
//! window. The main window's `useWorktreeMap` and the worktree palette both
//! subscribe to that event instead of running their own git polling.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use super::remote_worktree::list_remote_worktrees;
use super::worktree::{list_worktrees_bare_sync, natural_cmp, WorktreeEntry};

/// Event broadcast to all windows after every refresh. Payload: `WorktreeSnapshot`.
pub const WORKTREES_UPDATED_EVENT: &str = "worktrees-updated";

/// Background revalidation cadence. Worktrees change rarely; create/remove
/// paths refresh explicitly, so this only catches out-of-band `git worktree`
/// usage from a terminal.
const BACKGROUND_REFRESH_INTERVAL: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedRepoRef {
    pub owner: String,
    pub name: String,
    pub base_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote: Option<RemoteWorktreeRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteWorktreeRef {
    pub id: String,
    pub label: String,
    pub ssh_target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedRepoWorktrees {
    pub repo: CachedRepoRef,
    /// Sorted: main worktree first, then natural path order.
    pub entries: Vec<WorktreeEntry>,
    /// Unix epoch milliseconds of the scan that produced `entries`.
    pub fetched_at: u64,
    /// Set when the last scan for this repo failed; `entries` then holds the
    /// previous successful result (or is empty on a cold cache).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Snapshot handed to the frontend: one item per enabled repo with a base
/// path, sorted by `owner/name` then base path.
pub type WorktreeSnapshot = Vec<CachedRepoWorktrees>;

#[derive(Default)]
pub struct WorktreeCache {
    /// Keyed by repo base path.
    repos: Arc<Mutex<HashMap<String, CachedRepoWorktrees>>>,
    /// Coalesces overlapping refreshes: a second caller while one is in
    /// flight gets the current snapshot; the in-flight one will emit.
    refreshing: Arc<AtomicBool>,
}

impl WorktreeCache {
    pub fn snapshot(&self) -> WorktreeSnapshot {
        let map = match self.repos.lock() {
            Ok(m) => m,
            Err(poisoned) => poisoned.into_inner(),
        };
        let mut items: Vec<CachedRepoWorktrees> = map.values().cloned().collect();
        sort_snapshot(&mut items);
        items
    }
}

fn sort_snapshot(items: &mut [CachedRepoWorktrees]) {
    items.sort_by(|a, b| {
        let ka = snapshot_sort_key(&a.repo);
        let kb = snapshot_sort_key(&b.repo);
        natural_cmp(&ka, &kb).then_with(|| natural_cmp(&a.repo.base_path, &b.repo.base_path))
    });
}

fn snapshot_sort_key(repo: &CachedRepoRef) -> String {
    match &repo.remote {
        Some(remote) => format!("1/{}/{}", remote.label, repo.name),
        None => format!("0/{}/{}", repo.owner, repo.name),
    }
}

/// Main worktree first, then natural order on path. `parse_worktree_list`
/// already emits this order; re-applied here so the cache never depends on it.
pub fn sort_entries(entries: &mut [WorktreeEntry]) {
    entries.sort_by(|a, b| {
        b.is_main_worktree
            .cmp(&a.is_main_worktree)
            .then_with(|| natural_cmp(&a.path, &b.path))
    });
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Instant snapshot of the cache — never touches git.
#[tauri::command]
pub fn worktree_cache_get_all(
    state: tauri::State<'_, WorktreeCache>,
) -> Result<WorktreeSnapshot, String> {
    Ok(state.snapshot())
}

/// Re-scan every enabled repo concurrently, store, broadcast, and return the
/// fresh snapshot.
#[tauri::command]
pub async fn worktree_cache_refresh(app: AppHandle) -> Result<WorktreeSnapshot, String> {
    refresh_all(&app).await
}

/// Fire-and-forget refresh for internal callers that hold an `AppHandle`
/// (create/checkout/remove worktree commands).
pub fn refresh_in_background(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = refresh_all(&app).await {
            log::warn!("worktree cache refresh failed: {e}");
        }
    });
}

/// Startup entry point: one immediate refresh, then a slow periodic one.
pub async fn start_background_refresh(app: AppHandle) {
    if let Err(e) = refresh_all(&app).await {
        log::warn!("worktree cache initial refresh failed: {e}");
    }
    loop {
        tokio::time::sleep(BACKGROUND_REFRESH_INTERVAL).await;
        if let Err(e) = refresh_all(&app).await {
            log::warn!("worktree cache periodic refresh failed: {e}");
        }
    }
}

/// Refresh every enabled repo with a worktree base path. Repos removed from
/// settings are dropped from the cache. Emits `worktrees-updated` to all
/// windows with the new snapshot.
pub async fn refresh_all(app: &AppHandle) -> Result<WorktreeSnapshot, String> {
    let cache = app.state::<WorktreeCache>();

    if cache
        .refreshing
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        log::debug!("worktree cache refresh already in flight; returning current snapshot");
        return Ok(cache.snapshot());
    }
    let refreshing = cache.refreshing.clone();
    let repos_state = cache.repos.clone();
    let result = refresh_inner(app, &repos_state).await;
    refreshing.store(false, Ordering::Release);
    result
}

async fn refresh_inner(
    app: &AppHandle,
    repos_state: &Arc<Mutex<HashMap<String, CachedRepoWorktrees>>>,
) -> Result<WorktreeSnapshot, String> {
    let t0 = std::time::Instant::now();
    let settings = tokio::task::spawn_blocking(crate::settings::load_settings_internal)
        .await
        .map_err(|e| format!("Task join error: {e}"))??;

    let targets: Vec<CachedRepoRef> = settings
        .repos
        .iter()
        .filter(|r| r.enabled && !r.worktree_base_path.trim().is_empty())
        .map(|r| CachedRepoRef {
            owner: r.owner.clone(),
            name: r.name.clone(),
            base_path: r.worktree_base_path.clone(),
            remote: None,
        })
        .collect();

    let remote_targets: Vec<_> = settings
        .remote_worktree_repos
        .iter()
        .filter(|r| r.enabled && !r.ssh_target.trim().is_empty() && !r.base_path.trim().is_empty())
        .cloned()
        .collect();

    let mut set = tokio::task::JoinSet::new();
    for repo in targets.iter().cloned() {
        set.spawn_blocking(move || {
            let scanned = list_worktrees_bare_sync(&repo.base_path);
            let key = format!("local:{}", repo.base_path);
            (key, repo, scanned)
        });
    }
    for remote_repo in remote_targets.iter().cloned() {
        set.spawn_blocking(move || {
            let id = if remote_repo.id.trim().is_empty() {
                format!("{}:{}", remote_repo.ssh_target, remote_repo.base_path)
            } else {
                remote_repo.id.clone()
            };
            let repo = CachedRepoRef {
                owner: remote_repo.owner.clone(),
                name: remote_repo.name.clone(),
                base_path: remote_repo.base_path.clone(),
                remote: Some(RemoteWorktreeRef {
                    id: id.clone(),
                    label: remote_repo.label.clone(),
                    ssh_target: remote_repo.ssh_target.clone(),
                }),
            };
            let scanned = list_remote_worktrees(&remote_repo);
            let key = format!("remote:{id}:{}", repo.base_path);
            (key, repo, scanned)
        });
    }

    let mut scanned: Vec<(String, CachedRepoRef, Result<Vec<WorktreeEntry>, String>)> = Vec::new();
    while let Some(joined) = set.join_next().await {
        match joined {
            Ok(item) => scanned.push(item),
            Err(e) => log::warn!("worktree scan task failed: {e}"),
        }
    }

    let snapshot = {
        let mut map = match repos_state.lock() {
            Ok(m) => m,
            Err(poisoned) => poisoned.into_inner(),
        };
        let mut keep: std::collections::HashSet<String> = targets
            .iter()
            .map(|r| format!("local:{}", r.base_path))
            .collect();
        keep.extend(remote_targets.iter().map(|r| {
            let id = if r.id.trim().is_empty() {
                format!("{}:{}", r.ssh_target, r.base_path)
            } else {
                r.id.clone()
            };
            format!("remote:{id}:{}", r.base_path)
        }));
        map.retain(|k, _| keep.contains(k));

        let fetched_at = now_ms();
        for (key, repo, result) in scanned {
            match result {
                Ok(mut entries) => {
                    sort_entries(&mut entries);
                    map.insert(
                        key,
                        CachedRepoWorktrees {
                            repo,
                            entries,
                            fetched_at,
                            error: None,
                        },
                    );
                }
                Err(err) => {
                    log::warn!("worktree scan failed for {}: {err}", repo.base_path);
                    let entry = map.entry(key).or_insert_with(|| CachedRepoWorktrees {
                        repo: repo.clone(),
                        entries: Vec::new(),
                        fetched_at,
                        error: None,
                    });
                    entry.repo = repo;
                    entry.error = Some(err);
                }
            }
        }

        let mut items: Vec<CachedRepoWorktrees> = map.values().cloned().collect();
        sort_snapshot(&mut items);
        items
    };

    log::info!(
        "worktree cache refreshed: {} repo(s), {} worktree(s) in {:?}",
        snapshot.len(),
        snapshot.iter().map(|r| r.entries.len()).sum::<usize>(),
        t0.elapsed()
    );

    if let Err(e) = app.emit(WORKTREES_UPDATED_EVENT, &snapshot) {
        log::warn!("emit {WORKTREES_UPDATED_EVENT} failed: {e}");
    }
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wt(path: &str, main: bool) -> WorktreeEntry {
        WorktreeEntry {
            path: path.to_string(),
            branch_name: String::new(),
            is_main_worktree: main,
        }
    }

    #[test]
    fn sort_entries_pins_main_then_natural() {
        let mut v = vec![
            wt("D:/r/.worktrees/worktree10", false),
            wt("D:/r/.worktrees/worktree2", false),
            wt("D:/r", true),
            wt("D:/r/.worktrees/worktree1", false),
        ];
        sort_entries(&mut v);
        let paths: Vec<&str> = v.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                "D:/r",
                "D:/r/.worktrees/worktree1",
                "D:/r/.worktrees/worktree2",
                "D:/r/.worktrees/worktree10"
            ]
        );
    }

    #[test]
    fn snapshot_sorted_by_repo_key() {
        let cache = WorktreeCache::default();
        {
            let mut m = cache.repos.lock().unwrap();
            for (owner, name, base) in [("z", "zeta", "D:/z"), ("a", "alpha", "E:/a")] {
                m.insert(
                    base.to_string(),
                    CachedRepoWorktrees {
                        repo: CachedRepoRef {
                            owner: owner.into(),
                            name: name.into(),
                            base_path: base.into(),
                            remote: None,
                        },
                        entries: vec![],
                        fetched_at: 0,
                        error: None,
                    },
                );
            }
        }
        let snap = cache.snapshot();
        assert_eq!(snap[0].repo.owner, "a");
        assert_eq!(snap[1].repo.owner, "z");
    }
}
