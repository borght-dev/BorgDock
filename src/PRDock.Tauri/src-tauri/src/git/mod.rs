pub mod commands;
pub mod process;
pub mod worktree;

pub use commands::{git_checkout, git_current_branch, git_fetch};
pub use process::{get_active_sessions, kill_session, launch_claude_code, ProcessState};
pub use worktree::{create_worktree, list_worktrees, open_in_editor, open_in_terminal, remove_worktree};

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
