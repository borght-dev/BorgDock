//! Every read and write of the store, as functions of a connection or a
//! transaction so tests run them without Tauri. Times are passed in.

use super::dto::*;
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::types::Value as SqlValue;
use rusqlite::{
    params, params_from_iter, Connection, OptionalExtension, Row, Transaction, TransactionBehavior,
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::{BTreeSet, HashMap, HashSet};

/// Claim states that hold a group. The unique index allows one per group.
const LIVE: &str = "'active','stale','launch_failed'";
const GROUP_OCCURRENCE_LIMIT: u32 = 200;
const MAX_MERGE_HOPS: usize = 64;

const CLASSIFICATIONS: &[&str] = &[
    "infrastructure",
    "base-branch",
    "flaky",
    "branch-specific",
    "unknown",
];
/// `merged` is reached only through a merge.
const PATCHABLE_STATUSES: &[&str] = &["active", "quiet", "resolved"];
const OWNER_KINDS: &[&str] = &["me", "t3", "terminal", "github_issue"];
const CLAIM_STATES: &[&str] = &["active", "stale", "launch_failed", "released", "resolved"];
const CLAIM_EVENTS: &[&str] = &[
    "claimed",
    "renewed",
    "released",
    "overridden",
    "stale",
    "resolved",
    "launch_failed",
    "owner_changed",
];

/// Joins a fingerprint `f` to the occurrences `o` of its scope whose
/// signals `s` carry it: the occurrences a group owns.
const MEMBERS: &str =
    "JOIN signals s ON s.fingerprint_version = f.version AND s.fingerprint = f.fingerprint \
     JOIN occurrences o ON o.id = s.occurrence_id AND o.scope = f.scope";

/// When an occurrence's job failed; when BorgDock saw it if GitHub gave no time.
/// A group's span and order follow the failures, not the reads, so a backfill
/// of old jobs never makes a failure look new.
const FAILED_AT: &str = "COALESCE(o.completed_at, o.observed_at)";

const OCCURRENCE_SELECT: &str = "o.id, o.scope, o.source, o.pr_number, o.pr_head_sha, o.tested_sha, \
     o.head_branch, o.event, o.workflow_id, o.workflow_path, o.workflow_name, o.run_id, o.run_attempt, \
     o.run_number, o.job_id, o.job_name, o.matrix, o.check_suite_id, o.app_slug, o.html_url, o.conclusion, \
     o.failed_step, o.failed_step_number, o.runner_name, o.runner_group, o.runner_labels, o.started_at, \
     o.completed_at, o.observed_at, o.evidence_state, o.evidence_reason, o.bytes_read, o.total_bytes, \
     o.truncated, o.evidence_attempts, o.retry_at";

/// Identity columns never change after the first insert. Columns a read fills
/// in later never go back to null; a pending insert's `tested_sha` is only the
/// PR head, so the read's value replaces it.
const UPSERT_OCCURRENCE: &str = "INSERT INTO occurrences (id, scope, source, pr_number, pr_head_sha, \
     tested_sha, head_branch, event, workflow_id, workflow_path, workflow_name, run_id, run_attempt, \
     run_number, job_id, job_name, matrix, check_suite_id, app_slug, html_url, conclusion, failed_step, \
     failed_step_number, runner_name, runner_group, runner_labels, started_at, completed_at, observed_at, \
     evidence_state, evidence_reason, bytes_read, total_bytes, truncated, evidence_attempts, retry_at) \
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, \
     ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36) \
     ON CONFLICT(id) DO UPDATE SET \
     evidence_state = excluded.evidence_state, evidence_reason = excluded.evidence_reason, \
     bytes_read = excluded.bytes_read, total_bytes = excluded.total_bytes, truncated = excluded.truncated, \
     evidence_attempts = excluded.evidence_attempts, retry_at = excluded.retry_at, \
     failed_step = COALESCE(excluded.failed_step, failed_step), \
     failed_step_number = COALESCE(excluded.failed_step_number, failed_step_number), \
     runner_name = COALESCE(excluded.runner_name, runner_name), \
     runner_group = COALESCE(excluded.runner_group, runner_group), \
     runner_labels = CASE WHEN excluded.runner_labels = '[]' THEN runner_labels ELSE excluded.runner_labels END, \
     workflow_id = COALESCE(excluded.workflow_id, workflow_id), \
     workflow_path = COALESCE(excluded.workflow_path, workflow_path), \
     run_attempt = COALESCE(excluded.run_attempt, run_attempt), \
     completed_at = COALESCE(excluded.completed_at, completed_at), \
     tested_sha = CASE WHEN excluded.evidence_state = 'pending' OR excluded.tested_sha = '' \
       THEN tested_sha ELSE excluded.tested_sha END, \
     head_branch = COALESCE(excluded.head_branch, head_branch), \
     event = COALESCE(excluded.event, event), \
     workflow_name = COALESCE(excluded.workflow_name, workflow_name), \
     run_number = COALESCE(excluded.run_number, run_number), \
     html_url = COALESCE(excluded.html_url, html_url), \
     started_at = COALESCE(excluded.started_at, started_at)";

const GROUP_SELECT: &str = "g.id, g.scope, g.title, g.classification, g.status, g.merged_into, \
     g.fix_pr, g.fix_merged_at, g.tracking_issue, g.first_observed_at, g.last_observed_at, g.revision";

const CLAIM_SELECT: &str =
    "c.id, c.group_id, c.owner_kind, c.owner_ref, c.owner_label, c.host_id, \
     c.claimed_at, c.lease_until, c.state, c.note, c.revision, c.updated_at";

const DECISION_SELECT: &str =
    "d.id, d.scope, d.kind, d.version, d.fingerprint_a, d.fingerprint_b, \
     d.note, d.ambiguous, d.created_at";

pub fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn db(error: rusqlite::Error) -> String {
    format!("CI failure store: {error}")
}

fn to_json<T: serde::Serialize + ?Sized>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| format!("CI failure store: {e}"))
}

fn json_column<T: DeserializeOwned>(row: &Row, index: usize) -> rusqlite::Result<T> {
    let text: String = row.get(index)?;
    serde_json::from_str(&text).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(index, rusqlite::types::Type::Text, Box::new(e))
    })
}

/// A list as one JSON parameter, read in SQL with `json_each`.
fn list_arg<S: AsRef<str>>(items: &[S]) -> String {
    let items: Vec<&str> = items.iter().map(AsRef::as_ref).collect();
    serde_json::to_string(&items).expect("strings serialize")
}

fn rows<T, P: rusqlite::Params>(
    conn: &Connection,
    sql: &str,
    params: P,
    map: impl FnMut(&Row) -> rusqlite::Result<T>,
) -> Result<Vec<T>, String> {
    let mut statement = conn.prepare_cached(sql).map_err(db)?;
    let mapped = statement.query_map(params, map).map_err(db)?;
    mapped.collect::<rusqlite::Result<Vec<T>>>().map_err(db)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Candidate pairs are stored once, smaller id first.
fn ordered<'a>(a: &'a str, b: &'a str) -> (&'a str, &'a str) {
    if a <= b {
        (a, b)
    } else {
        (b, a)
    }
}

fn check(value: &str, allowed: &[&str], what: &str) -> Result<(), String> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!("Unknown {what}: {value}"))
    }
}

fn is_unique_violation(error: &rusqlite::Error) -> bool {
    matches!(error, rusqlite::Error::SqliteFailure(failure, _)
        if failure.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE)
}

// ---------------------------------------------------------------- writes

/// Run `f` in one transaction and bump the store revision with it.
/// Immediate, so a second writer waits for the first instead of failing on
/// a stale snapshot.
pub fn write<T>(
    conn: &mut Connection,
    f: impl FnOnce(&Transaction) -> Result<T, String>,
) -> Result<(T, i64), String> {
    let (value, revision) = write_if(conn, |tx| Ok((f(tx)?, true)))?;
    Ok((value, revision.unwrap_or_default()))
}

