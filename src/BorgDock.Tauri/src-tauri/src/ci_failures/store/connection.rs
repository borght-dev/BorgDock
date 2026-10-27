//! The CI failure store's file, on top of the shared [`crate::sqlite_store`].

use super::schema::MIGRATIONS;
use super::CiStore;
use crate::sqlite_store::{self, StoreSpec};
#[cfg(test)]
use rusqlite::Connection;
use std::path::{Path, PathBuf};

pub use crate::sqlite_store::Opened;

pub const READ_ONLY_MESSAGE: &str =
    "This history was written by a newer BorgDock. It is read-only.";

pub static SPEC: StoreSpec = StoreSpec {
    file_name: "ci-failures.db",
    label: "CI failure store",
    migrations: MIGRATIONS,
    read_only_message: READ_ONLY_MESSAGE,
};

pub fn db_path() -> PathBuf {
    SPEC.default_path()
}

/// Drop the open connection so the file can be deleted (Windows keeps open
/// files locked). The next command reopens it.
pub fn close(store: &CiStore) {
    store.db.close();
}

/// Open and migrate the store at `path`. A corrupt file is renamed to
/// `<name>.corrupt-<unix ts>` and replaced by a fresh one, once.
pub fn open(path: &Path) -> Result<Opened, String> {
    sqlite_store::open(&SPEC, path)
}

/// A migrated in-memory store for tests.
#[cfg(test)]
pub fn open_in_memory() -> Connection {
    sqlite_store::open_in_memory(&SPEC)
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
