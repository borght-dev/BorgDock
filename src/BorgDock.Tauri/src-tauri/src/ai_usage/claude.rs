//! Claude Code accounts: one per config folder (`~/.claude`, `~/.claude-ops`,
//! `CLAUDE_CONFIG_DIR`) that holds credentials. The usage endpoint is the one
//! Claude Code's own usage screen reads; nobody documents it.

use super::{
    account_id, capitalised, display_folder, AiAccount, AiLimit, AiUsageProblem, Reading,
    READ_TIMEOUT,
};
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA: &str = "oauth-2025-04-20";
const USER_AGENT: &str = concat!("BorgDock/", env!("CARGO_PKG_VERSION"));
const WEEK_SECONDS: i64 = 7 * 86_400;
const SESSION_SECONDS: i64 = 5 * 3_600;
const DEFAULT_FOLDER: &str = ".claude";

static FOLDER_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\.claude(-[A-Za-z0-9._-]+)?$").unwrap());
static PLAN_MULTIPLE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d+x)$").unwrap());

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Credentials {
    claude_ai_oauth: Option<OAuth>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuth {
    access_token: Option<String>,
    /// Epoch milliseconds.
    expires_at: Option<i64>,
    subscription_type: Option<String>,
    rate_limit_tier: Option<String>,
}

/// macOS keeps the default folder's credentials in the Keychain, not in a file.
#[cfg(target_os = "macos")]
fn keychain_credentials(folder: &Path) -> Option<String> {
    if folder.file_name()?.to_str()? != DEFAULT_FOLDER {
        return None;
    }
    let output = crate::git::hidden_command("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(not(target_os = "macos"))]
fn keychain_credentials(_folder: &Path) -> Option<String> {
    None
}

fn credentials(folder: &Path) -> Option<OAuth> {
    let text = std::fs::read_to_string(folder.join(".credentials.json"))
        .ok()
        .or_else(|| keychain_credentials(folder))?;
    serde_json::from_str::<Credentials>(&text)
        .ok()?
        .claude_ai_oauth
}

fn same_folder(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// Every Claude Code config folder that holds credentials: the default first,
/// the others by name, then `CLAUDE_CONFIG_DIR` when it points somewhere else.
pub fn folders(home: &Path, configured: Option<PathBuf>) -> Vec<PathBuf> {
    let mut names: Vec<String> = std::fs::read_dir(home)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| FOLDER_NAME.is_match(name))
        .collect();
    names.sort_by_key(|name| (name != DEFAULT_FOLDER, name.clone()));
    let mut found: Vec<PathBuf> = names
        .into_iter()
        .map(|name| home.join(name))
        .filter(|folder| credentials(folder).is_some())
        .collect();
    if let Some(folder) = configured {
        let listed = found.iter().any(|known| same_folder(known, &folder));
        if !listed && credentials(&folder).is_some() {
            found.push(folder);
        }
    }
    found
}

/// "Max 20x" from `max` and `default_claude_max_20x`; "Pro" from `pro`.
pub fn plan_label(subscription: Option<&str>, tier: Option<&str>) -> Option<String> {
    let name = capitalised(subscription?)?;
    let multiple = tier
        .and_then(|tier| PLAN_MULTIPLE.captures(tier))
        .map(|found| found[1].to_string());
    Some(match multiple {
        Some(multiple) => format!("{name} {multiple}"),
        None => name,
    })
}

fn email_in(file: &Path) -> Option<String> {
    let text = std::fs::read_to_string(file).ok()?;
    let state: Value = serde_json::from_str(&text).ok()?;
    state["oauthAccount"]["emailAddress"]
        .as_str()
        .map(str::to_string)
}

/// The account a folder is signed in to. The default folder's state file sits
/// in the home directory on some installs and inside the folder on others.
fn email(folder: &Path, home: &Path) -> Option<String> {
    email_in(&folder.join(".claude.json")).or_else(|| {
        same_folder(folder, &home.join(DEFAULT_FOLDER))
            .then(|| email_in(&home.join(".claude.json")))
            .flatten()
    })
}

pub fn account(folder: &Path, home: &Path) -> AiAccount {
    let shown = display_folder(folder, home);
    let oauth = credentials(folder);
    AiAccount {
        id: account_id("claude", &shown),
        provider: "claude".to_string(),
        folder: shown,
        email: email(folder, home),
        plan: oauth.as_ref().and_then(|oauth| {
            plan_label(
                oauth.subscription_type.as_deref(),
                oauth.rate_limit_tier.as_deref(),
            )
        }),
        t3_name: None,
        t3_instances: Vec::new(),
    }
}

fn epoch_seconds(value: &Value) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value.as_str()?)
        .ok()
        .map(|time| time.timestamp())
}

fn limit(kind: &str, label: &str, used: &Value, resets: &Value, window: i64) -> Option<AiLimit> {
    Some(AiLimit {
        kind: kind.to_string(),
        label: label.to_string(),
        used_percent: used.as_f64()?.clamp(0.0, 100.0),
        resets_at: epoch_seconds(resets),
        window_seconds: Some(window),
    })
}

/// The limits in a usage answer: the week, each model's week, the session.
/// `limits` is the current shape; `five_hour` and `seven_day` came before it.
pub fn limits_in(usage: &Value) -> Vec<AiLimit> {
    let week_started = epoch_seconds(&usage["seven_day_breakdown"]["window_started_at"]);
    let week = |resets: &Value| match (week_started, epoch_seconds(resets)) {
        (Some(started), Some(ends)) if ends > started => ends - started,
        _ => WEEK_SECONDS,
    };
    let Some(listed) = usage["limits"].as_array() else {
        let session = &usage["five_hour"];
        let weekly = &usage["seven_day"];
        return [
            limit(
                "weekly",
                "Weekly",
                &weekly["utilization"],
                &weekly["resets_at"],
                week(&weekly["resets_at"]),
            ),
            limit(
                "session",
                "5 hours",
                &session["utilization"],
                &session["resets_at"],
                SESSION_SECONDS,
            ),
        ]
        .into_iter()
        .flatten()
        .collect();
    };
    let of_kind = |kind: &'static str| {
        listed
            .iter()
            .filter(move |entry| entry["kind"].as_str() == Some(kind))
    };
    let weekly = of_kind("weekly_all").filter_map(|entry| {
        limit(
            "weekly",
            "Weekly",
            &entry["percent"],
            &entry["resets_at"],
            week(&entry["resets_at"]),
        )
    });
    let models = of_kind("weekly_scoped").filter_map(|entry| {
        let model = entry["scope"]["model"]["display_name"]
            .as_str()
            .unwrap_or("Model");
        limit(
            "model",
            model,
            &entry["percent"],
            &entry["resets_at"],
            week(&entry["resets_at"]),
        )
    });
    let session = of_kind("session").filter_map(|entry| {
        limit(
            "session",
            "5 hours",
            &entry["percent"],
            &entry["resets_at"],
            SESSION_SECONDS,
        )
    });
    weekly.chain(models).chain(session).collect()
}

