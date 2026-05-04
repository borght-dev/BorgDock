use crate::agent_overview::cwd_resolver::{find_git_root_for, read_cwd_from_jsonl};
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const KEYS: &[&str] = &[
    "CLAUDE_CODE_ENABLE_TELEMETRY",
    "OTEL_LOGS_EXPORTER",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
    "OTEL_LOGS_EXPORT_INTERVAL",
    "OTEL_LOG_USER_PROMPTS",
    "OTEL_LOG_TOOL_DETAILS",
];

/// Walk `<projects_root>/*/<sid>.jsonl`, find session logs whose mtime is
/// within `recency`, derive each session's cwd from the file content, walk
/// up to a `.git` root, and call `ensure_env` on `<git_root>/.claude/settings.json`
/// IF that file already exists. Returns the list of settings.json paths
/// actually modified.
///
/// Conservative: never CREATES a new project-local settings.json (a missing
/// file means user-level settings already apply). Idempotent: re-running
/// against an already-synced project is a no-op.
pub fn sync_active_project_settings(
    projects_root: &Path,
    port: u16,
    export_interval_ms: u32,
    recency: Duration,
) -> Vec<PathBuf> {
    let mut modified: Vec<PathBuf> = Vec::new();
    let mut seen_roots: HashSet<PathBuf> = HashSet::new();

    let pattern = format!(
        "{}/*/*.jsonl",
        projects_root.display().to_string().replace('\\', "/"),
    );
    let cutoff = SystemTime::now()
        .checked_sub(recency)
        .unwrap_or(UNIX_EPOCH);

    let entries = glob::glob(&pattern).ok().into_iter().flatten().flatten();
    for jsonl_path in entries {
        let mtime = match std::fs::metadata(&jsonl_path).and_then(|m| m.modified()) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if mtime < cutoff {
            continue;
        }
        let Some(cwd) = read_cwd_from_jsonl(&jsonl_path) else { continue };
        let Some(git_root) = find_git_root_for(&cwd) else { continue };
        if !seen_roots.insert(git_root.clone()) {
            continue;
        }
        let settings_path = git_root.join(".claude").join("settings.json");
        if !settings_path.exists() {
            continue;
        }
        match ensure_env(&settings_path, port, export_interval_ms) {
            Ok(true) => modified.push(settings_path),
            Ok(false) => {}
            Err(e) => log::warn!(
                "agent_overview: ensure_env failed on {}: {e}",
                settings_path.display()
            ),
        }
    }
    modified
}

/// Compute the OTel env values BorgDock expects for a given port/interval.
/// Returned as `(key, expected_value)` pairs in a stable order.
fn expected_env_pairs(port: u16, export_interval_ms: u32) -> [(&'static str, String); 7] {
    [
        ("CLAUDE_CODE_ENABLE_TELEMETRY", "1".into()),
        ("OTEL_LOGS_EXPORTER", "otlp".into()),
        ("OTEL_EXPORTER_OTLP_PROTOCOL", "http/json".into()),
        ("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", format!("http://127.0.0.1:{port}/v1/logs")),
        ("OTEL_LOGS_EXPORT_INTERVAL", export_interval_ms.to_string()),
        ("OTEL_LOG_USER_PROMPTS", "1".into()),
        ("OTEL_LOG_TOOL_DETAILS", "1".into()),
    ]
}

/// Ensure that the settings.json at `path` has every expected OTel env
/// variable set to BorgDock's current value. Returns Ok(true) if a write
/// happened, Ok(false) if the file already had everything (idempotent).
///
/// Used to overlay OTel env onto project-local `.claude/settings.json`
/// files that exist but lack telemetry — without it, sessions started in
/// those project directories may not export OTel even when the user-level
/// settings say they should.
pub fn ensure_env(path: &Path, port: u16, export_interval_ms: u32) -> Result<bool, String> {
    if path_already_has_expected_env(path, port, export_interval_ms)? {
        return Ok(false);
    }
    enable(path, port, export_interval_ms)?;
    Ok(true)
}

fn path_already_has_expected_env(
    path: &Path,
    port: u16,
    export_interval_ms: u32,
) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let value = parse_or_empty(&content);
    let env = match value.as_object().and_then(|o| o.get("env")).and_then(|v| v.as_object()) {
        Some(e) => e,
        None => return Ok(false),
    };
    for (key, expected) in expected_env_pairs(port, export_interval_ms) {
        match env.get(key).and_then(|v| v.as_str()) {
            Some(found) if found == expected => continue,
            _ => return Ok(false),
        }
    }
    Ok(true)
}

