//! Codex accounts: one per Codex home (`~/.codex`, `~/.codex-acme`,
//! `CODEX_HOME`) signed in with ChatGPT. Limits come from Codex itself:
//! `codex app-server` answers `account/rateLimits/read` for the home it runs in.

use super::{
    account_id, capitalised, display_folder, AiAccount, AiLimit, AiUsageProblem, Reading,
    READ_TIMEOUT,
};
use base64::Engine;
use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::LazyLock;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};

const DEFAULT_HOME: &str = ".codex";
const WEEK_MINUTES: i64 = 7 * 24 * 60;
const SESSION_MINUTES: i64 = 5 * 60;
const DAY_MINUTES: i64 = 24 * 60;
const INITIALIZE: i64 = 1;
const RATE_LIMITS: i64 = 2;

static HOME_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\.codex(-[A-Za-z0-9._-]+)?$").unwrap());

#[derive(Deserialize)]
struct Auth {
    tokens: Option<Tokens>,
}

#[derive(Deserialize)]
struct Tokens {
    id_token: Option<String>,
}

/// What the ChatGPT sign-in says about the account. A home that only holds an
/// API key has no sign-in and no plan limits, so it is not an account here.
fn sign_in_claims(home: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(home.join("auth.json")).ok()?;
    let token = serde_json::from_str::<Auth>(&text).ok()?.tokens?.id_token?;
    let payload = token.split('.').nth(1)?.trim_end_matches('=');
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    serde_json::from_slice(&decoded).ok()
}

/// Every Codex home signed in with ChatGPT: the default first, the others by
/// name, then `CODEX_HOME` when it points somewhere else.
pub fn homes(home: &Path, configured: Option<PathBuf>) -> Vec<PathBuf> {
    let mut names: Vec<String> = std::fs::read_dir(home)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| HOME_NAME.is_match(name))
        .collect();
    names.sort_by_key(|name| (name != DEFAULT_HOME, name.clone()));
    let mut found: Vec<PathBuf> = names
        .into_iter()
        .map(|name| home.join(name))
        .filter(|folder| sign_in_claims(folder).is_some())
        .collect();
    if let Some(folder) = configured {
        let listed = found
            .iter()
            .any(|known| known.canonicalize().ok() == folder.canonicalize().ok());
        if !listed && sign_in_claims(&folder).is_some() {
            found.push(folder);
        }
    }
    found
}

pub fn account(folder: &Path, home: &Path) -> AiAccount {
    let shown = display_folder(folder, home);
    let claims = sign_in_claims(folder).unwrap_or(Value::Null);
    AiAccount {
        id: account_id("codex", &shown),
        provider: "codex".to_string(),
        folder: shown,
        email: claims["email"].as_str().map(str::to_string),
        plan: claims["https://api.openai.com/auth"]["chatgpt_plan_type"]
            .as_str()
            .and_then(capitalised),
        t3_name: None,
        t3_instances: Vec::new(),
    }
}

/// What a window of `minutes` is called: the week, the five-hour session, or
/// its own length. A window without a length is the week, as older Codex sent it.
fn window_name(minutes: Option<i64>) -> (&'static str, String) {
    match minutes {
        None | Some(0) | Some(WEEK_MINUTES) => ("weekly", "Weekly".to_string()),
        Some(SESSION_MINUTES) => ("session", "5 hours".to_string()),
        Some(minutes) if minutes >= DAY_MINUTES => {
            ("weekly", format!("{} days", minutes / DAY_MINUTES))
        }
        Some(minutes) => ("session", format!("{} hours", ((minutes + 30) / 60).max(1))),
    }
}

fn window_limit(window: &Value) -> Option<AiLimit> {
    let used = window["usedPercent"].as_f64()?;
    let minutes = window["windowDurationMins"].as_i64();
    let (kind, label) = window_name(minutes);
    Some(AiLimit {
        kind: kind.to_string(),
        label,
        used_percent: used.clamp(0.0, 100.0),
        resets_at: window["resetsAt"].as_i64().filter(|at| *at > 0),
        window_seconds: minutes.filter(|m| *m > 0).map(|m| m * 60),
    })
}

