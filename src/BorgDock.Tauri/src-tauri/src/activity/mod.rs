//! The activity journal: what changed since I last checked, kept until I
//! read or dismiss it. TypeScript derives entries from the observations the
//! app accepts; this store keeps them with each source's generation and
//! baseline, the read state and the outbox, and applies one observation in
//! one transaction. Spec:
//! `docs/superpowers/plans/2026-10-26-activity-digest-plan.md`.

pub mod commands;
pub mod dto;
pub mod push;
pub(crate) mod queries;
mod schema;

use crate::sqlite_store::{SqliteStore, StoreSpec};
use std::path::PathBuf;

pub const READ_ONLY_MESSAGE: &str =
    "This activity history was written by a newer BorgDock. It is read-only.";

pub static SPEC: StoreSpec = StoreSpec {
    file_name: "activity.db",
    label: "activity store",
    migrations: schema::MIGRATIONS,
    read_only_message: READ_ONLY_MESSAGE,
};

/// Managed state. The connection opens on first use, on a blocking thread.
#[derive(Clone)]
pub struct ActivityDb {
    pub(crate) db: SqliteStore,
}

impl Default for ActivityDb {
    fn default() -> Self {
        Self {
            db: SqliteStore::new(&SPEC),
        }
    }
}

impl ActivityDb {
    #[cfg(test)]
    pub(crate) fn at(path: PathBuf) -> Self {
        Self {
            db: SqliteStore::at(&SPEC, path),
        }
    }

    pub fn path(&self) -> PathBuf {
        self.db.path()
    }

    /// Drop the connection so the file can be deleted.
    pub fn close(&self) {
        self.db.close();
    }
}
#[cfg(test)]
mod tests;
