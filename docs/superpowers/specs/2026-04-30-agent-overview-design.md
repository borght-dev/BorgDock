# Agent Overview — Design Spec

_Date: 2026-04-30_
_Status: Draft, brainstorming complete, awaiting plan_

## Problem

The user runs many concurrent Claude Code sessions across different repos and worktrees in different Windows Terminal windows/panes. When focused on one session, they fail to notice that other sessions have stopped and are waiting on input. Sessions can sit idle for many minutes before the user remembers to check on them, hurting throughput across their multi-agent workflow.

## Goal

A new BorgDock pop-out window — an "Agent Overview" — that the user keeps open on a secondary monitor all day. It lists every live Claude Code session on the machine with a state badge, surfaces sessions that need user input via both visual treatment and active alerts (tray badge + system notification), and adapts its density to the number of running sessions.

## Non-goals

- Process inspection for instant end-of-session detection (we use a 30-minute idle timeout instead).
- Any session-control actions — the dashboard is read-only. No "send keystroke," "kill session," "switch model," etc.
- Ingestion of OpenTelemetry metrics or traces. Logs/events only.
- Embedded transcript viewer or scrollback into a Claude session. The card shows last user message + current task; nothing more.
- Multi-instance Agent Overview windows. There is only one.
- Cross-machine aggregation. The OTel receiver is bound to loopback exclusively.

## Constraints driving the design

1. **Performance.** The data path must not measurably slow Claude Code. Hooks are off the table because they spawn synchronous child processes per event. OpenTelemetry batches in-process on a worker thread — measured cost per emit is microseconds.
2. **Passive observation.** The dashboard tracks every Claude Code session on the machine without requiring the user to launch sessions through BorgDock or wrap them with shell aliases. A one-time edit of `~/.claude/settings.json` is acceptable.
3. **Always-on.** The window stays open all day on a secondary monitor. State and window geometry must persist across BorgDock restarts. Memory must stay bounded over a multi-hour day.

## Five-state model

```
working    — events firing, no pending tool_use
tool       — pending_tool_uses non-empty (long bash, build, test)
awaiting   — last api_request had stop_reason="end_turn", no follow-up
finished   — entered awaiting < 30 s ago (transient sub-state, green visual)
idle       — no events for ≥ 5 min, but session not yet considered dead
ended      — no events for ≥ 30 min; kept in store for 4 h then dropped
```

All five states are inferrable from OpenTelemetry log events alone. `stop_reason` on `api_request` events distinguishes `tool` vs `awaiting`; wall-clock since `last_event_at` distinguishes `working` vs `awaiting` vs `idle` vs `ended`. No JSONL parsing is required for state classification.

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│ BorgDock main process (Rust)                                          │
│                                                                       │
│  src-tauri/src/agent_overview/                                        │
│    mod.rs            — Tauri commands, public exports                 │
│    otlp_server.rs    — axum HTTP server on 127.0.0.1:4318             │
│    sessions.rs       — SessionStore (Arc<RwLock<HashMap<…>>>)         │
│    state.rs          — pure state-machine inference function          │
│    bootstrap.rs      — read ~/.claude/projects on startup             │
│    cwd_resolver.rs   — session.id → cwd / repo / worktree / branch    │
│    settings_merge.rs — merge our env block into ~/.claude/settings    │
│    window.rs         — open_agent_overview_window command             │
│                                                                       │
│  src-tauri/capabilities/agent-overview.json                           │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
                             │ tauri::Manager::emit_to("agent-overview", ...)
                             ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Agent Overview window (React)                                         │
│                                                                       │
│  agent-overview.html                                                  │
│  src/main-agent-overview.tsx                                          │
│  src/components/agent-overview/                                       │
│    AgentOverviewApp.tsx                                               │
│    AwaitingRail.tsx                                                   │
│    AgentCard.tsx, AgentTile.tsx, AwaitingRailItem.tsx                 │
│    RepoGrouped.tsx, StatusGrouped.tsx                                 │
│    IdleRail.tsx                                                       │
│  src/hooks/useAgentSessions.ts                                        │
│  src/services/agent-overview.ts                                       │
│  src/styles/agent-overview.css                                        │
└───────────────────────────────────────────────────────────────────────┘

Tray badge integration:
  src/hooks/useBadgeSync.ts — extended to merge PR signals + waiting Claude sessions
  src-tauri/src/platform/tray.rs — already accepts a count + tooltip; adds a second source
