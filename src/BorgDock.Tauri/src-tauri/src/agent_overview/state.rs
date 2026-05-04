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
                record.last_user_msg = Some(sanitize_user_prompt(prompt));
            }
            // A new prompt starts a new turn: clear any stale pending tools
            // and the post-api_request finish-debounce signal.
            record.pending_tool_uses.clear();
            record.last_api_request_at = None;
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
            record.last_api_stop_reason = event
                .attrs
                .get("stop_reason")
                .and_then(Value::as_str)
                .map(str::to_string);
            // Mark "model just emitted a complete request". If a tool_decision
            // follows within working_to_finished_after, the tick won't fire
            // Finished. If nothing follows, the tick declares Finished after
            // the threshold elapses.
            record.last_api_request_at = Some(now);
            // If silence detection wrongly flipped this session to
            // Finished/Awaiting while the model was still thinking, a fresh
            // api_request rescues it back to Working.
            if matches!(record.state, SessionState::Finished | SessionState::Awaiting) {
                transition(record, SessionState::Working, now);
            }
        }
        "tool_decision" => {
            if let Some(id) = event.attrs.get("tool_use_id").and_then(Value::as_str) {
                record.pending_tool_uses.insert(id.to_string());
            }
            // Tool calls mean the model isn't done — cancel the pending
            // Finished signal from the prior api_request.
            record.last_api_request_at = None;
            transition(record, SessionState::Tool, now);
        }
        "tool_result" => {
            if let Some(id) = event.attrs.get("tool_use_id").and_then(Value::as_str) {
                record.pending_tool_uses.remove(id);
            }
            update_task_narrative(record, event);
            if record.pending_tool_uses.is_empty() {
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
///   - "Globbing **/*.cs"
///   - "Agent: Backend codebase health audit"
///
/// Real Claude OTel uses `tool_input` (JSON-encoded string with the canonical
/// per-tool parameter shape). `tool_parameters` is the older alias kept only
/// as a fallback for older claude versions.
fn update_task_narrative(record: &mut SessionRecord, event: &RawEvent) {
    let tool_name = event.attrs.get("tool_name").and_then(Value::as_str);
    let Some(tool) = tool_name else { return };
    let input = parsed_tool_input(event);

    // Agent is special: render the sub-agent's `description`, never the prompt.
    if tool == "Agent" {
        let desc = input
            .as_ref()
            .and_then(|p| p.get("description"))
            .and_then(Value::as_str)
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Sub-agent".into());
        record.task = Some(format!("Agent: {desc}"));
        return;
    }

    let target = match tool {
        "Bash" | "PowerShell" => input
            .as_ref()
            .and_then(|p| {
                p.get("command")
                    .or_else(|| p.get("full_command"))
                    .or_else(|| p.get("bash_command"))
            })
            .and_then(Value::as_str)
            .map(|c| c.split_whitespace().take(2).collect::<Vec<_>>().join(" ")),
        "Edit" | "Write" | "Read" | "NotebookEdit" => input
            .as_ref()
            .and_then(|p| p.get("file_path"))
            .or_else(|| event.attrs.get("file_path"))
            .and_then(Value::as_str)
            .map(|p| {
                std::path::Path::new(p)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| p.to_string())
            }),
        "Glob" | "Grep" => input
            .as_ref()
            .and_then(|p| p.get("pattern"))
            .and_then(Value::as_str)
            .map(str::to_string),
        _ => None,
    };
    let verb = match tool {
        "Bash" | "PowerShell" => "Running",
        "Edit" | "Write" | "NotebookEdit" => "Editing",
        "Read" => "Reading",
        "Glob" => "Globbing",
        "Grep" => "Grepping",
        _ => return,
    };
    record.task = Some(match target {
        Some(t) => format!("{verb} {t}"),
        None => format!("{verb} {tool}"),
    });
}

/// Maximum chars of user prompt to surface on a card. The OTel `prompt`
/// field is the full user-facing message including injected sub-agent
/// completion blobs, which can be many KB.
const PROMPT_DISPLAY_MAX: usize = 200;

/// Pre-process a `user_prompt.prompt` payload for card display:
/// - When the prompt is a `<task-notification>` blob (sub-agent completion
///   re-injected by Claude), extract the `<summary>` text — the rest is noise.
/// - Otherwise truncate to `PROMPT_DISPLAY_MAX` chars with an ellipsis.
fn sanitize_user_prompt(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.contains("<task-notification>") {
        if let Some(summary) = extract_xml_tag(trimmed, "summary") {
            return summary.trim().to_string();
        }
    }
    truncate_with_ellipsis(trimmed, PROMPT_DISPLAY_MAX)
}

/// Pull the inner text of the first `<tag>...</tag>` occurrence. Tolerant
/// of surrounding whitespace; returns None if the tag isn't found.
fn extract_xml_tag(s: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = s.find(&open)? + open.len();
    let end = s[start..].find(&close)?;
    Some(s[start..start + end].to_string())
}

fn truncate_with_ellipsis(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}

/// Parse the canonical `tool_input` JSON-string field, falling back to the
/// older `tool_parameters` field for compatibility with pre-2.1 Claude.
fn parsed_tool_input(event: &RawEvent) -> Option<Value> {
    for key in ["tool_input", "tool_parameters"] {
        if let Some(s) = event.attrs.get(key).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str::<Value>(s) {
                return Some(v);
            }
        }
    }
    None
}

