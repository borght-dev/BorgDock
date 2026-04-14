use std::sync::Mutex;

/// Rust-side cache for the flyout payload.
///
/// The main window's JS pushes the latest flyout data here whenever PR state
/// changes. When the flyout opens, it fetches directly via IPC — this avoids
/// depending on the main window's WebView2 being active (Windows suspends JS
/// in hidden WebView2 windows).
pub struct FlyoutCache {
    pub data: Mutex<Option<String>>,
}

/// Store the latest flyout payload (JSON string) in Rust state.
/// Called from the main window's useBadgeSync whenever PR data changes.
#[tauri::command]
pub fn cache_flyout_data(
    state: tauri::State<'_, FlyoutCache>,
    payload: String,
) -> Result<(), String> {
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    *data = Some(payload);
    Ok(())
}

/// Retrieve the cached flyout payload. Returns the JSON string or null.
/// Called from the flyout window on mount.
#[tauri::command]
pub fn get_flyout_data(
    state: tauri::State<'_, FlyoutCache>,
) -> Result<Option<String>, String> {
    let data = state.data.lock().map_err(|e| e.to_string())?;
    Ok(data.clone())
}
