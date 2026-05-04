//! Best-effort raise the terminal window that's running a Claude Code
//! session. We never know exactly which window — there's no IPC across
//! Windows Terminal, wezterm, etc. — so we use process-tree heuristics:
//! find a known terminal-host process whose CWD (or whose descendants'
//! CWDs) match the session, then raise its top-level window.

#![allow(dead_code)]

use std::path::Path;

#[cfg(windows)]
const KNOWN_HOSTS: &[&str] = &[
    "WindowsTerminal.exe",
    "wezterm-gui.exe",
    "alacritty.exe",
    "pwsh.exe",
    "powershell.exe",
    "cmd.exe",
];

/// Returns true on success, false if no match. Errors only on hard
/// platform failures (the typical "no terminal found" returns Ok(false)).
pub fn focus(session_cwd: &Path) -> Result<bool, String> {
    #[cfg(windows)]
    {
        focus_windows(session_cwd)
    }
    #[cfg(not(windows))]
    {
        let _ = session_cwd;
        Ok(false)
    }
}

#[cfg(windows)]
fn focus_windows(session_cwd: &Path) -> Result<bool, String> {
    use sysinfo::System;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow,
        ShowWindow, SW_RESTORE,
    };

    let mut sys = System::new();
    sys.refresh_processes();

    // Find PIDs whose process tree includes a process running in
    // `session_cwd`.
    let target_cwd =
        std::fs::canonicalize(session_cwd).unwrap_or_else(|_| session_cwd.to_path_buf());

    let mut candidate_pids: Vec<u32> = Vec::new();
    for (pid, proc_) in sys.processes() {
        if let Some(cwd) = proc_.cwd() {
            let cwd_canon = std::fs::canonicalize(cwd).unwrap_or_else(|_| cwd.to_path_buf());
            if cwd_canon == target_cwd {
                // Walk up to the topmost ancestor that's a known host.
                let mut current = pid.as_u32();
                loop {
                    let proc_at_current = sys.process(sysinfo::Pid::from_u32(current));
                    let Some(p) = proc_at_current else { break };
                    let exe_name = p.name();
                    if KNOWN_HOSTS.iter().any(|h| h.eq_ignore_ascii_case(exe_name)) {
                        candidate_pids.push(current);
                        break;
                    }
                    let Some(parent) = p.parent() else { break };
                    current = parent.as_u32();
                }
            }
        }
    }

    if candidate_pids.is_empty() {
        return Ok(false);
    }

    // EnumWindows: find any visible HWND owned by one of the candidate PIDs.
    struct Ctx {
        pids: Vec<u32>,
        found: Option<HWND>,
    }
    let mut ctx = Ctx {
        pids: candidate_pids,
        found: None,
    };
    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = unsafe { &mut *(lparam.0 as *mut Ctx) };
        if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
            return BOOL(1);
        }
        let mut owner_pid: u32 = 0;
        let _tid = unsafe { GetWindowThreadProcessId(hwnd, Some(&mut owner_pid)) };
        if ctx.pids.contains(&owner_pid) {
            ctx.found = Some(hwnd);
            return BOOL(0); // stop enumeration
        }
        BOOL(1)
    }
    let _ = unsafe { EnumWindows(Some(cb), LPARAM(&mut ctx as *mut _ as isize)) };

    let Some(hwnd) = ctx.found else {
        return Ok(false);
    };
    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        let _ = SetForegroundWindow(hwnd);
    }
    Ok(true)
}
