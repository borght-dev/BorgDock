# Agent Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Agent Overview pop-out window — a live dashboard of every Claude Code session on the machine, classified into 5 states, fed by an embedded OpenTelemetry log/event receiver, with tray-badge + in-app toast alerting when sessions start waiting on user input.

**Architecture:** A new Rust module `src-tauri/src/agent_overview/` owns an axum HTTP server bound to `127.0.0.1:4318` that consumes Claude Code's OTLP/HTTP/JSON event stream. A pure-function state machine classifies sessions into Working/Tool/Awaiting/Finished/Idle/Ended. Session→cwd mapping comes from cross-referencing `~/.claude/projects/*/sessions-index.json`. Frontend is a 1:1 port of the Claude Design bundle at `C:\Users\<user>\AppData\Local\Temp\agent-overview-design\extracted\borgdock\project\components\` to TSX in a new pop-out window following the existing `sql` / `pr-detail` pattern.

**Tech Stack:** Rust (Tauri 2), `axum 0.7`, `tokio`, `serde_json`, `glob 0.3`, React 19 + TypeScript, vitest + @testing-library/react.

**Reference spec:** `docs/superpowers/specs/2026-04-30-agent-overview-design.md`

**Design bundle (already extracted):** `C:\Users\KoenvanderBorghtGomo\AppData\Local\Temp\agent-overview-design\extracted\borgdock\project\components\` — `agent-var-e.jsx` (final variant root), `agent-card.jsx` (cards), `agent-primitives.jsx` (StateDot, StatePill, RepoMark, TokenBar, CSS), `agent-data.jsx` (mock data, label synth helpers), `agent-showcase.jsx` (alert treatments).

**Windows / Git Bash note (CLAUDE.md):** prefix every `cargo` command with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`. Run from `src/BorgDock.Tauri/src-tauri`. Frontend `npm` commands run from `src/BorgDock.Tauri`.

**TDD per `.claude/rules`:** every code change is paired with a failing test first. Build must produce 0 errors and 0 warnings before any commit.

---

## File Structure

**Create — Rust:**
- `src-tauri/src/agent_overview/mod.rs` — module exports.
- `src-tauri/src/agent_overview/types.rs` — `SessionRecord`, `SessionState`, `RawEvent`, `SessionDelta`, `CwdInfo`.
- `src-tauri/src/agent_overview/state.rs` — pure state-machine inference (`apply_event`, `apply_tick`).
- `src-tauri/src/agent_overview/store.rs` — `SessionStore` (Arc<RwLock<HashMap<…>>>) with delta emission.
- `src-tauri/src/agent_overview/cwd_resolver.rs` — `resolve_cwd`, `CwdCache`, derive_repo_name / derive_worktree_name.
- `src-tauri/src/agent_overview/bootstrap.rs` — read `~/.claude/projects/*/sessions-index.json` on startup.
- `src-tauri/src/agent_overview/otlp_server.rs` — axum `POST /v1/logs` route, JSON parsing.
- `src-tauri/src/agent_overview/settings_merge.rs` — merge our env block into `~/.claude/settings.json` with backup.
- `src-tauri/src/agent_overview/window.rs` — `open_agent_overview_window` Tauri command.
- `src-tauri/src/agent_overview/notify.rs` — threshold detection that fires tray-badge updates and notification toasts.
- `src-tauri/src/agent_overview/models.rs` — `tokens_max_for_model` static map.
- `src-tauri/src/agent_overview/commands.rs` — `list_agent_sessions`, `set_agent_overview_enabled`, `disable_agent_overview_telemetry`.
- `src-tauri/capabilities/agent-overview.json`
- `src-tauri/tests/otlp_server_integration.rs` — integration test that POSTs canned OTLP payloads.
- `src-tauri/tests/fixtures/otlp/user_prompt.json`, `api_request_end_turn.json`, `api_request_tool_use.json`, `tool_result.json` — captured payload fixtures.

**Create — Frontend:**
- `agent-overview.html` — page entry.
- `src/main-agent-overview.tsx` — React mount.
- `src/components/agent-overview/AgentOverviewApp.tsx`
- `src/components/agent-overview/Titlebar.tsx`
- `src/components/agent-overview/AwaitingRail.tsx`
- `src/components/agent-overview/AwaitingRailItem.tsx`
- `src/components/agent-overview/AgentCard.tsx`
- `src/components/agent-overview/AgentCardLarge.tsx`
- `src/components/agent-overview/AgentTile.tsx`
- `src/components/agent-overview/RepoGrouped.tsx`
- `src/components/agent-overview/StatusGrouped.tsx`
- `src/components/agent-overview/IdleRail.tsx`
- `src/components/agent-overview/Statusbar.tsx`
- `src/components/agent-overview/SegmentedToggle.tsx`
- `src/components/agent-overview/RepoMark.tsx`
- `src/components/agent-overview/StateDot.tsx`
- `src/components/agent-overview/StatePill.tsx`
- `src/components/agent-overview/TokenBar.tsx`
- `src/components/agent-overview/__tests__/*.test.tsx` (one per component)
- `src/hooks/useAgentSessions.ts`
- `src/hooks/__tests__/useAgentSessions.test.ts`
- `src/services/agent-overview.ts` — pure helpers (`fmtSince`, `fmtSinceShort`, `tokenPct`, `groupByRepo`, `groupByRepoWorktree`, `synthLabel`, `pickDensity`, `STATE_DEFS`).
- `src/services/__tests__/agent-overview.test.ts`
- `src/services/agent-overview-types.ts` — TS mirrors of Rust types.
- `src/styles/agent-overview.css`
- `src/components/settings/AgentOverviewSection.tsx`
- `src/components/settings/__tests__/AgentOverviewSection.test.tsx`

**Modify:**
- `src-tauri/src/lib.rs` — `pub mod agent_overview;`, `.manage(SessionStore::default())`, start OTLP server in `setup`, register commands.
- `src-tauri/src/settings/models.rs` — add `agent_overview: AgentOverviewSettings` field with `AgentOverviewSettings` struct + `WindowGeometry` struct.
- `src-tauri/Cargo.toml` — add `axum = "0.7"`, `tower = "0.5"`, `glob = "0.3"`.
- `src-tauri/src/platform/window.rs` — add a thin re-export so the Settings menu and tray can call `open_agent_overview_window` through the existing module path.
- `src-tauri/src/platform/tray.rs` — add "Agent Overview" tray menu item.
- `src/hooks/useBadgeSync.ts` — merge "awaiting Claude sessions" count into the existing tray-icon update + tooltip.
- `src/types/index.ts` (or wherever `InAppNotification` is exported from `@/types`) — re-export `SessionRecord` etc.
- `src/components/settings/SettingsFlyout.tsx` — wire in `<AgentOverviewSection />`.
- `vite.config.ts` — add `'agent-overview'` to `build.rollupOptions.input`; add `src/main-agent-overview.tsx` to the coverage exclude list.
- `src-tauri/capabilities/main.json` — grant `core:event:listen` for `agent-sessions-changed` if not already wildcarded.

---

## Phase 1 — Rust foundation: types, state machine, store

### Task 1: Module skeleton + shared types

**Files:**
- Create: `src-tauri/src/agent_overview/mod.rs`
- Create: `src-tauri/src/agent_overview/types.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod agent_overview;`)

- [ ] **Step 1: Add `pub mod agent_overview;` to `lib.rs`**

Edit `src-tauri/src/lib.rs`. The top of the file currently lists modules:

```rust
pub mod ado;
pub mod auth;
pub mod cache;
pub mod claude_api;
pub mod file_palette;
pub mod flyout;
pub mod git;
pub mod keychain;
pub mod platform;
pub mod settings;
pub mod sql;
pub mod updater;
```

Insert `pub mod agent_overview;` between `ado` and `auth` so the list stays alphabetical:

```rust
pub mod ado;
pub mod agent_overview;
pub mod auth;
pub mod cache;
pub mod claude_api;
pub mod file_palette;
pub mod flyout;
pub mod git;
pub mod keychain;
pub mod platform;
pub mod settings;
pub mod sql;
pub mod updater;
```

- [ ] **Step 2: Create `agent_overview/mod.rs`**

```rust
//! Agent Overview — live dashboard of Claude Code sessions, fed by an
//! embedded OTLP log/event receiver. See spec at
//! `docs/superpowers/specs/2026-04-30-agent-overview-design.md`.

pub mod types;
```

- [ ] **Step 3: Write the failing tests for types**

Create `src-tauri/src/agent_overview/types.rs` with the tests at the bottom — write them first:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Instant;

/// One Claude Code session as the dashboard sees it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub session_id: String,
    pub cwd: PathBuf,
    pub repo: String,
    pub worktree: String,
    pub branch: String,
    pub label: String,

    pub state: SessionState,
    /// Wall clock when state was entered (monotonic Instant for safety;
    /// serialized as elapsed millis from `now` at emit time — see Task 4).
    #[serde(skip)]
    pub state_since: Instant,
    #[serde(skip)]
    pub last_event_at: Instant,

    pub last_user_msg: Option<String>,
    pub task: Option<String>,
    pub model: Option<String>,
    pub tokens_used: u64,
    pub tokens_max: u64,

    pub last_api_stop_reason: Option<String>,
    #[serde(skip)]
    pub pending_tool_uses: HashSet<String>,

    /// Set internally before serialization to expose `state_since` / `last_event_at`
    /// as wall-clock millis-ago values for the React side.
    #[serde(rename = "stateSinceMs")]
    pub state_since_ms: u128,
    #[serde(rename = "lastEventMs")]
    pub last_event_ms: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    Working,
    Tool,
    Awaiting,
    Finished,
    Idle,
    Ended,
}

/// Resolved cwd / repo / worktree / branch for a session id.
#[derive(Debug, Clone)]
pub struct CwdInfo {
    pub cwd: PathBuf,
    pub repo: String,
    pub worktree: String,
    pub branch: String,
}

/// One OTel log/event record after we've flattened resource + record attrs
/// into a single map. The state machine is fed `RawEvent`s.
#[derive(Debug, Clone)]
pub struct RawEvent {
    pub session_id: String,
    pub event_name: String,
    pub attrs: std::collections::HashMap<String, serde_json::Value>,
}

