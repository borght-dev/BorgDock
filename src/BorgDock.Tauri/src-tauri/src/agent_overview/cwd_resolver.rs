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

/// Repo name resolution, in priority order:
///   1. If the path is inside `<repo>/.worktrees/<name>`, return `<repo>` (the
///      segment before `.worktrees`). This must come first because worktree
///      checkouts have their own `.git` file inside, which would otherwise
///      cause the next rule to return the worktree directory instead.
///   2. Walk ancestors looking for a `.git` entry (directory or file). The
///      directory containing it is the repo root; return its leaf name.
///   3. Fall back to the path's leaf segment when no git root is reachable.
pub fn derive_repo_name(path: &Path) -> String {
    let parts: Vec<&std::ffi::OsStr> = path.iter().collect();
    for (i, p) in parts.iter().enumerate().rev() {
        if p.eq_ignore_ascii_case(".worktrees") && i > 0 {
            return parts[i - 1].to_string_lossy().into_owned();
        }
    }
    if let Some(root) = find_git_root(path) {
        if let Some(name) = root.file_name() {
            return name.to_string_lossy().into_owned();
        }
    }
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unknown".into())
}

/// Walk the path's ancestors looking for a directory or file named `.git`.
/// Returns the directory containing it (the repo root) or None.
fn find_git_root(path: &Path) -> Option<PathBuf> {
    for ancestor in path.ancestors() {
        if ancestor.join(".git").exists() {
            return Some(ancestor.to_path_buf());
        }
    }
    None
}

/// Public re-export — settings_merge needs git roots to overlay
/// `.claude/settings.json` on each project that has one.
pub fn find_git_root_for(path: &Path) -> Option<PathBuf> {
    find_git_root(path)
}

/// Read the first JSONL line of a Claude session log that has a `cwd` field.
/// Returns the absolute cwd path or None on parse/read failure.
pub fn read_cwd_from_jsonl(path: &Path) -> Option<PathBuf> {
    read_first_cwd_line(path).map(|info| info.cwd)
}

/// Glob `<projects_root>/*/<session_id>.jsonl`, find the most recent
/// assistant message in the file, and return its concatenated text blocks.
/// Returns None if no assistant message exists yet or all blocks are
/// non-text (thinking / tool_use only).
pub fn read_last_assistant_message(projects_root: &Path, session_id: &str) -> Option<String> {
    let pattern = format!(
        "{}/*/{session_id}.jsonl",
        projects_root.display().to_string().replace('\\', "/"),
    );
    for path in glob::glob(&pattern).ok()?.flatten() {
        if let Some(msg) = read_last_assistant_text_from_file(&path) {
            return Some(msg);
        }
    }
    None
}

