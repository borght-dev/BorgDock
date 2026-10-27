use crate::ci_failures::signal::Signal;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

/// One failed GitHub job attempt. A rerun is a new occurrence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiOccurrence {
    pub id: String,
    pub scope: String,
    /// `pull_request` or `default_branch`.
    pub source: String,
    pub pr_number: Option<u32>,
    pub pr_head_sha: Option<String>,
    pub tested_sha: String,
    pub head_branch: Option<String>,
    pub event: Option<String>,
    pub workflow_id: Option<u64>,
    pub workflow_path: Option<String>,
    pub workflow_name: Option<String>,
    pub run_id: Option<u64>,
    pub run_attempt: Option<u32>,
    pub run_number: Option<u64>,
    pub job_id: Option<u64>,
    pub job_name: String,
    pub matrix: Vec<String>,
    pub check_suite_id: Option<u64>,
    pub app_slug: Option<String>,
    pub html_url: Option<String>,
    pub conclusion: String,
    pub failed_step: Option<String>,
    pub failed_step_number: Option<u32>,
    pub runner_name: Option<String>,
    pub runner_group: Option<String>,
    pub runner_labels: Vec<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub observed_at: String,
    /// `pending`, `ready`, `limited`, `unavailable` or `failed`.
    pub evidence_state: String,
    pub evidence_reason: Option<String>,
    pub bytes_read: Option<u64>,
    pub total_bytes: Option<u64>,
    pub truncated: bool,
    pub evidence_attempts: u32,
    pub retry_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiSignalRow {
    pub occurrence_id: String,
    pub ordinal: u32,
    pub signal: Signal,
    pub fingerprint_version: u32,
    pub fingerprint: String,
    /// `high`, `medium` or `low`.
    pub tier: String,
    /// Filled on reads; ignored on writes.
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiOutcome {
    pub occurrence_id: String,
    /// `passed_on_retry`, `passed_after_push` or `superseded`.
    pub kind: String,
    pub by_job_id: Option<u64>,
    pub observed_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiOccurrenceDetail {
    pub occurrence: CiOccurrence,
    pub signals: Vec<CiSignalRow>,
    pub outcome: Option<CiOutcome>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiFingerprintRow {
    pub scope: String,
    pub version: u32,
    pub fingerprint: String,
    pub group_id: String,
    /// Opaque to Rust except `catalogId`.
    pub facets: Value,
    pub first_seen_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiNewGroup {
    pub id: String,
    pub scope: String,
    pub title: String,
    pub first_observed_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiCandidateRow {
    pub group_a: String,
    pub group_b: String,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiClaim {
    pub id: String,
    pub group_id: String,
    /// `me`, `t3`, `terminal` or `github_issue`.
    pub owner_kind: String,
    pub owner_ref: String,
    pub owner_label: Option<String>,
    pub host_id: Option<String>,
    pub claimed_at: String,
    pub lease_until: Option<String>,
    /// `active`, `stale`, `launch_failed`, `released` or `resolved`.
    pub state: String,
    pub note: Option<String>,
    pub revision: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiClaimEvent {
    pub claim_id: String,
    pub at: String,
    pub kind: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiGroupSummary {
    pub id: String,
    pub scope: String,
    pub title: String,
    pub classification: Option<String>,
    /// `active`, `quiet`, `resolved` or `merged`.
    pub status: String,
    pub merged_into: Option<String>,
    pub fix_pr: Option<String>,
    pub fix_merged_at: Option<String>,
    pub tracking_issue: Option<String>,
    pub first_observed_at: String,
    pub last_observed_at: String,
    pub revision: i64,
    pub pr_numbers: Vec<u32>,
    /// Run numbers (run ids when GitHub gave none) of default-branch failures.
    pub default_branch_runs: Vec<u64>,
    /// Job ids (check run ids) of the group's PR failures, so a PR's current
    /// failed checks can be matched to the groups that hold them.
    pub pr_job_ids: Vec<u64>,
    pub occurrence_count: u32,
    pub run_count: u32,
    pub passed_on_retry: u32,
    pub catalog_ids: Vec<String>,
    pub failed_steps: Vec<String>,
    pub workflow_names: Vec<String>,
    pub max_tier: String,
    pub candidate_count: u32,
    pub claim: Option<CiClaim>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiDecision {
    pub id: String,
    pub scope: String,
    /// `must_link` or `cannot_link`.
    pub kind: String,
    pub version: u32,
    pub fingerprint_a: String,
    pub fingerprint_b: String,
    pub note: Option<String>,
    pub ambiguous: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiCandidateView {
    /// The other group.
    pub group: CiGroupSummary,
    pub reasons: Vec<String>,
    pub agent_verdict: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiGroupDetail {
    pub summary: CiGroupSummary,
    /// The newest 200.
    pub occurrences: Vec<CiOccurrenceDetail>,
    pub candidates: Vec<CiCandidateView>,
    pub decisions: Vec<CiDecision>,
    /// Newest first.
    pub claim_events: Vec<CiClaimEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiScopeSnapshot {
    pub index: Vec<CiFingerprintRow>,
    /// `must_link` decisions only.
    pub links: Vec<CiDecision>,
    /// Every group that isn't merged.
    pub groups: Vec<CiGroupSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiPrFailures {
    pub occurrences: Vec<CiOccurrenceDetail>,
    pub groups: Vec<CiGroupSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiKnownOccurrence {
    pub id: String,
    pub evidence_state: String,
    pub evidence_attempts: u32,
    pub retry_at: Option<String>,
    pub conclusion: String,
    pub pr_number: Option<u32>,
    pub run_id: Option<u64>,
    pub job_name: String,
    pub tested_sha: String,
    pub observed_at: String,
    pub outcome: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiUsage {
    pub day: String,
    pub account: String,
    pub reads: u32,
    pub log_bytes: u64,
    pub skipped: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiBranchWatch {
    pub scope: String,
    pub workflow_path: String,
    pub last_failed_run: Option<u64>,
    pub last_passed_run: Option<u64>,
    pub checked_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiRecordBatch {
    pub occurrences: Vec<CiOccurrence>,
    pub signals: Vec<CiSignalRow>,
    /// Occurrences whose stored signals are replaced by this batch's.
    pub replace_signals_for: Vec<String>,
    pub new_groups: Vec<CiNewGroup>,
    pub mappings: Vec<CiFingerprintRow>,
    pub candidates: Vec<CiCandidateRow>,
    pub outcomes: Vec<CiOutcome>,
}

/// Keeps "absent" and "null" apart in a patch: absent leaves the field
/// alone, null clears it.
pub(crate) fn present<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiGroupPatch {
    #[serde(default)]
    #[cfg_attr(test, specta(optional))]
    pub title: Option<String>,
    #[serde(default, deserialize_with = "present")]
    #[cfg_attr(test, specta(type = Option<String>, optional))]
    pub classification: Option<Option<String>>,
    #[serde(default)]
    #[cfg_attr(test, specta(optional))]
    pub status: Option<String>,
    #[serde(default, deserialize_with = "present")]
    #[cfg_attr(test, specta(type = Option<String>, optional))]
    pub fix_pr: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[cfg_attr(test, specta(type = Option<String>, optional))]
    pub fix_merged_at: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[cfg_attr(test, specta(type = Option<String>, optional))]
    pub tracking_issue: Option<Option<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiClaimOwner {
    /// `me`, `t3`, `terminal` or `github_issue`.
    pub kind: String,
    pub owner_ref: String,
    pub label: Option<String>,
    pub host_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiClaimPatch {
    #[serde(default)]
    #[cfg_attr(test, specta(optional))]
    pub owner_ref: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, specta(optional))]
    pub owner_label: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, specta(optional))]
    pub state: Option<String>,
    #[serde(default, deserialize_with = "present")]
    #[cfg_attr(test, specta(type = Option<String>, optional))]
    pub lease_until: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[cfg_attr(test, specta(type = Option<String>, optional))]
    pub note: Option<Option<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum CiClaimResult {
    Claimed {
        claim: CiClaim,
    },
    /// Someone else got there first; this is their live claim.
    AlreadyClaimed {
        claim: CiClaim,
    },
}

impl CiClaimResult {
    pub fn claim(&self) -> &CiClaim {
        match self {
            Self::Claimed { claim } | Self::AlreadyClaimed { claim } => claim,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiRetentionReport {
    pub deleted_occurrences: u32,
    pub deleted_groups: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiStoreInfo {
    pub path: String,
    pub read_only: bool,
    pub revision: i64,
    pub occurrences: u32,
    pub groups: u32,
    pub decisions: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_patch_tells_absent_from_null() {
        let patch: CiGroupPatch =
            serde_json::from_str(r#"{"classification": null, "fixPr": "o/r#12"}"#).unwrap();
        assert_eq!(patch.classification, Some(None));
        assert_eq!(patch.fix_pr, Some(Some("o/r#12".to_string())));
        assert_eq!(patch.tracking_issue, None);
        assert_eq!(patch.title, None);
    }
}
