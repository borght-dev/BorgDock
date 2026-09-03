//! Read-only SSH adapter for listing worktrees on another host.

use std::time::Duration;

use crate::settings::models::RemoteWorktreeRepoSettings;

use super::worktree::{parse_worktree_list, WorktreeEntry};
use super::{hidden_command, output_with_timeout};

const SSH_TIMEOUT: Duration = Duration::from_secs(15);

fn validate_ssh_target(target: &str) -> Result<(), String> {
    if target.is_empty()
        || !target
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'@' | b'.' | b':' | b'_' | b'-'))
    {
        return Err("SSH target may only contain a user and host or address".to_string());
    }
    Ok(())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

/// Run `git worktree list --porcelain` for one configured remote repository.
/// SSH is non-interactive and short-lived so an offline host cannot hold the
/// shared worktree refresh indefinitely.
pub fn list_remote_worktrees(
    repo: &RemoteWorktreeRepoSettings,
) -> Result<Vec<WorktreeEntry>, String> {
    let target = repo.ssh_target.trim();
    let base_path = repo.base_path.trim();
    validate_ssh_target(target)?;
    if !base_path.starts_with('/') {
        return Err("Remote repository path must be an absolute Unix path".to_string());
    }

    let mut command = hidden_command("ssh");
    command.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=5",
        "-o",
        "ConnectionAttempts=1",
        "-o",
        "StrictHostKeyChecking=yes",
    ]);
    if !repo.identity_file.trim().is_empty() {
        command.args(["-o", "IdentitiesOnly=yes", "-i"]);
        command.arg(repo.identity_file.trim());
    }
    command.arg("--").arg(target).arg(format!(
        "git -C {} worktree list --porcelain",
        shell_quote(base_path)
    ));

    let output = output_with_timeout(&mut command, SSH_TIMEOUT)
        .map_err(|e| format!("SSH to {target} failed: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "SSH to {target} failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_worktree_list(&stdout)
        .into_iter()
        .map(|(path, branch_name, is_main)| WorktreeEntry {
            path,
            branch_name,
            is_main_worktree: is_main,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_quote_handles_spaces_and_single_quotes() {
        assert_eq!(
            shell_quote("/Users/koen/Dev/O'Brien repo"),
            "'/Users/koen/Dev/O'\"'\"'Brien repo'"
        );
    }

    #[test]
    fn ssh_target_rejects_shell_syntax() {
        assert!(validate_ssh_target("koen@example.test").is_ok());
        assert!(validate_ssh_target("koen@example.test; reboot").is_err());
        assert!(validate_ssh_target("-oProxyCommand=bad").is_err());
    }
}
