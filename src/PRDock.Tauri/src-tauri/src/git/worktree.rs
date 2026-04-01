use serde::Serialize;

use super::hidden_command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub branch_name: String,
    pub is_main_worktree: bool,
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

fn parse_worktree_list(output: &str) -> Vec<WorktreeInfo> {
    if output.trim().is_empty() {
        return Vec::new();
    }

    let mut worktrees = Vec::new();
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
                worktrees.push(WorktreeInfo {
                    path: p,
                    branch_name: branch.unwrap_or_default(),
                    is_main_worktree: is_first,
                });
            }
        }

        is_first = false;
    }

    worktrees
}

#[tauri::command]
pub async fn list_worktrees(base_path: String) -> Result<Vec<WorktreeInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let output = run_git(&base_path, &["worktree", "list", "--porcelain"])?;
        Ok(parse_worktree_list(&output))
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

fn sanitize_branch_name(name: &str) -> String {
    let mut s: String = name.replace('/', "-");
    s.retain(|c| !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\\'));
    // Collapse multiple dashes
    while s.contains("--") {
        s = s.replace("--", "-");
    }
    s.trim_matches(|c| c == '-' || c == '.').to_string()
}
