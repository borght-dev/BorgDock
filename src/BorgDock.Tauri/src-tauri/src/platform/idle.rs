//! How long the user has been away from the keyboard and mouse. A locked
//! screen counts as away: input on the lock screen does not reach the
//! session.

/// Seconds since the last keyboard or mouse input in this session, or
/// `None` when the platform cannot tell.
#[cfg(target_os = "windows")]
pub fn seconds_since_input() -> Option<u64> {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // SAFETY: `info` is a valid LASTINPUTINFO with `cbSize` set, as the API requires.
    let ok = unsafe { GetLastInputInfo(&mut info) }.as_bool();
    if !ok {
        return None;
    }
    // SAFETY: GetTickCount has no preconditions.
    let now = unsafe { GetTickCount() };
    Some(u64::from(now.wrapping_sub(info.dwTime)) / 1000)
}

#[cfg(target_os = "macos")]
pub fn seconds_since_input() -> Option<u64> {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }
    const COMBINED_SESSION_STATE: i32 = 0;
    const ANY_INPUT_EVENT: u32 = u32::MAX;
    // SAFETY: a pure query with constant arguments the API documents.
    let seconds =
        unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT) };
    seconds.is_finite().then(|| seconds.max(0.0) as u64)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn seconds_since_input() -> Option<u64> {
    None
}
