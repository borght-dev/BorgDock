use serde::Serialize;
use std::path::Path;
use std::process::Stdio;

use super::{git_command, hidden_command, output_with_timeout, GIT_TIMEOUT};

fn run_git(working_dir: &str, args: &[&str]) -> Result<String, String> {
    log::info!("git run: cwd={working_dir} args={:?}", args);
    let output = output_with_timeout(
        git_command().args(args).current_dir(working_dir),
        GIT_TIMEOUT,
    )
    .map_err(|e| {
        log::error!(
            "git spawn failed: cwd={working_dir} args={:?} err={e}",
            args
        );
        format!("Failed to run git: {e}")
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let code = output.status.code().unwrap_or(-1);
    log::info!(
        "git done: cwd={working_dir} args={:?} exit={code} stdout={:?} stderr={:?}",
        args,
        stdout.trim(),
        stderr.trim()
    );

    if !output.status.success() {
        return Err(format!(
            "git {} failed (exit {}): {}",
            args.join(" "),
            code,
            stderr.trim()
        ));
    }

    Ok(stdout.trim().to_string())
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
    // Accept HTTPS, ssh:// URLs, and SCP-style remotes whose host is an SSH
    // alias (`git@github-work:owner/repo.git`). The host never belongs in the
    // owner field; only the last two path segments do.
    let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
    let path = if let Some((_, rest)) = trimmed.split_once("://") {
        rest.split_once('/').map(|(_, path)| path).unwrap_or("")
    } else if let Some((host, path)) = trimmed.split_once(':') {
        if host.contains('@') || !host.contains('/') {
            path
        } else {
            trimmed
        }
    } else {
        trimmed
    };

    let segments: Vec<&str> = path.split('/').filter(|part| !part.is_empty()).collect();
    if segments.len() == 2 {
        return Some((segments[0].to_string(), segments[1].to_string()));
    }
    if segments.len() > 2 {
        return Some((
            segments[segments.len() - 2].to_string(),
            segments[segments.len() - 1].to_string(),
        ));
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

fn run_git_verbose(working_dir: &str, args: &[&str]) -> Result<String, String> {
    log::info!("git run: cwd={working_dir} args={:?}", args);
    let output = output_with_timeout(
        git_command().args(args).current_dir(working_dir),
        GIT_TIMEOUT,
    )
    .map_err(|e| {
        log::error!(
            "git spawn failed: cwd={working_dir} args={:?} err={e}",
            args
        );
        format!("Failed to run git: {e}")
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let code = output.status.code().unwrap_or(-1);
    log::info!(
        "git done: cwd={working_dir} args={:?} exit={code} stdout={:?} stderr={:?}",
        args,
        stdout.trim(),
        stderr.trim()
    );

    // git fetch/checkout write user-facing progress to stderr; combine both for display.
    let mut combined = String::new();
    if !stdout.trim().is_empty() {
        combined.push_str(stdout.trim_end());
    }
    if !stderr.trim().is_empty() {
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(stderr.trim_end());
    }

    if !output.status.success() {
        return Err(format!(
            "git {} failed (exit {}): {}",
            args.join(" "),
            code,
            stderr.trim()
        ));
    }

    Ok(combined)
}

#[tauri::command]
pub async fn git_fetch(repo_path: String, remote: Option<String>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let remote = remote.unwrap_or_else(|| "origin".to_string());
        run_git_verbose(&repo_path, &["fetch", &remote])
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn git_checkout(repo_path: String, branch: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || run_git_verbose(&repo_path, &["checkout", &branch]))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn git_current_branch(repo_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

const ALLOWED_SUBCOMMANDS: &[&str] = &["pr", "auth"];

#[tauri::command]
pub async fn run_gh_command(args: Vec<String>) -> Result<String, String> {
    if args.is_empty() {
        return Err("No arguments provided to gh command".to_string());
    }
    if !ALLOWED_SUBCOMMANDS.contains(&args[0].as_str()) {
        return Err(format!(
            "Subcommand '{}' is not allowed. Allowed subcommands: {:?}",
            args[0], ALLOWED_SUBCOMMANDS
        ));
    }

    tokio::task::spawn_blocking(move || {
        let output = hidden_command("gh")
            .args(&args)
            .env("GH_PROMPT_DISABLED", "1")
            .env("GH_FORCE_TTY", "0")
            .stdin(Stdio::null())
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

// ─── scan_repos_under (settings → Add a repository) ─────────────────────────

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoCandidate {
    pub path: String,
    pub owner: Option<String>,
    pub name: String,
    pub already_tracked: bool,
}

/// Walk `parent` looking for git repos up to 4 levels deep. Returns one entry
/// per `.git`-containing directory, attempting to parse `owner/name` from the
/// origin remote and flagging whether the repo is already in `settings.repos`.
#[tauri::command]
pub async fn scan_repos_under(path: String) -> Result<Vec<RepoCandidate>, String> {
    tokio::task::spawn_blocking(move || {
        let parent = std::path::PathBuf::from(&path);
        if !parent.is_dir() {
            return Err(format!("Not a directory: {path}"));
        }
        let mut found = Vec::new();
        walk_for_repos(&parent, 0, &mut found);

        let tracked: std::collections::HashSet<String> =
            match crate::settings::load_settings_internal() {
                Ok(s) => s
                    .repos
                    .iter()
                    .map(|r| format!("{}/{}", r.owner, r.name))
                    .collect(),
                Err(_) => std::collections::HashSet::new(),
            };
        for c in &mut found {
            let key = format!("{}/{}", c.owner.clone().unwrap_or_default(), c.name);
            c.already_tracked =
                !c.owner.as_deref().unwrap_or("").is_empty() && tracked.contains(&key);
        }
        Ok(found)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

fn walk_for_repos(dir: &std::path::Path, depth: u32, out: &mut Vec<RepoCandidate>) {
    if depth > 4 {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if path.join(".git").exists() {
            let name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            // Reuse parse_github_remote for owner extraction
            let owner = run_git(&path.to_string_lossy(), &["remote", "get-url", "origin"])
                .ok()
                .and_then(|url| parse_github_remote(&url))
                .map(|(owner, _)| owner);
            out.push(RepoCandidate {
                path: path.to_string_lossy().to_string(),
                owner,
                name,
                already_tracked: false,
            });
        } else {
            walk_for_repos(&path, depth + 1, out);
        }
    }
}

#[cfg(test)]
mod scan_tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn finds_git_dirs_under_parent_at_multiple_depths() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("repo-a/.git")).unwrap();
        std::fs::create_dir_all(dir.path().join("nested/repo-b/.git")).unwrap();
        std::fs::create_dir_all(dir.path().join("not-a-repo/src")).unwrap();
        let mut found = Vec::new();
        walk_for_repos(dir.path(), 0, &mut found);
        let names: Vec<String> = found.iter().map(|c| c.name.clone()).collect();
        assert!(names.contains(&"repo-a".to_string()));
        assert!(names.contains(&"repo-b".to_string()));
        assert!(!names.contains(&"not-a-repo".to_string()));
    }

    #[test]
    fn does_not_recurse_into_git_dirs() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("outer/.git/inner/.git")).unwrap();
        let mut found = Vec::new();
        walk_for_repos(dir.path(), 0, &mut found);
        // outer is found; the bogus nested one inside .git is not
        let names: Vec<String> = found.iter().map(|c| c.name.clone()).collect();
        assert_eq!(names, vec!["outer".to_string()]);
    }

    #[test]
    fn respects_depth_limit() {
        let dir = TempDir::new().unwrap();
        // 6 levels deep — beyond the depth=4 cutoff
        std::fs::create_dir_all(dir.path().join("a/b/c/d/e/f/.git")).unwrap();
        let mut found = Vec::new();
        walk_for_repos(dir.path(), 0, &mut found);
        assert!(found.is_empty(), "should not find repos beyond depth 4");
    }

    #[test]
    fn parses_github_remote_variants_and_ssh_aliases() {
        for remote in [
            "https://github.com/acme/widget.git",
            "git@github.com:acme/widget.git",
            "git@github-work:acme/widget.git",
            "ssh://git@github-work/acme/widget.git",
        ] {
            assert_eq!(
                parse_github_remote(remote),
                Some(("acme".into(), "widget".into())),
                "remote={remote}"
            );
        }
    }
}
