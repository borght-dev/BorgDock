//! Windows global mouse hook that hides the flyout on any click outside its bounds.
//!
//! `WindowEvent::Focused(false)` fires unreliably for transparent always-on-top
//! WebView2 windows — the OS doesn't always activate them, so there's no focus
//! to lose. A low-level mouse hook sidesteps focus entirely: it sees every click
//! system-wide, and we hide when one lands outside the flyout rect.

#![cfg(target_os = "windows")]

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use windows::Win32::{
    Foundation::{HINSTANCE, LPARAM, LRESULT, POINT, RECT, WPARAM},
    UI::WindowsAndMessaging::{
        CallNextHookEx, GetWindowRect, SetWindowsHookExW, UnhookWindowsHookEx,
        HHOOK, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_LBUTTONDOWN, WM_MBUTTONDOWN,
        WM_NCLBUTTONDOWN, WM_NCMBUTTONDOWN, WM_NCRBUTTONDOWN, WM_RBUTTONDOWN,
    },
};

struct HookState {
    hook: Option<isize>,
    flyout_hwnd: Option<isize>,
    app_handle: Option<AppHandle>,
}

static HOOK_STATE: Mutex<HookState> = Mutex::new(HookState {
    hook: None,
    flyout_hwnd: None,
    app_handle: None,
});

/// Unix-millis timestamp of the most recent click-outside-triggered hide.
/// `toggle_flyout` consults this to suppress an immediate re-show when the
/// click that hid the flyout was the tray-icon click itself — the hook runs
/// before the tray click handler, so both observe "not visible" and would
/// otherwise fight each other.
static LAST_OUTSIDE_HIDE_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn millis_since_outside_hide() -> u64 {
    now_ms().saturating_sub(LAST_OUTSIDE_HIDE_MS.load(Ordering::Relaxed))
}

unsafe extern "system" fn mouse_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code >= 0 {
        let msg = w_param.0 as u32;
        if matches!(
            msg,
            WM_LBUTTONDOWN
                | WM_RBUTTONDOWN
                | WM_MBUTTONDOWN
                | WM_NCLBUTTONDOWN
                | WM_NCRBUTTONDOWN
                | WM_NCMBUTTONDOWN
        ) {
            let info = unsafe { &*(l_param.0 as *const MSLLHOOKSTRUCT) };
            handle_click(info.pt);
        }
    }
    unsafe { CallNextHookEx(None, n_code, w_param, l_param) }
}

fn handle_click(pt: POINT) {
    let (hwnd_val, app) = {
        let Ok(state) = HOOK_STATE.lock() else { return };
        let Some(h) = state.flyout_hwnd else { return };
        let Some(a) = state.app_handle.clone() else { return };
        (h, a)
    };

    let hwnd = windows::Win32::Foundation::HWND(hwnd_val as *mut _);
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
        return;
    }

    let inside = pt.x >= rect.left
        && pt.x < rect.right
        && pt.y >= rect.top
        && pt.y < rect.bottom;
    if inside {
        return;
    }

    LAST_OUTSIDE_HIDE_MS.store(now_ms(), Ordering::Relaxed);

    let app_for_task = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = app_for_task.get_webview_window("flyout") {
            let _ = win.hide();
        }
        uninstall_hook();
    });
}

/// Install the mouse hook. Called after the flyout window is shown.
/// Safe to call repeatedly — any existing hook is replaced.
pub fn install_hook(app: AppHandle, flyout_hwnd: isize) -> Result<(), String> {
    let mut state = HOOK_STATE.lock().map_err(|e| e.to_string())?;

    if let Some(old) = state.hook.take() {
        let old_hook = HHOOK(old as *mut _);
        let _ = unsafe { UnhookWindowsHookEx(old_hook) };
    }

    let hook = unsafe {
        SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), Some(HINSTANCE::default()), 0)
            .map_err(|e| e.to_string())?
    };

    state.hook = Some(hook.0 as isize);
    state.flyout_hwnd = Some(flyout_hwnd);
    state.app_handle = Some(app);
    Ok(())
}

/// Remove the mouse hook. Called when the flyout is hidden.
pub fn uninstall_hook() {
    let Ok(mut state) = HOOK_STATE.lock() else { return };
    if let Some(hook_val) = state.hook.take() {
        let hook = HHOOK(hook_val as *mut _);
        let _ = unsafe { UnhookWindowsHookEx(hook) };
    }
    state.flyout_hwnd = None;
}