/// Delta emitted to the frontend whenever the SessionStore changes.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SessionDelta {
    Upsert { session: SessionRecord },
    Remove { session_id: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_state_serializes_to_lowercase() {
        let json = serde_json::to_string(&SessionState::Awaiting).unwrap();
        assert_eq!(json, "\"awaiting\"");
    }

    #[test]
    fn session_delta_upsert_serializes_with_kind_tag() {
        let now = Instant::now();
        let rec = SessionRecord {
            session_id: "sid".into(),
            cwd: PathBuf::from("/x"),
            repo: "BorgDock".into(),
            worktree: "master".into(),
            branch: "master".into(),
            label: "BD · master #1".into(),
            state: SessionState::Working,
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
        };
        let delta = SessionDelta::Upsert { session: rec };
        let json = serde_json::to_value(&delta).unwrap();
        assert_eq!(json["kind"], "upsert");
        assert_eq!(json["session"]["sessionId"], "sid");
        assert_eq!(json["session"]["state"], "working");
    }

    #[test]
    fn session_delta_remove_serializes_with_kind_tag() {
        let delta = SessionDelta::Remove { session_id: "sid".into() };
        let json = serde_json::to_value(&delta).unwrap();
        assert_eq!(json["kind"], "remove");
        assert_eq!(json["sessionId"], "sid");
    }
}
```

- [ ] **Step 4: Run cargo check + tests to verify they fail/pass**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib agent_overview::types`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/ src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(agent-overview): add module skeleton and shared types"
```

---

### Task 2: State machine — pure inference function

**Files:**
- Create: `src-tauri/src/agent_overview/state.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs` (add `pub mod state;`)

- [ ] **Step 1: Register the module**

Edit `src-tauri/src/agent_overview/mod.rs`:

```rust
pub mod state;
pub mod types;
```

- [ ] **Step 2: Write failing tests for `apply_event`**

Create `src-tauri/src/agent_overview/state.rs` with the test module at the bottom; the production code will be a stub at first that makes them fail.

```rust
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

    if record.state == SessionState::Finished && since_state > finished_to_awaiting_after {
        transition(record, SessionState::Awaiting, now);
    }

    if matches!(
        record.state,
        SessionState::Working | SessionState::Tool | SessionState::Awaiting | SessionState::Finished
    ) && since_event > idle_after
    {
        transition(record, SessionState::Idle, now);
    }

    if record.state == SessionState::Idle && since_event > ended_after {
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

fn snapshot(record: &SessionRecord) -> (SessionState, u64, Option<String>, Option<String>) {
    (
        record.state,
        record.tokens_used,
        record.last_user_msg.clone(),
        record.last_api_stop_reason.clone(),
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
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib agent_overview::state`
Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/
git commit -m "feat(agent-overview): pure state-machine inference + tests"
```

---

### Task 3: SessionStore with delta emission

**Files:**
- Create: `src-tauri/src/agent_overview/store.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs` (add `pub mod store;`)

- [ ] **Step 1: Register the module**

Edit `src-tauri/src/agent_overview/mod.rs`:

```rust
pub mod state;
pub mod store;
pub mod types;
```

- [ ] **Step 2: Write failing tests + implementation**

Create `src-tauri/src/agent_overview/store.rs`:

```rust
use crate::agent_overview::state::{apply_event, apply_tick};
use crate::agent_overview::types::{
    CwdInfo, RawEvent, SessionDelta, SessionRecord, SessionState,
};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;

/// Configurable timing thresholds (mirrored in AgentOverviewSettings).
#[derive(Debug, Clone, Copy)]
pub struct StoreThresholds {
    pub idle_after: Duration,
    pub ended_after: Duration,
    pub finished_to_awaiting_after: Duration,
    pub history_retention: Duration,
}

impl Default for StoreThresholds {
    fn default() -> Self {
        Self {
            idle_after: Duration::from_secs(300),
            ended_after: Duration::from_secs(1800),
            finished_to_awaiting_after: Duration::from_secs(30),
            history_retention: Duration::from_secs(14_400),
        }
    }
}

/// Shared session store. Reads from many threads (commands, bootstrap, notify);
/// writes only from the event-loop task.
#[derive(Clone, Default)]
pub struct SessionStore {
    pub inner: Arc<RwLock<HashMap<String, SessionRecord>>>,
}

impl SessionStore {
    pub fn snapshot(&self) -> Vec<SessionRecord> {
        let now = Instant::now();
        self.inner
            .read()
            .map(|m| m.values().cloned().map(|r| seal_for_emit(r, now)).collect())
            .unwrap_or_default()
    }

    pub fn ingest_event(
        &self,
        event: RawEvent,
        cwd: Option<CwdInfo>,
        deltas: &UnboundedSender<SessionDelta>,
        now: Instant,
    ) {
        let mut map = match self.inner.write() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        let session_id = event.session_id.clone();
        let entry = map.entry(session_id.clone()).or_insert_with(|| {
            let info = cwd.clone().unwrap_or_else(|| CwdInfo {
                cwd: PathBuf::from("<unknown>"),
                repo: "unknown".into(),
                worktree: "?".into(),
                branch: "?".into(),
            });
            SessionRecord {
                session_id: session_id.clone(),
                cwd: info.cwd,
                repo: info.repo.clone(),
                worktree: info.worktree.clone(),
                branch: info.branch,
                label: format!("{} · {} #{}", short_repo(&info.repo), info.worktree, 1),
                state: SessionState::Working,
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
        });

        let changed = apply_event(entry, &event, now);
        if changed {
            let snap = seal_for_emit(entry.clone(), now);
            let _ = deltas.send(SessionDelta::Upsert { session: snap });
        }
    }

    pub fn run_tick(
        &self,
        thresholds: StoreThresholds,
        deltas: &UnboundedSender<SessionDelta>,
        now: Instant,
    ) {
        let mut to_remove: Vec<String> = Vec::new();
        let mut emits: Vec<SessionDelta> = Vec::new();
        {
            let mut map = match self.inner.write() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            for (id, rec) in map.iter_mut() {
                let changed = apply_tick(
                    rec, now,
                    thresholds.idle_after,
                    thresholds.ended_after,
                    thresholds.finished_to_awaiting_after,
                );
                if rec.state == SessionState::Ended
                    && now.saturating_duration_since(rec.last_event_at) > thresholds.history_retention
                {
                    to_remove.push(id.clone());
                } else if changed {
                    emits.push(SessionDelta::Upsert { session: seal_for_emit(rec.clone(), now) });
                }
            }
            for id in &to_remove {
                map.remove(id);
            }
        }
        for d in emits {
            let _ = deltas.send(d);
        }
        for id in to_remove {
            let _ = deltas.send(SessionDelta::Remove { session_id: id });
        }
    }

    pub fn upsert_bootstrap(&self, rec: SessionRecord, deltas: &UnboundedSender<SessionDelta>) {
        let now = Instant::now();
        let snap = seal_for_emit(rec.clone(), now);
        match self.inner.write() {
            Ok(mut m) => {
                m.insert(rec.session_id.clone(), rec);
            }
            Err(p) => {
                let mut m = p.into_inner();
                m.insert(rec.session_id.clone(), rec);
            }
        }
        let _ = deltas.send(SessionDelta::Upsert { session: snap });
    }
}

/// Convert monotonic Instants into millis-ago for the wire format.
fn seal_for_emit(mut rec: SessionRecord, now: Instant) -> SessionRecord {
    rec.state_since_ms = now.saturating_duration_since(rec.state_since).as_millis();
    rec.last_event_ms = now.saturating_duration_since(rec.last_event_at).as_millis();
    rec
}

/// Public so window.rs can synthesize labels with the same algorithm.
pub fn short_repo(repo: &str) -> String {
    let parts: Vec<&str> = repo.split(|c: char| c == '-' || c == '_' || c == ' ').collect();
    let mut out = String::new();
    if parts.len() > 1 {
        for p in &parts {
            if let Some(c) = p.chars().next() {
                out.push(c.to_ascii_uppercase());
            }
        }
    } else if let Some(first) = repo.chars().next() {
        out.push(first.to_ascii_uppercase());
        for c in repo.chars().skip(1) {
            if c.is_ascii_uppercase() {
                out.push(c);
            }
        }
        if out.len() == 1 {
            for c in repo.chars().skip(1).take(1) {
                out.push(c.to_ascii_uppercase());
            }
        }
    }
    if out.is_empty() {
        out.push_str("?");
    }
    if out.len() > 4 {
        out.truncate(4);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use tokio::sync::mpsc::unbounded_channel;

    fn ev(session: &str, name: &str, attrs: &[(&str, Value)]) -> RawEvent {
        RawEvent {
            session_id: session.into(),
            event_name: name.into(),
            attrs: attrs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect(),
        }
    }

    #[test]
    fn ingest_creates_record_and_emits_upsert() {
        let store = SessionStore::default();
        let (tx, mut rx) = unbounded_channel();
        let cwd = CwdInfo {
            cwd: PathBuf::from("/x"),
            repo: "BorgDock".into(),
            worktree: "master".into(),
            branch: "master".into(),
        };
        store.ingest_event(
            ev("sid", "user_prompt", &[("prompt", Value::String("hi".into()))]),
            Some(cwd),
            &tx,
            Instant::now(),
        );
        let delta = rx.try_recv().unwrap();
        match delta {
            SessionDelta::Upsert { session } => {
                assert_eq!(session.session_id, "sid");
                assert_eq!(session.repo, "BorgDock");
                assert_eq!(session.label, "BD · master #1");
                assert_eq!(session.state, SessionState::Working);
            }
            _ => panic!("expected upsert"),
        }
    }

    #[test]
    fn run_tick_drops_ended_sessions_past_retention() {
        let store = SessionStore::default();
        let (tx, mut rx) = unbounded_channel();
        let now = Instant::now();
        let mut rec = SessionRecord {
            session_id: "sid".into(),
            cwd: PathBuf::from("/x"),
            repo: "BD".into(),
            worktree: "master".into(),
            branch: "master".into(),
            label: "BD · master #1".into(),
            state: SessionState::Ended,
            state_since: now - Duration::from_secs(20_000),
            last_event_at: now - Duration::from_secs(20_000),
            last_user_msg: None,
            task: None,
            model: None,
            tokens_used: 0,
            tokens_max: 200_000,
            last_api_stop_reason: None,
            pending_tool_uses: HashSet::new(),
            state_since_ms: 0,
            last_event_ms: 0,
        };
        rec.session_id = "sid".into();
        store.upsert_bootstrap(rec, &tx);
        let _ = rx.try_recv(); // drain the bootstrap upsert

        store.run_tick(StoreThresholds::default(), &tx, now);
        let delta = rx.try_recv().unwrap();
        match delta {
            SessionDelta::Remove { session_id } => assert_eq!(session_id, "sid"),
            _ => panic!("expected remove"),
        }
        assert!(store.inner.read().unwrap().is_empty());
    }

    #[test]
    fn short_repo_initials() {
        assert_eq!(short_repo("BorgDock"), "BD");
        assert_eq!(short_repo("FSP-Horizon"), "FH");
        assert_eq!(short_repo("my_cool_thing"), "MCT");
        assert_eq!(short_repo("BorgDockExtraLongName"), "BDEL");
    }
}
```

- [ ] **Step 3: Run tests**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib agent_overview::store`
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/
git commit -m "feat(agent-overview): SessionStore + delta channel"
```

---

## Phase 2 — cwd resolution & bootstrap

### Task 4: cwd resolver

**Files:**
- Create: `src-tauri/src/agent_overview/cwd_resolver.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs` (add `pub mod cwd_resolver;`)
- Modify: `src-tauri/Cargo.toml` (add `glob = "0.3"`)

- [ ] **Step 1: Add `glob` dep**

Edit `src-tauri/Cargo.toml`'s `[dependencies]` table — add:

```toml
glob = "0.3"
```

(Place alphabetically; the file already imports `serde`, `tokio`, etc.)

- [ ] **Step 2: Register the module**

```rust
pub mod cwd_resolver;
pub mod state;
pub mod store;
pub mod types;
```

- [ ] **Step 3: Write failing tests + implementation**

Create `src-tauri/src/agent_overview/cwd_resolver.rs`:

```rust
use crate::agent_overview::types::CwdInfo;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Debug, Deserialize)]
struct SessionsIndex {
    #[serde(default)]
    entries: Vec<SessionsIndexEntry>,
}

#[derive(Debug, Deserialize, Clone)]
struct SessionsIndexEntry {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "projectPath")]
    project_path: PathBuf,
    #[serde(rename = "gitBranch", default)]
    git_branch: String,
}

#[derive(Default, Clone)]
pub struct CwdCache {
    map: Arc<Mutex<HashMap<String, CwdInfo>>>,
}

impl CwdCache {
    pub fn get(&self, sid: &str) -> Option<CwdInfo> {
        self.map.lock().ok().and_then(|m| m.get(sid).cloned())
    }
    pub fn put(&self, sid: String, info: CwdInfo) {
        if let Ok(mut m) = self.map.lock() {
            m.insert(sid, info);
        }
    }
}

/// Resolve a session id by walking `~/.claude/projects/*/sessions-index.json`.
/// Returns None if no entry matches; caller decides whether to defer or stub.
pub fn resolve_cwd(session_id: &str, cache: &CwdCache, projects_root: &Path) -> Option<CwdInfo> {
    if let Some(hit) = cache.get(session_id) {
        return Some(hit);
    }
    let pattern = format!("{}/*/sessions-index.json", projects_root.display());
    for path in glob::glob(&pattern).ok()?.flatten() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(idx) = serde_json::from_str::<SessionsIndex>(&content) {
                if let Some(entry) = idx.entries.into_iter().find(|e| e.session_id == session_id) {
                    let info = CwdInfo {
                        repo: derive_repo_name(&entry.project_path),
                        worktree: derive_worktree_name(&entry.project_path),
                        branch: entry.git_branch,
                        cwd: entry.project_path,
                    };
                    cache.put(session_id.into(), info.clone());
                    return Some(info);
                }
            }
        }
    }
    None
}

/// Repo name = last segment of the path that looks like a repo root.
/// We treat the leaf if no `.worktrees` parent, else the grandparent.
pub fn derive_repo_name(path: &Path) -> String {
    let parts: Vec<&std::ffi::OsStr> = path.iter().collect();
    for (i, p) in parts.iter().enumerate().rev() {
        if p.eq_ignore_ascii_case(".worktrees") && i > 0 {
            return parts[i - 1].to_string_lossy().into_owned();
        }
    }
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unknown".into())
}

pub fn derive_worktree_name(path: &Path) -> String {
    let parts: Vec<&std::ffi::OsStr> = path.iter().collect();
    for (i, p) in parts.iter().enumerate() {
        if p.eq_ignore_ascii_case(".worktrees") && i + 1 < parts.len() {
            return parts[i + 1].to_string_lossy().into_owned();
        }
    }
    "master".into()
}

/// Default location of `~/.claude/projects` for the current OS user.
pub fn default_projects_root() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn derive_repo_and_worktree_for_master() {
        let p = PathBuf::from("/c/src/borgdock");
        assert_eq!(derive_repo_name(&p), "borgdock");
        assert_eq!(derive_worktree_name(&p), "master");
    }

    #[test]
    fn derive_repo_and_worktree_for_worktree() {
        let p = PathBuf::from("/c/src/borgdock/.worktrees/wt2");
        assert_eq!(derive_repo_name(&p), "borgdock");
        assert_eq!(derive_worktree_name(&p), "wt2");
    }

    #[test]
    fn resolves_session_id_from_fake_projects_tree() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--BorgDock");
        fs::create_dir_all(&proj).unwrap();
        let idx = serde_json::json!({
            "version": 1,
            "entries": [{
                "sessionId": "uuid-1",
                "projectPath": "E:\\\\BorgDock",
                "gitBranch": "master",
                "fileMtime": 0,
                "messageCount": 1,
                "modified": "2026-04-30T00:00:00Z"
            }]
        });
        fs::write(proj.join("sessions-index.json"), serde_json::to_string(&idx).unwrap()).unwrap();

        let cache = CwdCache::default();
        let info = resolve_cwd("uuid-1", &cache, tmp.path()).unwrap();
        assert_eq!(info.branch, "master");
        assert_eq!(info.cwd, PathBuf::from("E:\\BorgDock"));
        assert!(cache.get("uuid-1").is_some());

        // Second call returns the cached value (we delete the file to verify)
        fs::remove_file(proj.join("sessions-index.json")).unwrap();
        assert!(resolve_cwd("uuid-1", &cache, tmp.path()).is_some());
    }
}
```

- [ ] **Step 4: Add `tempfile = "3"` to `[dev-dependencies]` in Cargo.toml** if not already present.

- [ ] **Step 5: Run tests**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib agent_overview::cwd_resolver`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/Cargo.toml src/BorgDock.Tauri/src-tauri/src/agent_overview/
git commit -m "feat(agent-overview): cwd resolver via sessions-index.json"
```

---

### Task 5: Bootstrap from `~/.claude/projects` on launch

**Files:**
- Create: `src-tauri/src/agent_overview/bootstrap.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs`

- [ ] **Step 1: Register the module**

```rust
pub mod bootstrap;
pub mod cwd_resolver;
pub mod state;
pub mod store;
pub mod types;
```

- [ ] **Step 2: Write failing tests + implementation**

Create `src-tauri/src/agent_overview/bootstrap.rs`:

```rust
use crate::agent_overview::cwd_resolver::{derive_repo_name, derive_worktree_name};
use crate::agent_overview::store::{short_repo, SessionStore};
use crate::agent_overview::types::{SessionDelta, SessionRecord, SessionState};
use chrono::DateTime;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;

#[derive(Debug, Deserialize)]
struct IndexFile {
    #[serde(default)]
    entries: Vec<IndexEntry>,
}

#[derive(Debug, Deserialize)]
struct IndexEntry {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "projectPath")]
    project_path: PathBuf,
    #[serde(default, rename = "gitBranch")]
    git_branch: String,
    #[serde(default)]
    modified: Option<String>,
}

/// Walk `~/.claude/projects/*/sessions-index.json` and register any session
/// modified within the retention window as `Ended`. Live OTel events will
/// promote those records to live states as soon as they arrive.
pub fn bootstrap_known_sessions(
    projects_root: &Path,
    store: &SessionStore,
    deltas: &UnboundedSender<SessionDelta>,
    retention: Duration,
) -> usize {
    let pattern = format!("{}/*/sessions-index.json", projects_root.display());
    let now_inst = Instant::now();
    let mut counter_per_repo_wt: HashMap<(String, String), u32> = HashMap::new();
    let mut count = 0;

    for path in glob::glob(&pattern).ok().into_iter().flatten().flatten() {
        let content = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let idx: IndexFile = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        for entry in idx.entries {
            let modified_inst = entry
                .modified
                .as_deref()
                .and_then(parse_iso_to_instant)
                .unwrap_or(now_inst);
            let age = now_inst.saturating_duration_since(modified_inst);
            if age > retention {
                continue;
            }
            let repo = derive_repo_name(&entry.project_path);
            let worktree = derive_worktree_name(&entry.project_path);
            let key = (repo.clone(), worktree.clone());
            let n = counter_per_repo_wt.entry(key.clone()).or_insert(0);
            *n += 1;
            let label = format!("{} · {} #{}", short_repo(&repo), worktree, *n);

            let rec = SessionRecord {
                session_id: entry.session_id.clone(),
                cwd: entry.project_path.clone(),
                repo,
                worktree,
                branch: entry.git_branch.clone(),
                label,
                state: SessionState::Ended,
                state_since: modified_inst,
                last_event_at: modified_inst,
                last_user_msg: None,
                task: None,
                model: None,
                tokens_used: 0,
                tokens_max: 200_000,
                last_api_stop_reason: None,
                pending_tool_uses: HashSet::new(),
                state_since_ms: 0,
                last_event_ms: 0,
            };
            store.upsert_bootstrap(rec, deltas);
            count += 1;
        }
    }
    count
}

