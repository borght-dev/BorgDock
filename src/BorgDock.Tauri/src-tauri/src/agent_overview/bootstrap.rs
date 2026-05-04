use crate::agent_overview::cwd_resolver::{derive_repo_name, derive_worktree_name};
use crate::agent_overview::store::{short_repo, SessionStore};
use crate::agent_overview::types::{SessionDelta, SessionRecord, SessionState};
use chrono::DateTime;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;

#[derive(Debug, Deserialize)]
struct IndexFile {
    #[serde(default)]
    entries: Vec<IndexEntry>,
}

#[derive(Debug, Deserialize)]
struct IndexEntry {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "projectPath")]
    project_path: PathBuf,
    #[serde(default, rename = "gitBranch")]
    git_branch: String,
    #[serde(default)]
    modified: Option<String>,
}

/// Walk `~/.claude/projects/*/sessions-index.json` and register any session
/// modified within the retention window as `Ended`. Live OTel events will
/// promote those records to live states as soon as they arrive.
pub fn bootstrap_known_sessions(
    projects_root: &Path,
    store: &SessionStore,
    deltas: &UnboundedSender<SessionDelta>,
    retention: Duration,
) -> usize {
    // Same glob normalization as cwd_resolver — backslashes are escape chars.
    let pattern = format!(
        "{}/*/sessions-index.json",
        projects_root.display().to_string().replace('\\', "/"),
    );
    let now_inst = Instant::now();
    let mut counter_per_repo_wt: HashMap<(String, String), u32> = HashMap::new();
    let mut count = 0;

    for path in glob::glob(&pattern).ok().into_iter().flatten().flatten() {
        let content = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("agent_overview: cannot read {}: {e}", path.display());
                continue;
            }
        };
        let idx: IndexFile = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(
                    "agent_overview: malformed sessions-index.json at {}: {e}",
                    path.display(),
                );
                continue;
            }
        };

        for entry in idx.entries {
            // No `modified` field → treat as fresh (we don't know how old it
            // is, so default to including it). Parse failure or pre-boot
            // timestamp → `None`, which we treat as ancient and skip.
            let modified_inst = match entry.modified.as_deref() {
                None => now_inst,
                Some(s) => match parse_iso_to_instant(s) {
                    Some(t) => t,
                    None => continue,
                },
            };
            let age = now_inst.saturating_duration_since(modified_inst);
            if age > retention {
                continue;
            }
            let repo = derive_repo_name(&entry.project_path);
            let worktree = derive_worktree_name(&entry.project_path);
            let key = (repo.clone(), worktree.clone());
            let n = counter_per_repo_wt.entry(key.clone()).or_insert(0);
            *n += 1;
            let label = format!("{} · {} #{}", short_repo(&repo), worktree, *n);

            let rec = SessionRecord {
                session_id: entry.session_id.clone(),
                cwd: entry.project_path.clone(),
                repo,
                worktree,
                branch: entry.git_branch.clone(),
                label,
                state: SessionState::Ended,
                state_since: modified_inst,
                last_event_at: modified_inst,
                last_user_msg: None,
                task: None,
                model: None,
                tokens_used: 0,
                tokens_max: 200_000,
                last_api_stop_reason: None,
                pending_tool_uses: HashSet::new(),
                last_api_request_at: None,
                state_since_ms: 0,
                last_event_ms: 0,
            };
            store.upsert_bootstrap(rec, deltas);
            count += 1;
        }
    }
    count
}

/// Map an ISO-8601 timestamp to an Instant by computing how far in the past
/// it is from `Utc::now()` and subtracting from `Instant::now()`.
///
/// Returns `Some(Instant::now())` for future timestamps (treated as fresh).
/// Returns `None` when the timestamp predates the process's monotonic epoch
/// (older than system boot) — the caller treats `None` as "ancient" and
/// skips the entry, which is the correct filter direction.
fn parse_iso_to_instant(s: &str) -> Option<Instant> {
    let parsed = DateTime::parse_from_rfc3339(s).ok()?;
    let then = parsed.with_timezone(&chrono::Utc);
    let now_sys = chrono::Utc::now();
    let delta = (now_sys - then).num_milliseconds();
    let now_inst = Instant::now();
    if delta <= 0 {
        Some(now_inst)
    } else {
        now_inst.checked_sub(Duration::from_millis(delta as u64))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tokio::sync::mpsc::unbounded_channel;

    #[test]
    fn bootstrap_registers_recent_sessions_only() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--BorgDock");
        fs::create_dir_all(&proj).unwrap();
        let now = chrono::Utc::now();
        let recent = now - chrono::Duration::minutes(30);
        let stale  = now - chrono::Duration::hours(8);
        let idx = serde_json::json!({
            "entries": [
                { "sessionId": "fresh", "projectPath": "E:\\BorgDock", "gitBranch": "master",
                  "modified": recent.to_rfc3339() },
                { "sessionId": "old",   "projectPath": "E:\\BorgDock", "gitBranch": "master",
                  "modified": stale.to_rfc3339() }
            ]
        });
        fs::write(proj.join("sessions-index.json"), idx.to_string()).unwrap();

        let store = SessionStore::default();
        let (tx, _rx) = unbounded_channel();
        let n = bootstrap_known_sessions(tmp.path(), &store, &tx, Duration::from_secs(14_400));
        assert_eq!(n, 1);
        let snap = store.snapshot();
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].session_id, "fresh");
        assert_eq!(snap[0].state, SessionState::Ended);
    }
}