```

The OTLP server runs on a tokio task launched from `lib.rs::run` before `app.run()`. It binds to `127.0.0.1:4318` (loopback only). The `open_agent_overview_window` command follows the existing pop-out pattern: it is `async`, uses `app.run_on_main_thread(...)` with a `tokio::sync::oneshot` channel for the WebviewWindowBuilder call, per the Tauri main-thread rule documented in `CLAUDE.md`.

## Data model

```rust
pub struct SessionRecord {
    // Identity
    pub session_id: String,
    pub cwd: PathBuf,
    pub repo: String,
    pub worktree: String,
    pub branch: String,
    pub label: String,                 // "BD · master #2", synthesized

    // State
    pub state: SessionState,
    pub state_since: Instant,
    pub last_event_at: Instant,

    // Card content
    pub last_user_msg: Option<String>,
    pub task: Option<String>,
    pub model: Option<String>,
    pub tokens_used: u64,
    pub tokens_max: u64,

    // Internal
    pub last_api_stop_reason: Option<String>,
    pub pending_tool_uses: HashSet<String>,
}

pub enum SessionState {
    Working, Tool, Awaiting, Finished, Idle, Ended,
}
```

Wall-clock fields use `std::time::Instant` (monotonic) rather than `SystemTime`, so the state machine is immune to clock drift or NTP corrections.

The `SessionStore` is `Arc<RwLock<HashMap<String, SessionRecord>>>`. Mutations happen on a single tokio task that consumes events from an unbounded mpsc channel; readers (the Tauri command `list_agent_sessions` and the bootstrap path) acquire the read lock. Whenever the state-machine task mutates a session, it emits a `SessionDelta` over `tauri::Manager::emit_to("agent-overview", "agent-sessions-changed", delta)`.

## State transitions

Driven by OTel events plus a 1-second wall-clock ticker:

```
[any state]
  ── api_request received with stop_reason="tool_use"  ──>  Tool
  ── api_request received with stop_reason="end_turn"  ──>  Finished
  ── tool_result received                              ──>  remove from pending_tool_uses;
                                                            if pending empty AND last stop=tool_use → Working
  ── user_prompt received                              ──>  Working
  ── any event received                                ──>  refresh last_event_at

[ticker, every 1 s]
  Finished AND state_since > 30 s                      → Awaiting
  state in {Working, Tool, Awaiting, Finished} AND
    last_event_at > 5 min                              → Idle
  Idle AND last_event_at > 30 min                      → Ended
  Ended AND last_event_at > 4 h                        → drop from store
```

A `Working` state with no event for 5 s but no `stop_reason` recorded yet stays `Working` — we only flip to `Awaiting` once `stop_reason="end_turn"` has been observed. This avoids false "needs you back" signals when Claude is between events but still alive.

## Label synthesis

Computed once when a session is registered, never changes:

- **Short-repo:** initials of CamelCase / hyphenated words. `BorgDock` → `BD`, `FSP-Horizon` → `FH`. Cap at 4 chars. User-overridable via `Settings.agent_overview.repo_short_names`.
- **Worktree:** `master` stays `master`; otherwise the worktree directory's basename.
- **Index:** `1 + count of currently-non-Ended sessions in the same (repo, worktree)` at registration. Stable for the session's lifetime.
- **Final:** `BD · master #2`, `FH · worktree1 #1`.

## Token tracking

Each `claude_code.api_request` event carries `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`. `tokens_used` is the running sum across the session. `tokens_max` is looked up from a small static map keyed on `model` (e.g. `claude-sonnet-4-6` → 200_000). When usage exceeds max (post-compaction), display caps at 100% but the real value stays in the record.

## Task narrative derivation

- **Tool state:** `"Running ${tool_name}"` plus the tail of `full_command` (Bash) or `file_path` (Edit/Read/Write). Examples: `"Running pnpm test"`, `"Editing widget-binding.ts"`. Requires `OTEL_LOG_TOOL_DETAILS=1`.
- **Working state:** the last 1–2 tool calls with their targets. Example: `"Reading pr-card.jsx, pr-actions.jsx"`.
- **Awaiting / Finished:** `null`. The card prominently shows `last_user_msg` instead.
- **Idle / Ended:** sticky last-known task narrative, rendered grey.

## OTel receiver

Embedded HTTP server at `127.0.0.1:4318` with single endpoint `POST /v1/logs`, content-type `application/json`. Returns `200 OK { "partialSuccess": {} }` always — even on parse failure — to prevent Claude's OTel SDK from retrying back at us.

