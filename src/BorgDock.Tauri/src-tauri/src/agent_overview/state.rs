use crate::agent_overview::types::{RawEvent, SessionRecord, SessionState};
use serde_json::Value;
use std::time::{Duration, Instant};

/// Mutate `record` in response to an OTel event. Pure except for the
/// `Instant::now()` reference passed in via `now`. Returns true if any
/// observable field changed (caller decides whether to emit a delta).
pub fn apply_event(record: &mut SessionRecord, event: &RawEvent, now: Instant) -> bool {
    let before = snapshot(record);
    record.last_event_at = now;

    match event.event_name.as_str() {
        "user_prompt" => {
            if let Some(prompt) = event.attrs.get("prompt").and_then(Value::as_str) {
                record.last_user_msg = Some(prompt.to_string());
            }
            transition(record, SessionState::Working, now);
        }
        "api_request" => {
            if let Some(model) = event.attrs.get("model").and_then(Value::as_str) {
                record.model = Some(model.to_string());
            }
            for key in ["input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens"] {
                if let Some(n) = event.attrs.get(key).and_then(Value::as_u64) {
                    record.tokens_used = record.tokens_used.saturating_add(n);
                }
            }
            let stop = event.attrs.get("stop_reason").and_then(Value::as_str);
            record.last_api_stop_reason = stop.map(str::to_string);
            match stop {
                Some("tool_use") => transition(record, SessionState::Tool, now),
                Some("end_turn") => transition(record, SessionState::Finished, now),
                _ => {}
            }
        }
        "tool_result" => {
            if let Some(id) = event.attrs.get("tool_use_id").and_then(Value::as_str) {
                record.pending_tool_uses.remove(id);
            }
            update_task_narrative(record, event);
            if record.pending_tool_uses.is_empty()
                && record.last_api_stop_reason.as_deref() == Some("tool_use")
            {
                transition(record, SessionState::Working, now);
            }
        }
        _ => {}
    }

    // Awaiting/Finished hide the task narrative (the card surfaces last_user_msg
    // instead). Idle/Ended keep the last-known narrative so it renders greyed.
    if matches!(record.state, SessionState::Awaiting | SessionState::Finished) {
        record.task = None;
    }

    snapshot(record) != before
}

/// Build the per-card narrative from a tool_result event. Examples:
///   - "Running pnpm test"
///   - "Editing widget-binding.ts"
///   - "Reading pr-card.jsx"
fn update_task_narrative(record: &mut SessionRecord, event: &RawEvent) {
    let tool_name = event.attrs.get("tool_name").and_then(Value::as_str);
    let Some(tool) = tool_name else { return };
    let parameters = event
        .attrs
        .get("tool_parameters")
        .and_then(Value::as_str)
        .and_then(|s| serde_json::from_str::<Value>(s).ok());
    let target = match tool {
        "Bash" => parameters
            .as_ref()
            .and_then(|p| p.get("full_command").or_else(|| p.get("bash_command")))
            .and_then(Value::as_str)
            .map(|c| c.split_whitespace().take(2).collect::<Vec<_>>().join(" ")),
        "Edit" | "Write" | "Read" | "NotebookEdit" => event
            .attrs
            .get("file_path")
            .and_then(Value::as_str)
            .map(|p| std::path::Path::new(p)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| p.to_string())),
        _ => None,
    };
    let verb = match tool {
        "Bash" => "Running",
        "Edit" | "Write" | "NotebookEdit" => "Editing",
        "Read" => "Reading",
        _ => return,
    };
    record.task = Some(match target {
        Some(t) => format!("{verb} {t}"),
        None => format!("{verb} {tool}"),
    });
}

/// Wall-clock ticker — flips long-idle states. Called once per second from
/// the SessionStore loop. Returns true if state changed.
pub fn apply_tick(
    record: &mut SessionRecord,
    now: Instant,
    idle_after: Duration,
    ended_after: Duration,
    finished_to_awaiting_after: Duration,
) -> bool {
    let before = record.state;
    let since_event = now.saturating_duration_since(record.last_event_at);
    let since_state = now.saturating_duration_since(record.state_since);

    // At most one transition per tick. If a long pause means multiple
    // thresholds have all elapsed (rare — happens only when the ticker
    // was paused or sleeping), we still surface each intermediate state
    // for at least one tick so the UI / notification tracker can react
    // to it. With a 1Hz ticker, even a four-state cascade resolves in
    // ~4 seconds, well below any human-perceivable lag.
    if record.state == SessionState::Finished && since_state > finished_to_awaiting_after {
        transition(record, SessionState::Awaiting, now);
    } else if matches!(
        record.state,
        SessionState::Working | SessionState::Tool | SessionState::Awaiting | SessionState::Finished
    ) && since_event > idle_after
    {
        transition(record, SessionState::Idle, now);
    } else if record.state == SessionState::Idle && since_event > ended_after {
        transition(record, SessionState::Ended, now);
    }

    record.state != before
}

fn transition(record: &mut SessionRecord, next: SessionState, now: Instant) {
    if record.state != next {
        record.state = next;
        record.state_since = now;
    }
}

