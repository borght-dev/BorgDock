use std::process::Command;

#[tauri::command]
pub fn gh_cli_token() -> Result<String, String> {
    let output = Command::new("gh")
        .args(["auth", "token"])
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

#[tauri::command]
pub async fn validate_pat(token: String) -> Result<String, String> {
    // Spawn blocking HTTP call to test the token against GitHub API
    let result = tokio::task::spawn_blocking(move || {
        let client = reqwest::blocking::Client::new();
        let resp = client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", "PRDock")
            .header("Accept", "application/vnd.github+json")
            .send()
            .map_err(|e| format!("HTTP request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!(
                "GitHub API returned status {}",
                resp.status().as_u16()
            ));
        }

        let body: serde_json::Value = resp.json().map_err(|e| format!("Failed to parse response: {e}"))?;
        let login = body["login"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        Ok(login)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;

    result
}

#[tauri::command]
pub async fn check_github_auth(method: String, pat: Option<String>) -> Result<String, String> {
    match method.as_str() {
        "ghCli" => {
            // Try gh CLI
            let token = gh_cli_token()?;
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
