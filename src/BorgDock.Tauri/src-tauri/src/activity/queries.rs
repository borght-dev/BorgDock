//! The journal's reads and writes. A write runs in one immediate
//! transaction; the store revision moves only when a window would see a
//! difference.

use super::dto::*;
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row, Transaction};
use rusqlite::{types::Value, TransactionBehavior};
use std::collections::{BTreeMap, HashSet};

pub const UNREAD_CAPACITY: i64 = 5000;
/// Folding goes below the capacity, so the next commits don't fold again.
const FOLD_TARGET: i64 = 4500;
const RETENTION_DAYS: i64 = 90;
const OUTBOX_RETENTION_HOURS: i64 = 12;
const MAX_BACKOFF_SECONDS: i64 = 6 * 60 * 60;
const ROLLUP_CATEGORY: &str = "activity.rollup";
/// SQLite's bound-parameter limit is far above this; it keeps statements small.
const CHUNK: usize = 400;

const SEVERITIES: &[&str] = &["info", "success", "warning", "error"];
const STATUSES: &[&str] = &["open", "resolved", "superseded"];
const COVERAGES: &[&str] = &["live", "catch-up"];
const READ_STATES: &[&str] = &["unread", "read", "dismissed"];
const READ_REASONS: &[&str] = &[
    "user",
    "action",
    "viewed",
    "seen-in-t3",
    "bulk",
    "rolled-up",
];
const CHANNELS: &[&str] = &["popup", "push", "push-clear"];

pub fn now() -> String {
    stamp(Utc::now())
}

fn stamp(time: DateTime<Utc>) -> String {
    time.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn shifted(now: &str, by: Duration) -> String {
    DateTime::parse_from_rfc3339(now)
        .map(|time| stamp(time.with_timezone(&Utc) + by))
        .unwrap_or_else(|_| now.to_string())
}

fn db(error: rusqlite::Error) -> String {
    format!("Activity store: {error}")
}

fn check(value: &str, allowed: &[&str], what: &str) -> Result<(), String> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!("Unknown {what}: {value}"))
    }
}

fn placeholders(count: usize) -> String {
    vec!["?"; count].join(",")
}

/// Run `f` in one immediate transaction, so a second writer waits instead
/// of failing on a stale snapshot. The store revision moves when `f`
/// reports a visible change.
pub fn write<T>(
    conn: &mut Connection,
    f: impl FnOnce(&Transaction) -> Result<(T, bool), String>,
) -> Result<(T, Option<i64>), String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db)?;
    let (value, changed) = f(&tx)?;
    let revision = if changed {
        Some(crate::sqlite_store::bump_revision(&tx).map_err(db)?)
    } else {
        None
    };
    tx.commit().map_err(db)?;
    Ok((value, revision))
}

pub fn revision(conn: &Connection) -> Result<i64, String> {
    crate::sqlite_store::revision(conn).map_err(db)
}

// ---------------------------------------------------------------- sources

const SOURCE_COLUMNS: &str = "source_id, kind, label, config_key, generation, revision, baseline, \
     seeded_at, committed_at, retired_at";

fn source_from(row: &Row) -> rusqlite::Result<ActivitySourceState> {
    Ok(ActivitySourceState {
        source_id: row.get(0)?,
        kind: row.get(1)?,
        label: row.get(2)?,
        config_key: row.get(3)?,
        generation: row.get(4)?,
        revision: row.get(5)?,
        baseline: row.get(6)?,
        seeded_at: row.get(7)?,
        committed_at: row.get(8)?,
        retired_at: row.get(9)?,
    })
}

fn source(conn: &Connection, source_id: &str) -> Result<Option<ActivitySourceState>, String> {
    conn.query_row(
        &format!("SELECT {SOURCE_COLUMNS} FROM sources WHERE source_id = ?1"),
        [source_id],
        source_from,
    )
    .optional()
    .map_err(db)
}

pub fn sources(conn: &Connection) -> Result<Vec<ActivitySourceState>, String> {
    let mut statement = conn
        .prepare(&format!(
            "SELECT {SOURCE_COLUMNS} FROM sources ORDER BY source_id"
        ))
        .map_err(db)?;
    let rows = statement.query_map([], source_from).map_err(db)?;
    rows.collect::<rusqlite::Result<_>>().map_err(db)
}

