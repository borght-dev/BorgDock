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

use connection::Opened;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Managed state. The connection opens on first use, on a blocking thread,
/// so no command does file I/O on the GUI thread (see CLAUDE.md "Tauri sync
/// commands and main-thread operations").
#[derive(Clone, Default)]
pub struct CiStore {
    slot: Arc<Mutex<Option<Opened>>>,
    /// Tests point the store at a temporary file.
    path: Option<Arc<PathBuf>>,
}

impl CiStore {
    #[cfg(test)]
    pub(crate) fn at(path: PathBuf) -> Self {
        Self {
            slot: Arc::default(),
            path: Some(Arc::new(path)),
        }
    }

    pub fn path(&self) -> PathBuf {
        match &self.path {
            Some(path) => path.as_ref().clone(),
            None => db_path(),
        }
    }
}

/// Run `f` on a blocking thread with the store's connection.
pub(crate) async fn with_store<T, F>(store: &CiStore, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut Connection) -> Result<T, String> + Send + 'static,
{
    run(store, false, move |conn, _| f(conn)).await
}

/// Like [`with_store`], but refuses a database a newer BorgDock wrote.
pub(crate) async fn with_writer<T, F>(store: &CiStore, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut Connection) -> Result<T, String> + Send + 'static,
{
    run(store, true, move |conn, _| f(conn)).await
}

/// [`with_store`] that also tells `f` whether the file is read-only.
pub(crate) async fn with_store_mode<T, F>(store: &CiStore, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut Connection, bool) -> Result<T, String> + Send + 'static,
{
    run(store, false, f).await
}

async fn run<T, F>(store: &CiStore, write: bool, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut Connection, bool) -> Result<T, String> + Send + 'static,
{
    let slot = store.slot.clone();
    let path = store.path();
    tokio::task::spawn_blocking(move || {
        let mut lock = slot.lock().unwrap_or_else(|p| p.into_inner());
        if lock.is_none() {
            *lock = Some(connection::open(&path)?);
        }
        let opened = lock.as_mut().expect("store opened");
        if write && opened.read_only {
            return Err(connection::READ_ONLY_MESSAGE.to_string());
        }
        f(&mut opened.conn, opened.read_only)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
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
