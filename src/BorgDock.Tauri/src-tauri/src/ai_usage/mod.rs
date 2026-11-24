//! What is left of each AI account on this machine: every Claude Code config
//! folder and every Codex home, read the way the tools read their own limits.
//! Tokens stay in Rust; the webview gets percentages, reset times and names.

mod claude;
mod codex;
mod t3;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;

const READ_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AiAccount {
    /// The provider and the folder: `claude:~/.claude-ops`.
    pub id: String,
    /// `claude` or `codex`.
    pub provider: String,
    /// The folder as its owner writes it: `~/.claude-ops`.
    pub folder: String,
    pub email: Option<String>,
    /// "Max 20x", "Pro", "Team".
    pub plan: Option<String>,
    /// What T3 Code calls the provider instance that runs on this account.
    pub t3_name: Option<String>,
    /// The T3 Code provider instances that run on this account: a thread's
    /// `modelInstance` is one of them when it spends this account's limits.
    pub t3_instances: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AiLimit {
    /// `weekly`, `model` (a weekly limit for one model) or `session`.
    pub kind: String,
    /// "Weekly", "Fable", "5 hours".
    pub label: String,
    pub used_percent: f64,
    /// Epoch seconds.
    pub resets_at: Option<i64>,
    pub window_seconds: Option<i64>,
}

/// Why an account has no reading.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AiUsageProblem {
    /// `expired`, `signed-out`, `missing-cli` or `unavailable`.
    pub kind: String,
    pub message: String,
}

impl AiUsageProblem {
    fn new(kind: &str, message: impl Into<String>) -> Self {
        Self {
            kind: kind.to_string(),
            message: message.into(),
        }
    }

    fn unavailable(message: impl Into<String>) -> Self {
        Self::new("unavailable", message)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AiUsage {
    pub account: AiAccount,
    pub limits: Vec<AiLimit>,
    /// A credit balance, where the provider reports one.
    pub credits: Option<String>,
    pub problem: Option<AiUsageProblem>,
}

/// What one provider read: its limits, and the plan when the read names it.
struct Reading {
    limits: Vec<AiLimit>,
    credits: Option<String>,
    plan: Option<String>,
}

enum Source {
    Claude(PathBuf),
    Codex(PathBuf),
}

struct Found {
    account: AiAccount,
    source: Source,
}

/// `~/.claude-ops` for a folder in the home directory, the full path otherwise.
fn display_folder(folder: &Path, home: &Path) -> String {
    match folder.strip_prefix(home) {
        Ok(rest) => format!("~/{}", rest.to_string_lossy().replace('\\', "/")),
        Err(_) => folder.to_string_lossy().into_owned(),
    }
}

/// "pro" as "Pro".
fn capitalised(text: &str) -> Option<String> {
    let mut letters = text.trim().chars();
    Some(letters.next()?.to_uppercase().chain(letters).collect())
}

fn account_id(provider: &str, folder: &str) -> String {
    format!("{provider}:{folder}")
}

fn configured_folder(variable: &str) -> Option<PathBuf> {
    std::env::var_os(variable)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn found_accounts() -> Vec<Found> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let claude = claude::folders(&home, configured_folder("CLAUDE_CONFIG_DIR"))
        .into_iter()
        .map(|folder| Found {
            account: claude::account(&folder, &home),
            source: Source::Claude(folder),
        });
    let codex = codex::homes(&home, configured_folder("CODEX_HOME"))
        .into_iter()
        .map(|folder| Found {
            account: codex::account(&folder, &home),
            source: Source::Codex(folder),
        });
    let t3 = t3::instances(&home);
    claude
        .chain(codex)
        .map(|mut found| {
            let folder = match &found.source {
                Source::Claude(folder) | Source::Codex(folder) => folder,
            };
            let on_account = t3::instances_of(&t3, &found.account.provider, folder);
            found.account.t3_name = on_account.iter().find_map(|instance| instance.name.clone());
            found.account.t3_instances = on_account
                .iter()
                .map(|instance| instance.id.clone())
                .collect();
            found
        })
        .collect()
}

async fn read_one(found: Found) -> AiUsage {
    let reading = match found.source {
        Source::Claude(folder) => claude::read(folder).await,
        Source::Codex(folder) => codex::read(folder).await,
    };
    let mut account = found.account;
    match reading {
        Ok(reading) => {
            account.plan = reading.plan.or(account.plan);
            AiUsage {
                account,
                limits: reading.limits,
                credits: reading.credits,
                problem: None,
            }
        }
        Err(problem) => AiUsage {
            account,
            limits: Vec::new(),
            credits: None,
            problem: Some(problem),
        },
    }
}

/// The AI accounts found on this machine. No network, no token leaves Rust.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ai_usage_accounts() -> Result<Vec<AiAccount>, String> {
    tokio::task::spawn_blocking(|| {
        found_accounts()
            .into_iter()
            .map(|found| found.account)
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Reads what is left of the accounts in `ids`, or of every account when
/// `ids` is empty. An account that cannot be read comes back with a problem.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ai_usage_read(ids: Vec<String>) -> Result<Vec<AiUsage>, String> {
    let found = tokio::task::spawn_blocking(found_accounts)
        .await
        .map_err(|e| e.to_string())?;
    let wanted = found
        .into_iter()
        .filter(|found| ids.is_empty() || ids.contains(&found.account.id));
    Ok(futures_util::future::join_all(wanted.map(read_one)).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_in_the_home_directory_is_written_with_a_tilde() {
        let home = Path::new("/home/ada");
        assert_eq!(
            display_folder(&home.join(".claude-ops"), home),
            "~/.claude-ops"
        );
        assert_eq!(
            display_folder(Path::new("/srv/claude"), home),
            "/srv/claude"
        );
    }

    #[test]
    fn an_account_is_named_by_its_provider_and_folder() {
        assert_eq!(account_id("codex", "~/.codex"), "codex:~/.codex");
    }

    /// Reads this machine's own accounts from their providers; nothing is written.
    /// `cargo test --lib ai_usage::tests::live -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn live() {
        let usages = ai_usage_read(Vec::new()).await.unwrap();
        for usage in &usages {
            let limits: Vec<String> = usage
                .limits
                .iter()
                .map(|limit| format!("{} {:.0}% used", limit.label, limit.used_percent))
                .collect();
            println!(
                "{} plan={:?} t3={:?} limits={limits:?} credits={:?} problem={:?}",
                usage.account.id,
                usage.account.plan,
                usage.account.t3_instances,
                usage.credits,
                usage.problem
            );
        }
        assert!(!usages.is_empty(), "no AI account found on this machine");
    }
}
