pub mod commands;
pub mod diff;
pub mod process;
pub mod worktree;
pub mod worktree_cache;
pub mod worktree_changes;

pub use commands::{git_checkout, git_current_branch, git_fetch};
pub use diff::{git_changed_files, git_file_diff};
pub use process::{
get_active_sessions, kill_session, launch_agent_session, ProcessState,
};
pub use worktree::{
    checkout_pr, create_worktree, launch_claude_in_terminal, list_worktrees, list_worktrees_bare,
    open_in_editor, open_in_terminal, remove_worktree, reveal_in_file_manager,
};

/// Create a Command that won't flash a console window on Windows.
pub fn hidden_command(program: &str) -> std::process::Command {
    hidden_command_path(std::path::Path::new(program))
}

fn hidden_command_path(program: &std::path::Path) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Absolute path of the git executable, resolved from PATH once per process.
///
/// Every `Command::new("git")` otherwise re-walks PATH (and on Windows, PATHEXT)
/// on each spawn — measurable when the worktree scan fans out into dozens of
/// git processes. Falls back to the bare name if nothing is found so the
/// spawn error still reads "git not found" rather than a bogus path.
pub fn git_program() -> &'static std::path::Path {
    static GIT: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
    GIT.get_or_init(|| {
        let resolved = resolve_on_path(if cfg!(windows) { "git.exe" } else { "git" });
        match &resolved {
            Some(p) => log::info!("git resolved to {}", p.display()),
            None => log::warn!("git not found on PATH; falling back to bare `git`"),
        }
        resolved.unwrap_or_else(|| std::path::PathBuf::from("git"))
    })
}

fn resolve_on_path(exe: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .filter(|dir| !dir.as_os_str().is_empty())
        .map(|dir| dir.join(exe))
        .find(|candidate| candidate.is_file())
}

/// A hidden `git` Command using the cached absolute executable path.
pub fn git_command() -> std::process::Command {
    hidden_command_path(git_program())
}

/// Wall-clock cap for a single git invocation. Git normally answers in
/// milliseconds; anything that runs this long is wedged (stuck credential
/// prompt, dead network share, index lock held by another process) and must
/// not pin a worker thread forever.
pub const GIT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Run a command to completion with a wall-clock timeout, capturing stdout and
/// stderr. On timeout the child is killed and an `io::Error` of kind
/// `TimedOut` is returned.
///
/// stdout/stderr are drained on helper threads so a chatty child never blocks
/// on a full pipe while we poll `try_wait`.
pub fn output_with_timeout(
    cmd: &mut std::process::Command,
    timeout: std::time::Duration,
) -> std::io::Result<std::process::Output> {
    use std::io::Read;
    use std::process::Stdio;

    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    fn drain<R: Read + Send + 'static>(reader: Option<R>) -> std::thread::JoinHandle<Vec<u8>> {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(mut r) = reader {
                let _ = r.read_to_end(&mut buf);
            }
            buf
        })
    }
    let stdout_thread = drain(child.stdout.take());
    let stderr_thread = drain(child.stderr.take());

    let started = std::time::Instant::now();
    let status = loop {
        match child.try_wait()? {
            Some(status) => break status,
            None if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                // Reader threads unblock once the pipes close on kill.
                let _ = stdout_thread.join();
                let _ = stderr_thread.join();
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    format!("timed out after {}s", timeout.as_secs()),
                ));
            }
            None => std::thread::sleep(std::time::Duration::from_millis(10)),
        }
    };

    let stdout = stdout_thread.join().unwrap_or_default();
    let stderr = stderr_thread.join().unwrap_or_default();
    Ok(std::process::Output {
        status,
        stdout,
        stderr,
    })
}

/// A single git invocation captured for replay in the UI log.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStep {
    /// Human-readable representation of what ran, e.g. `git worktree add -B foo …`.
    pub cmd: String,
    /// cwd the command ran in, shown as a breadcrumb.
    pub cwd: String,
    /// Combined stdout+stderr output, trimmed. Git writes fetch/checkout progress to stderr,
    /// so both streams are merged.
    pub output: String,
    pub exit_code: i32,
    pub ok: bool,
}

/// Run a git command and capture everything for UI display.
/// Unlike the local `run_git` helpers, this never discards stdout/stderr on success.
pub(crate) fn run_git_step(working_dir: &str, args: &[&str]) -> GitStep {
    log::debug!("git run: cwd={working_dir} args={:?}", args);
    let output = match output_with_timeout(
        git_command().args(args).current_dir(working_dir),
        GIT_TIMEOUT,
    ) {
        Ok(o) => o,
        Err(e) => {
            log::error!(
                "git spawn failed: cwd={working_dir} args={:?} err={e}",
                args
            );
            return GitStep {
                cmd: format!("git {}", args.join(" ")),
                cwd: working_dir.to_string(),
                output: format!("spawn failed: {e}"),
                exit_code: -1,
                ok: false,
            };
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let code = output.status.code().unwrap_or(-1);
    // Full stdout/stderr used to be logged at info on every call — with the
    // Webview log target that was one IPC round-trip per git invocation, and
    // multi-KB payloads for `status`/`diff`. Log the command line at debug
    // and only stderr when the command actually failed.
    if output.status.success() {
        log::debug!("git done: cwd={working_dir} args={:?} exit={code}", args);
    } else {
        log::warn!(
            "git failed: cwd={working_dir} args={:?} exit={code} stderr={:?}",
            args,
            stderr.trim()
        );
    }

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

    GitStep {
        cmd: format!("git {}", args.join(" ")),
        cwd: working_dir.to_string(),
        output: combined,
        exit_code: code,
        ok: output.status.success(),
    }
}
