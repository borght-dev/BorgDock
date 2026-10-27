//! One SQLite file per feature store, kept in the app data directory. The
//! connection opens on first use on a blocking thread, migrates by
//! `PRAGMA user_version`, opens read-only when a newer BorgDock wrote the
//! file, and moves a corrupt file aside before starting fresh. The CI
//! failure store and the activity journal both use it.

use rusqlite::{Connection, ErrorCode, OpenFlags, OptionalExtension, Transaction};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Two windows writing at once wait for each other instead of failing.
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

/// What makes one store different from another.
pub struct StoreSpec {
    /// The file in the app data directory, e.g. `ci-failures.db`.
    pub file_name: &'static str,
    /// What error messages call the store, e.g. `CI failure store`.
    pub label: &'static str,
    /// Entry `n` takes a database from version `n` to `n + 1`. Append only.
    pub migrations: &'static [&'static str],
    /// The error a write to a newer file returns.
    pub read_only_message: &'static str,
}

impl StoreSpec {
    pub fn default_path(&self) -> PathBuf {
        crate::app_data::directory().join(self.file_name)
    }
}

pub struct Opened {
    pub conn: Connection,
    /// The file's schema is newer than this build; it is never rewritten.
    pub read_only: bool,
    /// Where an unusable file was moved before this one was created.
    pub recovered_from: Option<PathBuf>,
}

/// Managed state for one store. Clones share the connection.
#[derive(Clone)]
pub struct SqliteStore {
    spec: &'static StoreSpec,
    slot: Arc<Mutex<Option<Opened>>>,
    /// Tests point the store at a temporary file.
    path: Option<Arc<PathBuf>>,
    /// Survives `close`, so a banner can say the file was replaced this session.
    recovered_from: Arc<Mutex<Option<PathBuf>>>,
}

impl SqliteStore {
    pub fn new(spec: &'static StoreSpec) -> Self {
        Self {
            spec,
            slot: Arc::default(),
            path: None,
            recovered_from: Arc::default(),
        }
    }

    #[cfg(test)]
    pub fn at(spec: &'static StoreSpec, path: PathBuf) -> Self {
        Self {
            path: Some(Arc::new(path)),
            ..Self::new(spec)
        }
    }

    pub fn path(&self) -> PathBuf {
        match &self.path {
            Some(path) => path.as_ref().clone(),
            None => self.spec.default_path(),
        }
    }

