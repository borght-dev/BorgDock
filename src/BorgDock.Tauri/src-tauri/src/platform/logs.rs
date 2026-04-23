use std::path::PathBuf;

fn log_folder() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("BorgDock")
        .join("logs")
}

/// Return the absolute path of the log folder. Useful for displaying in the
/// UI or passing to the OS "reveal in file manager" shortcut.
#[tauri::command]
pub fn get_log_folder() -> Result<String, String> {
    Ok(log_folder().to_string_lossy().to_string())
}

/// Open the log folder in the OS file manager (Explorer on Windows, Finder
/// on macOS, xdg-open on Linux).
#[tauri::command]
pub fn open_log_folder() -> Result<(), String> {
    let path = log_folder();
    if !path.exists() {
        std::fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create log folder: {e}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("explorer")
            .arg(&path)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to open log folder: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open log folder: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open log folder: {e}"))?;
    }

    Ok(())
}
