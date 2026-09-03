use crate::git::hidden_command;
use chrono::Utc;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const TESTED_T3_VERSION: &str = "0.0.38";
const T3_TOKEN_SERVICE: &str = "borgdock:t3";
const T3_TOKEN_EXCHANGE_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:token-exchange";
const T3_BOOTSTRAP_TOKEN_TYPE: &str = "urn:t3:params:oauth:token-type:environment-bootstrap";
const T3_ACCESS_TOKEN_TYPE: &str = "urn:ietf:params:oauth:token-type:access_token";

#[derive(Debug, Deserialize)]
struct RuntimeFile {
    origin: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct T3Probe {
    pub running: bool,
    pub paired: bool,
    pub origin: Option<String>,
    pub tested_version: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct T3LaunchResult {
    pub tier: u8,
    pub thread_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct T3Session {
    pub thread_id: String,
    pub title: String,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub workspace_root: String,
    pub status: String,
    pub updated_at: String,
    pub linked_pull_request_json: Option<String>,
}

fn userdata_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".t3").join("userdata"))
        .ok_or_else(|| "Could not determine the home directory".to_string())
}

fn runtime() -> Result<RuntimeFile, String> {
    let path = userdata_dir()?.join("server-runtime.json");
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("T3 runtime file is unavailable ({}): {e}", path.display()))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("Invalid T3 runtime file: {e}"))
}

fn token() -> Result<Option<String>, String> {
    crate::keychain::get_credential_blocking(T3_TOKEN_SERVICE)
}

fn pairing_token(pairing_credential: &str) -> &str {
    let trimmed = pairing_credential.trim();
    trimmed
        .split_once("#token=")
        .map_or(trimmed, |(_, token)| token.trim())
}

fn token_exchange_form(pairing_credential: &str) -> Vec<(&'static str, &str)> {
    vec![
        ("grant_type", T3_TOKEN_EXCHANGE_GRANT_TYPE),
        ("subject_token_type", T3_BOOTSTRAP_TOKEN_TYPE),
        ("subject_token", pairing_token(pairing_credential)),
        ("requested_token_type", T3_ACCESS_TOKEN_TYPE),
        ("scope", "orchestration:read orchestration:operate"),
    ]
}

fn t3_executable(configured: Option<&str>) -> PathBuf {
    if let Some(path) = configured.filter(|path| !path.trim().is_empty()) {
        return PathBuf::from(path);
    }
    #[cfg(target_os = "windows")]
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(local)
            .join("Programs")
            .join("t3-code-desktop")
            .join("T3 Code (Alpha).exe");
    }
    PathBuf::from("t3")
}

fn activate_t3(workspace: &Path, executable: Option<&str>) -> Result<(), String> {
    hidden_command(t3_executable(executable).to_string_lossy().as_ref())
        .arg(workspace)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open T3 Code: {e}"))
}

