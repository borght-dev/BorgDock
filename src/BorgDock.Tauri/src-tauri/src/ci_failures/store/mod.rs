//! The durable history of CI failures: occurrences, their sanitized signals,
//! the groups that own fingerprints, decisions, claims and usage. TypeScript
//! computes fingerprints and assignments; this store persists them and keeps
//! the invariants (one live claim per group, compare-and-set revisions,
//! retention protections).

pub mod commands;
mod connection;
pub mod dto;
pub(crate) mod queries;
mod schema;

pub use connection::{close, db_path};

use crate::sqlite_store::SqliteStore;
use rusqlite::Connection;
use std::path::PathBuf;

/// Managed state. The connection opens on first use, on a blocking thread,
/// so no command does file I/O on the GUI thread (see CLAUDE.md "Tauri sync
/// commands and main-thread operations").
#[derive(Clone)]
pub struct CiStore {
    db: SqliteStore,
}

impl Default for CiStore {
    fn default() -> Self {
        Self {
            db: SqliteStore::new(&connection::SPEC),
        }
    }
}

impl CiStore {
    #[cfg(test)]
    pub(crate) fn at(path: PathBuf) -> Self {
        Self {
            db: SqliteStore::at(&connection::SPEC, path),
        }
    }

    pub fn path(&self) -> PathBuf {
        self.db.path()
    }
}

/// Run `f` on a blocking thread with the store's connection.
pub(crate) async fn with_store<T, F>(store: &CiStore, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut Connection) -> Result<T, String> + Send + 'static,
{
    store.db.with_store(f).await
}

/// Like [`with_store`], but refuses a database a newer BorgDock wrote.
pub(crate) async fn with_writer<T, F>(store: &CiStore, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut Connection) -> Result<T, String> + Send + 'static,
{
    store.db.with_writer(f).await
}

/// [`with_store`] that also tells `f` whether the file is read-only.
pub(crate) async fn with_store_mode<T, F>(store: &CiStore, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut Connection, bool) -> Result<T, String> + Send + 'static,
{
    store.db.with_store_mode(f).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn writes_to_a_newer_file_fail_with_the_read_only_message() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ci-failures.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch("PRAGMA user_version = 99;").unwrap();
        }
        let store = CiStore::at(path.clone());
        let version: i64 = with_store(&store, |conn| {
            conn.pragma_query_value(None, "user_version", |row| row.get(0))
                .map_err(|e| e.to_string())
        })
        .await
        .unwrap();
        assert_eq!(version, 99);
        let error = with_writer(&store, |_| Ok(())).await.unwrap_err();
        assert_eq!(error, connection::READ_ONLY_MESSAGE);

        close(&store);
        std::fs::remove_file(&path).unwrap();
    }
}