/// The source's generation. A changed config key, or `reset`, starts the
/// next one with no baseline, so the source seeds again.
pub fn open_source(
    tx: &Transaction,
    request: &ActivitySourceRequest,
) -> Result<ActivitySourceState, String> {
    check(
        &request.kind,
        &["t3", "gh", "deploy", "ci", "ado", "workstreams"],
        "source kind",
    )?;
    match source(tx, &request.source_id)? {
        None => {
            tx.execute(
                "INSERT INTO sources (source_id, kind, label, config_key, generation) \
                 VALUES (?1, ?2, ?3, ?4, 1)",
                params![
                    request.source_id,
                    request.kind,
                    request.label,
                    request.config_key
                ],
            )
            .map_err(db)?;
        }
        Some(existing) if existing.config_key == request.config_key && !request.reset => {
            tx.execute(
                "UPDATE sources SET label = ?2, retired_at = NULL WHERE source_id = ?1",
                params![request.source_id, request.label],
            )
            .map_err(db)?;
        }
        Some(_) => {
            tx.execute(
                "UPDATE sources SET kind = ?2, label = ?3, config_key = ?4, \
                 generation = generation + 1, revision = NULL, baseline = NULL, \
                 seeded_at = NULL, committed_at = NULL, retired_at = NULL WHERE source_id = ?1",
                params![
                    request.source_id,
                    request.kind,
                    request.label,
                    request.config_key
                ],
            )
            .map_err(db)?;
        }
    }
    source(tx, &request.source_id)?.ok_or_else(|| "Activity store: source vanished".to_string())
}

pub fn retire_source(tx: &Transaction, source_id: &str, now: &str) -> Result<bool, String> {
    let changed = tx
        .execute(
            "UPDATE sources SET retired_at = ?2 WHERE source_id = ?1 AND retired_at IS NULL",
            params![source_id, now],
        )
        .map_err(db)?;
    Ok(changed > 0)
}

// ---------------------------------------------------------------- commit

fn rejected(reason: &str, revision: i64) -> ActivityCommitResult {
    ActivityCommitResult {
        accepted: false,
        reason: Some(reason.to_string()),
        inserted: Vec::new(),
        revision,
        capacity: ActivityCapacity::Ok,
    }
}

fn validate_entry(entry: &ActivityEntryInput, source_id: &str) -> Result<(), String> {
    if entry.source_id != source_id {
        return Err(format!(
            "Entry {} belongs to {}, not {source_id}",
            entry.id, entry.source_id
        ));
    }
    check(&entry.severity, SEVERITIES, "severity")?;
    check(&entry.status, STATUSES, "status")?;
    check(&entry.coverage, COVERAGES, "coverage")
}

/// Apply one observation: resolutions, new entries, enrichments, seen
/// marks, outbox rows, capacity and the baseline, all or nothing. A commit
/// from an older generation, or at or below the stored revision, writes
/// nothing. Returns whether a window would see a difference.
pub fn commit(
    tx: &Transaction,
    commit: &ActivityCommit,
    now: &str,
) -> Result<(ActivityCommitResult, bool), String> {
    let store_revision = revision(tx)?;
    let Some(stored) = source(tx, &commit.source_id)? else {
        return Ok((rejected("unknown source", store_revision), false));
    };
    if stored.generation != commit.generation {
        return Ok((rejected("stale generation", store_revision), false));
    }
    if stored
        .revision
        .is_some_and(|stored| commit.revision <= stored)
    {
        return Ok((rejected("stale revision", store_revision), false));
    }

    let mut visible = false;
    let mut closed = Vec::new();
    for resolution in &commit.resolutions {
        closed.extend(resolve(tx, &commit.source_id, resolution)?);
    }
    visible |= !closed.is_empty();

    let mut inserted = Vec::new();
    let mut full = false;
    if !commit.seed {
        full = needs_you_unread(tx)? >= UNREAD_CAPACITY;
        for entry in &commit.entries {
            validate_entry(entry, &commit.source_id)?;
            if full && !entry.needs_you {
                continue;
            }
            if insert(tx, entry)? {
                inserted.push(entry.id.clone());
            }
        }
    }
    visible |= !inserted.is_empty();

    for enrichment in &commit.enrichments {
        visible |= enrich(tx, &commit.source_id, enrichment)?;
    }

    let mut seen = Vec::new();
    for mark in &commit.seen {
        check(&mark.reason, &["seen-in-t3", "viewed"], "seen reason")?;
        seen.extend(mark_seen(tx, &commit.source_id, mark, now)?);
    }
    visible |= !seen.is_empty();
    closed.extend(seen);
    enqueue_push_clear(tx, &closed, now)?;

    let fresh: HashSet<&str> = inserted.iter().map(String::as_str).collect();
    for request in &commit.outbox {
        check(&request.channel, &["popup", "push"], "outbox channel")?;
        if fresh.contains(request.entry_id.as_str()) && is_unread(tx, &request.entry_id)? {
            tx.execute(
                "INSERT OR IGNORE INTO outbox (entry_id, channel, state, attempts, next_at, created_at) \
                 VALUES (?1, ?2, 'pending', 0, ?3, ?3)",
                params![request.entry_id, request.channel, now],
            )
            .map_err(db)?;
        }
    }

    let folded = fold(tx, now)?;
    visible |= folded;
    full |= needs_you_unread(tx)? >= UNREAD_CAPACITY;
    let capacity = if full {
        ActivityCapacity::Full
    } else if folded {
        ActivityCapacity::RolledUp
    } else {
        ActivityCapacity::Ok
    };

    tx.execute(
        "UPDATE sources SET revision = ?2, baseline = ?3, committed_at = ?4, \
         seeded_at = COALESCE(seeded_at, ?4) WHERE source_id = ?1",
        params![commit.source_id, commit.revision, commit.baseline, now],
    )
    .map_err(db)?;

    Ok((
        ActivityCommitResult {
            accepted: true,
            reason: None,
            inserted,
            revision: store_revision,
            capacity,
        },
        visible,
    ))
}

