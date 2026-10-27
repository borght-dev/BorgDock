use super::*;
use crate::ci_failures::signal::{Signal, SignalKind};
use crate::ci_failures::store::connection::{self, open_in_memory};
use serde_json::json;
use std::sync::{Arc, Barrier};

const SCOPE: &str = "github.com|me|o/r";
const OTHER_SCOPE: &str = "github.com|me|o/gone";

fn at(day: u32) -> String {
    format!("2026-10-{day:02}T10:00:00.000Z")
}

fn occurrence(id: &str, pr: Option<u32>, run_id: u64, attempt: u32, day: u32) -> CiOccurrence {
    CiOccurrence {
        id: id.to_string(),
        scope: SCOPE.to_string(),
        source: if pr.is_some() {
            "pull_request"
        } else {
            "default_branch"
        }
        .to_string(),
        pr_number: pr,
        pr_head_sha: pr.map(|_| "head".to_string()),
        tested_sha: "tested".to_string(),
        head_branch: None,
        event: None,
        workflow_id: Some(7),
        workflow_path: Some(".github/workflows/ci.yml".to_string()),
        workflow_name: Some("CI".to_string()),
        run_id: Some(run_id),
        run_attempt: Some(attempt),
        run_number: None,
        job_id: Some(run_id * 10 + u64::from(attempt)),
        job_name: "build".to_string(),
        matrix: vec!["ubuntu-latest".to_string()],
        check_suite_id: None,
        app_slug: Some("github-actions".to_string()),
        html_url: None,
        conclusion: "failure".to_string(),
        failed_step: Some("Build".to_string()),
        failed_step_number: Some(4),
        runner_name: None,
        runner_group: None,
        runner_labels: Vec::new(),
        started_at: None,
        completed_at: None,
        observed_at: at(day),
        evidence_state: "ready".to_string(),
        evidence_reason: None,
        bytes_read: Some(100),
        total_bytes: Some(100),
        truncated: false,
        evidence_attempts: 1,
        retry_at: None,
    }
}

fn signal(occurrence: &str, ordinal: u32, fingerprint: &str, tier: &str) -> CiSignalRow {
    CiSignalRow {
        occurrence_id: occurrence.to_string(),
        ordinal,
        signal: Signal::new(SignalKind::Test, "vitest", format!("{fingerprint} failed")),
        fingerprint_version: 1,
        fingerprint: fingerprint.to_string(),
        tier: tier.to_string(),
        group_id: None,
    }
}

fn mapping(fingerprint: &str, group: &str, catalog: Option<&str>, day: u32) -> CiFingerprintRow {
    CiFingerprintRow {
        scope: SCOPE.to_string(),
        version: 1,
        fingerprint: fingerprint.to_string(),
        group_id: group.to_string(),
        facets: json!({ "catalogId": catalog, "step": "build" }),
        first_seen_at: at(day),
    }
}

fn new_group(id: &str, day: u32) -> CiNewGroup {
    CiNewGroup {
        id: id.to_string(),
        scope: SCOPE.to_string(),
        title: format!("Group {id}"),
        first_observed_at: at(day),
    }
}

/// Group g1: PR 12 (a failure that passed on retry), PR 15 (two attempts
/// of one run) and a default-branch run, through fingerprints A and B.
fn fixture() -> CiRecordBatch {
    let mut on_master = occurrence("o4", None, 300, 1, 23);
    on_master.run_number = Some(41);
    CiRecordBatch {
        occurrences: vec![
            occurrence("o1", Some(12), 100, 1, 20),
            occurrence("o2", Some(15), 200, 1, 21),
            occurrence("o3", Some(15), 200, 2, 22),
            on_master,
        ],
        signals: vec![
            signal("o1", 0, "A", "high"),
            signal("o2", 0, "A", "high"),
            signal("o2", 1, "B", "medium"),
            signal("o3", 0, "A", "high"),
            signal("o4", 0, "A", "high"),
        ],
        replace_signals_for: Vec::new(),
        new_groups: vec![new_group("g1", 20)],
        mappings: vec![
            mapping("A", "g1", None, 20),
            mapping("B", "g1", Some("dns"), 21),
        ],
        candidates: Vec::new(),
        outcomes: vec![CiOutcome {
            occurrence_id: "o1".to_string(),
            kind: "passed_on_retry".to_string(),
            by_job_id: Some(1002),
            observed_at: at(20),
        }],
    }
}