pub fn enable(path: &Path, port: u16, export_interval_ms: u32) -> Result<(), String> {
    let original = read_or_empty(path)?;
    backup_if_present(path, &original)?;

    let mut value = parse_or_empty(&original);
    let env = ensure_env_object(&mut value);
    env.insert("CLAUDE_CODE_ENABLE_TELEMETRY".into(), "1".into());
    env.insert("OTEL_LOGS_EXPORTER".into(), "otlp".into());
    env.insert("OTEL_EXPORTER_OTLP_PROTOCOL".into(), "http/json".into());
    env.insert(
        "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT".into(),
        format!("http://127.0.0.1:{port}/v1/logs").into(),
    );
    env.insert(
        "OTEL_LOGS_EXPORT_INTERVAL".into(),
        export_interval_ms.to_string().into(),
    );
    env.insert("OTEL_LOG_USER_PROMPTS".into(), "1".into());
    env.insert("OTEL_LOG_TOOL_DETAILS".into(), "1".into());
    write_pretty(path, &value)
}

pub fn disable(path: &Path) -> Result<(), String> {
    let original = read_or_empty(path)?;
    if original.is_empty() {
        return Ok(());
    }
    backup_if_present(path, &original)?;
    let mut value = parse_or_empty(&original);
    if let Some(env) = value
        .as_object_mut()
        .and_then(|m| m.get_mut("env"))
        .and_then(|v| v.as_object_mut())
    {
        for k in KEYS {
            env.remove(*k);
        }
    }
    write_pretty(path, &value)
}