fn open_db() -> Result<Connection, String> {
    Connection::open_with_flags(
        userdata_dir()?.join("state.sqlite"),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Failed to open the T3 projection database read-only: {e}"))
}

fn project_for_workspace(workspace: &str) -> Result<Option<String>, String> {
    let connection = open_db()?;
    let mut statement = connection
        .prepare("SELECT project_id FROM projection_projects WHERE lower(workspace_root)=lower(?1) AND deleted_at IS NULL LIMIT 1")
        .map_err(|e| e.to_string())?;
    let mut rows = statement.query([workspace]).map_err(|e| e.to_string())?;
    Ok(rows
        .next()
        .map_err(|e| e.to_string())?
        .map(|row| row.get::<_, String>(0))
        .transpose()
        .map_err(|e| e.to_string())?)
}

async fn dispatch(origin: &str, token: &str, command: serde_json::Value) -> Result<(), String> {
    let response = reqwest::Client::new()
        .post(format!("{origin}/api/orchestration/dispatch"))
        .bearer_auth(token)
        .json(&command)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("T3 dispatch failed: {e}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!("T3 dispatch returned {status}: {body}"))
    }
}

#[tauri::command]
pub async fn t3_probe() -> T3Probe {
    let Ok(runtime) = tokio::task::spawn_blocking(runtime)
        .await
        .unwrap_or_else(|e| Err(e.to_string()))
    else {
        return T3Probe {
            running: false,
            paired: false,
            origin: None,
            tested_version: TESTED_T3_VERSION,
        };
    };
    let stored = tokio::task::spawn_blocking(token)
        .await
        .ok()
        .and_then(Result::ok)
        .flatten();
    let client = reqwest::Client::new();
    let mut request = client
        .get(format!("{}/api/auth/session", runtime.origin))
        .timeout(std::time::Duration::from_secs(3));
    if let Some(ref access_token) = stored {
        request = request.bearer_auth(access_token);
    }
    let response = request.send().await;
    let running = response.is_ok();
    let paired = stored.is_some()
        && response
            .as_ref()
            .map(|response| response.status().is_success())
            .unwrap_or(false);
    T3Probe {
        running,
        paired,
        origin: running.then_some(runtime.origin),
        tested_version: TESTED_T3_VERSION,
    }
}

#[tauri::command]
pub async fn t3_pair(pairing_credential: String) -> Result<(), String> {
    let runtime = tokio::task::spawn_blocking(runtime)
        .await
        .map_err(|e| e.to_string())??;
    let response = reqwest::Client::new()
        .post(format!("{}/oauth/token", runtime.origin))
        .form(&token_exchange_form(&pairing_credential))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Pairing exchange failed: {e}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read pairing response: {e}"))?;
    if !status.is_success() {
        let detail = body.trim();
        return Err(if detail.is_empty() {
            format!("Pairing exchange returned {status}")
        } else {
            format!("Pairing exchange returned {status}: {detail}")
        });
    }
    let value: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Pairing exchange returned an invalid response: {e}"))?;
    let access_token = value["access_token"]
        .as_str()
        .ok_or_else(|| "Pairing response did not include an access token".to_string())?
        .to_string();
    tokio::task::spawn_blocking(move || {
        keyring::Entry::new("borgdock", T3_TOKEN_SERVICE)
            .map_err(|e| e.to_string())?
            .set_password(&access_token)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_exchange_requests_an_access_token() {
        let form = token_exchange_form("PAIRING-CREDENTIAL");

        assert!(form.contains(&("requested_token_type", T3_ACCESS_TOKEN_TYPE)));
    }

    #[test]
    fn pairing_token_accepts_raw_credentials_and_pairing_links() {
        assert_eq!(pairing_token("PAIRING-CREDENTIAL"), "PAIRING-CREDENTIAL");
        assert_eq!(
            pairing_token("http://127.0.0.1:3773/pair#token=PAIRING-CREDENTIAL"),
            "PAIRING-CREDENTIAL"
        );
    }
}

/// Model selection and runtime mode to seed a new thread with. Prefers the
/// project's own default, then whatever the user picked for their most recent
/// thread, and only then the values from BorgDock settings.
fn thread_defaults(
    project_id: Option<&str>,
    fallback_model: &str,
    fallback_instance: &str,
) -> Result<(serde_json::Value, String), String> {
    let connection = open_db()?;
    let mut selection: Option<serde_json::Value> = None;
    if let Some(project_id) = project_id {
        let raw: Option<String> = connection
            .query_row(
                "SELECT default_model_selection_json FROM projection_projects WHERE project_id=?1",
                [project_id],
                |row| row.get(0),
            )
            .ok()
            .flatten();
        selection = raw.and_then(|json| serde_json::from_str(&json).ok());
    }
    let latest: Option<(Option<String>, String)> = connection
        .query_row(
            "SELECT model_selection_json, runtime_mode FROM projection_threads              WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();
    let runtime_mode = latest
        .as_ref()
        .map(|(_, mode)| mode.clone())
        .unwrap_or_else(|| "full-access".to_string());
    if selection.is_none() {
        selection = latest
            .and_then(|(json, _)| json)
            .and_then(|json| serde_json::from_str(&json).ok());
    }
    Ok((
        selection.unwrap_or_else(
            || json!({ "instanceId": fallback_instance, "model": fallback_model, "options": [] }),
        ),
        runtime_mode,
    ))
}

/// Open a fresh, empty T3 thread on `workspace_root` and bring T3 to the
/// front. Paired: the thread is created through the orchestration API and
/// linked to the pull request. Unpaired: T3 is only activated (tier 1) so the
/// user can start the thread by hand.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn t3_open_thread(
    workspace_root: String,
    branch: String,
    title: String,
    repository: String,
    pr_number: u32,
    pr_url: String,
    model: String,
    model_instance: String,
    executable: Option<String>,
) -> Result<T3LaunchResult, String> {
    let runtime = tokio::task::spawn_blocking(runtime)
        .await
        .map_err(|e| e.to_string())??;
    let stored_token = tokio::task::spawn_blocking(token)
        .await
        .map_err(|e| e.to_string())??;
    let Some(access_token) = stored_token else {
        activate_t3(Path::new(&workspace_root), executable.as_deref())?;
        return Ok(T3LaunchResult {
            tier: 1,
            thread_id: None,
        });
    };
    let mut project_id = tokio::task::spawn_blocking({
        let workspace_root = workspace_root.clone();
        move || project_for_workspace(&workspace_root)
    })
    .await
    .map_err(|e| e.to_string())??;
    let (model_selection, runtime_mode) = tokio::task::spawn_blocking({
        let project_id = project_id.clone();
        move || thread_defaults(project_id.as_deref(), &model, &model_instance)
    })
    .await
    .map_err(|e| e.to_string())??;
    let now = Utc::now().to_rfc3339();
    if project_id.is_none() {
        let id = Uuid::new_v4().to_string();
        dispatch(&runtime.origin, &access_token, json!({
            "type": "project.create", "commandId": Uuid::new_v4(), "projectId": id,
            "title": Path::new(&workspace_root).file_name().and_then(|v| v.to_str()).unwrap_or("BorgDock project"),
            "workspaceRoot": workspace_root, "createdAt": now
        })).await?;
        project_id = Some(id);
    }
    let project_id = project_id.unwrap();
    let thread_id = Uuid::new_v4().to_string();
    dispatch(
        &runtime.origin,
        &access_token,
        json!({
            "type": "thread.create", "commandId": Uuid::new_v4(), "threadId": thread_id,
            "projectId": project_id, "title": title, "modelSelection": model_selection,
            "runtimeMode": runtime_mode, "interactionMode": "default", "branch": branch,
            "worktreePath": workspace_root, "createdAt": now
        }),
    )
    .await?;
    // Linking is best-effort: the thread already exists and is usable even if
    // an older T3 rejects the linkedPullRequest field.
    if let Err(error) = dispatch(
        &runtime.origin,
        &access_token,
        json!({
            "type": "thread.meta.update", "commandId": Uuid::new_v4(), "threadId": thread_id,
            "linkedPullRequest": {
                "projectId": project_id, "repository": repository,
                "number": pr_number, "url": pr_url
            }
        }),
    )
    .await
    {
        log::warn!("t3_open_thread: linking PR to thread failed: {error}");
    }
    activate_t3(Path::new(&workspace_root), executable.as_deref())?;
    Ok(T3LaunchResult {
        tier: 2,
        thread_id: Some(thread_id),
    })
}

#[tauri::command]
pub async fn t3_list_sessions() -> Result<Vec<T3Session>, String> {
    tokio::task::spawn_blocking(|| {
        let connection = open_db()?;
        let mut statement = connection.prepare(
            "SELECT t.thread_id,t.title,t.branch,t.worktree_path,p.workspace_root,\
             CASE WHEN t.pending_approval_count>0 THEN 'waitingApproval' \
                  WHEN t.pending_user_input_count>0 THEN 'waitingInput' \
                  WHEN t.settled_at IS NOT NULL OR t.settled_override='settled' THEN 'settled' \
                  WHEN s.status IS NOT NULL THEN s.status ELSE 'active' END,\
             t.updated_at,t.linked_pull_request_json \
             FROM projection_threads t JOIN projection_projects p ON p.project_id=t.project_id \
             LEFT JOIN projection_thread_sessions s ON s.thread_id=t.thread_id \
             WHERE t.deleted_at IS NULL AND t.archived_at IS NULL ORDER BY t.updated_at DESC LIMIT 250"
        ).map_err(|e| e.to_string())?;
        let rows = statement.query_map([], |row| Ok(T3Session {
            thread_id: row.get(0)?, title: row.get(1)?, branch: row.get(2)?, worktree_path: row.get(3)?,
            workspace_root: row.get(4)?, status: row.get(5)?, updated_at: row.get(6)?, linked_pull_request_json: row.get(7)?,
        })).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn t3_focus_session(
    workspace_root: String,
    executable: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        activate_t3(Path::new(&workspace_root), executable.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}