/// Map an ISO-8601 timestamp to an Instant by computing how far in the past it
/// is from "now" (SystemTime) and subtracting from `Instant::now()`. Returns
/// `Instant::now()` if parsing or arithmetic fails — the resulting record is
/// then trivially "fresh," which is harmless because Live OTel events override.
fn parse_iso_to_instant(s: &str) -> Option<Instant> {
    let parsed = DateTime::parse_from_rfc3339(s).ok()?;
    let then = parsed.with_timezone(&chrono::Utc);
    let now_sys = chrono::Utc::now();
    let delta = (now_sys - then).num_milliseconds();
    let now_inst = Instant::now();
    if delta <= 0 {
        Some(now_inst)
    } else {
        now_inst.checked_sub(Duration::from_millis(delta as u64))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tokio::sync::mpsc::unbounded_channel;

    #[test]
    fn bootstrap_registers_recent_sessions_only() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("E--BorgDock");
        fs::create_dir_all(&proj).unwrap();
        let now = chrono::Utc::now();
        let recent = now - chrono::Duration::minutes(30);
        let stale  = now - chrono::Duration::hours(8);
        let idx = serde_json::json!({
            "entries": [
                { "sessionId": "fresh", "projectPath": "E:\\BorgDock", "gitBranch": "master",
                  "modified": recent.to_rfc3339() },
                { "sessionId": "old",   "projectPath": "E:\\BorgDock", "gitBranch": "master",
                  "modified": stale.to_rfc3339() }
            ]
        });
        fs::write(proj.join("sessions-index.json"), idx.to_string()).unwrap();

        let store = SessionStore::default();
        let (tx, _rx) = unbounded_channel();
        let n = bootstrap_known_sessions(tmp.path(), &store, &tx, Duration::from_secs(14_400));
        assert_eq!(n, 1);
        let snap = store.snapshot();
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].session_id, "fresh");
        assert_eq!(snap[0].state, SessionState::Ended);
    }
}
```

- [ ] **Step 3: Run tests**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib agent_overview::bootstrap`
Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/
git commit -m "feat(agent-overview): bootstrap known sessions from filesystem"
```

---

## Phase 3 — OTLP HTTP/JSON receiver

### Task 6: Add `axum` and start the server skeleton

**Files:**
- Create: `src-tauri/src/agent_overview/otlp_server.rs`
- Modify: `src-tauri/Cargo.toml` (add `axum`, `tower`)
- Modify: `src-tauri/src/agent_overview/mod.rs`

- [ ] **Step 1: Add deps**

In `src-tauri/Cargo.toml` `[dependencies]`:

```toml
axum = "0.7"
tower = "0.5"
```

- [ ] **Step 2: Register module**

```rust
pub mod bootstrap;
pub mod cwd_resolver;
pub mod otlp_server;
pub mod state;
pub mod store;
pub mod types;
```

- [ ] **Step 3: Write failing test for OTLP parsing**

Create `src-tauri/tests/fixtures/otlp/api_request_end_turn.json`. To capture a real fixture: run `claude` with our env block plus `OTEL_LOGS_EXPORTER=console`, copy the JSON it prints, wrap in the OTLP envelope. For now, use this synthetic-but-spec-conformant fixture:

```json
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "claude-code"}},
        {"key": "session.id", "value": {"stringValue": "8f7b28b7-cef1-45ac-b469-793b4c0d0fca"}},
        {"key": "terminal.type", "value": {"stringValue": "WindowsTerminal"}}
      ]
    },
    "scopeLogs": [{
      "scope": {"name": "com.anthropic.claude_code"},
      "logRecords": [{
        "timeUnixNano": "1714492800000000000",
        "attributes": [
          {"key": "event.name", "value": {"stringValue": "api_request"}},
          {"key": "model", "value": {"stringValue": "claude-sonnet-4-6"}},
          {"key": "stop_reason", "value": {"stringValue": "end_turn"}},
          {"key": "input_tokens", "value": {"intValue": "1024"}},
          {"key": "output_tokens", "value": {"intValue": "256"}}
        ]
      }]
    }]
  }]
}
```

Create `src-tauri/src/agent_overview/otlp_server.rs`:

```rust
use crate::agent_overview::types::RawEvent;
use serde_json::Value;
use std::collections::HashMap;

/// Parse an OTLP/HTTP/JSON `ExportLogsServiceRequest` body into a flat list of
/// `RawEvent`s. Tolerant of missing/extra fields; never panics on malformed
/// input.
pub fn parse_export_logs(body: &Value) -> Vec<RawEvent> {
    let mut out = Vec::new();
    let resource_logs = body.get("resourceLogs").and_then(Value::as_array);
    let Some(resource_logs) = resource_logs else { return out };

    for resource_log in resource_logs {
        let resource_attrs = collect_attrs(resource_log.pointer("/resource/attributes"));
        let session_id = resource_attrs
            .get("session.id")
            .and_then(Value::as_str)
            .map(str::to_string);
        let Some(scope_logs) = resource_log.get("scopeLogs").and_then(Value::as_array) else {
            continue;
        };
        for scope_log in scope_logs {
            let Some(records) = scope_log.get("logRecords").and_then(Value::as_array) else {
                continue;
            };
            for record in records {
                let mut attrs = resource_attrs.clone();
                for (k, v) in collect_attrs(record.get("attributes")) {
                    attrs.insert(k, v);
                }
                let event_name = match attrs.get("event.name").and_then(Value::as_str) {
                    Some(s) => s.to_string(),
                    None => continue,
                };
                let sid = session_id.clone().unwrap_or_default();
                if sid.is_empty() {
                    continue;
                }
                out.push(RawEvent { session_id: sid, event_name, attrs });
            }
        }
    }
    out
}

/// OTLP/JSON encodes attributes as `[{"key":..., "value":{"stringValue"|"intValue"|...}}, …]`.
/// Flatten the list to a key→Value map (collapsing the scalar wrapper).
fn collect_attrs(node: Option<&Value>) -> HashMap<String, Value> {
    let mut out = HashMap::new();
    let Some(arr) = node.and_then(Value::as_array) else { return out };
    for item in arr {
        let Some(key) = item.get("key").and_then(Value::as_str) else { continue };
        let val = item.get("value").map(unwrap_otlp_value).unwrap_or(Value::Null);
        out.insert(key.to_string(), val);
    }
    out
}

fn unwrap_otlp_value(node: &Value) -> Value {
    if let Some(s) = node.get("stringValue") {
        return s.clone();
    }
    if let Some(b) = node.get("boolValue") {
        return b.clone();
    }
    if let Some(i) = node.get("intValue") {
        // intValue is a string per the OTLP/JSON encoding; coerce to number.
        if let Some(s) = i.as_str() {
            if let Ok(n) = s.parse::<i64>() {
                return Value::from(n);
            }
        }
        return i.clone();
    }
    if let Some(d) = node.get("doubleValue") {
        return d.clone();
    }
    if let Some(a) = node.get("arrayValue") {
        return a.clone();
    }
    Value::Null
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sample_fixture() {
        let body: Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/otlp/api_request_end_turn.json"
        )).unwrap();
        let events = parse_export_logs(&body);
        assert_eq!(events.len(), 1);
        let e = &events[0];
        assert_eq!(e.session_id, "8f7b28b7-cef1-45ac-b469-793b4c0d0fca");
        assert_eq!(e.event_name, "api_request");
        assert_eq!(e.attrs.get("model").unwrap(), &Value::String("claude-sonnet-4-6".into()));
        assert_eq!(e.attrs.get("stop_reason").unwrap(), &Value::String("end_turn".into()));
        assert_eq!(e.attrs.get("input_tokens").unwrap().as_i64().unwrap(), 1024);
    }

    #[test]
    fn missing_session_id_drops_record() {
        let body = serde_json::json!({
            "resourceLogs": [{
                "resource": { "attributes": [] },
                "scopeLogs": [{ "logRecords": [{
                    "attributes": [
                        { "key": "event.name", "value": { "stringValue": "api_request" } }
                    ]
                }] }]
            }]
        });
        assert!(parse_export_logs(&body).is_empty());
    }

    #[test]
    fn empty_body_returns_empty() {
        let body: Value = serde_json::from_str("{}").unwrap();
        assert!(parse_export_logs(&body).is_empty());
    }
}
```

- [ ] **Step 4: Run tests**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib agent_overview::otlp_server`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/Cargo.toml src/BorgDock.Tauri/src-tauri/src/agent_overview/ src/BorgDock.Tauri/src-tauri/tests/
git commit -m "feat(agent-overview): OTLP/HTTP/JSON parser"
```

---

### Task 7: axum HTTP server with `POST /v1/logs`

**Files:**
- Modify: `src-tauri/src/agent_overview/otlp_server.rs`

- [ ] **Step 1: Append the server module**

Add at the end of `otlp_server.rs` (before `#[cfg(test)]`):

```rust
use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::post, Json, Router};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone)]
pub struct ServerState {
    pub events_tx: UnboundedSender<RawEvent>,
}

/// Build the axum router. Exposed for tests.
pub fn build_router(state: ServerState) -> Router {
    Router::new()
        .route("/v1/logs", post(handle_logs))
        .with_state(Arc::new(state))
}

async fn handle_logs(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let events = parse_export_logs(&body);
    for e in events {
        if let Err(err) = state.events_tx.send(e) {
            log::warn!("agent_overview: events channel closed: {err}");
        }
    }
    (StatusCode::OK, Json(serde_json::json!({ "partialSuccess": {} })))
}

/// Bind on `127.0.0.1:port`, falling back across the next 10 ports if taken.
/// Returns the bound port on success.
pub async fn try_bind(port_start: u16) -> Result<(tokio::net::TcpListener, u16), String> {
    for p in port_start..port_start + 10 {
        let addr: SocketAddr = ([127, 0, 0, 1], p).into();
        match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => return Ok((l, p)),
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err(format!("no free port in {}..{}", port_start, port_start + 10))
}
```

- [ ] **Step 2: Add an integration test**

Create `src-tauri/tests/otlp_server_integration.rs`:

```rust
use axum::body::Body;
use axum::http::Request;
use borgdock::agent_overview::otlp_server::{build_router, parse_export_logs, ServerState};
use serde_json::Value;
use tokio::sync::mpsc::unbounded_channel;
use tower::ServiceExt;

#[tokio::test]
async fn post_v1_logs_pushes_events_to_channel() {
    let (tx, mut rx) = unbounded_channel();
    let app = build_router(ServerState { events_tx: tx });

    let body: Value = serde_json::from_str(
        include_str!("fixtures/otlp/api_request_end_turn.json"),
    ).unwrap();

    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/logs")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let evt = rx.try_recv().unwrap();
    assert_eq!(evt.event_name, "api_request");
}

#[test]
fn unknown_path_404s() {
    // Build router and use the lower-level oneshot. Wrapped in a runtime.
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let (tx, _rx) = unbounded_channel();
        let app = build_router(ServerState { events_tx: tx });
        let resp = app
            .oneshot(Request::builder().uri("/v1/metrics").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), 404);
    });
}
```

The crate must expose `agent_overview` publicly for integration tests — this is already true because `lib.rs` declares `pub mod agent_overview;`. The crate's lib name is determined by `Cargo.toml` `[lib]` `name = "borgdock"` (verify it; if not present, the path `borgdock::agent_overview` may need adjustment to whatever the lib name actually is — check existing integration tests under `src-tauri/tests/` for the pattern).

- [ ] **Step 3: Run tests**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --test otlp_server_integration`
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/ src/BorgDock.Tauri/src-tauri/tests/
git commit -m "feat(agent-overview): axum POST /v1/logs route + integration test"
```

---

## Phase 4 — Settings & file merge

### Task 8: AgentOverviewSettings struct + WindowGeometry

**Files:**
- Modify: `src-tauri/src/settings/models.rs`

- [ ] **Step 1: Write a failing serde round-trip test**

Append a test module at the bottom of `src-tauri/src/settings/models.rs`. If it already has tests, add to that module; otherwise create:

```rust
#[cfg(test)]
mod agent_overview_settings_tests {
    use super::*;

    #[test]
    fn defaults_serialize_to_camel_case() {
        let s: AgentOverviewSettings = Default::default();
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["enabled"], false);
        assert_eq!(json["autoOpenOnStartup"], false);
        assert_eq!(json["awaitingNotifyAfterSeconds"], 30);
        assert_eq!(json["historyRetentionSeconds"], 14400);
    }

    #[test]
    fn round_trips_with_overrides() {
        let json = serde_json::json!({
            "enabled": true,
            "awaitingNotifyAfterSeconds": 45,
            "repoShortNames": { "FSP-Horizon": "FH" }
        });
        let s: AgentOverviewSettings = serde_json::from_value(json).unwrap();
        assert!(s.enabled);
        assert_eq!(s.awaiting_notify_after_seconds, 45);
        assert_eq!(s.repo_short_names.get("FSP-Horizon").unwrap(), "FH");
    }
}
```

- [ ] **Step 2: Add the structs**

Append to `src-tauri/src/settings/models.rs`, just before any `#[cfg(test)]`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOverviewSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub auto_open_on_startup: bool,
    #[serde(default)]
    pub window_state: Option<WindowGeometry>,
    #[serde(default)]
    pub repo_short_names: std::collections::HashMap<String, String>,
    #[serde(default = "default_notify_after")]
    pub awaiting_notify_after_seconds: u32,
    #[serde(default = "default_notify_escalate")]
    pub awaiting_notify_escalate_seconds: u32,
    #[serde(default = "default_idle_threshold")]
    pub idle_threshold_seconds: u32,
    #[serde(default = "default_ended_threshold")]
    pub ended_threshold_seconds: u32,
    #[serde(default = "default_history_retention")]
    pub history_retention_seconds: u32,
    #[serde(default = "default_export_interval")]
    pub otel_export_interval_ms: u32,
}