/// [`write`] for a change that may come to nothing: the revision moves only
/// when `f` reports a change.
pub fn write_if<T>(
    conn: &mut Connection,
    f: impl FnOnce(&Transaction) -> Result<(T, bool), String>,
) -> Result<(T, Option<i64>), String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db)?;
    let (value, changed) = f(&tx)?;
    let revision = if changed {
        Some(bump_revision(&tx)?)
    } else {
        None
    };
    tx.commit().map_err(db)?;
    Ok((value, revision))
}

fn bump_revision(tx: &Transaction) -> Result<i64, String> {
    crate::sqlite_store::bump_revision(tx).map_err(db)
}

pub fn revision(conn: &Connection) -> Result<i64, String> {
    crate::sqlite_store::revision(conn).map_err(db)
}

/// Persist a batch from the runtime. Returns the scopes it touched.
pub fn record(tx: &Transaction, batch: &CiRecordBatch, now: &str) -> Result<Vec<String>, String> {
    for occurrence in &batch.occurrences {
        upsert_occurrence(tx, occurrence)?;
    }
    for id in &batch.replace_signals_for {
        tx.execute("DELETE FROM signals WHERE occurrence_id = ?1", [id])
            .map_err(db)?;
    }
    for signal in &batch.signals {
        tx.execute(
            "INSERT OR REPLACE INTO signals \
             (occurrence_id, ordinal, signal, fingerprint_version, fingerprint, tier) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                signal.occurrence_id,
                signal.ordinal,
                to_json(&signal.signal)?,
                signal.fingerprint_version,
                signal.fingerprint,
                signal.tier,
            ],
        )
        .map_err(db)?;
    }
    for group in &batch.new_groups {
        tx.execute(
            "INSERT OR IGNORE INTO groups \
             (id, scope, title, first_observed_at, last_observed_at, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?5)",
            params![
                group.id,
                group.scope,
                group.title,
                group.first_observed_at,
                now
            ],
        )
        .map_err(db)?;
    }
    for mapping in &batch.mappings {
        map_fingerprint(tx, mapping)?;
    }
    for candidate in &batch.candidates {
        add_candidate(
            tx,
            &candidate.group_a,
            &candidate.group_b,
            &candidate.reasons,
            now,
        )?;
    }
    for outcome in &batch.outcomes {
        tx.execute(
            "INSERT OR REPLACE INTO outcomes (occurrence_id, kind, by_job_id, observed_at) \
             VALUES (?1, ?2, ?3, ?4)",
            params![
                outcome.occurrence_id,
                outcome.kind,
                outcome.by_job_id,
                outcome.observed_at
            ],
        )
        .map_err(db)?;
    }

    let owners: BTreeSet<&str> = batch
        .signals
        .iter()
        .map(|signal| signal.occurrence_id.as_str())
        .collect();
    let owners: Vec<&str> = owners.into_iter().collect();
    let touched: Vec<String> = rows(
        tx,
        &format!(
            "SELECT DISTINCT f.group_id FROM fingerprints f {MEMBERS} \
             WHERE o.id IN (SELECT value FROM json_each(?1))"
        ),
        params![list_arg(&owners)],
        |row| row.get(0),
    )?;
    for group in &touched {
        tx.execute(
            "UPDATE groups SET status = CASE status WHEN 'quiet' THEN 'active' ELSE status END, \
             revision = revision + 1, updated_at = ?2 WHERE id = ?1",
            params![group, now],
        )
        .map_err(db)?;
        widen_observed(tx, group)?;
    }

    let scopes: BTreeSet<String> = batch
        .occurrences
        .iter()
        .map(|o| o.scope.clone())
        .chain(batch.new_groups.iter().map(|g| g.scope.clone()))
        .chain(batch.mappings.iter().map(|m| m.scope.clone()))
        .collect();
    Ok(scopes.into_iter().collect())
}

fn upsert_occurrence(tx: &Transaction, o: &CiOccurrence) -> Result<(), String> {
    tx.execute(
        UPSERT_OCCURRENCE,
        params![
            o.id,
            o.scope,
            o.source,
            o.pr_number,
            o.pr_head_sha,
            o.tested_sha,
            o.head_branch,
            o.event,
            o.workflow_id,
            o.workflow_path,
            o.workflow_name,
            o.run_id,
            o.run_attempt,
            o.run_number,
            o.job_id,
            o.job_name,
            to_json(&o.matrix)?,
            o.check_suite_id,
            o.app_slug,
            o.html_url,
            o.conclusion,
            o.failed_step,
            o.failed_step_number,
            o.runner_name,
            o.runner_group,
            to_json(&o.runner_labels)?,
            o.started_at,
            o.completed_at,
            o.observed_at,
            o.evidence_state,
            o.evidence_reason,
            o.bytes_read,
            o.total_bytes,
            o.truncated,
            o.evidence_attempts,
            o.retry_at,
        ],
    )
    .map(|_| ())
    .map_err(db)
}

/// A fingerprint that already has a group keeps it; only merge and split
/// move one. A mapping to a merged group lands on the group that absorbed it.
fn map_fingerprint(tx: &Transaction, mapping: &CiFingerprintRow) -> Result<(), String> {
    let group = survivor(tx, &mapping.group_id)?.ok_or_else(|| {
        format!(
            "Fingerprint {} names group {}, which doesn't exist",
            mapping.fingerprint, mapping.group_id
        )
    })?;
    tx.execute(
        "INSERT OR IGNORE INTO fingerprints \
         (scope, version, fingerprint, group_id, facets, first_seen_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            mapping.scope,
            mapping.version,
            mapping.fingerprint,
            group,
            to_json(&mapping.facets)?,
            mapping.first_seen_at
        ],
    )
    .map(|_| ())
    .map_err(db)
}

fn add_candidate(
    tx: &Transaction,
    a: &str,
    b: &str,
    reasons: &[String],
    now: &str,
) -> Result<(), String> {
    let (a, b) = ordered(a, b);
    if a == b {
        return Ok(());
    }
    let open: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM groups WHERE id IN (?1, ?2) AND status != 'merged'",
            params![a, b],
            |row| row.get(0),
        )
        .map_err(db)?;
    if open < 2 {
        return Ok(());
    }
    tx.execute(
        "INSERT OR IGNORE INTO candidates (group_a, group_b, reasons, created_at) \
         VALUES (?1, ?2, ?3, ?4)",
        params![a, b, to_json(reasons)?, now],
    )
    .map(|_| ())
    .map_err(db)
}

/// Widen a group's observed span to cover its occurrences. Never narrows it,
/// so history that retention expired still counts.
fn widen_observed(tx: &Transaction, group: &str) -> Result<(), String> {
    tx.execute(
        &format!(
            "UPDATE groups SET \
             first_observed_at = MIN(first_observed_at, COALESCE( \
               (SELECT MIN({FAILED_AT}) FROM fingerprints f {MEMBERS} WHERE f.group_id = ?1), \
               first_observed_at)), \
             last_observed_at = MAX(last_observed_at, COALESCE( \
               (SELECT MAX({FAILED_AT}) FROM fingerprints f {MEMBERS} WHERE f.group_id = ?1), \
               last_observed_at)) \
             WHERE id = ?1"
        ),
        [group],
    )
    .map(|_| ())
    .map_err(db)
}

/// Recompute the span from the occurrences the group still owns, after a
/// split took some of them away.
fn recompute_observed(tx: &Transaction, group: &str) -> Result<(), String> {
    tx.execute(
        &format!(
            "UPDATE groups SET \
             first_observed_at = COALESCE( \
               (SELECT MIN({FAILED_AT}) FROM fingerprints f {MEMBERS} WHERE f.group_id = ?1), \
               first_observed_at), \
             last_observed_at = COALESCE( \
               (SELECT MAX({FAILED_AT}) FROM fingerprints f {MEMBERS} WHERE f.group_id = ?1), \
               last_observed_at) \
             WHERE id = ?1"
        ),
        [group],
    )
    .map(|_| ())
    .map_err(db)
}

