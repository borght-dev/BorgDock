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