fn insert(tx: &Transaction, entry: &ActivityEntryInput) -> Result<bool, String> {
    let added = tx
        .execute(
            "INSERT OR IGNORE INTO entries (id, source_id, entity_key, category, severity, needs_you, \
             status, resolved_by, source_at, observed_at, coverage, summary, detail, payload, \
             read, read_reason, read_at, version) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'unread', NULL, NULL, 1)",
            params![
                entry.id,
                entry.source_id,
                entry.entity_key,
                entry.category,
                entry.severity,
                entry.needs_you,
                entry.status,
                entry.resolved_by,
                entry.source_at,
                entry.observed_at,
                entry.coverage,
                entry.summary,
                entry.detail,
                entry.payload,
            ],
        )
        .map_err(db)?;
    Ok(added == 1)
}

/// Close open entries of this source; returns the ids that changed.
fn resolve(
    tx: &Transaction,
    source_id: &str,
    resolution: &ActivityResolution,
) -> Result<Vec<String>, String> {
    check(
        &resolution.status,
        &["resolved", "superseded"],
        "resolution",
    )?;
    let mut changed = Vec::new();
    for ids in resolution.ids.chunks(CHUNK) {
        let sql = format!(
            "UPDATE entries SET status = ?1, resolved_by = ?2, version = version + 1 \
             WHERE source_id = ?3 AND status = 'open' AND id IN ({}) RETURNING id",
            placeholders(ids.len())
        );
        let mut values: Vec<Value> = vec![
            resolution.status.clone().into(),
            resolution.resolved_by.clone().into(),
            source_id.to_string().into(),
        ];
        values.extend(ids.iter().cloned().map(Value::from));
        changed.extend(returning_ids(tx, &sql, values)?);
    }
    if let Some(entity_key) = &resolution.entity_key {
        for categories in resolution.categories.chunks(CHUNK) {
            let sql = format!(
                "UPDATE entries SET status = ?1, resolved_by = ?2, version = version + 1 \
                 WHERE source_id = ?3 AND status = 'open' AND entity_key = ?4 \
                 AND category IN ({}) RETURNING id",
                placeholders(categories.len())
            );
            let mut values: Vec<Value> = vec![
                resolution.status.clone().into(),
                resolution.resolved_by.clone().into(),
                source_id.to_string().into(),
                entity_key.clone().into(),
            ];
            values.extend(categories.iter().cloned().map(Value::from));
            changed.extend(returning_ids(tx, &sql, values)?);
        }
    }
    Ok(changed)
}

fn returning_ids(tx: &Transaction, sql: &str, values: Vec<Value>) -> Result<Vec<String>, String> {
    let mut statement = tx.prepare(sql).map_err(db)?;
    let rows = statement
        .query_map(params_from_iter(values), |row| row.get::<_, String>(0))
        .map_err(db)?;
    rows.collect::<rusqlite::Result<_>>().map_err(db)
}