fn default_notify_after() -> u32 { 30 }
fn default_notify_escalate() -> u32 { 120 }
fn default_idle_threshold() -> u32 { 300 }
fn default_ended_threshold() -> u32 { 1800 }
fn default_history_retention() -> u32 { 14_400 }
fn default_export_interval() -> u32 { 2000 }

impl Default for AgentOverviewSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_open_on_startup: false,
            window_state: None,
            repo_short_names: std::collections::HashMap::new(),
            awaiting_notify_after_seconds: default_notify_after(),
            awaiting_notify_escalate_seconds: default_notify_escalate(),
            idle_threshold_seconds: default_idle_threshold(),
            ended_threshold_seconds: default_ended_threshold(),
            history_retention_seconds: default_history_retention(),
            otel_export_interval_ms: default_export_interval(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
```

- [ ] **Step 3: Add the field to `AppSettings`**

Find the `AppSettings` struct in the same file and add a field next to the others:

```rust
    #[serde(default)]
    pub agent_overview: AgentOverviewSettings,
```

- [ ] **Step 4: Run tests**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib settings::models::agent_overview_settings_tests`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/settings/models.rs
git commit -m "feat(agent-overview): settings field + camelCase round-trip"
```

---

### Task 9: Settings file merge — write + revert env block in `~/.claude/settings.json`

**Files:**
- Create: `src-tauri/src/agent_overview/settings_merge.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs`

- [ ] **Step 1: Register module**

```rust
pub mod bootstrap;
pub mod cwd_resolver;
pub mod otlp_server;
pub mod settings_merge;
pub mod state;
pub mod store;
pub mod types;
```

- [ ] **Step 2: Write the failing test**

Create `src-tauri/src/agent_overview/settings_merge.rs`:

```rust
use serde_json::{Map, Value};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const KEYS: &[&str] = &[
    "CLAUDE_CODE_ENABLE_TELEMETRY",
    "OTEL_LOGS_EXPORTER",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
    "OTEL_LOGS_EXPORT_INTERVAL",
    "OTEL_LOG_USER_PROMPTS",
    "OTEL_LOG_TOOL_DETAILS",
];

pub fn enable(path: &Path, port: u16, export_interval_ms: u32) -> Result<(), String> {
    let original = read_or_empty(path)?;
    backup_if_present(path, &original)?;

    let mut value = parse_or_empty(&original);
    let env = ensure_env_object(&mut value);
    env.insert("CLAUDE_CODE_ENABLE_TELEMETRY".into(), "1".into());
    env.insert("OTEL_LOGS_EXPORTER".into(), "otlp".into());
    env.insert("OTEL_EXPORTER_OTLP_PROTOCOL".into(), "http/json".into());
    env.insert(
        "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT".into(),
        format!("http://127.0.0.1:{port}/v1/logs").into(),
    );
    env.insert(
        "OTEL_LOGS_EXPORT_INTERVAL".into(),
        export_interval_ms.to_string().into(),
    );
    env.insert("OTEL_LOG_USER_PROMPTS".into(), "1".into());
    env.insert("OTEL_LOG_TOOL_DETAILS".into(), "1".into());
    write_pretty(path, &value)
}

pub fn disable(path: &Path) -> Result<(), String> {
    let original = read_or_empty(path)?;
    if original.is_empty() {
        return Ok(());
    }
    backup_if_present(path, &original)?;
    let mut value = parse_or_empty(&original);
    if let Some(env) = value
        .as_object_mut()
        .and_then(|m| m.get_mut("env"))
        .and_then(|v| v.as_object_mut())
    {
        for k in KEYS {
            env.remove(*k);
        }
    }
    write_pretty(path, &value)
}

fn read_or_empty(path: &Path) -> Result<String, String> {
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

fn backup_if_present(path: &Path, content: &str) -> Result<(), String> {
    if content.is_empty() {
        return Ok(());
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = path.with_extension(format!("json.bak.{ts}"));
    std::fs::write(&backup, content).map_err(|e| e.to_string())
}

fn parse_or_empty(s: &str) -> Value {
    if s.trim().is_empty() {
        Value::Object(Map::new())
    } else {
        serde_json::from_str(s).unwrap_or_else(|_| Value::Object(Map::new()))
    }
}

fn ensure_env_object(value: &mut Value) -> &mut Map<String, Value> {
    let obj = value.as_object_mut().expect("settings root must be an object");
    if !obj.contains_key("env") || !obj.get("env").map(|v| v.is_object()).unwrap_or(false) {
        obj.insert("env".into(), Value::Object(Map::new()));
    }
    obj.get_mut("env").unwrap().as_object_mut().unwrap()
}

fn write_pretty(path: &Path, value: &Value) -> Result<(), String> {
    let s = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, s).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn enable_creates_file_and_writes_env() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        enable(&p, 4318, 2000).unwrap();
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"], "1");
        assert_eq!(v["env"]["OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"], "http://127.0.0.1:4318/v1/logs");
        assert_eq!(v["env"]["OTEL_LOGS_EXPORT_INTERVAL"], "2000");
    }

    #[test]
    fn enable_preserves_other_fields_and_backs_up() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        fs::write(&p, r#"{ "theme": "dark", "env": { "EXISTING": "ok" } }"#).unwrap();
        enable(&p, 4318, 2000).unwrap();
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["theme"], "dark");
        assert_eq!(v["env"]["EXISTING"], "ok");
        assert_eq!(v["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"], "1");
        // Backup file present with original content
        let backups: Vec<_> = fs::read_dir(tmp.path()).unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".json.bak."))
            .collect();
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn disable_removes_only_our_keys() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        enable(&p, 4318, 2000).unwrap();
        // Add a non-our key to env
        let mut v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        v["env"]["KEEP_ME"] = "yes".into();
        fs::write(&p, serde_json::to_string_pretty(&v).unwrap()).unwrap();

        disable(&p).unwrap();
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert!(v["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"].is_null());
        assert_eq!(v["env"]["KEEP_ME"], "yes");
    }
}
```

- [ ] **Step 3: Run tests**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib agent_overview::settings_merge`
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/
git commit -m "feat(agent-overview): merge/revert env block in ~/.claude/settings.json"
```

---

## Phase 5 — Window opening + capabilities

### Task 10: Capabilities file

**Files:**
- Create: `src-tauri/capabilities/agent-overview.json`

- [ ] **Step 1: Create the capabilities file**

```json
{
  "identifier": "agent-overview-capability",
  "description": "Permissions for the Agent Overview pop-out window",
  "windows": ["agent-overview"],
  "permissions": [
    "core:default",
    "core:event:default",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-unmaximize",
    "core:window:allow-is-maximized",
    "core:window:allow-start-dragging",
    "core:window:allow-set-position",
    "core:window:allow-set-focus",
    "core:window:allow-outer-position",
    "core:window:allow-scale-factor",
    "core:window:allow-is-visible",
    "clipboard-manager:default",
    "clipboard-manager:allow-write-text",
    "log:default"
  ]
}
```

- [ ] **Step 2: Verify Tauri picks it up**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check -p borgdock`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/capabilities/agent-overview.json
git commit -m "feat(agent-overview): per-window capabilities"
```

---

### Task 11: `open_agent_overview_window` Tauri command

**Files:**
- Create: `src-tauri/src/agent_overview/window.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs`

- [ ] **Step 1: Register module**

```rust
pub mod bootstrap;
pub mod cwd_resolver;
pub mod otlp_server;
pub mod settings_merge;
pub mod state;
pub mod store;
pub mod types;
pub mod window;
```

- [ ] **Step 2: Implement the command**

Create `src-tauri/src/agent_overview/window.rs`:

```rust
use crate::settings::load_settings_internal;
use tauri::{
    Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

const DEFAULT_W: f64 = 1280.0;
const DEFAULT_H: f64 = 820.0;

#[tauri::command]
pub async fn open_agent_overview_window(app: tauri::AppHandle) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            if let Some(existing) = app.get_webview_window("agent-overview") {
                existing.show().map_err(|e| e.to_string())?;
                existing.set_focus().map_err(|e| e.to_string())?;
                return Ok(());
            }

            let settings = load_settings_internal().ok();
            let win_state = settings
                .as_ref()
                .and_then(|s| s.agent_overview.window_state.clone());

            let mut builder = WebviewWindowBuilder::new(
                &app,
                "agent-overview",
                WebviewUrl::App("agent-overview.html".into()),
            )
            .title("BorgDock — Agent Overview")
            .inner_size(DEFAULT_W, DEFAULT_H)
            .min_inner_size(720.0, 480.0)
            .decorations(false)
            .resizable(true)
            .skip_taskbar(false)
            .shadow(true)
            .visible(true);

            if let Some(g) = &win_state {
                builder = builder
                    .inner_size(g.width as f64, g.height as f64)
                    .position(g.x as f64, g.y as f64);
            }

            let win = builder.build().map_err(|e| e.to_string())?;
            // Snap to stored geometry as a second pass; some Tauri versions
            // ignore inner_size on first build under HiDPI.
            if let Some(g) = win_state {
                win.set_size(tauri::Size::Physical(PhysicalSize::new(g.width, g.height)))
                    .ok();
                win.set_position(tauri::Position::Physical(PhysicalPosition::new(g.x, g.y)))
                    .ok();
            }
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
```

- [ ] **Step 3: cargo check**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check -p borgdock`
Expected: 0 errors. Warnings about unused command will resolve in Task 13 when we register it.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/
git commit -m "feat(agent-overview): open_agent_overview_window command"
```

---

## Phase 6 — Wiring: lib.rs setup

### Task 12: Token-max model map + commands module

**Files:**
- Create: `src-tauri/src/agent_overview/models.rs`
- Create: `src-tauri/src/agent_overview/commands.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs`

- [ ] **Step 1: Register modules**

```rust
pub mod bootstrap;
pub mod commands;
pub mod cwd_resolver;
pub mod models;
pub mod otlp_server;
pub mod settings_merge;
pub mod state;
pub mod store;
pub mod types;
pub mod window;

pub use commands::{
    disable_agent_overview_telemetry, list_agent_sessions, set_agent_overview_enabled,
};
pub use window::open_agent_overview_window;
```

- [ ] **Step 2: Implement `models.rs`**

Create `src-tauri/src/agent_overview/models.rs`:

```rust
/// Approximate context-window size per model id. Falls back to 200_000 if the
/// model is unknown.
pub fn tokens_max_for_model(model: &str) -> u64 {
    match model {
        m if m.starts_with("claude-opus-4-7") => 200_000,
        m if m.starts_with("claude-sonnet-4-6") => 1_000_000,
        m if m.starts_with("claude-sonnet-4-5") => 200_000,
        m if m.starts_with("claude-haiku-4-5") => 200_000,
        _ => 200_000,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_and_unknown_models() {
        assert_eq!(tokens_max_for_model("claude-sonnet-4-6"), 1_000_000);
        assert_eq!(tokens_max_for_model("claude-opus-4-7"), 200_000);
        assert_eq!(tokens_max_for_model("claude-mystery-9"), 200_000);
    }
}
```

- [ ] **Step 3: Implement `commands.rs`**

Create `src-tauri/src/agent_overview/commands.rs`:

```rust
use crate::agent_overview::settings_merge;
use crate::agent_overview::store::SessionStore;
use crate::agent_overview::types::SessionRecord;

#[tauri::command]
pub fn list_agent_sessions(store: tauri::State<SessionStore>) -> Vec<SessionRecord> {
    store.snapshot()
}

#[tauri::command]
pub async fn set_agent_overview_enabled(
    enabled: bool,
    port: u16,
    export_interval_ms: u32,
) -> Result<(), String> {
    let dir = dirs::home_dir().ok_or("home dir unknown")?.join(".claude");
    let path = dir.join("settings.json");
    if enabled {
        settings_merge::enable(&path, port, export_interval_ms)
    } else {
        settings_merge::disable(&path)
    }
}

#[tauri::command]
pub async fn disable_agent_overview_telemetry() -> Result<(), String> {
    set_agent_overview_enabled(false, 0, 0).await
}
```

- [ ] **Step 4: Run cargo check + tests**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib agent_overview`
Expected: all 18+ tests so far pass. 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/
git commit -m "feat(agent-overview): tokens-max model map + Tauri commands"
```

---

### Task 13: Start the OTLP server, run the ticker, register commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add state, server start, ticker, and command registration**

In `src-tauri/src/lib.rs`, find the `.manage(...)` chain inside `pub fn run()` and append after `.manage(file_palette::cache::FileIndexCache { ... })`:

```rust
        .manage(crate::agent_overview::store::SessionStore::default())
        .manage(crate::agent_overview::cwd_resolver::CwdCache::default())
```

In the `.setup(|app| { ... })` closure, after the existing `file_palette::cache::init(...)` call, add:

```rust
            // Agent Overview — start OTLP receiver + bootstrap if user has
            // opted in (Settings.agent_overview.enabled). Otherwise it stays
            // dormant until the user enables it via the Settings UI.
            {
                let store = app.state::<crate::agent_overview::store::SessionStore>().inner().clone();
                let cwd_cache = app.state::<crate::agent_overview::cwd_resolver::CwdCache>().inner().clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use crate::agent_overview::{bootstrap, cwd_resolver, otlp_server, store as st};
                    use tauri::Emitter;
                    use tokio::sync::mpsc::unbounded_channel;

                    let settings = crate::settings::load_settings_internal().ok();
                    let cfg = settings.as_ref().map(|s| s.agent_overview.clone()).unwrap_or_default();
                    if !cfg.enabled {
                        log::info!("agent_overview: disabled, skipping startup");
                        return;
                    }

                    // Bootstrap from filesystem
                    let (delta_tx, mut delta_rx) = unbounded_channel();
                    if let Some(root) = cwd_resolver::default_projects_root() {
                        let n = bootstrap::bootstrap_known_sessions(
                            &root, &store, &delta_tx,
                            std::time::Duration::from_secs(cfg.history_retention_seconds.into()),
                        );
                        log::info!("agent_overview: bootstrapped {n} sessions");
                    }

                    // Forward deltas to the frontend
                    let app_for_emit = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        while let Some(delta) = delta_rx.recv().await {
                            let _ = app_for_emit.emit_to(
                                tauri::EventTarget::WebviewWindow { label: "agent-overview".into() },
                                "agent-sessions-changed",
                                &delta,
                            );
                        }
                    });

                    // OTLP receiver
                    let (events_tx, mut events_rx) = unbounded_channel();
                    let (listener, port) = match otlp_server::try_bind(4318).await {
                        Ok(v) => v,
                        Err(e) => {
                            log::error!("agent_overview: failed to bind OTLP port: {e}");
                            return;
                        }
                    };
                    log::info!("agent_overview: OTLP listening on 127.0.0.1:{port}");
                    let router = otlp_server::build_router(otlp_server::ServerState { events_tx });
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = axum::serve(listener, router).await {
                            log::error!("agent_overview: server exited: {e}");
                        }
                    });

                    // Event consumer + 1Hz ticker
                    let store_for_loop = store.clone();
                    let cwd_for_loop = cwd_cache.clone();
                    let delta_for_loop = delta_tx.clone();
                    let thresholds = st::StoreThresholds {
                        idle_after: std::time::Duration::from_secs(cfg.idle_threshold_seconds.into()),
                        ended_after: std::time::Duration::from_secs(cfg.ended_threshold_seconds.into()),
                        finished_to_awaiting_after: std::time::Duration::from_secs(30),
                        history_retention: std::time::Duration::from_secs(cfg.history_retention_seconds.into()),
                    };
                    tauri::async_runtime::spawn(async move {
                        let projects_root = cwd_resolver::default_projects_root();
                        let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
                        loop {
                            tokio::select! {
                                Some(evt) = events_rx.recv() => {
                                    let cwd_info = projects_root.as_ref()
                                        .and_then(|r| cwd_resolver::resolve_cwd(&evt.session_id, &cwd_for_loop, r));
                                    store_for_loop.ingest_event(evt, cwd_info, &delta_for_loop, std::time::Instant::now());
                                }
                                _ = tick.tick() => {
                                    store_for_loop.run_tick(thresholds, &delta_for_loop, std::time::Instant::now());
                                }
                            }
                        }
                    });
                });
            }