fn insert_decision(
    tx: &Transaction,
    scope: &str,
    kind: &str,
    version: u32,
    pair: (&str, &str),
    now: &str,
) -> Result<(), String> {
    tx.execute(
        "INSERT INTO decisions (id, scope, kind, version, fingerprint_a, fingerprint_b, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![new_id(), scope, kind, version, pair.0, pair.1, now],
    )
    .map(|_| ())
    .map_err(db)
}

/// Remove decisions of `kind` between `fingerprint` and the fingerprints
/// `group` owns: a merge or split contradicts them.
fn drop_decisions(
    tx: &Transaction,
    scope: &str,
    kind: &str,
    version: u32,
    fingerprint: &str,
    group: &str,
) -> Result<(), String> {
    tx.execute(
        "DELETE FROM decisions WHERE kind = ?1 AND scope = ?2 AND version = ?3 AND ( \
           (fingerprint_a = ?4 AND fingerprint_b IN \
             (SELECT fingerprint FROM fingerprints WHERE group_id = ?5 AND version = ?3)) \
           OR (fingerprint_b = ?4 AND fingerprint_a IN \
             (SELECT fingerprint FROM fingerprints WHERE group_id = ?5 AND version = ?3)))",
        params![kind, scope, version, fingerprint, group],
    )
    .map(|_| ())
    .map_err(db)
}

struct GroupHead {
    scope: String,
    status: String,
    revision: i64,
    first_observed_at: String,
    last_observed_at: String,
}

