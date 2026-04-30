use crate::agent_overview::settings_merge;
use crate::agent_overview::store::SessionStore;
use crate::agent_overview::types::SessionRecord;

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
