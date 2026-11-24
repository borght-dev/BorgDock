//! T3 Code runs agents through provider instances, and its settings say what
//! each is called and which folder it signs in from. That links a T3 thread
//! to the account whose limits it spends.

use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default)]
    provider_instances: BTreeMap<String, Instance>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Instance {
    driver: Option<String>,
    display_name: Option<String>,
    enabled: Option<bool>,
    config: Option<InstanceConfig>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstanceConfig {
    home_path: Option<String>,
}

/// One enabled provider instance of the T3 Code install on this machine.
#[derive(Debug, Clone, PartialEq)]
pub struct T3Instance {
    pub id: String,
    /// `claude` or `codex`.
    pub provider: &'static str,
    pub name: Option<String>,
    /// The folder it signs in from: its own, or the provider's default.
    pub folder: PathBuf,
}

fn provider_of(driver: &str) -> Option<(&'static str, &'static str)> {
    match driver {
        "claudeAgent" => Some(("claude", ".claude")),
        "codex" => Some(("codex", ".codex")),
        _ => None,
    }
}

/// T3 writes a folder in full or from the home directory (`~/.claude-ops`).
fn folder_in(path: &str, home: &Path) -> PathBuf {
    match path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        Some(rest) => home.join(rest),
        None => PathBuf::from(path),
    }
}

/// The instances in T3 Code's settings, or none when T3 is not installed.
pub fn instances(home: &Path) -> Vec<T3Instance> {
    let settings = std::fs::read_to_string(home.join(".t3/userdata/settings.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Settings>(&text).ok());
    let Some(settings) = settings else {
        return Vec::new();
    };
    settings
        .provider_instances
        .into_iter()
        .filter(|(_, instance)| instance.enabled != Some(false))
        .filter_map(|(id, instance)| {
            let (provider, default_folder) = provider_of(instance.driver.as_deref()?)?;
            let own_folder = instance
                .config
                .and_then(|config| config.home_path)
                .filter(|path| !path.trim().is_empty())
                .map(|path| folder_in(path.trim(), home));
            Some(T3Instance {
                id,
                provider,
                name: instance.display_name.filter(|name| !name.trim().is_empty()),
                folder: own_folder.unwrap_or_else(|| home.join(default_folder)),
            })
        })
        .collect()
}

fn same_folder(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// The instances that run on the account in `folder`.
pub fn instances_of<'a>(
    all: &'a [T3Instance],
    provider: &str,
    folder: &Path,
) -> Vec<&'a T3Instance> {
    all.iter()
        .filter(|instance| instance.provider == provider && same_folder(&instance.folder, folder))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn t3_settings(home: &Path, settings: serde_json::Value) {
        let folder = home.join(".t3/userdata");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("settings.json"), settings.to_string()).unwrap();
    }

    #[test]
    fn instances_name_the_folder_they_sign_in_from() {
        let home = tempfile::tempdir().unwrap();
        let ops = home.path().join(".claude-ops");
        std::fs::create_dir_all(&ops).unwrap();
        std::fs::create_dir_all(home.path().join(".claude")).unwrap();
        t3_settings(
            home.path(),
            json!({ "providerInstances": {
                "claudeAgent": { "driver": "claudeAgent", "displayName": "Acme", "enabled": true,
                    "config": { "homePath": "" } },
                "claudeAgent_ops": { "driver": "claudeAgent", "displayName": "Ops",
                    "config": { "homePath": ops.to_string_lossy() } },
                "claudeAgent_tilde": { "driver": "claudeAgent", "displayName": "Tilde",
                    "config": { "homePath": "~/.claude-ops" } },
                "codex": { "driver": "codex", "displayName": "Example", "enabled": false },
                "grok": { "driver": "grok", "enabled": true },
            }}),
        );
        let all = instances(home.path());
        assert_eq!(all.len(), 3);
        let on_ops = instances_of(&all, "claude", &ops);
        let ids: Vec<&str> = on_ops.iter().map(|instance| instance.id.as_str()).collect();
        assert_eq!(ids, vec!["claudeAgent_ops", "claudeAgent_tilde"]);
        assert_eq!(on_ops[0].name.as_deref(), Some("Ops"));
        let on_default = instances_of(&all, "claude", &home.path().join(".claude"));
        assert_eq!(on_default[0].id, "claudeAgent");
        assert!(instances_of(&all, "codex", &home.path().join(".codex")).is_empty());
    }

    #[test]
    fn a_machine_without_t3_has_no_instances() {
        let home = tempfile::tempdir().unwrap();
        assert!(instances(home.path()).is_empty());
        t3_settings(home.path(), json!("not settings"));
        assert!(instances(home.path()).is_empty());
    }
}
