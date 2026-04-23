use serde::Serialize;

use super::hidden_command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WorktreeStatus {
    Clean,
    Dirty,
    Conflict,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub branch_name: String,
    pub is_main_worktree: bool,
    pub status: WorktreeStatus,
    pub uncommitted_count: u32,
    pub ahead: u32,
    pub behind: u32,
    pub commit_sha: String,
}

fn run_git(working_dir: &str, args: &[&str]) -> Result<String, String> {
    let output = hidden_command("git")
        .args(args)
        .current_dir(working_dir)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "git {} failed (exit {}): {}",
            args.join(" "),
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn get_worktree_status(worktree_path: &str) -> (WorktreeStatus, u32) {
    let output = run_git(worktree_path, &["status", "--porcelain=v1"]);
    match output {
        Ok(text) => {
            let lines: Vec<&str> = text.lines().filter(|l| !l.is_empty()).collect();
            if lines.is_empty() {
                return (WorktreeStatus::Clean, 0);
            }
            let has_conflict = lines.iter().any(|l| {
                let bytes = l.as_bytes();
                // UU, AA, DD, AU, UA, DU, UD indicate conflicts
                bytes.len() >= 2
                    && matches!(
                        (bytes[0], bytes[1]),
                        (b'U', _) | (_, b'U') | (b'A', b'A') | (b'D', b'D')
                    )
            });
            let count = lines.len() as u32;
            if has_conflict {
                (WorktreeStatus::Conflict, count)
            } else {
                (WorktreeStatus::Dirty, count)
            }
        }
        Err(_) => (WorktreeStatus::Clean, 0),
    }
}

fn get_ahead_behind(worktree_path: &str) -> (u32, u32) {
    // git rev-list --left-right --count HEAD...@{upstream}
    let output = run_git(
        worktree_path,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    );
    match output {
        Ok(text) => {
            let parts: Vec<&str> = text.trim().split('\t').collect();
            if parts.len() == 2 {
                let ahead = parts[0].parse().unwrap_or(0);
                let behind = parts[1].parse().unwrap_or(0);
                (ahead, behind)
            } else {
                (0, 0)
            }
        }
        Err(_) => (0, 0), // No upstream
    }
}

fn get_head_sha(worktree_path: &str) -> String {
    run_git(worktree_path, &["rev-parse", "--short=7", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn parse_worktree_list(output: &str) -> Vec<(String, String, bool)> {
    if output.trim().is_empty() {
        return Vec::new();
    }

    let mut result = Vec::new();
    let blocks: Vec<&str> = output.split("\n\n").collect();
    let mut is_first = true;

    for block in blocks {
        if block.trim().is_empty() {
            continue;
        }

        let mut path: Option<String> = None;
        let mut branch: Option<String> = None;
        let mut is_bare = false;

        for line in block.lines() {
            let line = line.trim();
            if let Some(p) = line.strip_prefix("worktree ") {
                path = Some(p.trim().to_string());
            } else if let Some(b) = line.strip_prefix("branch refs/heads/") {
                branch = Some(b.trim().to_string());
            } else if line == "bare" {
                is_bare = true;
            }
        }

        if let Some(p) = path {
            if !is_bare {
                result.push((p, branch.unwrap_or_default(), is_first));
            }
        }

        is_first = false;
    }

    result
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeEntry {
    pub path: String,
    pub branch_name: String,
    pub is_main_worktree: bool,
}

/// Lightweight worktree list — only path + branch, no per-worktree git status/ahead-behind/sha.
/// Use this when you only need to find a worktree by branch name (e.g. before launching Claude).
#[tauri::command]
pub async fn list_worktrees_bare(base_path: String) -> Result<Vec<WorktreeEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let output = run_git(&base_path, &["worktree", "list", "--porcelain"])?;
        let entries = parse_worktree_list(&output);
        Ok(entries
            .into_iter()
            .map(|(path, branch_name, is_main)| WorktreeEntry {
                path,
                branch_name,
                is_main_worktree: is_main,
            })
            .collect())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn list_worktrees(base_path: String) -> Result<Vec<WorktreeInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let output = run_git(&base_path, &["worktree", "list", "--porcelain"])?;
        let entries = parse_worktree_list(&output);

        let worktrees: Vec<WorktreeInfo> = entries
            .into_iter()
            .map(|(path, branch_name, is_main)| {
                let (status, uncommitted_count) = get_worktree_status(&path);
                let (ahead, behind) = get_ahead_behind(&path);
                let commit_sha = get_head_sha(&path);

                WorktreeInfo {
                    path,
                    branch_name,
                    is_main_worktree: is_main,
                    status,
                    uncommitted_count,
                    ahead,
                    behind,
                    commit_sha,
                }
            })
            .collect();

        Ok(worktrees)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn create_worktree(
    base_path: String,
    subfolder: String,
    branch_name: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        // Fetch only the specific branch tip (skip tags for speed)
        let _ = run_git(&base_path, &["fetch", "--no-tags", "--depth", "1", "origin", &branch_name]);

        let worktree_dir = std::path::Path::new(&base_path).join(&subfolder);
        std::fs::create_dir_all(&worktree_dir)
            .map_err(|e| format!("Failed to create worktree directory: {e}"))?;

        let sanitized = sanitize_branch_name(&branch_name);
        let worktree_path = worktree_dir.join(&sanitized);
        let worktree_path_str = worktree_path.to_string_lossy().to_string();

        // If directory already exists, pull latest
        if worktree_path.exists() {
            let _ = run_git(
                &worktree_path_str,
                &[
                    "checkout",
                    "-B",
                    &branch_name,
                    &format!("origin/{branch_name}"),
                ],
            );
            let _ = run_git(&worktree_path_str, &["pull", "--ff-only"]);
            return Ok(worktree_path_str);
        }

        // Create new worktree with tracking branch
        run_git(
            &base_path,
            &[
                "worktree",
                "add",
                "-B",
                &branch_name,
                &worktree_path_str,
                &format!("origin/{branch_name}"),
            ],
        )?;

        Ok(worktree_path_str)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn remove_worktree(base_path: String, worktree_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        run_git(&base_path, &["worktree", "remove", &worktree_path])?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn open_in_terminal(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            // Try Windows Terminal first, fall back to cmd
            if hidden_command("wt.exe")
                .args(["-d", &path])
                .spawn()
                .is_err()
            {
                hidden_command("cmd")
                    .args(["/c", "start", "cmd", "/k", &format!("cd /d {path}")])
                    .spawn()
                    .map_err(|e| format!("Failed to open terminal: {e}"))?;
            }
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .args(["-a", "Terminal", &path])
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {e}"))?;
        }
        #[cfg(target_os = "linux")]
        {
            // Try common terminals
            if hidden_command("xdg-terminal")
                .current_dir(&path)
                .spawn()
                .is_err()
            {
                hidden_command("x-terminal-emulator")
                    .current_dir(&path)
                    .spawn()
                    .map_err(|e| format!("Failed to open terminal: {e}"))?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn open_in_editor(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        hidden_command("code")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open editor: {e}"))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

fn sanitize_branch_name(name: &str) -> String {
    let mut s: String = name.replace('/', "-");
    s.retain(|c| !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\\'));
    // Collapse multiple dashes
    while s.contains("--") {
        s = s.replace("--", "-");
    }
    s.trim_matches(|c| c == '-' || c == '.').to_string()
}
