use crate::agent_overview::types::CwdInfo;
use serde::Deserialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// How many lines of a session's `.jsonl` to scan looking for `cwd` /
/// `gitBranch`. Real claude jsonls put the first cwd line at line 3, but a
/// few extra lines of margin are cheap.
const JSONL_FALLBACK_LINE_LIMIT: usize = 30;

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

/// Resolve a session id by walking `~/.claude/projects/*/sessions-index.json`,
/// then falling back to scanning `*/<session-id>.jsonl` (which Claude writes
/// for every live session, with cwd/gitBranch fields on each turn line).
/// Returns None if neither source matches.
pub fn resolve_cwd(session_id: &str, cache: &CwdCache, projects_root: &Path) -> Option<CwdInfo> {
    if let Some(hit) = cache.get(session_id) {
        return Some(hit);
    }
    if let Some(info) = lookup_in_index(session_id, projects_root) {
        cache.put(session_id.into(), info.clone());
        return Some(info);
    }
    if let Some(info) = lookup_in_jsonl(session_id, projects_root) {
        cache.put(session_id.into(), info.clone());
        return Some(info);
    }
    None
}

fn lookup_in_index(session_id: &str, projects_root: &Path) -> Option<CwdInfo> {
    // Normalize backslashes — the `glob` crate's pattern syntax treats `\`
    // as an escape character.
    let pattern = format!(
        "{}/*/sessions-index.json",
        projects_root.display().to_string().replace('\\', "/"),
    );
    for path in glob::glob(&pattern).ok()?.flatten() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(idx) = serde_json::from_str::<SessionsIndex>(&content) {
                if let Some(entry) = idx.entries.into_iter().find(|e| e.session_id == session_id) {
                    return Some(CwdInfo {
                        repo: derive_repo_name(&entry.project_path),
                        worktree: derive_worktree_name(&entry.project_path),
                        branch: entry.git_branch,
                        cwd: entry.project_path,
                    });
                }
            }
        }
    }
    None
}

fn lookup_in_jsonl(session_id: &str, projects_root: &Path) -> Option<CwdInfo> {
    let pattern = format!(
        "{}/*/{session_id}.jsonl",
        projects_root.display().to_string().replace('\\', "/"),
    );
    for path in glob::glob(&pattern).ok()?.flatten() {
        if let Some(info) = read_first_cwd_line(&path) {
            return Some(info);
        }
    }
    None
}

/// Scan the first N lines of a `.jsonl` for the first JSON object that has a
/// non-empty `cwd` field. Tolerates malformed lines.
fn read_first_cwd_line(path: &Path) -> Option<CwdInfo> {
    #[derive(Debug, Deserialize)]
    struct LineProbe {
        #[serde(default)]
        cwd: Option<String>,
        #[serde(rename = "gitBranch", default)]
        git_branch: Option<String>,
    }
    let f = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(f);
    for line in reader.lines().take(JSONL_FALLBACK_LINE_LIMIT) {
        let Ok(line) = line else { continue };
        let Ok(probe) = serde_json::from_str::<LineProbe>(&line) else { continue };
        let Some(cwd) = probe.cwd.filter(|s| !s.is_empty()) else { continue };
        let cwd_path = PathBuf::from(&cwd);
        return Some(CwdInfo {
            repo: derive_repo_name(&cwd_path),
            worktree: derive_worktree_name(&cwd_path),
            branch: probe.git_branch.unwrap_or_default(),
            cwd: cwd_path,
        });
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

    /// Live sessions don't yet appear in `sessions-index.json` — that file is
    /// only updated periodically and at session end. The fallback must read
    /// `<session-id>.jsonl` directly so live sessions get a real cwd/branch
    /// instead of the `unknown / ?` stub.
    #[test]
    fn resolves_session_id_from_jsonl_when_index_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("D--FSP-Horizon");
        fs::create_dir_all(&proj).unwrap();
        let lines = [
            r#"{"type":"last-prompt","sessionId":"uuid-live"}"#,
            r#"{"type":"permission-mode","permissionMode":"bypassPermissions","sessionId":"uuid-live"}"#,
            r#"{"type":"attachment","cwd":"D:\\FSP-Horizon","sessionId":"uuid-live","gitBranch":"feat/ortec","version":"2.1.126"}"#,
        ];
        fs::write(proj.join("uuid-live.jsonl"), lines.join("\n")).unwrap();

        let cache = CwdCache::default();
        let info = resolve_cwd("uuid-live", &cache, tmp.path())
            .expect("expected jsonl fallback to succeed");
        assert_eq!(info.cwd, PathBuf::from("D:\\FSP-Horizon"));
        assert_eq!(info.branch, "feat/ortec");
        assert_eq!(info.repo, "FSP-Horizon");
        assert_eq!(info.worktree, "master");
        assert!(cache.get("uuid-live").is_some(), "result should be cached");
    }

    /// If a malformed line precedes the good one, the resolver shouldn't bail.
    #[test]
    fn jsonl_fallback_skips_malformed_and_partial_lines() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--proj");
        fs::create_dir_all(&proj).unwrap();
        let lines = [
            "{not json",
            r#"{"type":"meta","sessionId":"sid"}"#,
            r#"{"type":"x","cwd":"E:\\proj","gitBranch":"main","sessionId":"sid"}"#,
        ];
        fs::write(proj.join("sid.jsonl"), lines.join("\n")).unwrap();

        let info = resolve_cwd("sid", &CwdCache::default(), tmp.path()).unwrap();
        assert_eq!(info.cwd, PathBuf::from("E:\\proj"));
        assert_eq!(info.branch, "main");
    }

    /// sessions-index.json should win when both sources have data — it's
    /// already parsed once, the jsonl fallback is the expensive scan path.
    #[test]
    fn jsonl_fallback_does_not_run_when_index_has_entry() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--proj");
        fs::create_dir_all(&proj).unwrap();
        let idx = serde_json::json!({
            "entries": [{
                "sessionId": "sid",
                "projectPath": "E:\\\\proj",
                "gitBranch": "master"
            }]
        });
        fs::write(proj.join("sessions-index.json"), serde_json::to_string(&idx).unwrap()).unwrap();
        fs::write(
            proj.join("sid.jsonl"),
            r#"{"cwd":"E:\\different","gitBranch":"feature","sessionId":"sid"}"#,
        )
        .unwrap();

        let info = resolve_cwd("sid", &CwdCache::default(), tmp.path()).unwrap();
        assert_eq!(info.branch, "master");
        assert_eq!(info.cwd, PathBuf::from("E:\\proj"));
    }
}
