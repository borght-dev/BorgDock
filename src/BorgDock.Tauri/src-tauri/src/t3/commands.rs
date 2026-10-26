//! The T3 commands the frontend calls. All async: each one does network,
//! keychain or file I/O.

use super::client::Client;
use super::hosts::{self, HostRef};
use super::{desktop, references, shell};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tauri::Emitter;
use uuid::Uuid;

const TOKEN_EXCHANGE_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:token-exchange";
const BOOTSTRAP_TOKEN_TYPE: &str = "urn:t3:params:oauth:token-type:environment-bootstrap";
const ACCESS_TOKEN_TYPE: &str = "urn:ietf:params:oauth:token-type:access_token";
const SCOPES: &str = "orchestration:read orchestration:operate";

const SHELL_PATH: &str = "/api/orchestration/shell";
const DEFAULT_RUNTIME_MODE: &str = "full-access";

/// A full thread snapshot per remote thread is heavy; fetch a few per call
/// and let the caller ask again for the rest.
const REMOTE_FIRST_MESSAGES_PER_CALL: usize = 6;

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct T3Probe {
    pub running: bool,
    pub paired: bool,
    pub origin: Option<String>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct T3LaunchResult {
    /// 1: T3 was only brought forward (not paired). 2: the thread was created.
    pub tier: u8,
    pub thread_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct T3Session {
    pub thread_id: String,
    pub title: String,
    pub branch: Option<String>,
    /// `waitingApproval`, `waitingInput`, `settled`, `running` or `active`.
    pub status: String,
    pub updated_at: String,
    pub pull_request_urls: Vec<String>,
}

fn pairing_token(pairing_credential: &str) -> &str {
    let trimmed = pairing_credential.trim();
    trimmed
        .split_once("#token=")
        .map_or(trimmed, |(_, token)| token.trim())
}

fn token_exchange_form(pairing_credential: &str) -> Vec<(&'static str, &str)> {
    vec![
        ("grant_type", TOKEN_EXCHANGE_GRANT_TYPE),
        ("subject_token_type", BOOTSTRAP_TOKEN_TYPE),
        ("subject_token", pairing_token(pairing_credential)),
        ("requested_token_type", ACCESS_TOKEN_TYPE),
        ("scope", SCOPES),
        ("client_label", "BorgDock"),
    ]
}

/// Whether T3 answers, and whether it still accepts BorgDock's token.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_probe(host: Option<HostRef>) -> T3Probe {
    let host = host.unwrap_or_else(HostRef::local);
    let Ok(resolved) = hosts::resolve(&host).await else {
        return T3Probe {
            running: false,
            paired: false,
            origin: None,
        };
    };
    let stored = hosts::token(&resolved.id).await.ok().flatten();
    let mut request = crate::http::client()
        .get(format!("{}/api/auth/session", resolved.origin))
        .timeout(std::time::Duration::from_secs(3));
    if let Some(ref access_token) = stored {
        request = request.bearer_auth(access_token);
    }
    let Ok(response) = request.send().await else {
        return T3Probe {
            running: false,
            paired: false,
            origin: None,
        };
    };
    // The session endpoint answers 200 for anyone; only `authenticated` tells.
    let session: Value = response.json().await.unwrap_or(Value::Null);
    T3Probe {
        running: true,
        paired: stored.is_some() && session["authenticated"] == true,
        origin: Some(resolved.origin),
    }
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_pair(pairing_credential: String, host: Option<HostRef>) -> Result<(), String> {
    let host = host.unwrap_or_else(HostRef::local);
    let resolved = hosts::resolve(&host).await?;
    let response = crate::http::client()
        .post(format!("{}/oauth/token", resolved.origin))
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
    let value: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Pairing exchange returned an invalid response: {e}"))?;
    let access_token = value["access_token"]
        .as_str()
        .ok_or_else(|| "Pairing response did not include an access token".to_string())?
        .to_string();
    hosts::store_token(&resolved.id, access_token).await
}

/// The token in what `t3 auth session issue --json` prints (log lines may precede the JSON).
fn issued_token(cli_output: &str) -> Result<String, String> {
    let start = cli_output
        .find('{')
        .ok_or_else(|| "T3 Code's CLI printed no session".to_string())?;
    let session: Value = serde_json::from_str(cli_output[start..].trim())
        .map_err(|e| format!("T3 Code's CLI printed an unreadable session: {e}"))?;
    session["token"]
        .as_str()
        .filter(|token| !token.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "T3 Code's CLI issued no token".to_string())
}

/// Pair with the T3 on this machine without a credential to paste: T3's own
/// CLI issues a session that can read and operate threads, nothing else.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_pair_local(executable: Option<String>) -> Result<(), String> {
    let output = tokio::task::spawn_blocking(move || {
        desktop::run_cli(
            executable.as_deref(),
            &[
                "auth",
                "session",
                "issue",
                "--scope",
                "orchestration:read",
                "--scope",
                "orchestration:operate",
                "--ttl",
                "30d",
                "--label",
                "BorgDock",
                "--json",
            ],
        )
    })
    .await
    .map_err(|e| e.to_string())??;
    hosts::store_token(hosts::LOCAL_HOST_ID, issued_token(&output)?).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_unpair(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, T3Sessions>,
    host: HostRef,
) -> Result<(), String> {
    hosts::forget_token(&host.id).await?;
    if host.is_local() {
        let generation = sessions.begin();
        sessions.update(generation, None, Vec::new(), |values| {
            let _ = app.emit("t3-sessions-updated", T3SessionsUpdated(values.to_vec()));
        });
    }
    Ok(())
}

/// The host's projects and threads, or `changed: false` when its sequence is
/// still `known_sequence`.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_snapshot(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, T3Sessions>,
    host: HostRef,
    known_sequence: Option<u64>,
) -> Result<shell::Snapshot, String> {
    let local = host.is_local();
    let generation = if local { sessions.begin() } else { 0 };
    let result = async {
        let client = Client::connect(&host).await?;
        client.get(SHELL_PATH).await
    }
    .await;
    let raw = match result {
        Ok(raw) => raw,
        Err(error) => {
            if local {
                sessions.update(generation, None, Vec::new(), |values| {
                    let _ = app.emit("t3-sessions-updated", T3SessionsUpdated(values.to_vec()));
                });
            }
            return Err(error);
        }
    };
    let sequence = shell::sequence_of(&raw);
    let unchanged = known_sequence == Some(sequence);
    if unchanged && (!local || !sessions.needs_snapshot(sequence)) {
        return Ok(shell::unchanged(sequence));
    }
    let snapshot = shell::read_snapshot(&raw);
    if local {
        let values = sessions_from_snapshot(&snapshot);
        sessions.update(generation, Some(sequence), values, |values| {
            let _ = app.emit("t3-sessions-updated", T3SessionsUpdated(values.to_vec()));
        });
    }
    Ok(if unchanged {
        shell::unchanged(sequence)
    } else {
        snapshot
    })
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_thread_detail(
    host: HostRef,
    thread_id: String,
) -> Result<shell::ThreadDetail, String> {
    let client = Client::connect(&host).await?;
    let snapshot = client.get(&bounded_thread_path(&thread_id)).await?;
    Ok(shell::read_detail(&snapshot))
}

fn thread_path(thread_id: &str) -> String {
    format!(
        "/api/orchestration/threads/{}",
        urlencoding::encode(thread_id)
    )
}

fn bounded_thread_path(thread_id: &str) -> String {
    format!("{}/bounded", thread_path(thread_id))
}

/// First user messages straight from T3's own database on this machine: one
/// indexed lookup per thread, far cheaper than a full snapshot each.
fn first_messages_from_database(thread_ids: &[String]) -> Result<HashMap<String, String>, String> {
    let connection = Connection::open_with_flags(
        hosts::userdata_dir()?.join("statev2.sqlite"),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Failed to open the T3 database read-only: {e}"))?;
    let mut statement = connection
        .prepare(
            "SELECT json_extract(payload_json, '$.text') FROM orchestration_v2_projection_messages \
             WHERE thread_id = ?1 AND role = 'user' ORDER BY created_at LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut found = HashMap::new();
    for thread_id in thread_ids {
        let text: Option<String> = statement
            .query_row([thread_id], |row| row.get(0))
            .ok()
            .flatten();
        if let Some(text) = text.filter(|text| !text.trim().is_empty()) {
            found.insert(thread_id.clone(), shell::clip_first_message(&text));
        }
    }
    Ok(found)
}

async fn first_messages_from_snapshots(
    client: &Client,
    thread_ids: &[String],
) -> HashMap<String, String> {
    let mut found = HashMap::new();
    for thread_id in thread_ids.iter().take(REMOTE_FIRST_MESSAGES_PER_CALL) {
        if let Ok(snapshot) = client.get(&thread_path(thread_id)).await {
            // An empty answer still counts: the thread has no user message to wait for.
            let text = shell::first_user_message(&snapshot).unwrap_or_default();
            found.insert(thread_id.clone(), text);
        }
    }
    found
}

/// The first thing the user wrote in each thread: where "pick up 59541" lives.
/// Threads missing from the answer can be asked for again.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_first_user_messages(
    host: HostRef,
    thread_ids: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    if thread_ids.is_empty() {
        return Ok(HashMap::new());
    }
    if host.is_local() {
        let ids = thread_ids.clone();
        let from_database = tokio::task::spawn_blocking(move || first_messages_from_database(&ids))
            .await
            .map_err(|e| e.to_string())?;
        match from_database {
            Ok(mut found) => {
                // No row means no user message yet; say so, so the caller stops asking.
                for thread_id in thread_ids {
                    found.entry(thread_id).or_default();
                }
                return Ok(found);
            }
            Err(error) => log::warn!("t3_first_user_messages: {error}; reading snapshots instead"),
        }
    }
    let client = Client::connect(&host).await?;
    Ok(first_messages_from_snapshots(&client, &thread_ids).await)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_conversation_references(
    host: HostRef,
    thread_ids: Vec<String>,
) -> Result<HashMap<String, references::ConversationReferences>, String> {
    if thread_ids.is_empty() {
        return Ok(HashMap::new());
    }
    if host.is_local() {
        let ids = thread_ids.clone();
        let result = tokio::task::spawn_blocking(move || {
            let connection = Connection::open_with_flags(
                hosts::userdata_dir()?.join("statev2.sqlite"),
                OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )
            .map_err(|error| error.to_string())?;
            references::from_database(&connection, &ids)
        })
        .await
        .map_err(|error| error.to_string())?;
        match result {
            Ok(found) => return Ok(found),
            Err(error) => {
                log::warn!("t3_conversation_references: {error}; reading snapshots instead")
            }
        }
    }
    let client = Client::connect(&host).await?;
    let mut found = HashMap::new();
    for id in thread_ids.iter().take(REMOTE_FIRST_MESSAGES_PER_CALL) {
        if let Ok(snapshot) = client.get(&thread_path(id)).await {
            found.insert(id.clone(), references::from_snapshot(&snapshot));
        }
    }
    Ok(found)
}

async fn environment_id(client: &Client) -> Result<String, String> {
    let descriptor = client.get("/.well-known/t3/environment").await?;
    descriptor["environmentId"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "T3 did not report its environment id".to_string())
}

/// Bring T3 Code to the front on `thread_id`.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_show_thread(
    host: HostRef,
    thread_id: String,
    executable: Option<String>,
) -> Result<(), String> {
    let client = Client::connect(&host).await?;
    let environment = environment_id(&client).await?;
    tokio::task::spawn_blocking(move || {
        desktop::open_thread(executable.as_deref(), &environment, &thread_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

async fn activate(executable: Option<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || desktop::activate(executable.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

async fn ensure_project(
    client: &Client,
    shell: &Value,
    workspace_root: &str,
) -> Result<String, String> {
    if let Some(project_id) = shell::project_for_workspace(shell, workspace_root) {
        return Ok(project_id);
    }
    let project_id = Uuid::new_v4().to_string();
    let title = Path::new(workspace_root)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("BorgDock project");
    client
        .post(
            "/api/projects/mutate",
            &json!({
                "type": "project.create",
                "commandId": Uuid::new_v4().to_string(),
                "projectId": project_id,
                "title": title,
                "workspaceRoot": workspace_root,
            }),
        )
        .await?;
    Ok(project_id)
}

/// Open a fresh, empty T3 thread on `workspace_root` for a pull request and
/// bring T3 to the front on it. Not paired: T3 is only brought forward
/// (tier 1) so the user can start the thread by hand.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
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
    let host = hosts::resolve(&HostRef::local()).await?;
    let Some(access_token) = hosts::token(&host.id).await? else {
        activate(executable).await?;
        return Ok(T3LaunchResult {
            tier: 1,
            thread_id: None,
        });
    };
    let client = Client::new(host, access_token);
    let shell = client.get(SHELL_PATH).await?;
    let project_id = ensure_project(&client, &shell, &workspace_root).await?;
    let (selection, runtime_mode) = shell::thread_defaults(&shell, &project_id);
    let thread_id = Uuid::new_v4().to_string();
    client
        .rpc(
            "orchestration.launchThread",
            json!({
                "threadId": thread_id,
                "projectId": project_id,
                "title": title,
                "modelSelection": selection.unwrap_or_else(
                    || json!({ "instanceId": model_instance, "model": model, "options": [] }),
                ),
                "runtimeMode": runtime_mode.unwrap_or_else(|| DEFAULT_RUNTIME_MODE.to_string()),
                "interactionMode": "default",
                "workspaceStrategy": { "type": "root", "branch": branch },
            }),
        )
        .await?;
    // Linking is best-effort: the thread exists and is usable without it.
    if let Err(error) = client
        .rpc(
            "orchestration.dispatchCommand",
            json!({
                "type": "thread.metadata.update",
                "threadId": thread_id,
                "linkedPullRequest": {
                    "projectId": project_id,
                    "repository": repository,
                    "number": pr_number,
                    "url": pr_url,
                },
            }),
        )
        .await
    {
        log::warn!("t3_open_thread: linking the pull request failed: {error}");
    }
    let shown = match environment_id(&client).await {
        Ok(environment) => {
            let thread = thread_id.clone();
            let configured = executable.clone();
            tokio::task::spawn_blocking(move || {
                desktop::open_thread(configured.as_deref(), &environment, &thread)
            })
            .await
            .map_err(|e| e.to_string())?
        }
        Err(error) => Err(error),
    };
    if let Err(error) = shown {
        log::warn!("t3_open_thread: could not open the thread directly: {error}");
        activate(executable).await?;
    }
    Ok(T3LaunchResult {
        tier: 2,
        thread_id: Some(thread_id),
    })
}

/// The providers and models the host can start a thread on.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_catalogue(host: HostRef) -> Result<shell::Catalogue, String> {
    let client = Client::connect(&host).await?;
    let config = client.rpc("server.getConfig", json!({})).await?;
    Ok(shell::read_catalogue(&config))
}

/// What the frontend asks for when it starts an agent on a project.
#[derive(Debug, serde::Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub project_id: Option<String>,
    pub title: String,
    /// `{ instanceId, model, options }`, as T3 takes it.
    pub model_selection: Value,
    /// The first message; the agent starts on it at once.
    pub prompt: String,
}

fn launch_command(request: &LaunchRequest, thread_id: &str, runtime_mode: &str) -> Value {
    json!({
        "threadId": thread_id,
        "projectId": request.project_id,
        "title": request.title,
        "modelSelection": request.model_selection,
        "runtimeMode": runtime_mode,
        "interactionMode": "default",
        "workspaceStrategy": { "type": "root" },
        "initialMessage": {
            "messageId": Uuid::new_v4().to_string(),
            "text": request.prompt,
            "attachments": [],
        },
    })
}

/// Start a thread with a first message on a project. The thread runs in the
/// runtime mode of the thread touched last on that host, as a new thread in
/// T3 itself would. Returns the new thread's id.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_launch_thread(host: HostRef, request: LaunchRequest) -> Result<String, String> {
    let client = Client::connect(&host).await?;
    launch_with_client(&client, request).await
}

async fn launch_with_client(client: &Client, mut request: LaunchRequest) -> Result<String, String> {
    if request.prompt.trim().is_empty() {
        return Err("The first message is empty".to_string());
    }
    let project_id = match &request.project_id {
        Some(id) if !id.trim().is_empty() => id.clone(),
        Some(_) => return Err("The project id is empty".to_string()),
        None => {
            let scratch = client.rpc("projects.ensureScratch", json!({})).await?;
            scratch["projectId"]
                .as_str()
                .filter(|id| !id.is_empty())
                .ok_or_else(|| "T3 did not return its No project workspace".to_string())?
                .to_string()
        }
    };
    request.project_id = Some(project_id.clone());
    let shell = client.get(SHELL_PATH).await?;
    let (_, runtime_mode) = shell::thread_defaults(&shell, &project_id);
    let thread_id = Uuid::new_v4().to_string();
    client
        .rpc(
            "orchestration.launchThread",
            launch_command(
                &request,
                &thread_id,
                runtime_mode.as_deref().unwrap_or(DEFAULT_RUNTIME_MODE),
            ),
        )
        .await?;
    Ok(thread_id)
}

async fn dispatch(client: &Client, command: Value) -> Result<(), String> {
    client
        .rpc("orchestration.dispatchCommand", command)
        .await
        .map(|_| ())
}

fn respond_command(thread_id: &str, request_id: &str, answers: Value) -> Value {
    json!({
        "type": "runtime-request.respond",
        "threadId": thread_id,
        "requestId": request_id,
        "answers": answers,
    })
}

fn message_command(thread_id: &str, text: &str) -> Value {
    json!({
        "type": "message.dispatch",
        "threadId": thread_id,
        "messageId": Uuid::new_v4().to_string(),
        "text": text,
        "attachments": [],
        "createdBy": "user",
        "creationSource": "web",
        "dispatchMode": { "type": "start_immediately" },
        "deliveryIntent": "auto",
    })
}

/// Answer the questions an agent is waiting on. `answers` maps each question
/// id to the picked option's value, or to the text the user typed.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_respond(
    host: HostRef,
    thread_id: String,
    request_id: String,
    answers: HashMap<String, Value>,
) -> Result<(), String> {
    let client = Client::connect(&host).await?;
    dispatch(
        &client,
        respond_command(&thread_id, &request_id, json!(answers)),
    )
    .await
}

/// Send the agent a message and start its next turn. A thread in plan mode
/// stays read-only, so `leave_plan_mode` switches it back first.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_send_message(
    host: HostRef,
    thread_id: String,
    text: String,
    leave_plan_mode: bool,
) -> Result<(), String> {
    let client = Client::connect(&host).await?;
    if leave_plan_mode {
        dispatch(
            &client,
            json!({
                "type": "thread.interaction-mode.set",
                "threadId": thread_id,
                "interactionMode": "default",
            }),
        )
        .await?;
    }
    dispatch(&client, message_command(&thread_id, &text)).await
}

/// Settle a thread: it is done, and its project is free for other work.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_settle(host: HostRef, thread_id: String) -> Result<(), String> {
    let client = Client::connect(&host).await?;
    dispatch(
        &client,
        json!({ "type": "thread.settle", "threadId": thread_id }),
    )
    .await
}

fn session_status(status: &str) -> &'static str {
    match status {
        "approval" => "waitingApproval",
        "question" => "waitingInput",
        "settled" => "settled",
        "running" => "running",
        _ => "active",
    }
}

/// The threads on this machine, for the T3 strip on pull requests.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn t3_list_sessions(
    sessions: tauri::State<'_, T3Sessions>,
) -> Result<Vec<T3Session>, String> {
    Ok(sessions
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .values
        .clone())
}

