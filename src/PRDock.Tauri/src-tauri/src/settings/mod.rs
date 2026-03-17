pub mod models;

use models::AppSettings;
use std::fs;
use std::path::PathBuf;

fn settings_dir() -> PathBuf {
    dirs::config_dir()
        .expect("could not determine config directory")
        .join("PRDock")
}

fn settings_path() -> PathBuf {
    settings_dir().join("settings.json")
}

fn backup_path() -> PathBuf {
    settings_dir().join("settings.json.bak")
}

/// Atomically writes JSON to a file (write to .tmp, then rename).
fn atomic_write(path: &PathBuf, settings: &AppSettings) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json).map_err(|e| format!("Failed to write temp file: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("Failed to rename temp file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn load_settings() -> Result<AppSettings, String> {
    let dir = settings_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create settings dir: {e}"))?;

    let main_path = settings_path();

    // Try main file first
    if main_path.exists() {
        match fs::read_to_string(&main_path) {
            Ok(json) => match serde_json::from_str::<AppSettings>(&json) {
                Ok(settings) => return Ok(settings),
                Err(_) => { /* fall through to backup */ }
            },
            Err(_) => { /* fall through to backup */ }
        }
    }

    // Try backup
    let bak_path = backup_path();
    if bak_path.exists() {
        if let Ok(json) = fs::read_to_string(&bak_path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&json) {
                // Restore main from backup
                let _ = atomic_write(&main_path, &settings);
                return Ok(settings);
            }
        }
    }

    // No usable file — return defaults and persist them
    let defaults = AppSettings::default();
    atomic_write(&main_path, &defaults)?;
    Ok(defaults)
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    let dir = settings_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create settings dir: {e}"))?;

    // Write backup first, then main
    atomic_write(&backup_path(), &settings)?;
    atomic_write(&settings_path(), &settings)?;
    Ok(())
}