fn enrich(
    tx: &Transaction,
    source_id: &str,
    enrichment: &ActivityEnrichment,
) -> Result<bool, String> {
    if enrichment.summary.is_none() && enrichment.detail.is_none() && enrichment.action.is_none() {
        return Ok(false);
    }
    if let Some(action) = &enrichment.action {
        serde_json::from_str::<serde_json::Value>(action)
            .map_err(|e| format!("Activity store: the action is not JSON: {e}"))?;
    }
    let (set_detail, detail) = match &enrichment.detail {
        Some(detail) => (true, detail.clone()),
        None => (false, None),
    };
    let changed = tx
        .execute(
            "WITH next AS (SELECT COALESCE(?3, summary) AS summary,                     CASE WHEN ?4 THEN ?5 ELSE detail END AS detail,                     CASE WHEN ?6 IS NULL THEN payload ELSE json_set(payload, '$.action', json(?6)) END AS payload                   FROM entries WHERE id = ?1)              UPDATE entries SET summary = next.summary, detail = next.detail,              payload = next.payload, version = version + 1 FROM next              WHERE id = ?1 AND source_id = ?2              AND (entries.summary IS NOT next.summary OR entries.detail IS NOT next.detail                   OR json(entries.payload) IS NOT json(next.payload))",
            params![
                enrichment.id,
                source_id,
                enrichment.summary,
                set_detail,
                detail,
                enrichment.action
            ],
        )
        .map_err(db)?;
    Ok(changed > 0)
}

fn mark_seen(
    tx: &Transaction,
    source_id: &str,
    mark: &ActivitySeenMark,
    now: &str,
) -> Result<Vec<String>, String> {
    returning_ids(
        tx,
        "UPDATE entries SET read = 'read', read_reason = ?4, read_at = ?5, version = version + 1 \
         WHERE source_id = ?1 AND entity_key = ?2 AND read = 'unread' \
         AND COALESCE(source_at, observed_at) <= ?3 RETURNING id",
        vec![
            source_id.to_string().into(),
            mark.entity_key.clone().into(),
            mark.before.clone().into(),
            mark.reason.clone().into(),
            now.to_string().into(),
        ],
    )
}

fn is_unread(conn: &Connection, id: &str) -> Result<bool, String> {
    let read: Option<String> = conn
        .query_row("SELECT read FROM entries WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .optional()
        .map_err(db)?;
    Ok(read.as_deref() == Some("unread"))
}

fn needs_you_unread(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM entries WHERE read = 'unread' AND needs_you = 1 AND status = 'open'",
        [],
        |row| row.get(0),
    )
    .map_err(db)
}

/// A phone that got a push for an entry I have since handled gets a
/// message that withdraws it.
fn enqueue_push_clear(tx: &Transaction, ids: &[String], now: &str) -> Result<(), String> {
    for ids in ids.chunks(CHUNK) {
        let sql = format!(
            "INSERT OR IGNORE INTO outbox (entry_id, channel, state, attempts, next_at, created_at) \
             SELECT entry_id, 'push-clear', 'pending', 0, ?1, ?1 FROM outbox \
             WHERE channel = 'push' AND state = 'sent' AND entry_id IN ({})",
            placeholders(ids.len())
        );
        let mut values: Vec<Value> = vec![now.to_string().into()];
        values.extend(ids.iter().cloned().map(Value::from));
        tx.execute(&sql, params_from_iter(values)).map_err(db)?;
    }
    Ok(())
}

/// Past the capacity, the oldest unread entries that don't need me fold
/// into one roll-up entry per source. Unread entries that need me are
/// never folded.
fn fold(tx: &Transaction, now: &str) -> Result<bool, String> {
    let unread: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM entries WHERE read = 'unread'",
            [],
            |row| row.get(0),
        )
        .map_err(db)?;
    if unread <= UNREAD_CAPACITY {
        return Ok(false);
    }
    let excess = unread - FOLD_TARGET;
    let victims: Vec<(String, String)> = {
        let mut statement = tx
            .prepare(
                "SELECT id, source_id FROM entries WHERE read = 'unread' \
                 AND NOT (needs_you = 1 AND status = 'open') AND category <> ?1 \
                 ORDER BY observed_at ASC, id ASC LIMIT ?2",
            )
            .map_err(db)?;
        let rows = statement
            .query_map(params![ROLLUP_CATEGORY, excess], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .map_err(db)?;
        rows.collect::<rusqlite::Result<_>>().map_err(db)?
    };
    if victims.is_empty() {
        return Ok(false);
    }
    let mut per_source: BTreeMap<String, i64> = BTreeMap::new();
    for (_, source_id) in &victims {
        *per_source.entry(source_id.clone()).or_default() += 1;
    }
    let ids: Vec<String> = victims.into_iter().map(|(id, _)| id).collect();
    for chunk in ids.chunks(CHUNK) {
        let sql = format!(
            "UPDATE entries SET read = 'read', read_reason = 'rolled-up', read_at = ?1, \
             version = version + 1 WHERE id IN ({})",
            placeholders(chunk.len())
        );
        let mut values: Vec<Value> = vec![now.to_string().into()];
        values.extend(chunk.iter().cloned().map(Value::from));
        tx.execute(&sql, params_from_iter(values)).map_err(db)?;
    }
    enqueue_push_clear(tx, &ids, now)?;
    for (source_id, count) in per_source {
        roll_up(tx, &source_id, count, now)?;
    }
    Ok(true)
}