/// Groups g2 (fingerprint C, medium) and g3 (D), suggested as related to g2.
fn more_groups() -> CiRecordBatch {
    CiRecordBatch {
        occurrences: vec![
            occurrence("o5", Some(20), 400, 1, 24),
            occurrence("o6", Some(21), 500, 1, 25),
        ],
        signals: vec![signal("o5", 0, "C", "medium"), signal("o6", 0, "D", "high")],
        new_groups: vec![new_group("g2", 24), new_group("g3", 25)],
        mappings: vec![mapping("C", "g2", None, 24), mapping("D", "g3", None, 25)],
        candidates: vec![
            CiCandidateRow {
                group_a: "g2".to_string(),
                group_b: "g1".to_string(),
                reasons: vec!["same test".to_string()],
            },
            CiCandidateRow {
                group_a: "g3".to_string(),
                group_b: "g2".to_string(),
                reasons: vec!["same step".to_string()],
            },
        ],
        ..Default::default()
    }
}

fn save(conn: &mut Connection, batch: &CiRecordBatch) -> i64 {
    write(conn, |tx| record(tx, batch, &at(26))).unwrap().1
}

fn seeded() -> Connection {
    let mut conn = open_in_memory();
    save(&mut conn, &fixture());
    save(&mut conn, &more_groups());
    conn
}

fn summary(conn: &Connection, id: &str) -> CiGroupSummary {
    group_summary(conn, id).unwrap()
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
        row.get(0)
    })
    .unwrap()
}

fn owner(who: &str) -> CiClaimOwner {
    CiClaimOwner {
        kind: "me".to_string(),
        owner_ref: who.to_string(),
        label: None,
        host_id: None,
    }
}

fn claim_for(conn: &mut Connection, group: &str, who: &str) -> CiClaimResult {
    write(conn, |tx| {
        claim(tx, group, &owner(who), None, None, &at(26))
    })
    .unwrap()
    .0
}

fn fingerprint_group(conn: &Connection, fingerprint: &str) -> String {
    conn.query_row(
        "SELECT group_id FROM fingerprints WHERE fingerprint = ?1",
        [fingerprint],
        |row| row.get(0),
    )
    .unwrap()
}

