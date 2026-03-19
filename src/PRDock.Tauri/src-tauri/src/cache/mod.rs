use rusqlite::Connection;
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;

pub struct PrCache {
    pub conn: Mutex<Option<Connection>>,
}

fn db_path() -> std::path::PathBuf {
    dirs::config_dir()
        .expect("could not determine config directory")
        .join("PRDock")
        .join("prcache.db")
}

#[tauri::command]
pub fn cache_init(state: State<'_, PrCache>) -> Result<(), String> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create cache dir: {e}"))?;
    }

    let conn =
        Connection::open(&path).map_err(|e| format!("Failed to open cache database: {e}"))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS cached_prs (
            id INTEGER PRIMARY KEY,
            repo_owner TEXT NOT NULL,
            repo_name TEXT NOT NULL,
            pr_number INTEGER NOT NULL,
            json_data TEXT NOT NULL,
            cached_at TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("Failed to create cache table: {e}"))?;

    let mut lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    *lock = Some(conn);
    Ok(())
}

#[tauri::command]
pub fn cache_load_prs(
    state: State<'_, PrCache>,
    repo_owner: String,
    repo_name: String,
) -> Result<Vec<Value>, String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    let mut stmt = conn
        .prepare("SELECT json_data FROM cached_prs WHERE repo_owner = ?1 AND repo_name = ?2")
        .map_err(|e| format!("Failed to prepare query: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![repo_owner, repo_name], |row| {
            let json_str: String = row.get(0)?;
            Ok(json_str)
        })
        .map_err(|e| format!("Failed to query cache: {e}"))?;

    let mut results = Vec::new();
    for row in rows {
        let json_str = row.map_err(|e| format!("Row error: {e}"))?;
        let value: Value =
            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {e}"))?;
        results.push(value);
    }

    Ok(results)
}

#[tauri::command]
pub fn cache_save_prs(
    state: State<'_, PrCache>,
    repo_owner: String,
    repo_name: String,
    prs: Vec<Value>,
) -> Result<(), String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    // Clear existing entries for this repo
    conn.execute(
        "DELETE FROM cached_prs WHERE repo_owner = ?1 AND repo_name = ?2",
        rusqlite::params![repo_owner, repo_name],
    )
    .map_err(|e| format!("Failed to clear old cache: {e}"))?;

    let now = chrono_now();

    for pr in &prs {
        let pr_number = pr.get("number").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let json_data =
            serde_json::to_string(pr).map_err(|e| format!("JSON serialize error: {e}"))?;

        conn.execute(
            "INSERT INTO cached_prs (repo_owner, repo_name, pr_number, json_data, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![repo_owner, repo_name, pr_number, json_data, now],
        )
        .map_err(|e| format!("Failed to insert cache entry: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn cache_cleanup(state: State<'_, PrCache>) -> Result<u64, String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    // Remove entries older than 7 days
    let cutoff = seven_days_ago();

    let deleted = conn
        .execute(
            "DELETE FROM cached_prs WHERE cached_at < ?1",
            rusqlite::params![cutoff],
        )
        .map_err(|e| format!("Failed to cleanup cache: {e}"))?;

    Ok(deleted as u64)
}

/// Returns current UTC time as ISO 8601 string without external chrono dependency.
fn chrono_now() -> String {
    // Use std::time to get a simple timestamp
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    // Store as seconds since epoch — simple and sortable
    format!("{}", now.as_secs())
}

fn seven_days_ago() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let seven_days = 7 * 24 * 60 * 60;
    let cutoff = now.as_secs().saturating_sub(seven_days);
    format!("{cutoff}")
}
