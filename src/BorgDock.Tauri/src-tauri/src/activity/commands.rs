//! Thin async commands over `queries`. Every SQLite call runs on a blocking
//! thread. A write that changes what a window shows emits
//! `activity-changed` with the new counts, so the rail, tray and taskbar
//! follow without asking.

use super::dto::*;
use super::{queries, ActivityDb};
use rusqlite::Transaction;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

pub const CHANGED_EVENT: &str = "activity-changed";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type, tauri_specta::Event))]
#[serde(rename_all = "camelCase")]
pub struct ActivityChanged {
    pub revision: i64,
    pub counts: ActivityCounts,
}

fn notify(app: &AppHandle, changed: Option<ActivityChanged>) {
    let Some(changed) = changed else { return };
    if let Err(error) = app.emit(CHANGED_EVENT, changed) {
        log::warn!("activity store: could not emit {CHANGED_EVENT}: {error}");
    }
}

/// One transaction; `f` gets it and the current time and says whether a
/// window would see the difference.
async fn write<T, F>(store: &ActivityDb, f: F) -> Result<(T, Option<ActivityChanged>), String>
where
    T: Send + 'static,
    F: FnOnce(&Transaction, &str) -> Result<(T, bool), String> + Send + 'static,
{
    store
        .db
        .with_writer(move |conn| {
            let now = queries::now();
            let (value, revision) = queries::write(conn, |tx| f(tx, &now))?;
            let changed = match revision {
                Some(revision) => Some(ActivityChanged {
                    revision,
                    counts: queries::counts(conn)?,
                }),
                None => None,
            };
            Ok((value, changed))
        })
        .await
}

pub(crate) async fn open_source(
    store: &ActivityDb,
    source: ActivitySourceRequest,
) -> Result<ActivitySourceState, String> {
    let (state, _) = write(store, move |tx, _| {
        Ok((queries::open_source(tx, &source)?, false))
    })
    .await?;
    Ok(state)
}

pub(crate) async fn commit(
    store: &ActivityDb,
    commit: ActivityCommit,
) -> Result<(ActivityCommitResult, Option<ActivityChanged>), String> {
    let (mut result, changed) =
        write(store, move |tx, now| queries::commit(tx, &commit, now)).await?;
    if let Some(changed) = &changed {
        result.revision = changed.revision;
    }
    Ok((result, changed))
}

pub(crate) async fn mark(
    store: &ActivityDb,
    request: ActivityMarkRequest,
) -> Result<(ActivityMarkResult, Option<ActivityChanged>), String> {
    let (mut result, changed) = write(store, move |tx, now| {
        let result = queries::mark(tx, &request, now)?;
        let changed = result.changed > 0;
        Ok((result, changed))
    })
    .await?;
    result.revision = match &changed {
        Some(changed) => changed.revision,
        None => list_revision(store).await?,
    };
    Ok((result, changed))
}

