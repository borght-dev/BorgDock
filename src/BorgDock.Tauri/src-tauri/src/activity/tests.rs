use super::commands::{commit, mark, open_source, store_info};
use super::dto::*;
use super::queries::{self, UNREAD_CAPACITY};
use super::ActivityDb;
use rusqlite::Connection;

const SOURCE: &str = "t3:local";

fn store() -> (tempfile::TempDir, ActivityDb) {
    let dir = tempfile::tempdir().unwrap();
    let store = ActivityDb::at(dir.path().join("activity.db"));
    (dir, store)
}

fn request(config_key: &str) -> ActivitySourceRequest {
    ActivitySourceRequest {
        source_id: SOURCE.into(),
        kind: "t3".into(),
        label: "This laptop".into(),
        config_key: config_key.into(),
        reset: false,
    }
}

fn entry(id: &str, needs_you: bool) -> ActivityEntryInput {
    ActivityEntryInput {
        id: format!("{SOURCE}|{id}"),
        source_id: SOURCE.into(),
        entity_key: "t3:local:thread:a".into(),
        category: if needs_you {
            "agent.question".into()
        } else {
            "agent.turn".into()
        },
        severity: "info".into(),
        needs_you,
        status: "open".into(),
        resolved_by: None,
        source_at: Some("2026-10-27T10:00:00.000Z".into()),
        observed_at: "2026-10-27T10:00:05.000Z".into(),
        coverage: "live".into(),
        summary: format!("Entry {id}"),
        detail: None,
        payload: r#"{"schema":1,"action":null,"links":{"itemIds":[1]}}"#.into(),
    }
}

fn empty_commit(generation: i64, revision: i64) -> ActivityCommit {
    ActivityCommit {
        source_id: SOURCE.into(),
        generation,
        revision,
        seed: false,
        baseline: format!("{{\"revision\":{revision}}}"),
        entries: vec![],
        enrichments: vec![],
        resolutions: vec![],
        seen: vec![],
        outbox: vec![],
    }
}

fn with_entries(revision: i64, entries: Vec<ActivityEntryInput>) -> ActivityCommit {
    let outbox = entries
        .iter()
        .map(|entry| ActivityOutboxRequest {
            entry_id: entry.id.clone(),
            channel: "popup".into(),
        })
        .collect();
    ActivityCommit {
        entries,
        outbox,
        ..empty_commit(1, revision)
    }
}

async fn seeded() -> (tempfile::TempDir, ActivityDb) {
    let (dir, store) = store();
    open_source(&store, request("env-1")).await.unwrap();
    let (result, _) = commit(
        &store,
        ActivityCommit {
            seed: true,
            entries: vec![entry("ignored", true)],
            ..empty_commit(1, 1)
        },
    )
    .await
    .unwrap();
    assert!(result.accepted);
    assert!(result.inserted.is_empty(), "a seed adds no entries");
    (dir, store)
}

async fn query<T: Send + 'static>(
    store: &ActivityDb,
    f: impl FnOnce(&Connection) -> rusqlite::Result<T> + Send + 'static,
) -> T {
    store
        .db
        .with_store(move |conn| f(conn).map_err(|e| e.to_string()))
        .await
        .unwrap()
}

async fn count(store: &ActivityDb, sql: &'static str) -> i64 {
    query(store, move |conn| conn.query_row(sql, [], |row| row.get(0))).await
}