    /// The quarantined file, when this session found the store unusable.
    pub fn recovered_from(&self) -> Option<PathBuf> {
        self.recovered_from
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    /// Drop the open connection so the file can be deleted (Windows keeps
    /// open files locked). The next call reopens it.
    pub fn close(&self) {
        let mut slot = self.slot.lock().unwrap_or_else(|p| p.into_inner());
        *slot = None;
    }

    /// Run `f` on a blocking thread with the store's connection.
    pub async fn with_store<T, F>(&self, f: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> Result<T, String> + Send + 'static,
    {
        self.run(false, move |conn, _| f(conn)).await
    }

    /// Like [`Self::with_store`], but refuses a database a newer BorgDock wrote.
    pub async fn with_writer<T, F>(&self, f: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> Result<T, String> + Send + 'static,
    {
        self.run(true, move |conn, _| f(conn)).await
    }

    /// [`Self::with_store`] that also tells `f` whether the file is read-only.
    pub async fn with_store_mode<T, F>(&self, f: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection, bool) -> Result<T, String> + Send + 'static,
    {
        self.run(false, f).await
    }

    async fn run<T, F>(&self, write: bool, f: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection, bool) -> Result<T, String> + Send + 'static,
    {
        let spec = self.spec;
        let slot = self.slot.clone();
        let recovered_from = self.recovered_from.clone();
        let path = self.path();
        tokio::task::spawn_blocking(move || {
            let mut lock = slot.lock().unwrap_or_else(|p| p.into_inner());
            if lock.is_none() {
                let opened = open(spec, &path)?;
                if let Some(aside) = &opened.recovered_from {
                    *recovered_from.lock().unwrap_or_else(|p| p.into_inner()) = Some(aside.clone());
                }
                *lock = Some(opened);
            }
            let opened = lock.as_mut().expect("store opened");
            if write && opened.read_only {
                return Err(spec.read_only_message.to_string());
            }
            f(&mut opened.conn, opened.read_only)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }
}

enum OpenError {
    /// The file can't be used as this store: move it aside and start fresh.
    Corrupt(String),
    Other(String),
}

/// Open and migrate the store at `path`. A corrupt file is renamed to
/// `<name>.corrupt-<unix ts>` and replaced by a fresh one, once.
pub fn open(spec: &StoreSpec, path: &Path) -> Result<Opened, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create the {} directory: {e}", spec.label))?;
    }
    match open_once(spec, path) {
        Ok(opened) => Ok(opened),
        Err(OpenError::Other(message)) => Err(message),
        Err(OpenError::Corrupt(reason)) => {
            let aside = quarantine(spec, path)?;
            log::warn!(
                "{}: moved unusable database to {} ({reason}); starting fresh",
                spec.label,
                aside.display()
            );
            let mut opened = open_once(spec, path).map_err(|e| match e {
                OpenError::Corrupt(message) | OpenError::Other(message) => message,
            })?;
            opened.recovered_from = Some(aside);
            Ok(opened)
        }
    }
}

fn open_once(spec: &StoreSpec, path: &Path) -> Result<Opened, OpenError> {
    let classify = |error, migrating| classify(spec, error, migrating);
    let mut conn = Connection::open(path).map_err(|e| classify(e, false))?;
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| classify(e, false))?;
    if version > spec.migrations.len() as i64 {
        drop(conn);
        return open_read_only(spec, path);
    }
    conn.busy_timeout(BUSY_TIMEOUT)
        .map_err(|e| classify(e, false))?;
    conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))
        .map_err(|e| classify(e, false))?;
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(|e| classify(e, false))?;
    migrate(spec, &mut conn, version).map_err(|e| classify(e, true))?;
    Ok(Opened {
        conn,
        read_only: false,
        recovered_from: None,
    })
}

fn open_read_only(spec: &StoreSpec, path: &Path) -> Result<Opened, OpenError> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| OpenError::Other(format!("Failed to open the {}: {e}", spec.label)))?;
    conn.busy_timeout(BUSY_TIMEOUT)
        .map_err(|e| OpenError::Other(e.to_string()))?;
    Ok(Opened {
        conn,
        read_only: true,
        recovered_from: None,
    })
}

fn migrate(spec: &StoreSpec, conn: &mut Connection, from: i64) -> rusqlite::Result<()> {
    for (index, sql) in spec
        .migrations
        .iter()
        .enumerate()
        .skip(from.max(0) as usize)
    {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index as i64 + 1)?;
        tx.commit()?;
    }
    Ok(())
}

/// A failed migration means the file holds something this schema can't
/// grow from, unless the failure is about access rather than content.
fn classify(spec: &StoreSpec, error: rusqlite::Error, migrating: bool) -> OpenError {
    let message = format!("Failed to open the {}: {error}", spec.label);
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
fn quarantine(spec: &StoreSpec, path: &Path) -> Result<PathBuf, String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| spec.file_name.to_string());
    let aside = path.with_file_name(format!("{name}.corrupt-{}", chrono::Utc::now().timestamp()));
    std::fs::rename(path, &aside).map_err(|e| {
        format!(
            "The {} is unusable and could not be moved aside: {e}",
            spec.label
        )
    })?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{suffix}", path.display()));
        if side.exists() {
            let _ = std::fs::rename(&side, PathBuf::from(format!("{}{suffix}", aside.display())));
        }
    }
    Ok(aside)
}

/// Delete the store's file and its WAL side files. Call [`SqliteStore::close`]
/// first, or Windows refuses.
pub fn remove_files(path: &Path) {
    for suffix in ["", "-wal", "-shm"] {
        let file = PathBuf::from(format!("{}{suffix}", path.display()));
        if file.exists() {
            let _ = std::fs::remove_file(&file);
        }
    }
}

/// Move the store's change counter, kept as `meta.revision`, and return it.
pub fn bump_revision(tx: &Transaction) -> rusqlite::Result<i64> {
    tx.query_row(
        "INSERT INTO meta (key, value) VALUES ('revision', '1') \
         ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 \
         RETURNING CAST(value AS INTEGER)",
        [],
        |row| row.get(0),
    )
}