fn group_head(conn: &Connection, id: &str) -> Result<GroupHead, String> {
    conn.query_row(
        "SELECT scope, status, revision, first_observed_at, last_observed_at FROM groups WHERE id = ?1",
        [id],
        |row| {
            Ok(GroupHead {
                scope: row.get(0)?,
                status: row.get(1)?,
                revision: row.get(2)?,
                first_observed_at: row.get(3)?,
                last_observed_at: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(db)?
    .ok_or_else(|| "The group no longer exists; reload it".to_string())
}

pub fn group_scope(conn: &Connection, id: &str) -> Result<String, String> {
    group_head(conn, id).map(|head| head.scope)
}

/// The group `id` ended up in, following merges.
pub fn survivor(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    let mut current = id.to_string();
    for _ in 0..MAX_MERGE_HOPS {
        let row: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT status, merged_into FROM groups WHERE id = ?1",
                [&current],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(db)?;
        match row {
            None => return Ok(None),
            Some((status, Some(next))) if status == "merged" => current = next,
            Some(_) => return Ok(Some(current)),
        }
    }
    Err(format!("The merge history of group {id} loops"))
}

/// Fold `merge` into `keep`. Returns the scope.
pub fn merge_groups(
    tx: &Transaction,
    keep: &str,
    merge: &str,
    keep_claim_of: Option<&str>,
    now: &str,
) -> Result<String, String> {
    if keep == merge {
        return Err("A group can't be merged into itself".to_string());
    }
    let kept = group_head(tx, keep)?;
    let merged = group_head(tx, merge)?;
    if kept.status == "merged" || merged.status == "merged" {
        return Err("One of the groups was already merged; reload it".to_string());
    }
    if kept.scope != merged.scope {
        return Err("Groups from different repositories can't be merged".to_string());
    }
    let scope = kept.scope;

    settle_claims_for_merge(tx, keep, merge, keep_claim_of, now)?;

    let anchors: HashMap<u32, String> = rows(
        tx,
        "SELECT version, fingerprint FROM fingerprints WHERE group_id = ?1 \
         ORDER BY first_seen_at DESC, fingerprint DESC",
        [keep],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?
    .into_iter()
    .collect();
    let moving: Vec<(u32, String)> = rows(
        tx,
        "SELECT version, fingerprint FROM fingerprints WHERE group_id = ?1 \
         ORDER BY first_seen_at, fingerprint",
        [merge],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    for (version, fingerprint) in &moving {
        drop_decisions(tx, &scope, "cannot_link", *version, fingerprint, keep)?;
        if let Some(anchor) = anchors.get(version) {
            insert_decision(
                tx,
                &scope,
                "must_link",
                *version,
                (anchor, fingerprint),
                now,
            )?;
        }
    }
    tx.execute(
        "UPDATE fingerprints SET group_id = ?1 WHERE group_id = ?2",
        params![keep, merge],
    )
    .map_err(db)?;

    repoint_candidates(tx, keep, merge)?;

    tx.execute(
        "UPDATE groups SET merged_into = ?1 WHERE merged_into = ?2",
        params![keep, merge],
    )
    .map_err(db)?;
    tx.execute(
        "UPDATE groups SET status = 'merged', merged_into = ?1, revision = revision + 1, \
         updated_at = ?3 WHERE id = ?2",
        params![keep, merge, now],
    )
    .map_err(db)?;
    tx.execute(
        "UPDATE groups SET revision = revision + 1, updated_at = ?2, \
         first_observed_at = MIN(first_observed_at, ?3), last_observed_at = MAX(last_observed_at, ?4) \
         WHERE id = ?1",
        params![
            keep,
            now,
            merged.first_observed_at,
            merged.last_observed_at
        ],
    )
    .map_err(db)?;
    widen_observed(tx, keep)?;
    Ok(scope)
}

fn settle_claims_for_merge(
    tx: &Transaction,
    keep: &str,
    merge: &str,
    keep_claim_of: Option<&str>,
    now: &str,
) -> Result<(), String> {
    match (live_claim(tx, keep)?, live_claim(tx, merge)?) {
        (_, None) => Ok(()),
        (None, Some(theirs)) => move_claim(tx, &theirs, keep, now),
        (Some(ours), Some(theirs)) => match keep_claim_of {
            None => Err("Both groups have an owner; choose one".to_string()),
            Some(id) if id == keep => release_claim(tx, &theirs, now),
            Some(id) if id == merge => {
                release_claim(tx, &ours, now)?;
                move_claim(tx, &theirs, keep, now)
            }
            Some(other) => Err(format!("keepClaimOf names {other}, which is neither group")),
        },
    }
}

fn release_claim(tx: &Transaction, claim: &CiClaim, now: &str) -> Result<(), String> {
    tx.execute(
        "UPDATE claims SET state = 'released', revision = revision + 1, updated_at = ?2 WHERE id = ?1",
        params![claim.id, now],
    )
    .map_err(db)?;
    add_event(tx, &claim.id, "released", Some("merged"), now)
}

fn move_claim(tx: &Transaction, claim: &CiClaim, group: &str, now: &str) -> Result<(), String> {
    tx.execute(
        "UPDATE claims SET group_id = ?2, revision = revision + 1, updated_at = ?3 WHERE id = ?1",
        params![claim.id, group, now],
    )
    .map_err(db)?;
    add_event(tx, &claim.id, "owner_changed", Some("merged"), now)
}

fn repoint_candidates(tx: &Transaction, keep: &str, merge: &str) -> Result<(), String> {
    type CandidateRow = (String, String, String, bool, Option<String>, String);
    let touching: Vec<CandidateRow> = rows(
        tx,
        "SELECT group_a, group_b, reasons, dismissed, agent_verdict, created_at FROM candidates \
         WHERE group_a = ?1 OR group_b = ?1",
        [merge],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        },
    )?;
    tx.execute(
        "DELETE FROM candidates WHERE group_a = ?1 OR group_b = ?1",
        [merge],
    )
    .map_err(db)?;
    for (a, b, reasons, dismissed, verdict, created_at) in touching {
        let other = if a == merge { b } else { a };
        if other == keep {
            continue;
        }
        let (a, b) = ordered(keep, &other);
        tx.execute(
            "INSERT OR IGNORE INTO candidates \
             (group_a, group_b, reasons, dismissed, agent_verdict, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![a, b, reasons, dismissed, verdict, created_at],
        )
        .map_err(db)?;
    }
    Ok(())
}

/// Move one fingerprint out of `group` into a new group. Returns the new
/// group's id and the scope.
pub fn split_fingerprint(
    tx: &Transaction,
    group: &str,
    fingerprint: &str,
    version: u32,
    title: &str,
    now: &str,
) -> Result<(String, String), String> {
    let head = group_head(tx, group)?;
    if head.status == "merged" {
        return Err("The group was merged into another; reload it".to_string());
    }
    let owned: Vec<(u32, String)> = rows(
        tx,
        "SELECT version, fingerprint FROM fingerprints WHERE group_id = ?1",
        [group],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if !owned.iter().any(|(v, f)| *v == version && f == fingerprint) {
        return Err("That fingerprint isn't in this group; reload it".to_string());
    }
    if owned.len() < 2 {
        return Err("This is the group's only fingerprint; there is nothing to split".to_string());
    }

    let id = new_id();
    tx.execute(
        "INSERT INTO groups (id, scope, title, first_observed_at, last_observed_at, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            id,
            head.scope,
            title,
            head.first_observed_at,
            head.last_observed_at,
            now
        ],
    )
    .map_err(db)?;
    tx.execute(
        "UPDATE fingerprints SET group_id = ?1 WHERE scope = ?2 AND version = ?3 AND fingerprint = ?4",
        params![id, head.scope, version, fingerprint],
    )
    .map_err(db)?;
    drop_decisions(tx, &head.scope, "must_link", version, fingerprint, group)?;
    for (_, remaining) in owned
        .iter()
        .filter(|(v, f)| *v == version && f != fingerprint)
    {
        insert_decision(
            tx,
            &head.scope,
            "cannot_link",
            version,
            (remaining, fingerprint),
            now,
        )?;
    }
    tx.execute(
        "UPDATE groups SET revision = revision + 1, updated_at = ?2 WHERE id = ?1",
        params![group, now],
    )
    .map_err(db)?;
    recompute_observed(tx, group)?;
    recompute_observed(tx, &id)?;
    Ok((id, head.scope))
}

/// Returns the scope of the pair.
pub fn dismiss_candidate(tx: &Transaction, a: &str, b: &str) -> Result<String, String> {
    let (a, b) = ordered(a, b);
    let changed = tx
        .execute(
            "UPDATE candidates SET dismissed = 1 WHERE group_a = ?1 AND group_b = ?2",
            params![a, b],
        )
        .map_err(db)?;
    if changed == 0 {
        return Err("That suggestion no longer exists; reload it".to_string());
    }
    group_scope(tx, a)
}

/// Returns the scope of the pair.
pub fn set_candidate_verdict(
    tx: &Transaction,
    a: &str,
    b: &str,
    verdict: &Value,
) -> Result<String, String> {
    let (a, b) = ordered(a, b);
    let changed = tx
        .execute(
            "UPDATE candidates SET agent_verdict = ?3 WHERE group_a = ?1 AND group_b = ?2",
            params![a, b, to_json(verdict)?],
        )
        .map_err(db)?;
    if changed == 0 {
        return Err("That suggestion no longer exists; reload it".to_string());
    }
    group_scope(tx, a)
}

/// Column assignments for an `UPDATE` built from a patch.
#[derive(Default)]
struct Assignments {
    sets: Vec<String>,
    values: Vec<SqlValue>,
}

impl Assignments {
    fn set(&mut self, column: &str, value: Option<&str>) {
        self.values
            .push(value.map_or(SqlValue::Null, |v| SqlValue::Text(v.to_string())));
        self.sets.push(format!("{column} = ?{}", self.values.len()));
    }

    /// Bump `revision`, stamp `updated_at` and apply to the row `id` of `table`.
    fn apply(
        mut self,
        tx: &Transaction,
        table: &str,
        id: &str,
        now: &str,
    ) -> rusqlite::Result<usize> {
        self.set("updated_at", Some(now));
        self.values.push(SqlValue::Text(id.to_string()));
        let sql = format!(
            "UPDATE {table} SET {}, revision = revision + 1 WHERE id = ?{}",
            self.sets.join(", "),
            self.values.len()
        );
        tx.execute(&sql, params_from_iter(self.values))
    }
}

/// Compare-and-set a group's editable fields.
pub fn set_group(
    tx: &Transaction,
    id: &str,
    patch: &CiGroupPatch,
    expected_revision: i64,
    now: &str,
) -> Result<CiGroupSummary, String> {
    let head = group_head(tx, id)?;
    if head.status == "merged" {
        return Err("The group was merged into another; reload it".to_string());
    }
    if head.revision != expected_revision {
        return Err("The group changed; reload it".to_string());
    }
    let mut update = Assignments::default();
    if let Some(title) = &patch.title {
        if title.trim().is_empty() {
            return Err("A group needs a title".to_string());
        }
        update.set("title", Some(title));
    }
    if let Some(classification) = &patch.classification {
        if let Some(value) = classification {
            check(value, CLASSIFICATIONS, "classification")?;
        }
        update.set("classification", classification.as_deref());
        update.set("classified_at", classification.as_ref().map(|_| now));
    }
    if let Some(status) = &patch.status {
        check(status, PATCHABLE_STATUSES, "group status")?;
        update.set("status", Some(status));
        update.set("resolved_at", (status == "resolved").then_some(now));
    }
    if let Some(fix_pr) = &patch.fix_pr {
        update.set("fix_pr", fix_pr.as_deref());
    }
    if let Some(fix_merged_at) = &patch.fix_merged_at {
        update.set("fix_merged_at", fix_merged_at.as_deref());
    }
    if let Some(tracking_issue) = &patch.tracking_issue {
        update.set("tracking_issue", tracking_issue.as_deref());
    }
    update.apply(tx, "groups", id, now).map_err(db)?;
    group_summary(tx, id)
}

/// Claim a group in one transaction. A live claim, or one that wins a race
/// for the unique index, comes back as `AlreadyClaimed`.
pub fn claim(
    tx: &Transaction,
    group: &str,
    owner: &CiClaimOwner,
    lease_until: Option<&str>,
    note: Option<&str>,
    now: &str,
) -> Result<CiClaimResult, String> {
    check(&owner.kind, OWNER_KINDS, "owner kind")?;
    let group =
        survivor(tx, group)?.ok_or_else(|| "The group no longer exists; reload it".to_string())?;
    if let Some(claim) = live_claim(tx, &group)? {
        return Ok(CiClaimResult::AlreadyClaimed { claim });
    }
    insert_claim(tx, &group, owner, lease_until, note, now)
}

fn insert_claim(
    tx: &Transaction,
    group: &str,
    owner: &CiClaimOwner,
    lease_until: Option<&str>,
    note: Option<&str>,
    now: &str,
) -> Result<CiClaimResult, String> {
    let id = new_id();
    let inserted = tx.execute(
        "INSERT INTO claims (id, group_id, owner_kind, owner_ref, owner_label, host_id, claimed_at, \
         lease_until, state, note, revision, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, 1, ?7)",
        params![
            id,
            group,
            owner.kind,
            owner.owner_ref,
            owner.label,
            owner.host_id,
            now,
            lease_until,
            note
        ],
    );
    match inserted {
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            let claim = live_claim(tx, group)?.ok_or_else(|| db(error))?;
            return Ok(CiClaimResult::AlreadyClaimed { claim });
        }
        Err(error) => return Err(db(error)),
    }
    let who = owner.label.as_deref().unwrap_or(&owner.owner_ref);
    add_event(tx, &id, "claimed", Some(who), now)?;
    Ok(CiClaimResult::Claimed {
        claim: claim_by_id(tx, &id)?,
    })
}

/// Compare-and-set a claim. Errors start with `conflict:` when someone else
/// changed it first.
pub fn update_claim(
    tx: &Transaction,
    claim_id: &str,
    expected_revision: i64,
    patch: &CiClaimPatch,
    event: Option<(&str, Option<&str>)>,
    now: &str,
) -> Result<CiClaim, String> {
    let current = claim_by_id(tx, claim_id)?;
    if current.revision != expected_revision {
        return Err("conflict: the claim changed; reload it".to_string());
    }
    if let Some(state) = &patch.state {
        check(state, CLAIM_STATES, "claim state")?;
    }
    if let Some((kind, _)) = event {
        check(kind, CLAIM_EVENTS, "claim event")?;
    }
    let mut update = Assignments::default();
    if let Some(owner_ref) = &patch.owner_ref {
        update.set("owner_ref", Some(owner_ref));
    }
    if let Some(label) = &patch.owner_label {
        update.set("owner_label", Some(label));
    }
    if let Some(state) = &patch.state {
        update.set("state", Some(state));
    }
    if let Some(lease_until) = &patch.lease_until {
        update.set("lease_until", lease_until.as_deref());
    }
    if let Some(note) = &patch.note {
        update.set("note", note.as_deref());
    }
    match update.apply(tx, "claims", claim_id, now) {
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err("conflict: the group already has another owner".to_string());
        }
        Err(error) => return Err(db(error)),
    }
    if let Some((kind, detail)) = event {
        add_event(tx, claim_id, kind, detail, now)?;
    }
    claim_by_id(tx, claim_id)
}

/// Append to a claim's log without changing the claim. Returns its group's scope.
pub fn claim_event(
    tx: &Transaction,
    claim_id: &str,
    kind: &str,
    detail: Option<&str>,
    now: &str,
) -> Result<String, String> {
    check(kind, CLAIM_EVENTS, "claim event")?;
    let claim = claim_by_id(tx, claim_id)?;
    add_event(tx, claim_id, kind, detail, now)?;
    group_scope(tx, &claim.group_id)
}

fn add_event(
    tx: &Transaction,
    claim_id: &str,
    kind: &str,
    detail: Option<&str>,
    now: &str,
) -> Result<(), String> {
    tx.execute(
        "INSERT INTO claim_events (claim_id, at, kind, detail) VALUES (?1, ?2, ?3, ?4)",
        params![claim_id, now, kind, detail],
    )
    .map(|_| ())
    .map_err(db)
}

fn live_claim(conn: &Connection, group: &str) -> Result<Option<CiClaim>, String> {
    conn.query_row(
        &format!(
            "SELECT {CLAIM_SELECT} FROM claims c WHERE c.group_id = ?1 AND c.state IN ({LIVE})"
        ),
        [group],
        claim_from_row,
    )
    .optional()
    .map_err(db)
}

fn claim_by_id(conn: &Connection, id: &str) -> Result<CiClaim, String> {
    conn.query_row(
        &format!("SELECT {CLAIM_SELECT} FROM claims c WHERE c.id = ?1"),
        [id],
        claim_from_row,
    )
    .optional()
    .map_err(db)?
    .ok_or_else(|| "The claim no longer exists; reload it".to_string())
}

pub fn count_usage(
    conn: &Connection,
    day: &str,
    account: &str,
    reads: u32,
    log_bytes: u64,
    skipped: u32,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO usage (day, account, reads, log_bytes, skipped) VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(day, account) DO UPDATE SET reads = reads + excluded.reads, \
         log_bytes = log_bytes + excluded.log_bytes, skipped = skipped + excluded.skipped",
        params![day, account, reads, log_bytes, skipped],
    )
    .map(|_| ())
    .map_err(db)
}

pub fn set_branch_watch(tx: &Transaction, watches: &[CiBranchWatch]) -> Result<(), String> {
    for watch in watches {
        tx.execute(
            "INSERT INTO branch_watch (scope, workflow_path, last_failed_run, last_passed_run, checked_at) \
             VALUES (?1, ?2, ?3, ?4, ?5) \
             ON CONFLICT(scope, workflow_path) DO UPDATE SET last_failed_run = excluded.last_failed_run, \
             last_passed_run = excluded.last_passed_run, checked_at = excluded.checked_at",
            params![
                watch.scope,
                watch.workflow_path,
                watch.last_failed_run,
                watch.last_passed_run,
                watch.checked_at
            ],
        )
        .map_err(db)?;
    }
    Ok(())
}

pub struct RetentionPolicy<'a> {
    pub active_scopes: &'a [String],
    pub retention_days: u32,
    pub max_per_scope: u32,
    pub inactive_grace_days: u32,
}

/// Expire history. Groups someone is working on keep their newest
/// occurrence; decisions are never expired. Returns the report and the
/// scopes that changed.
pub fn retention(
    tx: &Transaction,
    policy: &RetentionPolicy,
    now: &str,
) -> Result<(CiRetentionReport, Vec<String>), String> {
    let now = DateTime::parse_from_rfc3339(now)
        .map_err(|e| format!("Bad timestamp {now}: {e}"))?
        .with_timezone(&Utc);
    let before = |days: u32| {
        (now - Duration::days(i64::from(days))).to_rfc3339_opts(SecondsFormat::Millis, true)
    };
    let protected = list_arg(&protected_occurrences(tx)?);
    let active = list_arg(policy.active_scopes);
    let mut scopes = BTreeSet::new();
    let mut report = CiRetentionReport::default();

    report.deleted_occurrences += delete_returning_scope(
        tx,
        "DELETE FROM occurrences WHERE observed_at < ?1 \
         AND id NOT IN (SELECT value FROM json_each(?2)) RETURNING scope",
        params![before(policy.retention_days), protected],
        &mut scopes,
    )?;
    let crowded: Vec<String> = rows(
        tx,
        "SELECT scope FROM occurrences GROUP BY scope HAVING COUNT(*) > ?1",
        [policy.max_per_scope],
        |row| row.get(0),
    )?;
    for scope in &crowded {
        report.deleted_occurrences += delete_returning_scope(
            tx,
            "DELETE FROM occurrences WHERE id IN (SELECT id FROM occurrences WHERE scope = ?1 \
               ORDER BY observed_at DESC, id DESC LIMIT -1 OFFSET ?2) \
             AND id NOT IN (SELECT value FROM json_each(?3)) RETURNING scope",
            params![scope, policy.max_per_scope, protected],
            &mut scopes,
        )?;
    }
    report.deleted_occurrences += delete_returning_scope(
        tx,
        "DELETE FROM occurrences WHERE scope NOT IN (SELECT value FROM json_each(?1)) \
         AND observed_at < ?2 AND id NOT IN (SELECT value FROM json_each(?3)) RETURNING scope",
        params![active, before(policy.inactive_grace_days), protected],
        &mut scopes,
    )?;

    // Children before parents: fingerprints, then the groups they pointed at.
    delete_returning_scope(
        tx,
        &format!(
            "DELETE FROM fingerprints WHERE NOT EXISTS ( \
               SELECT 1 FROM signals s JOIN occurrences o ON o.id = s.occurrence_id \
               WHERE s.fingerprint_version = fingerprints.version \
                 AND s.fingerprint = fingerprints.fingerprint AND o.scope = fingerprints.scope) \
             AND NOT EXISTS (SELECT 1 FROM claims c \
               WHERE c.group_id = fingerprints.group_id AND c.state IN ({LIVE})) \
             AND NOT EXISTS (SELECT 1 FROM decisions d \
               WHERE d.scope = fingerprints.scope AND d.version = fingerprints.version \
                 AND fingerprints.fingerprint IN (d.fingerprint_a, d.fingerprint_b)) \
             RETURNING scope"
        ),
        [],
        &mut scopes,
    )?;
    report.deleted_groups += delete_returning_scope(
        tx,
        &format!(
            "DELETE FROM groups WHERE status != 'merged' \
             AND NOT EXISTS (SELECT 1 FROM fingerprints f WHERE f.group_id = groups.id) \
             AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.group_id = groups.id AND c.state IN ({LIVE})) \
             AND NOT (fix_pr IS NOT NULL AND fix_merged_at IS NULL) AND tracking_issue IS NULL \
             RETURNING scope"
        ),
        [],
        &mut scopes,
    )?;
    loop {
        let tombstones = delete_returning_scope(
            tx,
            "DELETE FROM groups WHERE status = 'merged' \
             AND (merged_into IS NULL OR merged_into NOT IN (SELECT id FROM groups)) RETURNING scope",
            [],
            &mut scopes,
        )?;
        if tombstones == 0 {
            break;
        }
        report.deleted_groups += tombstones;
    }
    tx.execute(
        "DELETE FROM candidates WHERE group_a NOT IN (SELECT id FROM groups) \
         OR group_b NOT IN (SELECT id FROM groups)",
        [],
    )
    .map_err(db)?;
    Ok((report, scopes.into_iter().collect()))
}

/// The newest occurrence of every group with a live claim, a fix waiting to
/// merge or a tracking issue: the group shows "older history expired"
/// instead of disappearing.
fn protected_occurrences(conn: &Connection) -> Result<Vec<String>, String> {
    let groups: Vec<String> = rows(
        conn,
        &format!(
            "SELECT g.id FROM groups g WHERE g.status != 'merged' AND ( \
               EXISTS (SELECT 1 FROM claims c WHERE c.group_id = g.id AND c.state IN ({LIVE})) \
               OR (g.fix_pr IS NOT NULL AND g.fix_merged_at IS NULL) \
               OR g.tracking_issue IS NOT NULL)"
        ),
        [],
        |row| row.get(0),
    )?;
    let newest = format!(
        "SELECT o.id FROM fingerprints f {MEMBERS} WHERE f.group_id = ?1 \
         ORDER BY {FAILED_AT} DESC, o.id DESC LIMIT 1"
    );
    let mut protected = Vec::new();
    for group in groups {
        protected.extend(rows(conn, &newest, [&group], |row| {
            row.get::<_, String>(0)
        })?);
    }
    Ok(protected)
}

fn delete_returning_scope<P: rusqlite::Params>(
    tx: &Transaction,
    sql: &str,
    params: P,
    scopes: &mut BTreeSet<String>,
) -> Result<u32, String> {
    let deleted: Vec<String> = rows(tx, sql, params, |row| row.get(0))?;
    let count = deleted.len() as u32;
    scopes.extend(deleted);
    Ok(count)
}

/// Delete everything but usage, and decisions when asked to keep them.
/// Returns the scopes that had data.
pub fn clear(tx: &Transaction, keep_decisions: bool) -> Result<Vec<String>, String> {
    let scopes: Vec<String> = rows(
        tx,
        "SELECT scope FROM occurrences UNION SELECT scope FROM groups \
         UNION SELECT scope FROM decisions UNION SELECT scope FROM branch_watch ORDER BY 1",
        [],
        |row| row.get(0),
    )?;
    tx.execute_batch(
        "DELETE FROM claim_events; DELETE FROM claims; DELETE FROM candidates; \
         DELETE FROM outcomes; DELETE FROM signals; DELETE FROM occurrences; \
         DELETE FROM fingerprints; DELETE FROM groups; DELETE FROM branch_watch;",
    )
    .map_err(db)?;
    if !keep_decisions {
        tx.execute("DELETE FROM decisions", []).map_err(db)?;
    }
    Ok(scopes)
}

// ----------------------------------------------------------------- reads

fn occurrence_from_row(row: &Row) -> rusqlite::Result<CiOccurrence> {
    Ok(CiOccurrence {
        id: row.get(0)?,
        scope: row.get(1)?,
        source: row.get(2)?,
        pr_number: row.get(3)?,
        pr_head_sha: row.get(4)?,
        tested_sha: row.get(5)?,
        head_branch: row.get(6)?,
        event: row.get(7)?,
        workflow_id: row.get(8)?,
        workflow_path: row.get(9)?,
        workflow_name: row.get(10)?,
        run_id: row.get(11)?,
        run_attempt: row.get(12)?,
        run_number: row.get(13)?,
        job_id: row.get(14)?,
        job_name: row.get(15)?,
        matrix: json_column(row, 16)?,
        check_suite_id: row.get(17)?,
        app_slug: row.get(18)?,
        html_url: row.get(19)?,
        conclusion: row.get(20)?,
        failed_step: row.get(21)?,
        failed_step_number: row.get(22)?,
        runner_name: row.get(23)?,
        runner_group: row.get(24)?,
        runner_labels: json_column(row, 25)?,
        started_at: row.get(26)?,
        completed_at: row.get(27)?,
        observed_at: row.get(28)?,
        evidence_state: row.get(29)?,
        evidence_reason: row.get(30)?,
        bytes_read: row.get(31)?,
        total_bytes: row.get(32)?,
        truncated: row.get(33)?,
        evidence_attempts: row.get(34)?,
        retry_at: row.get(35)?,
    })
}

fn claim_from_row(row: &Row) -> rusqlite::Result<CiClaim> {
    Ok(CiClaim {
        id: row.get(0)?,
        group_id: row.get(1)?,
        owner_kind: row.get(2)?,
        owner_ref: row.get(3)?,
        owner_label: row.get(4)?,
        host_id: row.get(5)?,
        claimed_at: row.get(6)?,
        lease_until: row.get(7)?,
        state: row.get(8)?,
        note: row.get(9)?,
        revision: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn decision_from_row(row: &Row) -> rusqlite::Result<CiDecision> {
    Ok(CiDecision {
        id: row.get(0)?,
        scope: row.get(1)?,
        kind: row.get(2)?,
        version: row.get(3)?,
        fingerprint_a: row.get(4)?,
        fingerprint_b: row.get(5)?,
        note: row.get(6)?,
        ambiguous: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn summary_from_row(row: &Row) -> rusqlite::Result<CiGroupSummary> {
    Ok(CiGroupSummary {
        id: row.get(0)?,
        scope: row.get(1)?,
        title: row.get(2)?,
        classification: row.get(3)?,
        status: row.get(4)?,
        merged_into: row.get(5)?,
        fix_pr: row.get(6)?,
        fix_merged_at: row.get(7)?,
        tracking_issue: row.get(8)?,
        first_observed_at: row.get(9)?,
        last_observed_at: row.get(10)?,
        revision: row.get(11)?,
        pr_numbers: Vec::new(),
        default_branch_runs: Vec::new(),
        pr_job_ids: Vec::new(),
        occurrence_count: 0,
        run_count: 0,
        passed_on_retry: 0,
        catalog_ids: Vec::new(),
        failed_steps: Vec::new(),
        workflow_names: Vec::new(),
        max_tier: "medium".to_string(),
        candidate_count: 0,
        claim: None,
    })
}

enum Selection<'a> {
    /// Every group of these scopes that isn't merged.
    Scopes(&'a [String]),
    Ids(&'a [String]),
}

impl Selection<'_> {
    /// A conjunction over `groups g` with the list as `?1`.
    fn filter(&self) -> &'static str {
        match self {
            Self::Scopes(_) => {
                "g.scope IN (SELECT value FROM json_each(?1)) AND g.status != 'merged'"
            }
            Self::Ids(_) => "g.id IN (SELECT value FROM json_each(?1))",
        }
    }

    fn arg(&self) -> String {
        match self {
            Self::Scopes(items) | Self::Ids(items) => list_arg(items),
        }
    }
}

/// One occurrence a group owns, with what the summary counts.
struct Member {
    group_id: String,
    occurrence_id: String,
    source: String,
    pr_number: Option<u32>,
    run_id: Option<u64>,
    run_number: Option<u64>,
    job_id: Option<u64>,
    failed_step: Option<String>,
    workflow_name: Option<String>,
    high: bool,
    outcome: Option<String>,
}

#[derive(Default)]
struct Tally {
    pr_numbers: BTreeSet<u32>,
    default_branch_runs: BTreeSet<u64>,
    pr_job_ids: BTreeSet<u64>,
    occurrences: u32,
    /// Run ids, or the occurrence id for an occurrence without a run.
    runs: HashSet<String>,
    passed_on_retry: u32,
    catalog_ids: BTreeSet<String>,
    failed_steps: BTreeSet<String>,
    workflow_names: BTreeSet<String>,
    high: bool,
}

impl Tally {
    fn add(&mut self, member: Member) {
        self.occurrences += 1;
        match member.source.as_str() {
            "pull_request" => {
                self.pr_numbers.extend(member.pr_number);
                self.pr_job_ids.extend(member.job_id);
            }
            "default_branch" => self
                .default_branch_runs
                .extend(member.run_number.or(member.run_id)),
            _ => {}
        }
        self.runs.insert(match member.run_id {
            Some(run) => format!("run:{run}"),
            None => format!("occurrence:{}", member.occurrence_id),
        });
        if member.outcome.as_deref() == Some("passed_on_retry") {
            self.passed_on_retry += 1;
        }
        self.failed_steps.extend(member.failed_step);
        self.workflow_names.extend(member.workflow_name);
        self.high |= member.high;
    }

    fn apply(self, summary: &mut CiGroupSummary) {
        summary.pr_numbers = self.pr_numbers.into_iter().collect();
        summary.default_branch_runs = self.default_branch_runs.into_iter().collect();
        summary.pr_job_ids = self.pr_job_ids.into_iter().collect();
        summary.occurrence_count = self.occurrences;
        summary.run_count = self.runs.len() as u32;
        summary.passed_on_retry = self.passed_on_retry;
        summary.catalog_ids = self.catalog_ids.into_iter().collect();
        summary.failed_steps = self.failed_steps.into_iter().collect();
        summary.workflow_names = self.workflow_names.into_iter().collect();
        summary.max_tier = if self.high { "high" } else { "medium" }.to_string();
    }
}

/// Summaries of the selected groups, most recently seen first. A handful of
/// set queries rather than one per group, so a scope with hundreds of groups
/// loads in one pass.
fn summaries(conn: &Connection, selection: Selection) -> Result<Vec<CiGroupSummary>, String> {
    let filter = selection.filter();
    let arg = selection.arg();
    let mut groups = rows(
        conn,
        &format!(
            "SELECT {GROUP_SELECT} FROM groups g WHERE {filter} \
             ORDER BY g.last_observed_at DESC, g.id"
        ),
        [&arg],
        summary_from_row,
    )?;
    if groups.is_empty() {
        return Ok(groups);
    }
    let position: HashMap<String, usize> = groups
        .iter()
        .enumerate()
        .map(|(index, group)| (group.id.clone(), index))
        .collect();
    let mut tallies: Vec<Tally> = groups.iter().map(|_| Tally::default()).collect();

    let members = rows(
        conn,
        &format!(
            "SELECT f.group_id, o.id, o.source, o.pr_number, o.run_id, o.run_number, o.job_id, \
               o.failed_step, o.workflow_name, MAX(s.tier = 'high'), oc.kind \
             FROM groups g JOIN fingerprints f ON f.group_id = g.id {MEMBERS} \
             LEFT JOIN outcomes oc ON oc.occurrence_id = o.id \
             WHERE {filter} GROUP BY f.group_id, o.id"
        ),
        [&arg],
        |row| {
            Ok(Member {
                group_id: row.get(0)?,
                occurrence_id: row.get(1)?,
                source: row.get(2)?,
                pr_number: row.get(3)?,
                run_id: row.get(4)?,
                run_number: row.get(5)?,
                job_id: row.get(6)?,
                failed_step: row.get(7)?,
                workflow_name: row.get(8)?,
                high: row.get(9)?,
                outcome: row.get(10)?,
            })
        },
    )?;
    for member in members {
        if let Some(&index) = position.get(&member.group_id) {
            tallies[index].add(member);
        }
    }

    let catalog: Vec<(String, String)> = rows(
        conn,
        &format!(
            "SELECT f.group_id, CAST(json_extract(f.facets, '$.catalogId') AS TEXT) \
             FROM groups g JOIN fingerprints f ON f.group_id = g.id \
             WHERE {filter} AND json_extract(f.facets, '$.catalogId') IS NOT NULL"
        ),
        [&arg],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    for (group, catalog_id) in catalog {
        if let Some(&index) = position.get(&group) {
            tallies[index].catalog_ids.insert(catalog_id);
        }
    }

    let candidates: Vec<(String, u32)> = rows(
        conn,
        &format!(
            "SELECT g.id, COUNT(*) FROM groups g \
             JOIN candidates c ON c.dismissed = 0 AND (c.group_a = g.id OR c.group_b = g.id) \
             WHERE {filter} GROUP BY g.id"
        ),
        [&arg],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    for (group, count) in candidates {
        if let Some(&index) = position.get(&group) {
            groups[index].candidate_count = count;
        }
    }

    let claims = rows(
        conn,
        &format!(
            "SELECT {CLAIM_SELECT} FROM groups g \
             JOIN claims c ON c.group_id = g.id AND c.state IN ({LIVE}) WHERE {filter}"
        ),
        [&arg],
        claim_from_row,
    )?;
    for claim in claims {
        if let Some(&index) = position.get(&claim.group_id) {
            groups[index].claim = Some(claim);
        }
    }

    for (group, tally) in groups.iter_mut().zip(tallies) {
        tally.apply(group);
    }
    Ok(groups)
}

fn group_summary(conn: &Connection, id: &str) -> Result<CiGroupSummary, String> {
    summaries(conn, Selection::Ids(&[id.to_string()]))?
        .pop()
        .ok_or_else(|| "The group no longer exists; reload it".to_string())
}

/// Occurrences with their signals and outcomes, in the order of `ids`.
fn occurrence_details(
    conn: &Connection,
    ids: &[String],
) -> Result<Vec<CiOccurrenceDetail>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let arg = list_arg(ids);
    let mut details: HashMap<String, CiOccurrenceDetail> = rows(
        conn,
        &format!(
            "SELECT {OCCURRENCE_SELECT} FROM occurrences o \
             WHERE o.id IN (SELECT value FROM json_each(?1))"
        ),
        [&arg],
        occurrence_from_row,
    )?
    .into_iter()
    .map(|occurrence| {
        (
            occurrence.id.clone(),
            CiOccurrenceDetail {
                occurrence,
                signals: Vec::new(),
                outcome: None,
            },
        )
    })
    .collect();

    let signals = rows(
        conn,
        "SELECT s.occurrence_id, s.ordinal, s.signal, s.fingerprint_version, s.fingerprint, s.tier, \
           f.group_id \
         FROM signals s JOIN occurrences o ON o.id = s.occurrence_id \
         LEFT JOIN fingerprints f ON f.scope = o.scope AND f.version = s.fingerprint_version \
           AND f.fingerprint = s.fingerprint \
         WHERE s.occurrence_id IN (SELECT value FROM json_each(?1)) \
         ORDER BY s.occurrence_id, s.ordinal",
        [&arg],
        |row| {
            Ok(CiSignalRow {
                occurrence_id: row.get(0)?,
                ordinal: row.get(1)?,
                signal: json_column(row, 2)?,
                fingerprint_version: row.get(3)?,
                fingerprint: row.get(4)?,
                tier: row.get(5)?,
                group_id: row.get(6)?,
            })
        },
    )?;
    for signal in signals {
        if let Some(detail) = details.get_mut(&signal.occurrence_id) {
            detail.signals.push(signal);
        }
    }

    let outcomes = rows(
        conn,
        "SELECT occurrence_id, kind, by_job_id, observed_at FROM outcomes \
         WHERE occurrence_id IN (SELECT value FROM json_each(?1))",
        [&arg],
        |row| {
            Ok(CiOutcome {
                occurrence_id: row.get(0)?,
                kind: row.get(1)?,
                by_job_id: row.get(2)?,
                observed_at: row.get(3)?,
            })
        },
    )?;
    for outcome in outcomes {
        if let Some(detail) = details.get_mut(&outcome.occurrence_id) {
            detail.outcome = Some(outcome);
        }
    }

    Ok(ids.iter().filter_map(|id| details.remove(id)).collect())
}

pub fn known_occurrences(
    conn: &Connection,
    scope: &str,
    since: &str,
) -> Result<Vec<CiKnownOccurrence>, String> {
    rows(
        conn,
        "SELECT o.id, o.evidence_state, o.evidence_attempts, o.retry_at, o.conclusion, o.pr_number, \
           o.run_id, o.job_name, o.tested_sha, o.observed_at, oc.kind \
         FROM occurrences o LEFT JOIN outcomes oc ON oc.occurrence_id = o.id \
         WHERE o.scope = ?1 AND o.observed_at >= ?2 ORDER BY o.observed_at, o.id",
        params![scope, since],
        |row| {
            Ok(CiKnownOccurrence {
                id: row.get(0)?,
                evidence_state: row.get(1)?,
                evidence_attempts: row.get(2)?,
                retry_at: row.get(3)?,
                conclusion: row.get(4)?,
                pr_number: row.get(5)?,
                run_id: row.get(6)?,
                job_name: row.get(7)?,
                tested_sha: row.get(8)?,
                observed_at: row.get(9)?,
                outcome: row.get(10)?,
            })
        },
    )
}

pub fn load_scope(conn: &Connection, scopes: &[String]) -> Result<CiScopeSnapshot, String> {
    let arg = list_arg(scopes);
    let index = rows(
        conn,
        "SELECT scope, version, fingerprint, group_id, facets, first_seen_at FROM fingerprints \
         WHERE scope IN (SELECT value FROM json_each(?1)) ORDER BY scope, version, fingerprint",
        [&arg],
        |row| {
            Ok(CiFingerprintRow {
                scope: row.get(0)?,
                version: row.get(1)?,
                fingerprint: row.get(2)?,
                group_id: row.get(3)?,
                facets: json_column(row, 4)?,
                first_seen_at: row.get(5)?,
            })
        },
    )?;
    let links = rows(
        conn,
        &format!(
            "SELECT {DECISION_SELECT} FROM decisions d WHERE d.kind = 'must_link' \
             AND d.scope IN (SELECT value FROM json_each(?1)) ORDER BY d.created_at, d.id"
        ),
        [&arg],
        decision_from_row,
    )?;
    let groups = summaries(conn, Selection::Scopes(scopes))?;
    Ok(CiScopeSnapshot {
        index,
        links,
        groups,
    })
}

pub fn load_pr(conn: &Connection, scope: &str, pr_number: u32) -> Result<CiPrFailures, String> {
    let ids: Vec<String> = rows(
        conn,
        "SELECT id FROM occurrences WHERE scope = ?1 AND pr_number = ?2 \
         ORDER BY observed_at DESC, id DESC",
        params![scope, pr_number],
        |row| row.get(0),
    )?;
    let occurrences = occurrence_details(conn, &ids)?;
    let mut group_ids = BTreeSet::new();
    for signal in occurrences.iter().flat_map(|detail| &detail.signals) {
        if let Some(group) = &signal.group_id {
            group_ids.extend(survivor(conn, group)?);
        }
    }
    let group_ids: Vec<String> = group_ids.into_iter().collect();
    let groups = summaries(conn, Selection::Ids(&group_ids))?;
    Ok(CiPrFailures {
        occurrences,
        groups,
    })
}

pub fn load_group(conn: &Connection, group_id: &str) -> Result<CiGroupDetail, String> {
    let id = survivor(conn, group_id)?
        .ok_or_else(|| "The group no longer exists; reload it".to_string())?;
    let summary = group_summary(conn, &id)?;

    let ids: Vec<String> = rows(
        conn,
        &format!(
            "SELECT DISTINCT o.id, {FAILED_AT} FROM fingerprints f {MEMBERS} WHERE f.group_id = ?1 \
             ORDER BY {FAILED_AT} DESC, o.id DESC LIMIT {GROUP_OCCURRENCE_LIMIT}"
        ),
        [&id],
        |row| row.get(0),
    )?;
    let occurrences = occurrence_details(conn, &ids)?;

    let pairs: Vec<(String, Vec<String>, Option<String>)> = rows(
        conn,
        "SELECT CASE WHEN group_a = ?1 THEN group_b ELSE group_a END, reasons, agent_verdict \
         FROM candidates WHERE dismissed = 0 AND (group_a = ?1 OR group_b = ?1) \
         ORDER BY created_at, group_a, group_b",
        [&id],
        |row| Ok((row.get(0)?, json_column(row, 1)?, row.get(2)?)),
    )?;
    let others: Vec<String> = pairs.iter().map(|(other, _, _)| other.clone()).collect();
    let mut other_summaries: HashMap<String, CiGroupSummary> =
        summaries(conn, Selection::Ids(&others))?
            .into_iter()
            .map(|group| (group.id.clone(), group))
            .collect();
    let candidates = pairs
        .into_iter()
        .filter_map(|(other, reasons, verdict)| {
            let group = other_summaries.remove(&other)?;
            let agent_verdict =
                verdict.map(|text| serde_json::from_str(&text).unwrap_or(Value::String(text)));
            Some(CiCandidateView {
                group,
                reasons,
                agent_verdict,
            })
        })
        .collect();

    let decisions = rows(
        conn,
        &format!(
            "SELECT {DECISION_SELECT} FROM decisions d WHERE d.scope = ?2 AND EXISTS ( \
               SELECT 1 FROM fingerprints f WHERE f.group_id = ?1 AND f.scope = d.scope \
                 AND f.version = d.version AND f.fingerprint IN (d.fingerprint_a, d.fingerprint_b)) \
             ORDER BY d.created_at DESC, d.id"
        ),
        params![id, summary.scope],
        decision_from_row,
    )?;
    let claim_events = rows(
        conn,
        "SELECT e.claim_id, e.at, e.kind, e.detail FROM claim_events e \
         JOIN claims c ON c.id = e.claim_id WHERE c.group_id = ?1 ORDER BY e.at DESC, e.id DESC",
        [&id],
        |row| {
            Ok(CiClaimEvent {
                claim_id: row.get(0)?,
                at: row.get(1)?,
                kind: row.get(2)?,
                detail: row.get(3)?,
            })
        },
    )?;

    Ok(CiGroupDetail {
        summary,
        occurrences,
        candidates,
        decisions,
        claim_events,
    })
}

pub fn usage(conn: &Connection, day: &str, account: &str) -> Result<CiUsage, String> {
    let counts: Option<(u32, u64, u32)> = conn
        .query_row(
            "SELECT reads, log_bytes, skipped FROM usage WHERE day = ?1 AND account = ?2",
            params![day, account],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(db)?;
    let (reads, log_bytes, skipped) = counts.unwrap_or_default();
    Ok(CiUsage {
        day: day.to_string(),
        account: account.to_string(),
        reads,
        log_bytes,
        skipped,
    })
}

pub fn branch_watch(conn: &Connection, scope: &str) -> Result<Vec<CiBranchWatch>, String> {
    rows(
        conn,
        "SELECT scope, workflow_path, last_failed_run, last_passed_run, checked_at FROM branch_watch \
         WHERE scope = ?1 ORDER BY workflow_path",
        [scope],
        |row| {
            Ok(CiBranchWatch {
                scope: row.get(0)?,
                workflow_path: row.get(1)?,
                last_failed_run: row.get(2)?,
                last_passed_run: row.get(3)?,
                checked_at: row.get(4)?,
            })
        },
    )
}

pub fn store_info(conn: &Connection, path: String, read_only: bool) -> Result<CiStoreInfo, String> {
    let count = |sql: &str| -> Result<u32, String> {
        conn.query_row(sql, [], |row| row.get(0)).map_err(db)
    };
    Ok(CiStoreInfo {
        path,
        read_only,
        revision: revision(conn)?,
        occurrences: count("SELECT COUNT(*) FROM occurrences")?,
        groups: count("SELECT COUNT(*) FROM groups WHERE status != 'merged'")?,
        decisions: count("SELECT COUNT(*) FROM decisions")?,
    })
}

#[cfg(test)]
mod tests;