async fn read_of(store: &ActivityDb, id: &str) -> (String, Option<String>) {
    let id = format!("{SOURCE}|{id}");
    query(store, move |conn| {
        conn.query_row(
            "SELECT read, read_reason FROM entries WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
    })
    .await
}

fn all() -> ActivityListQuery {
    ActivityListQuery {
        filter: ActivityFilter::All,
        categories: vec![],
        source_ids: vec![],
        entity_keys: vec![],
        search: None,
        include_dismissed: false,
        limit: 1000,
        before: None,
    }
}

async fn list(store: &ActivityDb, query: ActivityListQuery) -> ActivityPage {
    store
        .db
        .with_store(move |conn| queries::list(conn, &query))
        .await
        .unwrap()
}

#[tokio::test]
async fn a_new_source_starts_at_generation_one_and_a_new_config_key_moves_it() {
    let (_dir, store) = store();
    let first = open_source(&store, request("env-1")).await.unwrap();
    assert_eq!(first.generation, 1);
    assert_eq!(first.revision, None);
    assert_eq!(first.baseline, None);

    commit(&store, empty_commit(1, 4)).await.unwrap();
    let same = open_source(&store, request("env-1")).await.unwrap();
    assert_eq!(same.generation, 1);
    assert_eq!(same.revision, Some(4));
    assert_eq!(same.baseline.as_deref(), Some("{\"revision\":4}"));

    let moved = open_source(&store, request("env-2")).await.unwrap();
    assert_eq!(moved.generation, 2);
    assert_eq!(moved.revision, None);
    assert_eq!(moved.baseline, None);
    assert_eq!(moved.seeded_at, None);

    let reset = open_source(
        &store,
        ActivitySourceRequest {
            reset: true,
            ..request("env-2")
        },
    )
    .await
    .unwrap();
    assert_eq!(reset.generation, 3);
}

#[tokio::test]
async fn replaying_a_commit_inserts_nothing() {
    let (_dir, store) = seeded().await;
    let (first, _) = commit(&store, with_entries(2, vec![entry("a", false)]))
        .await
        .unwrap();
    assert_eq!(first.inserted, vec![format!("{SOURCE}|a")]);

    // The same facts in a later observation (the baseline did not advance
    // because the app restarted before it saw the answer).
    let (again, changed) = commit(&store, with_entries(3, vec![entry("a", false)]))
        .await
        .unwrap();
    assert!(again.accepted);
    assert!(again.inserted.is_empty());
    assert!(changed.is_none(), "nothing a window shows changed");
    assert_eq!(count(&store, "SELECT COUNT(*) FROM entries").await, 1);
    assert_eq!(count(&store, "SELECT COUNT(*) FROM outbox").await, 1);
}

#[tokio::test]
async fn an_older_generation_or_revision_writes_nothing() {
    let (_dir, store) = seeded().await;
    commit(&store, with_entries(5, vec![entry("a", false)]))
        .await
        .unwrap();

    for (commit_request, reason) in [
        (
            with_entries(5, vec![entry("same", false)]),
            "stale revision",
        ),
        (
            with_entries(4, vec![entry("older", false)]),
            "stale revision",
        ),
        (
            ActivityCommit {
                generation: 7,
                ..with_entries(9, vec![entry("other", false)])
            },
            "stale generation",
        ),
    ] {
        let (result, changed) = commit(&store, commit_request).await.unwrap();
        assert!(!result.accepted);
        assert_eq!(result.reason.as_deref(), Some(reason));
        assert!(changed.is_none());
    }
    assert_eq!(count(&store, "SELECT COUNT(*) FROM entries").await, 1);
    let state = open_source(&store, request("env-1")).await.unwrap();
    assert_eq!(state.revision, Some(5));

    // A new generation leaves the old one's late answers behind.
    open_source(&store, request("env-2")).await.unwrap();
    let (late, _) = commit(&store, with_entries(6, vec![entry("late", false)]))
        .await
        .unwrap();
    assert_eq!(late.reason.as_deref(), Some("stale generation"));
}

#[tokio::test]
async fn an_unknown_source_is_rejected() {
    let (_dir, store) = store();
    let (result, _) = commit(&store, empty_commit(1, 1)).await.unwrap();
    assert_eq!(result.reason.as_deref(), Some("unknown source"));
}

#[tokio::test]
async fn entries_baseline_and_outbox_land_together_or_not_at_all() {
    let (_dir, store) = seeded().await;
    store
        .db
        .with_store(|conn| {
            conn.execute_batch(
                "CREATE TEMP TRIGGER refuse_baseline BEFORE UPDATE OF baseline ON sources \
                 BEGIN SELECT RAISE(ABORT, 'disk full'); END;",
            )
            .map_err(|e| e.to_string())
        })
        .await
        .unwrap();
    let error = commit(&store, with_entries(2, vec![entry("a", true)]))
        .await
        .unwrap_err();
    assert!(error.contains("disk full"), "{error}");
    assert_eq!(count(&store, "SELECT COUNT(*) FROM entries").await, 0);
    assert_eq!(count(&store, "SELECT COUNT(*) FROM outbox").await, 0);
    let state = open_source(&store, request("env-1")).await.unwrap();
    assert_eq!(state.revision, Some(1));

    store
        .db
        .with_store(|conn| {
            conn.execute_batch("DROP TRIGGER refuse_baseline;")
                .map_err(|e| e.to_string())
        })
        .await
        .unwrap();
    let (retried, _) = commit(&store, with_entries(2, vec![entry("a", true)]))
        .await
        .unwrap();
    assert_eq!(retried.inserted.len(), 1);
    assert_eq!(count(&store, "SELECT COUNT(*) FROM outbox").await, 1);
}

#[tokio::test]
async fn an_invalid_entry_fails_the_whole_commit() {
    let (_dir, store) = seeded().await;
    let mut bad = entry("bad", false);
    bad.severity = "catastrophic".into();
    let error = commit(&store, with_entries(2, vec![entry("good", false), bad]))
        .await
        .unwrap_err();
    assert!(error.contains("severity"), "{error}");
    assert_eq!(count(&store, "SELECT COUNT(*) FROM entries").await, 0);
}

#[tokio::test]
async fn resolutions_close_only_entries_that_existed_before_the_commit() {
    let (_dir, store) = seeded().await;
    commit(&store, with_entries(2, vec![entry("turn-1", false)]))
        .await
        .unwrap();
    let supersede = ActivityResolution {
        ids: vec![],
        entity_key: Some("t3:local:thread:a".into()),
        categories: vec!["agent.turn".into()],
        status: "superseded".into(),
        resolved_by: format!("{SOURCE}|turn-2"),
    };
    commit(
        &store,
        ActivityCommit {
            resolutions: vec![supersede],
            ..with_entries(3, vec![entry("turn-2", false)])
        },
    )
    .await
    .unwrap();
    let page = list(&store, all()).await;
    let status = |id: &str| {
        page.entries
            .iter()
            .find(|row| row.id == format!("{SOURCE}|{id}"))
            .map(|row| (row.status.clone(), row.resolved_by.clone()))
            .unwrap()
    };
    assert_eq!(
        status("turn-1"),
        ("superseded".into(), Some(format!("{SOURCE}|turn-2")))
    );
    assert_eq!(status("turn-2"), ("open".into(), None));
}

#[tokio::test]
async fn enrichments_change_text_but_never_read_state() {
    let (_dir, store) = seeded().await;
    commit(&store, with_entries(2, vec![entry("q", true)]))
        .await
        .unwrap();
    mark(
        &store,
        ActivityMarkRequest {
            ids: vec![format!("{SOURCE}|q")],
            entity_keys: vec![],
            before: None,
            read: "read".into(),
            reason: None,
        },
    )
    .await
    .unwrap();
    let (_, changed) = commit(
        &store,
        ActivityCommit {
            enrichments: vec![ActivityEnrichment {
                id: format!("{SOURCE}|q"),
                summary: Some("W3 asks: which option?".into()),
                detail: Some(Some("Option A or B".into())),
                action: Some("{\"kind\":\"open-item\",\"itemId\":7}".into()),
            }],
            ..empty_commit(1, 3)
        },
    )
    .await
    .unwrap();
    assert!(changed.is_some());
    let row = list(&store, all()).await.entries.remove(0);
    assert_eq!(row.summary, "W3 asks: which option?");
    assert_eq!(row.detail.as_deref(), Some("Option A or B"));
    let payload: serde_json::Value = serde_json::from_str(&row.payload).unwrap();
    assert_eq!(payload["action"]["itemId"], 7);
    assert_eq!(
        payload["links"]["itemIds"][0], 1,
        "the rest of the payload stays"
    );
    assert_eq!(row.read, "read");
    assert_eq!(row.read_reason.as_deref(), Some("user"));

    // The same enrichment again is no change at all.
    let (_, unchanged) = commit(
        &store,
        ActivityCommit {
            enrichments: vec![ActivityEnrichment {
                id: format!("{SOURCE}|q"),
                summary: Some("W3 asks: which option?".into()),
                ..Default::default()
            }],
            ..empty_commit(1, 4)
        },
    )
    .await
    .unwrap();
    assert!(unchanged.is_none());
}

#[tokio::test]
async fn an_entry_already_seen_in_t3_is_stored_read_without_a_popup() {
    let (_dir, store) = seeded().await;
    let mut later = entry("later", false);
    later.source_at = Some("2026-10-27T10:05:00.000Z".into());
    commit(
        &store,
        ActivityCommit {
            seen: vec![ActivitySeenMark {
                entity_key: "t3:local:thread:a".into(),
                before: "2026-10-27T10:01:00.000Z".into(),
                reason: "seen-in-t3".into(),
            }],
            ..with_entries(2, vec![entry("seen", false), later])
        },
    )
    .await
    .unwrap();
    assert_eq!(
        read_of(&store, "seen").await,
        ("read".into(), Some("seen-in-t3".into()))
    );
    assert_eq!(read_of(&store, "later").await, ("unread".into(), None));
    let popups: i64 = count(&store, "SELECT COUNT(*) FROM outbox").await;
    assert_eq!(popups, 1, "only the unseen entry pops up");
}

#[tokio::test]
async fn mark_returns_the_undo_and_restore_puts_it_back() {
    let (_dir, store) = seeded().await;
    commit(
        &store,
        with_entries(
            2,
            vec![entry("a", true), entry("b", false), entry("c", false)],
        ),
    )
    .await
    .unwrap();
    mark(
        &store,
        ActivityMarkRequest {
            ids: vec![format!("{SOURCE}|c")],
            entity_keys: vec![],
            before: None,
            read: "dismissed".into(),
            reason: None,
        },
    )
    .await
    .unwrap();

    let ids: Vec<String> = ["a", "b", "c"]
        .iter()
        .map(|id| format!("{SOURCE}|{id}"))
        .collect();
    let (result, changed) = mark(
        &store,
        ActivityMarkRequest {
            ids,
            entity_keys: vec![],
            before: None,
            read: "read".into(),
            reason: Some("bulk".into()),
        },
    )
    .await
    .unwrap();
    assert_eq!(result.changed, 3);
    let counts = changed.expect("counts follow").counts;
    assert_eq!(counts.unread, 0);
    assert_eq!(counts.needs_you, 0);

    let previous = result.previous.clone();
    let revision = store
        .db
        .with_writer(move |conn| {
            queries::write(conn, |tx| Ok((queries::restore(tx, &previous)?, true)))
        })
        .await
        .unwrap();
    assert!(revision.1.is_some());
    assert_eq!(read_of(&store, "a").await, ("unread".into(), None));
    assert_eq!(read_of(&store, "b").await, ("unread".into(), None));
    assert_eq!(
        read_of(&store, "c").await,
        ("dismissed".into(), Some("user".into()))
    );
}

#[tokio::test]
async fn marking_an_entity_read_respects_before() {
    let (_dir, store) = seeded().await;
    let mut early = entry("early", false);
    early.source_at = Some("2026-10-27T09:00:00.000Z".into());
    let mut late = entry("late", false);
    late.source_at = Some("2026-10-27T11:00:00.000Z".into());
    commit(&store, with_entries(2, vec![early, late]))
        .await
        .unwrap();
    let (result, _) = mark(
        &store,
        ActivityMarkRequest {
            ids: vec![],
            entity_keys: vec!["t3:local:thread:a".into()],
            before: Some("2026-10-27T10:00:00.000Z".into()),
            read: "read".into(),
            reason: Some("viewed".into()),
        },
    )
    .await
    .unwrap();
    assert_eq!(result.changed, 1);
    assert_eq!(
        read_of(&store, "early").await,
        ("read".into(), Some("viewed".into()))
    );
    assert_eq!(read_of(&store, "late").await, ("unread".into(), None));
}

#[tokio::test]
async fn marking_five_hundred_entries_is_one_transaction() {
    let (_dir, store) = seeded().await;
    let entries: Vec<_> = (0..500).map(|n| entry(&format!("e{n}"), false)).collect();
    let ids: Vec<String> = entries.iter().map(|entry| entry.id.clone()).collect();
    commit(&store, with_entries(2, entries)).await.unwrap();
    let before = count(
        &store,
        "SELECT CAST(value AS INTEGER) FROM meta WHERE key = 'revision'",
    )
    .await;
    let (result, _) = mark(
        &store,
        ActivityMarkRequest {
            ids,
            entity_keys: vec![],
            before: None,
            read: "read".into(),
            reason: Some("bulk".into()),
        },
    )
    .await
    .unwrap();
    assert_eq!(result.changed, 500);
    assert_eq!(result.revision, before + 1);
}

#[tokio::test]
async fn reading_a_pushed_entry_queues_a_clear_for_the_phone() {
    let (_dir, store) = seeded().await;
    let question = entry("q", true);
    commit(
        &store,
        ActivityCommit {
            outbox: vec![ActivityOutboxRequest {
                entry_id: question.id.clone(),
                channel: "push".into(),
            }],
            entries: vec![question.clone()],
            ..empty_commit(1, 2)
        },
    )
    .await
    .unwrap();
    let taken = store
        .db
        .with_store(|conn| queries::outbox_take(conn, "push", 10, &queries::now()))
        .await
        .unwrap();
    assert_eq!(taken.len(), 1);
    store
        .db
        .with_writer(move |conn| {
            queries::write(conn, |tx| {
                let acks = [ActivityOutboxAck {
                    entry_id: question.id.clone(),
                    channel: "push".into(),
                    outcome: ActivityOutboxOutcome::Sent,
                }];
                Ok((queries::outbox_ack(tx, &acks, &queries::now())?, false))
            })
        })
        .await
        .unwrap();
    mark(
        &store,
        ActivityMarkRequest {
            ids: vec![format!("{SOURCE}|q")],
            entity_keys: vec![],
            before: None,
            read: "read".into(),
            reason: None,
        },
    )
    .await
    .unwrap();
    let clears = store
        .db
        .with_store(|conn| queries::outbox_take(conn, "push-clear", 10, &queries::now()))
        .await
        .unwrap();
    assert_eq!(clears.len(), 1);
    assert_eq!(clears[0].entry.id, format!("{SOURCE}|q"));
}

#[test]
fn backoff_doubles_up_to_six_hours() {
    assert_eq!(queries::backoff_seconds(0), 60);
    assert_eq!(queries::backoff_seconds(1), 120);
    assert_eq!(queries::backoff_seconds(5), 1920);
    assert_eq!(queries::backoff_seconds(30), 6 * 60 * 60);
}

#[tokio::test]
async fn a_retry_waits_before_it_is_due_again() {
    let (_dir, store) = seeded().await;
    commit(&store, with_entries(2, vec![entry("a", false)]))
        .await
        .unwrap();
    store
        .db
        .with_writer(|conn| {
            queries::write(conn, |tx| {
                let acks = [ActivityOutboxAck {
                    entry_id: format!("{SOURCE}|a"),
                    channel: "popup".into(),
                    outcome: ActivityOutboxOutcome::Retry,
                }];
                Ok((queries::outbox_ack(tx, &acks, &queries::now())?, false))
            })
        })
        .await
        .unwrap();
    let due = store
        .db
        .with_store(|conn| queries::outbox_take(conn, "popup", 10, &queries::now()))
        .await
        .unwrap();
    assert!(due.is_empty());
    let attempts = count(&store, "SELECT attempts FROM outbox").await;
    assert_eq!(attempts, 1);
}

#[tokio::test]
async fn capacity_folds_old_updates_but_never_entries_that_need_me() {
    let (_dir, store) = seeded().await;
    let needs: Vec<_> = (0..10)
        .map(|n| {
            let mut entry = entry(&format!("need{n}"), true);
            entry.observed_at = "2026-01-01T00:00:00.000Z".into();
            entry
        })
        .collect();
    commit(&store, with_entries(2, needs)).await.unwrap();
    let updates: Vec<_> = (0..UNREAD_CAPACITY)
        .map(|n| {
            let mut entry = entry(&format!("u{n:05}"), false);
            entry.observed_at = format!("2026-10-27T10:{:02}:{:02}.000Z", n / 3600 % 60, n % 60);
            entry
        })
        .collect();
    let (result, _) = commit(&store, with_entries(3, updates)).await.unwrap();
    assert_eq!(result.capacity, ActivityCapacity::RolledUp);

    let unread = count(&store, "SELECT COUNT(*) FROM entries WHERE read = 'unread'").await;
    assert!(unread <= 4501, "{unread}");
    let needs_unread = count(
        &store,
        "SELECT COUNT(*) FROM entries WHERE read = 'unread' AND needs_you = 1",
    )
    .await;
    assert_eq!(needs_unread, 10);
    let rolled = count(
        &store,
        "SELECT COUNT(*) FROM entries WHERE read_reason = 'rolled-up'",
    )
    .await;
    assert_eq!(rolled + unread, UNREAD_CAPACITY + 10 + 1);

    let rollup = list(
        &store,
        ActivityListQuery {
            categories: vec!["activity.rollup".into()],
            ..all()
        },
    )
    .await;
    assert_eq!(rollup.entries.len(), 1);
    assert_eq!(rollup.entries[0].id, format!("{SOURCE}|rollup"));
    assert_eq!(
        rollup.entries[0].summary,
        format!("{rolled} older updates from This laptop")
    );
}

#[tokio::test]
async fn a_journal_full_of_entries_that_need_me_stops_adding_others() {
    let (_dir, store) = seeded().await;
    let needs: Vec<_> = (0..UNREAD_CAPACITY)
        .map(|n| entry(&format!("need{n}"), true))
        .collect();
    let (result, _) = commit(&store, with_entries(2, needs)).await.unwrap();
    assert_eq!(result.capacity, ActivityCapacity::Full);
    let (next, _) = commit(
        &store,
        with_entries(3, vec![entry("update", false), entry("question", true)]),
    )
    .await
    .unwrap();
    assert_eq!(next.inserted, vec![format!("{SOURCE}|question")]);
    assert_eq!(next.capacity, ActivityCapacity::Full);
    let info = store_info(&store).await.unwrap();
    assert_eq!(info.capacity, ActivityCapacity::Full);
    assert_eq!(info.needs_you, UNREAD_CAPACITY + 1);
}

#[tokio::test]
async fn list_filters_pages_and_searches() {
    let (_dir, store) = seeded().await;
    let entries: Vec<_> = (0..5)
        .map(|n| {
            let mut entry = entry(&format!("e{n}"), n % 2 == 0);
            entry.observed_at = format!("2026-10-27T10:0{n}:00.000Z");
            entry.summary = format!("Summary {n} 100%");
            entry
        })
        .collect();
    commit(&store, with_entries(2, entries)).await.unwrap();

    let first = list(&store, ActivityListQuery { limit: 2, ..all() }).await;
    assert_eq!(first.total, 5);
    let ids: Vec<_> = first.entries.iter().map(|row| row.id.clone()).collect();
    assert_eq!(ids, vec![format!("{SOURCE}|e4"), format!("{SOURCE}|e3")]);
    let last = first.entries.last().unwrap();
    let second = list(
        &store,
        ActivityListQuery {
            limit: 2,
            before: Some(ActivityCursor {
                observed_at: last.observed_at.clone(),
                id: last.id.clone(),
            }),
            ..all()
        },
    )
    .await;
    assert_eq!(second.entries[0].id, format!("{SOURCE}|e2"));

    let needs = list(
        &store,
        ActivityListQuery {
            filter: ActivityFilter::NeedsYou,
            ..all()
        },
    )
    .await;
    assert_eq!(needs.total, 3);

    let search = list(
        &store,
        ActivityListQuery {
            search: Some("summary 3 100%".into()),
            ..all()
        },
    )
    .await;
    assert_eq!(search.total, 1);
    let literal = list(
        &store,
        ActivityListQuery {
            search: Some("_".into()),
            ..all()
        },
    )
    .await;
    assert_eq!(literal.total, 0, "LIKE wildcards are matched literally");
}

#[tokio::test]
async fn clear_keeps_the_baseline_and_prune_keeps_unread() {
    let (_dir, store) = seeded().await;
    let mut old_read = entry("old-read", false);
    old_read.observed_at = "2026-01-01T00:00:00.000Z".into();
    let mut old_unread = entry("old-unread", false);
    old_unread.observed_at = "2026-01-01T00:00:00.000Z".into();
    commit(&store, with_entries(2, vec![old_read, old_unread]))
        .await
        .unwrap();
    mark(
        &store,
        ActivityMarkRequest {
            ids: vec![format!("{SOURCE}|old-read")],
            entity_keys: vec![],
            before: None,
            read: "read".into(),
            reason: None,
        },
    )
    .await
    .unwrap();
    let pruned = store
        .db
        .with_writer(|conn| {
            queries::write(conn, |tx| Ok((queries::prune(tx, &queries::now())?, false)))
        })
        .await
        .unwrap()
        .0;
    assert_eq!(pruned, 1);
    assert_eq!(read_of(&store, "old-unread").await, ("unread".into(), None));

    let cleared = store
        .db
        .with_writer(|conn| {
            queries::write(conn, |tx| Ok((queries::clear(tx, Some(SOURCE))?, false)))
        })
        .await
        .unwrap()
        .0;
    assert_eq!(cleared, 1);
    assert_eq!(count(&store, "SELECT COUNT(*) FROM outbox").await, 0);
    let state = open_source(&store, request("env-1")).await.unwrap();
    assert_eq!(state.revision, Some(2));
}

#[tokio::test]
async fn counts_split_by_category_and_source() {
    let (_dir, store) = seeded().await;
    commit(
        &store,
        with_entries(
            2,
            vec![entry("q", true), entry("t1", false), entry("t2", false)],
        ),
    )
    .await
    .unwrap();
    let counts = store
        .db
        .with_store(|conn| queries::counts(conn))
        .await
        .unwrap();
    assert_eq!(counts.unread, 3);
    assert_eq!(counts.needs_you, 1);
    assert_eq!(counts.by_category["agent.turn"].unread, 2);
    assert_eq!(counts.by_category["agent.question"].needs_you, 1);
    assert_eq!(counts.by_source[SOURCE].unread, 3);
}

#[tokio::test]
async fn a_newer_journal_is_read_only_and_says_so() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("activity.db");
    {
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA user_version = 42;").unwrap();
    }
    let store = ActivityDb::at(path);
    let info = store_info(&store).await.unwrap();
    assert!(info.read_only);
    assert_eq!(info.schema_version, 42);
    let error = open_source(&store, request("env-1")).await.unwrap_err();
    assert_eq!(error, super::READ_ONLY_MESSAGE);
}

#[tokio::test]
async fn a_corrupt_journal_is_moved_aside_and_reported() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("activity.db");
    std::fs::write(&path, b"not sqlite".repeat(300)).unwrap();
    let store = ActivityDb::at(path);
    let info = store_info(&store).await.unwrap();
    assert!(!info.read_only);
    let aside = info.recovered_from.expect("reported");
    assert!(aside.contains("activity.db.corrupt-"), "{aside}");
    open_source(&store, request("env-1")).await.unwrap();
}

#[tokio::test]
async fn export_writes_sources_and_entries() {
    let (dir, store) = seeded().await;
    commit(&store, with_entries(2, vec![entry("a", false)]))
        .await
        .unwrap();
    let file = dir.path().join("export.json").display().to_string();
    let target = file.clone();
    let written = store
        .db
        .with_store(move |conn| queries::export(conn, &target, &queries::now()))
        .await
        .unwrap();
    assert_eq!(written, 1);
    let document: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    assert_eq!(document["entries"][0]["id"], format!("{SOURCE}|a"));
    assert_eq!(document["sources"][0]["sourceId"], SOURCE);
}