fn decisions(conn: &Connection, kind: &str) -> Vec<(String, String)> {
    rows(
        conn,
        "SELECT fingerprint_a, fingerprint_b FROM decisions WHERE kind = ?1 ORDER BY fingerprint_a, fingerprint_b",
        [kind],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .unwrap()
}

#[test]
fn a_summary_aggregates_the_groups_occurrences() {
    let mut conn = open_in_memory();
    let revision = save(&mut conn, &fixture());
    assert_eq!(revision, 1);

    let snapshot = load_scope(&conn, &[SCOPE.to_string()]).unwrap();
    assert_eq!(snapshot.index.len(), 2);
    assert!(snapshot.links.is_empty());
    assert_eq!(snapshot.groups.len(), 1);
    let group = &snapshot.groups[0];
    assert_eq!(group.id, "g1");
    assert_eq!(group.pr_numbers, vec![12, 15]);
    assert_eq!(group.default_branch_runs, vec![41]);
    // Only PR failures: the default branch's job is not a PR's check.
    assert_eq!(group.pr_job_ids, vec![1001, 2001, 2002]);
    assert_eq!(group.occurrence_count, 4);
    assert_eq!(group.run_count, 3);
    assert_eq!(group.passed_on_retry, 1);
    assert_eq!(group.catalog_ids, vec!["dns"]);
    assert_eq!(group.failed_steps, vec!["Build"]);
    assert_eq!(group.workflow_names, vec!["CI"]);
    assert_eq!(group.max_tier, "high");
    assert_eq!(group.first_observed_at, at(20));
    assert_eq!(group.last_observed_at, at(23));
    assert_eq!(group.claim, None);
}

#[test]
fn a_groups_span_follows_when_its_jobs_failed_not_when_they_were_read() {
    let mut conn = open_in_memory();
    let mut batch = fixture();
    for occurrence in &mut batch.occurrences {
        occurrence.observed_at = at(25);
    }
    batch.occurrences[0].completed_at = Some(at(18));
    batch.occurrences[3].completed_at = Some(at(19));
    batch.new_groups = vec![new_group("g1", 18)];
    save(&mut conn, &batch);

    let group = summary(&conn, "g1");
    assert_eq!(group.first_observed_at, at(18));
    assert_eq!(group.last_observed_at, at(25));
    let detail = load_group(&conn, "g1").unwrap();
    let order: Vec<&str> = detail
        .occurrences
        .iter()
        .map(|o| o.occurrence.id.as_str())
        .collect();
    assert_eq!(order.last(), Some(&"o1"));
}

#[test]
fn a_group_of_medium_signals_has_medium_tier_and_counts_candidates() {
    let conn = seeded();
    let g2 = summary(&conn, "g2");
    assert_eq!(g2.max_tier, "medium");
    assert_eq!(g2.candidate_count, 2);
    assert_eq!(summary(&conn, "g1").candidate_count, 1);
}

#[test]
fn recording_the_same_batch_twice_changes_no_counts() {
    let mut conn = open_in_memory();
    save(&mut conn, &fixture());
    let before = summary(&conn, "g1");
    let tables = [
        "occurrences",
        "signals",
        "outcomes",
        "groups",
        "fingerprints",
    ];
    let counts: Vec<i64> = tables.iter().map(|t| count(&conn, t)).collect();

    save(&mut conn, &fixture());

    let after = summary(&conn, "g1");
    assert_eq!(
        counts,
        tables.iter().map(|t| count(&conn, t)).collect::<Vec<_>>()
    );
    assert_eq!(
        CiGroupSummary {
            revision: before.revision,
            ..after.clone()
        },
        before
    );
    assert!(after.revision > before.revision);
}

#[test]
fn an_existing_fingerprint_never_moves_on_record() {
    let mut conn = seeded();
    let mut batch = CiRecordBatch {
        occurrences: vec![occurrence("o7", Some(30), 700, 1, 25)],
        signals: vec![signal("o7", 0, "A", "high")],
        mappings: vec![mapping("A", "g2", None, 25)],
        ..Default::default()
    };
    save(&mut conn, &batch);
    assert_eq!(fingerprint_group(&conn, "A"), "g1");
    assert_eq!(summary(&conn, "g1").pr_numbers, vec![12, 15, 30]);

    // A mapping to a merged group lands on the survivor.
    write(&mut conn, |tx| merge_groups(tx, "g3", "g2", None, &at(26))).unwrap();
    batch.mappings = vec![mapping("E", "g2", None, 25)];
    batch.signals.push(signal("o7", 1, "E", "high"));
    save(&mut conn, &batch);
    assert_eq!(fingerprint_group(&conn, "E"), "g3");
}

#[test]
fn a_read_fills_in_what_the_pending_record_did_not_know() {
    let mut conn = open_in_memory();
    let mut pending = occurrence("o1", Some(12), 100, 1, 20);
    pending.evidence_state = "pending".to_string();
    pending.tested_sha = "pr-head".to_string();
    save(
        &mut conn,
        &CiRecordBatch {
            occurrences: vec![pending.clone()],
            ..Default::default()
        },
    );
    let mut read = pending.clone();
    read.evidence_state = "ready".to_string();
    read.tested_sha = "merge-commit".to_string();
    read.html_url = Some("https://github.com/o/r/actions/runs/100/job/1001".to_string());
    read.head_branch = Some("feature".to_string());
    read.started_at = Some(at(20));
    save(
        &mut conn,
        &CiRecordBatch {
            occurrences: vec![read.clone()],
            ..Default::default()
        },
    );
    // Seeing it pending again in a later poll keeps what the read found.
    save(
        &mut conn,
        &CiRecordBatch {
            occurrences: vec![pending],
            ..Default::default()
        },
    );
    let stored = &load_pr(&conn, SCOPE, 12).unwrap().occurrences[0].occurrence;
    assert_eq!(stored.tested_sha, "merge-commit");
    assert_eq!(stored.html_url, read.html_url);
    assert_eq!(stored.head_branch, read.head_branch);
    assert_eq!(stored.started_at, read.started_at);
}

#[test]
fn a_rerecord_updates_evidence_but_never_identity() {
    let mut conn = open_in_memory();
    save(&mut conn, &fixture());
    let mut again = occurrence("o1", Some(99), 100, 1, 25);
    again.job_name = "renamed".to_string();
    again.evidence_state = "limited".to_string();
    again.truncated = true;
    again.failed_step = None;
    again.retry_at = Some(at(27));
    save(
        &mut conn,
        &CiRecordBatch {
            occurrences: vec![again],
            ..Default::default()
        },
    );
    let stored = &load_pr(&conn, SCOPE, 12).unwrap().occurrences[0].occurrence;
    assert_eq!(stored.job_name, "build");
    assert_eq!(stored.observed_at, at(20));
    assert_eq!(stored.evidence_state, "limited");
    assert!(stored.truncated);
    assert_eq!(stored.retry_at, Some(at(27)));
    assert_eq!(stored.failed_step.as_deref(), Some("Build"));
}

#[test]
fn replacing_signals_drops_the_old_ones() {
    let mut conn = open_in_memory();
    save(&mut conn, &fixture());
    save(
        &mut conn,
        &CiRecordBatch {
            signals: vec![signal("o2", 0, "A", "high")],
            replace_signals_for: vec!["o2".to_string()],
            ..Default::default()
        },
    );
    let pr = load_pr(&conn, SCOPE, 15).unwrap();
    let o2 = pr
        .occurrences
        .iter()
        .find(|d| d.occurrence.id == "o2")
        .unwrap();
    assert_eq!(o2.signals.len(), 1);
    assert_eq!(o2.signals[0].group_id.as_deref(), Some("g1"));
}

#[test]
fn a_quiet_group_wakes_up_when_it_fails_again() {
    let mut conn = open_in_memory();
    save(&mut conn, &fixture());
    let revision = summary(&conn, "g1").revision;
    let patch = CiGroupPatch {
        status: Some("quiet".to_string()),
        ..Default::default()
    };
    write(&mut conn, |tx| {
        set_group(tx, "g1", &patch, revision, &at(26))
    })
    .unwrap();
    save(
        &mut conn,
        &CiRecordBatch {
            occurrences: vec![occurrence("o8", Some(40), 800, 1, 25)],
            signals: vec![signal("o8", 0, "A", "high")],
            ..Default::default()
        },
    );
    let g1 = summary(&conn, "g1");
    assert_eq!(g1.status, "active");
    assert_eq!(g1.last_observed_at, at(25));
}

#[test]
fn a_pr_loads_its_occurrences_and_their_groups() {
    let conn = seeded();
    let pr = load_pr(&conn, SCOPE, 15).unwrap();
    let ids: Vec<&str> = pr
        .occurrences
        .iter()
        .map(|d| d.occurrence.id.as_str())
        .collect();
    assert_eq!(ids, vec!["o3", "o2"]);
    assert_eq!(pr.occurrences[1].signals.len(), 2);
    assert_eq!(pr.groups.len(), 1);
    assert_eq!(pr.groups[0].id, "g1");
    assert!(load_pr(&conn, SCOPE, 999).unwrap().occurrences.is_empty());
}

#[test]
fn known_occurrences_carry_their_outcome() {
    let conn = seeded();
    let known = known_occurrences(&conn, SCOPE, &at(20)).unwrap();
    assert_eq!(known.len(), 6);
    assert_eq!(known[0].outcome.as_deref(), Some("passed_on_retry"));
    assert_eq!(known_occurrences(&conn, SCOPE, &at(25)).unwrap().len(), 1);
}

#[test]
fn merging_moves_fingerprints_links_them_and_repoints_candidates() {
    let mut conn = seeded();
    let before = summary(&conn, "g1").revision;
    write(&mut conn, |tx| merge_groups(tx, "g1", "g2", None, &at(26))).unwrap();

    assert_eq!(fingerprint_group(&conn, "C"), "g1");
    assert_eq!(
        decisions(&conn, "must_link"),
        vec![("A".to_string(), "C".to_string())]
    );
    let pairs: Vec<(String, String)> = rows(
        &conn,
        "SELECT group_a, group_b FROM candidates",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .unwrap();
    assert_eq!(pairs, vec![("g1".to_string(), "g3".to_string())]);

    let detail = load_group(&conn, "g2").unwrap();
    assert_eq!(detail.summary.id, "g1");
    assert!(detail.summary.revision > before);
    assert_eq!(detail.summary.pr_numbers, vec![12, 15, 20]);
    assert_eq!(detail.summary.last_observed_at, at(24));
    assert_eq!(detail.occurrences.len(), 5);
    assert_eq!(detail.occurrences[0].occurrence.id, "o5");
    assert_eq!(detail.candidates.len(), 1);
    assert_eq!(detail.candidates[0].group.id, "g3");
    assert_eq!(detail.decisions.len(), 1);

    let snapshot = load_scope(&conn, &[SCOPE.to_string()]).unwrap();
    assert_eq!(snapshot.links.len(), 1);
    assert!(snapshot.groups.iter().all(|g| g.id != "g2"));
    assert_eq!(group_head(&conn, "g2").unwrap().status, "merged");
}

#[test]
fn merging_refuses_across_scopes_and_into_itself() {
    let mut conn = seeded();
    let mut elsewhere = new_group("x1", 25);
    elsewhere.scope = OTHER_SCOPE.to_string();
    save(
        &mut conn,
        &CiRecordBatch {
            new_groups: vec![elsewhere],
            ..Default::default()
        },
    );
    let across = write(&mut conn, |tx| merge_groups(tx, "g1", "x1", None, &at(26)));
    assert!(across.unwrap_err().contains("different repositories"));
    assert!(write(&mut conn, |tx| merge_groups(tx, "g1", "g1", None, &at(26))).is_err());
}

/// Claims before a merge of g2 into g1, the choice passed, and whose claim
/// is live on g1 afterwards.
fn merge_with_claims(
    keep_owner: Option<&str>,
    merge_owner: Option<&str>,
    keep_claim_of: Option<&str>,
) -> (Connection, Result<i64, String>) {
    let mut conn = seeded();
    if let Some(who) = keep_owner {
        claim_for(&mut conn, "g1", who);
    }
    if let Some(who) = merge_owner {
        claim_for(&mut conn, "g2", who);
    }
    let result = write(&mut conn, |tx| {
        merge_groups(tx, "g1", "g2", keep_claim_of, &at(26))
    })
    .map(|(_, revision)| revision);
    (conn, result)
}

fn live_owner(conn: &Connection, group: &str) -> Option<String> {
    summary(conn, group).claim.map(|claim| claim.owner_ref)
}

fn claim_state(conn: &Connection, who: &str) -> String {
    conn.query_row(
        "SELECT state FROM claims WHERE owner_ref = ?1",
        [who],
        |row| row.get(0),
    )
    .unwrap()
}

#[test]
fn merging_without_claims_leaves_none() {
    let (conn, result) = merge_with_claims(None, None, None);
    assert!(result.is_ok());
    assert_eq!(live_owner(&conn, "g1"), None);
}

#[test]
fn merging_keeps_the_kept_groups_claim() {
    let (conn, result) = merge_with_claims(Some("alice"), None, None);
    assert!(result.is_ok());
    assert_eq!(live_owner(&conn, "g1").as_deref(), Some("alice"));
}

#[test]
fn merging_moves_the_merged_groups_only_claim() {
    let (conn, result) = merge_with_claims(None, Some("bob"), None);
    assert!(result.is_ok());
    assert_eq!(live_owner(&conn, "g1").as_deref(), Some("bob"));
    let events = load_group(&conn, "g1").unwrap().claim_events;
    assert_eq!(events[0].kind, "owner_changed");
    assert_eq!(events[0].detail.as_deref(), Some("merged"));
}

#[test]
fn merging_two_owned_groups_needs_a_choice() {
    let (conn, result) = merge_with_claims(Some("alice"), Some("bob"), None);
    assert_eq!(result.unwrap_err(), "Both groups have an owner; choose one");
    assert_eq!(group_head(&conn, "g2").unwrap().status, "active");
    assert_eq!(fingerprint_group(&conn, "C"), "g2");
}

#[test]
fn merging_two_owned_groups_can_keep_the_kept_owner() {
    let (conn, result) = merge_with_claims(Some("alice"), Some("bob"), Some("g1"));
    assert!(result.is_ok());
    assert_eq!(live_owner(&conn, "g1").as_deref(), Some("alice"));
    assert_eq!(claim_state(&conn, "bob"), "released");
}

#[test]
fn merging_two_owned_groups_can_keep_the_merged_owner() {
    let (conn, result) = merge_with_claims(Some("alice"), Some("bob"), Some("g2"));
    assert!(result.is_ok());
    assert_eq!(live_owner(&conn, "g1").as_deref(), Some("bob"));
    assert_eq!(claim_state(&conn, "alice"), "released");
    let events = load_group(&conn, "g1").unwrap().claim_events;
    assert!(events
        .iter()
        .any(|e| e.kind == "released" && e.detail.as_deref() == Some("merged")));
}

#[test]
fn splitting_moves_a_fingerprint_out_and_remembers_why() {
    let mut conn = seeded();
    let (id, _) = write(&mut conn, |tx| {
        split_fingerprint(tx, "g1", "B", 1, "DNS failures", &at(26))
    })
    .unwrap()
    .0;
    assert_eq!(fingerprint_group(&conn, "B"), id);
    assert_eq!(
        decisions(&conn, "cannot_link"),
        vec![("A".to_string(), "B".to_string())]
    );
    let split = summary(&conn, &id);
    assert_eq!(split.title, "DNS failures");
    assert_eq!(split.occurrence_count, 1);
    assert_eq!(split.first_observed_at, at(21));
    assert_eq!(split.last_observed_at, at(21));
    assert_eq!(summary(&conn, "g1").catalog_ids, Vec::<String>::new());

    let last = write(&mut conn, |tx| {
        split_fingerprint(tx, &id, "B", 1, "again", &at(26))
    });
    assert!(last.unwrap_err().contains("only fingerprint"));
}

#[test]
fn splitting_undoes_a_merges_link() {
    let mut conn = seeded();
    write(&mut conn, |tx| merge_groups(tx, "g1", "g2", None, &at(26))).unwrap();
    write(&mut conn, |tx| {
        split_fingerprint(tx, "g1", "C", 1, "C again", &at(26))
    })
    .unwrap();
    assert!(decisions(&conn, "must_link").is_empty());
    assert_eq!(decisions(&conn, "cannot_link").len(), 2);
}

#[test]
fn a_second_claim_gets_the_first() {
    let mut conn = seeded();
    let first = claim_for(&mut conn, "g1", "alice");
    assert!(matches!(first, CiClaimResult::Claimed { .. }));
    let second = claim_for(&mut conn, "g1", "bob");
    assert!(matches!(second, CiClaimResult::AlreadyClaimed { .. }));
    assert_eq!(second.claim().owner_ref, "alice");
    assert_eq!(summary(&conn, "g1").claim.unwrap().id, first.claim().id);
}

#[test]
fn the_unique_index_turns_a_late_insert_into_already_claimed() {
    let mut conn = seeded();
    let first = claim_for(&mut conn, "g1", "alice");
    let late = write(&mut conn, |tx| {
        insert_claim(tx, "g1", &owner("bob"), None, None, &at(26))
    })
    .unwrap()
    .0;
    assert!(matches!(late, CiClaimResult::AlreadyClaimed { .. }));
    assert_eq!(late.claim().id, first.claim().id);
    assert_eq!(count(&conn, "claims"), 1);
}

#[test]
fn racing_claims_on_one_file_produce_one_owner() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("ci-failures.db");
    {
        let mut opened = connection::open(&path).unwrap();
        save(&mut opened.conn, &fixture());
    }
    for round in 0..5 {
        let group = format!("race{round}");
        {
            let mut opened = connection::open(&path).unwrap();
            save(
                &mut opened.conn,
                &CiRecordBatch {
                    new_groups: vec![new_group(&group, 25)],
                    ..Default::default()
                },
            );
        }
        let barrier = Arc::new(Barrier::new(2));
        let racers: Vec<_> = ["alice", "bob"]
            .into_iter()
            .map(|who| {
                let path = path.clone();
                let barrier = barrier.clone();
                let group = group.clone();
                std::thread::spawn(move || {
                    let mut opened = connection::open(&path).unwrap();
                    barrier.wait();
                    write(&mut opened.conn, |tx| {
                        claim(tx, &group, &owner(who), None, None, &at(26))
                    })
                    .unwrap()
                    .0
                })
            })
            .collect();
        let results: Vec<CiClaimResult> = racers.into_iter().map(|r| r.join().unwrap()).collect();
        let claimed = results
            .iter()
            .filter(|r| matches!(r, CiClaimResult::Claimed { .. }))
            .count();
        assert_eq!(claimed, 1, "round {round}: {results:?}");
        assert_eq!(results[0].claim().id, results[1].claim().id);
    }
}

#[test]
fn updating_a_claim_compares_and_sets() {
    let mut conn = seeded();
    let claimed = claim_for(&mut conn, "g1", "pending:1");
    let id = claimed.claim().id.clone();
    let patch = CiClaimPatch {
        owner_ref: Some("t3:thread-1".to_string()),
        ..Default::default()
    };
    let updated = write(&mut conn, |tx| {
        update_claim(tx, &id, 1, &patch, Some(("renewed", None)), &at(26))
    })
    .unwrap()
    .0;
    assert_eq!(updated.revision, 2);
    assert_eq!(updated.owner_ref, "t3:thread-1");

    let stale = write(&mut conn, |tx| {
        update_claim(tx, &id, 1, &patch, None, &at(26))
    });
    assert!(stale.unwrap_err().starts_with("conflict:"));

    let release = CiClaimPatch {
        state: Some("released".to_string()),
        note: Some(None),
        ..Default::default()
    };
    write(&mut conn, |tx| {
        update_claim(
            tx,
            &id,
            2,
            &release,
            Some(("released", Some("done"))),
            &at(26),
        )
    })
    .unwrap();
    assert!(matches!(
        claim_for(&mut conn, "g1", "bob"),
        CiClaimResult::Claimed { .. }
    ));

    let events = load_group(&conn, "g1").unwrap().claim_events;
    let kinds: Vec<&str> = events.iter().map(|e| e.kind.as_str()).collect();
    assert_eq!(kinds, vec!["claimed", "released", "renewed", "claimed"]);
}

#[test]
fn reviving_a_released_claim_while_another_is_live_conflicts() {
    let mut conn = seeded();
    let first = claim_for(&mut conn, "g1", "alice").claim().clone();
    let release = CiClaimPatch {
        state: Some("released".to_string()),
        ..Default::default()
    };
    write(&mut conn, |tx| {
        update_claim(tx, &first.id, 1, &release, None, &at(26))
    })
    .unwrap();
    claim_for(&mut conn, "g1", "bob");
    let revive = CiClaimPatch {
        state: Some("active".to_string()),
        ..Default::default()
    };
    let error = write(&mut conn, |tx| {
        update_claim(tx, &first.id, 2, &revive, None, &at(26))
    })
    .unwrap_err();
    assert!(error.starts_with("conflict:"), "{error}");
}

#[test]
fn a_claim_event_leaves_the_claim_alone() {
    let mut conn = seeded();
    let id = claim_for(&mut conn, "g1", "alice").claim().id.clone();
    write(&mut conn, |tx| {
        claim_event(tx, &id, "overridden", Some("bob"), &at(26))
    })
    .unwrap();
    assert_eq!(summary(&conn, "g1").claim.unwrap().revision, 1);
    assert!(write(&mut conn, |tx| claim_event(tx, &id, "bogus", None, &at(26))).is_err());
}

#[test]
fn setting_a_group_compares_and_sets() {
    let mut conn = seeded();
    let revision = summary(&conn, "g1").revision;
    let patch = CiGroupPatch {
        classification: Some(Some("flaky".to_string())),
        status: Some("resolved".to_string()),
        fix_pr: Some(Some("o/r#42".to_string())),
        ..Default::default()
    };
    let updated = write(&mut conn, |tx| {
        set_group(tx, "g1", &patch, revision, &at(26))
    })
    .unwrap()
    .0;
    assert_eq!(updated.revision, revision + 1);
    assert_eq!(updated.classification.as_deref(), Some("flaky"));
    assert_eq!(updated.status, "resolved");
    assert_eq!(updated.fix_pr.as_deref(), Some("o/r#42"));
    let resolved_at: Option<String> = conn
        .query_row(
            "SELECT resolved_at FROM groups WHERE id = 'g1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(resolved_at, Some(at(26)));

    let stale = write(&mut conn, |tx| {
        set_group(tx, "g1", &patch, revision, &at(26))
    });
    assert_eq!(stale.unwrap_err(), "The group changed; reload it");

    let clear = CiGroupPatch {
        classification: Some(None),
        ..Default::default()
    };
    let cleared = write(&mut conn, |tx| {
        set_group(tx, "g1", &clear, revision + 1, &at(26))
    })
    .unwrap()
    .0;
    assert_eq!(cleared.classification, None);
    assert_eq!(cleared.fix_pr.as_deref(), Some("o/r#42"));

    let merged = CiGroupPatch {
        status: Some("merged".to_string()),
        ..Default::default()
    };
    assert!(write(&mut conn, |tx| set_group(
        tx,
        "g1",
        &merged,
        revision + 2,
        &at(26)
    ))
    .is_err());
}

#[test]
fn candidates_can_be_dismissed_and_judged() {
    let mut conn = seeded();
    write(&mut conn, |tx| {
        set_candidate_verdict(tx, "g3", "g2", &json!({ "related": false }))
    })
    .unwrap();
    let detail = load_group(&conn, "g3").unwrap();
    assert_eq!(
        detail.candidates[0].agent_verdict,
        Some(json!({ "related": false }))
    );
    write(&mut conn, |tx| dismiss_candidate(tx, "g2", "g3")).unwrap();
    assert!(load_group(&conn, "g3").unwrap().candidates.is_empty());
    assert!(write(&mut conn, |tx| dismiss_candidate(tx, "g1", "g3")).is_err());
}

/// Seeds history around "now" (day 26): g4 is claimed and only has old
/// history, g5's fingerprint carries a decision, g6 has nothing protecting
/// it, and g7 lives in a scope that left the settings.
fn retention_fixture() -> Connection {
    let mut conn = seeded();
    let mut gone = occurrence("o10", Some(1), 1000, 1, 24);
    gone.scope = OTHER_SCOPE.to_string();
    let mut gone_group = new_group("g7", 24);
    gone_group.scope = OTHER_SCOPE.to_string();
    let mut gone_mapping = mapping("H", "g7", None, 24);
    gone_mapping.scope = OTHER_SCOPE.to_string();
    save(
        &mut conn,
        &CiRecordBatch {
            occurrences: vec![
                occurrence("o7", Some(30), 700, 1, 19),
                occurrence("o8", Some(31), 800, 1, 18),
                occurrence("o9", Some(32), 900, 1, 17),
                gone,
            ],
            signals: vec![
                signal("o7", 0, "E", "high"),
                signal("o8", 0, "F", "high"),
                signal("o9", 0, "G", "high"),
                signal("o10", 0, "H", "high"),
            ],
            new_groups: vec![
                new_group("g4", 19),
                new_group("g5", 18),
                new_group("g6", 17),
                gone_group,
            ],
            mappings: vec![
                mapping("E", "g4", None, 19),
                mapping("F", "g5", None, 18),
                mapping("G", "g6", None, 17),
                gone_mapping,
            ],
            ..Default::default()
        },
    );
    claim_for(&mut conn, "g4", "alice");
    write(&mut conn, |tx| {
        insert_decision(tx, SCOPE, "cannot_link", 1, ("F", "Z"), &at(18))
    })
    .unwrap();
    conn
}

fn retain(conn: &mut Connection, retention_days: u32, max_per_scope: u32) -> CiRetentionReport {
    let active = [SCOPE.to_string()];
    let policy = RetentionPolicy {
        active_scopes: &active,
        retention_days,
        max_per_scope,
        inactive_grace_days: 1,
    };
    write(conn, |tx| retention(tx, &policy, &at(26)))
        .unwrap()
        .0
         .0
}

fn occurrence_ids(conn: &Connection) -> Vec<String> {
    rows(conn, "SELECT id FROM occurrences ORDER BY id", [], |row| {
        row.get(0)
    })
    .unwrap()
}

fn group_ids(conn: &Connection) -> Vec<String> {
    rows(conn, "SELECT id FROM groups ORDER BY id", [], |row| {
        row.get(0)
    })
    .unwrap()
}

#[test]
fn retention_expires_old_history_but_keeps_what_someone_is_working_on() {
    let mut conn = retention_fixture();
    let decisions_before = count(&conn, "decisions");
    let report = retain(&mut conn, 3, 1000);

    // Older than day 23 10:00 goes, except g4's newest (claimed); o10's
    // scope left the settings more than a day ago.
    assert_eq!(occurrence_ids(&conn), vec!["o4", "o5", "o6", "o7"]);
    assert_eq!(report.deleted_occurrences, 6);
    assert_eq!(group_ids(&conn), vec!["g1", "g2", "g3", "g4", "g5"]);
    assert_eq!(report.deleted_groups, 2);
    assert_eq!(count(&conn, "decisions"), decisions_before);
    // B lost its only occurrence; F stays because a decision names it.
    let fingerprints: Vec<String> = rows(
        &conn,
        "SELECT fingerprint FROM fingerprints ORDER BY fingerprint",
        [],
        |row| row.get(0),
    )
    .unwrap();
    assert_eq!(fingerprints, vec!["A", "C", "D", "E", "F"]);
    assert_eq!(summary(&conn, "g4").claim.unwrap().owner_ref, "alice");
    assert_eq!(summary(&conn, "g4").first_observed_at, at(19));

    let again = retain(&mut conn, 3, 1000);
    assert_eq!(again, CiRetentionReport::default());
}

#[test]
fn retention_caps_each_scope_oldest_first() {
    let mut conn = open_in_memory();
    save(&mut conn, &fixture());
    let report = retain(&mut conn, 365, 2);
    assert_eq!(report.deleted_occurrences, 2);
    assert_eq!(occurrence_ids(&conn), vec!["o3", "o4"]);
}

#[test]
fn retention_removes_merged_groups_whose_survivor_is_gone() {
    let mut conn = retention_fixture();
    write(&mut conn, |tx| merge_groups(tx, "g6", "g5", None, &at(26))).unwrap();
    write(&mut conn, |tx| {
        tx.execute("DELETE FROM decisions", []).map_err(db)
    })
    .unwrap();
    retain(&mut conn, 3, 1000);
    assert!(!group_ids(&conn).contains(&"g5".to_string()));
    assert!(!group_ids(&conn).contains(&"g6".to_string()));
}

#[test]
fn usage_adds_up() {
    let conn = open_in_memory();
    assert_eq!(usage(&conn, "2026-10-26", "me").unwrap().reads, 0);
    count_usage(&conn, "2026-10-26", "me", 2, 1000, 0).unwrap();
    count_usage(&conn, "2026-10-26", "me", 1, 500, 3).unwrap();
    count_usage(&conn, "2026-10-26", "you", 9, 9, 9).unwrap();
    assert_eq!(
        usage(&conn, "2026-10-26", "me").unwrap(),
        CiUsage {
            day: "2026-10-26".to_string(),
            account: "me".to_string(),
            reads: 3,
            log_bytes: 1500,
            skipped: 3,
        }
    );
}

#[test]
fn branch_watch_upserts() {
    let mut conn = open_in_memory();
    let mut watch = CiBranchWatch {
        scope: SCOPE.to_string(),
        workflow_path: ".github/workflows/ci.yml".to_string(),
        last_failed_run: Some(41),
        last_passed_run: None,
        checked_at: Some(at(25)),
    };
    write(&mut conn, |tx| {
        set_branch_watch(tx, std::slice::from_ref(&watch))
    })
    .unwrap();
    watch.last_passed_run = Some(42);
    write(&mut conn, |tx| {
        set_branch_watch(tx, std::slice::from_ref(&watch))
    })
    .unwrap();
    assert_eq!(branch_watch(&conn, SCOPE).unwrap(), vec![watch]);
}

#[test]
fn clearing_can_keep_decisions() {
    let mut conn = retention_fixture();
    count_usage(&conn, "2026-10-26", "me", 1, 1, 0).unwrap();
    let scopes = write(&mut conn, |tx| clear(tx, true)).unwrap().0;
    assert_eq!(scopes, vec![OTHER_SCOPE.to_string(), SCOPE.to_string()]);
    assert_eq!(count(&conn, "occurrences"), 0);
    assert_eq!(count(&conn, "groups"), 0);
    assert_eq!(count(&conn, "decisions"), 1);
    assert_eq!(count(&conn, "usage"), 1);
    write(&mut conn, |tx| clear(tx, false)).unwrap();
    assert_eq!(count(&conn, "decisions"), 0);
}

#[test]
fn store_info_counts_and_tracks_the_revision() {
    let mut conn = seeded();
    let info = store_info(&conn, "x".to_string(), false).unwrap();
    assert_eq!(info.revision, 2);
    assert_eq!(info.occurrences, 6);
    assert_eq!(info.groups, 3);
    write(&mut conn, |tx| merge_groups(tx, "g1", "g2", None, &at(26))).unwrap();
    let info = store_info(&conn, "x".to_string(), false).unwrap();
    assert_eq!(info.revision, 3);
    assert_eq!(info.groups, 2);
    assert_eq!(info.decisions, 1);
}
