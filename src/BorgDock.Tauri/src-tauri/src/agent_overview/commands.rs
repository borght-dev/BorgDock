use crate::agent_overview::settings_merge;
use crate::agent_overview::store::SessionStore;
use crate::agent_overview::types::{SessionDelta, SessionRecord, SessionState};
use std::sync::{Arc, RwLock};
use tokio::sync::mpsc::UnboundedSender;

/// Managed Tauri state: holds the live delta-channel sender once the agent
/// overview event loop has started. None if telemetry is disabled.
#[derive(Clone, Default)]
pub struct AgentDeltaSender {
    inner: Arc<RwLock<Option<UnboundedSender<SessionDelta>>>>,
}

impl AgentDeltaSender {
    pub fn install(&self, tx: UnboundedSender<SessionDelta>) {
        if let Ok(mut g) = self.inner.write() {
            *g = Some(tx);
        }
    }

    /// Returns a cloned sender if the event loop is running, else None.
    pub fn clone_sender(&self) -> Option<UnboundedSender<SessionDelta>> {
        self.inner.read().ok().and_then(|g| g.clone())
    }
}

#[tauri::command]
pub fn list_agent_sessions(store: tauri::State<SessionStore>) -> Vec<SessionRecord> {
    store.snapshot()
}

#[tauri::command]
pub async fn set_agent_overview_enabled(
    enabled: bool,
    port: u16,
    export_interval_ms: u32,
) -> Result<(), String> {
    let dir = dirs::home_dir().ok_or("home dir unknown")?.join(".claude");
    let path = dir.join("settings.json");
    if enabled {
        settings_merge::enable(&path, port, export_interval_ms)
    } else {
        settings_merge::disable(&path)
    }
}

#[tauri::command]
pub async fn disable_agent_overview_telemetry() -> Result<(), String> {
    set_agent_overview_enabled(false, 0, 0).await
}

/// User clicked "Dismiss" on a card that was wrongly flagged Awaiting (or
/// just to clear it from the rail). Move the session to Ended; subsequent
/// real OTel events will revive it if Claude actually keeps working.
#[tauri::command]
pub fn dismiss_agent_session(
    session_id: String,
    store: tauri::State<'_, SessionStore>,
    deltas: tauri::State<'_, AgentDeltaSender>,
) -> Result<(), String> {
    let Some(tx) = deltas.clone_sender() else {
        return Err("agent_overview event loop is not running".into());
    };
    store.set_state(&session_id, SessionState::Ended, &tx, std::time::Instant::now());
    Ok(())
}
