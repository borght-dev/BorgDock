use serde::Serialize;

use super::{git_command, hidden_command, output_with_timeout, run_git_step, GitStep, GIT_TIMEOUT};

/// Upper bound on concurrent git processes during the heavy per-worktree scan.
const SCAN_CONCURRENCY: usize = 8;

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

pub(crate) fn run_git(working_dir: &str, args: &[&str]) -> Result<String, String> {
    let output = output_with_timeout(
        git_command().args(args).current_dir(working_dir),
        GIT_TIMEOUT,
    )
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
    // --no-optional-locks: don't refresh/rewrite the index as a side effect.
    // Without it every scan cycle takes the index lock in every worktree,
    // which fights with the user's own git/IDE and thrashes the disk.
    let output = run_git(
        worktree_path,
        &["--no-optional-locks", "status", "--porcelain=v1"],
    );
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

pub(crate) fn parse_worktree_list(output: &str) -> Vec<(String, String, bool)> {
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

    sort_worktree_tuples(&mut result);
    result
}

/// Deterministic order: main worktree first, then natural (numeric-aware,
/// case-insensitive) order of the path so `worktree2` sorts before `worktree10`.
fn sort_worktree_tuples(entries: &mut [(String, String, bool)]) {
    entries.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| natural_cmp(&a.0, &b.0)));
}

/// Case-insensitive comparison that treats digit runs as numbers, so
/// `a2` < `a10` and `Foo` sorts next to `foo`. Equal numeric values with
/// different zero-padding and exact-case ties are broken deterministically so
/// the ordering stays total.
pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let a = a.as_bytes();
    let b = b.as_bytes();
    let (mut i, mut j) = (0usize, 0usize);
    while i < a.len() && j < b.len() {
        let (ca, cb) = (a[i], b[j]);
        if ca.is_ascii_digit() && cb.is_ascii_digit() {
            let si = i;
            while i < a.len() && a[i].is_ascii_digit() {
                i += 1;
            }
            let sj = j;
            while j < b.len() && b[j].is_ascii_digit() {
                j += 1;
            }
            let da = &a[si..i];
            let db = &b[sj..j];
            // Strip leading zeros, compare by length then lexically.
            let ta = da
                .iter()
                .position(|&c| c != b'0')
                .map_or(&da[da.len()..], |p| &da[p..]);
            let tb = db
                .iter()
                .position(|&c| c != b'0')
                .map_or(&db[db.len()..], |p| &db[p..]);
            let ord = ta.len().cmp(&tb.len()).then_with(|| ta.cmp(tb));
            if ord != Ordering::Equal {
                return ord;
            }
            // Same numeric value: fewer leading zeros first.
            let ord = da.len().cmp(&db.len());
            if ord != Ordering::Equal {
                return ord;
            }
            continue;
        }
        let la = ca.to_ascii_lowercase();
        let lb = cb.to_ascii_lowercase();
        if la != lb {
            return la.cmp(&lb);
        }
        i += 1;
        j += 1;
    }
    (a.len() - i).cmp(&(b.len() - j)).then_with(|| a.cmp(b))
}

#[derive(Debug, Clone, Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeEntry {
    pub path: String,
    pub branch_name: String,
    pub is_main_worktree: bool,
}

/// Blocking: `git worktree list --porcelain` parsed into sorted entries.
/// ~0.2 s per repo. Shared by `list_worktrees_bare`, the heavy scan and the
/// worktree cache.
pub(crate) fn list_worktrees_bare_sync(base_path: &str) -> Result<Vec<WorktreeEntry>, String> {
    let output = run_git(base_path, &["worktree", "list", "--porcelain"])?;
    Ok(parse_worktree_list(&output)
        .into_iter()
        .map(|(path, branch_name, is_main)| WorktreeEntry {
            path,
            branch_name,
            is_main_worktree: is_main,
        })
        .collect())
}

