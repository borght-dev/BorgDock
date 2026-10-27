//! Thin async commands over `queries`. Every SQLite call runs on a blocking
//! thread; every write that changes what a window shows bumps the store
//! revision and emits `ci-failures-changed`.

use super::dto::*;
use super::queries::{self, RetentionPolicy};
use super::{with_store, with_store_mode, with_writer, CiStore};
use rusqlite::Transaction;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

pub const CHANGED_EVENT: &str = "ci-failures-changed";

/// Sent to every window after a write; a window reloads when a scope it
/// shows is listed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type, tauri_specta::Event))]
#[serde(rename_all = "camelCase")]
pub struct CiFailuresChanged {
    pub revision: i64,
    pub scopes: Vec<String>,
}

fn notify(app: &AppHandle, revision: i64, scopes: Vec<String>) {
    if let Err(error) = app.emit(CHANGED_EVENT, CiFailuresChanged { revision, scopes }) {
        log::warn!("ci failure store: could not emit {CHANGED_EVENT}: {error}");
    }
}

/// One transaction that bumps the revision. `f` gets the transaction and
/// the current time.
async fn write<T, F>(store: &CiStore, f: F) -> Result<(T, i64), String>
where
    T: Send + 'static,
    F: FnOnce(&Transaction, &str) -> Result<T, String> + Send + 'static,
{
    with_writer(store, move |conn| {
        let now = queries::now();
        queries::write(conn, |tx| f(tx, &now))
    })
    .await
}

