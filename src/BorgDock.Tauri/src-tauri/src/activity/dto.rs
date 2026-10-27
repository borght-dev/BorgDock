//! What crosses the Tauri boundary. Field names are camelCase on the wire,
//! matching `src/services/activity/types.ts`. Every time is the
//! `Date.toISOString()` form (`2026-10-27T10:00:00.000Z`), so text order is
//! time order. JSON blobs (baselines, entry payloads) travel as strings:
//! TypeScript owns their shape.

use crate::ci_failures::store::dto::present;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Asks for a source's generation. A new source starts at 1; a changed
/// config key or `reset` starts the next generation with no baseline.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivitySourceRequest {
    pub source_id: String,
    /// `t3`, `gh`, `deploy`, `ci`, `ado` or `workstreams`.
    pub kind: String,
    pub label: String,
    pub config_key: String,
    pub reset: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivitySourceState {
    pub source_id: String,
    pub kind: String,
    pub label: String,
    pub config_key: String,
    pub generation: i64,
    /// The revision of the last accepted commit in this generation.
    pub revision: Option<i64>,
    /// Null until the generation's first commit.
    pub baseline: Option<String>,
    pub seeded_at: Option<String>,
    pub committed_at: Option<String>,
    pub retired_at: Option<String>,
}

/// An entry as derivation produces it. The store owns read state and version.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntryInput {
    pub id: String,
    pub source_id: String,
    pub entity_key: String,
    pub category: String,
    /// `info`, `success`, `warning` or `error`.
    pub severity: String,
    pub needs_you: bool,
    /// `open`, `resolved` or `superseded`.
    pub status: String,
    pub resolved_by: Option<String>,
    pub source_at: Option<String>,
    pub observed_at: String,
    /// `live` or `catch-up`.
    pub coverage: String,
    pub summary: String,
    pub detail: Option<String>,
    /// JSON: `{ schema, entity, action, links }`.
    pub payload: String,
}

/// Later facts for an entry that exists. Absent fields stay; `detail: null`
/// clears the detail. `payload` replaces the whole payload, which is how a
/// new action arrives. Never touches read state.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityEnrichment {
    pub id: String,
    #[serde(default)]
    #[cfg_attr(test, specta(optional))]
    pub summary: Option<String>,
    #[serde(default, deserialize_with = "present")]
    #[cfg_attr(test, specta(type = Option<String>, optional))]
    pub detail: Option<Option<String>>,
    #[serde(default)]
    #[cfg_attr(test, specta(optional))]
    pub payload: Option<String>,
}

/// Closes open entries that existed before the commit: those in `ids`, and
/// those of `entityKey` whose category is in `categories` (an empty list
/// matches none).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityResolution {
    pub ids: Vec<String>,
    pub entity_key: Option<String>,
    pub categories: Vec<String>,
    /// `resolved` or `superseded`.
    pub status: String,
    pub resolved_by: String,
}

/// Unread entries of an entity that happened at or before `before` become
/// read with `reason`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivitySeenMark {
    pub entity_key: String,
    pub before: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityOutboxRequest {
    pub entry_id: String,
    /// `popup` or `push`.
    pub channel: String,
}

/// One observation of one source, applied in one transaction.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityCommit {
    pub source_id: String,
    pub generation: i64,
    pub revision: i64,
    /// Write the baseline and add no entries.
    pub seed: bool,
    pub baseline: String,
    pub entries: Vec<ActivityEntryInput>,
    pub enrichments: Vec<ActivityEnrichment>,
    pub resolutions: Vec<ActivityResolution>,
    pub seen: Vec<ActivitySeenMark>,
    /// Only rows for entries this commit inserted, and that are still unread,
    /// are kept.
    pub outbox: Vec<ActivityOutboxRequest>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "kebab-case")]
pub enum ActivityCapacity {
    Ok,
    /// Old unread entries that don't need you were folded into a roll-up.
    RolledUp,
    /// Entries that need you fill the journal; others are not added.
    Full,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityCommitResult {
    pub accepted: bool,
    pub reason: Option<String>,
    /// Ids this commit added; a replay adds none.
    pub inserted: Vec<String>,
    /// The store revision after the commit.
    pub revision: i64,
    pub capacity: ActivityCapacity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "kebab-case")]
pub enum ActivityFilter {
    /// Unread, needs you, and still open.
    NeedsYou,
    Unread,
    All,
}