pub fn revision(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT CAST(value AS INTEGER) FROM meta WHERE key = 'revision'",
        [],
        |row| row.get(0),
    )
    .optional()
    .map(Option::unwrap_or_default)
}

/// A migrated in-memory store for tests.
#[cfg(test)]
pub fn open_in_memory(spec: &StoreSpec) -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "foreign_keys", true).unwrap();
    migrate(spec, &mut conn, 0).unwrap();
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    static SPEC: StoreSpec = StoreSpec {
        file_name: "sample.db",
        label: "sample store",
        migrations: &[
            "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
            "CREATE TABLE notes (body TEXT NOT NULL);",
        ],
        read_only_message: "Read-only sample.",
    };

    fn user_version(conn: &Connection) -> i64 {
        conn.pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn an_older_file_migrates_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); \
                 INSERT INTO meta (key, value) VALUES ('kept', 'yes'); \
                 PRAGMA user_version = 1;",
            )
            .unwrap();
        }
        let opened = open(&SPEC, &path).unwrap();
        assert_eq!(user_version(&opened.conn), 2);
        assert!(opened.recovered_from.is_none());
        let kept: String = opened
            .conn
            .query_row("SELECT value FROM meta WHERE key = 'kept'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(kept, "yes");
        opened
            .conn
            .execute("INSERT INTO notes (body) VALUES ('x')", [])
            .unwrap();
    }

    #[test]
    fn quarantine_leaves_no_old_wal_next_to_the_fresh_file_and_reports_where() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.db");
        std::fs::write(&path, b"garbage".repeat(500)).unwrap();
        std::fs::write(dir.path().join("sample.db-wal"), b"old pages").unwrap();
        std::fs::write(dir.path().join("sample.db-shm"), b"old index").unwrap();

        let opened = open(&SPEC, &path).unwrap();
        let aside = opened.recovered_from.clone().expect("moved aside");
        let aside_name = aside.file_name().unwrap().to_string_lossy().into_owned();
        assert!(aside_name.starts_with("sample.db.corrupt-"), "{aside_name}");
        assert!(aside.exists());
        // SQLite may discard side files it can't use while it fails to open;
        // what must never happen is the old WAL replaying into the new file.
        for suffix in ["-wal", "-shm"] {
            let side = dir.path().join(format!("sample.db{suffix}"));
            let old = std::fs::read(&side).unwrap_or_default();
            assert!(!old.starts_with(b"old "), "{suffix} survived next to the fresh file");
        }
        assert_eq!(user_version(&opened.conn), 2);
    }

    #[tokio::test]
    async fn the_store_remembers_a_recovery_across_close() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.db");
        std::fs::write(&path, b"garbage".repeat(500)).unwrap();
        let store = SqliteStore::at(&SPEC, path.clone());
        assert!(store.recovered_from().is_none());

        store.with_store(|_| Ok(())).await.unwrap();
        let aside = store.recovered_from().expect("recorded");
        store.close();
        store.with_store(|_| Ok(())).await.unwrap();
        assert_eq!(store.recovered_from(), Some(aside));
    }

    #[tokio::test]
    async fn a_newer_file_refuses_writes_with_the_spec_message() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch("PRAGMA user_version = 9;").unwrap();
        }
        let store = SqliteStore::at(&SPEC, path.clone());
        let read_only = store
            .with_store_mode(|_, read_only| Ok(read_only))
            .await
            .unwrap();
        assert!(read_only);
        let error = store.with_writer(|_| Ok(())).await.unwrap_err();
        assert_eq!(error, "Read-only sample.");

        store.close();
        remove_files(&path);
        assert!(!path.exists());
    }

    #[test]
    fn the_revision_counts_up_from_nothing() {
        let mut conn = open_in_memory(&SPEC);
        assert_eq!(revision(&conn).unwrap(), 0);
        let tx = conn.transaction().unwrap();
        assert_eq!(bump_revision(&tx).unwrap(), 1);
        assert_eq!(bump_revision(&tx).unwrap(), 2);
        tx.commit().unwrap();
        assert_eq!(revision(&conn).unwrap(), 2);
    }
}
