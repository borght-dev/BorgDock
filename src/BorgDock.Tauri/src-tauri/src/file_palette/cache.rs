use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

pub struct FileIndexCache {
    pub conn: Arc<Mutex<Option<Connection>>>,
    pub in_flight: Arc<Mutex<HashSet<PathBuf>>>,
}

use chrono::Utc;
use log::warn;
use rusqlite::params;

use super::files::ListFilesResult;

pub fn create_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS file_index (
            root TEXT PRIMARY KEY,
            entries_json TEXT NOT NULL,
            truncated INTEGER NOT NULL,
            cached_at TEXT NOT NULL
        );",
    )
}

/// Look up a cached file listing. Returns `None` on miss or deserialization
/// failure — callers must fall back to the direct walk.
pub fn read(conn: &Connection, root: &str) -> Option<ListFilesResult> {
    let normalized = normalize_root(root);
    let mut stmt = conn
        .prepare("SELECT entries_json, truncated FROM file_index WHERE root = ?1")
        .ok()?;
    let row: Option<(String, i64)> = stmt
        .query_row(params![normalized], |r| Ok((r.get(0)?, r.get(1)?)))
        .ok();
    let (entries_json, truncated_i) = row?;
    match serde_json::from_str::<Vec<super::files::FileEntry>>(&entries_json) {
        Ok(entries) => Some(ListFilesResult {
            entries,
            truncated: truncated_i != 0,
        }),
        Err(e) => {
            warn!("file_index cache: failed to decode entries for {normalized}: {e}");
            None
        }
    }
}

/// Upsert a file listing into the cache.
pub fn write(conn: &Connection, root: &str, result: &ListFilesResult) -> rusqlite::Result<()> {
    let normalized = normalize_root(root);
    let entries_json = serde_json::to_string(&result.entries).map_err(|e| {
        rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            e.to_string(),
        )))
    })?;
    let truncated_i: i64 = if result.truncated { 1 } else { 0 };
    let cached_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO file_index (root, entries_json, truncated, cached_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(root) DO UPDATE SET
            entries_json = excluded.entries_json,
            truncated = excluded.truncated,
            cached_at = excluded.cached_at",
        params![normalized, entries_json, truncated_i, cached_at],
    )?;
    Ok(())
}

/// Canonicalize a root path for use as the cache key. Forward slashes only,
/// no trailing slash, and lower-case on Windows so path-case differences
/// between callers collapse to one row.
pub fn normalize_root(raw: &str) -> String {
    let mut s = raw.replace('\\', "/");
    while s.ends_with('/') && s.len() > 1 {
        s.pop();
    }
    if cfg!(target_os = "windows") {
        s = s.to_ascii_lowercase();
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_forward_slashes_backslashes() {
        assert_eq!(normalize_root("C:\\repo\\src"), "c:/repo/src");
        assert_eq!(normalize_root("/home/user/repo"), "/home/user/repo");
    }

    #[test]
    fn normalize_strips_trailing_slash() {
        assert_eq!(normalize_root("/repo/"), "/repo");
        assert_eq!(normalize_root("C:\\repo\\"), "c:/repo");
    }

    #[test]
    fn normalize_single_slash_kept() {
        assert_eq!(normalize_root("/"), "/");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn normalize_windows_is_lowercased() {
        assert_eq!(normalize_root("E:\\PRDock\\SRC"), "e:/prdock/src");
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn normalize_unix_preserves_case() {
        assert_eq!(normalize_root("/Home/User/Repo"), "/Home/User/Repo");
    }

    use crate::file_palette::files::{FileEntry, ListFilesResult};

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        create_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn read_miss_returns_none() {
        let conn = memory_conn();
        let hit = read(&conn, "/does/not/exist");
        assert!(hit.is_none());
    }

    #[test]
    fn write_then_read_roundtrips_entries_and_truncated() {
        let conn = memory_conn();
        let data = ListFilesResult {
            entries: vec![
                FileEntry { rel_path: "a.ts".into(), size: 10 },
                FileEntry { rel_path: "b/c.ts".into(), size: 20 },
            ],
            truncated: true,
        };
        write(&conn, "/repo", &data).unwrap();
        let got = read(&conn, "/repo").unwrap();
        assert_eq!(got.entries.len(), 2);
        assert_eq!(got.entries[0].rel_path, "a.ts");
        assert_eq!(got.entries[0].size, 10);
        assert_eq!(got.entries[1].rel_path, "b/c.ts");
        assert!(got.truncated);
    }

    #[test]
    fn write_overwrites_existing_row() {
        let conn = memory_conn();
        write(
            &conn,
            "/repo",
            &ListFilesResult {
                entries: vec![FileEntry { rel_path: "x.ts".into(), size: 1 }],
                truncated: false,
            },
        )
        .unwrap();
        write(
            &conn,
            "/repo",
            &ListFilesResult {
                entries: vec![
                    FileEntry { rel_path: "y.ts".into(), size: 2 },
                    FileEntry { rel_path: "z.ts".into(), size: 3 },
                ],
                truncated: false,
            },
        )
        .unwrap();
        let got = read(&conn, "/repo").unwrap();
        assert_eq!(got.entries.len(), 2);
        assert_eq!(got.entries[0].rel_path, "y.ts");
    }

    #[test]
    fn writes_to_different_roots_are_independent() {
        let conn = memory_conn();
        write(
            &conn,
            "/one",
            &ListFilesResult {
                entries: vec![FileEntry { rel_path: "one.ts".into(), size: 1 }],
                truncated: false,
            },
        )
        .unwrap();
        write(
            &conn,
            "/two",
            &ListFilesResult {
                entries: vec![FileEntry { rel_path: "two.ts".into(), size: 2 }],
                truncated: false,
            },
        )
        .unwrap();
        assert_eq!(read(&conn, "/one").unwrap().entries[0].rel_path, "one.ts");
        assert_eq!(read(&conn, "/two").unwrap().entries[0].rel_path, "two.ts");
    }
}
