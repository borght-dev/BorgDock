pub mod commands;
pub mod diff;
pub mod process;
pub mod worktree;

pub use commands::{git_checkout, git_current_branch, git_fetch};
pub use diff::{git_changed_files, git_file_diff};
pub use process::{get_active_sessions, kill_session, launch_claude_code, ProcessState};
pub use worktree::{checkout_pr, create_worktree, launch_claude_in_terminal, list_worktrees, list_worktrees_bare, open_in_editor, open_in_terminal, remove_worktree, reveal_in_file_manager};

/// Create a Command that won't flash a console window on Windows.
pub fn hidden_command(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
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
    log::info!("git run: cwd={working_dir} args={:?}", args);
    let output = match hidden_command("git")
        .args(args)
        .current_dir(working_dir)
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            log::error!("git spawn failed: cwd={working_dir} args={:?} err={e}", args);
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
    log::info!(
        "git done: cwd={working_dir} args={:?} exit={code} stdout={:?} stderr={:?}",
        args,
        stdout.trim(),
        stderr.trim()
    );

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
