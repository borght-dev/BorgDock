use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncWriteExt;

mod sources;
use sources::{neutral_directory, PromptSource, SourceBundle, SourceRead};

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct HeadlessPromptRequest {
    pub provider: String,
    pub prompt: String,
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub executable: Option<String>,
    pub timeout_seconds: Option<u64>,
    /// Reasoning effort: Claude's `--effort`, Codex's `model_reasoning_effort`.
    pub effort: Option<String>,
    /// Codex's fast service tier. Claude has none and ignores it.
    pub fast: Option<bool>,
    pub sources: Option<Vec<PromptSource>>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AgentAvailability {
    pub claude: bool,
    pub codex: bool,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct HeadlessPromptResult {
    pub text: String,
    pub provider: String,
    pub model: String,
    pub duration_ms: u64,
    pub reads: Option<Vec<SourceRead>>,
}

fn hidden_tokio_command(program: &str) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(crate::agent_program::resolve(program));
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
#[cfg_attr(test, specta::specta)]
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

const CLAUDE_EFFORTS: &[&str] = &["low", "medium", "high", "xhigh", "max"];
const CODEX_EFFORTS: &[&str] = &["minimal", "low", "medium", "high", "xhigh"];

/// The effort when `allowed` knows it; anything else leaves the CLI's default.
fn effort_of<'a>(requested: Option<&'a str>, allowed: &[&str]) -> Option<&'a str> {
    requested.filter(|effort| allowed.contains(effort))
}

fn configure_codex_sandbox(command: &mut tokio::process::Command) {
    command.args(["-s", "read-only"]);
    // Ignoring user config also removes Windows' sandbox backend selection.
    #[cfg(windows)]
    command.args(["-c", "windows.sandbox=\"elevated\""]);
}

/// The arguments of a headless Claude run. The prompt goes in over stdin.
///
/// `--bare` deliberately is not used: current Claude Code disables
/// OAuth/keychain auth in bare mode, while BorgDock must reuse the user's
/// CLI subscription and never ask for an API key.
///
/// A summary reads the prompt and answers. `--restricted` still connects the
/// account's MCP servers and lists its skills and some twenty tools: seconds
/// of startup and ~25k tokens a run for things a summary never calls. It
/// keeps the three tools that look around the checkout. A session without a
/// name costs a second request that writes it a title.
///
/// The checkout is a directory the agent may read, never where it starts:
/// started inside a repository the CLI spends seconds on it at boot and
/// again before the request leaves (15 s against 7 s for a one-word prompt
/// on a busy machine).
fn claude_args(model: Option<&str>, effort: Option<&str>, checkout: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p",
        "--restricted",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--tools",
        "Read,Grep,Glob",
        "--no-session-persistence",
        "--name",
        "BorgDock summary",
        "--output-format",
        "json",
    ]
    .map(str::to_owned)
    .into();
    let mut option = |flag: &str, value: &str| args.extend([flag.to_owned(), value.to_owned()]);
    if let Some(model) = model.filter(|v| !v.is_empty()) {
        option("--model", model);
    }
    if let Some(effort) = effort_of(effort, CLAUDE_EFFORTS) {
        option("--effort", effort);
    }
    if let Some(checkout) = checkout {
        option("--add-dir", checkout);
    }
    args
}

fn parse_claude_output(bytes: &[u8]) -> Result<String, String> {
    let value =
        claude_result(bytes).ok_or_else(|| "Claude returned no result event".to_string())?;
    value["result"]
        .as_str()
        .filter(|text| !text.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "Claude returned no result".to_string())
}

fn claude_result(bytes: &[u8]) -> Option<serde_json::Value> {
    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) {
        return Some(value);
    }
    String::from_utf8_lossy(bytes)
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .filter(|event| event["type"] == "result")
        .last()
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