/// [`write`] for a change that may come to nothing; `f` says whether it did.
async fn write_if<T, F>(store: &CiStore, f: F) -> Result<(T, Option<i64>), String>
where
    T: Send + 'static,
    F: FnOnce(&Transaction, &str) -> Result<(T, bool), String> + Send + 'static,
{
    with_writer(store, move |conn| {
        let now = queries::now();
        queries::write_if(conn, |tx| f(tx, &now))
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_record(
    app: AppHandle,
    state: State<'_, CiStore>,
    batch: CiRecordBatch,
) -> Result<i64, String> {
    let (scopes, revision) = write(state.inner(), move |tx, now| {
        queries::record(tx, &batch, now)
    })
    .await?;
    notify(&app, revision, scopes);
    Ok(revision)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_known_occurrences(
    state: State<'_, CiStore>,
    scope: String,
    since: String,
) -> Result<Vec<CiKnownOccurrence>, String> {
    with_store(state.inner(), move |conn| {
        queries::known_occurrences(conn, &scope, &since)
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_load_scope(
    state: State<'_, CiStore>,
    scopes: Vec<String>,
) -> Result<CiScopeSnapshot, String> {
    with_store(state.inner(), move |conn| {
        queries::load_scope(conn, &scopes)
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_load_pr(
    state: State<'_, CiStore>,
    scope: String,
    pr_number: u32,
) -> Result<CiPrFailures, String> {
    with_store(state.inner(), move |conn| {
        queries::load_pr(conn, &scope, pr_number)
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_load_group(
    state: State<'_, CiStore>,
    group_id: String,
) -> Result<CiGroupDetail, String> {
    with_store(state.inner(), move |conn| {
        queries::load_group(conn, &group_id)
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_merge_groups(
    app: AppHandle,
    state: State<'_, CiStore>,
    keep: String,
    merge: String,
    keep_claim_of: Option<String>,
) -> Result<i64, String> {
    let (scope, revision) = write(state.inner(), move |tx, now| {
        queries::merge_groups(tx, &keep, &merge, keep_claim_of.as_deref(), now)
    })
    .await?;
    notify(&app, revision, vec![scope]);
    Ok(revision)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_split_fingerprint(
    app: AppHandle,
    state: State<'_, CiStore>,
    group_id: String,
    fingerprint: String,
    version: u32,
    title: String,
) -> Result<String, String> {
    let ((id, scope), revision) = write(state.inner(), move |tx, now| {
        queries::split_fingerprint(tx, &group_id, &fingerprint, version, &title, now)
    })
    .await?;
    notify(&app, revision, vec![scope]);
    Ok(id)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_dismiss_candidate(
    app: AppHandle,
    state: State<'_, CiStore>,
    group_a: String,
    group_b: String,
) -> Result<(), String> {
    let (scope, revision) = write(state.inner(), move |tx, _| {
        queries::dismiss_candidate(tx, &group_a, &group_b)
    })
    .await?;
    notify(&app, revision, vec![scope]);
    Ok(())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_set_candidate_verdict(
    app: AppHandle,
    state: State<'_, CiStore>,
    group_a: String,
    group_b: String,
    verdict: Value,
) -> Result<(), String> {
    let (scope, revision) = write(state.inner(), move |tx, _| {
        queries::set_candidate_verdict(tx, &group_a, &group_b, &verdict)
    })
    .await?;
    notify(&app, revision, vec![scope]);
    Ok(())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_set_group(
    app: AppHandle,
    state: State<'_, CiStore>,
    id: String,
    patch: CiGroupPatch,
    expected_revision: i64,
) -> Result<CiGroupSummary, String> {
    let (summary, revision) = write(state.inner(), move |tx, now| {
        queries::set_group(tx, &id, &patch, expected_revision, now)
    })
    .await?;
    notify(&app, revision, vec![summary.scope.clone()]);
    Ok(summary)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_claim(
    app: AppHandle,
    state: State<'_, CiStore>,
    group_id: String,
    owner: CiClaimOwner,
    lease_until: Option<String>,
    note: Option<String>,
) -> Result<CiClaimResult, String> {
    let ((result, scope), revision) = write_if(state.inner(), move |tx, now| {
        let result = queries::claim(
            tx,
            &group_id,
            &owner,
            lease_until.as_deref(),
            note.as_deref(),
            now,
        )?;
        let scope = queries::group_scope(tx, &result.claim().group_id)?;
        let claimed = matches!(result, CiClaimResult::Claimed { .. });
        Ok(((result, scope), claimed))
    })
    .await?;
    if let Some(revision) = revision {
        notify(&app, revision, vec![scope]);
    }
    Ok(result)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_update_claim(
    app: AppHandle,
    state: State<'_, CiStore>,
    claim_id: String,
    expected_revision: i64,
    patch: CiClaimPatch,
    event_kind: Option<String>,
    event_detail: Option<String>,
) -> Result<CiClaim, String> {
    let ((claim, scope), revision) = write(state.inner(), move |tx, now| {
        let event = event_kind
            .as_deref()
            .map(|kind| (kind, event_detail.as_deref()));
        let claim = queries::update_claim(tx, &claim_id, expected_revision, &patch, event, now)?;
        let scope = queries::group_scope(tx, &claim.group_id)?;
        Ok((claim, scope))
    })
    .await?;
    notify(&app, revision, vec![scope]);
    Ok(claim)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_claim_event(
    app: AppHandle,
    state: State<'_, CiStore>,
    claim_id: String,
    kind: String,
    detail: Option<String>,
) -> Result<(), String> {
    let (scope, revision) = write(state.inner(), move |tx, now| {
        queries::claim_event(tx, &claim_id, &kind, detail.as_deref(), now)
    })
    .await?;
    notify(&app, revision, vec![scope]);
    Ok(())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_usage(
    state: State<'_, CiStore>,
    day: String,
    account: String,
) -> Result<CiUsage, String> {
    with_store(state.inner(), move |conn| {
        queries::usage(conn, &day, &account)
    })
    .await
}

/// Bookkeeping for the daily read limit: no revision, no event, since the
/// `ci_record` that follows a read announces it.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_count_usage(
    state: State<'_, CiStore>,
    day: String,
    account: String,
    reads: u32,
    log_bytes: u64,
    skipped: u32,
) -> Result<(), String> {
    with_writer(state.inner(), move |conn| {
        queries::count_usage(conn, &day, &account, reads, log_bytes, skipped)
    })
    .await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_branch_watch(
    state: State<'_, CiStore>,
    scope: String,
) -> Result<Vec<CiBranchWatch>, String> {
    with_store(state.inner(), move |conn| {
        queries::branch_watch(conn, &scope)
    })
    .await
}

/// The runtime's own bookkeeping: no revision, no event.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_set_branch_watch(
    state: State<'_, CiStore>,
    rows: Vec<CiBranchWatch>,
) -> Result<(), String> {
    write_if(state.inner(), move |tx, _| {
        queries::set_branch_watch(tx, &rows).map(|()| ((), false))
    })
    .await
    .map(|_| ())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_retention(
    app: AppHandle,
    state: State<'_, CiStore>,
    active_scopes: Vec<String>,
    retention_days: u32,
    max_per_scope: u32,
    inactive_grace_days: u32,
) -> Result<CiRetentionReport, String> {
    let ((report, scopes), revision) = write_if(state.inner(), move |tx, now| {
        let policy = RetentionPolicy {
            active_scopes: &active_scopes,
            retention_days,
            max_per_scope,
            inactive_grace_days,
        };
        let (report, scopes) = queries::retention(tx, &policy, now)?;
        let changed = !scopes.is_empty();
        Ok(((report, scopes), changed))
    })
    .await?;
    if let Some(revision) = revision {
        notify(&app, revision, scopes);
    }
    Ok(report)
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_clear(
    app: AppHandle,
    state: State<'_, CiStore>,
    keep_decisions: bool,
) -> Result<(), String> {
    let (scopes, revision) = write(state.inner(), move |tx, _| {
        queries::clear(tx, keep_decisions)
    })
    .await?;
    notify(&app, revision, scopes);
    Ok(())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_store_info(state: State<'_, CiStore>) -> Result<CiStoreInfo, String> {
    let path = state.path().display().to_string();
    with_store_mode(state.inner(), move |conn, read_only| {
        queries::store_info(conn, path, read_only)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The DTOs survive the TypeScript export the app's bindings use.
    #[test]
    fn the_commands_export_to_typescript() {
        let builder = tauri_specta::Builder::<tauri::Wry>::new()
            .dangerously_cast_bigints_to_number()
            .events(tauri_specta::collect_events![CiFailuresChanged])
            .commands(tauri_specta::collect_commands![
                ci_record,
                ci_known_occurrences,
                ci_load_scope,
                ci_load_pr,
                ci_load_group,
                ci_merge_groups,
                ci_split_fingerprint,
                ci_dismiss_candidate,
                ci_set_candidate_verdict,
                ci_set_group,
                ci_claim,
                ci_update_claim,
                ci_claim_event,
                ci_usage,
                ci_count_usage,
                ci_branch_watch,
                ci_set_branch_watch,
                ci_retention,
                ci_clear,
                ci_store_info,
            ]);
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("commands.ts");
        builder
            .export(specta_typescript::Typescript::default(), &output)
            .expect("export CI failure store contracts");
        let generated = std::fs::read_to_string(output).unwrap();
        if std::env::var("BORGDOCK_PRINT_CI_STORE_BINDINGS").as_deref() == Ok("1") {
            println!("{generated}");
        }
        assert!(generated.contains("ciFailuresChanged"));
        assert!(generated.contains("CiGroupPatch"));
    }
}