fn read_last_assistant_text_from_file(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    // Walk lines from the end so we find the LAST assistant message.
    for line in content.lines().rev() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        if value.get("type").and_then(|v| v.as_str()) != Some("assistant") {
            continue;
        }
        let content = value.get("message").and_then(|m| m.get("content"));
        let text = match content {
            Some(serde_json::Value::String(s)) => s.clone(),
            Some(serde_json::Value::Array(blocks)) => {
                let mut out = String::new();
                for b in blocks {
                    if b.get("type").and_then(|v| v.as_str()) == Some("text") {
                        if let Some(t) = b.get("text").and_then(|v| v.as_str()) {
                            if !out.is_empty() {
                                out.push_str("\n");
                            }
                            out.push_str(t);
                        }
                    }
                }
                out
            }
            _ => continue,
        };
        if text.trim().is_empty() {
            continue;
        }
        return Some(text);
    }
    None
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

    /// A session's cwd is often a sub-directory of the repo (e.g. `BorgDock/design`,
    /// `BorgDock/src/BorgDock.Tauri`). Without git-root awareness, both would be
    /// listed under separate "design" / "BorgDock.Tauri" pseudo-repos in the
    /// dashboard. Walking ancestors for a `.git` entry resolves them all to the
    /// real repo name.
    #[test]
    fn derive_repo_name_uses_git_root_for_subdirectory() {
        let tmp = tempfile::tempdir().unwrap();
        let repo_root = tmp.path().join("BorgDock");
        let nested = repo_root.join("src").join("BorgDock.Tauri");
        fs::create_dir_all(&nested).unwrap();
        fs::create_dir_all(repo_root.join(".git")).unwrap();

        assert_eq!(derive_repo_name(&nested), "BorgDock");
        assert_eq!(derive_repo_name(&repo_root.join("design")), "BorgDock");
        assert_eq!(derive_repo_name(&repo_root), "BorgDock");
    }

    /// Some repos use `.git` as a *file* (e.g. submodules, worktrees registered
    /// the modern way) — not a directory. The walker must accept either.
    #[test]
    fn derive_repo_name_accepts_dotgit_as_file() {
        let tmp = tempfile::tempdir().unwrap();
        let repo_root = tmp.path().join("alpha");
        let nested = repo_root.join("nested");
        fs::create_dir_all(&nested).unwrap();
        fs::write(repo_root.join(".git"), "gitdir: ../bare/.git").unwrap();
        assert_eq!(derive_repo_name(&nested), "alpha");
    }

    /// Worktree paths still resolve via the `.worktrees/<name>` rule even
    /// when a git root might exist higher up.
    #[test]
    fn derive_repo_name_worktree_rule_takes_precedence() {
        let tmp = tempfile::tempdir().unwrap();
        let repo_root = tmp.path().join("BorgDock");
        let wt = repo_root.join(".worktrees").join("feature");
        fs::create_dir_all(&wt).unwrap();
        fs::create_dir_all(repo_root.join(".git")).unwrap();
        assert_eq!(derive_repo_name(&wt), "BorgDock");
        assert_eq!(derive_worktree_name(&wt), "feature");
    }

    /// When no `.git` exists in any ancestor (e.g. a session opened in /tmp),
    /// fall back to the leaf segment so the dashboard still has *something*.
    #[test]
    fn derive_repo_name_falls_back_to_leaf_when_no_git_ancestor() {
        let tmp = tempfile::tempdir().unwrap();
        let leaf = tmp.path().join("loose-folder").join("inside");
        fs::create_dir_all(&leaf).unwrap();
        assert_eq!(derive_repo_name(&leaf), "inside");
    }

    /// Real Claude jsonls store assistant messages as `{type:"assistant",
    /// message:{content:[{type:"text",text:"..."}, {type:"thinking",...}]}}`.
    /// We must extract only the user-visible text blocks, never thinking,
    /// and return the LATEST assistant message (so a card showing "Awaiting
    /// input" can display the question Claude is waiting for an answer to).
    #[test]
    fn read_last_assistant_message_extracts_text_blocks_only() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--proj");
        fs::create_dir_all(&proj).unwrap();
        let lines = [
            r#"{"type":"meta","sessionId":"sid"}"#,
            r#"{"type":"user","message":{"role":"user","content":"hi"}}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"first reply"}]}}"#,
            r#"{"type":"user","message":{"role":"user","content":"more"}}"#,
            // Newer assistant message has thinking AND text — only text should be returned.
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"hidden CoT"},{"type":"text","text":"Question: pick A, B, or C?"}]}}"#,
            r#"{"type":"file-history-snapshot"}"#,
        ];
        fs::write(proj.join("sid.jsonl"), lines.join("\n")).unwrap();

        let msg = read_last_assistant_message(tmp.path(), "sid").unwrap();
        assert_eq!(msg, "Question: pick A, B, or C?");
    }

    /// When the latest "assistant" entry only has tool_use / thinking blocks
    /// (no user-visible text), fall back to the prior text reply.
    #[test]
    fn read_last_assistant_message_falls_back_when_latest_has_no_text() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--proj");
        fs::create_dir_all(&proj).unwrap();
        let lines = [
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"keep me"}]}}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","id":"a"}]}}"#,
        ];
        fs::write(proj.join("sid.jsonl"), lines.join("\n")).unwrap();
        let msg = read_last_assistant_message(tmp.path(), "sid").unwrap();
        assert_eq!(msg, "keep me");
    }

    #[test]
    fn read_last_assistant_message_returns_none_when_no_assistant_messages() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--proj");
        fs::create_dir_all(&proj).unwrap();
        fs::write(
            proj.join("sid.jsonl"),
            r#"{"type":"user","message":{"role":"user","content":"hi"}}"#,
        )
        .unwrap();
        assert!(read_last_assistant_message(tmp.path(), "sid").is_none());
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