fn rollup_id(source_id: &str) -> String {
    format!("{source_id}|rollup")
}

/// The roll-up keeps counting while it is unread; once read, it starts over.
fn roll_up(tx: &Transaction, source_id: &str, folded: i64, now: &str) -> Result<(), String> {
    let id = rollup_id(source_id);
    let previous: Option<(String, String)> = tx
        .query_row(
            "SELECT read, payload FROM entries WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db)?;
    let carried = previous
        .filter(|(read, _)| read == "unread")
        .and_then(|(_, payload)| serde_json::from_str::<serde_json::Value>(&payload).ok())
        .and_then(|payload| payload.get("rolledUp").and_then(serde_json::Value::as_i64))
        .unwrap_or(0);
    let total = carried + folded;
    let label: String = tx
        .query_row(
            "SELECT label FROM sources WHERE source_id = ?1",
            [source_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db)?
        .unwrap_or_else(|| source_id.to_string());
    let noun = if total == 1 { "update" } else { "updates" };
    let summary = format!("{total} older {noun} from {label}");
    let payload = serde_json::json!({
        "schema": 1,
        "entity": { "kind": "source", "key": format!("source:{source_id}"), "title": label, "url": null },
        "action": null,
        "links": { "itemIds": [], "prUrls": [], "workstreamIds": [], "ciGroupIds": [] },
        "rolledUp": total,
    })
    .to_string();
    tx.execute(
        "INSERT INTO entries (id, source_id, entity_key, category, severity, needs_you, status, \
         resolved_by, source_at, observed_at, coverage, summary, detail, payload, read, \
         read_reason, read_at, version) \
         VALUES (?1, ?2, ?3, ?4, 'info', 0, 'open', NULL, NULL, ?5, 'live', ?6, NULL, ?7, \
         'unread', NULL, NULL, 1) \
         ON CONFLICT(id) DO UPDATE SET observed_at = excluded.observed_at, \
         summary = excluded.summary, payload = excluded.payload, read = 'unread', \
         read_reason = NULL, read_at = NULL, status = 'open', version = version + 1",
        params![
            id,
            source_id,
            format!("source:{source_id}"),
            ROLLUP_CATEGORY,
            now,
            summary,
            payload
        ],
    )
    .map_err(db)?;
    Ok(())
}

pub fn capacity(conn: &Connection) -> Result<ActivityCapacity, String> {
    if needs_you_unread(conn)? >= UNREAD_CAPACITY {
        return Ok(ActivityCapacity::Full);
    }
    let rolled: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM entries WHERE category = ?1 AND read = 'unread'",
            [ROLLUP_CATEGORY],
            |row| row.get(0),
        )
        .map_err(db)?;
    Ok(if rolled > 0 {
        ActivityCapacity::RolledUp
    } else {
        ActivityCapacity::Ok
    })
}

// ---------------------------------------------------------------- reads

const ENTRY_COLUMNS: &str = "id, source_id, entity_key, category, severity, needs_you, status, \
     resolved_by, source_at, observed_at, coverage, summary, detail, payload, read, read_reason, \
     read_at, version";

fn entry_from(row: &Row) -> rusqlite::Result<ActivityEntryRow> {
    Ok(ActivityEntryRow {
        id: row.get(0)?,
        source_id: row.get(1)?,
        entity_key: row.get(2)?,
        category: row.get(3)?,
        severity: row.get(4)?,
        needs_you: row.get(5)?,
        status: row.get(6)?,
        resolved_by: row.get(7)?,
        source_at: row.get(8)?,
        observed_at: row.get(9)?,
        coverage: row.get(10)?,
        summary: row.get(11)?,
        detail: row.get(12)?,
        payload: row.get(13)?,
        read: row.get(14)?,
        read_reason: row.get(15)?,
        read_at: row.get(16)?,
        version: row.get(17)?,
    })
}

fn escape_like(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn push_in(clauses: &mut Vec<String>, values: &mut Vec<Value>, column: &str, list: &[String]) {
    if list.is_empty() {
        return;
    }
    clauses.push(format!("{column} IN ({})", placeholders(list.len())));
    values.extend(list.iter().cloned().map(Value::from));
}

pub fn list(conn: &Connection, query: &ActivityListQuery) -> Result<ActivityPage, String> {
    let mut clauses: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    match query.filter {
        ActivityFilter::NeedsYou => {
            clauses.push("read = 'unread' AND needs_you = 1 AND status = 'open'".into())
        }
        ActivityFilter::Unread => clauses.push("read = 'unread'".into()),
        ActivityFilter::All if !query.include_dismissed => {
            clauses.push("read <> 'dismissed'".into())
        }
        ActivityFilter::All => {}
    }
    push_in(&mut clauses, &mut values, "category", &query.categories);
    push_in(&mut clauses, &mut values, "source_id", &query.source_ids);
    push_in(&mut clauses, &mut values, "entity_key", &query.entity_keys);
    push_in(&mut clauses, &mut values, "id", &query.ids);
    if let Some(search) = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        clauses
            .push("(summary LIKE ? ESCAPE '\\' OR COALESCE(detail, '') LIKE ? ESCAPE '\\')".into());
        let pattern = format!("%{}%", escape_like(search));
        values.push(pattern.clone().into());
        values.push(pattern.into());
    }
    let filter = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };
    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM entries {filter}"),
            params_from_iter(values.clone()),
            |row| row.get(0),
        )
        .map_err(db)?;

    if let Some(before) = &query.before {
        clauses.push("(observed_at < ? OR (observed_at = ? AND id < ?))".into());
        values.push(before.observed_at.clone().into());
        values.push(before.observed_at.clone().into());
        values.push(before.id.clone().into());
    }
    let page_filter = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };
    values.push(Value::from(i64::from(query.limit.clamp(1, 1000))));
    let mut statement = conn
        .prepare(&format!(
            "SELECT {ENTRY_COLUMNS} FROM entries {page_filter} \
             ORDER BY observed_at DESC, id DESC LIMIT ?"
        ))
        .map_err(db)?;
    let rows = statement
        .query_map(params_from_iter(values), entry_from)
        .map_err(db)?;
    let entries = rows.collect::<rusqlite::Result<_>>().map_err(db)?;
    Ok(ActivityPage {
        entries,
        total,
        revision: revision(conn)?,
    })
}