Parsing approach per request:

1. Walk `resourceLogs[].resource.attributes[]` and flatten to a `HashMap<String, AttrValue>` (this is where `session.id`, `service.name`, `terminal.type` live).
2. For each `resourceLogs[].scopeLogs[].logRecords[]`, merge resource attrs with the record's own attrs and push a single `RawEvent { session_id, event_name, ts, attrs }` onto a `tokio::sync::mpsc::UnboundedSender<RawEvent>`.
3. The state-machine task consumes from the channel and updates the SessionStore.

We accept JSON only — the env block forces `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`. We use `serde_json::Value` rather than strict protobuf-generated types for tolerance to format quirks.

Events we consume: `user_prompt`, `api_request`, `tool_result`, `tool_decision`, `compaction`. All other events are silently ignored.

`/v1/metrics` and `/v1/traces` paths return 404. We do not need them.

## Settings file merge

On first launch, with explicit user opt-in via a setup wizard step (no silent writes to user config), we merge this `env` block into `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT": "http://127.0.0.1:4318/v1/logs",
    "OTEL_LOGS_EXPORT_INTERVAL": "2000",
    "OTEL_LOG_USER_PROMPTS": "1",
    "OTEL_LOG_TOOL_DETAILS": "1"
  }
}
```

We back up the existing settings to `~/.claude/settings.json.bak.<unix-timestamp>` before merging. We preserve every other field in the file. A "Disable Agent Overview telemetry" button in BorgDock Settings reverses the merge. The 2-second export interval (vs default 5 s) trades a small amount of network traffic for snappier UI; tunable in BorgDock settings.

## Bootstrap on BorgDock launch

```
1. Read every ~/.claude/projects/*/sessions-index.json.
2. For each entry where modified is within the last 4 hours:
     - Register a SessionRecord in state=Ended, last_event_at=modified,
       with cwd / branch / repo / worktree resolved from the index entry.
3. Live state replaces Ended as soon as OTel events arrive for that session.id.
```

This gives instant population of the dashboard the moment BorgDock starts, even before any session emits an event. It also covers the "session was running before BorgDock launched" case — the user sees the session, just classified as `Ended` until OTel proves otherwise (which happens within 2 seconds on the next event, max).

## cwd resolver

```
fn resolve_cwd(session_id: &str) -> Option<CwdInfo> {
    if let Some(cached) = CACHE.get(session_id) { return Some(cached); }
    for project_dir in glob("~/.claude/projects/*") {
        let index = read_sessions_index(project_dir)?;
        if let Some(entry) = index.entries.iter().find(|e| e.session_id == session_id) {
            let info = CwdInfo {
                cwd: entry.project_path.clone(),
                branch: entry.git_branch.clone(),
                repo: derive_repo_name(&entry.project_path),
                worktree: derive_worktree_name(&entry.project_path),
            };
            CACHE.put(session_id.into(), info.clone());
            return Some(info);
        }
    }
    None
}
```

Cached for the BorgDock process lifetime (session.id is a stable UUID). When unresolved on first sight, the receiver retries on every subsequent event for that session for up to 30 s; if still unresolved after that, registers a stub with `repo: "unknown"` and a synthesized cwd.

## Window

`open_agent_overview_window(app)` is `async`, uses `app.run_on_main_thread(...)` with a `oneshot` channel for the WebviewWindowBuilder call.

WebviewWindow config:

- `label: "agent-overview"` (single-instance — pattern matches `sql`, not `pr-detail-*`)
- `title: "BorgDock — Agent Overview"`
- `decorations: false` (own titlebar, like other pop-outs)
- `skip_taskbar: false` (per `feedback_persistent_windows.md`)
- `visible_on_all_workspaces: false`
- `min_inner_size: (720, 480)`
- `inner_size: <restored from settings or 1280×820>`
- `position: <restored from settings>`
- `shadow: true` (the main-window shadow constraint does not apply here)

Capabilities (`src-tauri/capabilities/agent-overview.json`):

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

`set-position` / `outer-position` / `scale-factor` are required for persisting window geometry across launches. `clipboard-manager` covers future "copy session ID" / "copy current task" affordances. No `opener:default` for the MVP — add later if we wire "open in terminal."

## Settings additions

