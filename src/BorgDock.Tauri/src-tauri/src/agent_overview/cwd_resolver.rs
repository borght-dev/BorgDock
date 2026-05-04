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
                        worktree: worktree_name_for(&entry.project_path, &entry.git_branch),
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
        let branch = probe.git_branch.unwrap_or_default();
        return Some(CwdInfo {
            repo: derive_repo_name(&cwd_path),
            worktree: worktree_name_for(&cwd_path, &branch),
            branch,
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
    let parsed: Vec<serde_json::Value> = content
        .lines()
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .collect();

    // Walk from the end to find the most recent USER-AUTHORED prompt. A
    // `type:"user"` line that carries `tool_result` blocks (Claude writes
    // tool results back as user-role messages) is part of the same turn —
    // skip those so the boundary lands on a real user prompt. A real user
    // prompt has either a plain-string `content`, or an array whose blocks
    // are all `type:"text"`.
    let user_boundary = parsed
        .iter()
        .enumerate()
        .rev()
        .find(|(_, v)| {
            if v.get("type").and_then(|t| t.as_str()) != Some("user") {
                return false;
            }
            let content = match v.get("message").and_then(|m| m.get("content")) {
                Some(c) => c,
                None => return v.get("content").is_some(),
            };
            match content {
                serde_json::Value::String(_) => true,
                serde_json::Value::Array(blocks) => blocks.iter().all(|b| {
                    b.get("type").and_then(|t| t.as_str()) != Some("tool_result")
                }),
                _ => false,
            }
        })
        .map(|(i, _)| i);

    let start = user_boundary.map(|i| i + 1).unwrap_or(0);
    let mut combined = String::new();
    for v in &parsed[start..] {
        if v.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        let content = v.get("message").and_then(|m| m.get("content"));
        let chunk = match content {
            Some(serde_json::Value::String(s)) => s.clone(),
            Some(serde_json::Value::Array(blocks)) => {
                let mut out = String::new();
                for b in blocks {
                    if b.get("type").and_then(|t| t.as_str()) == Some("text") {
                        if let Some(t) = b.get("text").and_then(|t| t.as_str()) {
                            if !out.is_empty() {
                                out.push('\n');
                            }
                            out.push_str(t);
                        }
                    }
                }
                out
            }
            _ => continue,
        };
        if chunk.trim().is_empty() {
            continue;
        }
        if !combined.is_empty() {
            combined.push_str("\n\n");
        }
        combined.push_str(&chunk);
    }
    if combined.trim().is_empty() {
        None
    } else {
        Some(combined)
    }
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

/// Worktree resolution that incorporates the resolved git branch:
///   1. If the cwd is inside `<repo>/.worktrees/<name>`, use `<name>`.
///   2. Else, if a non-empty branch was resolved (from sessions-index.json
///      or the .jsonl), use the branch name as the worktree label. This
///      is what splits "BorgDock@master" from "BorgDock@feat/x" in the
///      dashboard, even when both checkouts live at non-`.worktrees`
///      paths (e.g. side-by-side directories).
///   3. Else fall back to `"master"`.
pub fn worktree_name_for(path: &Path, branch: &str) -> String {
    let parts: Vec<&std::ffi::OsStr> = path.iter().collect();
    for (i, p) in parts.iter().enumerate() {
        if p.eq_ignore_ascii_case(".worktrees") && i + 1 < parts.len() {
            return parts[i + 1].to_string_lossy().into_owned();
        }
    }
    if !branch.is_empty() {
        return branch.to_string();
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

    /// Sessions in the same repo on different branches must NOT collapse into
    /// a single "master" worktree section. Use the resolved gitBranch as the
    /// worktree label whenever the cwd doesn't carry a `.worktrees/<name>`
    /// segment.
    #[test]
    fn worktree_name_for_uses_branch_when_no_dot_worktrees_segment() {
        let p = PathBuf::from("E:\\BorgDock");
        assert_eq!(worktree_name_for(&p, "master"), "master");
        assert_eq!(worktree_name_for(&p, "feat/ortec"), "feat/ortec");
    }

    #[test]
    fn worktree_name_for_dot_worktrees_path_takes_precedence_over_branch() {
        let p = PathBuf::from("E:\\BorgDock\\.worktrees\\wt2");
        // Branch on disk might say something else, but the named worktree
        // directory is the user's chosen label — keep it.
        assert_eq!(worktree_name_for(&p, "feat/x"), "wt2");
    }

    #[test]
    fn worktree_name_for_falls_back_to_master_when_branch_empty() {
        let p = PathBuf::from("E:\\some-folder");
        assert_eq!(worktree_name_for(&p, ""), "master");
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

    /// A single user turn often produces multiple `type:"assistant"` jsonl
    /// lines (text → tool_use → tool_result loop → final text), and the
    /// user wants to see the full response, not just the last paragraph.
    /// Concatenate every assistant text block produced since the most
    /// recent `type:"user"` line.
    #[test]
    fn read_last_assistant_message_concatenates_all_text_since_last_user() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--proj");
        fs::create_dir_all(&proj).unwrap();
        let lines = [
            r#"{"type":"user","message":{"role":"user","content":"earlier"}}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"old reply"}]}}"#,
            r#"{"type":"user","message":{"role":"user","content":"new prompt"}}"#,
            // Multi-step turn: text → tool_use → tool_result → more text.
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"First, I'll look around."}]}}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Read","id":"a"}]}}"#,
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"a"}]}}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Done. Two options:"}]}}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"A. fast\nB. correct"}]}}"#,
        ];
        fs::write(proj.join("sid.jsonl"), lines.join("\n")).unwrap();

        let msg = read_last_assistant_message(tmp.path(), "sid").unwrap();
        // tool_result lines are also `type:"user"` (Claude writes them as
        // user-role responses), but they carry no string user content. The
        // boundary should be the most recent USER-AUTHORED prompt — i.e.
        // the line whose `content` is a plain string. Everything after that
        // assistant-side gets concatenated, in order.
        assert!(msg.contains("First, I'll look around."), "missing first paragraph: {msg:?}");
        assert!(msg.contains("Done. Two options:"), "missing post-tool paragraph: {msg:?}");
        assert!(msg.contains("A. fast"), "missing final paragraph: {msg:?}");
        assert!(!msg.contains("old reply"), "must not include text from prior turn: {msg:?}");
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
        // Worktree label uses the resolved branch when there's no
        // `.worktrees/<name>` segment in the cwd, so two FSP-Horizon
        // checkouts on different branches don't collapse together.
        assert_eq!(info.worktree, "feat/ortec");
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
