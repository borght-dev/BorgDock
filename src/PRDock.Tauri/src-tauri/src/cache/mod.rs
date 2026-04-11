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
        );

        CREATE TABLE IF NOT EXISTS cached_tab_data (
            repo_owner TEXT NOT NULL,
            repo_name TEXT NOT NULL,
            pr_number INTEGER NOT NULL,
            data_type TEXT NOT NULL,
            json_data TEXT NOT NULL,
            pr_updated_at TEXT NOT NULL,
            cached_at TEXT NOT NULL,
            PRIMARY KEY (repo_owner, repo_name, pr_number, data_type)
        );

        CREATE TABLE IF NOT EXISTS cached_etags (
            url TEXT PRIMARY KEY,
            etag TEXT NOT NULL,
            json_data TEXT NOT NULL,
            cached_at TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("Failed to create cache tables: {e}"))?;

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

    let now = chrono_now();

    conn.execute_batch("BEGIN TRANSACTION")
        .map_err(|e| format!("Failed to begin transaction: {e}"))?;

    // Clear existing entries for this repo
    conn.execute(
        "DELETE FROM cached_prs WHERE repo_owner = ?1 AND repo_name = ?2",
        rusqlite::params![repo_owner, repo_name],
    )
    .map_err(|e| {
        let _ = conn.execute_batch("ROLLBACK");
        format!("Failed to clear old cache: {e}")
    })?;

    for pr in &prs {
        let pr_number = pr.get("number").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let json_data =
            serde_json::to_string(pr).map_err(|e| format!("JSON serialize error: {e}"))?;

        conn.execute(
            "INSERT INTO cached_prs (repo_owner, repo_name, pr_number, json_data, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![repo_owner, repo_name, pr_number, json_data, now],
        )
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK");
            format!("Failed to insert cache entry: {e}")
        })?;
    }

    conn.execute_batch("COMMIT")
        .map_err(|e| format!("Failed to commit transaction: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn cache_save_tab_data(
    state: State<'_, PrCache>,
    repo_owner: String,
    repo_name: String,
    pr_number: i32,
    data_type: String,
    json_data: Value,
    pr_updated_at: String,
) -> Result<(), String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    let json_str =
        serde_json::to_string(&json_data).map_err(|e| format!("JSON serialize error: {e}"))?;
    let now = chrono_now();

    conn.execute(
        "INSERT OR REPLACE INTO cached_tab_data
         (repo_owner, repo_name, pr_number, data_type, json_data, pr_updated_at, cached_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![repo_owner, repo_name, pr_number, data_type, json_str, pr_updated_at, now],
    )
    .map_err(|e| format!("Failed to save tab data: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn cache_load_tab_data(
    state: State<'_, PrCache>,
    repo_owner: String,
    repo_name: String,
    pr_number: i32,
    data_type: String,
) -> Result<Option<Value>, String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    let mut stmt = conn
        .prepare(
            "SELECT json_data, pr_updated_at, cached_at FROM cached_tab_data
             WHERE repo_owner = ?1 AND repo_name = ?2 AND pr_number = ?3 AND data_type = ?4",
        )
        .map_err(|e| format!("Failed to prepare query: {e}"))?;

    let result = stmt
        .query_row(
            rusqlite::params![repo_owner, repo_name, pr_number, data_type],
            |row| {
                let json_str: String = row.get(0)?;
                let pr_updated_at: String = row.get(1)?;
                let cached_at: String = row.get(2)?;
                Ok((json_str, pr_updated_at, cached_at))
            },
        );

    match result {
        Ok((json_str, pr_updated_at, cached_at)) => {
            let data: Value = serde_json::from_str(&json_str)
                .map_err(|e| format!("JSON parse error: {e}"))?;
            let mut map = serde_json::Map::new();
            map.insert("data".to_string(), data);
            map.insert("prUpdatedAt".to_string(), Value::String(pr_updated_at));
            map.insert("cachedAt".to_string(), Value::String(cached_at));
            Ok(Some(Value::Object(map)))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to load tab data: {e}")),
    }
}

#[tauri::command]
pub fn cache_save_etags(
    state: State<'_, PrCache>,
    entries: Vec<Value>,
) -> Result<(), String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    let now = chrono_now();

    conn.execute_batch("BEGIN TRANSACTION")
        .map_err(|e| format!("Failed to begin transaction: {e}"))?;

    for entry in &entries {
        let url = entry.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let etag = entry.get("etag").and_then(|v| v.as_str()).unwrap_or("");
        let json_data = entry.get("jsonData").unwrap_or(&Value::Null);
        let json_str = serde_json::to_string(json_data)
            .map_err(|e| format!("JSON serialize error: {e}"))?;

        conn.execute(
            "INSERT OR REPLACE INTO cached_etags (url, etag, json_data, cached_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![url, etag, json_str, now],
        )
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK");
            format!("Failed to save etag entry: {e}")
        })?;
    }

    conn.execute_batch("COMMIT")
        .map_err(|e| format!("Failed to commit transaction: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn cache_load_etags(
    state: State<'_, PrCache>,
) -> Result<Vec<Value>, String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    let mut stmt = conn
        .prepare("SELECT url, etag, json_data FROM cached_etags")
        .map_err(|e| format!("Failed to prepare query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let url: String = row.get(0)?;
            let etag: String = row.get(1)?;
            let json_str: String = row.get(2)?;
            Ok((url, etag, json_str))
        })
        .map_err(|e| format!("Failed to query etags: {e}"))?;

    let mut results = Vec::new();
    for row in rows {
        let (url, etag, json_str) = row.map_err(|e| format!("Row error: {e}"))?;
        let json_data: Value =
            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {e}"))?;
        let mut map = serde_json::Map::new();
        map.insert("url".to_string(), Value::String(url));
        map.insert("etag".to_string(), Value::String(etag));
        map.insert("jsonData".to_string(), json_data);
        results.push(Value::Object(map));
    }

    Ok(results)
}

#[tauri::command]
pub fn cache_cleanup(state: State<'_, PrCache>) -> Result<u64, String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    let cutoff = seven_days_ago();

    let mut deleted = conn
        .execute(
            "DELETE FROM cached_prs WHERE cached_at < ?1",
            rusqlite::params![cutoff],
        )
        .map_err(|e| format!("Failed to cleanup cache: {e}"))? as u64;

    deleted += conn
        .execute(
            "DELETE FROM cached_tab_data WHERE cached_at < ?1",
            rusqlite::params![cutoff],
        )
        .map_err(|e| format!("Failed to cleanup tab data cache: {e}"))? as u64;

    deleted += conn
        .execute(
            "DELETE FROM cached_etags WHERE cached_at < ?1",
            rusqlite::params![cutoff],
        )
        .map_err(|e| format!("Failed to cleanup etag cache: {e}"))? as u64;

    Ok(deleted)
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
