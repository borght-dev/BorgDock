//! Phone push: entries that need me, still unread once I have been away from
//! the laptop for a while, go to a webhook. Home Assistant is the first
//! preset: BorgDock posts `{ title, message, url, tag, group, severity }`
//! to `<ha>/api/webhook/<id>`, and `{ tag, clear: true }` once a pushed
//! entry is read, resolved or dismissed, so the phone withdraws it. The
//! webhook URL and an optional token live in the keychain as
//! `borgdock:activity-push`, never in settings.

use super::dto::{ActivityEntryRow, ActivityOutboxAck, ActivityOutboxItem, ActivityOutboxOutcome};
use super::{queries, ActivityDb};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::LazyLock;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const PUSH_SERVICE: &str = "borgdock:activity-push";
/// More ready entries than this go out as one message.
const BATCH_OVER: usize = 3;
/// A push not sent by then is stale: the moment has passed.
const EXPIRE_HOURS: i64 = 12;
const SWEEP: Duration = Duration::from_secs(60);
const SEND_TIMEOUT: Duration = Duration::from_secs(15);

static WAKE: LazyLock<tokio::sync::Notify> = LazyLock::new(tokio::sync::Notify::new);

/// A commit or a mark may have queued a push or a clear: look now.
pub fn wake() {
    WAKE.notify_one();
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Target {
    url: String,
    token: Option<String>,
}

/// What Settings shows about the webhook; the token itself never leaves Rust.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityPushTarget {
    pub url: Option<String>,
    pub has_token: bool,
}

/// What one cycle decided: messages to send with the outbox rows they settle,
/// and rows to settle without sending.
#[derive(Debug, Default)]
pub struct Plan {
    pub messages: Vec<(Value, Vec<(String, String)>)>,
    pub settle: Vec<ActivityOutboxAck>,
}

#[derive(Debug, Clone)]
pub struct PushOptions {
    pub away: bool,
    pub hide_titles: bool,
}

fn payload_of(row: &ActivityEntryRow) -> Value {
    serde_json::from_str(&row.payload).unwrap_or(Value::Null)
}

/// What a hidden-title push says: the kind of update, never its title.
fn generic(category: &str) -> &'static str {
    match category {
        "agent.question" => "An agent asks a question",
        "agent.plan" => "An agent has a plan to approve",
        "agent.approval" => "An agent needs approval",
        "agent.failed" => "An agent stopped with an error",
        "agent.interrupted" => "An agent was interrupted",
        "agent.limited" => "An agent hit a usage limit",
        "pr.review" => "A review on your PR",
        "pr.findings" => "Claude found an issue on your PR",
        "pr.review-request" => "Your review is requested",
        "pr.checks-failed" => "Checks fail on your PR",
        "pr.conflict" => "Your PR has a merge conflict",
        "deploy.pr" | "deploy.failed" => "A deploy failed",
        "ado.assigned" => "An item was assigned to you",
        "ado.state" => "Someone moved your item",
        "ado.comment" => "A comment on your item",
        category if category.starts_with("ci.") => "A shared CI failure needs you",
        category if category.starts_with("workstream.") => "A workstream needs you",
        _ => "An update needs you",
    }
}

fn message_of(row: &ActivityEntryRow, source: &str, options: &PushOptions) -> Value {
    let payload = payload_of(row);
    let url = payload["entity"]["url"].as_str().map(str::to_string);
    let (title, message) = if options.hide_titles {
        (generic(&row.category).to_string(), source.to_string())
    } else {
        let detail = row
            .detail
            .as_deref()
            .and_then(|detail| detail.lines().map(str::trim).find(|line| !line.is_empty()))
            .map(str::to_string);
        (
            row.summary.clone(),
            detail.unwrap_or_else(|| source.to_string()),
        )
    };
    json!({
        "title": title,
        // A T3 thread has no web address yet: the message says where to look.
        "message": if url.is_none() && !options.hide_titles {
            format!("{message} ({source})")
        } else {
            message
        },
        "url": url,
        "tag": row.entity_key,
        "group": row.category,
        "severity": row.severity,
    })
}

