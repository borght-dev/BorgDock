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

use crate::agent_overview::meta_store;
use crate::cache::PrCache;

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Snooze the awaiting card for `duration_ms`. Persists to sqlite so the
/// snooze survives a restart; preserves the existing `seen_at_ms` value.
#[tauri::command]
pub fn snooze_agent_session(
    session_id: String,
    duration_ms: u64,
    store: tauri::State<'_, SessionStore>,
    deltas: tauri::State<'_, AgentDeltaSender>,
    cache: tauri::State<'_, PrCache>,
) -> Result<(), String> {
    let Some(tx) = deltas.clone_sender() else {
        return Err("agent_overview event loop is not running".into());
    };
    let until = now_ms() + duration_ms as u128;

    // Read current seen_at to preserve it.
    let lock = cache.conn.lock().map_err(|e| e.to_string())?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;
    let prev_seen = meta_store::get(conn, &session_id)
        .map_err(|e| e.to_string())?
        .and_then(|m| m.seen_at_ms);
    meta_store::put(conn, &session_id, Some(until), prev_seen, now_ms())
        .map_err(|e| e.to_string())?;
    drop(lock);

    store.set_meta(&session_id, Some(until), prev_seen, &tx, std::time::Instant::now());
    Ok(())
}

/// Mark the session seen *now*. Persists to sqlite; preserves any active
/// snooze. The store auto-clears `seen_at_ms` when fresh activity arrives.
#[tauri::command]
pub fn mark_agent_session_seen(
    session_id: String,
    store: tauri::State<'_, SessionStore>,
    deltas: tauri::State<'_, AgentDeltaSender>,
    cache: tauri::State<'_, PrCache>,
) -> Result<(), String> {
    let Some(tx) = deltas.clone_sender() else {
        return Err("agent_overview event loop is not running".into());
    };
    let seen = now_ms();

    let lock = cache.conn.lock().map_err(|e| e.to_string())?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;
    let prev_snooze = meta_store::get(conn, &session_id)
        .map_err(|e| e.to_string())?
        .and_then(|m| m.snoozed_until_ms);
    meta_store::put(conn, &session_id, prev_snooze, Some(seen), now_ms())
        .map_err(|e| e.to_string())?;
    drop(lock);

    store.set_meta(&session_id, prev_snooze, Some(seen), &tx, std::time::Instant::now());
    Ok(())
}

/// Best-effort: raise the terminal window running the given session.
/// Returns `Ok(false)` if no matching terminal/host process can be found
/// (the user closed it, the session lives in WSL, etc.). Hard platform
/// errors (extremely rare) come back as `Err`.
#[tauri::command]
pub fn focus_session_pane(
    session_id: String,
    store: tauri::State<'_, SessionStore>,
) -> Result<bool, String> {
    let cwd_opt: Option<std::path::PathBuf> = store
        .internal_snapshot()
        .into_iter()
        .find(|r| r.session_id == session_id)
        .map(|r| r.cwd);
    let Some(cwd) = cwd_opt else {
        return Ok(false);
    };
    crate::platform::focus_pane::focus(&cwd)
}