fn credits_in(snapshot: &Value) -> Option<String> {
    let credits = &snapshot["credits"];
    if credits["unlimited"].as_bool() == Some(true) {
        return Some("Unlimited".to_string());
    }
    credits["hasCredits"]
        .as_bool()
        .filter(|has| *has)
        .and_then(|_| credits["balance"].as_str())
        .map(str::to_string)
}

/// The answer to `account/rateLimits/read`: the `codex` bucket when the
/// account has several, the single-bucket view otherwise.
fn reading_in(result: &Value) -> Result<Reading, AiUsageProblem> {
    let bucket = &result["rateLimitsByLimitId"]["codex"];
    let snapshot = if bucket.is_object() {
        bucket
    } else {
        &result["rateLimits"]
    };
    if !snapshot.is_object() {
        return Err(AiUsageProblem::unavailable(
            "Codex returned no limits for this account.",
        ));
    }
    let mut limits: Vec<AiLimit> = [&snapshot["primary"], &snapshot["secondary"]]
        .into_iter()
        .filter_map(window_limit)
        .collect();
    limits.sort_by_key(|limit| limit.kind != "weekly");
    Ok(Reading {
        limits,
        credits: credits_in(snapshot),
        plan: snapshot["planType"].as_str().and_then(capitalised),
    })
}

enum Step {
    Send(Vec<Value>),
    Done(Result<Reading, AiUsageProblem>),
    Wait,
}

fn initialize() -> Value {
    json!({
        "id": INITIALIZE,
        "method": "initialize",
        "params": { "clientInfo": { "name": "borgdock", "version": env!("CARGO_PKG_VERSION") } },
    })
}

/// What one line from the app server asks for next.
fn step(message: &Value) -> Step {
    let failed = !message["error"].is_null();
    match message["id"].as_i64() {
        Some(INITIALIZE) if failed => Step::Done(Err(AiUsageProblem::unavailable(
            "Codex could not start its account service.",
        ))),
        Some(INITIALIZE) => Step::Send(vec![
            json!({ "method": "initialized" }),
            json!({ "id": RATE_LIMITS, "method": "account/rateLimits/read" }),
        ]),
        Some(RATE_LIMITS) if failed => Step::Done(Err(AiUsageProblem::new(
            "signed-out",
            "Codex could not read this account's limits. Sign in to Codex in this folder.",
        ))),
        Some(RATE_LIMITS) => Step::Done(reading_in(&message["result"])),
        _ => Step::Wait,
    }
}

async fn send(stdin: &mut ChildStdin, message: &Value) -> Result<(), AiUsageProblem> {
    stdin
        .write_all(format!("{message}\n").as_bytes())
        .await
        .map_err(|e| AiUsageProblem::unavailable(format!("Codex stopped listening: {e}")))
}

async fn exchange(child: &mut Child) -> Result<Reading, AiUsageProblem> {
    let closed = || AiUsageProblem::unavailable("Codex closed before it answered.");
    let mut stdin = child.stdin.take().ok_or_else(closed)?;
    let mut lines = BufReader::new(child.stdout.take().ok_or_else(closed)?).lines();
    send(&mut stdin, &initialize()).await?;
    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        match step(&message) {
            Step::Send(messages) => {
                for message in &messages {
                    send(&mut stdin, message).await?;
                }
            }
            Step::Done(result) => return result,
            Step::Wait => {}
        }
    }
    Err(closed())
}