fn batch_of(rows: &[&ActivityEntryRow], options: &PushOptions) -> Value {
    let lines: Vec<String> = rows
        .iter()
        .map(|row| {
            if options.hide_titles {
                format!("• {}", generic(&row.category))
            } else {
                format!("• {}", row.summary)
            }
        })
        .collect();
    let severity = if rows.iter().any(|row| row.severity == "error") {
        "error"
    } else {
        "warning"
    };
    json!({
        "title": format!("{} updates need you", rows.len()),
        "message": lines.join("\n"),
        "url": null,
        "tag": "borgdock-batch",
        "group": "batch",
        "severity": severity,
    })
}

fn source_label(conn: &rusqlite::Connection, source_id: &str) -> String {
    conn.query_row(
        "SELECT label FROM sources WHERE source_id = ?1",
        [source_id],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| source_id.to_string())
}

fn ack(item: &ActivityOutboxItem, outcome: ActivityOutboxOutcome) -> ActivityOutboxAck {
    ActivityOutboxAck {
        entry_id: item.entry.id.clone(),
        channel: item.channel.clone(),
        outcome,
    }
}

fn older_than(created_at: &str, now: &str, hours: i64) -> bool {
    match (
        chrono::DateTime::parse_from_rfc3339(created_at),
        chrono::DateTime::parse_from_rfc3339(now),
    ) {
        (Ok(created), Ok(now)) => now - created > chrono::Duration::hours(hours),
        _ => false,
    }
}

/// Decide one cycle. Clears always go; pushes only while I am away, for
/// entries still unread and open, batched past three, dropped after 12 hours.
pub fn plan(conn: &rusqlite::Connection, now: &str, options: &PushOptions) -> Result<Plan, String> {
    let mut plan = Plan::default();
    for item in queries::outbox_take(conn, "push-clear", 100, now)? {
        plan.messages.push((
            json!({ "tag": item.entry.entity_key, "clear": true }),
            vec![(item.entry.id.clone(), item.channel.clone())],
        ));
    }
    if !options.away {
        return Ok(plan);
    }
    let mut ready: Vec<ActivityOutboxItem> = Vec::new();
    for item in queries::outbox_take(conn, "push", 100, now)? {
        if older_than(&item.created_at, now, EXPIRE_HOURS) {
            plan.settle.push(ack(&item, ActivityOutboxOutcome::Dropped));
        } else if item.entry.read != "unread" || item.entry.status != "open" {
            plan.settle.push(ack(&item, ActivityOutboxOutcome::Skipped));
        } else {
            ready.push(item);
        }
    }
    if ready.len() > BATCH_OVER {
        let rows: Vec<&ActivityEntryRow> = ready.iter().map(|item| &item.entry).collect();
        plan.messages.push((
            batch_of(&rows, options),
            ready
                .iter()
                .map(|item| (item.entry.id.clone(), item.channel.clone()))
                .collect(),
        ));
    } else {
        for item in &ready {
            let source = source_label(conn, &item.entry.source_id);
            plan.messages.push((
                message_of(&item.entry, &source, options),
                vec![(item.entry.id.clone(), item.channel.clone())],
            ));
        }
    }
    Ok(plan)
}

/// The acks for a plan once its messages were sent (`true`) or failed.
pub fn acks_after(plan: &Plan, sent: &[bool]) -> Vec<ActivityOutboxAck> {
    let mut acks = plan.settle.clone();
    for ((_, rows), ok) in plan.messages.iter().zip(sent) {
        let outcome = if *ok {
            ActivityOutboxOutcome::Sent
        } else {
            ActivityOutboxOutcome::Retry
        };
        acks.extend(rows.iter().map(|(entry_id, channel)| ActivityOutboxAck {
            entry_id: entry_id.clone(),
            channel: channel.clone(),
            outcome,
        }));
    }
    acks
}