pub fn counts(conn: &Connection) -> Result<ActivityCounts, String> {
    let mut statement = conn
        .prepare(
            "SELECT category, source_id, COUNT(*), \
             SUM(CASE WHEN needs_you = 1 AND status = 'open' THEN 1 ELSE 0 END) \
             FROM entries WHERE read = 'unread' GROUP BY category, source_id",
        )
        .map_err(db)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(db)?;
    let mut counts = ActivityCounts {
        revision: revision(conn)?,
        ..ActivityCounts::default()
    };
    for row in rows {
        let (category, source_id, unread, needs_you) = row.map_err(db)?;
        counts.unread += unread;
        counts.needs_you += needs_you;
        for count in [
            counts.by_category.entry(category).or_default(),
            counts.by_source.entry(source_id).or_default(),
        ] {
            count.unread += unread;
            count.needs_you += needs_you;
        }
    }
    Ok(counts)
}

// ---------------------------------------------------------------- read state

fn read_state_from(row: &Row) -> rusqlite::Result<ActivityReadState> {
    Ok(ActivityReadState {
        id: row.get(0)?,
        read: row.get(1)?,
        read_reason: row.get(2)?,
        read_at: row.get(3)?,
        version: row.get(4)?,
    })
}

fn read_states(
    tx: &Transaction,
    sql: &str,
    values: Vec<Value>,
) -> Result<Vec<ActivityReadState>, String> {
    let mut statement = tx.prepare(sql).map_err(db)?;
    let rows = statement
        .query_map(params_from_iter(values), read_state_from)
        .map_err(db)?;
    rows.collect::<rusqlite::Result<_>>().map_err(db)
}