```

- [ ] **Step 2: Add the commands to `invoke_handler!`**

Find the `tauri::generate_handler![...]` block and append:

```rust
            // Agent Overview
            agent_overview::commands::list_agent_sessions,
            agent_overview::commands::set_agent_overview_enabled,
            agent_overview::commands::disable_agent_overview_telemetry,
            agent_overview::open_agent_overview_window,
```

- [ ] **Step 3: cargo check**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check -p borgdock`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Smoke-build**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo build -p borgdock`
Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(agent-overview): wire OTLP receiver, ticker, bootstrap into setup"
```

---

## Phase 7 — Frontend: types & service helpers

### Task 14: TS types mirroring Rust

**Files:**
- Create: `src/services/agent-overview-types.ts`

- [ ] **Step 1: Create the types**

```ts
export type SessionState =
  | 'working'
  | 'tool'
  | 'awaiting'
  | 'finished'
  | 'idle'
  | 'ended';

export interface SessionRecord {
  sessionId: string;
  cwd: string;
  repo: string;
  worktree: string;
  branch: string;
  label: string;
  state: SessionState;
  stateSinceMs: number;
  lastEventMs: number;
  lastUserMsg: string | null;
  task: string | null;
  model: string | null;
  tokensUsed: number;
  tokensMax: number;
  lastApiStopReason: string | null;
}

export type SessionDelta =
  | { kind: 'upsert'; session: SessionRecord }
  | { kind: 'remove'; sessionId: string };

export interface StateDef {
  label: string;
  short: string;
  tone: 'warning' | 'success' | 'neutral' | 'draft';
  dotTone: 'yellow' | 'green' | 'violet' | 'gray';
  pulse: boolean;
  priority: number;
  description: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/src/services/agent-overview-types.ts
git commit -m "feat(agent-overview): TS types mirroring Rust SessionRecord"
```

---

### Task 15: Service helpers — `agent-overview.ts`

**Files:**
- Create: `src/services/agent-overview.ts`
- Create: `src/services/__tests__/agent-overview.test.ts`

Reference: lift the helpers from `agent-data.jsx` in the design bundle (already extracted under `C:\Users\KoenvanderBorghtGomo\AppData\Local\Temp\agent-overview-design\extracted\borgdock\project\components\agent-data.jsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/agent-overview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  STATE_DEFS,
  fmtSince,
  fmtSinceShort,
  groupByRepo,
  groupByRepoWorktree,
  pickDensity,
  synthLabel,
  tokenPct,
} from '../agent-overview';
import type { SessionRecord } from '../agent-overview-types';

const baseRecord = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  sessionId: 'sid',
  cwd: '/x',
  repo: 'BorgDock',
  worktree: 'master',
  branch: 'master',
  label: 'BD · master #1',
  state: 'working',
  stateSinceMs: 0,
  lastEventMs: 0,
  lastUserMsg: null,
  task: null,
  model: null,
  tokensUsed: 0,
  tokensMax: 200_000,
  lastApiStopReason: null,
  ...overrides,
});

describe('synthLabel', () => {
  it('uses initials for hyphenated and CamelCase names', () => {
    expect(synthLabel('BorgDock', 'master', 1, {})).toBe('BD · master #1');
    expect(synthLabel('FSP-Horizon', 'wt2', 3, {})).toBe('FH · wt2 #3');
  });
  it('respects override map', () => {
    expect(synthLabel('BorgDock', 'master', 1, { BorgDock: 'B' })).toBe('B · master #1');
  });
});

describe('pickDensity', () => {
  it('picks roomy/standard/wall by active count', () => {
    expect(pickDensity(3)).toBe('roomy');
    expect(pickDensity(8)).toBe('standard');
    expect(pickDensity(20)).toBe('wall');
  });
});

describe('fmtSince', () => {
  it('formats seconds, minutes, hours', () => {
    expect(fmtSince(45_000)).toBe('45s');
    expect(fmtSince(125_000)).toBe('2m 5s');
    expect(fmtSince(3_660_000)).toBe('1h 1m');
  });
  it('short variant', () => {
    expect(fmtSinceShort(45_000)).toBe('45s');
    expect(fmtSinceShort(125_000)).toBe('2m');
    expect(fmtSinceShort(3_660_000)).toBe('1h');
  });
});

describe('tokenPct', () => {
  it('clamps to 100', () => {
    expect(tokenPct(baseRecord({ tokensUsed: 50_000, tokensMax: 200_000 }))).toBe(25);
    expect(tokenPct(baseRecord({ tokensUsed: 250_000, tokensMax: 200_000 }))).toBe(100);
  });
});

describe('groupByRepo / groupByRepoWorktree', () => {
  it('groups by repo and worktree', () => {
    const recs = [
      baseRecord({ sessionId: 'a', repo: 'X', worktree: 'master' }),
      baseRecord({ sessionId: 'b', repo: 'X', worktree: 'wt2' }),
      baseRecord({ sessionId: 'c', repo: 'Y', worktree: 'master' }),
    ];
    const r = groupByRepo(recs);
    expect(r).toHaveLength(2);
    const rw = groupByRepoWorktree(recs);
    expect(rw[0].worktrees).toHaveLength(2);
  });
});

describe('STATE_DEFS', () => {
  it('has an entry per state', () => {
    for (const s of ['working', 'tool', 'awaiting', 'finished', 'idle', 'ended'] as const) {
      expect(STATE_DEFS[s]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Implement `agent-overview.ts`**

```ts
import type { SessionRecord, SessionState, StateDef } from './agent-overview-types';

export const STATE_DEFS: Record<SessionState, StateDef> = {
  awaiting:  { label: 'Awaiting input', short: 'Awaiting', tone: 'warning', dotTone: 'yellow', pulse: true,  priority: 0, description: 'Waiting for you' },
  finished:  { label: 'Just finished',  short: 'Finished', tone: 'success', dotTone: 'green',  pulse: false, priority: 1, description: 'Fresh output' },
  working:   { label: 'Working',        short: 'Working',  tone: 'neutral', dotTone: 'violet', pulse: false, priority: 2, description: 'Producing tokens' },
  tool:      { label: 'Tool running',   short: 'Tool',     tone: 'neutral', dotTone: 'violet', pulse: false, priority: 3, description: 'Long-running tool' },
  idle:      { label: 'Idle',           short: 'Idle',     tone: 'draft',   dotTone: 'gray',   pulse: false, priority: 4, description: 'No recent activity' },
  ended:     { label: 'Ended',          short: 'Ended',    tone: 'draft',   dotTone: 'gray',   pulse: false, priority: 5, description: 'Session ended' },
};

export function fmtSince(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtSinceShort(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export function tokenPct(r: SessionRecord): number {
  if (r.tokensMax <= 0) return 0;
  return Math.min(100, Math.round((r.tokensUsed / r.tokensMax) * 100));
}

export function pickDensity(activeCount: number): 'roomy' | 'standard' | 'wall' {
  if (activeCount <= 6) return 'roomy';
  if (activeCount <= 12) return 'standard';
  return 'wall';
}

export function synthLabel(
  repo: string,
  worktree: string,
  index: number,
  overrides: Record<string, string>,
): string {
  const short = overrides[repo] ?? defaultShortRepo(repo);
  return `${short} · ${worktree} #${index}`;
}

function defaultShortRepo(repo: string): string {
  const parts = repo.split(/[-_ ]/);
  if (parts.length > 1) {
    return parts.map((p) => (p[0] ?? '').toUpperCase()).join('').slice(0, 4) || '?';
  }
  // CamelCase initials fallback
  const caps = repo.match(/[A-Z]/g) ?? [];
  if (caps.length >= 2) return caps.join('').slice(0, 4);
  return repo.slice(0, 2).toUpperCase();
}

export function groupByRepo(records: SessionRecord[]): Array<{ repo: string; agents: SessionRecord[] }> {
  const map = new Map<string, SessionRecord[]>();
  for (const r of records) {
    const list = map.get(r.repo) ?? [];
    list.push(r);
    map.set(r.repo, list);
  }
  return [...map.entries()].map(([repo, agents]) => ({ repo, agents }));
}

export function groupByRepoWorktree(records: SessionRecord[]) {
  const repos = groupByRepo(records);
  return repos.map(({ repo, agents }) => {
    const wts = new Map<string, SessionRecord[]>();
    for (const a of agents) {
      const list = wts.get(a.worktree) ?? [];
      list.push(a);
      wts.set(a.worktree, list);
    }
    return {
      repo,
      worktrees: [...wts.entries()].map(([worktree, list]) => ({
        worktree,
        branch: list[0]?.branch ?? '',
        agents: list,
      })),
    };
  });
}

export function awaitingCount(records: SessionRecord[]): number {
  return records.filter((r) => r.state === 'awaiting').length;
}
```

- [ ] **Step 3: Run tests**

Run from `src/BorgDock.Tauri`: `npm test -- src/services/__tests__/agent-overview.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/services/agent-overview.ts src/BorgDock.Tauri/src/services/__tests__/agent-overview.test.ts
git commit -m "feat(agent-overview): pure helpers + tests"
```

---

## Phase 8 — Frontend: visual primitives

### Task 16: StateDot, StatePill, RepoMark, TokenBar, SegmentedToggle

**Files:**
- Create: `src/components/agent-overview/StateDot.tsx`
- Create: `src/components/agent-overview/StatePill.tsx`
- Create: `src/components/agent-overview/RepoMark.tsx`
- Create: `src/components/agent-overview/TokenBar.tsx`
- Create: `src/components/agent-overview/SegmentedToggle.tsx`
- Create: `src/styles/agent-overview.css`
- Create: `src/components/agent-overview/__tests__/StateDot.test.tsx`
- Create: `src/components/agent-overview/__tests__/StatePill.test.tsx`
- Create: `src/components/agent-overview/__tests__/RepoMark.test.tsx`
- Create: `src/components/agent-overview/__tests__/TokenBar.test.tsx`
- Create: `src/components/agent-overview/__tests__/SegmentedToggle.test.tsx`

Reference (port verbatim, then convert to TSX with proper typing): `agent-primitives.jsx` from the design bundle. The CSS in that file goes into `src/styles/agent-overview.css` instead of `injectAgentStyles()` — copy the CSS body unchanged.

- [ ] **Step 1: Create the stylesheet**

Create `src/styles/agent-overview.css`. Copy the entire `s.textContent = \`...\`` template literal from `agent-primitives.jsx` (lines ~7–192 of the bundle file) into the file as raw CSS. Strip the JS template wrapper so it's plain CSS.

- [ ] **Step 2: Write the failing tests**

Create `src/components/agent-overview/__tests__/StateDot.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StateDot } from '../StateDot';

describe('StateDot', () => {
  it.each([
    ['awaiting', 'bd-dot--yellow'],
    ['working', 'bd-dot--violet'],
    ['tool', 'bd-dot--violet'],
    ['finished', 'bd-dot--green'],
    ['idle', 'bd-dot--gray'],
    ['ended', 'bd-dot--gray'],
  ] as const)('renders %s with class %s', (state, cls) => {
    const { container } = render(<StateDot state={state} />);
    expect(container.querySelector(`.${cls}`)).toBeTruthy();
  });

  it('applies pulse animation only for awaiting', () => {
    const { container } = render(<StateDot state="awaiting" />);
    const span = container.querySelector('.bd-dot') as HTMLSpanElement;
    expect(span.style.animation).toContain('bd-pulse-halo');
  });
});
```

Create `src/components/agent-overview/__tests__/StatePill.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatePill } from '../StatePill';

describe('StatePill', () => {
  it('shows the human label', () => {
    render(<StatePill state="awaiting" />);
    expect(screen.getByText('Awaiting input')).toBeInTheDocument();
  });
});
```

Create `src/components/agent-overview/__tests__/RepoMark.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepoMark } from '../RepoMark';

describe('RepoMark', () => {
  it('shows BD for BorgDock and FH for FSP-Horizon', () => {
    const { rerender } = render(<RepoMark repo="BorgDock" />);
    expect(screen.getByText('BD')).toBeInTheDocument();
    rerender(<RepoMark repo="FSP-Horizon" />);
    expect(screen.getByText('FH')).toBeInTheDocument();
  });
});
```

Create `src/components/agent-overview/__tests__/TokenBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenBar } from '../TokenBar';

describe('TokenBar', () => {
  it('shows the percent', () => {
    render(<TokenBar pct={42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});
```

Create `src/components/agent-overview/__tests__/SegmentedToggle.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedToggle } from '../SegmentedToggle';

describe('SegmentedToggle', () => {
  it('emits onChange when an option is clicked', () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggle
        value="a"
        onChange={onChange}
        options={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]}
      />,
    );
    fireEvent.click(screen.getByText('B'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 3: Implement the components**

Create `src/components/agent-overview/StateDot.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { STATE_DEFS } from '@/services/agent-overview';
import type { SessionState } from '@/services/agent-overview-types';

interface StateDotProps {
  state: SessionState;
  size?: number;
}

const dotClass: Record<SessionState, string> = {
  awaiting: 'bd-dot--yellow',
  working: 'bd-dot--violet',
  tool: 'bd-dot--violet',
  finished: 'bd-dot--green',
  idle: 'bd-dot--gray',
  ended: 'bd-dot--gray',
};

export function StateDot({ state, size = 8 }: StateDotProps) {
  const def = STATE_DEFS[state];
  const style: CSSProperties = {
    width: size,
    height: size,
    animation:
      state === 'awaiting'
        ? 'bd-pulse-halo 2s ease-out infinite'
        : state === 'working'
          ? 'bd-pulse-soft 1.6s ease-in-out infinite'
          : undefined,
    boxShadow: state === 'awaiting' ? '0 0 0 0 rgba(176,125,9,0.5)' : undefined,
  };
  return <span className={`bd-dot ${dotClass[state]}`} style={style} aria-label={def.label} />;
}
```

Create `src/components/agent-overview/StatePill.tsx`:

```tsx
import { STATE_DEFS } from '@/services/agent-overview';
import type { SessionState } from '@/services/agent-overview-types';
import { StateDot } from './StateDot';

export function StatePill({ state }: { state: SessionState }) {
  const def = STATE_DEFS[state];
  return (
    <span className={`bd-pill bd-pill--${def.tone}`}>
      <StateDot state={state} size={6} />
      {def.label}
    </span>
  );
}
```

Create `src/components/agent-overview/RepoMark.tsx`:

```tsx
interface RepoMarkProps {
  repo: string;
  size?: number;
}

const KNOWN: Record<string, string> = {
  'FSP-Horizon': 'linear-gradient(135deg, #3ba68e, #2d8b75)',
  BorgDock: 'linear-gradient(135deg, #6655d4, #7c6af6)',
};

export function RepoMark({ repo, size = 22 }: RepoMarkProps) {
  const initials =
    repo === 'FSP-Horizon'
      ? 'FH'
      : repo === 'BorgDock'
        ? 'BD'
        : repo.slice(0, 2).toUpperCase();
  const tone = KNOWN[repo] ?? 'linear-gradient(135deg, #8a85a0, #5a5670)';
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        background: tone,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size <= 18 ? 9 : 10,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}
```

Create `src/components/agent-overview/TokenBar.tsx`:

```tsx
interface TokenBarProps {
  pct: number;
  width?: number;
}

export function TokenBar({ pct, width = 60 }: TokenBarProps) {
  const fill =
    pct > 85 ? 'var(--color-status-red)' : pct > 65 ? 'var(--color-status-yellow)' : 'var(--color-accent)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width,
          height: 3,
          borderRadius: 999,
          background: 'var(--color-surface-hover)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: `${pct}%`,
            background: fill,
          }}
        />
      </div>
      <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
        {pct}%
      </span>
    </div>
  );
}
```

Create `src/components/agent-overview/SegmentedToggle.tsx`:

```tsx
interface ToggleOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ToggleOption<T>[];
}