fn read_target() -> Result<Option<Target>, String> {
    let Some(text) = crate::keychain::get_credential_blocking(PUSH_SERVICE)? else {
        return Ok(None);
    };
    Ok(serde_json::from_str::<Target>(&text).ok())
}

async fn post(target: &Target, body: &Value) -> Result<(), String> {
    let mut request = crate::http::client()
        .post(&target.url)
        .timeout(SEND_TIMEOUT)
        .json(body);
    if let Some(token) = target.token.as_deref().filter(|t| !t.is_empty()) {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("The webhook answered {}", response.status()))
    }
}

async fn cycle(app: &AppHandle) -> Result<(), String> {
    let Some(db) = app
        .try_state::<ActivityDb>()
        .map(|state| state.inner().clone())
    else {
        return Ok(());
    };
    let (settings, target) = tokio::task::spawn_blocking(|| {
        let settings = crate::settings::load_settings_internal()?;
        Ok::<_, String>((settings.notifications.activity.push, read_target()?))
    })
    .await
    .map_err(|e| e.to_string())??;
    let Some(target) = target else { return Ok(()) };
    let idle = crate::platform::idle::seconds_since_input();
    let options = PushOptions {
        away: settings.enabled
            && idle.is_some_and(|seconds| seconds >= u64::from(settings.away_minutes) * 60),
        hide_titles: settings.hide_titles,
    };
    // Clears still go after push was switched off: the phone should not keep stale ones.
    let plan = db
        .db
        .with_store(move |conn| plan(conn, &queries::now(), &options))
        .await?;
    if plan.messages.is_empty() && plan.settle.is_empty() {
        return Ok(());
    }
    let mut sent = Vec::with_capacity(plan.messages.len());
    for (body, _) in &plan.messages {
        let result = post(&target, body).await;
        if let Err(error) = &result {
            log::warn!("activity push failed: {error}");
        }
        sent.push(result.is_ok());
    }
    let acks = acks_after(&plan, &sent);
    db.db
        .with_writer(move |conn| {
            queries::write(conn, |tx| {
                Ok((queries::outbox_ack(tx, &acks, &queries::now())?, false))
            })
        })
        .await?;
    Ok(())
}

