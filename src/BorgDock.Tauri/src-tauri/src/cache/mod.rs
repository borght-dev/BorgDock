use rusqlite::Connection;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

/// SQLite-backed PR / ETag / SQL-schema cache. The connection lives behind an
/// `Arc<Mutex<..>>` so async commands can clone the handle into
/// `tokio::task::spawn_blocking` — every command in this module does file
/// I/O and must never run on the GUI thread (sync commands do; see
/// CLAUDE.md "Tauri sync commands and main-thread operations").
#[derive(Clone, Default)]
pub struct PrCache {
    pub conn: Arc<Mutex<Option<Connection>>>,
}

type ConnHandle = Arc<Mutex<Option<Connection>>>;

fn db_path() -> std::path::PathBuf {
    crate::app_data::directory().join("prcache.db")
}

/// Run `f` on a blocking thread, opening the shared connection on first use.
pub(crate) async fn with_conn<T, F>(handle: ConnHandle, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&Connection) -> Result<T, String> + Send + 'static,
{
    tokio::task::spawn_blocking(move || {
        let mut lock = handle.lock().unwrap_or_else(|p| p.into_inner());
        initialize_connection(&mut lock, &db_path())?;
        let conn = lock.as_ref().expect("cache initialized");
        f(conn)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn cache_init(state: State<'_, PrCache>) -> Result<(), String> {
    with_conn(state.conn.clone(), |_| Ok(())).await
}

fn initialize_connection(
    slot: &mut Option<Connection>,
    path: &std::path::Path,
) -> Result<(), String> {
    if slot.is_some() {
        return Ok(());
    }
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
        );

        CREATE TABLE IF NOT EXISTS cached_sql_schema (
            connection_name TEXT PRIMARY KEY,
            database_name   TEXT NOT NULL,
            json_data       TEXT NOT NULL,
            cached_at       TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sql_snippets (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            body        TEXT NOT NULL,
            starred     INTEGER NOT NULL DEFAULT 0,
            last_run    TEXT NOT NULL DEFAULT '',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );",
    )
    .map_err(|e| format!("Failed to create cache tables: {e}"))?;

    compact_etags(&conn)?;
    *slot = Some(conn);
    Ok(())
}

/// The GitHub client's own limit (`MAX_ETAG_ENTRIES`); accounts share it. Rows
/// past it were never read again (per-commit and per-branch URLs) and grew the
/// table without bound, and every row loaded crosses IPC at startup.
const ETAG_ROWS_KEPT: i64 = 500;

/// Reclaiming space rewrites the file, so it waits until enough is free.
const VACUUM_THRESHOLD_BYTES: i64 = 64 * 1024 * 1024;

fn prune_etags(conn: &Connection) -> Result<usize, String> {
    conn.execute(
        "DELETE FROM cached_etags WHERE url NOT IN
            (SELECT url FROM cached_etags ORDER BY cached_at DESC LIMIT ?1)",
        rusqlite::params![ETAG_ROWS_KEPT],
    )
    .map_err(|e| format!("Failed to prune etag cache: {e}"))
}

fn compact_etags(conn: &Connection) -> Result<(), String> {
    let pruned = prune_etags(conn)?;
    let free_bytes: i64 = conn
        .query_row(
            "SELECT freelist_count * page_size FROM pragma_freelist_count(), pragma_page_size()",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to read cache free space: {e}"))?;
    if free_bytes >= VACUUM_THRESHOLD_BYTES {
        conn.execute_batch("VACUUM")
            .map_err(|e| format!("Failed to vacuum cache: {e}"))?;
    }
    if pruned > 0 || free_bytes >= VACUUM_THRESHOLD_BYTES {
        log::info!(
            "cache: pruned {pruned} etag row(s), reclaimed {} MiB",
            free_bytes / (1024 * 1024)
        );
    }
    Ok(())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn cache_load_prs(
    state: State<'_, PrCache>,
    repo_owner: String,
    repo_name: String,
) -> Result<Vec<Value>, String> {
    with_conn(state.conn.clone(), move |conn| {
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
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn cache_save_prs(
    state: State<'_, PrCache>,
    repo_owner: String,
    repo_name: String,
    prs: Vec<Value>,
) -> Result<(), String> {
    with_conn(state.conn.clone(), move |conn| {
        let now = chrono_now();

        // `unchecked_transaction` rolls back on drop unless committed, so
        // every `?` below is a clean rollback.
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("Failed to begin transaction: {e}"))?;

        // Clear existing entries for this repo
        tx.execute(
            "DELETE FROM cached_prs WHERE repo_owner = ?1 AND repo_name = ?2",
            rusqlite::params![repo_owner, repo_name],
        )
        .map_err(|e| format!("Failed to clear old cache: {e}"))?;

        {
            let mut insert = tx
                .prepare(
                    "INSERT INTO cached_prs (repo_owner, repo_name, pr_number, json_data, cached_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                )
                .map_err(|e| format!("Failed to prepare insert: {e}"))?;

            for pr in &prs {
                let pr_number = pr.get("number").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let json_data =
                    serde_json::to_string(pr).map_err(|e| format!("JSON serialize error: {e}"))?;
                insert
                    .execute(rusqlite::params![
                        repo_owner, repo_name, pr_number, json_data, now
                    ])
                    .map_err(|e| format!("Failed to insert cache entry: {e}"))?;
            }
        }

        tx.commit()
            .map_err(|e| format!("Failed to commit transaction: {e}"))?;

        Ok(())
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn cache_save_tab_data(
    state: State<'_, PrCache>,
    repo_owner: String,
    repo_name: String,
    pr_number: i32,
    data_type: String,
    json_data: Value,
    pr_updated_at: String,
) -> Result<(), String> {
    with_conn(state.conn.clone(), move |conn| {
        let json_str =
            serde_json::to_string(&json_data).map_err(|e| format!("JSON serialize error: {e}"))?;
        let now = chrono_now();

        conn.execute(
            "INSERT OR REPLACE INTO cached_tab_data
             (repo_owner, repo_name, pr_number, data_type, json_data, pr_updated_at, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                repo_owner,
                repo_name,
                pr_number,
                data_type,
                json_str,
                pr_updated_at,
                now
            ],
        )
        .map_err(|e| format!("Failed to save tab data: {e}"))?;

        Ok(())
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn cache_load_tab_data(
    state: State<'_, PrCache>,
    repo_owner: String,
    repo_name: String,
    pr_number: i32,
    data_type: String,
) -> Result<Option<Value>, String> {
    with_conn(state.conn.clone(), move |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT json_data, pr_updated_at, cached_at FROM cached_tab_data
                 WHERE repo_owner = ?1 AND repo_name = ?2 AND pr_number = ?3 AND data_type = ?4",
            )
            .map_err(|e| format!("Failed to prepare query: {e}"))?;

        let result = stmt.query_row(
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
    })
    .await
}

/// Persist the ETag entries that changed since the last poll cycle. Rows whose
/// stored `etag` already matches are skipped, the rest go through one prepared
/// statement in one transaction, and the table is trimmed to its newest rows.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn cache_save_etags(
    state: State<'_, PrCache>,
    entries: Vec<Value>,
) -> Result<(), String> {
    with_conn(state.conn.clone(), move |conn| {
        save_etags_into(conn, &entries)
    })
    .await
}

/// Body of `cache_save_etags`, split out so it can be unit-tested against an
/// in-memory connection.
fn save_etags_into(conn: &Connection, entries: &[Value]) -> Result<(), String> {
    let now = chrono_now();

    // Snapshot what's already stored so unchanged entries are skipped.
    let existing: HashMap<String, String> = {
        let mut stmt = conn
            .prepare("SELECT url, etag FROM cached_etags")
            .map_err(|e| format!("Failed to prepare etag lookup: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to read existing etags: {e}"))?;
        let mut map = HashMap::new();
        for row in rows {
            let (url, etag) = row.map_err(|e| format!("Row error: {e}"))?;
            map.insert(url, etag);
        }
        map
    };

    let changed: Vec<&Value> = entries
        .iter()
        .filter(|entry| {
            let url = entry.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let etag = entry.get("etag").and_then(|v| v.as_str()).unwrap_or("");
            existing
                .get(url)
                .map(|stored| stored != etag)
                .unwrap_or(true)
        })
        .collect();

    if changed.is_empty() {
        return Ok(());
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to begin transaction: {e}"))?;
    {
        let mut upsert = tx
            .prepare(
                "INSERT OR REPLACE INTO cached_etags (url, etag, json_data, cached_at)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .map_err(|e| format!("Failed to prepare etag upsert: {e}"))?;

        for entry in changed {
            let url = entry.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let etag = entry.get("etag").and_then(|v| v.as_str()).unwrap_or("");
            let json_data = entry.get("jsonData").unwrap_or(&Value::Null);
            let json_str = serde_json::to_string(json_data)
                .map_err(|e| format!("JSON serialize error: {e}"))?;
            upsert
                .execute(rusqlite::params![url, etag, json_str, now])
                .map_err(|e| format!("Failed to save etag entry: {e}"))?;
        }
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {e}"))?;

    prune_etags(conn)?;
    Ok(())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn cache_load_etags(state: State<'_, PrCache>) -> Result<Vec<Value>, String> {
    with_conn(state.conn.clone(), load_etags_from).await
}

/// The newest rows, oldest first, so a client's insertion-ordered map evicts
/// the oldest when it trims to its own limit.
fn load_etags_from(conn: &Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT url, etag, json_data FROM
                    (SELECT * FROM cached_etags ORDER BY cached_at DESC LIMIT ?1)
                 ORDER BY cached_at ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![ETAG_ROWS_KEPT], |row| {
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
#[cfg_attr(test, specta::specta)]
pub async fn cache_cleanup(state: State<'_, PrCache>) -> Result<u64, String> {
    with_conn(state.conn.clone(), |conn| {
        let cutoff = seven_days_ago();

        let mut deleted = conn
            .execute(
                "DELETE FROM cached_prs WHERE cached_at < ?1",
                rusqlite::params![cutoff],
            )
            .map_err(|e| format!("Failed to cleanup cache: {e}"))? as u64;

        deleted +=
            conn.execute(
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
    })
    .await
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

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn cache_load_sql_schema(
    state: State<'_, PrCache>,
    connection_name: String,
) -> Result<Option<crate::sql::schema::SqlSchemaPayload>, String> {
    with_conn(state.conn.clone(), move |conn| {
        let mut stmt = conn
            .prepare("SELECT json_data FROM cached_sql_schema WHERE connection_name = ?1")
            .map_err(|e| format!("Failed to prepare query: {e}"))?;

        let result = stmt.query_row(rusqlite::params![connection_name], |row| {
            let json_str: String = row.get(0)?;
            Ok(json_str)
        });

        match result {
            Ok(json_str) => {
                let payload: crate::sql::schema::SqlSchemaPayload = serde_json::from_str(&json_str)
                    .map_err(|e| format!("JSON parse error: {e}"))?;
                Ok(Some(payload))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Failed to load schema cache: {e}")),
        }
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn cache_save_sql_schema(
    state: State<'_, PrCache>,
    connection_name: String,
    payload: crate::sql::schema::SqlSchemaPayload,
) -> Result<(), String> {
    with_conn(state.conn.clone(), move |conn| {
        let json_str =
            serde_json::to_string(&payload).map_err(|e| format!("JSON serialize error: {e}"))?;
        let now = chrono_now();

        conn.execute(
            "INSERT OR REPLACE INTO cached_sql_schema
             (connection_name, database_name, json_data, cached_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![connection_name, payload.database, json_str, now],
        )
        .map_err(|e| format!("Failed to save schema cache: {e}"))?;

        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn mem_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cached_etags (
                url TEXT PRIMARY KEY,
                etag TEXT NOT NULL,
                json_data TEXT NOT NULL,
                cached_at TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    fn row(conn: &Connection, url: &str) -> Option<(String, String, String)> {
        conn.query_row(
            "SELECT etag, json_data, cached_at FROM cached_etags WHERE url = ?1",
            [url],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok()
    }

    #[test]
    fn save_etags_inserts_new_and_skips_unchanged() {
        let conn = mem_conn();
        let entries = vec![
            json!({ "url": "u1", "etag": "e1", "jsonData": { "a": 1 } }),
            json!({ "url": "u2", "etag": "e2", "jsonData": [1, 2] }),
        ];
        save_etags_into(&conn, &entries).unwrap();
        let (etag, body, _) = row(&conn, "u1").unwrap();
        assert_eq!(etag, "e1");
        assert_eq!(body, r#"{"a":1}"#);

        // Poke the stored timestamp so a rewrite would be observable.
        conn.execute(
            "UPDATE cached_etags SET cached_at = 'sentinel' WHERE url = 'u1'",
            [],
        )
        .unwrap();

        // Same etag → untouched (cached_at stays 'sentinel'); u2 changed → rewritten.
        let entries = vec![
            json!({ "url": "u1", "etag": "e1", "jsonData": { "a": 999 } }),
            json!({ "url": "u2", "etag": "e2-new", "jsonData": [3] }),
        ];
        save_etags_into(&conn, &entries).unwrap();
        let (etag, body, cached_at) = row(&conn, "u1").unwrap();
        assert_eq!(etag, "e1");
        assert_eq!(
            body, r#"{"a":1}"#,
            "unchanged etag must not rewrite the body"
        );
        assert_eq!(cached_at, "sentinel");
        let (etag, body, _) = row(&conn, "u2").unwrap();
        assert_eq!(etag, "e2-new");
        assert_eq!(body, "[3]");
    }

    #[test]
    fn save_etags_with_nothing_changed_is_a_noop() {
        let conn = mem_conn();
        let entries = vec![json!({ "url": "u1", "etag": "e1", "jsonData": null })];
        save_etags_into(&conn, &entries).unwrap();
        conn.execute("UPDATE cached_etags SET cached_at = 'sentinel'", [])
            .unwrap();
        save_etags_into(&conn, &entries).unwrap();
        assert_eq!(row(&conn, "u1").unwrap().2, "sentinel");
    }

    fn insert_aged(conn: &Connection, count: i64) {
        for age in 0..count {
            conn.execute(
                "INSERT INTO cached_etags (url, etag, json_data, cached_at) VALUES (?1, 'e', '{}', ?2)",
                rusqlite::params![format!("u{age}"), format!("{}", 1_000_000_000 + age)],
            )
            .unwrap();
        }
    }

    fn etag_rows(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM cached_etags", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn saving_trims_the_table_to_its_newest_rows() {
        let conn = mem_conn();
        insert_aged(&conn, ETAG_ROWS_KEPT + 5);
        save_etags_into(
            &conn,
            &[json!({ "url": "fresh", "etag": "e", "jsonData": 1 })],
        )
        .unwrap();
        assert_eq!(etag_rows(&conn), ETAG_ROWS_KEPT);
        assert!(row(&conn, "fresh").is_some());
        assert!(row(&conn, "u5").is_none(), "the oldest rows go first");
        assert!(row(&conn, "u6").is_some());
    }

    #[test]
    fn opening_the_cache_compacts_an_oversized_etag_table() {
        let conn = mem_conn();
        insert_aged(&conn, ETAG_ROWS_KEPT + 20);
        compact_etags(&conn).unwrap();
        assert_eq!(etag_rows(&conn), ETAG_ROWS_KEPT);
    }

    #[test]
    fn loading_returns_the_newest_rows_oldest_first() {
        let conn = mem_conn();
        insert_aged(&conn, ETAG_ROWS_KEPT + 3);
        let loaded = load_etags_from(&conn).unwrap();
        assert_eq!(loaded.len() as i64, ETAG_ROWS_KEPT);
        assert_eq!(loaded.first().unwrap()["url"], "u3");
        assert_eq!(
            loaded.last().unwrap()["url"],
            format!("u{}", ETAG_ROWS_KEPT + 2)
        );
    }
}

#[cfg(test)]
mod readiness_tests {
    use super::*;

    #[test]
    fn cache_opens_without_auth_and_repeated_initialization_keeps_the_connection() {
        let path = std::env::temp_dir().join(format!("borgdock-cache-{}.db", uuid::Uuid::new_v4()));
        let mut slot = None;
        initialize_connection(&mut slot, &path).unwrap();
        slot.as_ref()
            .unwrap()
            .execute("CREATE TEMP TABLE readiness (value INTEGER)", [])
            .unwrap();
        initialize_connection(&mut slot, &path).unwrap();
        slot.as_ref()
            .unwrap()
            .execute("INSERT INTO readiness VALUES (1)", [])
            .unwrap();
        let count: i64 = slot
            .as_ref()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM sql_snippets", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
        drop(slot);
        std::fs::remove_file(path).unwrap();
    }
}
