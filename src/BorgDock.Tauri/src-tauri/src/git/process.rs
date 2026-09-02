use crate::git::hidden_command;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Child;
use std::sync::{Arc, Mutex};
use tauri::State;

/// Escape a string for interpolation into a PowerShell single-quoted string.
/// In PowerShell single-quoted strings, the only escape is '' for a literal '.
fn escape_powershell_single_quote(s: &str) -> String {
    s.replace('\'', "''")
}

/// Tracked Claude Code child processes. `Arc` so async commands can hand the
/// map to `spawn_blocking` (`try_wait` / `kill` are syscalls that must not
/// run inline on the GUI thread).
#[derive(Default)]
pub struct ProcessState {
    pub processes: Arc<Mutex<HashMap<u32, TrackedChild>>>,
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

/// Provider-neutral terminal launcher used when T3 is unavailable or the user
/// explicitly chooses Claude/Codex for one run.
#[tauri::command]
pub async fn launch_agent_session(
    state: State<'_, ProcessState>,
    provider: String,
    worktree_path: String,
    prompt_file: String,
    title: String,
    executable: Option<String>,
    model: Option<String>,
) -> Result<u32, String> {
    let provider_key = provider.to_lowercase();
    let program = executable
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| provider_key.clone());
    let escaped_program = escape_powershell_single_quote(&program);
    let escaped_prompt = escape_powershell_single_quote(&prompt_file);
    let escaped_worktree = escape_powershell_single_quote(&worktree_path);
    let ps_command = match provider_key.as_str() {
        "claude" => format!(
            "& '{}' --dangerously-skip-permissions --append-system-prompt-file '{}' '{}'",
            escaped_program,
            escaped_prompt,
            escape_powershell_single_quote(&title)
        ),
        "codex" => {
            let model_arg = model
                .filter(|value| !value.trim().is_empty())
                .map(|value| format!(" -m '{}'", escape_powershell_single_quote(&value)))
                .unwrap_or_default();
            format!(
                "$p=Get-Content -Raw -LiteralPath '{}'; & '{}' -C '{}' -s workspace-write{} $p",
                escaped_prompt, escaped_program, escaped_worktree, model_arg
            )
        }
        _ => return Err(format!("Unsupported terminal provider: {provider}")),
    };
    let tab_title = format!("{}: {}", provider_key, title);
    let args = [
        "-w",
        "0",
        "new-tab",
        "--title",
        &tab_title,
        "-d",
        &worktree_path,
        "--",
        "pwsh",
        "-NoExit",
        "-Command",
        &ps_command,
    ];
    let child = hidden_command("wt.exe")
        .args(args)
        .spawn()
        .map_err(|e| format!("Failed to launch {provider}: {e}"))?;
    let pid = child.id();
    state
        .processes
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(
            pid,
            TrackedChild {
                child,
                pr_number: 0,
                description: title,
            },
        );
    let prompt_to_remove = prompt_file;
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        let _ = std::fs::remove_file(prompt_to_remove);
    });
    Ok(pid)
}

#[tauri::command]
pub async fn get_active_sessions(
    state: State<'_, ProcessState>,
) -> Result<Vec<SessionInfo>, String> {
    let processes = state.processes.clone();
    tokio::task::spawn_blocking(move || {
        let mut processes = processes.lock().unwrap_or_else(|p| p.into_inner());

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
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn kill_session(state: State<'_, ProcessState>, pid: u32) -> Result<(), String> {
    let processes = state.processes.clone();
    tokio::task::spawn_blocking(move || {
        let mut processes = processes.lock().unwrap_or_else(|p| p.into_inner());

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
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