/// Set read state, in one transaction however many entries it touches.
/// Returns the states it replaced, which is the undo.
pub fn mark(
    tx: &Transaction,
    request: &ActivityMarkRequest,
    now: &str,
) -> Result<ActivityMarkResult, String> {
    check(&request.read, READ_STATES, "read state")?;
    let unread = request.read == "unread";
    let reason = if unread {
        None
    } else {
        let reason = request.reason.clone().unwrap_or_else(|| "user".to_string());
        check(&reason, READ_REASONS, "read reason")?;
        Some(reason)
    };
    let read_at = (!unread).then(|| now.to_string());

    let mut previous = Vec::new();
    for ids in request.ids.chunks(CHUNK) {
        let mut values: Vec<Value> = vec![request.read.clone().into()];
        values.extend(ids.iter().cloned().map(Value::from));
        previous.extend(read_states(
            tx,
            &format!(
                "SELECT id, read, read_reason, read_at, version FROM entries \
                 WHERE read <> ?1 AND id IN ({})",
                placeholders(ids.len())
            ),
            values,
        )?);
    }
    if !unread {
        for keys in request.entity_keys.chunks(CHUNK) {
            let mut values: Vec<Value> = vec![request.before.clone().into()];
            values.extend(keys.iter().cloned().map(Value::from));
            previous.extend(read_states(
                tx,
                &format!(
                    "SELECT id, read, read_reason, read_at, version FROM entries \
                     WHERE read = 'unread' AND (?1 IS NULL OR COALESCE(source_at, observed_at) <= ?1) \
                     AND entity_key IN ({})",
                    placeholders(keys.len())
                ),
                values,
            )?);
        }
    }
    let mut seen = HashSet::new();
    previous.retain(|state| seen.insert(state.id.clone()));

    let ids: Vec<String> = previous.iter().map(|state| state.id.clone()).collect();
    for chunk in ids.chunks(CHUNK) {
        let mut values: Vec<Value> = vec![
            request.read.clone().into(),
            reason.clone().into(),
            read_at.clone().into(),
        ];
        values.extend(chunk.iter().cloned().map(Value::from));
        tx.execute(
            &format!(
                "UPDATE entries SET read = ?1, read_reason = ?2, read_at = ?3, \
                 version = version + 1 WHERE id IN ({})",
                placeholders(chunk.len())
            ),
            params_from_iter(values),
        )
        .map_err(db)?;
    }
    if !unread {
        enqueue_push_clear(tx, &ids, now)?;
    }
    Ok(ActivityMarkResult {
        changed: previous.len() as i64,
        previous,
        revision: 0,
    })
}

/// Put read states back exactly, as an undo.
pub fn restore(tx: &Transaction, states: &[ActivityReadState]) -> Result<i64, String> {
    let mut changed = 0;
    for state in states {
        check(&state.read, READ_STATES, "read state")?;
        if let Some(reason) = &state.read_reason {
            check(reason, READ_REASONS, "read reason")?;
        }
        changed += tx
            .execute(
                "UPDATE entries SET read = ?2, read_reason = ?3, read_at = ?4, \
                 version = version + 1 WHERE id = ?1",
                params![state.id, state.read, state.read_reason, state.read_at],
            )
            .map_err(db)? as i64;
    }
    Ok(changed)
}

// ---------------------------------------------------------------- outbox

pub fn outbox_take(
    conn: &Connection,
    channel: &str,
    limit: u32,
    now: &str,
) -> Result<Vec<ActivityOutboxItem>, String> {
    check(channel, CHANNELS, "outbox channel")?;
    let columns = ENTRY_COLUMNS
        .split(", ")
        .map(|column| format!("e.{}", column.trim()))
        .collect::<Vec<_>>()
        .join(", ");
    let mut statement = conn
        .prepare(&format!(
            "SELECT {columns}, o.channel, o.attempts, o.created_at FROM outbox o \
             JOIN entries e ON e.id = o.entry_id \
             WHERE o.channel = ?1 AND o.state = 'pending' AND o.next_at <= ?2 \
             ORDER BY o.created_at, o.entry_id LIMIT ?3"
        ))
        .map_err(db)?;
    let rows = statement
        .query_map(
            params![channel, now, i64::from(limit.clamp(1, 500))],
            |row| {
                Ok(ActivityOutboxItem {
                    entry: entry_from(row)?,
                    channel: row.get(18)?,
                    attempts: row.get(19)?,
                    created_at: row.get(20)?,
                })
            },
        )
        .map_err(db)?;
    rows.collect::<rusqlite::Result<_>>().map_err(db)
}

/// Seconds to wait before attempt `attempts + 1`: one minute, doubling, at
/// most six hours.
pub fn backoff_seconds(attempts: i64) -> i64 {
    let exponent = attempts.clamp(0, 20) as u32;
    60_i64
        .saturating_mul(2_i64.saturating_pow(exponent))
        .min(MAX_BACKOFF_SECONDS)
}