/// Wall-clock ticker — flips long-idle states. Called once per second from
/// the SessionStore loop. Returns true if state changed.
///
/// `working_to_finished_after` is the new silence-based equivalent of the
/// (no-longer-emitted) `stop_reason: end_turn` signal: a Working session
/// with no pending tools that goes silent for this long is assumed done.
pub fn apply_tick(
    record: &mut SessionRecord,
    now: Instant,
    idle_after: Duration,
    ended_after: Duration,
    finished_to_awaiting_after: Duration,
    working_to_finished_after: Duration,
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
    } else if record.state == SessionState::Working
        && record.pending_tool_uses.is_empty()
        && record
            .last_api_request_at
            .is_some_and(|t| now.saturating_duration_since(t) > working_to_finished_after)
    {
        // End-of-turn signal: an api_request fired and nothing followed it
        // within the debounce window. Without `stop_reason` in real OTel,
        // this is the most specific signal we have.
        transition(record, SessionState::Finished, now);
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
            last_api_request_at: None,
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

    /// Sub-agent completion notifications get re-injected into the parent
    /// session as a `<task-notification>` XML blob — the only useful part
    /// is the `<summary>` tag. The rest is multi-KB noise.
    #[test]
    fn user_prompt_with_task_notification_extracts_summary() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        let blob = r#"
            <task-notification>
              <task-id>a6aaa50e23e185346</task-id>
              <status>completed</status>
              <summary>Agent "Backend codebase health audit" completed</summary>
              <result>OK most async methods already take CT...</result>
            </task-notification>"#;
        apply_event(&mut r, &ev("user_prompt", &[("prompt", Value::String(blob.into()))]), now);
        assert_eq!(
            r.last_user_msg.as_deref(),
            Some(r#"Agent "Backend codebase health audit" completed"#),
        );
    }

    /// Long normal prompts get truncated so cards don't render war-and-peace.
    #[test]
    fn user_prompt_truncates_long_text() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Idle, now);
        let long = "a".repeat(500);
        apply_event(&mut r, &ev("user_prompt", &[("prompt", Value::String(long.clone()))]), now);
        let stored = r.last_user_msg.as_deref().unwrap();
        assert!(stored.len() <= 220, "expected truncated, got {} chars", stored.len());
        assert!(stored.starts_with("aaa"));
        assert!(stored.ends_with("…"), "expected ellipsis suffix, got: {stored:?}");
    }

    /// Short normal prompts pass through unchanged.
    #[test]
    fn user_prompt_short_text_passes_through() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Idle, now);
        apply_event(&mut r, &ev("user_prompt", &[("prompt", Value::String("Please check!".into()))]), now);
        assert_eq!(r.last_user_msg.as_deref(), Some("Please check!"));
    }

    /// Real Claude Code 2.1.126 OTel does NOT include `stop_reason` on
    /// api_request — the only reliable Working→Tool signal is the
    /// `tool_decision` event, which fires before the tool runs.
    #[test]
    fn tool_decision_moves_to_tool_and_tracks_pending() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        apply_event(&mut r, &ev("tool_decision", &[
            ("tool_use_id", Value::String("toolu_a".into())),
            ("tool_name", Value::String("Bash".into())),
            ("decision", Value::String("accept".into())),
        ]), now);
        assert_eq!(r.state, SessionState::Tool);
        assert!(r.pending_tool_uses.contains("toolu_a"));
    }

    #[test]
    fn multiple_tool_decisions_track_each_pending_use() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        for id in ["toolu_a", "toolu_b", "toolu_c"] {
            apply_event(&mut r, &ev("tool_decision", &[
                ("tool_use_id", Value::String(id.into())),
                ("tool_name", Value::String("Bash".into())),
            ]), now);
        }
        assert_eq!(r.state, SessionState::Tool);
        assert_eq!(r.pending_tool_uses.len(), 3);
    }

    #[test]
    fn tool_result_returns_to_working_when_no_pending_remain() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        // Simulate the decision arriving first.
        apply_event(&mut r, &ev("tool_decision", &[
            ("tool_use_id", Value::String("toolu_1".into())),
            ("tool_name", Value::String("Bash".into())),
        ]), now);
        assert_eq!(r.state, SessionState::Tool);

        apply_event(&mut r, &ev("tool_result", &[
            ("tool_use_id", Value::String("toolu_1".into())),
            ("tool_name", Value::String("Bash".into())),
        ]), now);
        assert_eq!(r.state, SessionState::Working);
        assert!(r.pending_tool_uses.is_empty());
    }

    #[test]
    fn tool_result_stays_in_tool_until_all_pending_complete() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        for id in ["toolu_a", "toolu_b"] {
            apply_event(&mut r, &ev("tool_decision", &[
                ("tool_use_id", Value::String(id.into())),
                ("tool_name", Value::String("Bash".into())),
            ]), now);
        }
        apply_event(&mut r, &ev("tool_result", &[
            ("tool_use_id", Value::String("toolu_a".into())),
            ("tool_name", Value::String("Bash".into())),
        ]), now);
        // Still one pending → still in Tool.
        assert_eq!(r.state, SessionState::Tool);

        apply_event(&mut r, &ev("tool_result", &[
            ("tool_use_id", Value::String("toolu_b".into())),
            ("tool_name", Value::String("Bash".into())),
        ]), now);
        assert_eq!(r.state, SessionState::Working);
    }

    /// api_request alone (no stop_reason in real OTel) MUST NOT change state.
    /// It only updates token counters.
    #[test]
    fn api_request_does_not_change_state() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        apply_event(&mut r, &ev("api_request", &[
            ("model", Value::String("claude-haiku-4-5".into())),
            ("input_tokens", Value::from(100u64)),
            ("output_tokens", Value::from(50u64)),
            ("cache_read_tokens", Value::from(40u64)),
        ]), now);
        assert_eq!(r.state, SessionState::Working);
        assert_eq!(r.tokens_used, 190);
        assert_eq!(r.model.as_deref(), Some("claude-haiku-4-5"));
    }

    /// A new user_prompt must wipe any stale pending tools and reset state.
    #[test]
    fn user_prompt_resets_pending_tools_and_state() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Tool, now);
        r.pending_tool_uses.insert("stale_a".into());
        r.pending_tool_uses.insert("stale_b".into());
        apply_event(&mut r, &ev("user_prompt", &[("prompt", Value::String("hi".into()))]), now);
        assert_eq!(r.state, SessionState::Working);
        assert!(r.pending_tool_uses.is_empty(), "stale tool uses should be cleared on new prompt");
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
            Duration::from_secs(5),
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
            Duration::from_secs(30),
            Duration::from_secs(5));
        assert_eq!(r.state, SessionState::Idle);

        r.last_event_at = now - Duration::from_secs(1801);
        apply_tick(&mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30),
            Duration::from_secs(5));
        assert_eq!(r.state, SessionState::Ended);
    }

    /// CRITICAL: a Working session that hasn't yet received any api_request
    /// (i.e. the model is still composing its first response) MUST NOT flip to
    /// Finished even after long silence. Opus xhigh can take 30+ seconds before
    /// the first api_request fires; misfiring during that window is the user-
    /// visible "Working → Finished → Working" flicker bug.
    #[test]
    fn working_with_no_api_request_stays_working_through_long_silence() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        // Long silence — but no api_request has fired yet for this turn.
        r.last_event_at = now - Duration::from_secs(60);
        r.last_api_request_at = None;
        apply_tick(
            &mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30),
            Duration::from_secs(3),
        );
        assert_eq!(r.state, SessionState::Working);
    }

    /// The end-of-turn signal IS an api_request that isn't followed by any
    /// tool_decision: when last_api_request_at is older than the threshold and
    /// no tools are pending, we declare Finished.
    #[test]
    fn working_after_api_request_with_no_tools_for_threshold_becomes_finished() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        // Simulate an api_request that fired 4s ago, no tool_decision since.
        r.last_event_at = now - Duration::from_secs(4);
        r.last_api_request_at = Some(now - Duration::from_secs(4));
        apply_tick(
            &mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30),
            Duration::from_secs(3),
        );
        assert_eq!(r.state, SessionState::Finished);
    }

    /// When tool_decision arrives after the api_request, it cancels the
    /// pending Finished signal — the model is calling tools, not done.
    #[test]
    fn tool_decision_clears_last_api_request_at() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        apply_event(&mut r, &ev("api_request", &[("model", Value::String("opus".into()))]), now);
        assert!(r.last_api_request_at.is_some());
        apply_event(&mut r, &ev("tool_decision", &[
            ("tool_use_id", Value::String("a".into())),
            ("tool_name", Value::String("Bash".into())),
        ]), now);
        assert!(r.last_api_request_at.is_none(), "tool_decision must clear the finish signal");
    }

    /// A new user_prompt also clears the finish signal (start of a new turn).
    #[test]
    fn user_prompt_clears_last_api_request_at() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Finished, now);
        r.last_api_request_at = Some(now - Duration::from_secs(10));
        apply_event(&mut r, &ev("user_prompt", &[("prompt", Value::String("hi".into()))]), now);
        assert!(r.last_api_request_at.is_none());
    }

    /// Once the model finishes the turn, api_request arrives and tools may or
    /// may not follow. With pending=0 and an api_request just before the
    /// threshold, we stay Working (debounce window).
    #[test]
    fn working_within_post_api_request_debounce_stays_working() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Working, now);
        r.last_event_at = now - Duration::from_secs(1);
        r.last_api_request_at = Some(now - Duration::from_secs(1));
        apply_tick(
            &mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30),
            Duration::from_secs(3),
        );
        assert_eq!(r.state, SessionState::Working);
    }

    /// Tool-state sessions are still actively running; the silence threshold
    /// for Working→Finished must not bleed into them.
    #[test]
    fn tool_state_does_not_become_finished_via_tick() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Tool, now);
        r.last_event_at = now - Duration::from_secs(20);
        r.pending_tool_uses.insert("toolu_a".into());
        apply_tick(
            &mut r, now,
            Duration::from_secs(300),
            Duration::from_secs(1800),
            Duration::from_secs(30),
            Duration::from_secs(5),
        );
        assert_eq!(r.state, SessionState::Tool);
    }

    /// If we wrongly marked a session Finished while the model was actually
    /// still thinking, the next api_request must rescue it back to Working.
    #[test]
    fn api_request_after_finished_returns_to_working() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Finished, now);
        apply_event(&mut r, &ev("api_request", &[
            ("model", Value::String("claude-opus-4-7".into())),
            ("input_tokens", Value::from(10u64)),
        ]), now);
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
            Duration::from_secs(5),
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
            Duration::from_secs(5),
        );
        assert_eq!(r.state, SessionState::Idle);
    }

    /// Real Claude OTel uses `tool_input` (a JSON-encoded string) as the
    /// canonical payload — `tool_parameters` is the older alias that may or
    /// may not be present. Prefer tool_input.
    #[test]
    fn task_narrative_uses_tool_input_for_bash_command() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Tool, now);
        r.pending_tool_uses.insert("a".into());
        r.pending_tool_uses.insert("b".into()); // keep state in Tool after the result
        apply_event(&mut r, &ev("tool_result", &[
            ("tool_use_id", Value::String("a".into())),
            ("tool_name", Value::String("Bash".into())),
            ("tool_input", Value::String(r#"{"command":"ls -la D:/FSP-Horizon"}"#.into())),
        ]), now);
        assert_eq!(r.task.as_deref(), Some("Running ls -la"));
    }

    #[test]
    fn task_narrative_uses_tool_input_for_read_filename() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Tool, now);
        r.pending_tool_uses.insert("a".into());
        r.pending_tool_uses.insert("b".into());
        apply_event(&mut r, &ev("tool_result", &[
            ("tool_use_id", Value::String("a".into())),
            ("tool_name", Value::String("Read".into())),
            ("tool_input", Value::String(r#"{"file_path":"D:\\FSP-Horizon\\Program.cs"}"#.into())),
        ]), now);
        assert_eq!(r.task.as_deref(), Some("Reading Program.cs"));
    }

    #[test]
    fn task_narrative_uses_tool_input_for_glob_pattern() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Tool, now);
        r.pending_tool_uses.insert("a".into());
        r.pending_tool_uses.insert("b".into());
        apply_event(&mut r, &ev("tool_result", &[
            ("tool_use_id", Value::String("a".into())),
            ("tool_name", Value::String("Glob".into())),
            ("tool_input", Value::String(r#"{"pattern":"D:/FSP-Horizon/**/*.cs"}"#.into())),
        ]), now);
        assert_eq!(r.task.as_deref(), Some("Globbing D:/FSP-Horizon/**/*.cs"));
    }

    /// The Agent tool ships its sub-agent's `description` field. Surface
    /// that, not the multi-thousand-char prompt.
    #[test]
    fn task_narrative_for_agent_tool_uses_description() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Tool, now);
        r.pending_tool_uses.insert("a".into());
        r.pending_tool_uses.insert("b".into());
        apply_event(&mut r, &ev("tool_result", &[
            ("tool_use_id", Value::String("a".into())),
            ("tool_name", Value::String("Agent".into())),
            ("tool_input", Value::String(
                r#"{"description":"Backend codebase health audit","prompt":"You are a backend auditor..."}"#.into(),
            )),
        ]), now);
        assert_eq!(r.task.as_deref(), Some("Agent: Backend codebase health audit"));
    }

    /// When tool_input is absent, fall back to the legacy tool_parameters
    /// shape so older claude versions still get narratives.
    #[test]
    fn task_narrative_falls_back_to_tool_parameters() {
        let now = Instant::now();
        let mut r = make_record(SessionState::Tool, now);
        r.pending_tool_uses.insert("a".into());
        r.pending_tool_uses.insert("b".into());
        apply_event(&mut r, &ev("tool_result", &[
            ("tool_use_id", Value::String("a".into())),
            ("tool_name", Value::String("Bash".into())),
            ("tool_parameters", Value::String(r#"{"full_command":"git status"}"#.into())),
        ]), now);
        assert_eq!(r.task.as_deref(), Some("Running git status"));
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
