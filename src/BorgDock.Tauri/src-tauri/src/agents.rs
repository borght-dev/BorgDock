use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadlessPromptRequest {
    pub provider: String,
    pub prompt: String,
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub executable: Option<String>,
    pub timeout_seconds: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAvailability {
    pub claude: bool,
    pub codex: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadlessPromptResult {
    pub text: String,
    pub provider: String,
    pub model: String,
    pub duration_ms: u64,
}

fn hidden_tokio_command(program: &str) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(0x08000000);
    }
    command
}

async fn executable_available(program: &str) -> bool {
    let mut command = hidden_tokio_command(program);
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    matches!(
        tokio::time::timeout(Duration::from_secs(3), command.status()).await,
        Ok(Ok(status)) if status.success()
    )
}

#[tauri::command]
pub async fn agent_provider_availability(
    claude_path: Option<String>,
    codex_path: Option<String>,
) -> AgentAvailability {
    let claude = claude_path
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "claude".into());
    let codex = codex_path
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "codex".into());
    let (claude, codex) = tokio::join!(executable_available(&claude), executable_available(&codex));
    AgentAvailability { claude, codex }
}

fn parse_claude_output(bytes: &[u8]) -> Result<String, String> {
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|e| format!("Claude returned invalid JSON: {e}"))?;
    value["result"]
        .as_str()
        .filter(|text| !text.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "Claude returned no result".to_string())
}

fn parse_codex_output(bytes: &[u8]) -> Result<String, String> {
    let output = String::from_utf8_lossy(bytes);
    output
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .filter_map(|event| {
            let item = event.get("item")?;
            (event["type"].as_str() == Some("item.completed")
                && item["type"].as_str() == Some("agent_message"))
            .then(|| item["text"].as_str().map(str::to_owned))
            .flatten()
        })
        .last()
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(|| "Codex returned no final message".to_string())
}

/// Run a short, non-interactive agent task. Prompts are sent over stdin so
/// secrets and large PR bodies do not appear in the process list.
#[tauri::command]
pub async fn run_headless_prompt(
    request: HeadlessPromptRequest,
) -> Result<HeadlessPromptResult, String> {
    let started = std::time::Instant::now();
    let provider = request.provider.to_lowercase();
    let requested_model = request.model.clone().unwrap_or_else(|| "default".into());
    let executable = request
        .executable
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| provider.clone());
    let mut command = hidden_tokio_command(&executable);
    match provider.as_str() {
        "claude" => {
            // `--bare` deliberately is not used: current Claude Code disables
            // OAuth/keychain auth in bare mode, while BorgDock must reuse the
            // user's CLI subscription and never ask for an API key.
            command.args([
                "-p",
                "--restricted",
                "--no-session-persistence",
                "--output-format",
                "json",
            ]);
            if let Some(model) = request.model.as_deref().filter(|v| !v.is_empty()) {
                command.args(["--model", model]);
            }
        }
        "codex" => {
            command.args(["exec", "--json", "--ephemeral", "-s", "read-only"]);
            if let Some(model) = request.model.as_deref().filter(|v| !v.is_empty()) {
                command.args(["--model", model]);
            }
            command.arg("-");
        }
        _ => {
            return Err(format!(
                "Unsupported headless provider: {}",
                request.provider
            ))
        }
    }
    if let Some(cwd) = request.cwd.as_deref().filter(|v| !v.is_empty()) {
        command.current_dir(cwd);
    }
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to start {provider}: {e}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| format!("Failed to open {provider} stdin"))?
        .write_all(request.prompt.as_bytes())
        .await
        .map_err(|e| format!("Failed to send prompt to {provider}: {e}"))?;

    let timeout = Duration::from_secs(request.timeout_seconds.unwrap_or(90).clamp(5, 600));
    let output = tokio::time::timeout(timeout, child.wait_with_output())
        .await
        .map_err(|_| format!("{provider} timed out after {} seconds", timeout.as_secs()))?
        .map_err(|e| format!("Failed while waiting for {provider}: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "{provider} exited with {}: {}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }
    let text = match provider.as_str() {
        "claude" => parse_claude_output(&output.stdout),
        "codex" => parse_codex_output(&output.stdout),
        _ => unreachable!(),
    }?;
    Ok(HeadlessPromptResult {
        text,
        provider,
        model: requested_model,
        duration_ms: started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_claude_json() {
        assert_eq!(
            parse_claude_output(br#"{"result":"summary"}"#).unwrap(),
            "summary"
        );
    }

    #[test]
    fn parses_codex_final_message() {
        let jsonl = br#"{"type":"thread.started"}
{"type":"item.completed","item":{"type":"agent_message","text":"summary"}}
"#;
        assert_eq!(parse_codex_output(jsonl).unwrap(), "summary");
    }
}
