use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::hidden_command;

/// Cached default-branch lookup keyed by repo toplevel (as returned by
/// `git rev-parse --show-toplevel`). Filled the first time we ask for the
/// `mergeBaseDefault` baseline in a given worktree.
fn default_branch_cache() -> &'static Mutex<HashMap<PathBuf, String>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffOutput {
    /// Unified-diff text from git. Empty if the file is unchanged vs the
    /// baseline.
    pub patch: String,
    /// Human-readable label for the baseline actually used (e.g. "HEAD" or
    /// "master"). Empty when `in_repo` is false.
    pub baseline_ref: String,
    /// `false` when the file is not inside a git working tree, so the UI can
    /// disable the diff toggles instead of showing a misleading error.
    pub in_repo: bool,
}

fn run_git_raw(working_dir: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    hidden_command("git")
        .args(args)
        .current_dir(working_dir)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))
}

fn run_git_capture(working_dir: &Path, args: &[&str]) -> Result<String, String> {
    let output = run_git_raw(working_dir, args)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "git {} failed (exit {}): {}",
            args.join(" "),
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn working_dir_for(path: &Path) -> PathBuf {
    if path.is_file() {
        path.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        path.to_path_buf()
    }
}

fn repo_toplevel(dir: &Path) -> Option<PathBuf> {
    run_git_capture(dir, &["rev-parse", "--show-toplevel"])
        .ok()
        .map(PathBuf::from)
}

fn resolve_default_branch(toplevel: &Path) -> Result<String, String> {
    {
        let cache = default_branch_cache().lock().unwrap();
        if let Some(branch) = cache.get(toplevel) {
            return Ok(branch.clone());
        }
    }

    // `origin/HEAD` is a symbolic-ref pointing at the default branch on the
    // remote. Some clones never set it; fall back to `main` / `master` in
    // that case.
    let resolved = run_git_capture(
        toplevel,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    )
    .ok()
    .and_then(|s| s.strip_prefix("origin/").map(|r| r.to_string()))
    .or_else(|| {
        for candidate in ["main", "master"] {
            let ok = run_git_capture(
                toplevel,
                &["rev-parse", "--verify", &format!("origin/{candidate}")],
            )
            .is_ok();
            if ok {
                return Some(candidate.to_string());
            }
        }
        None
    })
    .ok_or_else(|| "could not determine default branch".to_string())?;

    default_branch_cache()
        .lock()
        .unwrap()
        .insert(toplevel.to_path_buf(), resolved.clone());
    Ok(resolved)
}

#[tauri::command]
pub async fn git_file_diff(path: String, baseline: String) -> Result<FileDiffOutput, String> {
    tokio::task::spawn_blocking(move || compute_diff(&path, &baseline))
        .await
        .map_err(|e| format!("task join error: {e}"))?
}

fn compute_diff(path: &str, baseline: &str) -> Result<FileDiffOutput, String> {
    let abs = PathBuf::from(path);
    let dir = working_dir_for(&abs);

    let toplevel = match repo_toplevel(&dir) {
        Some(t) => t,
        None => {
            return Ok(FileDiffOutput {
                patch: String::new(),
                baseline_ref: String::new(),
                in_repo: false,
            });
        }
    };

    let (revision, label) = match baseline {
        "HEAD" => ("HEAD".to_string(), "HEAD".to_string()),
        "mergeBaseDefault" => {
            let default_branch = resolve_default_branch(&toplevel)?;
            let remote_ref = format!("origin/{default_branch}");
            let merge_base = run_git_capture(&toplevel, &["merge-base", "HEAD", &remote_ref])?;
            (merge_base, default_branch)
        }
        other => return Err(format!("unknown baseline: {other}")),
    };

    let abs_str = abs.to_string_lossy().to_string();
    let output = run_git_raw(
        &dir,
        &["diff", "--no-color", &revision, "--", &abs_str],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "git diff failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }

    let patch = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(FileDiffOutput {
        patch,
        baseline_ref: label,
        in_repo: true,
    })
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Copy, Clone, Debug)]
pub enum NameStatusMode {
    /// `git status --porcelain=v1 -z` — records begin with two status bytes + space + path.
    /// Renames produce two records: `"R  new_path"` then `"old_path"`.
    Status,
    /// `git diff --name-status -z` — records begin with a single status letter + NUL + path.
    /// Renames/copies produce three records: `"R100"` / `"C90"` then old_path then new_path.
    Diff,
}

/// Parse `git diff --numstat -z` output into a path → (additions, deletions) map.
///
/// Plain rows: "<add>\t<del>\t<path>\0".
/// Rename rows: "<add>\t<del>\t\0<old_path>\0<new_path>\0" (the path field is empty
///   immediately after the second tab, then the next two NUL-records carry the
///   old and new paths).
/// Binary files: "-\t-\t<path>" — counted as 0/0.
pub fn parse_numstat(bytes: &[u8]) -> std::collections::HashMap<String, (u32, u32)> {
    let mut out = std::collections::HashMap::new();
    let records: Vec<&[u8]> = bytes.split(|b| *b == 0).collect();
    let mut i = 0;
    while i < records.len() {
        let rec = records[i];
        if rec.is_empty() {
            i += 1;
            continue;
        }
        // Parse "<add>\t<del>\t<rest>" out of the leading record.
        let parts: Vec<&[u8]> = rec.splitn(3, |b| *b == b'\t').collect();
        if parts.len() < 3 {
            i += 1;
            continue;
        }
        let parse_count = |b: &[u8]| -> u32 {
            std::str::from_utf8(b).ok()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0)
        };
        let add = parse_count(parts[0]);
        let del = parse_count(parts[1]);
        let trailing = parts[2];
        if trailing.is_empty() {
            // Rename: next two records are old, new.
            let new_path = records.get(i + 2)
                .map(|b| String::from_utf8_lossy(b).to_string())
                .unwrap_or_default();
            if !new_path.is_empty() {
                out.insert(new_path, (add, del));
            }
            i += 3;
        } else {
            let path = String::from_utf8_lossy(trailing).to_string();
            out.insert(path, (add, del));
            i += 1;
        }
    }
    out
}

