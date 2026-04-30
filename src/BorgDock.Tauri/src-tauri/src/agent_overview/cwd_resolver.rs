use crate::agent_overview::types::CwdInfo;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Debug, Deserialize)]
struct SessionsIndex {
    #[serde(default)]
    entries: Vec<SessionsIndexEntry>,
}

#[derive(Debug, Deserialize, Clone)]
struct SessionsIndexEntry {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "projectPath")]
    project_path: PathBuf,
    #[serde(rename = "gitBranch", default)]
    git_branch: String,
}

#[derive(Default, Clone)]
pub struct CwdCache {
    map: Arc<Mutex<HashMap<String, CwdInfo>>>,
}

impl CwdCache {
    pub fn get(&self, sid: &str) -> Option<CwdInfo> {
        self.map.lock().ok().and_then(|m| m.get(sid).cloned())
    }
    pub fn put(&self, sid: String, info: CwdInfo) {
        if let Ok(mut m) = self.map.lock() {
            m.insert(sid, info);
        }
    }
}

/// Resolve a session id by walking `~/.claude/projects/*/sessions-index.json`.
/// Returns None if no entry matches; caller decides whether to defer or stub.
pub fn resolve_cwd(session_id: &str, cache: &CwdCache, projects_root: &Path) -> Option<CwdInfo> {
    if let Some(hit) = cache.get(session_id) {
        return Some(hit);
    }
    let pattern = format!("{}/*/sessions-index.json", projects_root.display());
    for path in glob::glob(&pattern).ok()?.flatten() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(idx) = serde_json::from_str::<SessionsIndex>(&content) {
                if let Some(entry) = idx.entries.into_iter().find(|e| e.session_id == session_id) {
                    let info = CwdInfo {
                        repo: derive_repo_name(&entry.project_path),
                        worktree: derive_worktree_name(&entry.project_path),
                        branch: entry.git_branch,
                        cwd: entry.project_path,
                    };
                    cache.put(session_id.into(), info.clone());
                    return Some(info);
                }
            }
        }
    }
    None
}

/// Repo name = last segment of the path that looks like a repo root.
/// We treat the leaf if no `.worktrees` parent, else the grandparent.
pub fn derive_repo_name(path: &Path) -> String {
    let parts: Vec<&std::ffi::OsStr> = path.iter().collect();
    for (i, p) in parts.iter().enumerate().rev() {
        if p.eq_ignore_ascii_case(".worktrees") && i > 0 {
            return parts[i - 1].to_string_lossy().into_owned();
        }
    }
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unknown".into())
}

pub fn derive_worktree_name(path: &Path) -> String {
    let parts: Vec<&std::ffi::OsStr> = path.iter().collect();
    for (i, p) in parts.iter().enumerate() {
        if p.eq_ignore_ascii_case(".worktrees") && i + 1 < parts.len() {
            return parts[i + 1].to_string_lossy().into_owned();
        }
    }
    "master".into()
}

/// Default location of `~/.claude/projects` for the current OS user.
pub fn default_projects_root() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn derive_repo_and_worktree_for_master() {
        let p = PathBuf::from("/c/src/borgdock");
        assert_eq!(derive_repo_name(&p), "borgdock");
        assert_eq!(derive_worktree_name(&p), "master");
    }

    #[test]
    fn derive_repo_and_worktree_for_worktree() {
        let p = PathBuf::from("/c/src/borgdock/.worktrees/wt2");
        assert_eq!(derive_repo_name(&p), "borgdock");
        assert_eq!(derive_worktree_name(&p), "wt2");
    }

    #[test]
    fn resolves_session_id_from_fake_projects_tree() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--BorgDock");
        fs::create_dir_all(&proj).unwrap();
        let idx = serde_json::json!({
            "version": 1,
            "entries": [{
                "sessionId": "uuid-1",
                "projectPath": "E:\\\\BorgDock",
                "gitBranch": "master",
                "fileMtime": 0,
                "messageCount": 1,
                "modified": "2026-04-30T00:00:00Z"
            }]
        });
        fs::write(proj.join("sessions-index.json"), serde_json::to_string(&idx).unwrap()).unwrap();

        let cache = CwdCache::default();
        let info = resolve_cwd("uuid-1", &cache, tmp.path()).unwrap();
        assert_eq!(info.branch, "master");
        assert_eq!(info.cwd, PathBuf::from("E:\\BorgDock"));
        assert!(cache.get("uuid-1").is_some());

        // Second call returns the cached value (we delete the file to verify)
        fs::remove_file(proj.join("sessions-index.json")).unwrap();
        assert!(resolve_cwd("uuid-1", &cache, tmp.path()).is_some());
    }
}
