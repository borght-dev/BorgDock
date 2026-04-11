use serde::Serialize;
use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;

/// Escape a string for interpolation into a PowerShell single-quoted string.
/// In PowerShell single-quoted strings, the only escape is '' for a literal '.
fn escape_powershell_single_quote(s: &str) -> String {
    s.replace('\'', "''")
}

/// Escape a string for safe interpolation into a cmd.exe argument.
/// Prefixes special cmd metacharacters with ^.
fn escape_cmd_arg(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '^' | '"' | '&' | '|' | '<' | '>' => {
                result.push('^');
                result.push(c);
            }
            _ => result.push(c),
        }
    }
    result
}

pub struct ProcessState {
    pub processes: Mutex<HashMap<u32, TrackedChild>>,
}

pub struct TrackedChild {
    pub child: Child,
    pub pr_number: i32,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub pid: u32,
    pub pr_number: i32,
    pub description: String,
}

#[tauri::command]
pub async fn launch_claude_code(
    state: State<'_, ProcessState>,
    worktree_path: String,
    prompt_file: String,
    initial_message: String,
    claude_code_path: Option<String>,
) -> Result<u32, String> {
    let claude = claude_code_path
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "claude".to_string());

    // Launch inside Windows Terminal via PowerShell so the user's default profile
    // (colors, fonts, etc.) is applied. Running a bare executable via "--" would
    // skip the shell and use plain black defaults.
    // Uses -NoExit so the tab stays open after Claude exits.
    let ps_command = format!(
        "& '{}' --dangerously-skip-permissions --append-system-prompt-file '{}' '{}'",
        escape_powershell_single_quote(&claude),
        escape_powershell_single_quote(&prompt_file),
        escape_powershell_single_quote(&initial_message)
    );
    let title = format!("CC: {}", &initial_message);

    let child = Command::new("wt.exe")
        .args([
            "-w", "0",
            "new-tab",
            "--title", &title,
            "-d", &worktree_path,
            "--",
            "pwsh", "-NoExit", "-Command",
            &ps_command,
        ])
        .spawn()
        .or_else(|_| {
            // Fallback: try Windows PowerShell 5.1 if pwsh (7+) isn't installed
            Command::new("wt.exe")
                .args([
                    "-w", "0",
                    "new-tab",
                    "--title", &title,
                    "-d", &worktree_path,
                    "--",
                    "powershell", "-NoExit", "-Command",
                    &ps_command,
                ])
                .spawn()
        })
        .or_else(|_| {
            // Last resort: cmd.exe outside Windows Terminal
            let cmd_arg = format!(
                "cd /d \"{}\" && \"{}\" --dangerously-skip-permissions --append-system-prompt-file \"{}\" \"{}\"",
                escape_cmd_arg(&worktree_path),
                escape_cmd_arg(&claude),
                escape_cmd_arg(&prompt_file),
                escape_cmd_arg(&initial_message)
            );
            Command::new("cmd.exe")
                .args(["/c", "start", "cmd.exe", "/k", &cmd_arg])
                .spawn()
        })
        .map_err(|e| format!("Failed to launch claude code: {e}"))?;

    let pid = child.id();

    // Clean up the prompt file after Claude Code has had time to read it
    let pf = prompt_file.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        let _ = std::fs::remove_file(&pf);
    });

    let mut processes = state
        .processes
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;

    processes.insert(
        pid,
        TrackedChild {
            child,
            pr_number: 0,
            description: initial_message,
        },
    );

    Ok(pid)
}

#[tauri::command]
pub fn get_active_sessions(state: State<'_, ProcessState>) -> Result<Vec<SessionInfo>, String> {
    let mut processes = state
        .processes
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;

    // Clean up exited processes while building the list
    let mut exited = Vec::new();
    let mut sessions = Vec::new();

    for (pid, tracked) in processes.iter_mut() {
        match tracked.child.try_wait() {
            Ok(Some(_)) => {
                exited.push(*pid);
            }
            Ok(None) => {
                sessions.push(SessionInfo {
                    pid: *pid,
                    pr_number: tracked.pr_number,
                    description: tracked.description.clone(),
                });
            }
            Err(_) => {
                exited.push(*pid);
            }
        }
    }

    for pid in exited {
        processes.remove(&pid);
    }

    Ok(sessions)
}

#[tauri::command]
pub fn kill_session(state: State<'_, ProcessState>, pid: u32) -> Result<(), String> {
    let mut processes = state
        .processes
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;

    if let Some(tracked) = processes.get_mut(&pid) {
        tracked
            .child
            .kill()
            .map_err(|e| format!("Failed to kill process {pid}: {e}"))?;
        processes.remove(&pid);
        Ok(())
    } else {
        Err(format!("No tracked process with PID {pid}"))
    }
}