/// Where the previous page ended.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityCursor {
    pub observed_at: String,
    pub id: String,
}

/// Empty lists don't filter.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityListQuery {
    pub filter: ActivityFilter,
    pub categories: Vec<String>,
    pub source_ids: Vec<String>,
    pub entity_keys: Vec<String>,
    /// Matches summary and detail, case-insensitively.
    pub search: Option<String>,
    /// Only for `all`; the other filters show unread entries.
    pub include_dismissed: bool,
    pub limit: u32,
    pub before: Option<ActivityCursor>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntryRow {
    pub id: String,
    pub source_id: String,
    pub entity_key: String,
    pub category: String,
    pub severity: String,
    pub needs_you: bool,
    pub status: String,
    pub resolved_by: Option<String>,
    pub source_at: Option<String>,
    pub observed_at: String,
    pub coverage: String,
    pub summary: String,
    pub detail: Option<String>,
    pub payload: String,
    /// `unread`, `read` or `dismissed`.
    pub read: String,
    pub read_reason: Option<String>,
    pub read_at: Option<String>,
    pub version: i64,
}

/// Newest first, by `observedAt` then id.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityPage {
    pub entries: Vec<ActivityEntryRow>,
    /// Entries matching the query, ignoring `limit` and `before`.
    pub total: i64,
    pub revision: i64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityCount {
    pub unread: i64,
    pub needs_you: i64,
}

/// `needsYou` counts unread, open entries that need you.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityCounts {
    pub unread: i64,
    pub needs_you: i64,
    pub by_category: BTreeMap<String, ActivityCount>,
    pub by_source: BTreeMap<String, ActivityCount>,
    pub revision: i64,
}

/// Sets read state. `ids` are set exactly; `entityKeys` change only their
/// unread entries that happened at or before `before` (any time when null).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityMarkRequest {
    pub ids: Vec<String>,
    pub entity_keys: Vec<String>,
    pub before: Option<String>,
    /// `unread`, `read` or `dismissed`.
    pub read: String,
    /// Defaults to `user`; ignored for `unread`.
    pub reason: Option<String>,
}

/// An entry's read state, as `activity_mark` found it and `activity_restore`
/// puts it back.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityReadState {
    pub id: String,
    pub read: String,
    pub read_reason: Option<String>,
    pub read_at: Option<String>,
    pub version: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityMarkResult {
    /// The entries that changed, before the change: the undo for this mark.
    pub previous: Vec<ActivityReadState>,
    pub changed: i64,
    pub revision: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityOutboxItem {
    pub entry: ActivityEntryRow,
    /// `popup`, `push` or `push-clear`.
    pub channel: String,
    pub attempts: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "kebab-case")]
pub enum ActivityOutboxOutcome {
    Sent,
    Skipped,
    /// Try again later, with exponential backoff up to six hours.
    Retry,
    Dropped,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityOutboxAck {
    pub entry_id: String,
    pub channel: String,
    pub outcome: ActivityOutboxOutcome,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityStoreInfo {
    pub path: String,
    /// Written by a newer BorgDock: reads work, ingestion stops.
    pub read_only: bool,
    /// Where an unusable file was moved this session.
    pub recovered_from: Option<String>,
    pub schema_version: i64,
    pub entries: i64,
    pub unread: i64,
    pub needs_you: i64,
    pub capacity: ActivityCapacity,
    /// Unread entries the journal holds before it folds old ones.
    pub unread_capacity: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_enrichment_tells_absent_detail_from_null() {
        let cleared: ActivityEnrichment =
            serde_json::from_str(r#"{"id": "a", "detail": null}"#).unwrap();
        assert_eq!(cleared.detail, Some(None));
        let kept: ActivityEnrichment =
            serde_json::from_str(r#"{"id": "a", "summary": "s"}"#).unwrap();
        assert_eq!(kept.detail, None);
        assert_eq!(kept.summary.as_deref(), Some("s"));
    }

    #[test]
    fn closed_sets_use_the_typescript_spelling() {
        let filter: ActivityFilter = serde_json::from_str(r#""needs-you""#).unwrap();
        assert_eq!(filter, ActivityFilter::NeedsYou);
        assert_eq!(
            serde_json::to_string(&ActivityCapacity::RolledUp).unwrap(),
            r#""rolled-up""#
        );
    }
}
