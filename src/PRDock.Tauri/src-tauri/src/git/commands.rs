use serde::Serialize;
use std::path::Path;

use super::hidden_command;

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

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredRepo {
    pub owner: String,
    pub name: String,
    pub local_path: String,
}

#[tauri::command]
pub async fn discover_repos() -> Result<Vec<DiscoveredRepo>, String> {
    tokio::task::spawn_blocking(move || {
        let mut repos = Vec::new();
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;

        // Common directories to scan
        let search_dirs = [
            home.join("source").join("repos"),
            home.join("repos"),
            home.join("projects"),
            home.join("dev"),
            home.join("code"),
            home.join("git"),
            home.join("Documents").join("GitHub"),
        ];

        for search_dir in &search_dirs {
            if !search_dir.is_dir() {
                continue;
            }
            // Scan 2 levels deep
            if let Ok(entries) = std::fs::read_dir(search_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        try_add_repo(&path, &mut repos);
                        // One level deeper
                        if let Ok(sub_entries) = std::fs::read_dir(&path) {
                            for sub_entry in sub_entries.flatten() {
                                let sub_path = sub_entry.path();
                                if sub_path.is_dir() {
                                    try_add_repo(&sub_path, &mut repos);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Deduplicate by owner/name
        repos.sort_by(|a, b| {
            let key_a = format!("{}/{}", a.owner, a.name);
            let key_b = format!("{}/{}", b.owner, b.name);
            key_a.cmp(&key_b)
        });
        repos.dedup_by(|a, b| a.owner == b.owner && a.name == b.name);

        Ok(repos)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

fn try_add_repo(path: &Path, repos: &mut Vec<DiscoveredRepo>) {
    if !path.join(".git").exists() {
        return;
    }
    let path_str = path.to_string_lossy().to_string();
    if let Ok(remote_url) = run_git(&path_str, &["remote", "get-url", "origin"]) {
        if let Some((owner, name)) = parse_github_remote(&remote_url) {
            repos.push(DiscoveredRepo {
                owner,
                name,
                local_path: path_str,
            });
        }
    }
}

fn parse_github_remote(url: &str) -> Option<(String, String)> {
    // Handle HTTPS: https://github.com/owner/repo.git
    // Handle SSH: git@github.com:owner/repo.git
    // Handle Azure DevOps and other remotes too
    let trimmed = url.trim().trim_end_matches(".git");

    if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }

    if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }

    // Generic: try to extract last two path segments as owner/name
    let segments: Vec<&str> = trimmed.rsplit('/').take(2).collect();
    if segments.len() == 2 {
        return Some((segments[1].to_string(), segments[0].to_string()));
    }

    None
}

#[tauri::command]
pub async fn resolve_repo_path(path: String) -> Result<DiscoveredRepo, String> {
    tokio::task::spawn_blocking(move || {
        let p = Path::new(&path);
        if !p.join(".git").exists() {
            return Err("Not a git repository".into());
        }
        let remote_url = run_git(&path, &["remote", "get-url", "origin"])?;
        let (owner, name) = parse_github_remote(&remote_url)
            .ok_or("Could not parse GitHub remote from origin URL")?;
        Ok(DiscoveredRepo {
            owner,
            name,
            local_path: path,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn git_fetch(repo_path: String, remote: Option<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let remote = remote.unwrap_or_else(|| "origin".to_string());
        run_git(&repo_path, &["fetch", &remote])?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn git_checkout(repo_path: String, branch: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        run_git(&repo_path, &["checkout", &branch])?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn git_current_branch(repo_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn run_gh_command(args: Vec<String>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let output = hidden_command("gh")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to run gh: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "gh {} failed (exit {}): {}",
                args.join(" "),
                output.status.code().unwrap_or(-1),
                stderr.trim()
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