```rust
pub struct Settings {
    /* existing fields … */
    pub agent_overview: AgentOverviewSettings,
}

pub struct AgentOverviewSettings {
    pub enabled: bool,                              // default false; set true after wizard
    pub auto_open_on_startup: bool,                 // default false
    pub window_state: Option<WindowState>,
    pub repo_short_names: HashMap<String, String>,
    pub awaiting_notify_after_seconds: u32,         // default 30
    pub awaiting_notify_escalate_seconds: u32,      // default 120
    pub idle_threshold_seconds: u32,                // default 300 (5 min)
    pub ended_threshold_seconds: u32,               // default 1800 (30 min)
    pub history_retention_seconds: u32,             // default 14400 (4 h)
    pub otel_export_interval_ms: u32,               // default 2000
}
```

## React component tree

```
agent-overview.html
  └─ src/main-agent-overview.tsx
       └─ <AgentOverviewApp />
            ├─ <Titlebar />              (logo, title, awaiting badge,
            │                             session count, group + density toggles)
            ├─ <AwaitingRail />          (pinned, only when any awaiting)
            ├─ {grouping === "repo"
            │    ? <RepoGrouped />
            │    : <StatusGrouped />}
            ├─ <IdleRail />              (collapsed one-line rows, always)
            └─ <Statusbar />             (grouping/density indicator + per-state stats)
```

The component tree is a 1:1 port of the design bundle's `agent-var-e.jsx` to TSX. CSS lifts from `agent-primitives.jsx` into `src/styles/agent-overview.css` (vs the bundle's runtime injection pattern). `agent-data.jsx` becomes pure TS in `src/services/agent-overview.ts` (label synthesis, density auto-pick, group-by helpers).

Density auto-pick: `≤6 sessions → roomy`, `7–12 → standard`, `13+ → wall`. User-overridable via the titlebar segmented toggle.

## Live updates

```ts
export function useAgentSessions() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    (async () => {
      const initial = await invoke<SessionRecord[]>("list_agent_sessions");
      setSessions(initial);
      unlisten = await listen<SessionDelta>("agent-sessions-changed", (e) => {
        setSessions(prev => applyDelta(prev, e.payload));
      });
    })();
    return () => { unlisten?.(); };
  }, []);
  return sessions;
}
```

The 1-second wall-clock ticker on the backend emits on every transition (`Working → Awaiting`, `Idle → Ended`, etc.) so the UI's "since X seconds" labels stay live. The React side runs its own 1-second `setInterval` to recompute human-readable durations from `state_since` timestamps, avoiding per-second IPC chatter.

## Tray badge and notification toasts

**Tray badge:** `useBadgeSync.ts` is extended to merge PR signal counts with awaiting-Claude-session counts. Tooltip on the tray icon: `BorgDock — 3 PRs · 2 Claude sessions waiting`. The Rust-side tray code in `platform/tray.rs` already accepts a count + tooltip; adding a second source is mechanical.

**Notification toast:** when a session crosses the `awaiting_notify_after_seconds` threshold (default 30 s), one toast fires via the existing in-app `NotificationManager` (the same surface PR signals use): `"Claude in <repo>/<worktree> is waiting (<since>)"`. Click → focuses the Agent Overview window and scrolls to that card. A second notification fires at `awaiting_notify_escalate_seconds` (default 2 min). At most two notifications per state-entry — never spam.

The threshold timer starts when the session enters `Awaiting`, not `Finished`. Because `Finished` is a 30-second transient, "30 s into `Awaiting`" is 60 seconds after Claude actually stopped emitting events. This is intentional: `Finished`'s green visual is its own affordance for "fresh output to review"; notifications should fire only after the session has truly settled.

## Window opening — entry points

- Tray menu: new item "Agent Overview" → `open_agent_overview_window`.
- Hotkey: optional global hotkey, default unbound, configurable in settings.
- Auto-open on startup: if `auto_open_on_startup` is true, the command is called after `app.run()` boots.

## Edge cases

