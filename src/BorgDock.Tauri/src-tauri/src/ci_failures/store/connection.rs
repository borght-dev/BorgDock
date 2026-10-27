use super::schema::MIGRATIONS;
use super::CiStore;
use rusqlite::{Connection, ErrorCode, OpenFlags};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Two windows writing at once wait for each other instead of failing.
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

pub const READ_ONLY_MESSAGE: &str =
    "This history was written by a newer BorgDock. It is read-only.";

pub struct Opened {
    pub conn: Connection,
    /// The file's schema is newer than this build; it is never rewritten.
    pub read_only: bool,
}

pub fn db_path() -> PathBuf {
    crate::app_data::directory().join("ci-failures.db")
}

/// Drop the open connection so the file can be deleted (Windows keeps open
/// files locked). The next command reopens it.
pub fn close(store: &CiStore) {
    let mut slot = store.slot.lock().unwrap_or_else(|p| p.into_inner());
    *slot = None;
}

enum OpenError {
    /// The file can't be used as this store: move it aside and start fresh.
    Corrupt(String),
    Other(String),
}

/// Open and migrate the store at `path`. A corrupt file is renamed to
/// `<name>.corrupt-<unix ts>` and replaced by a fresh one, once.
pub fn open(path: &Path) -> Result<Opened, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create the CI failure store directory: {e}"))?;
    }
    match open_once(path) {
        Ok(opened) => Ok(opened),
        Err(OpenError::Other(message)) => Err(message),
        Err(OpenError::Corrupt(reason)) => {
            let aside = quarantine(path)?;
            log::warn!(
                "ci failure store: moved unusable database to {} ({reason}); starting fresh",
                aside.display()
            );
            open_once(path).map_err(|e| match e {
                OpenError::Corrupt(message) | OpenError::Other(message) => message,
            })
        }
    }
}

fn open_once(path: &Path) -> Result<Opened, OpenError> {
    let mut conn = Connection::open(path).map_err(|e| classify(e, false))?;
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| classify(e, false))?;
    if version > MIGRATIONS.len() as i64 {
        drop(conn);
        return open_read_only(path);
    }
    conn.busy_timeout(BUSY_TIMEOUT)
        .map_err(|e| classify(e, false))?;
    conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))
        .map_err(|e| classify(e, false))?;
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(|e| classify(e, false))?;
    migrate(&mut conn, version).map_err(|e| classify(e, true))?;
    Ok(Opened {
        conn,
        read_only: false,
    })
}

fn open_read_only(path: &Path) -> Result<Opened, OpenError> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| OpenError::Other(format!("Failed to open the CI failure store: {e}")))?;
    conn.busy_timeout(BUSY_TIMEOUT)
        .map_err(|e| OpenError::Other(e.to_string()))?;
    Ok(Opened {
        conn,
        read_only: true,
    })
}

fn migrate(conn: &mut Connection, from: i64) -> rusqlite::Result<()> {
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(from.max(0) as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index as i64 + 1)?;
        tx.commit()?;
    }
    Ok(())
}

/// A failed migration means the file holds something this schema can't
/// grow from, unless the failure is about access rather than content.
fn classify(error: rusqlite::Error, migrating: bool) -> OpenError {
    let message = format!("Failed to open the CI failure store: {error}");
    let code = error.sqlite_error_code();
    let corrupt = match code {
        Some(ErrorCode::NotADatabase | ErrorCode::DatabaseCorrupt) => true,
        Some(
            ErrorCode::DatabaseBusy
            | ErrorCode::DatabaseLocked
            | ErrorCode::OutOfMemory
            | ErrorCode::CannotOpen
            | ErrorCode::PermissionDenied
            | ErrorCode::ReadOnly
            | ErrorCode::DiskFull
            | ErrorCode::SystemIoFailure,
        ) => false,
        _ => migrating,
    };
    if corrupt {
        OpenError::Corrupt(message)
    } else {
        OpenError::Other(message)
    }
}

/// Rename the file and its WAL side files; a leftover WAL would otherwise
/// replay old pages into the fresh database.
fn quarantine(path: &Path) -> Result<PathBuf, String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "ci-failures.db".to_string());
    let aside = path.with_file_name(format!("{name}.corrupt-{}", chrono::Utc::now().timestamp()));
    std::fs::rename(path, &aside).map_err(|e| {
        format!("The CI failure store is unusable and could not be moved aside: {e}")
    })?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{suffix}", path.display()));
        if side.exists() {
            let _ = std::fs::rename(&side, PathBuf::from(format!("{}{suffix}", aside.display())));
        }
    }
    Ok(aside)
}

/// A migrated in-memory store for tests.
#[cfg(test)]
pub fn open_in_memory() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "foreign_keys", true).unwrap();
    migrate(&mut conn, 0).unwrap();
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user_version(conn: &Connection) -> i64 {
        conn.pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn a_new_file_gets_the_schema_and_version_one() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ci-failures.db");
        let opened = open(&path).unwrap();
        assert!(!opened.read_only);
        assert_eq!(user_version(&opened.conn), 1);
        let tables: i64 = opened
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('occurrences','signals','groups','fingerprints','claims','claim_events','decisions','candidates','outcomes','usage','branch_watch','meta')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 12);
        let mode: String = opened
            .conn
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
    }

    #[test]
    fn reopening_a_current_file_runs_no_migration() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ci-failures.db");
        let first = open(&path).unwrap();
        first
            .conn
            .execute(
                "INSERT INTO usage (day, account, reads) VALUES ('d', 'a', 3)",
                [],
            )
            .unwrap();
        drop(first);
        let second = open(&path).unwrap();
        assert_eq!(user_version(&second.conn), 1);
        let reads: i64 = second
            .conn
            .query_row("SELECT reads FROM usage", [], |row| row.get(0))
            .unwrap();
        assert_eq!(reads, 3);
    }

    #[test]
    fn a_corrupt_file_is_moved_aside_and_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ci-failures.db");
        std::fs::write(&path, b"this is not a database at all".repeat(200)).unwrap();
        let opened = open(&path).unwrap();
        assert!(!opened.read_only);
        assert_eq!(user_version(&opened.conn), 1);
        let moved: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("ci-failures.db.corrupt-"))
            .collect();
        assert_eq!(moved.len(), 1, "{moved:?}");
    }

    #[test]
    fn a_newer_file_opens_read_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ci-failures.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| {
                row.get::<_, String>(0)
            })
            .unwrap();
            conn.execute_batch("CREATE TABLE future (x INTEGER); PRAGMA user_version = 99;")
                .unwrap();
        }
        let opened = open(&path).unwrap();
        assert!(opened.read_only);
        assert_eq!(user_version(&opened.conn), 99);
        assert!(opened
            .conn
            .execute("INSERT INTO future (x) VALUES (1)", [])
            .is_err());
    }
}