/// Fingerprint of the observable fields. `apply_event` returns `true` when
/// this changes — that signal drives whether the SessionStore emits a delta
/// to the React side. `task` belongs here because tool_result events update
/// the narrative without changing state, and the card text needs to refresh
/// even on those tick-less updates.
fn snapshot(
    record: &SessionRecord,
) -> (
    SessionState,
    u64,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    (
        record.state,
        record.tokens_used,
        record.last_user_msg.clone(),
        record.last_api_stop_reason.clone(),
        record.task.clone(),
        record.model.clone(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, HashSet};
    use std::path::PathBuf;

    fn make_record(state: SessionState, now: Instant) -> SessionRecord {
        SessionRecord {
            session_id: "sid".into(),
            cwd: PathBuf::from("/x"),
            repo: "BD".into(),
            worktree: "master".into(),
            branch: "master".into(),
            label: "BD · master #1".into(),
            state,
            state_since: now,
            last_event_at: now,
            last_user_msg: None,
            task: None,
            model: None,
            tokens_used: 0,
            tokens_max: 200_000,
            last_api_stop_reason: None,
            pending_tool_uses: HashSet::new(),
            state_since_ms: 0,
            last_event_ms: 0,
        }
    }

    fn ev(name: &str, attrs: &[(&str, Value)]) -> RawEvent {
        RawEvent {
            session_id: "sid".into(),
            event_name: name.into(),
            attrs: attrs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect::<HashMap<_, _>>(),
        }
    }

    #[test]
    fn user_prompt_moves_to_working_and_records_msg() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Idle, now - Duration::from_secs(60));
        let changed = apply_event(&mut r, &ev("user_prompt", &[("prompt", Value::String("hi".into()))]), now);
        assert!(changed);
        assert_eq!(r.state, SessionState::Working);
        assert_eq!(r.last_user_msg.as_deref(), Some("hi"));
    }

    #[test]
    fn api_request_tool_use_moves_to_tool() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        apply_event(&mut r, &ev("api_request", &[
            ("stop_reason", Value::String("tool_use".into())),
            ("input_tokens", Value::from(100u64)),
            ("output_tokens", Value::from(50u64)),
        ]), now);
        assert_eq!(r.state, SessionState::Tool);
        assert_eq!(r.tokens_used, 150);
        assert_eq!(r.last_api_stop_reason.as_deref(), Some("tool_use"));
    }

    #[test]
    fn api_request_end_turn_moves_to_finished() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        apply_event(&mut r, &ev("api_request", &[("stop_reason", Value::String("end_turn".into()))]), now);
        assert_eq!(r.state, SessionState::Finished);
    }

    #[test]
    fn tool_result_returns_to_working_when_no_pending_remain() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Tool, now);
        r.last_api_stop_reason = Some("tool_use".into());
        r.pending_tool_uses.insert("toolu_1".into());
        apply_event(&mut r, &ev("tool_result", &[("tool_use_id", Value::String("toolu_1".into()))]), now);
        assert_eq!(r.state, SessionState::Working);
    }

    #[test]
    fn finished_flips_to_awaiting_after_30s() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Finished, now - Duration::from_secs(31));
        let changed = apply_tick(
            &mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30),
        );
        assert!(changed);
        assert_eq!(r.state, SessionState::Awaiting);
    }

    #[test]
    fn long_silence_moves_to_idle_then_ended() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        r.last_event_at = now - Duration::from_secs(301);
        apply_tick(&mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30));
        assert_eq!(r.state, SessionState::Idle);

        r.last_event_at = now - Duration::from_secs(1801);
        apply_tick(&mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30));
        assert_eq!(r.state, SessionState::Ended);
    }

    #[test]
    fn working_with_no_stop_reason_does_not_speculatively_become_awaiting() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        r.last_event_at = now - Duration::from_secs(10);
        apply_tick(&mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30));
        assert_eq!(r.state, SessionState::Working);
    }

    #[test]
    fn tick_does_not_skip_awaiting_when_both_thresholds_have_elapsed() {
        // Regression: when a session has been Finished for longer than the
        // idle threshold (e.g., after a paused ticker), the cascade must
        // surface Awaiting on this tick and Idle on the next, not skip
        // Awaiting in a single call. Otherwise the user never gets the
        // "needs you back" notification.
        let now = Instant::now();
        let mut r = make_record(SessionState::Finished, now - Duration::from_secs(400));
        r.last_event_at = now - Duration::from_secs(400);
        let changed = apply_tick(
            &mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30),
        );
        assert!(changed);
        assert_eq!(r.state, SessionState::Awaiting);

        // Next tick: now Awaiting + still > idle_after → Idle.
        let later = now + Duration::from_secs(1);
        apply_tick(
            &mut r, later,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30),
        );
        assert_eq!(r.state, SessionState::Idle);
    }

    #[test]
    fn task_narrative_change_returns_changed_true() {
        // Regression: tool_result events update the task narrative without
        // necessarily changing state. The change-detection snapshot must
        // include `task`, otherwise the SessionStore won't emit a delta
        // and the React card text will stale.
        let now = Instant::now();
        let mut r = make_record(SessionState::Tool, now);
        r.last_api_stop_reason = Some("tool_use".into());
        // Two pending tools so the first tool_result doesn't transition to Working.
        r.pending_tool_uses.insert("toolu_a".into());
        r.pending_tool_uses.insert("toolu_b".into());
        let changed = apply_event(
            &mut r,
            &ev("tool_result", &[
                ("tool_use_id", Value::String("toolu_a".into())),
                ("tool_name", Value::String("Edit".into())),
                ("file_path", Value::String("E:\\BorgDock\\src\\foo.ts".into())),
            ]),
            now,
        );
        assert!(changed, "task narrative changed but apply_event returned false");
        assert_eq!(r.state, SessionState::Tool);
        assert_eq!(r.task.as_deref(), Some("Editing foo.ts"));
    }
}
