//! Which T3 server a command talks to, and the token BorgDock holds for it.

use serde::Deserialize;
use std::path::PathBuf;

/// Id of the T3 running on this machine.
pub const LOCAL_HOST_ID: &str = "local";

const LOCAL_TOKEN_SERVICE: &str = "borgdock:t3";

/// A T3 server as the frontend names it. `base_url` is absent for the T3 on
/// this machine, whose address comes from T3's own runtime file.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRef {
    pub id: String,
    #[serde(default)]
    pub base_url: Option<String>,
}

impl HostRef {
    pub fn local() -> Self {
        Self {
            id: LOCAL_HOST_ID.to_string(),
            base_url: None,
        }
    }

    pub fn is_local(&self) -> bool {
        self.id == LOCAL_HOST_ID
    }
}

/// A host with its address resolved.
#[derive(Debug, Clone)]
pub struct Host {
    pub id: String,
    /// `http://127.0.0.1:3773`, without a trailing slash.
    pub origin: String,
    pub is_local: bool,
}

#[derive(Debug, Deserialize)]
struct RuntimeFile {
    origin: String,
}

pub fn userdata_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".t3").join("userdata"))
        .ok_or_else(|| "Could not determine the home directory".to_string())
}

fn local_origin() -> Result<String, String> {
    let path = userdata_dir()?.join("server-runtime.json");
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("T3 runtime file is unavailable ({}): {e}", path.display()))?;
    let runtime: RuntimeFile =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid T3 runtime file: {e}"))?;
    Ok(runtime.origin)
}

fn normalized_origin(origin: &str) -> Result<String, String> {
    let trimmed = origin.trim().trim_end_matches('/');
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        Ok(trimmed.to_string())
    } else {
        Err(format!(
            "T3 host address must start with http:// or https:// (got '{origin}')"
        ))
    }
}

/// Keychain entry holding the access token for `host_id`.
pub fn token_service(host_id: &str) -> String {
    if host_id == LOCAL_HOST_ID {
        LOCAL_TOKEN_SERVICE.to_string()
    } else {
        format!("{LOCAL_TOKEN_SERVICE}:{host_id}")
    }
}

pub async fn resolve(host: &HostRef) -> Result<Host, String> {
    let origin = match host
        .base_url
        .as_deref()
        .filter(|url| !url.trim().is_empty())
    {
        Some(url) => normalized_origin(url)?,
        None if host.is_local() => {
            let origin = tokio::task::spawn_blocking(local_origin)
                .await
                .map_err(|e| e.to_string())??;
            normalized_origin(&origin)?
        }
        None => return Err(format!("T3 host '{}' has no address", host.id)),
    };
    Ok(Host {
        id: host.id.clone(),
        origin,
        is_local: host.is_local(),
    })
}

/// The stored access token, or `None` when BorgDock is not paired with the host.
pub async fn token(host_id: &str) -> Result<Option<String>, String> {
    let service = token_service(host_id);
    tokio::task::spawn_blocking(move || crate::keychain::get_credential_blocking(&service))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn require_token(host_id: &str) -> Result<String, String> {
    token(host_id)
        .await?
        .ok_or_else(|| "BorgDock is not paired with T3. Pair it in Settings, Agents.".to_string())
}

pub async fn store_token(host_id: &str, access_token: String) -> Result<(), String> {
    crate::keychain::set_credential(token_service(host_id), access_token).await
}

pub async fn forget_token(host_id: &str) -> Result<(), String> {
    crate::keychain::delete_credential(token_service(host_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_local_host_keeps_the_token_entry_it_always_had() {
        assert_eq!(token_service(LOCAL_HOST_ID), "borgdock:t3");
        assert_eq!(token_service("mac-mini"), "borgdock:t3:mac-mini");
    }

    #[test]
    fn origins_lose_their_trailing_slash_and_need_a_scheme() {
        assert_eq!(
            normalized_origin(" http://127.0.0.1:3773/ ").unwrap(),
            "http://127.0.0.1:3773"
        );
        assert!(normalized_origin("mac-mini:3773").is_err());
    }
}
