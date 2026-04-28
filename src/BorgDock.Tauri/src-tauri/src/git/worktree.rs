use serde::Serialize;

use super::{hidden_command, run_git_step, GitStep};

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutPrResult {
    pub worktree_path: String,
    pub steps: Vec<GitStep>,
}

/// Check out a PR's branch into a worktree — either by creating a new worktree
/// (when `existing_worktree_path` is None) or by switching an existing worktree
/// to the branch. Never touches the main worktree implicitly — the caller
/// must point `existing_worktree_path` at a non-main worktree to operate on one.
///
/// Returns the worktree path and an ordered list of every git command that ran,
/// so the UI can render the full transcript.
#[tauri::command]
pub async fn checkout_pr(
    base_repo_path: String,
    branch_name: String,
    existing_worktree_path: Option<String>,
    new_worktree_subfolder: Option<String>,
    new_worktree_name: Option<String>,
) -> Result<CheckoutPrResult, String> {
    tokio::task::spawn_blocking(move || {
        if base_repo_path.is_empty() {
            return Err("Repo base path is not configured. Set it in Settings.".to_string());
        }

        let mut steps: Vec<GitStep> = Vec::new();

        // 1) Fetch the branch from origin in the main repo.
        let fetch = run_git_step(&base_repo_path, &["fetch", "origin", &branch_name]);
        let fetch_ok = fetch.ok;
        steps.push(fetch);
        if !fetch_ok {
            return Err(format_step_failure(&steps));
        }

        let origin_ref = format!("origin/{branch_name}");

        if let Some(worktree_path) = existing_worktree_path {
            // 2a) Switch the existing worktree onto the PR branch, tracking origin.
            let checkout = run_git_step(
                &worktree_path,
                &["checkout", "-B", &branch_name, &origin_ref],
            );
            let checkout_ok = checkout.ok;
            steps.push(checkout);
            if !checkout_ok {
                return Err(format_step_failure(&steps));
            }
            Ok(CheckoutPrResult {
                worktree_path,
                steps,
            })
        } else {
            // 2b) Create a new worktree.
            let subfolder = new_worktree_subfolder.unwrap_or_else(|| ".worktrees".to_string());
            let name = new_worktree_name
                .filter(|n| !n.trim().is_empty())
                .unwrap_or_else(|| sanitize_branch_name(&branch_name));
            let name = sanitize_branch_name(&name);

            let worktree_dir = std::path::Path::new(&base_repo_path).join(&subfolder);
            std::fs::create_dir_all(&worktree_dir).map_err(|e| {
                format!("Failed to create worktree parent directory: {e}")
            })?;
            let worktree_path = worktree_dir.join(&name);
            let worktree_path_str = worktree_path.to_string_lossy().to_string();

            if worktree_path.exists() {
                // Directory is already there — try to reuse it by checking out the branch.
                let checkout = run_git_step(
                    &worktree_path_str,
                    &["checkout", "-B", &branch_name, &origin_ref],
                );
                let checkout_ok = checkout.ok;
                steps.push(checkout);
                if !checkout_ok {
                    return Err(format_step_failure(&steps));
                }
            } else {
                let add = run_git_step(
                    &base_repo_path,
                    &[
                        "worktree",
                        "add",
                        "-B",
                        &branch_name,
                        &worktree_path_str,
                        &origin_ref,
                    ],
                );
                let add_ok = add.ok;
                steps.push(add);
                if !add_ok {
                    return Err(format_step_failure(&steps));
                }
            }

            Ok(CheckoutPrResult {
                worktree_path: worktree_path_str,
                steps,
            })
        }
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

fn format_step_failure(steps: &[GitStep]) -> String {
    match steps.last() {
        Some(last) => {
            let detail = if last.output.is_empty() {
                format!("exit {}", last.exit_code)
            } else {
                last.output.clone()
            };
            format!("{} failed: {}", last.cmd, detail)
        }
        None => "checkout failed".to_string(),
    }
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
    // VS Code on Windows installs as `code.cmd` (a batch wrapper). Rust's
    // CreateProcessW only auto-appends `.exe`, so bare "code" returns NotFound
    // even when `code` works in a shell. See CLAUDE.md → "Spawning Windows CLI
    // wrappers (`az.cmd`, etc.) from Rust".
    let program = if cfg!(windows) { "code.cmd" } else { "code" };
    tokio::task::spawn_blocking(move || {
        hidden_command(program)
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open editor: {e}"))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn reveal_in_file_manager(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            // explorer.exe parses forward-slash arguments as flags. Paths from
            // `git worktree list --porcelain` use forward slashes on Windows,
            // so `explorer.exe /D:/repo/.worktrees/...` is read as an unknown
            // flag and explorer silently falls back to opening Documents.
            // Normalize to backslashes before spawning.
            let win_path = path.replace('/', "\\");
            hidden_command("explorer.exe")
                .arg(&win_path)
                .spawn()
                .map_err(|e| format!("Failed to open explorer: {e}"))?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open finder: {e}"))?;
        }
        #[cfg(target_os = "linux")]
        {
            hidden_command("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn launch_claude_in_terminal(
    path: String,
    profile_override: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            // Match how "Open in Terminal" feels: the new tab must inherit the
            // user's default Windows Terminal profile (colors, font, background,
            // etc.). wt.exe can't do that if we just pass `-- pwsh` because
            // unqualified `pwsh` won't match the profile's full-path commandline,
            // so wt falls back to a generic ad-hoc profile. Using `-p "<name>"`
            // forces the visuals regardless of the commandline override.
            let ps_command = "claude --dangerously-skip-permissions";
            let default_profile = profile_override
                .as_ref()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .or_else(find_wt_default_profile_name);

            // -w new forces a brand-new wt window (not a tab in an existing one).
            // -NoLogo -NoProfile skips the banner and the user's $PROFILE.ps1 (oh-my-posh,
            // git prompts, etc.) which can otherwise take 2-5s to run before claude starts.
            // The tab exists solely to host claude, so loading an interactive profile is waste.
            let mut launches: Vec<Vec<String>> = Vec::new();
            if let Some(name) = default_profile.as_deref() {
                launches.push(vec![
                    "-w".into(), "new".into(),
                    "new-tab".into(),
                    "-p".into(), name.to_string(),
                    "--title".into(), "Claude".into(),
                    "-d".into(), path.clone(),
                    "pwsh".into(), "-NoLogo".into(), "-NoProfile".into(), "-NoExit".into(), "-Command".into(), ps_command.into(),
                ]);
                launches.push(vec![
                    "-w".into(), "new".into(),
                    "new-tab".into(),
                    "-p".into(), name.to_string(),
                    "--title".into(), "Claude".into(),
                    "-d".into(), path.clone(),
                    "powershell".into(), "-NoLogo".into(), "-NoProfile".into(), "-NoExit".into(), "-Command".into(), ps_command.into(),
                ]);
            }
            launches.push(vec![
                "-w".into(), "new".into(),
                "new-tab".into(),
                "--title".into(), "Claude".into(),
                "-d".into(), path.clone(),
                "pwsh".into(), "-NoLogo".into(), "-NoProfile".into(), "-NoExit".into(), "-Command".into(), ps_command.into(),
            ]);
            launches.push(vec![
                "-w".into(), "new".into(),
                "new-tab".into(),
                "--title".into(), "Claude".into(),
                "-d".into(), path.clone(),
                "powershell".into(), "-NoLogo".into(), "-NoProfile".into(), "-NoExit".into(), "-Command".into(), ps_command.into(),
            ]);

            let mut last_err: Option<std::io::Error> = None;
            let mut launched = false;
            for args in &launches {
                match hidden_command("wt.exe").args(args).spawn() {
                    Ok(_) => {
                        launched = true;
                        break;
                    }
                    Err(e) => last_err = Some(e),
                }
            }

            if !launched {
                // Last resort: cmd window that cd's in and runs claude.
                hidden_command("cmd")
                    .args([
                        "/c", "start", "cmd", "/k",
                        &format!("cd /d \"{path}\" && claude --dangerously-skip-permissions"),
                    ])
                    .spawn()
                    .map_err(|e| {
                        let prior = last_err
                            .map(|le| format!(" (wt.exe: {le})"))
                            .unwrap_or_default();
                        format!("Failed to launch claude: {e}{prior}")
                    })?;
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            // macOS/Linux: rely on a login shell so PATH resolves `claude`.
            std::process::Command::new("sh")
                .args(["-c", "claude --dangerously-skip-permissions"])
                .current_dir(&path)
                .spawn()
                .map_err(|e| format!("Failed to launch claude: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[cfg(target_os = "windows")]
fn find_wt_default_profile_name() -> Option<String> {
    use std::sync::OnceLock;
    // Cache for the process lifetime. Users rarely change their default wt
    // profile mid-session, and if they do, restarting BorgDock refreshes it.
    static CACHED: OnceLock<Option<String>> = OnceLock::new();
    CACHED
        .get_or_init(|| {
            let result = compute_wt_default_profile_name();
            match &result {
                Some(name) => log::info!("wt default profile (cached for session): {name}"),
                None => log::info!("wt default profile not found; using fallback launch"),
            }
            result
        })
        .clone()
}

#[cfg(target_os = "windows")]
fn compute_wt_default_profile_name() -> Option<String> {
    use std::env;
    use std::path::PathBuf;

    let local_app_data = env::var_os("LOCALAPPDATA")?;
    let lad = PathBuf::from(&local_app_data);
    let candidates = [
        lad.join("Packages")
            .join("Microsoft.WindowsTerminal_8wekyb3d8bbwe")
            .join("LocalState")
            .join("settings.json"),
        lad.join("Packages")
            .join("Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe")
            .join("LocalState")
            .join("settings.json"),
        lad.join("Microsoft").join("Windows Terminal").join("settings.json"),
    ];

    for path in candidates {
        let Ok(raw) = std::fs::read_to_string(&path) else { continue };
        let stripped = strip_jsonc_comments(&raw);
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&stripped) else {
            log::debug!("wt settings.json at {path:?} failed to parse even after comment strip");
            continue;
        };
        let Some(default_guid) = v.get("defaultProfile").and_then(|x| x.as_str()) else {
            continue;
        };
        let list = v
            .get("profiles")
            .and_then(|p| p.get("list").or(Some(p)))
            .and_then(|x| x.as_array());
        let Some(list) = list else { continue };

        for profile in list {
            let guid = profile.get("guid").and_then(|x| x.as_str()).unwrap_or("");
            if guid.eq_ignore_ascii_case(default_guid) {
                if let Some(name) = profile.get("name").and_then(|x| x.as_str()) {
                    return Some(name.to_string());
                }
            }
        }
    }
    None
}

/// Strip `//` line comments and `/* */` block comments, respecting string boundaries.
/// Windows Terminal's settings.json is JSONC; stock serde_json chokes on comments.
#[cfg(target_os = "windows")]
fn strip_jsonc_comments(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    let mut in_string = false;
    let mut escape = false;

    while i < bytes.len() {
        let c = bytes[i];
        if in_string {
            out.push(c as char);
            if escape {
                escape = false;
            } else if c == b'\\' {
                escape = true;
            } else if c == b'"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if c == b'"' {
            in_string = true;
            out.push('"');
            i += 1;
            continue;
        }
        if c == b'/' && i + 1 < bytes.len() {
            if bytes[i + 1] == b'/' {
                // line comment — skip to newline
                i += 2;
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            if bytes[i + 1] == b'*' {
                // block comment — skip to */
                i += 2;
                while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    i += 1;
                }
                i = (i + 2).min(bytes.len());
                continue;
            }
        }
        out.push(c as char);
        i += 1;
    }
    out
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