#[derive(Default)]
pub struct T3Sessions(Mutex<SessionCache>);

#[derive(Default)]
struct SessionCache {
    generation: u64,
    sequence: Option<u64>,
    values: Vec<T3Session>,
}

impl T3Sessions {
    fn begin(&self) -> u64 {
        let mut cache = self.0.lock().unwrap_or_else(|p| p.into_inner());
        cache.generation += 1;
        cache.generation
    }

    fn needs_snapshot(&self, sequence: u64) -> bool {
        self.0.lock().unwrap_or_else(|p| p.into_inner()).sequence != Some(sequence)
    }

    fn update(
        &self,
        generation: u64,
        sequence: Option<u64>,
        values: Vec<T3Session>,
        publish: impl FnOnce(&[T3Session]),
    ) {
        let mut cache = self.0.lock().unwrap_or_else(|p| p.into_inner());
        if cache.generation != generation {
            return;
        }
        if sequence.is_none() && cache.sequence.is_none() && cache.values.is_empty() {
            return;
        }
        cache.sequence = sequence;
        cache.values = values;
        publish(&cache.values);
    }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(test, derive(specta::Type, tauri_specta::Event))]
#[serde(transparent)]
pub struct T3SessionsUpdated(pub Vec<T3Session>);

fn sessions_from_snapshot(snapshot: &shell::Snapshot) -> Vec<T3Session> {
    let mut sessions: Vec<T3Session> = snapshot
        .threads
        .iter()
        .map(|thread| T3Session {
            status: session_status(&thread.status).to_string(),
            updated_at: thread.last_activity_at.clone(),
            pull_request_urls: thread
                .pull_requests
                .iter()
                .map(|pr| pr.url.clone())
                .collect(),
            thread_id: thread.id.clone(),
            title: thread.title.clone(),
            branch: thread.branch.clone(),
        })
        .collect();
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    sessions
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(title: &str) -> T3Session {
        T3Session {
            thread_id: "thread".into(),
            title: title.into(),
            branch: None,
            status: "running".into(),
            updated_at: "now".into(),
            pull_request_urls: Vec::new(),
        }
    }

    #[test]
    fn obsolete_snapshots_cannot_publish_over_a_newer_request() {
        let sessions = T3Sessions::default();
        let old = sessions.begin();
        let current = sessions.begin();
        let mut published = Vec::new();
        sessions.update(current, Some(2), vec![session("current")], |values| {
            published.push(values[0].title.clone())
        });
        sessions.update(old, Some(1), vec![session("old")], |_| {
            panic!("obsolete event")
        });
        assert_eq!(published, vec!["current"]);
        assert_eq!(sessions.0.lock().unwrap().values[0].title, "current");
    }

    #[test]
    fn invalidation_clears_sessions_and_same_sequence_recovery_repopulates_them() {
        let sessions = T3Sessions::default();
        let first = sessions.begin();
        sessions.update(first, Some(7), vec![session("active")], |_| {});
        assert!(!sessions.needs_snapshot(7));
        let invalidation = sessions.begin();
        sessions.update(invalidation, None, Vec::new(), |values| {
            assert!(values.is_empty())
        });
        assert!(sessions.needs_snapshot(7));
        sessions.update(first, Some(7), vec![session("obsolete")], |_| {
            panic!("stale event after invalidation")
        });
        let recovery = sessions.begin();
        sessions.update(recovery, Some(7), vec![session("recovered")], |_| {});
        assert!(!sessions.needs_snapshot(7));
        assert_eq!(sessions.0.lock().unwrap().values[0].title, "recovered");
    }

    #[test]
    fn token_exchange_requests_an_access_token_with_both_scopes() {
        let form = token_exchange_form("PAIRING-CREDENTIAL");
        assert!(form.contains(&("requested_token_type", ACCESS_TOKEN_TYPE)));
        assert!(form.contains(&("scope", "orchestration:read orchestration:operate")));
    }

    #[test]
    fn pairing_token_accepts_raw_credentials_and_pairing_links() {
        assert_eq!(pairing_token("PAIRING-CREDENTIAL"), "PAIRING-CREDENTIAL");
        assert_eq!(
            pairing_token("http://127.0.0.1:3773/pair#token=PAIRING-CREDENTIAL"),
            "PAIRING-CREDENTIAL"
        );
    }

    #[test]
    fn the_issued_token_is_read_past_any_log_lines() {
        let output = "info: starting
{\"sessionId\":\"s\",\"token\":\"abc\",\"expiresAt\":\"2026-11-11T00:00:00Z\"}
";
        assert_eq!(issued_token(output).unwrap(), "abc");
        assert!(issued_token("no session here").is_err());
    }

    #[test]
    fn a_launch_runs_in_the_project_root_and_starts_on_the_first_message() {
        let request = LaunchRequest {
            project_id: Some("p1".to_string()),
            title: "AB#60201 Search ignores accents".to_string(),
            model_selection: json!({ "instanceId": "codex", "model": "default", "options": [] }),
            prompt: "Pick up AB#60201".to_string(),
        };
        let command = launch_command(&request, "thread-1", "full-access");
        assert_eq!(command["threadId"], "thread-1");
        assert_eq!(command["workspaceStrategy"]["type"], "root");
        assert_eq!(command["interactionMode"], "default");
        assert_eq!(command["initialMessage"]["text"], "Pick up AB#60201");
        assert_eq!(command["initialMessage"]["attachments"], json!([]));
    }

    #[tokio::test]
    async fn a_projectless_launch_uses_the_selected_servers_scratch_workspace() {
        use futures_util::{SinkExt, StreamExt};
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;
        use tokio_tungstenite::tungstenite::Message;

        async fn http(listener: &TcpListener, path: &str, body: Value) {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            loop {
                let mut byte = [0];
                socket.read_exact(&mut byte).await.unwrap();
                request.push(byte[0]);
                if request.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8(request).unwrap();
            assert!(request.lines().next().unwrap().contains(path));
            assert!(request
                .to_lowercase()
                .contains("authorization: bearer test-token"));
            let body = body.to_string();
            socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).as_bytes()).await.unwrap();
        }

        async fn rpc(listener: &TcpListener, expected_tag: &str, response: Value) -> Value {
            http(
                listener,
                "/api/auth/websocket-ticket",
                json!({"ticket": "test-ticket"}),
            )
            .await;
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(socket).await.unwrap();
            let request = socket.next().await.unwrap().unwrap().into_text().unwrap();
            let request: Value = serde_json::from_str(&request).unwrap();
            assert_eq!(request["tag"], expected_tag);
            socket.send(Message::Text(json!({"_tag":"Exit", "requestId":"1", "exit":{"_tag":"Success", "value": response}}).to_string().into())).await.unwrap();
            let _ = socket.next().await;
            request["payload"].clone()
        }

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            rpc(
                &listener,
                "projects.ensureScratch",
                json!({"projectId":"remote-scratch"}),
            )
            .await;
            http(&listener, SHELL_PATH, json!({"threads":[]})).await;
            let launch = rpc(&listener, "orchestration.launchThread", json!({})).await;
            assert_eq!(launch["projectId"], "remote-scratch");
            assert_eq!(launch["workspaceStrategy"]["type"], "root");
            assert_eq!(launch["initialMessage"]["text"], "Clean up this host");
            assert_eq!(launch["modelSelection"]["instanceId"], "remote-provider");
        });
        let client = Client::new(
            hosts::Host {
                id: "mini".into(),
                origin,
                is_local: false,
            },
            "test-token".into(),
        );
        let request = LaunchRequest {
            project_id: None,
            title: "Disk cleanup".into(),
            model_selection: json!({"instanceId":"remote-provider", "model":"default", "options":[]}),
            prompt: "Clean up this host".into(),
        };
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            launch_with_client(&client, request),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(!result.is_empty());
        server.await.unwrap();
    }

    #[test]
    fn a_response_names_the_request_and_carries_the_answers() {
        let command = respond_command("t", "req", json!({ "q": "Row id (Recommended)" }));
        assert_eq!(command["type"], "runtime-request.respond");
        assert_eq!(command["requestId"], "req");
        assert_eq!(command["answers"]["q"], "Row id (Recommended)");
    }

    #[test]
    fn a_message_starts_a_turn_and_has_every_field_t3_requires() {
        let command = message_command("t", "Go ahead with the plan.");
        assert_eq!(command["type"], "message.dispatch");
        assert_eq!(command["attachments"], json!([]));
        assert_eq!(command["createdBy"], "user");
        assert_eq!(command["creationSource"], "web");
        assert_eq!(command["dispatchMode"]["type"], "start_immediately");
        assert!(command["messageId"].as_str().is_some());
    }

    #[test]
    fn thread_paths_encode_the_id() {
        assert_eq!(
            bounded_thread_path("env:thread 1"),
            "/api/orchestration/threads/env%3Athread%201/bounded"
        );
    }

    /// Read-only check against the T3 on this machine:
    /// `cargo test --lib t3::commands::tests::live -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "talks to the local T3; needs BorgDock to be paired"]
    async fn live_shell_detail_and_config() {
        // BORGDOCK_T3_TEST_TOKEN lets the check run with a short-lived token
        // instead of BorgDock's stored pairing.
        let client = match std::env::var("BORGDOCK_T3_TEST_TOKEN") {
            Ok(token) => Client::new(hosts::resolve(&HostRef::local()).await.unwrap(), token),
            Err(_) => Client::connect(&HostRef::local()).await.unwrap(),
        };
        let raw = client.get(SHELL_PATH).await.unwrap();
        let snapshot = shell::read_snapshot(&raw);
        let mut by_status: HashMap<&str, usize> = HashMap::new();
        for thread in &snapshot.threads {
            *by_status.entry(thread.status.as_str()).or_default() += 1;
        }
        println!(
            "sequence={} projects={} threads={} of {} statuses={by_status:?}",
            snapshot.sequence,
            snapshot.projects.len(),
            snapshot.threads.len(),
            raw["threads"].as_array().map_or(0, Vec::len),
        );
        assert!(!snapshot.projects.is_empty());

        if let Some(thread) = snapshot.threads.iter().find(|t| t.status != "settled") {
            let detail =
                shell::read_detail(&client.get(&bounded_thread_path(&thread.id)).await.unwrap());
            println!(
                "detail status={} agent_message_chars={} questions={}",
                thread.status,
                detail.last_agent_message.map_or(0, |m| m.chars().count()),
                detail.questions.len()
            );
            let first = t3_first_user_messages(HostRef::local(), vec![thread.id.clone()])
                .await
                .unwrap();
            println!("first message chars={}", first[&thread.id].chars().count());
        }

        let config = client.rpc("server.getConfig", json!({})).await.unwrap();
        println!(
            "environment={} version={} providers={}",
            config["environment"]["environmentId"].as_str().is_some(),
            config["environment"]["serverVersion"],
            config["providers"].as_array().map_or(0, Vec::len)
        );
        assert!(config["environment"]["environmentId"].as_str().is_some());
    }

    #[test]
    fn session_statuses_keep_the_names_the_strip_shows() {
        assert_eq!(session_status("question"), "waitingInput");
        assert_eq!(session_status("approval"), "waitingApproval");
        assert_eq!(session_status("plan"), "active");
        assert_eq!(session_status("running"), "running");
    }
}
