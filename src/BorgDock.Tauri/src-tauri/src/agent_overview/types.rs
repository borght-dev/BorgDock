use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::time::Instant;

/// One Claude Code session as the dashboard sees it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub session_id: String,
    pub cwd: PathBuf,
    pub repo: String,
    pub worktree: String,
    pub branch: String,
    pub label: String,

    pub state: SessionState,
    // `Instant` has no `Default`, and serde's `skip_deserializing` requires one.
    // Do NOT add `Deserialize` to `SessionRecord` — convert these to `state_since_ms` /
    // `last_event_ms` before any persistence layer touches the record.
    #[serde(skip)]
    pub state_since: Instant,
    #[serde(skip)]
    pub last_event_at: Instant,

    pub last_user_msg: Option<String>,
    pub task: Option<String>,
    pub model: Option<String>,
    pub tokens_used: u64,
    pub tokens_max: u64,

    pub last_api_stop_reason: Option<String>,
    #[serde(skip)]
    pub pending_tool_uses: HashSet<String>,

    /// Set internally before serialization to expose `state_since` / `last_event_at`
    /// as wall-clock millis-ago values for the React side. `rename_all = "camelCase"`
    /// already produces `stateSinceMs` / `lastEventMs` — no per-field rename needed.
    pub state_since_ms: u128,
    pub last_event_ms: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    Working,
    Tool,
    Awaiting,
    Finished,
    Idle,
    Ended,
}

/// Resolved cwd / repo / worktree / branch for a session id.
#[derive(Debug, Clone)]
pub struct CwdInfo {
    pub cwd: PathBuf,
    pub repo: String,
    pub worktree: String,
    pub branch: String,
}

/// One OTel log/event record after we've flattened resource + record attrs
/// into a single map. The state machine is fed `RawEvent`s.
#[derive(Debug, Clone)]
pub struct RawEvent {
    pub session_id: String,
    pub event_name: String,
    pub attrs: HashMap<String, serde_json::Value>,
}

/// Delta emitted to the frontend whenever the SessionStore changes.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SessionDelta {
    Upsert { session: SessionRecord },
    Remove {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_state_serializes_to_lowercase() {
        let json = serde_json::to_string(&SessionState::Awaiting).unwrap();
        assert_eq!(json, "\"awaiting\"");
    }

    #[test]
    fn session_delta_upsert_serializes_with_kind_tag() {
        let now = Instant::now();
        let rec = SessionRecord {
            session_id: "sid".into(),
            cwd: PathBuf::from("/x"),
            repo: "BorgDock".into(),
            worktree: "master".into(),
            branch: "master".into(),
            label: "BD · master #1".into(),
            state: SessionState::Working,
            state_since: now,
            last_event_at: now,
            last_user_msg: None,
            task: None,
            model: None,
            tokens_used: 0,
            tokens_max: 200_000,
            last_api_stop_reason: None,
            pending_tool_uses: HashSet::new(),
            state_since_ms: 0,
            last_event_ms: 0,
        };
        let delta = SessionDelta::Upsert { session: rec };
        let json = serde_json::to_value(&delta).unwrap();
        assert_eq!(json["kind"], "upsert");
        assert_eq!(json["session"]["sessionId"], "sid");
        assert_eq!(json["session"]["state"], "working");
    }

    #[test]
    fn session_delta_remove_serializes_with_kind_tag() {
        let delta = SessionDelta::Remove { session_id: "sid".into() };
        let json = serde_json::to_value(&delta).unwrap();
        assert_eq!(json["kind"], "remove");
        assert_eq!(json["sessionId"], "sid");
    }
}