fn expired() -> AiUsageProblem {
    AiUsageProblem::new(
        "expired",
        "Open Claude Code with this account to refresh its sign-in.",
    )
}

/// The token to read usage with. BorgDock never refreshes one: two programs
/// refreshing the same token race each other, so an expired token waits for
/// Claude Code to renew it.
fn usable_token(oauth: Option<OAuth>, now_ms: i64) -> Result<String, AiUsageProblem> {
    let signed_out = || AiUsageProblem::new("signed-out", "Sign in to Claude Code in this folder.");
    let oauth = oauth.ok_or_else(signed_out)?;
    let token = oauth
        .access_token
        .filter(|token| !token.is_empty())
        .ok_or_else(signed_out)?;
    match oauth.expires_at {
        Some(expires_at) if expires_at <= now_ms => Err(expired()),
        _ => Ok(token),
    }
}

pub async fn read(folder: PathBuf) -> Result<Reading, AiUsageProblem> {
    let oauth = tokio::task::spawn_blocking(move || credentials(&folder))
        .await
        .map_err(|e| AiUsageProblem::unavailable(e.to_string()))?;
    let token = usable_token(oauth, chrono::Utc::now().timestamp_millis())?;
    let response = crate::http::client()
        .get(USAGE_URL)
        .timeout(READ_TIMEOUT)
        .bearer_auth(token)
        .header("anthropic-beta", OAUTH_BETA)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| AiUsageProblem::unavailable(format!("Claude could not be reached: {e}")))?;
    match response.status().as_u16() {
        401 => return Err(expired()),
        429 => {
            return Err(AiUsageProblem::unavailable(
                "Claude is limiting how often usage can be read. BorgDock tries again later.",
            ))
        }
        status if !response.status().is_success() => {
            return Err(AiUsageProblem::unavailable(format!(
                "Claude answered {status}."
            )))
        }
        _ => {}
    }
    let usage: Value = response
        .json()
        .await
        .map_err(|e| AiUsageProblem::unavailable(format!("Claude's answer was not JSON: {e}")))?;
    Ok(Reading {
        limits: limits_in(&usage),
        credits: None,
        plan: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn signed_in(folder: &Path, expires_at: i64) {
        std::fs::create_dir_all(folder).unwrap();
        std::fs::write(
            folder.join(".credentials.json"),
            json!({ "claudeAiOauth": {
                "accessToken": "token",
                "expiresAt": expires_at,
                "subscriptionType": "max",
                "rateLimitTier": "default_claude_max_20x",
            }})
            .to_string(),
        )
        .unwrap();
    }

    #[test]
    fn only_folders_with_credentials_are_accounts_and_the_default_comes_first() {
        let home = tempfile::tempdir().unwrap();
        signed_in(&home.path().join(".claude-ops"), i64::MAX);
        signed_in(&home.path().join(".claude"), i64::MAX);
        std::fs::create_dir_all(home.path().join(".claude-notes")).unwrap();
        std::fs::create_dir_all(home.path().join(".claudette")).unwrap();
        let found = folders(home.path(), None);
        assert_eq!(
            found,
            vec![home.path().join(".claude"), home.path().join(".claude-ops")]
        );
    }

    #[test]
    fn the_configured_folder_is_added_once() {
        let home = tempfile::tempdir().unwrap();
        let elsewhere = tempfile::tempdir().unwrap();
        signed_in(&home.path().join(".claude"), i64::MAX);
        signed_in(elsewhere.path(), i64::MAX);
        let found = folders(home.path(), Some(elsewhere.path().to_path_buf()));
        assert_eq!(found.len(), 2);
        let again = folders(home.path(), Some(home.path().join(".claude")));
        assert_eq!(again.len(), 1);
    }

    #[test]
    fn an_account_carries_its_folder_email_and_plan() {
        let home = tempfile::tempdir().unwrap();
        let folder = home.path().join(".claude-ops");
        signed_in(&folder, i64::MAX);
        std::fs::write(
            folder.join(".claude.json"),
            json!({ "oauthAccount": { "emailAddress": "ada@acme.com" } }).to_string(),
        )
        .unwrap();
        let account = account(&folder, home.path());
        assert_eq!(account.id, "claude:~/.claude-ops");
        assert_eq!(account.folder, "~/.claude-ops");
        assert_eq!(account.email.as_deref(), Some("ada@acme.com"));
        assert_eq!(account.plan.as_deref(), Some("Max 20x"));
    }

    #[test]
    fn the_default_folder_also_reads_the_state_file_in_the_home_directory() {
        let home = tempfile::tempdir().unwrap();
        let folder = home.path().join(".claude");
        signed_in(&folder, i64::MAX);
        std::fs::write(
            home.path().join(".claude.json"),
            json!({ "oauthAccount": { "emailAddress": "ada@example.com" } }).to_string(),
        )
        .unwrap();
        assert_eq!(
            account(&folder, home.path()).email.as_deref(),
            Some("ada@example.com")
        );
    }

    #[test]
    fn plans_read_as_their_names() {
        assert_eq!(
            plan_label(Some("max"), Some("default_claude_max_5x")).as_deref(),
            Some("Max 5x")
        );
        assert_eq!(plan_label(Some("pro"), None).as_deref(), Some("Pro"));
        assert_eq!(plan_label(None, Some("default_claude_max_20x")), None);
    }

    #[test]
    fn the_week_each_model_and_the_session_become_limits() {
        let usage = json!({
            "limits": [
                { "kind": "weekly_scoped", "percent": 77, "resets_at": "2026-11-28T19:00:00+00:00",
                  "scope": { "model": { "display_name": "Fable" } } },
                { "kind": "weekly_all", "percent": 58, "resets_at": "2026-11-28T19:00:00+00:00" },
                { "kind": "session", "percent": 12.5, "resets_at": "2026-11-24T14:00:00+00:00" },
                { "kind": "something_new", "percent": 3 },
            ],
            "seven_day_breakdown": { "window_started_at": "2026-11-21T19:00:00+00:00" },
        });
        let limits = limits_in(&usage);
        let read: Vec<(&str, &str, f64)> = limits
            .iter()
            .map(|limit| {
                (
                    limit.kind.as_str(),
                    limit.label.as_str(),
                    limit.used_percent,
                )
            })
            .collect();
        assert_eq!(
            read,
            vec![
                ("weekly", "Weekly", 58.0),
                ("model", "Fable", 77.0),
                ("session", "5 hours", 12.5)
            ]
        );
        assert_eq!(limits[0].window_seconds, Some(WEEK_SECONDS));
        assert_eq!(limits[0].resets_at, Some(1_795_892_400));
        assert_eq!(limits[2].window_seconds, Some(SESSION_SECONDS));
    }

    #[test]
    fn the_older_answer_shape_still_reads() {
        let usage = json!({
            "five_hour": null,
            "seven_day": { "utilization": 140, "resets_at": "2026-11-28T19:00:00+00:00" },
        });
        let limits = limits_in(&usage);
        assert_eq!(limits.len(), 1);
        assert_eq!(limits[0].kind, "weekly");
        assert_eq!(limits[0].used_percent, 100.0);
    }

    #[test]
    fn an_expired_token_is_not_sent() {
        let oauth = |expires_at| {
            Some(OAuth {
                access_token: Some("token".into()),
                expires_at: Some(expires_at),
                subscription_type: None,
                rate_limit_tier: None,
            })
        };
        assert_eq!(usable_token(oauth(2_000), 1_000).unwrap(), "token");
        assert_eq!(
            usable_token(oauth(1_000), 1_000).unwrap_err().kind,
            "expired"
        );
        assert_eq!(usable_token(None, 1_000).unwrap_err().kind, "signed-out");
    }
}
