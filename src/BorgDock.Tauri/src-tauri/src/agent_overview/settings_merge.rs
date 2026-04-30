use serde_json::{Map, Value};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const KEYS: &[&str] = &[
    "CLAUDE_CODE_ENABLE_TELEMETRY",
    "OTEL_LOGS_EXPORTER",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
    "OTEL_LOGS_EXPORT_INTERVAL",
    "OTEL_LOG_USER_PROMPTS",
    "OTEL_LOG_TOOL_DETAILS",
];

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