/// Why a `codex exec --json` run failed: its `turn.failed` event, else its
/// last `error` event. Codex prints these on stdout; stderr holds its logs.
fn codex_failure(stdout: &[u8]) -> Option<String> {
    let events: Vec<serde_json::Value> = String::from_utf8_lossy(stdout)
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();
    let message = |event: &serde_json::Value, pointer: &str| {
        event
            .pointer(pointer)
            .and_then(|v| v.as_str())
            .filter(|text| !text.trim().is_empty())
            .map(str::to_owned)
    };
    events
        .iter()
        .rev()
        .find(|e| e["type"].as_str() == Some("turn.failed"))
        .and_then(|e| message(e, "/error/message"))
        .or_else(|| {
            events
                .iter()
                .rev()
                .filter(|e| e["type"].as_str() == Some("error"))
                .find_map(|e| message(e, "/message"))
        })
}

/// The result text of a Claude run that reports `is_error`.
fn claude_failure(stdout: &[u8]) -> Option<String> {
    let value = claude_result(stdout)?;
    if value["is_error"].as_bool() != Some(true) {
        return None;
    }
    value["result"]
        .as_str()
        .filter(|text| !text.trim().is_empty())
        .map(str::to_owned)
}

/// The end of stderr, where a CLI that fails without a structured error says why.
fn stderr_tail(stderr: &[u8]) -> String {
    const KEEP: usize = 600;
    let text = String::from_utf8_lossy(stderr);
    let text = text.trim();
    match text.char_indices().rev().nth(KEEP - 1) {
        Some((at, _)) => format!("…{}", &text[at..]),
        None => text.to_owned(),
    }
}

