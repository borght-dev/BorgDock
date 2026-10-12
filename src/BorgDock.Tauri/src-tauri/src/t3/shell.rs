//! What a T3 host reports, reduced to what BorgDock shows: the shell snapshot
//! (projects and threads with a status) and a thread's detail (the agent's
//! last message and its open questions).
//!
//! T3's schemas grow between releases, so every field is optional here and a
//! thread that does not parse is skipped instead of failing the snapshot.

use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Settled threads older than this are left out.
const RECENT_DAYS: i64 = 60;
const AGENT_MESSAGE_LIMIT: usize = 1200;
const FIRST_MESSAGE_LIMIT: usize = 4000;

const RUNNING_STATES: [&str; 5] = ["preparing", "queued", "starting", "running", "waiting"];

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ShellProject {
    id: String,
    title: String,
    workspace_root: Option<String>,
    default_model_selection: Option<Value>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ModelSelection {
    instance_id: Option<String>,
    model: Option<String>,
    options: Option<Value>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct LinkedPullRequest {
    number: u64,
    url: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct PullRequestSnapshot {
    state: Option<String>,
    title: Option<String>,
    head_branch: Option<String>,
    is_draft: Option<bool>,
    merged_at: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct PullRequestLink {
    number: u64,
    url: String,
    source: Option<String>,
    snapshot: Option<PullRequestSnapshot>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct PendingRuntimeRequest {
    kind: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ShellThread {
    id: String,
    project_id: String,
    title: String,
    model_selection: Option<ModelSelection>,
    runtime_mode: Option<String>,
    interaction_mode: Option<String>,
    branch: Option<String>,
    worktree_path: Option<String>,
    linked_pull_request: Option<LinkedPullRequest>,
    pull_requests: Option<Vec<PullRequestLink>>,
    branch_pull_request: Option<LinkedPullRequest>,
    latest_run_requested_at: Option<String>,
    latest_run_started_at: Option<String>,
    latest_run_completed_at: Option<String>,
    activity_run_status: Option<String>,
    status: Option<String>,
    pending_runtime_request: Option<PendingRuntimeRequest>,
    latest_user_message_at: Option<String>,
    has_actionable_proposed_plan: Option<bool>,
    pending_background_tasks: Option<Vec<Value>>,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
    settled_at: Option<String>,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDto {
    pub id: String,
    pub title: String,
    pub workspace_root: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDto {
    pub number: u64,
    pub url: String,
    /// `open`, `merged`, `closed` or `unknown`.
    pub state: String,
    pub title: String,
    pub head_branch: Option<String>,
    pub is_draft: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDto {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub created_at: String,
    pub last_activity_at: String,
    /// `question`, `plan`, `approval`, `your-turn`, `failed`, `running` or `settled`.
    pub status: String,
    pub interaction_mode: String,
    pub runtime_mode: String,
    pub model: String,
    pub model_instance: Option<String>,
    pub effort: Option<String>,
    pub pull_requests: Vec<PullRequestDto>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// False when the host's sequence equals the one the caller already has;
    /// `projects` and `threads` are then empty.
    pub changed: bool,
    pub sequence: u64,
    pub projects: Vec<ProjectDto>,
    pub threads: Vec<ThreadDto>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOptionDto {
    pub label: String,
    /// What T3 expects back for this option.
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionDto {
    pub id: String,
    pub question: String,
    pub options: Vec<QuestionOptionDto>,
    /// Index of the option the agent marked "(Recommended)".
    pub recommended: Option<usize>,
    pub allow_custom_answer: bool,
    pub multi_select: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDetail {
    pub last_agent_message: Option<String>,
    /// Present while the agent waits for answers.
    pub question_request_id: Option<String>,
    pub questions: Vec<QuestionDto>,
}

/// The agent needs you only when it waits for input or approval, or has
/// stopped (done, a plan to approve, an error). Anything T3 shows as working
/// counts as working, including background work after a finished turn.
fn status_of(thread: &ShellThread) -> &'static str {
    if thread.archived_at.is_some() || thread.settled_at.is_some() {
        return "settled";
    }
    if let Some(request) = &thread.pending_runtime_request {
        return if request.kind == "user_input" {
            "question"
        } else {
            "approval"
        };
    }
    let run_status = thread.status.as_deref().unwrap_or("idle");
    let activity = thread.activity_run_status.as_deref().unwrap_or("");
    if RUNNING_STATES.contains(&activity) || RUNNING_STATES.contains(&run_status) {
        return "running";
    }
    if run_status == "failed" {
        return "failed";
    }
    if thread
        .pending_background_tasks
        .as_ref()
        .is_some_and(|tasks| !tasks.is_empty())
    {
        return "running";
    }
    if thread.has_actionable_proposed_plan == Some(true) {
        return "plan";
    }
    "your-turn"
}

fn pull_request_state(snapshot: Option<&PullRequestSnapshot>) -> &'static str {
    let Some(snapshot) = snapshot else {
        return "unknown";
    };
    match snapshot.state.as_deref() {
        _ if snapshot.merged_at.is_some() => "merged",
        Some("merged") => "merged",
        Some("open") => "open",
        Some("closed") => "closed",
        _ => "unknown",
    }
}

fn pull_requests_of(thread: &ShellThread) -> Vec<PullRequestDto> {
    let mut found: Vec<PullRequestDto> = thread
        .pull_requests
        .iter()
        .flatten()
        .filter(|link| link.source.as_deref() != Some("stack-dismissed"))
        .map(|link| PullRequestDto {
            number: link.number,
            url: link.url.clone(),
            state: pull_request_state(link.snapshot.as_ref()).to_string(),
            title: link
                .snapshot
                .as_ref()
                .and_then(|s| s.title.clone())
                .unwrap_or_default(),
            head_branch: link.snapshot.as_ref().and_then(|s| s.head_branch.clone()),
            is_draft: link
                .snapshot
                .as_ref()
                .and_then(|s| s.is_draft)
                .unwrap_or(false),
        })
        .collect();
    // A pull request known only through the branch or the legacy link has no snapshot.
    for extra in [&thread.branch_pull_request, &thread.linked_pull_request]
        .into_iter()
        .flatten()
    {
        if extra.url.is_empty() || found.iter().any(|pr| pr.number == extra.number) {
            continue;
        }
        found.push(PullRequestDto {
            number: extra.number,
            url: extra.url.clone(),
            state: "unknown".to_string(),
            title: String::new(),
            head_branch: thread.branch.clone(),
            is_draft: false,
        });
    }
    found
}

fn effort_of(selection: &ModelSelection) -> Option<String> {
    selection
        .options
        .as_ref()?
        .as_array()?
        .iter()
        .find(|option| option["id"] == "reasoningEffort" || option["id"] == "effort")
        .and_then(|option| option["value"].as_str())
        .map(str::to_string)
}

fn to_thread(thread: ShellThread) -> ThreadDto {
    let status = status_of(&thread).to_string();
    let pull_requests = pull_requests_of(&thread);
    let last_activity_at = [
        Some(&thread.created_at),
        thread.latest_user_message_at.as_ref(),
        thread.latest_run_requested_at.as_ref(),
        thread.latest_run_started_at.as_ref(),
        thread.latest_run_completed_at.as_ref(),
    ]
    .into_iter()
    .flatten()
    .max()
    .cloned()
    .unwrap_or_default();
    let selection = thread.model_selection.unwrap_or_default();
    ThreadDto {
        effort: effort_of(&selection),
        model: selection.model.unwrap_or_else(|| "unknown".to_string()),
        model_instance: selection.instance_id,
        id: thread.id,
        project_id: thread.project_id,
        title: thread.title,
        branch: thread.branch,
        worktree_path: thread.worktree_path,
        created_at: thread.created_at,
        last_activity_at,
        status,
        interaction_mode: thread
            .interaction_mode
            .unwrap_or_else(|| "default".to_string()),
        runtime_mode: thread
            .runtime_mode
            .unwrap_or_else(|| "full-access".to_string()),
        pull_requests,
    }
}

fn is_relevant(thread: &ShellThread, cutoff: &str) -> bool {
    if thread.deleted_at.is_some() || thread.id.is_empty() {
        return false;
    }
    let open = thread.archived_at.is_none() && thread.settled_at.is_none();
    open || thread.updated_at.as_str() >= cutoff
}

fn parse_threads(shell: &Value) -> Vec<ShellThread> {
    shell["threads"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(
            |thread| match serde_json::from_value::<ShellThread>(thread.clone()) {
                Ok(thread) => Some(thread),
                Err(error) => {
                    log::warn!("T3 shell: skipped a thread that did not parse: {error}");
                    None
                }
            },
        )
        .collect()
}

fn parse_projects(shell: &Value) -> Vec<ShellProject> {
    shell["projects"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|project| serde_json::from_value::<ShellProject>(project.clone()).ok())
        .filter(|project| !project.id.is_empty())
        .collect()
}

pub fn sequence_of(shell: &Value) -> u64 {
    shell["snapshotSequence"].as_u64().unwrap_or(0)
}

/// The shell as BorgDock shows it: every project, and the threads that are
/// open or were touched in the last two months.
pub fn read_snapshot(shell: &Value) -> Snapshot {
    let cutoff = (Utc::now() - Duration::days(RECENT_DAYS)).to_rfc3339();
    Snapshot {
        changed: true,
        sequence: sequence_of(shell),
        projects: parse_projects(shell)
            .into_iter()
            .map(|project| ProjectDto {
                id: project.id,
                title: project.title,
                workspace_root: project.workspace_root,
            })
            .collect(),
        threads: parse_threads(shell)
            .into_iter()
            .filter(|thread| is_relevant(thread, &cutoff))
            .map(to_thread)
            .collect(),
    }
}

pub fn unchanged(sequence: u64) -> Snapshot {
    Snapshot {
        changed: false,
        sequence,
        projects: Vec::new(),
        threads: Vec::new(),
    }
}

/// What a new thread on `project_id` starts with: the project's own default
/// model, else the model and runtime mode of the thread touched last.
pub fn thread_defaults(shell: &Value, project_id: &str) -> (Option<Value>, Option<String>) {
    let project_default = parse_projects(shell)
        .into_iter()
        .find(|project| project.id == project_id)
        .and_then(|project| project.default_model_selection)
        .filter(|selection| !selection.is_null());
    let latest = shell["threads"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|thread| thread["deletedAt"].is_null())
        .max_by_key(|thread| thread["updatedAt"].as_str().unwrap_or("").to_string());
    let latest_selection = latest
        .map(|thread| thread["modelSelection"].clone())
        .filter(|selection| !selection.is_null());
    let runtime_mode = latest
        .and_then(|thread| thread["runtimeMode"].as_str())
        .map(str::to_string);
    (project_default.or(latest_selection), runtime_mode)
}

/// The project whose workspace root is `workspace`, compared the way Windows
/// compares paths.
pub fn project_for_workspace(shell: &Value, workspace: &str) -> Option<String> {
    let wanted = comparable_path(workspace);
    parse_projects(shell)
        .into_iter()
        .find(|project| {
            project
                .workspace_root
                .as_deref()
                .is_some_and(|root| comparable_path(root) == wanted)
        })
        .map(|project| project.id)
}

fn comparable_path(path: &str) -> String {
    path.replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn clipped(text: &str, limit: usize) -> String {
    text.trim().chars().take(limit).collect()
}

fn messages_of(snapshot: &Value) -> &[Value] {
    snapshot["projection"]["messages"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn has_text(message: &Value, role: &str) -> bool {
    message["role"] == role
        && message["text"]
            .as_str()
            .is_some_and(|t| !t.trim().is_empty())
}

const RECOMMENDED_SUFFIX: &str = "(recommended)";

fn without_recommended_suffix(label: &str) -> Option<String> {
    let trimmed = label.trim_end();
    let cut = trimmed.len().checked_sub(RECOMMENDED_SUFFIX.len())?;
    if !trimmed.is_char_boundary(cut) || !trimmed[cut..].eq_ignore_ascii_case(RECOMMENDED_SUFFIX) {
        return None;
    }
    Some(trimmed[..cut].trim_end().to_string())
}

fn parse_question(question: &Value) -> QuestionDto {
    let mut recommended = None;
    let options = question["options"]
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
        .map(|(index, option)| {
            let label = option["label"].as_str().unwrap_or("").to_string();
            let value = option["value"].as_str().unwrap_or(&label).to_string();
            let shown = match without_recommended_suffix(&label) {
                Some(stripped) => {
                    recommended.get_or_insert(index);
                    stripped
                }
                None => label,
            };
            QuestionOptionDto {
                label: shown,
                value,
            }
        })
        .collect();
    QuestionDto {
        id: question["id"].as_str().unwrap_or("").to_string(),
        question: question["question"].as_str().unwrap_or("").to_string(),
        options,
        recommended,
        allow_custom_answer: question["allowCustomAnswer"].as_bool().unwrap_or(true),
        multi_select: question["multiSelect"].as_bool().unwrap_or(false),
    }
}

/// The agent's last message and its open questions, from a thread snapshot.
pub fn read_detail(snapshot: &Value) -> ThreadDetail {
    let last_agent_message = messages_of(snapshot)
        .iter()
        .rev()
        .find(|message| has_text(message, "assistant"))
        .and_then(|message| message["text"].as_str())
        .map(|text| clipped(text, AGENT_MESSAGE_LIMIT));

    let projection = &snapshot["projection"];
    let pending = projection["runtimeRequests"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|request| request["kind"] == "user_input" && request["status"] == "pending")
        .and_then(|request| request["id"].as_str());
    let asked = pending.and_then(|request_id| {
        projection["turnItems"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|item| item["type"] == "user_input_request" && item["requestId"] == request_id)
    });

    ThreadDetail {
        last_agent_message,
        question_request_id: asked.and(pending).map(str::to_string),
        questions: asked
            .and_then(|item| item["questions"].as_array())
            .into_iter()
            .flatten()
            .map(parse_question)
            .collect(),
    }
}

/// The first thing the user wrote in a thread, from its full snapshot.
pub fn first_user_message(snapshot: &Value) -> Option<String> {
    messages_of(snapshot)
        .iter()
        .find(|message| has_text(message, "user"))
        .and_then(|message| message["text"].as_str())
        .map(|text| clipped(text, FIRST_MESSAGE_LIMIT))
}

pub fn clip_first_message(text: &str) -> String {
    clipped(text, FIRST_MESSAGE_LIMIT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn status(extra: Value) -> &'static str {
        let mut thread = json!({ "id": "t", "projectId": "p", "title": "x", "createdAt": "2026-10-01T00:00:00Z", "updatedAt": "2026-10-01T00:00:00Z" });
        for (key, value) in extra.as_object().unwrap() {
            thread[key] = value.clone();
        }
        status_of(&serde_json::from_value::<ShellThread>(thread).unwrap())
    }

    #[test]
    fn only_a_question_an_approval_or_a_stopped_agent_needs_you() {
        let task = json!([{ "taskId": "bg", "kind": "command" }]);
        assert_eq!(
            status(
                json!({ "status": "completed", "hasActionableProposedPlan": true, "pendingBackgroundTasks": task })
            ),
            "running",
            "implementing a plan in the background"
        );
        assert_eq!(
            status(json!({ "status": "completed", "hasActionableProposedPlan": true })),
            "plan"
        );
        assert_eq!(
            status(json!({ "activityRunStatus": "running", "hasActionableProposedPlan": true })),
            "running"
        );
        assert_eq!(
            status(
                json!({ "status": "waiting", "pendingRuntimeRequest": { "id": "r", "kind": "user_input" }, "pendingBackgroundTasks": task })
            ),
            "question",
            "a question always needs you"
        );
        assert_eq!(
            status(json!({ "pendingRuntimeRequest": { "id": "r", "kind": "command" } })),
            "approval"
        );
        assert_eq!(status(json!({ "status": "failed" })), "failed");
        assert_eq!(status(json!({ "status": "completed" })), "your-turn");
        assert_eq!(status(json!({ "status": "queued" })), "running");
        assert_eq!(status(json!({})), "your-turn", "a thread nobody ran yet");
        assert_eq!(
            status(json!({ "status": "running", "settledAt": "2026-10-01T00:00:00Z" })),
            "settled"
        );
    }

    fn shell() -> Value {
        json!({
            "schemaVersion": 2,
            "snapshotSequence": 41,
            "projects": [
                { "id": "p1", "title": "W1", "workspaceRoot": "D:\\Work\\Shop", "defaultModelSelection": null },
                { "id": "p2", "title": "W2", "workspaceRoot": "D:\\Work\\Shop\\.worktrees\\two",
                  "defaultModelSelection": { "instanceId": "codex", "model": "default" } }
            ],
            "threads": [
                {
                    "id": "open", "projectId": "p1", "title": "AB#60214 Order list", "branch": "fix/60214-order-list",
                    "worktreePath": null, "runtimeMode": "full-access", "interactionMode": "default",
                    "modelSelection": { "instanceId": "codex", "model": "default",
                        "options": [{ "id": "reasoningEffort", "value": "high" }] },
                    "status": "completed", "createdAt": "2026-10-10T08:00:00Z", "updatedAt": "2026-10-10T09:30:00Z",
                    "latestUserMessageAt": "2026-10-10T08:00:01Z", "latestRunCompletedAt": "2026-10-10T09:30:00Z",
                    "archivedAt": null, "settledAt": null, "deletedAt": null, "hasActionableProposedPlan": false,
                    "pullRequests": [
                        { "host": "github.com", "repository": "acme/shop", "number": 3712,
                          "url": "https://github.com/acme/shop/pull/3712", "source": "created",
                          "snapshot": { "state": "open", "title": "fix: scroll (AB#60214)", "headBranch": "fix/60214-order-list", "isDraft": true } },
                        { "host": "github.com", "repository": "acme/shop", "number": 9,
                          "url": "https://github.com/acme/shop/pull/9", "source": "stack-dismissed", "snapshot": null }
                    ],
                    "branchPullRequest": { "projectId": "p1", "repository": "acme/shop", "number": 3712,
                        "url": "https://github.com/acme/shop/pull/3712" }
                },
                {
                    "id": "old", "projectId": "p1", "title": "Long gone", "status": "completed",
                    "createdAt": "2025-01-01T00:00:00Z", "updatedAt": "2025-01-02T00:00:00Z",
                    "settledAt": "2025-01-02T00:00:00Z", "deletedAt": null
                },
                {
                    "id": "deleted", "projectId": "p1", "title": "Removed", "status": "running",
                    "createdAt": "2026-10-10T08:00:00Z", "updatedAt": "2026-10-10T08:00:00Z",
                    "deletedAt": "2026-10-10T08:05:00Z"
                },
                { "id": 7, "projectId": "p1" }
            ]
        })
    }

    #[test]
    fn the_snapshot_keeps_open_threads_and_drops_old_deleted_and_malformed_ones() {
        let snapshot = read_snapshot(&shell());
        assert!(snapshot.changed);
        assert_eq!(snapshot.sequence, 41);
        assert_eq!(snapshot.projects.len(), 2);
        assert_eq!(
            snapshot.projects[0].workspace_root.as_deref(),
            Some("D:\\Work\\Shop")
        );
        let ids: Vec<&str> = snapshot.threads.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["open"]);
    }

    #[test]
    fn a_thread_carries_its_model_effort_activity_and_pull_requests() {
        let snapshot = read_snapshot(&shell());
        let thread = &snapshot.threads[0];
        assert_eq!(thread.status, "your-turn");
        assert_eq!(thread.model, "default");
        assert_eq!(thread.model_instance.as_deref(), Some("codex"));
        assert_eq!(thread.effort.as_deref(), Some("high"));
        assert_eq!(thread.last_activity_at, "2026-10-10T09:30:00Z");
        assert_eq!(
            thread.pull_requests.len(),
            1,
            "dismissed and duplicate links are left out"
        );
        assert_eq!(thread.pull_requests[0].state, "open");
        assert!(thread.pull_requests[0].is_draft);
    }

    #[test]
    fn a_branch_pull_request_without_a_snapshot_is_listed_as_unknown() {
        let mut shell = shell();
        shell["threads"][0]["pullRequests"] = json!([]);
        let thread = &read_snapshot(&shell).threads[0];
        assert_eq!(thread.pull_requests[0].number, 3712);
        assert_eq!(thread.pull_requests[0].state, "unknown");
        assert_eq!(
            thread.pull_requests[0].head_branch.as_deref(),
            Some("fix/60214-order-list")
        );
    }

    #[test]
    fn a_merged_pull_request_is_merged_whatever_its_state_says() {
        let snapshot: PullRequestSnapshot = serde_json::from_value(
            json!({ "state": "closed", "mergedAt": "2026-10-01T00:00:00Z" }),
        )
        .unwrap();
        assert_eq!(pull_request_state(Some(&snapshot)), "merged");
        assert_eq!(pull_request_state(None), "unknown");
    }

    #[test]
    fn new_threads_start_with_the_project_default_or_the_latest_thread() {
        let shell = shell();
        let (selection, runtime_mode) = thread_defaults(&shell, "p2");
        assert_eq!(selection.unwrap()["instanceId"], "codex");
        assert_eq!(runtime_mode.as_deref(), Some("full-access"));
        let (fallback, _) = thread_defaults(&shell, "p1");
        assert_eq!(fallback.unwrap()["options"][0]["value"], "high");
    }

    #[test]
    fn projects_are_found_by_workspace_root_whatever_the_slashes_or_case() {
        let shell = shell();
        assert_eq!(
            project_for_workspace(&shell, "d:/work/shop/.worktrees/two/").as_deref(),
            Some("p2")
        );
        assert_eq!(project_for_workspace(&shell, "D:\\Elsewhere"), None);
    }

    fn detail_snapshot() -> Value {
        json!({ "snapshotSequence": 3, "projection": {
            "messages": [
                { "role": "user", "text": "Pick up AB#60214: Order list loses its scroll position" },
                { "role": "assistant", "text": "  I looked at the grid.  " },
                { "role": "assistant", "text": "" }
            ],
            "runtimeRequests": [
                { "id": "old", "kind": "user_input", "status": "resolved" },
                { "id": "req", "kind": "user_input", "status": "pending" }
            ],
            "turnItems": [
                { "type": "user_input_request", "requestId": "old", "questions": [] },
                { "type": "user_input_request", "requestId": "req", "questions": [{
                    "id": "restore", "header": "Restore", "question": "Row id or pixel offset?",
                    "options": [
                        { "label": "Row id (Recommended)", "description": "Stable" },
                        { "label": "Pixel offset", "description": "", "value": "offset" }
                    ],
                    "multiSelect": false
                }] }
            ]
        } })
    }

    #[test]
    fn the_detail_has_the_last_agent_message_and_the_pending_question() {
        let detail = read_detail(&detail_snapshot());
        assert_eq!(
            detail.last_agent_message.as_deref(),
            Some("I looked at the grid.")
        );
        assert_eq!(detail.question_request_id.as_deref(), Some("req"));
        assert_eq!(detail.questions.len(), 1);
        let question = &detail.questions[0];
        assert_eq!(question.recommended, Some(0));
        assert!(question.allow_custom_answer);
        assert_eq!(question.options[0].label, "Row id");
        assert_eq!(
            question.options[0].value, "Row id (Recommended)",
            "T3 expects the label it sent"
        );
        assert_eq!(question.options[1].value, "offset");
    }

    #[test]
    fn a_thread_without_a_pending_request_has_no_questions() {
        let mut snapshot = detail_snapshot();
        snapshot["projection"]["runtimeRequests"][1]["status"] = json!("resolved");
        let detail = read_detail(&snapshot);
        assert_eq!(detail.question_request_id, None);
        assert!(detail.questions.is_empty());
    }

    #[test]
    fn the_first_user_message_is_the_first_one_with_text() {
        assert_eq!(
            first_user_message(&detail_snapshot()).as_deref(),
            Some("Pick up AB#60214: Order list loses its scroll position")
        );
        assert_eq!(first_user_message(&json!({})), None);
    }
}