| Case | Handling |
|---|---|
| Port 4318 already in use | On bind failure, fall back to `4319..4329`, write the chosen port into the env block. Surface a non-blocking notification: "Agent Overview using port 4319." |
| `~/.claude/settings.json` malformed when merging | Back up to `settings.json.bak.<ts>`, abort the merge, surface error in setup wizard with "open the file" affordance. |
| New `session.id` we can't resolve to cwd | Defer registration. Retry resolution on every event for that session for up to 30 s; then create a stub with `repo: "unknown"`. |
| Session resumed (new id, same cwd) | Treated as a new session (which it is from OTel's perspective). The old session ages out via `Ended → drop`. |
| Token usage exceeds model max after compaction | Cap display at 100%, real value still tracked internally. |
| Receiver gets bad JSON | Return 200 OK anyway, log to `borgdock-otel.log`, drop the record. Never let parsing errors bounce back to Claude's SDK. |
| User toggles telemetry off mid-day | Setting flip → revert env block in `~/.claude/settings.json`, stop the receiver, freeze sessions in their current state. Existing Claude sessions keep emitting until they exit; we just stop listening. |
| Multiple Claude versions on machine | All read the same `~/.claude/settings.json`, so all configure consistently. |
| Two sessions in the exact same cwd at same `state_since` | Index counter (`#1`, `#2`) breaks the tie. First-event timestamp determines order. |
| BorgDock restart with window open | Window owned by BorgDock, closes on shutdown. If `auto_open_on_startup` is on, reopens. State store is in-memory only — bootstrap re-populates from filesystem on launch. |

## Testing strategy (TDD per `.claude/rules`)

**Rust side — `cargo test` against `agent_overview/`:**

- `state.rs` — table-driven tests. Each row is `(initial_state, event, expected_state)`. Covers all 5 transitions × all relevant events. Includes the 1-second ticker as a synthesized "tick" event. Tests written first.
- `otlp_server.rs` — integration test spins up the axum server on an ephemeral port, POSTs canned OTLP/HTTP/JSON payloads (lifted from a `claude --debug` capture committed under `tests/fixtures/otlp/`), asserts the SessionStore reflects the event.
- `bootstrap.rs` — fake `~/.claude/projects/` tree under `tempdir`, assert sessions register in `Ended` state with the right cwd / branch.
- `cwd_resolver.rs` — cache hit/miss behavior, retry-after-defer behavior.
- `settings_merge.rs` — given an existing user `settings.json`, our merge preserves all user fields and creates the timestamped backup.

**TypeScript side — `vitest` next to source:**

- `useAgentSessions.test.ts` — given a sequence of `agent-sessions-changed` events, the hook returns the correct array.
- `AgentCard.test.tsx` — renders correctly for each of the 5 states, last-user-message clamps at 2 lines in roomy / 1 in compact, marching ants only when `state === "tool"`.
- `AwaitingRail.test.tsx` — hidden when no awaiting; sorted oldest-first; "oldest X ago" matches the worst session.
- `label-synth.test.ts` — `BorgDock` → `BD`, `FSP-Horizon` → `FH`, `wt2` → `wt2`, override map wins. Index assignment is stable.
- `density-auto.test.ts` — ≤6 → roomy, 7–12 → standard, 13+ → wall.

**Manual smoke (UI/feature correctness, per CLAUDE.md):**

1. Enable telemetry via setup wizard.
2. Run `claude` in two separate terminals against two different worktrees.
3. Submit a prompt in each. Watch them appear in `working` within ≤ 3 s of submission.
4. Wait for one to finish — verify `finished` (green) → `awaiting` (yellow + pulse + alert rail) transition.
5. Cross threshold (default 60 s after Claude stops: 30 s `Finished` + 30 s `Awaiting`) — verify notification toast fires.
6. Cross 5 min threshold — verify card moves to idle rail.
7. Quit Claude in one terminal — verify `Ended` state after 30 min.

## Definition of done

- All Rust + TypeScript tests pass.
- `cargo build` and `npm run build` produce 0 errors and 0 warnings, per `.claude/rules`.
- The manual smoke sequence above completes successfully.
- Setup wizard "Disable Agent Overview telemetry" step cleanly reverses everything: env block reverted, port released, no orphan state.
- Window geometry persists across BorgDock restarts (verified by moving the window, closing BorgDock, relaunching).
- Tray badge merges Claude waiting count with PR signals; tooltip text correct.

## Open questions for implementation

None known at spec time. All clarifying questions surfaced during brainstorming have been resolved:

- Scope: every Claude Code session on the machine.
- States: 5 (working / tool / awaiting / finished / idle, plus internal ended).
- Discovery model: live + 4-hour recent-history tail.
- Alert model: tray badge + system notification, with configurable thresholds.
- Data carrier: pure OTel via embedded receiver, plus filesystem cross-reference for session.id → cwd resolution.
- Card content: full (lastUserMsg + task narrative), enabled by `OTEL_LOG_USER_PROMPTS=1` + `OTEL_LOG_TOOL_DETAILS=1`.
