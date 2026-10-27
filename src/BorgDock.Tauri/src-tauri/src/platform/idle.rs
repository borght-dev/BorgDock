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

#[cfg(not(target_os = "windows"))]
pub fn seconds_since_input() -> Option<u64> {
    None
}