pub async fn read(home: PathBuf) -> Result<Reading, AiUsageProblem> {
    let mut command = crate::agents::hidden_tokio_command("codex");
    command
        .args(["app-server", "--listen", "stdio://"])
        .env("CODEX_HOME", &home)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    if let Some(directory) = dirs::home_dir() {
        command.current_dir(directory);
    }
    let mut child = command.spawn().map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => AiUsageProblem::new(
            "missing-cli",
            "The Codex CLI is not installed, so its limits cannot be read.",
        ),
        _ => AiUsageProblem::unavailable(format!("Codex could not be started: {error}")),
    })?;
    let answer = tokio::time::timeout(READ_TIMEOUT, exchange(&mut child))
        .await
        .unwrap_or_else(|_| Err(AiUsageProblem::unavailable("Codex did not answer in time.")));
    let _ = child.kill().await;
    answer
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signed_in(folder: &Path, claims: Value) {
        std::fs::create_dir_all(folder).unwrap();
        let payload =
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(claims.to_string().as_bytes());
        std::fs::write(
            folder.join("auth.json"),
            json!({ "tokens": { "id_token": format!("header.{payload}.signature") } }).to_string(),
        )
        .unwrap();
    }

    #[test]
    fn homes_signed_in_with_chatgpt_are_accounts() {
        let home = tempfile::tempdir().unwrap();
        signed_in(&home.path().join(".codex-acme"), json!({}));
        signed_in(&home.path().join(".codex"), json!({}));
        let key_only = home.path().join(".codex-key");
        std::fs::create_dir_all(&key_only).unwrap();
        std::fs::write(key_only.join("auth.json"), r#"{"OPENAI_API_KEY":"k"}"#).unwrap();
        assert_eq!(
            homes(home.path(), None),
            vec![home.path().join(".codex"), home.path().join(".codex-acme")]
        );
    }

    #[test]
    fn an_account_carries_the_sign_ins_email_and_plan() {
        let home = tempfile::tempdir().unwrap();
        let folder = home.path().join(".codex-acme");
        signed_in(
            &folder,
            json!({
                "email": "ada@acme.com",
                "https://api.openai.com/auth": { "chatgpt_plan_type": "team" },
            }),
        );
        let account = account(&folder, home.path());
        assert_eq!(account.id, "codex:~/.codex-acme");
        assert_eq!(account.email.as_deref(), Some("ada@acme.com"));
        assert_eq!(account.plan.as_deref(), Some("Team"));
    }

    #[test]
    fn windows_are_named_by_their_length() {
        assert_eq!(window_name(Some(WEEK_MINUTES)).1, "Weekly");
        assert_eq!(window_name(None).0, "weekly");
        assert_eq!(
            window_name(Some(SESSION_MINUTES)),
            ("session", "5 hours".to_string())
        );
        assert_eq!(window_name(Some(3 * DAY_MINUTES)).1, "3 days");
        assert_eq!(window_name(Some(90)).1, "2 hours");
    }

    #[test]
    fn the_answer_becomes_limits_credits_and_a_plan() {
        let result = json!({
            "rateLimits": { "primary": { "usedPercent": 99 } },
            "rateLimitsByLimitId": { "codex": {
                "primary": { "usedPercent": 4, "windowDurationMins": 300, "resetsAt": 1_795_500_000 },
                "secondary": { "usedPercent": 11, "windowDurationMins": 10_080, "resetsAt": 1_795_900_000 },
                "credits": { "hasCredits": true, "unlimited": false, "balance": "45138" },
                "planType": "pro",
            }},
        });
        let reading = reading_in(&result).unwrap();
        let read: Vec<(&str, f64)> = reading
            .limits
            .iter()
            .map(|limit| (limit.label.as_str(), limit.used_percent))
            .collect();
        assert_eq!(read, vec![("Weekly", 11.0), ("5 hours", 4.0)]);
        assert_eq!(reading.limits[0].window_seconds, Some(WEEK_MINUTES * 60));
        assert_eq!(reading.credits.as_deref(), Some("45138"));
        assert_eq!(reading.plan.as_deref(), Some("Pro"));
    }

    #[test]
    fn the_single_bucket_answer_reads_too() {
        let result = json!({ "rateLimits": {
            "primary": { "usedPercent": 30, "windowDurationMins": null, "resetsAt": null },
            "secondary": null,
            "credits": { "hasCredits": false, "unlimited": false, "balance": null },
        }});
        let reading = reading_in(&result).unwrap();
        assert_eq!(reading.limits.len(), 1);
        assert_eq!(reading.limits[0].kind, "weekly");
        assert_eq!(reading.limits[0].resets_at, None);
        assert_eq!(reading.credits, None);
        assert!(reading_in(&json!({})).is_err());
    }

    #[test]
    fn the_exchange_initializes_then_asks_for_the_limits() {
        let Step::Send(messages) = step(&json!({ "id": 1, "result": {} })) else {
            panic!("initialize should be answered with the next requests");
        };
        assert_eq!(messages[0]["method"], "initialized");
        assert_eq!(messages[1]["method"], "account/rateLimits/read");
        assert!(matches!(step(&json!({ "method": "notice" })), Step::Wait));
        let Step::Done(Err(problem)) = step(&json!({ "id": 2, "error": { "code": 1 } })) else {
            panic!("a refused read is a problem");
        };
        assert_eq!(problem.kind, "signed-out");
    }
}