pub fn outbox_ack(tx: &Transaction, acks: &[ActivityOutboxAck], now: &str) -> Result<i64, String> {
    let mut changed = 0;
    for ack in acks {
        check(&ack.channel, CHANNELS, "outbox channel")?;
        changed += match ack.outcome {
            ActivityOutboxOutcome::Retry => {
                let attempts: Option<i64> = tx
                    .query_row(
                        "SELECT attempts FROM outbox WHERE entry_id = ?1 AND channel = ?2 \
                         AND state = 'pending'",
                        params![ack.entry_id, ack.channel],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(db)?;
                match attempts {
                    Some(attempts) => tx
                        .execute(
                            "UPDATE outbox SET attempts = attempts + 1, next_at = ?3 \
                             WHERE entry_id = ?1 AND channel = ?2",
                            params![
                                ack.entry_id,
                                ack.channel,
                                shifted(now, Duration::seconds(backoff_seconds(attempts)))
                            ],
                        )
                        .map_err(db)?,
                    None => 0,
                }
            }
            outcome => {
                let state = match outcome {
                    ActivityOutboxOutcome::Sent => "sent",
                    ActivityOutboxOutcome::Skipped => "skipped",
                    _ => "dropped",
                };
                tx.execute(
                    "UPDATE outbox SET state = ?3, next_at = ?4 \
                     WHERE entry_id = ?1 AND channel = ?2 AND state = 'pending'",
                    params![ack.entry_id, ack.channel, state, now],
                )
                .map_err(db)?
            }
        } as i64;
    }
    Ok(changed)
}

// ---------------------------------------------------------------- upkeep

/// Delete a source's entries, or every entry. Baselines stay, so the next
/// observation does not seed again.
pub fn clear(tx: &Transaction, source_id: Option<&str>) -> Result<i64, String> {
    let removed = match source_id {
        Some(source_id) => {
            tx.execute(
                "DELETE FROM outbox WHERE entry_id IN (SELECT id FROM entries WHERE source_id = ?1)",
                [source_id],
            )
            .map_err(db)?;
            tx.execute("DELETE FROM entries WHERE source_id = ?1", [source_id])
                .map_err(db)?
        }
        None => {
            tx.execute("DELETE FROM outbox", []).map_err(db)?;
            tx.execute("DELETE FROM entries", []).map_err(db)?
        }
    };
    Ok(removed as i64)
}

/// Read and dismissed entries go after 90 days; finished outbox rows after
/// 12 hours, and pending ones that old are dropped.
pub fn prune(tx: &Transaction, now: &str) -> Result<i64, String> {
    let entries_before = shifted(now, -Duration::days(RETENTION_DAYS));
    let outbox_before = shifted(now, -Duration::hours(OUTBOX_RETENTION_HOURS));
    tx.execute(
        "DELETE FROM outbox WHERE entry_id IN (SELECT id FROM entries \
         WHERE read IN ('read', 'dismissed') AND observed_at < ?1)",
        [&entries_before],
    )
    .map_err(db)?;
    let removed = tx
        .execute(
            "DELETE FROM entries WHERE read IN ('read', 'dismissed') AND observed_at < ?1",
            [&entries_before],
        )
        .map_err(db)?;
    tx.execute(
        "UPDATE outbox SET state = 'dropped', next_at = ?2 WHERE state = 'pending' AND created_at < ?1",
        params![outbox_before, now],
    )
    .map_err(db)?;
    tx.execute(
        "DELETE FROM outbox WHERE state <> 'pending' AND next_at < ?1",
        [&outbox_before],
    )
    .map_err(db)?;
    Ok(removed as i64)
}

pub fn export(conn: &Connection, path: &str, now: &str) -> Result<i64, String> {
    let mut statement = conn
        .prepare(&format!(
            "SELECT {ENTRY_COLUMNS} FROM entries ORDER BY observed_at DESC, id DESC"
        ))
        .map_err(db)?;
    let entries: Vec<ActivityEntryRow> = statement
        .query_map([], entry_from)
        .map_err(db)?
        .collect::<rusqlite::Result<_>>()
        .map_err(db)?;
    let count = entries.len() as i64;
    let document = serde_json::json!({
        "exportedAt": now,
        "sources": sources(conn)?,
        "entries": entries,
    });
    let text = serde_json::to_string_pretty(&document).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| format!("Could not write {path}: {e}"))?;
    Ok(count)
}

pub fn info(
    conn: &Connection,
    path: String,
    read_only: bool,
    recovered_from: Option<String>,
) -> Result<ActivityStoreInfo, String> {
    let (entries, unread, needs_you): (i64, i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(read = 'unread'), 0), \
             COALESCE(SUM(read = 'unread' AND needs_you = 1 AND status = 'open'), 0) FROM entries",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        // A newer schema may have moved things; the banner still needs an answer.
        .or_else(|error| {
            if read_only {
                Ok((0, 0, 0))
            } else {
                Err(db(error))
            }
        })?;
    let schema_version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(db)?;
    let capacity = match capacity(conn) {
        Err(_) if read_only => ActivityCapacity::Ok,
        other => other?,
    };
    Ok(ActivityStoreInfo {
        path,
        read_only,
        recovered_from,
        schema_version,
        entries,
        unread,
        needs_you,
        capacity,
        unread_capacity: UNREAD_CAPACITY,
    })
}