/// Run a short, non-interactive agent task. Prompts are sent over stdin so
/// secrets and large PR bodies do not appear in the process list.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn run_headless_prompt(
    mut request: HeadlessPromptRequest,
) -> Result<HeadlessPromptResult, String> {
    let started = std::time::Instant::now();
    let provider = request.provider.to_lowercase();
    let requested_model = request.model.clone().unwrap_or_else(|| "default".into());
    let executable = request
        .executable
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| provider.clone());
    let checkout = request.cwd.as_deref().filter(|v| !v.is_empty());
    let bundle = request
        .sources
        .as_ref()
        .map(|sources| SourceBundle::create(sources, &mut request.prompt))
        .transpose()?;
    let mut command = hidden_tokio_command(&executable);
    match provider.as_str() {
        "claude" => {
            let mut args = claude_args(
                request.model.as_deref(),
                request.effort.as_deref(),
                checkout,
            );
            if bundle.is_some() {
                let format = args
                    .iter()
                    .position(|arg| arg == "--output-format")
                    .unwrap()
                    + 1;
                args[format] = "stream-json".into();
                args.push("--verbose".into());
            }
            command.args(args);
            command.current_dir(neutral_directory()?);
        }
        "codex" => {
            // A summary reads the prompt and answers. The user's config.toml
            // would bring its MCP servers (with their OAuth noise and ~150k
            // tokens of tool definitions), and the built-in computer and
            // browser use let a "read-only" run press keys in other windows.
            command.args([
                "exec",
                "--json",
                "--ephemeral",
                "--skip-git-repo-check",
                "--ignore-user-config",
                "--disable",
                "computer_use",
                "--disable",
                "browser_use",
                "--disable",
                "apps",
            ]);
            configure_codex_sandbox(&mut command);
            if let Some(model) = request.model.as_deref().filter(|v| !v.is_empty()) {
                command.args(["--model", model]);
            }
            if let Some(effort) = effort_of(request.effort.as_deref(), CODEX_EFFORTS) {
                command
                    .arg("-c")
                    .arg(format!("model_reasoning_effort=\"{effort}\""));
            }
            if request.fast == Some(true) {
                command.args(["-c", "service_tier=\"fast\""]);
            }
            command.arg("-");
            if let Some(checkout) = checkout {
                command.current_dir(checkout);
            } else {
                command.current_dir(neutral_directory()?);
            }
        }
        _ => {
            return Err(format!(
                "Unsupported headless provider: {}",
                request.provider
            ))
        }
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
        let reason = match provider.as_str() {
            "codex" => codex_failure(&output.stdout),
            _ => claude_failure(&output.stdout),
        }
        .unwrap_or_else(|| stderr_tail(&output.stderr));
        return Err(format!(
            "{provider} exited with {}: {reason}",
            output.status.code().unwrap_or(-1),
        ));
    }
    let text = match provider.as_str() {
        "claude" => parse_claude_output(&output.stdout),
        "codex" => parse_codex_output(&output.stdout),
        _ => unreachable!(),
    }?;
    let reads = bundle
        .as_ref()
        .map(|bundle| bundle.reads(&provider, &output.stdout));
    Ok(HeadlessPromptResult {
        text,
        provider,
        model: requested_model,
        duration_ms: started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
        reads,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_uses_read_only_sandbox_with_a_windows_backend() {
        let mut command = tokio::process::Command::new("codex");
        configure_codex_sandbox(&mut command);
        let args: Vec<_> = command.as_std().get_args().collect();
        assert!(args.windows(2).any(|pair| pair == ["-s", "read-only"]));
        #[cfg(windows)]
        assert!(args
            .windows(2)
            .any(|pair| pair == ["-c", "windows.sandbox=\"elevated\""]));
    }

    #[tokio::test]
    #[ignore = "uses an installed, authenticated subscription CLI"]
    async fn installed_provider_reads_snapshot_with_auditable_tool_output() {
        let provider = std::env::var("BORGDOCK_TEST_PROVIDER").unwrap();
        let result = run_headless_prompt(HeadlessPromptRequest {
            provider,
            prompt: "Read every line of {{source:file-1}} with your read tools. Return DONE after reading it. Do not modify files or run tests.".into(),
            cwd: None, model: None,
            executable: std::env::var("BORGDOCK_TEST_EXECUTABLE").ok(),
            timeout_seconds: Some(120), effort: None, fast: None,
            sources: Some(vec![PromptSource { id: "file-1".into(), text: "Synthetic review snapshot.\nA new guard checks that the ID matches.\nExisting actions stay disabled until it does.".into() }]),
        }).await.unwrap();
        assert!(result.text.contains("DONE"), "{}", result.text);
        assert_eq!(result.reads.unwrap()[0].lines, vec![1, 2, 3]);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn snapshots_are_read_through_cli_tools_and_cleaned_for_both_providers() {
        let root = tempfile::tempdir().unwrap();
        let script = root.path().join("fake-agent.ps1");
        std::fs::write(&script, r#"
$prompt = [Console]::In.ReadToEnd()
$path = $prompt.Substring(5) | ConvertFrom-Json
$content = [IO.File]::ReadAllText($path)
if ($args -contains 'claude') {
  @{type='assistant';message=@{content=@(@{type='tool_use';id='r';name='Read'})}} | ConvertTo-Json -Depth 8 -Compress
  @{type='user';message=@{content=@(@{type='tool_result';tool_use_id='r';content=$content})}} | ConvertTo-Json -Depth 8 -Compress
  @{type='result';result=$path} | ConvertTo-Json -Compress
} else {
  @{type='item.completed';item=@{type='command_execution';status='completed';exit_code=0;aggregated_output=$content}} | ConvertTo-Json -Depth 8 -Compress
  @{type='item.completed';item=@{type='agent_message';text=$path}} | ConvertTo-Json -Depth 8 -Compress
}
"#).unwrap();
        let shim = root.path().join("fake-agent.cmd");
        for provider in ["claude", "codex"] {
            std::fs::write(
                &shim,
                format!(
                "@powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"{}\" {provider}\r\n",
                script.display()
            ),
            )
            .unwrap();
            let result = run_headless_prompt(HeadlessPromptRequest {
                provider: provider.into(),
                prompt: "Read {{source:file-1}}".into(),
                cwd: None,
                model: None,
                executable: Some(shim.to_string_lossy().into()),
                timeout_seconds: Some(30),
                effort: None,
                fast: None,
                sources: Some(vec![PromptSource {
                    id: "file-1".into(),
                    text: "first\nlast".into(),
                }]),
            })
            .await
            .unwrap();
            assert_eq!(result.reads.unwrap()[0].lines, vec![1, 2], "{provider}");
            assert!(
                !std::path::Path::new(&result.text).exists(),
                "snapshot survived {provider} completion"
            );
        }
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn starts_windows_shims_with_spaces_and_piped_input() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("agent with spaces");
        std::fs::create_dir_all(&directory).unwrap();
        let shim = directory.join("codex.cmd");
        std::fs::write(&shim, "@echo off\r\nset /p prompt=\r\necho %prompt%\r\n").unwrap();
        let mut child = hidden_tokio_command(shim.to_str().unwrap())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(b"summary prompt\n")
            .await
            .unwrap();
        let output = child.wait_with_output().await.unwrap();
        assert!(output.status.success());
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "summary prompt"
        );
    }

    #[test]
    fn parses_claude_json() {
        assert_eq!(
            parse_claude_output(br#"{"result":"summary"}"#).unwrap(),
            "summary"
        );
        assert_eq!(
            parse_claude_output(
                b"{\"type\":\"assistant\"}\n{\"type\":\"result\",\"result\":\"streamed\"}\n"
            )
            .unwrap(),
            "streamed"
        );
    }

    #[test]
    fn parses_codex_final_message() {
        let jsonl = br#"{"type":"thread.started"}
{"type":"item.completed","item":{"type":"agent_message","text":"summary"}}
"#;
        assert_eq!(parse_codex_output(jsonl).unwrap(), "summary");
    }

    #[test]
    fn reads_why_codex_failed_from_its_events() {
        let jsonl = br#"{"type":"thread.started"}
{"type":"item.completed","item":{"type":"error","message":"Model metadata not found"}}
{"type":"error","message":"The 'sonnet' model is not supported"}
{"type":"turn.failed","error":{"message":"The 'sonnet' model is not supported here"}}
"#;
        assert_eq!(
            codex_failure(jsonl).as_deref(),
            Some("The 'sonnet' model is not supported here")
        );
        assert_eq!(
            codex_failure(br#"{"type":"error","message":"Quota exceeded"}"#).as_deref(),
            Some("Quota exceeded")
        );
        assert_eq!(codex_failure(b"not json"), None);
    }

    #[test]
    fn reads_why_claude_failed() {
        assert_eq!(
            claude_failure(br#"{"is_error":true,"result":"Credit balance is too low"}"#).as_deref(),
            Some("Credit balance is too low")
        );
        assert_eq!(
            claude_failure(br#"{"is_error":false,"result":"fine"}"#),
            None
        );
    }

    #[test]
    fn keeps_the_end_of_long_stderr() {
        let long = "x".repeat(700) + "the reason";
        let tail = stderr_tail(long.as_bytes());
        assert!(tail.starts_with('…') && tail.ends_with("the reason"));
        assert_eq!(tail.chars().count(), 601);
        assert_eq!(stderr_tail(b"  short  "), "short");
    }

    #[test]
    fn claude_reads_the_checkout_without_starting_in_it() {
        let args = claude_args(Some("opus"), Some("low"), Some("D:/repos/acme"));
        let value_of = |flag: &str| {
            let at = args.iter().position(|arg| arg == flag)?;
            args.get(at + 1).map(String::as_str)
        };
        assert_eq!(value_of("--add-dir"), Some("D:/repos/acme"));
        assert_eq!(value_of("--model"), Some("opus"));
        assert_eq!(value_of("--effort"), Some("low"));
        assert_eq!(value_of("--tools"), Some("Read,Grep,Glob"));
        assert!(args.contains(&"--strict-mcp-config".to_owned()));

        let bare = claude_args(None, Some("minimal"), None);
        assert!(!bare
            .iter()
            .any(|arg| arg == "--add-dir" || arg == "--model" || arg == "--effort"));
    }

    #[test]
    fn passes_only_efforts_the_cli_knows() {
        assert_eq!(effort_of(Some("max"), CLAUDE_EFFORTS), Some("max"));
        assert_eq!(effort_of(Some("max"), CODEX_EFFORTS), None);
        assert_eq!(effort_of(Some("high\" --x"), CODEX_EFFORTS), None);
        assert_eq!(effort_of(None, CLAUDE_EFFORTS), None);
    }
}