/// Lightweight worktree list — only path + branch, no per-worktree git status/ahead-behind/sha.
/// Use this when you only need to find a worktree by branch name (e.g. before launching Claude).
#[tauri::command]
pub async fn list_worktrees_bare(base_path: String) -> Result<Vec<WorktreeEntry>, String> {
    tokio::task::spawn_blocking(move || list_worktrees_bare_sync(&base_path))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

/// Heavy per-worktree scan (status + ahead/behind + sha). The three git calls
/// per worktree run on a small scoped thread pool (`SCAN_CONCURRENCY` wide)
/// instead of sequentially — 14 worktrees went from ~24 s to a few seconds.
#[tauri::command]
pub async fn list_worktrees(base_path: String) -> Result<Vec<WorktreeInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let entries = list_worktrees_bare_sync(&base_path)?;
        Ok(scan_worktrees_parallel(entries))
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

fn scan_worktree(entry: WorktreeEntry) -> WorktreeInfo {
    let (status, uncommitted_count) = get_worktree_status(&entry.path);
    let (ahead, behind) = get_ahead_behind(&entry.path);
    let commit_sha = get_head_sha(&entry.path);
    WorktreeInfo {
        path: entry.path,
        branch_name: entry.branch_name,
        is_main_worktree: entry.is_main_worktree,
        status,
        uncommitted_count,
        ahead,
        behind,
        commit_sha,
    }
}

/// Fan the per-worktree git calls out over at most `SCAN_CONCURRENCY` scoped
/// threads, preserving the input order in the result.
fn scan_worktrees_parallel(entries: Vec<WorktreeEntry>) -> Vec<WorktreeInfo> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    if entries.is_empty() {
        return Vec::new();
    }
    let workers = SCAN_CONCURRENCY.min(entries.len());
    let next = AtomicUsize::new(0);
    let slots: Mutex<Vec<Option<WorktreeInfo>>> =
        Mutex::new((0..entries.len()).map(|_| None).collect());
    let entries = &entries;

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| loop {
                let idx = next.fetch_add(1, Ordering::Relaxed);
                let Some(entry) = entries.get(idx) else { break };
                let info = scan_worktree(entry.clone());
                if let Ok(mut s) = slots.lock() {
                    s[idx] = Some(info);
                }
            });
        }
    });

    slots
        .into_inner()
        .unwrap_or_default()
        .into_iter()
        .flatten()
        .collect()
}