async fn list_revision(store: &ActivityDb) -> Result<i64, String> {
    store.db.with_store(|conn| queries::revision(conn)).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_open_source(
    state: State<'_, ActivityDb>,
    source: ActivitySourceRequest,
) -> Result<ActivitySourceState, String> {
    open_source(state.inner(), source).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_sources(
    state: State<'_, ActivityDb>,
) -> Result<Vec<ActivitySourceState>, String> {
    state
        .inner()
        .db
        .with_store(|conn| queries::sources(conn))
        .await
}

/// Settings dropped the source: its entries stay, with actions disabled.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_retire_source(
    app: AppHandle,
    state: State<'_, ActivityDb>,
    source_id: String,
) -> Result<bool, String> {
    let (retired, changed) = write(state.inner(), move |tx, now| {
        let retired = queries::retire_source(tx, &source_id, now)?;
        Ok((retired, retired))
    })
    .await?;
    notify(&app, changed);
    Ok(retired)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_commit(
    app: AppHandle,
    state: State<'_, ActivityDb>,
    commit: ActivityCommit,
) -> Result<ActivityCommitResult, String> {
    let (result, changed) = self::commit(state.inner(), commit).await?;
    notify(&app, changed);
    Ok(result)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_list(
    state: State<'_, ActivityDb>,
    query: ActivityListQuery,
) -> Result<ActivityPage, String> {
    state
        .inner()
        .db
        .with_store(move |conn| queries::list(conn, &query))
        .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_counts(state: State<'_, ActivityDb>) -> Result<ActivityCounts, String> {
    state
        .inner()
        .db
        .with_store(|conn| queries::counts(conn))
        .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_mark(
    app: AppHandle,
    state: State<'_, ActivityDb>,
    request: ActivityMarkRequest,
) -> Result<ActivityMarkResult, String> {
    let (result, changed) = mark(state.inner(), request).await?;
    notify(&app, changed);
    Ok(result)
}

/// Undo: put back the states an `activity_mark` returned.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_restore(
    app: AppHandle,
    state: State<'_, ActivityDb>,
    states: Vec<ActivityReadState>,
) -> Result<i64, String> {
    let (_, changed) = write(state.inner(), move |tx, _| {
        let restored = queries::restore(tx, &states)?;
        Ok(((), restored > 0))
    })
    .await?;
    let revision = match &changed {
        Some(changed) => changed.revision,
        None => list_revision(state.inner()).await?,
    };
    notify(&app, changed);
    Ok(revision)
}

/// Due outbox rows of one channel, oldest first. Taking changes nothing;
/// `activity_outbox_ack` settles each row.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_outbox_take(
    state: State<'_, ActivityDb>,
    channel: String,
    limit: u32,
) -> Result<Vec<ActivityOutboxItem>, String> {
    state
        .inner()
        .db
        .with_store(move |conn| queries::outbox_take(conn, &channel, limit, &queries::now()))
        .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_outbox_ack(
    state: State<'_, ActivityDb>,
    acks: Vec<ActivityOutboxAck>,
) -> Result<i64, String> {
    let (acked, _) = write(state.inner(), move |tx, now| {
        Ok((queries::outbox_ack(tx, &acks, now)?, false))
    })
    .await?;
    Ok(acked)
}

/// Delete the entries of one source, or all of them. Baselines stay.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_clear(
    app: AppHandle,
    state: State<'_, ActivityDb>,
    source_id: Option<String>,
) -> Result<i64, String> {
    let (removed, changed) = write(state.inner(), move |tx, _| {
        let removed = queries::clear(tx, source_id.as_deref())?;
        Ok((removed, removed > 0))
    })
    .await?;
    notify(&app, changed);
    Ok(removed)
}

/// Write every source and entry as JSON to `path`, chosen in a save dialog.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_export(state: State<'_, ActivityDb>, path: String) -> Result<i64, String> {
    state
        .inner()
        .db
        .with_store(move |conn| queries::export(conn, &path, &queries::now()))
        .await
}

/// Retention: run at startup and once a day.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_prune(app: AppHandle, state: State<'_, ActivityDb>) -> Result<i64, String> {
    let (removed, changed) = write(state.inner(), move |tx, now| {
        let removed = queries::prune(tx, now)?;
        Ok((removed, removed > 0))
    })
    .await?;
    notify(&app, changed);
    Ok(removed)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_store_info(
    state: State<'_, ActivityDb>,
) -> Result<ActivityStoreInfo, String> {
    store_info(state.inner()).await
}

pub(crate) async fn store_info(store: &ActivityDb) -> Result<ActivityStoreInfo, String> {
    let path = store.path().display().to_string();
    let recovered_from = store
        .db
        .recovered_from()
        .map(|aside| aside.display().to_string());
    let info = store
        .db
        .with_store_mode(move |conn, read_only| {
            queries::info(conn, path, read_only, recovered_from)
        })
        .await?;
    // The quarantine happens while opening, so ask again once it has.
    Ok(ActivityStoreInfo {
        recovered_from: store
            .db
            .recovered_from()
            .map(|aside| aside.display().to_string()),
        ..info
    })
}