/// The push task: wakes on every commit and mark, and once a minute.
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = cycle(&app).await {
                log::warn!("activity push cycle failed: {error}");
            }
            tokio::select! {
                _ = WAKE.notified() => {}
                _ = tokio::time::sleep(SWEEP) => {}
            }
        }
    });
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_push_target() -> Result<ActivityPushTarget, String> {
    tokio::task::spawn_blocking(|| {
        let target = read_target()?;
        Ok(ActivityPushTarget {
            url: target.as_ref().map(|t| t.url.clone()),
            has_token: target.is_some_and(|t| t.token.is_some_and(|token| !token.is_empty())),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Store the webhook; an empty URL removes it. A `None` token keeps the stored one.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_push_save(url: String, token: Option<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let entry = crate::keychain::entry(PUSH_SERVICE)?;
        let url = url.trim().to_string();
        if url.is_empty() {
            return match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(error) => Err(format!("Failed to remove the webhook: {error}")),
            };
        }
        if !url.starts_with("https://") && !url.starts_with("http://") {
            return Err("The webhook address must start with https:// or http://".to_string());
        }
        let token = match token {
            Some(token) => Some(token).filter(|t| !t.is_empty()),
            None => read_target()?.and_then(|t| t.token),
        };
        let text = serde_json::to_string(&Target { url, token }).map_err(|e| e.to_string())?;
        entry
            .set_password(&text)
            .map_err(|e| format!("Failed to store the webhook: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Send a test push now, away or not.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn activity_push_test() -> Result<(), String> {
    let target = tokio::task::spawn_blocking(read_target)
        .await
        .map_err(|e| e.to_string())??
        .ok_or_else(|| "Set the webhook address first.".to_string())?;
    post(
        &target,
        &json!({
            "title": "BorgDock",
            "message": "Pushes from Activity arrive here.",
            "url": null,
            "tag": "borgdock-test",
            "group": "test",
            "severity": "info",
        }),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::activity::dto::*;

    fn store() -> rusqlite::Connection {
        let conn = crate::sqlite_store::open_in_memory(&crate::activity::SPEC);
        conn.execute(
            "INSERT INTO sources (source_id, kind, label, config_key, generation, revision) \
             VALUES ('t3:local', 't3', 'This laptop', 'env', 1, 0)",
            [],
        )
        .unwrap();
        conn
    }

    fn add(conn: &mut rusqlite::Connection, id: &str, read: &str, created_at: &str) {
        let tx = conn.transaction().unwrap();
        tx.execute(
            "INSERT INTO entries (id, source_id, entity_key, category, severity, needs_you, status, \
             observed_at, coverage, summary, detail, payload, read, version) \
             VALUES (?1, 't3:local', ?2, 'agent.question', 'warning', 1, 'open', ?3, 'live', \
             ?4, 'Option A or B?', '{\"entity\":{\"url\":null}}', ?5, 1)",
            rusqlite::params![
                id,
                format!("t3:local:thread:{id}"),
                created_at,
                format!("W3 asks about {id}"),
                read
            ],
        )
        .unwrap();
        tx.execute(
            "INSERT INTO outbox (entry_id, channel, state, attempts, next_at, created_at) \
             VALUES (?1, 'push', 'pending', 0, ?2, ?2)",
            rusqlite::params![id, created_at],
        )
        .unwrap();
        tx.commit().unwrap();
    }

    const NOW: &str = "2026-10-27T12:00:00.000Z";
    const AWAY: PushOptions = PushOptions {
        away: true,
        hide_titles: false,
    };

    #[test]
    fn nothing_goes_while_i_am_at_the_laptop() {
        let mut conn = store();
        add(&mut conn, "a", "unread", "2026-10-27T11:59:00.000Z");
        let plan = plan(
            &conn,
            NOW,
            &PushOptions {
                away: false,
                hide_titles: false,
            },
        )
        .unwrap();
        assert!(plan.messages.is_empty());
        assert!(plan.settle.is_empty());
    }

    #[test]
    fn a_read_entry_is_skipped_and_an_old_one_dropped() {
        let mut conn = store();
        add(&mut conn, "read", "read", "2026-10-27T11:59:00.000Z");
        add(&mut conn, "old", "unread", "2026-10-26T20:00:00.000Z");
        add(&mut conn, "new", "unread", "2026-10-27T11:59:00.000Z");
        let plan = plan(&conn, NOW, &AWAY).unwrap();
        let outcomes: Vec<(String, ActivityOutboxOutcome)> = plan
            .settle
            .iter()
            .map(|ack| (ack.entry_id.clone(), ack.outcome))
            .collect();
        assert!(outcomes.contains(&("read".into(), ActivityOutboxOutcome::Skipped)));
        assert!(outcomes.contains(&("old".into(), ActivityOutboxOutcome::Dropped)));
        assert_eq!(plan.messages.len(), 1);
        let (body, rows) = &plan.messages[0];
        assert_eq!(rows, &vec![("new".to_string(), "push".to_string())]);
        assert_eq!(body["title"], "W3 asks about new");
        assert_eq!(body["message"], "Option A or B? (This laptop)");
        assert_eq!(body["tag"], "t3:local:thread:new");
        assert_eq!(body["group"], "agent.question");
    }

    #[test]
    fn more_than_three_go_as_one_message() {
        let mut conn = store();
        for id in ["a", "b", "c", "d"] {
            add(&mut conn, id, "unread", "2026-10-27T11:59:00.000Z");
        }
        let plan = plan(&conn, NOW, &AWAY).unwrap();
        assert_eq!(plan.messages.len(), 1);
        let (body, rows) = &plan.messages[0];
        assert_eq!(rows.len(), 4);
        assert_eq!(body["title"], "4 updates need you");
        assert_eq!(body["tag"], "borgdock-batch");
    }

    #[test]
    fn hidden_titles_say_only_what_kind_of_update() {
        let mut conn = store();
        add(&mut conn, "a", "unread", "2026-10-27T11:59:00.000Z");
        let plan = plan(
            &conn,
            NOW,
            &PushOptions {
                away: true,
                hide_titles: true,
            },
        )
        .unwrap();
        let (body, _) = &plan.messages[0];
        assert_eq!(body["title"], "An agent asks a question");
        assert_eq!(body["message"], "This laptop");
    }

    #[test]
    fn a_handled_entry_sends_a_clear_even_while_i_am_here() {
        let mut conn = store();
        add(&mut conn, "a", "unread", "2026-10-27T11:59:00.000Z");
        conn.execute(
            "UPDATE outbox SET state = 'sent' WHERE entry_id = 'a' AND channel = 'push'",
            [],
        )
        .unwrap();
        {
            let tx = conn.transaction().unwrap();
            queries::mark(
                &tx,
                &ActivityMarkRequest {
                    ids: vec!["a".into()],
                    entity_keys: vec![],
                    before: None,
                    read: "read".into(),
                    reason: None,
                },
                NOW,
            )
            .unwrap();
            tx.commit().unwrap();
        }
        let plan = plan(
            &conn,
            "2026-10-27T12:00:01.000Z",
            &PushOptions {
                away: false,
                hide_titles: false,
            },
        )
        .unwrap();
        assert_eq!(plan.messages.len(), 1);
        assert_eq!(
            plan.messages[0].0,
            json!({ "tag": "t3:local:thread:a", "clear": true })
        );
    }

    #[test]
    fn a_failed_send_backs_off_and_a_sent_one_is_done() {
        let mut conn = store();
        add(&mut conn, "a", "unread", "2026-10-27T11:59:00.000Z");
        add(&mut conn, "b", "unread", "2026-10-27T11:59:00.000Z");
        let plan = plan(&conn, NOW, &AWAY).unwrap();
        let acks = acks_after(&plan, &[true, false]);
        {
            let tx = conn.transaction().unwrap();
            queries::outbox_ack(&tx, &acks, NOW).unwrap();
            tx.commit().unwrap();
        }
        let state = |id: &str| -> (String, i64, String) {
            conn.query_row(
                "SELECT state, attempts, next_at FROM outbox WHERE entry_id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap()
        };
        assert_eq!(state("a").0, "sent");
        let (b_state, attempts, next_at) = state("b");
        assert_eq!((b_state.as_str(), attempts), ("pending", 1));
        assert_eq!(
            next_at, "2026-10-27T12:01:00.000Z",
            "one minute before the first retry"
        );
        let again = super::plan(&conn, "2026-10-27T12:00:30.000Z", &AWAY).unwrap();
        assert!(again.messages.is_empty(), "not due yet");
    }

    #[tokio::test]
    async fn the_sender_posts_json_with_the_token() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0u8; 4096];
            let read = socket.read(&mut buffer).await.unwrap();
            socket
                .write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 0\r\n\r\n")
                .await
                .unwrap();
            String::from_utf8_lossy(&buffer[..read]).to_string()
        });
        let target = Target {
            url: format!("http://{address}/api/webhook/borgdock"),
            token: Some("secret".into()),
        };
        post(
            &target,
            &json!({ "tag": "t3:local:thread:a", "clear": true }),
        )
        .await
        .unwrap();
        let request = server.await.unwrap();
        assert!(
            request.starts_with("POST /api/webhook/borgdock"),
            "{request}"
        );
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer secret"));
        assert!(request.contains("\"clear\":true"));
    }
}