fn read_or_empty(path: &Path) -> Result<String, String> {
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

fn backup_if_present(path: &Path, content: &str) -> Result<(), String> {
    if content.is_empty() {
        return Ok(());
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = path.with_extension(format!("json.bak.{ts}"));
    std::fs::write(&backup, content).map_err(|e| e.to_string())
}

fn parse_or_empty(s: &str) -> Value {
    if s.trim().is_empty() {
        Value::Object(Map::new())
    } else {
        serde_json::from_str(s).unwrap_or_else(|_| Value::Object(Map::new()))
    }
}

fn ensure_env_object(value: &mut Value) -> &mut Map<String, Value> {
    let obj = value.as_object_mut().expect("settings root must be an object");
    if !obj.contains_key("env") || !obj.get("env").map(|v| v.is_object()).unwrap_or(false) {
        obj.insert("env".into(), Value::Object(Map::new()));
    }
    obj.get_mut("env").unwrap().as_object_mut().unwrap()
}

fn write_pretty(path: &Path, value: &Value) -> Result<(), String> {
    let s = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, s).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn enable_creates_file_and_writes_env() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        enable(&p, 4318, 2000).unwrap();
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"], "1");
        assert_eq!(v["env"]["OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"], "http://127.0.0.1:4318/v1/logs");
        assert_eq!(v["env"]["OTEL_LOGS_EXPORT_INTERVAL"], "2000");
    }

    #[test]
    fn enable_preserves_other_fields_and_backs_up() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        fs::write(&p, r#"{ "theme": "dark", "env": { "EXISTING": "ok" } }"#).unwrap();
        enable(&p, 4318, 2000).unwrap();
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["theme"], "dark");
        assert_eq!(v["env"]["EXISTING"], "ok");
        assert_eq!(v["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"], "1");
        // Backup file present with original content
        let backups: Vec<_> = fs::read_dir(tmp.path()).unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".json.bak."))
            .collect();
        assert_eq!(backups.len(), 1);
    }

    /// ensure_env should write OTel env into a project-local settings.json
    /// that has other keys but no env, while preserving those other keys.
    #[test]
    fn ensure_env_writes_when_settings_lacks_env() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        fs::write(&p, r#"{"enabledPlugins":{}}"#).unwrap();

        let changed = ensure_env(&p, 4318, 2000).unwrap();
        assert!(changed, "should report write");
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"], "1");
        // Pre-existing key preserved.
        assert!(v["enabledPlugins"].is_object());
    }

    /// Idempotency: repeated calls on a file that already has all the
    /// expected OTel values must not rewrite (no churn, no spurious backups).
    #[test]
    fn ensure_env_is_idempotent_when_already_correct() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        // First call writes.
        assert!(ensure_env(&p, 4318, 2000).unwrap());
        let backups_before: usize = fs::read_dir(tmp.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".json.bak."))
            .count();

        // Second call should be a no-op.
        let changed = ensure_env(&p, 4318, 2000).unwrap();
        assert!(!changed, "second call must not report change");

        let backups_after: usize = fs::read_dir(tmp.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".json.bak."))
            .count();
        assert_eq!(backups_before, backups_after, "no new backup on no-op");
    }

    /// If the endpoint port has drifted (BorgDock fell back from 4318 to 4319),
    /// ensure_env must rewrite the file with the new value.
    #[test]
    fn ensure_env_rewrites_when_endpoint_port_changes() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        ensure_env(&p, 4318, 2000).unwrap();

        let changed = ensure_env(&p, 4319, 2000).unwrap();
        assert!(changed);
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["env"]["OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"], "http://127.0.0.1:4319/v1/logs");
    }

    /// End-to-end: a fake projects tree with a recent jsonl pointing to a
    /// fake git repo with an existing settings.json. After sync, the repo's
    /// settings.json must contain the OTel env block.
    #[test]
    fn sync_updates_existing_project_settings_for_recent_jsonls() {
        let tmp = tempfile::tempdir().unwrap();
        let projects_root = tmp.path().join("projects");
        let proj = projects_root.join("E--MyRepo");
        fs::create_dir_all(&proj).unwrap();

        // Set up a fake repo: tmp/MyRepo with .git and an existing settings.json
        let repo_root = tmp.path().join("MyRepo");
        let claude_dir = repo_root.join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        fs::create_dir_all(repo_root.join(".git")).unwrap();
        let settings_path = claude_dir.join("settings.json");
        fs::write(&settings_path, r#"{"enabledPlugins":{}}"#).unwrap();

        // jsonl with cwd pointing at the repo root.
        let cwd_str = repo_root.display().to_string().replace('\\', "\\\\");
        let lines = format!(
            r#"{{"type":"meta","sessionId":"sid"}}
{{"type":"x","cwd":"{cwd_str}","sessionId":"sid","gitBranch":"main"}}"#,
        );
        fs::write(proj.join("sid.jsonl"), &lines).unwrap();

        let modified = sync_active_project_settings(
            &projects_root, 4318, 2000, Duration::from_secs(3_600),
        );
        assert_eq!(modified.len(), 1);
        let v: Value = serde_json::from_str(&fs::read_to_string(&settings_path).unwrap()).unwrap();
        assert_eq!(v["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"], "1");
        assert_eq!(v["env"]["OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"], "http://127.0.0.1:4318/v1/logs");
        // Pre-existing key preserved.
        assert!(v["enabledPlugins"].is_object());
    }

    /// Conservative: don't create a project-local settings.json that didn't
    /// already exist. (Missing file = user-level settings already apply.)
    #[test]
    fn sync_does_not_create_settings_when_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let projects_root = tmp.path().join("projects");
        let proj = projects_root.join("E--Untouched");
        fs::create_dir_all(&proj).unwrap();

        let repo_root = tmp.path().join("Untouched");
        fs::create_dir_all(repo_root.join(".git")).unwrap();
        // No .claude/settings.json deliberately.

        let cwd_str = repo_root.display().to_string().replace('\\', "\\\\");
        let lines = format!(
            r#"{{"type":"x","cwd":"{cwd_str}","sessionId":"sid"}}"#,
        );
        fs::write(proj.join("sid.jsonl"), &lines).unwrap();

        let modified = sync_active_project_settings(
            &projects_root, 4318, 2000, Duration::from_secs(3_600),
        );
        assert!(modified.is_empty());
        assert!(!repo_root.join(".claude").join("settings.json").exists());
    }

    #[test]
    fn disable_removes_only_our_keys() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        enable(&p, 4318, 2000).unwrap();
        // Add a non-our key to env
        let mut v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        v["env"]["KEEP_ME"] = "yes".into();
        fs::write(&p, serde_json::to_string_pretty(&v).unwrap()).unwrap();

        disable(&p).unwrap();
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert!(v["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"].is_null());
        assert_eq!(v["env"]["KEEP_ME"], "yes");
    }
}