export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: SegmentedToggleProps<T>) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--color-surface-hover)',
        borderRadius: 999,
        padding: 2,
        border: '1px solid var(--color-subtle-border)',
      }}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              height: 20,
              padding: '0 9px',
              border: 0,
              borderRadius: 999,
              background: active ? 'var(--color-surface)' : 'transparent',
              color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              fontFamily: 'inherit',
              transition: 'all 120ms ease',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/components/agent-overview/__tests__/`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/ src/BorgDock.Tauri/src/styles/agent-overview.css
git commit -m "feat(agent-overview): visual primitives (dot/pill/mark/bar/toggle)"
```

---

## Phase 9 — Frontend: cards

### Task 17: AgentCard, AgentTile, AwaitingRailItem, AgentCardLarge

**Files:**
- Create: `src/components/agent-overview/AgentCard.tsx`
- Create: `src/components/agent-overview/AgentCardLarge.tsx`
- Create: `src/components/agent-overview/AgentTile.tsx`
- Create: `src/components/agent-overview/AwaitingRailItem.tsx`
- Create: `src/components/agent-overview/__tests__/AgentCard.test.tsx`
- Create: `src/components/agent-overview/__tests__/AgentTile.test.tsx`

Reference: `agent-card.jsx` from the design bundle. The components in that file map 1:1 to the four files above; `AwaitingRailItem` and `AgentCardLarge` come from there too. Port verbatim, adapt to TSX with proper props typing, replace `STATE_DEFS` references with imports from `@/services/agent-overview`.

- [ ] **Step 1: Write failing test for AgentCard**

Create `src/components/agent-overview/__tests__/AgentCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '@/services/agent-overview-types';
import { AgentCard } from '../AgentCard';

const base: SessionRecord = {
  sessionId: 'sid',
  cwd: '/x',
  repo: 'BorgDock',
  worktree: 'master',
  branch: 'master',
  label: 'BD · master #1',
  state: 'working',
  stateSinceMs: 9_000,
  lastEventMs: 1_000,
  lastUserMsg: 'Refactor the foo bar baz',
  task: 'Reading foo.ts',
  model: 'claude-sonnet-4-6',
  tokensUsed: 64_000,
  tokensMax: 200_000,
  lastApiStopReason: null,
};

describe('AgentCard', () => {
  it.each([['awaiting'], ['working'], ['tool'], ['finished'], ['idle']] as const)(
    'renders %s without throwing',
    (state) => {
      const { container } = render(<AgentCard agent={{ ...base, state }} />);
      expect(container.firstChild).toBeTruthy();
    },
  );

  it('shows quoted last user msg', () => {
    render(<AgentCard agent={base} />);
    expect(screen.getByText(/Refactor the foo bar baz/)).toBeInTheDocument();
  });

  it('marching ants only for tool state', () => {
    const { container, rerender } = render(<AgentCard agent={{ ...base, state: 'tool' }} />);
    expect(container.querySelector('.bd-ants')).toBeTruthy();
    rerender(<AgentCard agent={{ ...base, state: 'working' }} />);
    expect(container.querySelector('.bd-ants')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Implement AgentCard**

Create `src/components/agent-overview/AgentCard.tsx` by porting the bundle file. Key adaptations: replace `def.short.toLowerCase()` with `STATE_DEFS[agent.state].short.toLowerCase()`, replace `Icons.*` with whichever icon set BorgDock uses (search the codebase for an existing icon module — likely `@/icons` or inline SVG; substitute matching glyphs for Terminal / Spinner / AlertCircle / CheckCircle / Clock).

(Full code from `agent-card.jsx` lines 4–69 with TSX conversions; engineer reads the source file at `C:\Users\KoenvanderBorghtGomo\AppData\Local\Temp\agent-overview-design\extracted\borgdock\project\components\agent-card.jsx` and ports it.)

```tsx
import type { SessionRecord } from '@/services/agent-overview-types';
import { STATE_DEFS, fmtSince, tokenPct } from '@/services/agent-overview';
import { RepoMark } from './RepoMark';
import { StatePill } from './StatePill';
import { TokenBar } from './TokenBar';
// Use the project's existing icon module; e.g. from '@/icons' or '@/components/shared/Icons'.
// If none matches the bundle's icons exactly, render small unicode glyphs:
//   Terminal: '⌘', Spinner: '↻', AlertCircle: '!', CheckCircle: '✓', Clock: '⌚'

interface AgentCardProps {
  agent: SessionRecord;
  density?: 'comfortable' | 'compact';
  showRepo?: boolean;
}

