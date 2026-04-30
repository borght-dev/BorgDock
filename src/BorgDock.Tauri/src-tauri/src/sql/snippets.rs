//! Persistence for SQL editor snippets.
//!
//! Stored alongside the PR/schema cache in `$CONFIG/BorgDock/prcache.db`,
//! but in a separate `sql_snippets` table — they're user data, not cache, and
//! must not be subject to the 7-day cleanup the cached_* tables get.

use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::cache::PrCache;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlSnippet {
    pub id: String,
    pub name: String,
    pub body: String,
    pub starred: bool,
    pub last_run: String,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn ensure_table(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sql_snippets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            body TEXT NOT NULL,
            starred INTEGER NOT NULL DEFAULT 0,
            last_run TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );",
    )
}

#[tauri::command]
pub fn sql_snippets_list(state: State<'_, PrCache>) -> Result<Vec<SqlSnippet>, String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    ensure_table(conn).map_err(|e| format!("Failed to ensure snippets table: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, body, starred, last_run
             FROM sql_snippets
             ORDER BY starred DESC, updated_at DESC, name ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SqlSnippet {
                id: row.get(0)?,
                name: row.get(1)?,
                body: row.get(2)?,
                starred: row.get::<_, i64>(3)? != 0,
                last_run: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query snippets: {e}"))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(out)
}

#[tauri::command]
pub fn sql_snippets_save(
    state: State<'_, PrCache>,
    snippet: SqlSnippet,
) -> Result<SqlSnippet, String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    ensure_table(conn).map_err(|e| format!("Failed to ensure snippets table: {e}"))?;

    let now = now_secs();

    conn.execute(
        "INSERT INTO sql_snippets (id, name, body, starred, last_run, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            body = excluded.body,
            starred = excluded.starred,
            last_run = excluded.last_run,
            updated_at = excluded.updated_at",
        params![
            snippet.id,
            snippet.name,
            snippet.body,
            snippet.starred as i64,
            snippet.last_run,
            now,
        ],
    )
    .map_err(|e| format!("Failed to save snippet: {e}"))?;

    Ok(snippet)
}

#[tauri::command]
pub fn sql_snippets_delete(state: State<'_, PrCache>, id: String) -> Result<(), String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    ensure_table(conn).map_err(|e| format!("Failed to ensure snippets table: {e}"))?;

    conn.execute("DELETE FROM sql_snippets WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete snippet: {e}"))?;

    Ok(())
}
