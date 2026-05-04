use crate::agent_overview::store::SessionStore;
use serde::Serialize;
use std::time::Instant;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOverviewStatus {
    pub healthy: bool,
    pub endpoint: String,
    pub last_write_ago_seconds: Option<u64>,
}

#[tauri::command]
pub fn agent_overview_status(store: tauri::State<SessionStore>) -> AgentOverviewStatus {
    let sessions = store.snapshot();
    let now = Instant::now();
    let last = sessions
        .iter()
        .map(|s| s.last_event_at)
        .max()
        .map(|t| now.duration_since(t).as_secs());
    AgentOverviewStatus {
        healthy: last.map(|s| s < 600).unwrap_or(false),
        endpoint: "127.0.0.1:4318".to_string(),
        last_write_ago_seconds: last,
    }
}
