pub mod ado;

use crate::git::hidden_command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhAccount {
    pub login: String,
    pub active: bool,
}

/// Spawns `gh auth token` (200–3000 ms cold on Windows). Async so the
/// subprocess wait happens on a blocking thread, not the GUI thread.
#[tauri::command]
pub async fn gh_cli_token(user: Option<String>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || gh_cli_token_blocking(user.as_deref()))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

/// Blocking body of `gh_cli_token`, shared with `check_github_auth` and the
/// maintenance self-test. Always call through `spawn_blocking`.
pub(crate) fn gh_cli_token_blocking(user: Option<&str>) -> Result<String, String> {
    let mut command = hidden_command("gh");
    command.args(["auth", "token"]);
    if let Some(login) = user.filter(|value| !value.trim().is_empty()) {
        command.args(["--hostname", "github.com", "--user", login]);
    }
    let output = command
        .output()
        .map_err(|e| format!("Failed to run `gh auth token`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "gh auth token failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Err("gh auth token returned empty output".to_string());
    }

    Ok(token)
}

/// Accounts already authenticated in the GitHub CLI. This is intentionally a
/// separate command from token lookup so Settings can populate account pickers
/// without exposing credentials to the UI.
#[tauri::command]
pub async fn gh_cli_accounts() -> Result<Vec<GhAccount>, String> {
    tokio::task::spawn_blocking(|| {
        let output = hidden_command("gh")
            .args([
                "auth",
                "status",
                "--hostname",
                "github.com",
                "--json",
                "hosts",
            ])
            .output()
            .map_err(|e| format!("Failed to run `gh auth status`: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        let json: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse `gh auth status`: {e}"))?;
        let accounts = json["hosts"]["github.com"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|entry| entry["state"].as_str() == Some("success"))
            .filter_map(|entry| {
                Some(GhAccount {
                    login: entry["login"].as_str()?.to_string(),
                    active: entry["active"].as_bool().unwrap_or(false),
                })
            })
            .collect();
        Ok(accounts)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn validate_pat(token: String) -> Result<String, String> {
    // Spawn blocking HTTP call to test the token against GitHub API
    let result = tokio::task::spawn_blocking(move || {
        let client = reqwest::blocking::Client::new();
        let resp = client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", "BorgDock")
            .header("Accept", "application/vnd.github+json")
            .send()
            .map_err(|e| format!("HTTP request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!(
                "GitHub API returned status {}",
                resp.status().as_u16()
            ));
        }

        let body: serde_json::Value = resp
            .json()
            .map_err(|e| format!("Failed to parse response: {e}"))?;
        let login = body["login"].as_str().unwrap_or("unknown").to_string();

        Ok(login)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;

    result
}

#[tauri::command]
pub async fn check_github_auth(
    method: String,
    pat: Option<String>,
    user: Option<String>,
) -> Result<String, String> {
    match method.as_str() {
        "ghCli" => {
            // Try gh CLI
            let token = gh_cli_token(user).await?;
            validate_pat(token).await
        }
        "pat" => {
            let token = pat.ok_or("PAT is required when method is 'pat'")?;
            if token.trim().is_empty() {
                return Err("PAT is empty".to_string());
            }
            validate_pat(token).await
        }
        _ => Err(format!("Unknown auth method: {method}")),
    }
}