pub fn parse_name_status(bytes: &[u8], mode: NameStatusMode) -> Vec<ChangedFile> {
    let mut out = Vec::new();
    // Split on NUL; trailing NUL produces an empty last element which we skip.
    let records: Vec<&[u8]> = bytes
        .split(|b| *b == 0)
        .filter(|r| !r.is_empty())
        .collect();

    let mut i = 0;
    while i < records.len() {
        match mode {
            NameStatusMode::Status => {
                let rec = records[i];
                if rec.len() < 3 {
                    i += 1;
                    continue;
                }
                let x = rec[0] as char;
                let y = rec[1] as char;
                // Two-byte code; "?? " means untracked, "R  " means renamed.
                // Status letter priority: index side (X) except untracked (?/?) → '?'.
                let status_char = if x == '?' && y == '?' {
                    '?'
                } else if x != ' ' {
                    x
                } else {
                    y
                };
                let path = String::from_utf8_lossy(&rec[3..]).to_string();
                if status_char == 'R' || status_char == 'C' {
                    // Next record is the old path.
                    let old = records
                        .get(i + 1)
                        .map(|b| String::from_utf8_lossy(b).to_string());
                    out.push(ChangedFile {
                        path,
                        status: status_char.to_string(),
                        old_path: old,
                        additions: 0,
                        deletions: 0,
                    });
                    i += 2;
                } else {
                    out.push(ChangedFile {
                        path,
                        status: status_char.to_string(),
                        old_path: None,
                        additions: 0,
                        deletions: 0,
                    });
                    i += 1;
                }
            }
            NameStatusMode::Diff => {
                let rec = records[i];
                if rec.is_empty() {
                    i += 1;
                    continue;
                }
                let status_char = rec[0] as char;
                if status_char == 'R' || status_char == 'C' {
                    // Three records: "R100" / "C90", old, new.
                    let old = records
                        .get(i + 1)
                        .map(|b| String::from_utf8_lossy(b).to_string());
                    let new_path = records
                        .get(i + 2)
                        .map(|b| String::from_utf8_lossy(b).to_string())
                        .unwrap_or_default();
                    out.push(ChangedFile {
                        path: new_path,
                        status: status_char.to_string(),
                        old_path: old,
                        additions: 0,
                        deletions: 0,
                    });
                    i += 3;
                } else {
                    // Two records: status, path.
                    let path = records
                        .get(i + 1)
                        .map(|b| String::from_utf8_lossy(b).to_string())
                        .unwrap_or_default();
                    out.push(ChangedFile {
                        path,
                        status: status_char.to_string(),
                        old_path: None,
                        additions: 0,
                        deletions: 0,
                    });
                    i += 2;
                }
            }
        }
    }
    out
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFilesOutput {
    pub local: Vec<ChangedFile>,
    pub vs_base: Vec<ChangedFile>,
    pub base_ref: String,
    pub in_repo: bool,
}

#[tauri::command]
pub async fn git_changed_files(root: String) -> Result<ChangedFilesOutput, String> {
    tokio::task::spawn_blocking(move || compute_changed_files(&root))
        .await
        .map_err(|e| format!("task join error: {e}"))?
}

fn compute_changed_files(root: &str) -> Result<ChangedFilesOutput, String> {
    let root_path = PathBuf::from(root);
    let dir = working_dir_for(&root_path);

    let toplevel = match repo_toplevel(&dir) {
        Some(t) => t,
        None => {
            return Ok(ChangedFilesOutput {
                local: Vec::new(),
                vs_base: Vec::new(),
                base_ref: String::new(),
                in_repo: false,
            });
        }
    };

    // 1. Local: `git status --porcelain=v1 -z`
    let status_out = run_git_raw(
        &toplevel,
        &["status", "--porcelain=v1", "-z"],
    )?;
    if !status_out.status.success() {
        return Err(format!(
            "git status failed (exit {}): {}",
            status_out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&status_out.stderr).trim()
        ));
    }
    let local = parse_name_status(&status_out.stdout, NameStatusMode::Status);

    // 2. vs base: merge-base against origin/<default>, then `git diff --name-status -z`.
    //    If default branch cannot be resolved (detached, no origin/HEAD, etc.),
    //    skip vs_base gracefully.
    let (vs_base, base_ref) = match resolve_default_branch(&toplevel) {
        Ok(branch) => {
            let remote_ref = format!("origin/{branch}");
            match run_git_capture(&toplevel, &["merge-base", "HEAD", &remote_ref]) {
                Ok(merge_base) => {
                    let diff_out = run_git_raw(
                        &toplevel,
                        &[
                            "diff",
                            "--name-status",
                            "-z",
                            &format!("{merge_base}..HEAD"),
                        ],
                    )?;
                    if !diff_out.status.success() {
                        (Vec::new(), branch)
                    } else {
                        let all = parse_name_status(&diff_out.stdout, NameStatusMode::Diff);
                        // Dedup: drop any path already in `local`.
                        let local_paths: std::collections::HashSet<&str> =
                            local.iter().map(|f| f.path.as_str()).collect();
                        let filtered: Vec<ChangedFile> = all
                            .into_iter()
                            .filter(|f| !local_paths.contains(f.path.as_str()))
                            .collect();
                        (filtered, branch)
                    }
                }
                Err(_) => (Vec::new(), branch),
            }
        }
        Err(_) => (Vec::new(), String::new()),
    };

    Ok(ChangedFilesOutput {
        local,
        vs_base,
        base_ref,
        in_repo: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    /// Run a git subcommand in `tmp`, asserting success and surfacing stderr
    /// on failure. Shared by `init_test_repo` and the `changed_files_*` tests.
    fn git_in(tmp: &std::path::Path, args: &[&str]) {
        let out = Command::new("git")
            .args(args)
            .current_dir(tmp)
            .output()
            .expect("git");
        assert!(
            out.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&out.stderr)
        );
    }

    fn init_test_repo(tmp: &std::path::Path) {
        git_in(tmp, &["init", "-q", "-b", "master"]);
        git_in(tmp, &["config", "user.email", "t@test"]);
        git_in(tmp, &["config", "user.name", "t"]);
        // Fake origin/master so resolve_default_branch can find it.
        fs::write(tmp.join("seed.txt"), "seed").unwrap();
        git_in(tmp, &["add", "."]);
        git_in(tmp, &["commit", "-q", "-m", "seed"]);
        git_in(tmp, &["update-ref", "refs/remotes/origin/master", "HEAD"]);
        // Set origin/HEAD so resolve_default_branch's first lookup succeeds.
        git_in(
            tmp,
            &["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/master"],
        );
    }

    #[test]
    fn changed_files_reports_local_and_vs_base() {
        let tmp = tempfile::tempdir().unwrap();
        init_test_repo(tmp.path());

        // Commit a file "committed.ts" on a new branch → should land in vsBase.
        git_in(tmp.path(), &["checkout", "-qb", "feature"]);
        fs::write(tmp.path().join("committed.ts"), "x").unwrap();
        git_in(tmp.path(), &["add", "."]);
        git_in(tmp.path(), &["commit", "-qm", "committed"]);

        // Uncommitted: one modified + one untracked.
        fs::write(tmp.path().join("seed.txt"), "modified").unwrap();
        fs::write(tmp.path().join("untracked.ts"), "u").unwrap();

        let result = compute_changed_files(tmp.path().to_string_lossy().as_ref())
            .expect("compute_changed_files");
        assert!(result.in_repo);
        assert_eq!(result.base_ref, "master");

        let local_paths: Vec<&str> = result.local.iter().map(|f| f.path.as_str()).collect();
        assert!(local_paths.contains(&"seed.txt"));
        assert!(local_paths.contains(&"untracked.ts"));

        let vs_base_paths: Vec<&str> = result.vs_base.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(vs_base_paths, vec!["committed.ts"]);
    }

    #[test]
    fn changed_files_dedups_locally_modified_from_vs_base() {
        let tmp = tempfile::tempdir().unwrap();
        init_test_repo(tmp.path());

        git_in(tmp.path(), &["checkout", "-qb", "feature"]);
        fs::write(tmp.path().join("both.ts"), "a").unwrap();
        git_in(tmp.path(), &["add", "."]);
        git_in(tmp.path(), &["commit", "-qm", "both"]);

        // Now modify "both.ts" locally without committing.
        fs::write(tmp.path().join("both.ts"), "a2").unwrap();

        let result = compute_changed_files(tmp.path().to_string_lossy().as_ref()).unwrap();
        // Appears only in local; dedup removed from vs_base.
        assert!(result.local.iter().any(|f| f.path == "both.ts"));
        assert!(result.vs_base.iter().all(|f| f.path != "both.ts"));
    }

    #[test]
    fn changed_files_returns_not_in_repo_for_plain_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let result = compute_changed_files(tmp.path().to_string_lossy().as_ref()).unwrap();
        assert!(!result.in_repo);
        assert_eq!(result.local.len(), 0);
        assert_eq!(result.vs_base.len(), 0);
    }

    #[test]
    fn parses_status_mode_plain_modification() {
        let bytes = b" M src/foo.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Status);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/foo.ts");
        assert_eq!(files[0].status, "M");
        assert!(files[0].old_path.is_none());
    }

    #[test]
    fn parses_status_mode_untracked() {
        let bytes = b"?? src/new.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Status);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/new.ts");
        assert_eq!(files[0].status, "?");
    }

    #[test]
    fn parses_status_mode_rename_two_records() {
        let bytes = b"R  new.ts\0old.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Status);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "new.ts");
        assert_eq!(files[0].status, "R");
        assert_eq!(files[0].old_path.as_deref(), Some("old.ts"));
    }

    #[test]
    fn parses_status_mode_multiple_files() {
        let bytes = b" M a.ts\0?? b.ts\0D  c.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Status);
        assert_eq!(files.len(), 3);
        assert_eq!(files[0].status, "M");
        assert_eq!(files[1].status, "?");
        assert_eq!(files[2].status, "D");
    }

    #[test]
    fn parses_diff_mode_plain_modification() {
        let bytes = b"M\0src/foo.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/foo.ts");
        assert_eq!(files[0].status, "M");
    }

    #[test]
    fn parses_diff_mode_rename_three_records() {
        let bytes = b"R100\0old.ts\0new.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "new.ts");
        assert_eq!(files[0].status, "R");
        assert_eq!(files[0].old_path.as_deref(), Some("old.ts"));
    }

    #[test]
    fn parses_diff_mode_deletion() {
        let bytes = b"D\0gone.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "gone.ts");
        assert_eq!(files[0].status, "D");
    }

    #[test]
    fn parse_handles_empty_input() {
        assert_eq!(parse_name_status(b"", NameStatusMode::Status).len(), 0);
        assert_eq!(parse_name_status(b"", NameStatusMode::Diff).len(), 0);
    }

    #[test]
    fn parses_numstat_plain_modification() {
        let bytes = b"14\t6\tsrc/foo.ts\0";
        let map = parse_numstat(bytes);
        let stats = map.get("src/foo.ts").expect("present");
        assert_eq!(stats.0, 14);
        assert_eq!(stats.1, 6);
    }

    #[test]
    fn parses_numstat_rename_three_records() {
        // Renames in -z mode: "<add>\t<del>\t\0<old>\0<new>\0"
        let bytes = b"5\t2\t\0src/old.ts\0src/new.ts\0";
        let map = parse_numstat(bytes);
        let stats = map.get("src/new.ts").expect("present");
        assert_eq!(stats.0, 5);
        assert_eq!(stats.1, 2);
    }

    #[test]
    fn parses_numstat_binary_uses_zero() {
        // git emits "-\t-\t<path>" for binary files
        let bytes = b"-\t-\timg.png\0";
        let map = parse_numstat(bytes);
        let stats = map.get("img.png").expect("present");
        assert_eq!(stats.0, 0);
        assert_eq!(stats.1, 0);
    }
}
