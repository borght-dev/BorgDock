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

/// RAII handle that registers a re-walk as "in flight" on creation and
/// removes it on drop. Use `Guard::try_claim` to take a slot iff no other
/// re-walk is currently running for the same key.
pub struct Guard {
    set: Arc<Mutex<HashSet<PathBuf>>>,
    key: PathBuf,
}

impl Guard {
    /// Unconditionally insert the key (for tests). Prefer `try_claim` in
    /// production code so concurrent callers don't stack refreshes.
    pub fn new(set: &Arc<Mutex<HashSet<PathBuf>>>, key: PathBuf) -> Self {
        set.lock().unwrap().insert(key.clone());
        Self { set: set.clone(), key }
    }

    /// Insert `key` only if absent. Returns `Some(Guard)` on success, `None`
    /// if another refresh for the same key is already in flight.
    pub fn try_claim(set: &Arc<Mutex<HashSet<PathBuf>>>, key: PathBuf) -> Option<Self> {
        let inserted = set.lock().unwrap().insert(key.clone());
        if inserted {
            Some(Self { set: set.clone(), key })
        } else {
            None
        }
    }
}

impl Drop for Guard {
    fn drop(&mut self) {
        if let Ok(mut set) = self.set.lock() {
            set.remove(&self.key);
        }
    }
}

/// Fire-and-forget: re-walk `root` in the background and overwrite the cache
/// row if the walk succeeds. Deduplicated via an in-flight set so concurrent
/// callers against the same root collapse to a single refresh.
pub fn spawn_refresh(
    conn: Arc<Mutex<Option<Connection>>>,
    in_flight: Arc<Mutex<HashSet<PathBuf>>>,
    root: String,
    limit: usize,
) {
    // Normalize the key so callers passing the same root with different
    // casing / slashes / trailing separators collapse to a single in-flight
    // slot — matches how `read` and `write` canonicalize before touching SQL.
    let key = PathBuf::from(normalize_root(&root));
    let Some(guard) = Guard::try_claim(&in_flight, key) else {
        log::debug!("file_index cache: refresh already in flight for {root}");
        return;
    };

    tokio::task::spawn_blocking(move || {
        // Keep the guard alive for the whole background walk. When this closure
        // returns (including on panic), the guard drops and the key leaves the
        // in-flight set, freeing future refreshes.
        let _guard = guard;

        match super::files::walk_root(&PathBuf::from(&root), limit) {
            Ok(result) => {
                let Ok(conn_lock) = conn.lock() else {
                    log::warn!("file_index cache: connection mutex poisoned; skipping write");
                    return;
                };
                let Some(conn_ref) = conn_lock.as_ref() else {
                    log::warn!("file_index cache: connection is None; skipping write");
                    return;
                };
                if let Err(e) = write(conn_ref, &root, &result) {
                    log::warn!("file_index cache: failed to write refreshed entries: {e}");
                }
            }
            Err(e) => {
                log::warn!("file_index cache: background re-walk failed for {root}: {e}");
            }
        }
    });
}

pub fn db_path() -> std::path::PathBuf {
    dirs::config_dir()
        .expect("could not determine config directory")
        .join("BorgDock")
        .join("fileindex.db")
}

/// Open (or create) the SQLite file and install it into the managed cache
/// state. Safe to call multiple times — subsequent calls no-op. Errors during
/// init are logged but non-fatal: the command falls back to direct walks.
///
/// If the existing DB file is corrupt (schema creation fails), the bad file
/// is renamed aside with a timestamp suffix and init retries once against a
/// fresh file. This prevents a corrupt DB from permanently wedging the cache
/// across app restarts.
pub fn init(state: &FileIndexCache) {
    let path = db_path();
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            log::warn!("file_index cache: failed to create dir {}: {e}", parent.display());
            return;
        }
    }

    match open_and_create(&path) {
        Some(conn) => install_conn(state, conn),
        None => {
            let quarantine = path.with_extension(format!(
                "db.corrupt-{}",
                Utc::now().format("%Y%m%dT%H%M%S")
            ));
            match std::fs::rename(&path, &quarantine) {
                Ok(()) => {
                    log::warn!(
                        "file_index cache: quarantined corrupt DB to {}; retrying fresh",
                        quarantine.display()
                    );
                    if let Some(conn) = open_and_create(&path) {
                        install_conn(state, conn);
                    } else {
                        log::warn!(
                            "file_index cache: retry after quarantine also failed; running without cache"
                        );
                    }
                }
                Err(e) => {
                    log::warn!(
                        "file_index cache: could not quarantine corrupt DB ({e}); running without cache"
                    );
                }
            }
        }
    }
}

fn open_and_create(path: &std::path::Path) -> Option<Connection> {
    let conn = match Connection::open(path) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("file_index cache: open failed at {}: {e}", path.display());
            return None;
        }
    };
    match create_schema(&conn) {
        Ok(()) => Some(conn),
        Err(e) => {
            log::warn!("file_index cache: create_schema failed: {e}");
            None
        }
    }
}

fn install_conn(state: &FileIndexCache, conn: Connection) {
    match state.conn.lock() {
        Ok(mut guard) => *guard = Some(conn),
        Err(e) => log::warn!("file_index cache: connection mutex poisoned during init: {e}"),
    }
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

    use std::sync::Arc;

    #[test]
    fn in_flight_guard_inserts_on_creation_and_removes_on_drop() {
        let set: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
        let key = PathBuf::from("/repo");
        {
            let _g = Guard::new(&set, key.clone());
            assert!(set.lock().unwrap().contains(&key));
        }
        // Dropped at end of scope.
        assert!(!set.lock().unwrap().contains(&key));
    }

    #[test]
    fn try_claim_returns_none_when_already_in_flight() {
        let set: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
        let key = PathBuf::from("/repo");
        let first = Guard::try_claim(&set, key.clone());
        assert!(first.is_some());
        let second = Guard::try_claim(&set, key.clone());
        assert!(second.is_none(), "second claim must return None while first is live");
        drop(first);
        let third = Guard::try_claim(&set, key);
        assert!(third.is_some(), "claim must succeed after previous guard drops");
    }
}