export function AgentCard({ agent, density = 'comfortable', showRepo = false }: AgentCardProps) {
  const def = STATE_DEFS[agent.state];
  const compact = density === 'compact';
  const pct = tokenPct(agent);

  return (
    <div className={`ag-card ag-card--${agent.state}`} style={{ padding: compact ? '10px 12px' : '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 6 : 8 }}>
        {showRepo && <RepoMark repo={agent.repo} size={18} />}
        <span className="ag-pane">{agent.label}</span>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>·</span>
        <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {agent.worktree === 'master' ? agent.branch : `${agent.worktree} · ${truncate(agent.branch, 28)}`}
        </span>
        <span style={{ flex: 1 }} />
        <StatePill state={agent.state} />
      </div>

      {agent.lastUserMsg && (
        <div
          style={{
            fontSize: 12, color: 'var(--color-text-secondary)',
            lineHeight: 1.45, marginBottom: 6,
            display: '-webkit-box',
            WebkitLineClamp: compact ? 1 : 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          <span style={{ color: 'var(--color-text-faint)' }}>“ </span>
          {agent.lastUserMsg}
          <span style={{ color: 'var(--color-text-faint)' }}> ”</span>
        </div>
      )}

      {agent.task && (
        <div
          style={{
            fontSize: 11,
            color: agent.state === 'awaiting' ? 'var(--color-warning-badge-fg)' : 'var(--color-text-tertiary)',
            marginBottom: compact ? 8 : 10,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.task}</span>
        </div>
      )}

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingTop: compact ? 6 : 8,
          borderTop: '1px solid var(--color-subtle-border)',
          fontSize: 10, color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-code)', letterSpacing: '0.02em',
        }}
      >
        <span>
          {def.short.toLowerCase()} · {fmtSince(agent.stateSinceMs)}
        </span>
        <span style={{ flex: 1 }} />
        <TokenBar pct={pct} width={48} />
      </div>

      {agent.state === 'tool' && (
        <div className="bd-ants" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />
      )}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
```

Implement `AgentTile.tsx`, `AwaitingRailItem.tsx`, `AgentCardLarge.tsx` using the same pattern from `agent-card.jsx` (`AgentTile` lines ~91–117, `AwaitingRailItem` lines ~120–159; `AgentCardLarge` is referenced in `agent-var-e.jsx` — engineer either copies it from the bundle if present, or derives it as a wider variant of AgentCard with full 2-line `lastUserMsg`, repo mark always shown, and an extra footer row with `task`).

- [ ] **Step 3: Run tests**

Run: `npm test -- src/components/agent-overview/__tests__/AgentCard.test.tsx`
Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/
git commit -m "feat(agent-overview): card components (Card/Tile/RailItem/CardLarge)"
```

---

## Phase 10 — Frontend: layout sections

### Task 18: AwaitingRail, IdleRail, RepoGrouped, StatusGrouped

**Files:**
- Create: `src/components/agent-overview/AwaitingRail.tsx`
- Create: `src/components/agent-overview/IdleRail.tsx`
- Create: `src/components/agent-overview/RepoGrouped.tsx`
- Create: `src/components/agent-overview/StatusGrouped.tsx`
- Create: `src/components/agent-overview/__tests__/AwaitingRail.test.tsx`

Reference: `agent-var-e.jsx` from the bundle, lines 153–344 (AwaitingRail, RepoGrouped, StatusGrouped, RepoHeader, WorktreeHeader, IdleRail). Port verbatim with TSX adaptations.

- [ ] **Step 1: Write failing test for AwaitingRail**

Create `src/components/agent-overview/__tests__/AwaitingRail.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '@/services/agent-overview-types';
import { AwaitingRail } from '../AwaitingRail';

function rec(id: string, msAgo: number): SessionRecord {
  return {
    sessionId: id,
    cwd: '/x',
    repo: 'BorgDock',
    worktree: 'master',
    branch: 'master',
    label: `BD · master #${id}`,
    state: 'awaiting',
    stateSinceMs: msAgo,
    lastEventMs: msAgo,
    lastUserMsg: 'msg',
    task: 'Wants confirmation',
    model: 'claude-sonnet-4-6',
    tokensUsed: 0,
    tokensMax: 200_000,
    lastApiStopReason: 'end_turn',
  };
}

describe('AwaitingRail', () => {
  it('renders the count and oldest-since', () => {
    const agents = [rec('1', 60_000), rec('2', 240_000)];
    render(<AwaitingRail agents={agents} density="standard" />);
    expect(screen.getByText(/2 sessions waiting on you/)).toBeInTheDocument();
    expect(screen.getByText(/oldest 4m ago/)).toBeInTheDocument();
  });

  it('renders nothing when there are no agents', () => {
    const { container } = render(<AwaitingRail agents={[]} density="standard" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Implement the layout components**

Each file ports the corresponding section from `agent-var-e.jsx`. Wire `density` and `agents` props the same way. Examples (AwaitingRail shown; the other three follow the same pattern):

```tsx
import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort } from '@/services/agent-overview';
import { AgentCardLarge } from './AgentCardLarge';
import { AwaitingRailItem } from './AwaitingRailItem';

interface AwaitingRailProps {
  agents: SessionRecord[];
  density: 'roomy' | 'standard' | 'wall';
}

export function AwaitingRail({ agents, density }: AwaitingRailProps) {
  if (agents.length === 0) return null;
  const oldest = Math.max(...agents.map((a) => a.stateSinceMs));

  return (
    <section className="ag-alert-rail" style={{ marginBottom: 16, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--color-status-yellow)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', flexShrink: 0,
          }}
        >
          !
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-warning-badge-fg)' }}>
          {agents.length} session{agents.length === 1 ? '' : 's'} waiting on you
        </span>
        <span style={{ flex: 1 }} />
        <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-warning-badge-fg)' }}>
          oldest {fmtSinceShort(oldest)} ago
        </span>
      </div>
      {density === 'roomy' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 10 }}>
          {agents.map((a) => <AgentCardLarge key={a.sessionId} agent={a} />)}
        </div>
      ) : density === 'wall' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {agents.map((a) => <AwaitingRailItem key={a.sessionId} agent={a} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
          {agents.map((a) => <AwaitingRailItem key={a.sessionId} agent={a} />)}
        </div>
      )}
    </section>
  );
}
```

For `IdleRail.tsx`, `RepoGrouped.tsx`, `StatusGrouped.tsx`, port lines 193–344 of `agent-var-e.jsx`. Replace `Icons.Branch` with a small `<svg>` for a branch glyph (or text fallback `⎇`).

- [ ] **Step 3: Run tests**

Run: `npm test -- src/components/agent-overview/__tests__/`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/
git commit -m "feat(agent-overview): layout sections (AwaitingRail/IdleRail/RepoGrouped/StatusGrouped)"
```

---

### Task 19: Titlebar + Statusbar

**Files:**
- Create: `src/components/agent-overview/Titlebar.tsx`
- Create: `src/components/agent-overview/Statusbar.tsx`

Reference: `agent-var-e.jsx` lines 33–79 (Titlebar) + 99–118 (Statusbar). Port verbatim. Wire window-control buttons (minimize, close, maximize) to the existing Tauri window plugin. Pattern from existing pop-outs: `await getCurrentWebviewWindow().minimize()` etc.

- [ ] **Step 1: Implement**

```tsx
// Titlebar.tsx
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { SegmentedToggle } from './SegmentedToggle';

interface TitlebarProps {
  totalAwaiting: number;
  totalSessions: number;
  totalRepos: number;
  grouping: 'repo' | 'status';
  onGroupingChange: (g: 'repo' | 'status') => void;
  density: 'auto' | 'roomy' | 'standard' | 'wall';
  onDensityChange: (d: 'auto' | 'roomy' | 'standard' | 'wall') => void;
}

export function Titlebar(props: TitlebarProps) {
  const w = getCurrentWebviewWindow();
  return (
    <div className="bd-titlebar">
      <span className="bd-titlebar__title">BorgDock</span>
      <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>·</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Agent overview</span>
      {props.totalAwaiting > 0 && (
        <span className="ag-tb-alert">
          <span className="pulse" />
          {props.totalAwaiting} awaiting input
        </span>
      )}
      <span className="bd-titlebar__count">
        {props.totalSessions} sessions · {props.totalRepos} repos
      </span>
      <span style={{ flex: 1 }} />
      <SegmentedToggle
        value={props.grouping}
        onChange={props.onGroupingChange}
        options={[{ id: 'repo', label: 'Repo' }, { id: 'status', label: 'Status' }]}
      />
      <SegmentedToggle
        value={props.density}
        onChange={props.onDensityChange}
        options={[
          { id: 'auto', label: 'Auto' },
          { id: 'roomy', label: 'Roomy' },
          { id: 'standard', label: 'Std' },
          { id: 'wall', label: 'Wall' },
        ]}
      />
      <button className="bd-wc" onClick={() => void w.minimize()}>—</button>
      <button className="bd-wc" onClick={() => void w.toggleMaximize()}>▢</button>
      <button className="bd-wc bd-wc--close" onClick={() => void w.close()}>✕</button>
    </div>
  );
}
```

```tsx
// Statusbar.tsx
import type { SessionRecord } from '@/services/agent-overview-types';

interface StatusbarProps {
  records: SessionRecord[];
  grouping: 'repo' | 'status';
  effectiveDensity: 'roomy' | 'standard' | 'wall';
  densityIsAuto: boolean;
}

export function Statusbar({ records, grouping, effectiveDensity, densityIsAuto }: StatusbarProps) {
  const c = (s: SessionRecord['state']) => records.filter((r) => r.state === s).length;
  return (
    <div className="bd-statusbar">
      <span>
        Grouped by {grouping === 'repo' ? 'repo' : 'status'} · density: {effectiveDensity}
        {densityIsAuto ? ' (auto)' : ''}
      </span>
      <span style={{ display: 'flex', gap: 12 }}>
        <Stat tone="yellow" label="awaiting" n={c('awaiting')} />
        <Stat tone="violet" label="working" n={c('working') + c('tool')} />
        <Stat tone="green" label="finished" n={c('finished')} />
        <Stat tone="gray" label="idle" n={c('idle') + c('ended')} />
      </span>
    </div>
  );
}

function Stat({ tone, label, n }: { tone: string; label: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span className={`bd-dot bd-dot--${tone}`} style={{ width: 6, height: 6 }} />
      {label} {n}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/
git commit -m "feat(agent-overview): Titlebar + Statusbar"
```

---

## Phase 11 — Frontend: root + entry

### Task 20: AgentOverviewApp root

**Files:**
- Create: `src/components/agent-overview/AgentOverviewApp.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useMemo, useState } from 'react';
import { useAgentSessions } from '@/hooks/useAgentSessions';
import { pickDensity } from '@/services/agent-overview';
import { AwaitingRail } from './AwaitingRail';
import { IdleRail } from './IdleRail';
import { RepoGrouped } from './RepoGrouped';
import { StatusGrouped } from './StatusGrouped';
import { Statusbar } from './Statusbar';
import { Titlebar } from './Titlebar';

export function AgentOverviewApp() {
  const sessions = useAgentSessions();
  const [grouping, setGrouping] = useState<'repo' | 'status'>('repo');
  const [density, setDensity] = useState<'auto' | 'roomy' | 'standard' | 'wall'>('auto');

  const live = sessions.filter((s) => s.state !== 'idle' && s.state !== 'ended');
  const idle = sessions.filter((s) => s.state === 'idle' || s.state === 'ended');
  const awaiting = sessions.filter((s) => s.state === 'awaiting');

  const effectiveDensity = useMemo<'roomy' | 'standard' | 'wall'>(
    () => (density === 'auto' ? pickDensity(live.length) : density),
    [density, live.length],
  );

  const totalRepos = useMemo(() => new Set(sessions.map((s) => s.repo)).size, [sessions]);
  const nonAwaiting = live.filter((s) => s.state !== 'awaiting');

  return (
    <div className="bd-window" style={{ width: '100vw', height: '100vh' }}>
      <Titlebar
        totalAwaiting={awaiting.length}
        totalSessions={sessions.length}
        totalRepos={totalRepos}
        grouping={grouping}
        onGroupingChange={setGrouping}
        density={density}
        onDensityChange={setDensity}
      />
      <div
        className="bd-scroll"
        style={{ flex: 1, overflow: 'auto', padding: '14px 18px 16px', background: 'var(--color-background)' }}
      >
        <AwaitingRail agents={awaiting} density={effectiveDensity} />
        {grouping === 'repo' ? (
          <RepoGrouped agents={nonAwaiting} density={effectiveDensity} />
        ) : (
          <StatusGrouped agents={nonAwaiting} density={effectiveDensity} />
        )}
        {idle.length > 0 && <IdleRail agents={idle} />}
      </div>
      <Statusbar
        records={sessions}
        grouping={grouping}
        effectiveDensity={effectiveDensity}
        densityIsAuto={density === 'auto'}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.tsx
git commit -m "feat(agent-overview): root component"
```

---

### Task 21: HTML entry + main TSX

**Files:**
- Create: `agent-overview.html`
- Create: `src/main-agent-overview.tsx`

- [ ] **Step 1: Create the HTML page**

`src/BorgDock.Tauri/agent-overview.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BorgDock — Agent Overview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main-agent-overview.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the entry**

`src/BorgDock.Tauri/src/main-agent-overview.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AgentOverviewApp } from '@/components/agent-overview/AgentOverviewApp';
import '@/styles/tokens.css';
import '@/styles/agent-overview.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AgentOverviewApp />
  </React.StrictMode>,
);
```

(If `tokens.css` lives elsewhere — check `src/styles/` or wherever the existing pop-outs import their token CSS from. Match that import path.)

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/agent-overview.html src/BorgDock.Tauri/src/main-agent-overview.tsx
git commit -m "feat(agent-overview): HTML page + React entry"
```

---

## Phase 12 — Live updates

### Task 22: `useAgentSessions` hook

**Files:**
- Create: `src/hooks/useAgentSessions.ts`
- Create: `src/hooks/__tests__/useAgentSessions.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/hooks/__tests__/useAgentSessions.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const sessions = [{ sessionId: 'a', state: 'working' }];
let listeners: Array<(p: { kind: string; session?: any; sessionId?: string }) => void> = [];

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(sessions),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_evt: string, cb: any) => {
    listeners.push(cb);
    return () => {
      listeners = [];
    };
  }),
}));

import { useAgentSessions } from '../useAgentSessions';

describe('useAgentSessions', () => {
  it('seeds from invoke and applies upsert delta', async () => {
    const { result } = renderHook(() => useAgentSessions());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.length).toBe(1);

    await act(async () => {
      listeners[0]?.({ payload: { kind: 'upsert', session: { sessionId: 'b', state: 'awaiting' } } } as any);
    });
    expect(result.current.length).toBe(2);

    await act(async () => {
      listeners[0]?.({ payload: { kind: 'remove', sessionId: 'a' } } as any);
    });
    expect(result.current.find((s) => s.sessionId === 'a')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import type { SessionDelta, SessionRecord } from '@/services/agent-overview-types';

export function useAgentSessions(): SessionRecord[] {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    (async () => {
      try {
        const initial = await invoke<SessionRecord[]>('list_agent_sessions');
        if (!cancelled) setSessions(initial);
      } catch (e) {
        console.error('list_agent_sessions failed', e);
      }
      try {
        const fn = await listen<SessionDelta>('agent-sessions-changed', (event) => {
          setSessions((prev) => applyDelta(prev, event.payload));
        });
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      } catch (e) {
        console.error('agent-sessions-changed listener failed', e);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return sessions;
}

function applyDelta(prev: SessionRecord[], delta: SessionDelta): SessionRecord[] {
  if (delta.kind === 'upsert') {
    const i = prev.findIndex((p) => p.sessionId === delta.session.sessionId);
    if (i === -1) return [...prev, delta.session];
    const next = [...prev];
    next[i] = delta.session;
    return next;
  }
  return prev.filter((p) => p.sessionId !== delta.sessionId);
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- src/hooks/__tests__/useAgentSessions.test.ts`
Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/hooks/useAgentSessions.ts src/BorgDock.Tauri/src/hooks/__tests__/useAgentSessions.test.ts
git commit -m "feat(agent-overview): useAgentSessions hook with delta applies"
```

---

## Phase 13 — Build wiring

### Task 23: Vite + coverage exclude

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add the build entry**

In `vite.config.ts`, find the `build.rollupOptions.input` block and add:

```ts
        'agent-overview': path.resolve(__dirname, "agent-overview.html"),
```

Add it between `fileviewer` and the closing `}` so the alphabetical order of pop-outs is preserved.

- [ ] **Step 2: Add to coverage exclude list**

Add to the `test.coverage.exclude` array, alongside the other `*-main.tsx` entries:

```ts
        "src/main-agent-overview.tsx",
```

- [ ] **Step 3: Run a frontend build**

Run from `src/BorgDock.Tauri`: `npm run build`
Expected: clean exit; new file `dist/agent-overview.html`.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/vite.config.ts
git commit -m "feat(agent-overview): register agent-overview entry in vite config"
```

---

## Phase 14 — Tray menu, badge merge, notification toasts

### Task 24: Tray menu item

**Files:**
- Modify: `src-tauri/src/platform/tray.rs`

- [ ] **Step 1: Find the tray menu construction**

Open `src-tauri/src/platform/tray.rs`. Locate the function that builds the tray menu (likely `setup_tray` or a helper). Find where existing items like "Open BorgDock" / "Quit" are added.

- [ ] **Step 2: Add an Agent Overview entry**

Insert a new menu item between "Open BorgDock" and "Quit". The exact API depends on Tauri's `MenuBuilder` — example:

```rust
.item(&MenuItem::with_id(app, "open_agent_overview", "Agent Overview", true, None::<&str>)?)
```

Then in the menu event handler (`on_menu_event` or similar), add a branch:

```rust
"open_agent_overview" => {
    let app_handle = app.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::agent_overview::open_agent_overview_window(app_handle).await {
            log::error!("open_agent_overview_window failed: {e}");
        }
    });
}
```

- [ ] **Step 3: Smoke build**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo build -p borgdock`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/platform/tray.rs
git commit -m "feat(agent-overview): tray menu entry"
```

---

### Task 25: Notification toasts + tray badge merge

**Files:**
- Create: `src-tauri/src/agent_overview/notify.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs`
- Modify: `src/hooks/useBadgeSync.ts`

- [ ] **Step 1: Register module**

```rust
pub mod notify;
```

(alphabetical position)

- [ ] **Step 2: Implement notify**

Create `src-tauri/src/agent_overview/notify.rs`:

```rust
use crate::agent_overview::types::{SessionRecord, SessionState};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct NotifyTracker {
    /// session.id → (first-fire?, escalate-fire?)
    fires: HashMap<String, (bool, bool)>,
}

#[derive(Debug)]
pub enum NotifyAction {
    None,
    Toast { session_id: String, repo: String, worktree: String, since_ms: u128, escalation: bool },
}

impl NotifyTracker {
    pub fn evaluate(
        &mut self,
        records: &[SessionRecord],
        first_threshold: Duration,
        escalate_threshold: Duration,
        now: Instant,
    ) -> Vec<NotifyAction> {
        let mut out = Vec::new();
        for r in records {
            if r.state != SessionState::Awaiting {
                self.fires.remove(&r.session_id);
                continue;
            }
            let in_state = now.saturating_duration_since(r.state_since);
            let entry = self.fires.entry(r.session_id.clone()).or_insert((false, false));
            if !entry.0 && in_state >= first_threshold {
                entry.0 = true;
                out.push(NotifyAction::Toast {
                    session_id: r.session_id.clone(),
                    repo: r.repo.clone(),
                    worktree: r.worktree.clone(),
                    since_ms: in_state.as_millis(),
                    escalation: false,
                });
            } else if entry.0 && !entry.1 && in_state >= escalate_threshold {
                entry.1 = true;
                out.push(NotifyAction::Toast {
                    session_id: r.session_id.clone(),
                    repo: r.repo.clone(),
                    worktree: r.worktree.clone(),
                    since_ms: in_state.as_millis(),
                    escalation: true,
                });
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::path::PathBuf;

    fn rec(id: &str, state_since_ago: Duration, state: SessionState) -> SessionRecord {
        let now = Instant::now();
        SessionRecord {
            session_id: id.into(),
            cwd: PathBuf::from("/x"),
            repo: "BD".into(),
            worktree: "master".into(),
            branch: "master".into(),
            label: format!("BD · master #{id}"),
            state,
            state_since: now - state_since_ago,
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

    #[test]
    fn fires_first_then_escalate_then_silent() {
        let mut t = NotifyTracker::default();
        let now = Instant::now();
        let r = rec("a", Duration::from_secs(31), SessionState::Awaiting);
        let out = t.evaluate(&[r.clone()], Duration::from_secs(30), Duration::from_secs(120), now);
        assert!(matches!(out[0], NotifyAction::Toast { escalation: false, .. }));

        let r2 = rec("a", Duration::from_secs(40), SessionState::Awaiting);
        let out = t.evaluate(&[r2], Duration::from_secs(30), Duration::from_secs(120), now);
        assert!(out.is_empty());

        let r3 = rec("a", Duration::from_secs(121), SessionState::Awaiting);
        let out = t.evaluate(&[r3], Duration::from_secs(30), Duration::from_secs(120), now);
        assert!(matches!(out[0], NotifyAction::Toast { escalation: true, .. }));
    }
}
```

- [ ] **Step 3: Add `internal_snapshot` to SessionStore**

The `notify::evaluate` function needs intact `Instant` values for `state_since`, but the existing `SessionStore::snapshot()` rewrites `state_since_ms` for serialization. Add a sibling method that does *not* go through `seal_for_emit`. Open `src-tauri/src/agent_overview/store.rs` and add to `impl SessionStore`:

```rust
    /// Snapshot for in-process consumers (notify tracker, etc.) — returns the
    /// raw cloned records with their `Instant` fields intact. Never serialize
    /// the result; use `snapshot()` for that.
    pub fn internal_snapshot(&self) -> Vec<SessionRecord> {
        self.inner
            .read()
            .map(|m| m.values().cloned().collect())
            .unwrap_or_default()
    }
```

- [ ] **Step 4: Wire NotifyTracker into the 1Hz ticker (lib.rs)**

Locate the async block from Task 13 where the ticker runs. Inside that block, before the tick loop starts, declare:

```rust
                    use crate::agent_overview::notify::{NotifyAction, NotifyTracker};
                    let mut tracker = NotifyTracker::default();
                    let app_for_notify = app_handle.clone();
```

Inside the `_ = tick.tick() =>` branch, after the existing `store_for_loop.run_tick(...)` line, append:

```rust
                                    let live = store_for_loop.internal_snapshot();
                                    let actions = tracker.evaluate(
                                        &live,
                                        std::time::Duration::from_secs(cfg.awaiting_notify_after_seconds.into()),
                                        std::time::Duration::from_secs(cfg.awaiting_notify_escalate_seconds.into()),
                                        std::time::Instant::now(),
                                    );
                                    for action in actions {
                                        if let NotifyAction::Toast { session_id, repo, worktree, since_ms, escalation } = action {
                                            use tauri::Emitter;
                                            let _ = app_for_notify.emit(
                                                "agent-notify",
                                                serde_json::json!({
                                                    "sessionId": session_id,
                                                    "repo": repo,
                                                    "worktree": worktree,
                                                    "sinceMs": since_ms,
                                                    "escalation": escalation,
                                                }),
                                            );
                                        }
                                    }

- [ ] **Step 5: Locate the in-app notifications push API**

Before wiring the frontend listener, find how PR notifications get pushed today. Run:

```bash
grep -rn "InAppNotification" src/BorgDock.Tauri/src/stores/
grep -rn "pushNotification\|addNotification" src/BorgDock.Tauri/src/stores/ src/BorgDock.Tauri/src/hooks/
```

Identify the store action (commonly `useUiStore.getState().pushNotification({...})` or similar). Note its exact name and the `InAppNotification` shape — the Step 6 listener calls it directly.

- [ ] **Step 6: Wire the `agent-notify` listener in `useBadgeSync.ts`**

Add this `useEffect` next to the other listeners in `src/hooks/useBadgeSync.ts`. Replace `useUiStore.getState().pushNotification({...})` with whatever Step 5 surfaced:

```ts
  // Agent overview — toast notifications when a Claude session has been
  // waiting on the user for too long.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<{
          sessionId: string;
          repo: string;
          worktree: string;
          sinceMs: number;
          escalation: boolean;
        }>('agent-notify', (event) => {
          const { repo, worktree, sinceMs, escalation } = event.payload;
          const since = Math.max(1, Math.round(sinceMs / 1000));
          // Push to the in-app notifications store. The exact action name
          // comes from Step 5 — replace the body of this call to match.
          useUiStore.getState().pushNotification({
            kind: 'agent-waiting',
            severity: escalation ? 'warning' : 'info',
            title: `Claude in ${repo}/${worktree} is waiting`,
            body: `Idle for ${since}s${escalation ? ' (still waiting)' : ''}`,
            action: {
              label: 'Open Agent Overview',
              run: async () => {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('open_agent_overview_window');
              },
            },
          });
        });
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      } catch (e) {
        console.error('agent-notify listener failed', e);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
```

If the actual store/method differs from `useUiStore.pushNotification`, update the import and call site accordingly. The `InAppNotification` type may not have an `action` field — if so, drop it from the call (the user can click the tray badge instead).

- [ ] **Step 7: Merge awaiting count into tray badge**

In the same `useBadgeSync.ts`, at the top of the existing main `useEffect` (the one that calls `update_tray_icon`), pull the awaiting count from a new store or via a fetched snapshot. Cleanest path: add a Zustand store `useAgentSessionsStore` populated by `useAgentSessions`, and consume its awaiting count here.

For the MVP the engineer can:
1. Add `awaitingCount: 0` to the existing PR-cache store as a simple side-store, or
2. Compute the count by listening to `agent-sessions-changed` directly inside `useBadgeSync.ts`.

Modify the tray-icon update call to:

```ts
const totalCount = count + agentAwaitingCount;
await invoke('update_tray_icon', {
  count: Math.min(totalCount, 255),
  worstState: agentAwaitingCount > 0 ? 'pending' : worstState,
});

const parts: string[] = [`BorgDock — ${count} open PRs`];
if (failingCount > 0) parts.push(`${failingCount} failing`);
if (pendingCount > 0) parts.push(`${pendingCount} pending`);
if (agentAwaitingCount > 0) parts.push(`${agentAwaitingCount} Claude sessions waiting`);
await invoke('update_tray_tooltip', { tooltip: parts.join(' · ') });
```

- [ ] **Step 8: Run tests + build**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test -p borgdock --lib agent_overview::notify`
Expected: 1 test passes.

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo build -p borgdock`
Expected: 0 errors, 0 warnings.

Run: `npm run build`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/notify.rs \
        src/BorgDock.Tauri/src-tauri/src/agent_overview/store.rs \
        src/BorgDock.Tauri/src-tauri/src/agent_overview/mod.rs \
        src/BorgDock.Tauri/src-tauri/src/lib.rs \
        src/BorgDock.Tauri/src/hooks/useBadgeSync.ts
git commit -m "feat(agent-overview): notification toasts + tray badge merge"
```

---

## Phase 15 — Settings UI + setup wizard step

### Task 26: AgentOverviewSection in Settings

**Files:**
- Create: `src/components/settings/AgentOverviewSection.tsx`
- Create: `src/components/settings/__tests__/AgentOverviewSection.test.tsx`
- Modify: `src/components/settings/SettingsFlyout.tsx` (or wherever existing sections are mounted)

- [ ] **Step 1: Write a failing test**

Create `src/components/settings/__tests__/AgentOverviewSection.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { AgentOverviewSection } from '../AgentOverviewSection';

describe('AgentOverviewSection', () => {
  it('renders enable toggle', () => {
    render(<AgentOverviewSection />);
    expect(screen.getByText(/Agent Overview/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Enable telemetry collection/i)).toBeInTheDocument();
  });

  it('clicking enable invokes the backend command', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    render(<AgentOverviewSection />);
    fireEvent.click(screen.getByLabelText(/Enable telemetry collection/i));
    expect(invoke).toHaveBeenCalledWith('set_agent_overview_enabled', expect.objectContaining({ enabled: true }));
  });
});
```

- [ ] **Step 2: Implement**

Create `src/components/settings/AgentOverviewSection.tsx`:

```tsx
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

export function AgentOverviewSection() {
  const settings = useSettingsStore((s) => s.settings.agentOverview);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [busy, setBusy] = useState(false);

  const enabled = settings?.enabled ?? false;
  const interval = settings?.otelExportIntervalMs ?? 2000;

  const onToggle = async (next: boolean) => {
    setBusy(true);
    try {
      await invoke('set_agent_overview_enabled', {
        enabled: next,
        port: 4318,
        exportIntervalMs: interval,
      });
      updateSettings({
        agentOverview: { ...(settings ?? {}), enabled: next },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Agent Overview</h3>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>
        Live dashboard of every Claude Code session running on this machine. Enabling this writes a small `env`
        block to <code>~/.claude/settings.json</code> so Claude Code emits OpenTelemetry events to BorgDock on
        loopback.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => void onToggle(e.target.checked)}
        />
        <span>Enable telemetry collection</span>
      </label>
    </section>
  );
}
```

(If the existing settings-store does not yet have `agentOverview` accessible, add a corresponding field to `src/stores/settings-store.ts`'s default state and the `Settings` TypeScript type.)

- [ ] **Step 3: Mount it**

Edit `src/components/settings/SettingsFlyout.tsx` (or whichever settings root is used). Find the list of `<XxxSection />` mounts and add:

```tsx
import { AgentOverviewSection } from './AgentOverviewSection';
…
<AgentOverviewSection />
```

(Place after `ClaudeSection` for thematic adjacency.)

- [ ] **Step 4: Run tests**

Run: `npm test -- src/components/settings/__tests__/AgentOverviewSection.test.tsx`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/settings/
git commit -m "feat(agent-overview): settings section to toggle telemetry"
```

---

### Task 27: Auto-open on startup setting + wiring

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/components/settings/AgentOverviewSection.tsx`

- [ ] **Step 1: Auto-open on launch**

In `lib.rs`, inside the `setup` closure, after the agent-overview spawn block, add:

```rust
            // Auto-open the Agent Overview window if the user has set the flag.
            if let Ok(s) = crate::settings::load_settings_internal() {
                if s.agent_overview.enabled && s.agent_overview.auto_open_on_startup {
                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = crate::agent_overview::open_agent_overview_window(app_handle).await {
                            log::error!("auto-open agent overview failed: {e}");
                        }
                    });
                }
            }
```

- [ ] **Step 2: Add the toggle in Settings**

Append to `AgentOverviewSection.tsx` inside the `<section>`:

```tsx
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <input
          type="checkbox"
          checked={settings?.autoOpenOnStartup ?? false}
          onChange={(e) =>
            updateSettings({
              agentOverview: { ...(settings ?? {}), autoOpenOnStartup: e.target.checked },
            })
          }
        />
        <span>Open on BorgDock startup</span>
      </label>
```

- [ ] **Step 3: cargo check + build**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo build -p borgdock`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/lib.rs src/BorgDock.Tauri/src/components/settings/AgentOverviewSection.tsx
git commit -m "feat(agent-overview): auto-open on startup option"
```

---

### Task 28: Persist window geometry on close

**Files:**
- Modify: `src-tauri/src/agent_overview/window.rs`

- [ ] **Step 1: Subscribe to window-close and persist geometry**

In `open_agent_overview_window`, after `let win = builder.build()…`, attach a close listener:

```rust
            let win_for_close = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    let pos = win_for_close.outer_position().ok();
                    let size = win_for_close.outer_size().ok();
                    if let (Some(p), Some(s)) = (pos, size) {
                        let geom = crate::settings::models::WindowGeometry {
                            x: p.x,
                            y: p.y,
                            width: s.width,
                            height: s.height,
                        };
                        let mut settings = crate::settings::load_settings_internal().unwrap_or_default();
                        settings.agent_overview.window_state = Some(geom);
                        let _ = crate::settings::save_settings_internal(&settings);
                    }
                }
            });
```

(Adjust the function names to match what `crate::settings` actually exports; check `src-tauri/src/settings/mod.rs` for `load_settings_internal` / `save_settings_internal` or equivalents.)

- [ ] **Step 2: Build**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo build -p borgdock`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/agent_overview/window.rs
git commit -m "feat(agent-overview): persist window geometry on close"
```

---

## Phase 16 — End-to-end manual smoke

### Task 29: Manual smoke test pass

**Files:** _none_ — verification only.

- [ ] **Step 1: Build a packaged dev session**

Run from `src/BorgDock.Tauri`: `npm run tauri dev`
Expected: BorgDock launches; no errors in the dev console.

- [ ] **Step 2: Enable telemetry**

Open BorgDock Settings → Agent Overview → check "Enable telemetry collection."
Verify `~/.claude/settings.json` now contains the `env` block (and a `.bak.<ts>` file exists).

- [ ] **Step 3: Open the Agent Overview window**

Tray menu → "Agent Overview." The new window opens on whichever monitor is current. Drag to your secondary monitor, resize, close, reopen — it should remember position and size.

- [ ] **Step 4: Run two Claude sessions**

In two different Windows Terminal tabs / panes, `cd` to two different worktrees and run `claude` with a prompt in each. Watch the Agent Overview:

- Each session shows up within ≤3s, classified `working`.
- Submit prompts → quotes appear under each card.
- Wait for one to finish → `finished` (green border) for ~30s → `awaiting` (yellow border + pulse + alert rail).
- Wait another 30s → notification toast fires in BorgDock's main window. Tray badge shows count.
- Wait until it's been 5+ minutes since last event → card moves to the IdleRail at bottom.
- Quit Claude in one terminal (Ctrl+C). After ~30 minutes (or shorten `endedThresholdSeconds` in settings to verify quickly), session moves to `Ended` then drops from the list 4 hours later.

- [ ] **Step 5: Disable and verify revert**

Settings → Agent Overview → uncheck. Confirm `~/.claude/settings.json` no longer has the env block, and BorgDock's OTLP port is released.

- [ ] **Step 6: cargo build + npm build for warning audit**

Run: `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo build -p borgdock 2>&1 | tee /tmp/cargo.log`
Run: `npm run build 2>&1 | tee /tmp/vite.log`

Confirm:
- `cargo.log` has 0 warnings, 0 errors.
- `vite.log` has 0 errors and only known/expected warnings (nothing introduced by this feature).

- [ ] **Step 7: Commit a note (optional)**

If the smoke test surfaced bugs, file follow-up commits per bug. Otherwise no commit needed.

---

## Self-review checklist (engineer running the plan)

Before declaring the feature shipped, confirm each spec section has a corresponding completed task:

- [ ] 5-state machine — **Task 2**
- [ ] OTLP HTTP/JSON receiver on `127.0.0.1:4318` — **Tasks 6, 7**
- [ ] Bootstrap from `~/.claude/projects/*` — **Task 5**
- [ ] cwd resolution + cache — **Task 4**
- [ ] Settings file merge with backup — **Task 9**
- [ ] AgentOverviewSettings (window geometry, thresholds, repo overrides, etc.) — **Tasks 8, 28**
- [ ] Window opening with main-thread `oneshot` — **Tasks 11, 28**
- [ ] Capabilities file — **Task 10**
- [ ] React component tree (Titlebar, AwaitingRail, RepoGrouped/StatusGrouped, IdleRail, Statusbar, AgentCard family, primitives) — **Tasks 16–21**
- [ ] `useAgentSessions` hook — **Task 22**
- [ ] Vite entry registration — **Task 23**
- [ ] Tray menu entry — **Task 24**
- [ ] Notification toasts + tray badge merge — **Task 25**
- [ ] Settings UI + auto-open — **Tasks 26, 27**
- [ ] Manual smoke — **Task 29**

**Definition of done (per `.claude/rules`):**
- All Rust + TS tests pass.
- `cargo build` and `npm run build` produce 0 errors, 0 warnings.
- Manual smoke completes successfully.
- "Disable" in Settings cleanly reverses the env-block merge and releases the port.