#[tauri::command]
pub async fn create_worktree(
    app: tauri::AppHandle,
    base_path: String,
    subfolder: String,
    branch_name: String,
) -> Result<String, String> {
    let result = tokio::task::spawn_blocking(move || {
        // Fetch only the specific branch tip (skip tags for speed)
        let _ = run_git(
            &base_path,
            &["fetch", "--no-tags", "--depth", "1", "origin", &branch_name],
        );

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
    .map_err(|e| format!("Task join error: {e}"))?;
    super::worktree_cache::refresh_in_background(&app);
    result
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
    app: tauri::AppHandle,
    base_repo_path: String,
    branch_name: String,
    existing_worktree_path: Option<String>,
    new_worktree_subfolder: Option<String>,
    new_worktree_name: Option<String>,
) -> Result<CheckoutPrResult, String> {
    let result = tokio::task::spawn_blocking(move || {
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
            std::fs::create_dir_all(&worktree_dir)
                .map_err(|e| format!("Failed to create worktree parent directory: {e}"))?;
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
    .map_err(|e| format!("Task join error: {e}"))?;
    super::worktree_cache::refresh_in_background(&app);
    result
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
pub async fn remove_worktree(
    app: tauri::AppHandle,
    base_path: String,
    worktree_path: String,
) -> Result<(), String> {
    let result = tokio::task::spawn_blocking(move || {
        run_git(&base_path, &["worktree", "remove", &worktree_path])?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    super::worktree_cache::refresh_in_background(&app);
    result
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
                    "-w".into(),
                    "new".into(),
                    "new-tab".into(),
                    "-p".into(),
                    name.to_string(),
                    "--title".into(),
                    "Claude".into(),
                    "-d".into(),
                    path.clone(),
                    "pwsh".into(),
                    "-NoLogo".into(),
                    "-NoProfile".into(),
                    "-NoExit".into(),
                    "-Command".into(),
                    ps_command.into(),
                ]);
                launches.push(vec![
                    "-w".into(),
                    "new".into(),
                    "new-tab".into(),
                    "-p".into(),
                    name.to_string(),
                    "--title".into(),
                    "Claude".into(),
                    "-d".into(),
                    path.clone(),
                    "powershell".into(),
                    "-NoLogo".into(),
                    "-NoProfile".into(),
                    "-NoExit".into(),
                    "-Command".into(),
                    ps_command.into(),
                ]);
            }
            launches.push(vec![
                "-w".into(),
                "new".into(),
                "new-tab".into(),
                "--title".into(),
                "Claude".into(),
                "-d".into(),
                path.clone(),
                "pwsh".into(),
                "-NoLogo".into(),
                "-NoProfile".into(),
                "-NoExit".into(),
                "-Command".into(),
                ps_command.into(),
            ]);
            launches.push(vec![
                "-w".into(),
                "new".into(),
                "new-tab".into(),
                "--title".into(),
                "Claude".into(),
                "-d".into(),
                path.clone(),
                "powershell".into(),
                "-NoLogo".into(),
                "-NoProfile".into(),
                "-NoExit".into(),
                "-Command".into(),
                ps_command.into(),
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
                        "/c",
                        "start",
                        "cmd",
                        "/k",
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
        lad.join("Microsoft")
            .join("Windows Terminal")
            .join("settings.json"),
    ];

    for path in candidates {
        let Ok(raw) = std::fs::read_to_string(&path) else {
            continue;
        };
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::cmp::Ordering;

    #[test]
    fn natural_cmp_orders_digit_runs_numerically() {
        assert_eq!(natural_cmp("worktree2", "worktree10"), Ordering::Less);
        assert_eq!(natural_cmp("worktree10", "worktree2"), Ordering::Greater);
        assert_eq!(natural_cmp("worktree1", "worktree1"), Ordering::Equal);
        assert_eq!(natural_cmp("Worktree1", "worktree2"), Ordering::Less);
        assert_eq!(natural_cmp("a", "ab"), Ordering::Less);
        let mut v = vec!["worktree10", "worktree2", "worktree1", "feature-x"];
        v.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(v, vec!["feature-x", "worktree1", "worktree2", "worktree10"]);
    }

    #[test]
    fn parse_worktree_list_pins_main_then_natural_order() {
        let out = "worktree D:/repo\nHEAD abc\nbranch refs/heads/main\n\n\
                   worktree D:/repo/.worktrees/worktree10\nHEAD abc\nbranch refs/heads/b10\n\n\
                   worktree D:/repo/.worktrees/worktree2\nHEAD abc\nbranch refs/heads/b2\n\n\
                   worktree D:/repo/.worktrees/worktree1\nHEAD abc\nbranch refs/heads/b1\n";
        let parsed = parse_worktree_list(out);
        let paths: Vec<&str> = parsed.iter().map(|(p, _, _)| p.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                "D:/repo",
                "D:/repo/.worktrees/worktree1",
                "D:/repo/.worktrees/worktree2",
                "D:/repo/.worktrees/worktree10",
            ]
        );
        assert!(parsed[0].2);
        assert!(!parsed[1].2);
    }

    #[test]
    fn parse_worktree_list_skips_bare() {
        let out = "worktree D:/repo.git\nbare\n\nworktree D:/repo/.worktrees/a\nHEAD abc\nbranch refs/heads/a\n";
        let parsed = parse_worktree_list(out);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].0, "D:/repo/.worktrees/a");
    }
}
