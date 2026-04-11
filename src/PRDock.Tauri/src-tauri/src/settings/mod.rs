pub mod models;

use models::AppSettings;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

/// Migrate plaintext credentials from settings.json into the OS keychain.
/// If any credential field is Some, store it in the keychain, clear the field,
/// and re-save settings to strip credentials from disk.
fn migrate_credentials_to_keychain(settings: &mut AppSettings) {
    let mut migrated = false;

    if let Some(ref pat) = settings.git_hub.personal_access_token {
        if let Ok(entry) = keyring::Entry::new("prdock", "prdock:github") {
            let _ = entry.set_password(pat);
        }
        settings.git_hub.personal_access_token = None;
        migrated = true;
    }

    if let Some(ref pat) = settings.azure_dev_ops.personal_access_token {
        if let Ok(entry) = keyring::Entry::new("prdock", "prdock:azure_devops") {
            let _ = entry.set_password(pat);
        }
        settings.azure_dev_ops.personal_access_token = None;
        migrated = true;
    }

    if let Some(ref key) = settings.claude_api.api_key {
        if let Ok(entry) = keyring::Entry::new("prdock", "prdock:claude_api") {
            let _ = entry.set_password(key);
        }
        settings.claude_api.api_key = None;
        migrated = true;
    }

    for conn in &mut settings.sql.connections {
        if let Some(ref pw) = conn.password {
            let service = format!("prdock:sql:{}", conn.name);
            if let Ok(entry) = keyring::Entry::new("prdock", &service) {
                let _ = entry.set_password(pw);
            }
            conn.password = None;
            migrated = true;
        }
    }

    if migrated {
        log::info!("Migrated plaintext credentials to OS keychain");
        let path = settings_path();
        let _ = atomic_write(&path, settings);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
    }
}

/// Recursively merge `overlay` into `base`. Objects are deep-merged;
/// scalars and arrays in overlay replace those in base.
pub fn merge_json(base: &mut Value, overlay: &Value) {
    match (base, overlay) {
        (Value::Object(base_map), Value::Object(overlay_map)) => {
            for (key, overlay_val) in overlay_map {
                let entry = base_map.entry(key.clone()).or_insert(Value::Null);
                merge_json(entry, overlay_val);
            }
        }
        (base, overlay) => {
            *base = overlay.clone();
        }
    }
}

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

#[cfg(debug_assertions)]
fn apply_dev_overlay(settings: AppSettings) -> Result<AppSettings, String> {
    let dev_path = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("settings.dev.json");
    if !dev_path.exists() {
        return Ok(settings);
    }
    let dev_content = fs::read_to_string(&dev_path)
        .map_err(|e| format!("Failed to read settings.dev.json: {e}"))?;
    let dev_value: Value = serde_json::from_str(&dev_content)
        .map_err(|e| format!("Failed to parse settings.dev.json: {e}"))?;
    let mut settings_value = serde_json::to_value(&settings).map_err(|e| e.to_string())?;
    merge_json(&mut settings_value, &dev_value);
    serde_json::from_value(settings_value).map_err(|e| format!("Failed to apply dev overlay: {e}"))
}

/// Load settings without the `#[tauri::command]` wrapper — callable from other Rust modules.
pub fn load_settings_internal() -> Result<AppSettings, String> {
    let dir = settings_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create settings dir: {e}"))?;

    let main_path = settings_path();

    let settings = if main_path.exists() {
        match fs::read_to_string(&main_path) {
            Ok(json) => match serde_json::from_str::<AppSettings>(&json) {
                Ok(s) => s,
                Err(_) => load_from_backup(&main_path)?,
            },
            Err(_) => load_from_backup(&main_path)?,
        }
    } else {
        load_from_backup(&main_path)?
    };

    #[cfg(debug_assertions)]
    {
        return apply_dev_overlay(settings);
    }

    #[allow(unreachable_code)]
    Ok(settings)
}

#[tauri::command]
pub fn load_settings() -> Result<AppSettings, String> {
    let mut settings = load_settings_internal()?;
    migrate_credentials_to_keychain(&mut settings);
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::merge_json;
    use serde_json::json;

    #[test]
    fn merge_overrides_scalar_values() {
        let mut base = json!({ "a": 1, "b": 2 });
        let overlay = json!({ "b": 99 });
        merge_json(&mut base, &overlay);
        assert_eq!(base, json!({ "a": 1, "b": 99 }));
    }

    #[test]
    fn merge_deep_merges_objects() {
        let mut base = json!({ "github": { "authMethod": "ghCli", "pollInterval": 60 } });
        let overlay = json!({ "github": { "pollInterval": 30 } });
        merge_json(&mut base, &overlay);
        assert_eq!(base["github"]["authMethod"], "ghCli");
        assert_eq!(base["github"]["pollInterval"], 30);
    }

    #[test]
    fn merge_adds_new_keys() {
        let mut base = json!({ "a": 1 });
        let overlay = json!({ "b": 2 });
        merge_json(&mut base, &overlay);
        assert_eq!(base, json!({ "a": 1, "b": 2 }));
    }

    #[test]
    fn merge_replaces_arrays() {
        let mut base = json!({ "repos": [1, 2] });
        let overlay = json!({ "repos": [3] });
        merge_json(&mut base, &overlay);
        assert_eq!(base["repos"], json!([3]));
    }
}

fn load_from_backup(main_path: &PathBuf) -> Result<AppSettings, String> {
    let bak_path = backup_path();
    if bak_path.exists() {
        if let Ok(json) = fs::read_to_string(&bak_path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&json) {
                let _ = atomic_write(main_path, &settings);
                return Ok(settings);
            }
        }
    }
    let defaults = AppSettings::default();
    atomic_write(main_path, &defaults)?;
    Ok(defaults)
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    let dir = settings_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create settings dir: {e}"))?;

    // Write backup first, then main
    atomic_write(&backup_path(), &settings)?;
    let path = settings_path();
    atomic_write(&path, &settings)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}
