use serde::Serialize;
use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;

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

    // Launch inside Windows Terminal so the user can see the Claude Code session.
    // Uses --dangerously-skip-permissions so Claude can run autonomously.
    // Falls back to cmd.exe if wt.exe is not available.
    let child = Command::new("wt.exe")
        .args([
            "-w", "0",
            "new-tab",
            "--title", &format!("CC: {}", &initial_message),
            "-d", &worktree_path,
            "--",
            &claude,
            "--dangerously-skip-permissions",
            "--append-system-prompt-file",
            &prompt_file,
            &initial_message,
        ])
        .spawn()
        .or_else(|_| {
            // Fallback: open in cmd.exe if Windows Terminal isn't installed
            let cmd_arg = format!(
                "cd /d \"{}\" && \"{}\" --dangerously-skip-permissions --append-system-prompt-file \"{}\" \"{}\"",
                worktree_path, claude, prompt_file, initial_message
            );
            Command::new("cmd.exe")
                .args(["/c", "start", "cmd.exe", "/k", &cmd_arg])
                .spawn()
        })
        .map_err(|e| format!("Failed to launch claude code: {e}"))?;

    let pid = child.id();

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
