pub mod models;
pub mod window;

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
        if let Ok(entry) = crate::keychain::entry("borgdock:github") {
            let _ = entry.set_password(pat);
        }
        settings.git_hub.personal_access_token = None;
        migrated = true;
    }

    if let Some(ref pat) = settings.azure_dev_ops.personal_access_token {
        if let Ok(entry) = crate::keychain::entry("borgdock:azure_devops") {
            let _ = entry.set_password(pat);
        }
        settings.azure_dev_ops.personal_access_token = None;
        migrated = true;
    }

    for conn in &mut settings.sql.connections {
        if let Some(ref pw) = conn.password {
            let service = format!("borgdock:sql:{}", conn.name);
            if let Ok(entry) = crate::keychain::entry(&service) {
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
    crate::app_data::directory()
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

/// Current settings schema version. Bump together with a new arm in
/// [`migrate`]. Migrations are one-off, in-memory rewrites that run on load
/// and are written straight back so they never run twice.
pub const CURRENT_SCHEMA_VERSION: u32 = 3;

const AGENT_CATEGORIES: &[&str] = &[
    "agent.question",
    "agent.plan",
    "agent.approval",
    "agent.turn",
    "agent.turns-missed",
    "agent.failed",
    "agent.interrupted",
    "agent.limited",
    "agent.report",
];
const WORKSTREAM_CATEGORIES: &[&str] = &[
    "workstream.unblocked",
    "workstream.invalidated",
    "workstream.reopened",
    "workstream.conflict",
    "workstream.proposal",
    "workstream.ready",
];

/// An old toggle that was off turns the popups of the categories that
/// replaced it off. One that was on, or never set, leaves their defaults.
fn seed_popups(
    categories: &mut std::collections::BTreeMap<String, models::ActivityCategoryChannels>,
    names: &[&str],
    old: Option<bool>,
) {
    if old != Some(false) {
        return;
    }
    for name in names {
        categories.entry(name.to_string()).or_default().popup = Some(false);
    }
}

/// Apply one-off migrations for settings written by older versions. Returns
/// `true` when anything changed (the caller persists in that case).
pub fn migrate(settings: &mut AppSettings) -> bool {
    let from = settings.schema_version;
    if from >= CURRENT_SCHEMA_VERSION {
        return false;
    }
    if from < 1 {
        // v1 (2.1.0): the Agent Overview used to default to enabled +
        // auto-open, and `startMinimizedToTray` was a dead toggle that the
        // reveal path now honours. Reset both so nobody's launch behaviour
        // silently changes: the window keeps appearing at startup, and the
        // Agent Overview stops opening a third WebView2 every boot.
        settings.ui.start_minimized_to_tray = false;
    }
    if from < 2 {
        // Direct Anthropic API access was retired in favour of the user's
        // authenticated Claude/Codex CLI. Remove the obsolete credential.
        // Keep the migration pure in unit tests: keyring access would otherwise
        // mutate the developer's real Windows credential store.
        #[cfg(not(test))]
        {
            if let Ok(entry) = crate::keychain::entry("borgdock:claude_api") {
                let _ = entry.delete_credential();
            }
        }
    }
    if from < 3 {
        // v3 (activity journal, #88): every popup comes from an activity
        // entry. The old per-feature toggles seed the categories that replace
        // them, then go; `skip_serializing` drops them on the next save.
        let workstreams = settings
            .workstreams
            .as_mut()
            .and_then(|w| w.notifications.take());
        let dispatch = settings.agents.dispatch_notifications.take();
        let n = &mut settings.notifications;
        let categories = &mut n.activity.categories;
        seed_popups(
            categories,
            &["pr.checks-failed", "pr.checks-passed"],
            n.toast_on_check_status_change.take(),
        );
        seed_popups(
            categories,
            &["pr.review", "pr.review-request", "pr.findings"],
            n.toast_on_review_update.take(),
        );
        seed_popups(categories, &["pr.ready"], n.toast_on_mergeable.take());
        seed_popups(categories, AGENT_CATEGORIES, dispatch);
        seed_popups(
            categories,
            &["ci.group-grew"],
            n.ci_failure_group_grows.take(),
        );
        seed_popups(
            categories,
            &["ci.owner-stale"],
            n.ci_failure_owner_stale.take(),
        );
        seed_popups(
            categories,
            &["ci.fix-merged", "ci.seen-after-fix"],
            n.ci_failure_fix_merged.take(),
        );
        seed_popups(categories, WORKSTREAM_CATEGORIES, workstreams);
        n.channels.tray = None;
        n.channels.system = None;
        n.channels.email_digest = None;
    }
    settings.schema_version = CURRENT_SCHEMA_VERSION;
    log::info!("settings: migrated schema {from} -> {CURRENT_SCHEMA_VERSION}");
    true
}

/// Load settings without the `#[tauri::command]` wrapper — callable from other Rust modules.
pub fn load_settings_internal() -> Result<AppSettings, String> {
    let dir = settings_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create settings dir: {e}"))?;

    let main_path = settings_path();

    let mut settings = if main_path.exists() {
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

    if migrate(&mut settings) {
        if let Err(e) = save_settings_internal(&settings) {
            log::warn!("settings: failed to persist migrated settings: {e}");
        }
    }

    #[cfg(debug_assertions)]
    {
        return apply_dev_overlay(settings);
    }

    #[allow(unreachable_code)]
    Ok(settings)
}

/// File read + parse + (on first run) Credential Manager writes — all
/// blocking, so this runs on a blocking thread, never inline on the GUI
/// thread the way a sync command would.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn load_settings() -> Result<AppSettings, String> {
    tokio::task::spawn_blocking(|| {
        let mut settings = load_settings_internal()?;
        migrate_credentials_to_keychain(&mut settings);
        Ok(settings)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::merge_json;
    use serde_json::json;

    #[test]
    fn v3_seeds_activity_popups_from_the_old_toggles_and_drops_them() {
        let mut settings: super::AppSettings = serde_json::from_value(json!({
            "schemaVersion": 2,
            "notifications": {
                "toastOnCheckStatusChange": false,
                "toastOnReviewUpdate": true,
                "ciFailureOwnerStale": false,
                "channels": { "tray": true, "system": false, "sound": false, "emailDigest": true }
            },
            "agents": { "dispatchNotifications": false },
            "workstreams": { "notifications": false }
        }))
        .unwrap();
        assert!(super::migrate(&mut settings));
        let categories = &settings.notifications.activity.categories;
        assert_eq!(categories["pr.checks-failed"].popup, Some(false));
        assert_eq!(categories["pr.checks-passed"].popup, Some(false));
        assert_eq!(categories["ci.owner-stale"].popup, Some(false));
        assert_eq!(categories["agent.question"].popup, Some(false));
        assert_eq!(categories["workstream.ready"].popup, Some(false));
        assert!(
            !categories.contains_key("pr.review"),
            "a toggle that was on keeps the default"
        );
        assert!(
            !categories.contains_key("ci.group-grew"),
            "an unset toggle keeps the default"
        );

        let saved = serde_json::to_value(&settings).unwrap();
        let notifications = &saved["notifications"];
        for gone in [
            "toastOnCheckStatusChange",
            "toastOnReviewUpdate",
            "ciFailureOwnerStale",
        ] {
            assert!(notifications.get(gone).is_none(), "{gone} is written back");
        }
        assert_eq!(notifications["channels"], json!({ "sound": false }));
        assert!(saved["agents"].get("dispatchNotifications").is_none());
        assert!(saved["workstreams"].get("notifications").is_none());
        assert!(!super::migrate(&mut settings), "it runs once");
    }

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

/// Save settings to disk without the `#[tauri::command]` wrapper — callable
/// from other Rust modules (e.g. window close handlers).
pub fn save_settings_internal(settings: &AppSettings) -> Result<(), String> {
    let dir = settings_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create settings dir: {e}"))?;

    atomic_write(&backup_path(), settings)?;
    let path = settings_path();
    atomic_write(&path, settings)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn save_settings(settings: AppSettings) -> Result<(), String> {
    tokio::task::spawn_blocking(move || save_settings_internal(&settings))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}
