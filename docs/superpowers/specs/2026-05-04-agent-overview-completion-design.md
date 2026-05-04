# Agent Overview — Completion Design

Status: approved 2026-05-04
Implements: residual scope from `2026-04-30-agent-overview-design.md`
After implementation: every spec bullet has a corresponding shipping behavior.

## Goal

Complete the remaining behavioral pieces of the Agent Overview dashboard: the
inspector popover, keyboard shortcuts, files-changed section, and the
snooze / mark-seen / focus-pane actions. The visual / structural pieces
(titlebar, statusbar, awaiting rail, agent card, five groupings, tier colors,
auto-archive, viewport-aware density) are already shipped.

## What's already done (do not re-implement)

- 5-mode grouping dropdown, oldest-age pill, archived toggle, viewport-aware
  density, auto-archive of idle >24h, `bd-ants--left` vertical marching ants,
  hero/breadcrumb card structure, tier-colored time-since, token bar dimming,
  4px solid yellow rail edge, repo→worktree grouping inside the rail.
- Backend already exposes: `list_agent_sessions`, `dismiss_agent_session`,
  `list_worktree_changes`, `diff_worktree_vs_head`. These are reused as-is.

## What this spec adds

1. Backend: three new fields on `SessionRecord`, one new sqlite table, three
   new Tauri commands, OTel-event tracking of per-turn file edits.
2. Frontend: `useInspectorState` hook + `InspectorContext`, `InspectorPopover`
   component (replaces the current `HoverPopover`-on-AgentCard wiring),
   `useKeyboardShortcuts` hook, snooze/seen filtering rules.
3. Tests: state-machine assertions for current-turn file tracking, popover
   lifecycle, keyboard cycling, and the snooze/seen filters.

## Decisions log (from brainstorming)

| Question | Choice |
|---|---|
| Focus-pane multiplexer strategy | Best-effort window raise via process tree + `SetForegroundWindow`; "no pane found" notification on failure |
| Snooze + mark-seen persistence | Both persisted in sqlite cache |
| Files-changed source | Hybrid: session-scoped file *list* (from OTel `tool_decision`); per-file +/− and snippet from `diff_worktree_vs_head` |
| Inspector vs HoverPopover | Single new `InspectorPopover`; remove the existing `HoverPopover` from AgentCard |
| `currentTask` field | Same as existing `task` — no rename, no new field |
| Keybinding scope | Window-focused only; React `keydown` listeners |
| Snooze/seen state ownership | Backend persists + emits as fields; frontend interprets (filter rules) |
| Popover state ownership | Page-level `useInspectorState` hook + context |
| File-snippet fetch timing | Eager diffstat for +/− numbers; lazy snippet fetch on row click |
| Tab cycling | Wraps from end → start |

---

## Section 1 — Data model & backend

### 1.1 New `SessionRecord` fields

Camel-cased on the wire (Rust uses `#[serde(rename_all = "camelCase")]`):

```rust
pub current_turn_files: Vec<TurnFile>,         // session-scoped
pub snoozed_until_ms: Option<u128>,            // null = not snoozed
pub seen_at_ms: Option<u128>,                  // null = not marked seen
```

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnFile {
    pub path: String,
    pub tool: TurnFileTool,
    pub timestamp_ms: u128,                    // wall-clock when seen
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TurnFileTool { Edit, Write, Read }
```

TypeScript mirror in `src/services/agent-overview-types.ts`:

```ts
export type TurnFileTool = 'edit' | 'write' | 'read';
export interface TurnFile { path: string; tool: TurnFileTool; timestampMs: number; }

export interface SessionRecord {
  // ...existing fields...
  currentTurnFiles: TurnFile[];
  snoozedUntilMs: number | null;
  seenAtMs: number | null;
}
```

### 1.2 `currentTurnFiles` lifecycle (`agent_overview/state.rs`)

The state machine already consumes OTel events. Add per-session tracking:

- **On `tool_result` event** with `tool_name` ∈ {`Edit`, `Write`, `Read`}
  and a `file_path` attribute (parsed from the existing `tool_input` JSON):
  append `TurnFile { path, tool, timestamp_ms }` to `current_turn_files`.
  De-dup by path keeping the latest entry (so a Read-then-Edit on the same
  file shows as Edit). We hook `tool_result` rather than `tool_decision`
  because (a) `tool_decision` in this codebase only carries `tool_use_id`
  and the narrative-extraction infrastructure already lives on
  `tool_result`, and (b) tracking on completion (rather than invocation)
  gives us the more useful set: files Claude actually read or wrote, not
  files it attempted before erroring.
- **On `user_prompt` event**: clear `current_turn_files`. This is the
  "since your last message" boundary.
- The list lives only in memory. On app restart it's empty for all sessions
  (the worktree state is the truth for what's actually on disk).
- Memory bound: cap at 50 files per session. If exceeded, drop the oldest.
  Real Claude turns rarely touch more than 10 files.

### 1.3 Snooze / mark-seen persistence

#### sqlite table (in existing `cache.db`)

```sql
CREATE TABLE IF NOT EXISTS agent_session_meta (
  session_id        TEXT PRIMARY KEY,
  snoozed_until_ms  INTEGER,
  seen_at_ms        INTEGER,
  updated_at_ms     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meta_updated ON agent_session_meta(updated_at_ms);
```

Migration runs on startup via the existing `cache::init` path.

#### Tauri commands (new, in `agent_overview/commands.rs`)

```rust
#[tauri::command]
pub async fn snooze_agent_session(
    session_id: String,
    duration_ms: u64,
    store: tauri::State<'_, SessionStore>,
    cache: tauri::State<'_, CachePool>,
) -> Result<(), String>;

#[tauri::command]
pub async fn mark_agent_session_seen(
    session_id: String,
    store: tauri::State<'_, SessionStore>,
    cache: tauri::State<'_, CachePool>,
) -> Result<(), String>;

#[tauri::command]
pub async fn focus_session_pane(
    session_id: String,
    store: tauri::State<'_, SessionStore>,
) -> Result<bool, String>;        // Ok(false) = "no terminal window found"
```

Both `snooze` and `mark_seen` write-through to sqlite, then call
`store.upsert_meta(session_id, …)` which mutates the in-memory record and
emits `SessionDelta::Upsert { session: <updated> }` so the frontend reacts
without polling.

`snooze`: writes `snoozed_until_ms = now + duration_ms`. The `S` keyboard
action passes `5 * 60 * 1000`.

`mark_seen`: writes `seen_at_ms = now`. The Rust store auto-clears
`seen_at_ms` whenever a session's `last_event_at` advances past it
(meaning: any new activity un-marks it).

#### Focus-pane semantics (new module `platform/focus_pane.rs`)

1. From `SessionRecord.cwd`, walk the process tree (via `sysinfo` crate
   already in use elsewhere) for processes whose CWD matches *or* whose
   parent CWD matches.
2. Filter to processes whose executable name is in a known list:
   `WindowsTerminal.exe`, `wezterm-gui.exe`, `pwsh.exe`, `cmd.exe`,
   `alacritty.exe`. Pick the topmost ancestor that has a visible window.
3. Use `EnumWindows` + `GetWindowThreadProcessId` to find the HWND owned by
   that PID, then `SetForegroundWindow` it. Restore-from-minimized via
   `ShowWindow(SW_RESTORE)` first.
4. Return `Ok(true)` on success, `Ok(false)` if no candidate found. Frontend
   shows a notification "no terminal window matches this session" on `false`.

Cross-platform stub: macOS / Linux return `Ok(false)` for now (BorgDock is
Windows-first; the spec's `cfg!(windows)` precedent applies).

### 1.4 GC

At startup (after migration), `DELETE FROM agent_session_meta WHERE
updated_at_ms < now - 30 * 86400_000`. Keeps the table bounded.

---

## Section 2 — `useInspectorState` and orchestration

### 2.1 Hook signature

```ts
// src/hooks/useInspectorState.ts
export interface InspectorState {
  hoveredSessionId: string | null;
  pinnedSessionId:  string | null;
  focusedSessionId: string | null;
  openSessionId:    string | null;        // derived: pinned ?? hovered ?? focused

  onCardEnter: (sessionId: string) => void;
  onCardLeave: (sessionId: string) => void;
  onPopoverEnter: () => void;
  onPopoverLeave: () => void;
  onCardClick: (sessionId: string) => void;
  togglePin:   (sessionId: string) => void;
  unpin:       () => void;
  cycleFocus:  (direction: 1 | -1) => void;
  closeAll:    () => void;
}

export function useInspectorState(awaitingSessionIds: string[]): InspectorState;
```

Internal:

- Single `useReducer` with the four state fields plus a transient `closeTimerId`.
- 220 ms close-delay implemented via `window.setTimeout` stored in a ref;
  any *Enter event clears it.
- `cycleFocus(1)` increments through `awaitingSessionIds`, wraps from end
  to start. `cycleFocus(-1)` does the opposite. Setting focus opens that
  session in unpinned mode.

### 2.2 Context

```tsx
// src/components/agent-overview/InspectorContext.tsx
export const InspectorContext = createContext<InspectorState | null>(null);
export function useInspector(): InspectorState;   // throws if outside provider
```

### 2.3 Wiring in `AgentOverviewApp`

```tsx
const awaitingSessionIds = useMemo(
  () =>
    [...awaiting]
      .sort((a, b) => b.stateSinceMs - a.stateSinceMs)   // oldest first
      .map(a => a.sessionId),
  [awaiting],
);
const inspector = useInspectorState(awaitingSessionIds);
useKeyboardShortcuts(inspector, awaiting);

return (
  <InspectorContext.Provider value={inspector}>
    {/* …all existing children… */}
    {inspector.openSessionId && <InspectorPopover sessionId={inspector.openSessionId} />}
  </InspectorContext.Provider>
);
```

### 2.4 AgentCard hooks

```tsx
const inspector = useInspector();
const focused = inspector.focusedSessionId === agent.sessionId;

return (
  <div
    className={`ag-card ag-card--${agent.state}${focused ? ' ag-card--focus-ring' : ''}`}
    data-session-id={agent.sessionId}
    onMouseEnter={() => inspector.onCardEnter(agent.sessionId)}
    onMouseLeave={() => inspector.onCardLeave(agent.sessionId)}
    onClick={() => inspector.onCardClick(agent.sessionId)}
  >
    {/* unchanged hero / breadcrumb / footer */}
  </div>
);
```

Yellow focus ring CSS:

```css
.ag-card--focus-ring {
  outline: 2px solid var(--color-status-yellow);
  outline-offset: 2px;
}
```

### 2.5 Snooze / seen filter rules (frontend)

In `AgentOverviewApp` derivation:

```ts
const isSnoozed = (s: SessionRecord) =>
  s.snoozedUntilMs !== null && s.snoozedUntilMs > Date.now();

const isSeen = (s: SessionRecord) =>
  s.seenAtMs !== null && s.seenAtMs >= s.lastEventMs;   // already verified server-side too

const awaiting = sessions.filter(s => s.state === 'awaiting' && !isSnoozed(s));
```

Mark-seen does *not* hide cards; it greys them (opacity 0.5) by adding
`ag-card--seen` class. Snoozed cards drop out of the awaiting rail and out
of the titlebar's awaiting count. They reappear automatically when
`Date.now() > snoozedUntilMs` — handled by a `setInterval(..., 1000)` that
ticks the derivation. Snooze duration is short (5 min default) so 1-second
polling is cheap.

---

## Section 3 — `InspectorPopover` component

### 3.1 File layout

```
src/components/agent-overview/inspector/
  InspectorPopover.tsx          # the component
  InspectorHeader.tsx           # sticky header with pin
  InspectorMessageCallout.tsx   # "your last message" block
  InspectorFilesSection.tsx     # files-changed list
  InspectorFileRow.tsx          # one row, expand-to-snippet
  InspectorActions.tsx          # footer button row
  position.ts                   # bounding-box → popover anchor math
  __tests__/                    # one test per component
```

### 3.2 Top-level component

```tsx
export function InspectorPopover({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId);                 // selector hook
  const inspector = useInspector();
  const anchorRect = useTriggerRect(sessionId);          // measures [data-session-id]
  const position = useMemo(() => placePopover(anchorRect), [anchorRect]);
  const filesQuery = useTurnFilesDiffstat(session);      // eager +/− fetch

  if (!session) return null;
  return (
    <div
      role="tooltip"
      className="inspector-popover"
      style={position}
      onMouseEnter={inspector.onPopoverEnter}
      onMouseLeave={inspector.onPopoverLeave}
      onClick={() => inspector.onCardClick(sessionId)}
      data-pinned={inspector.pinnedSessionId === sessionId || undefined}
    >
      <InspectorHeader session={session} />
      {session.lastUserMsg && <InspectorMessageCallout text={session.lastUserMsg} />}
      {session.lastAssistantMsg && <AssistantMarkdown text={session.lastAssistantMsg} />}
      {session.currentTurnFiles.length > 0 && (
        <InspectorFilesSection session={session} files={filesQuery.data ?? []} />
      )}
      <InspectorActions session={session} />
    </div>
  );
}
```

### 3.3 Position math (`position.ts`)

- Default: anchor below the card, left-aligned to the card's left edge.
- If popover would overflow the viewport bottom: anchor above the card.
- If popover would overflow the right edge: clamp to `viewportRight − 12`.
- Width: 480 px (roomy / standard density). Max-height: 70 vh; body
  scrolls, header sticks.

Listeners on `window` resize + scroll re-measure the anchor and re-place.

### 3.4 Header

- State dot + pane label + branch + time-since (tier-colored).
- Repo path on its own line, mono font, faint.
- Right-aligned pin toggle button (`title="Pin (P)"`, `aria-pressed`).

### 3.5 Message callout

Faint amber-tinted block, monospace italic.
4-line clamp; full text in the `title` attribute for hover-to-see.

### 3.6 Files section — diffstat fetching

New service helper:

```ts
// src/services/agent-overview.ts
export async function fetchTurnFilesDiffstat(
  cwd: string,
  files: TurnFile[],
): Promise<Array<TurnFile & { additions: number; deletions: number; status: FileStatus }>>;
```

Implementation: one IPC to `list_worktree_changes(cwd)`, intersect by path,
fall through with `additions=0, deletions=0, status='read'` for paths not
in the worktree changeset (Read-only or reverted).

The `useTurnFilesDiffstat` React hook caches the result for the popover's
lifetime in a `useRef<Map>` keyed by `sessionId`. Each fresh popover open
fetches once; subsequent renders within the same open session reuse.

### 3.7 File-row snippet — lazy load

```tsx
function InspectorFileRow({ session, file }) {
  const [expanded, setExpanded] = useState(false);
  const snippetQuery = useFileDiffSnippet(session.cwd, file.path, expanded);
  // …
}
```

`useFileDiffSnippet` invokes `diff_worktree_vs_head(cwd, path)` only when
`enabled === true` (i.e. expanded). Cached per `(sessionId, path)` in a
`useRef<Map>` scoped to the popover's lifetime — closing the popover wipes
the cache, so reopening fetches fresh diffs (which is what we want, since
the worktree may have changed). Within a single open session, re-expanding
the same file is instant.

Render uses the existing diff viewer's syntax highlighter
(`src/services/syntax-highlighter.ts`). Cap at 12 lines per file with a
"show full diff →" tail link that calls `open_pr_detail_window` (existing
infrastructure) with a synthetic file payload — same window the user already
sees for PR diffs.

Status legend on each row: `A` (added) / `M` (modified) / `D` (deleted) /
`R` (renamed) / `·` (read-only / no change). Color from existing tokens.

### 3.8 Footer actions

```tsx
function InspectorActions({ session }) {
  return (
    <footer className="inspector-actions">
      <button onClick={focusPane}>Focus pane <Hint>F</Hint></button>
      <button onClick={snooze}>Snooze 5m <Hint>S</Hint></button>
      <button onClick={markSeen}>Mark seen <Hint>M</Hint></button>
    </footer>
  );
}
```

`focusPane` calls `focus_session_pane`; on `Ok(false)` shows a toast via
the existing notification store ("Couldn't find a terminal window for this
session").

`snooze` and `markSeen` call their respective Tauri commands. After success,
the popover unpins and closes (Section 2's `closeAll`).

### 3.9 Close semantics

- `Esc` → `inspector.unpin()` if pinned, else `inspector.closeAll()`.
- Click outside (a `useOnClickOutside` listener targeting both the popover
  ref and the trigger card via `data-session-id`) → `inspector.closeAll()`.

---

## Section 4 — `useKeyboardShortcuts`

```ts
// src/hooks/useKeyboardShortcuts.ts (new)
export function useKeyboardShortcuts(
  inspector: InspectorState,
  awaiting:  SessionRecord[],
): void;
```

Bound on `window` via a `useEffect` `keydown` listener. The listener is a
no-op when the active element is an `<input>`, `<textarea>`, or has
`contenteditable=true` — we never want to swallow keys the user is typing
into a field.

| Key         | When                              | Action |
|-------------|-----------------------------------|--------|
| `Tab`       | always                            | `cycleFocus(1)` (preventDefault to stop tabnav) |
| `Shift+Tab` | always                            | `cycleFocus(-1)` |
| `Esc`       | always                            | `unpin()` if pinned, else `closeAll()` |
| `F`         | inspector open                    | Focus pane for `openSessionId` |
| `S`         | inspector open                    | Snooze 5m for `openSessionId` |
| `M`         | inspector open                    | Mark seen for `openSessionId` |
| `P`         | inspector open                    | `togglePin(openSessionId)` |

Tab cycling order matches the awaiting array sorted by `stateSinceMs`
descending (oldest first), per Section 2.3. The visible rail will be
re-ordered to match so Tab order is also visual order.

Action keys (`F`/`S`/`M`/`P`) only fire when `inspector.openSessionId` is
truthy. This avoids a stray `S` keystroke from snoozing whatever was last
hovered hours ago.

---

## Section 5 — Testing & rollout

### 5.1 New / updated tests

| File | What it covers |
|---|---|
| `agent_overview/state.rs` Rust unit tests | `current_turn_files` appended on `tool_decision`, cleared on `user_prompt`, capped at 50, dedup by path |
| `agent_overview/commands.rs` Rust integration tests | `snooze`, `mark_seen` round-trip through sqlite; `mark_seen` auto-clears when `last_event_at > seen_at_ms` |
| `platform/focus_pane.rs` Rust unit tests | Process-tree match logic with a fake `sysinfo` adapter (Windows-only `#[cfg]`) |
| `useInspectorState.test.ts` | Hover open/close timing (220 ms), pin/unpin, Tab wrap, openSessionId precedence |
| `useKeyboardShortcuts.test.ts` | Each binding triggers the right action; ignored when input is focused |
| `InspectorPopover.test.tsx` | Renders header / callout / markdown / files / actions; pin toggle; click-outside closes |
| `InspectorFileRow.test.tsx` | Lazy fetch fires only on expand; cached on re-expand; "no preview" for absent paths |
| `AgentOverviewApp.test.tsx` (extension) | Snoozed sessions vanish from awaiting rail; mark-seen greys but doesn't hide |

All tests follow the existing pattern: vitest + RTL for frontend, `#[test]`
for Rust. Mocks for Tauri commands follow the established `vi.mock('@tauri-apps/api/core', …)` pattern.

### 5.2 Migration / rollout

- sqlite migration is additive (`CREATE TABLE IF NOT EXISTS`) — no version
  bump needed in the cache module.
- New `SessionRecord` fields default to `null` / empty array on old data —
  no frontend defensive coding needed.
- No feature flag. The backend always emits the new fields; the frontend
  always renders the inspector. There's nothing to gate.

### 5.3 Out of scope (explicit)

- Cross-app global hotkeys (Q6: rejected). If we want global focus-pane
  later, that's a separate spec.
- Multiplexer-native pane addressing (wezterm CLI etc.) — Q1A is explicitly
  best-effort window raise.
- Snooze durations other than 5 minutes — the command takes `duration_ms`,
  but the only call site uses `5 * 60 * 1000`. Custom durations can come
  later without schema change.
- "Pin all," batch actions, awaiting-card dragging / reordering.

## File index (everything created or changed)

```
+ docs/superpowers/specs/2026-05-04-agent-overview-completion-design.md     (this file)

+ src-tauri/src/agent_overview/turn_files.rs                                (new module)
* src-tauri/src/agent_overview/state.rs                                     (track currentTurnFiles)
* src-tauri/src/agent_overview/types.rs                                     (3 new SessionRecord fields, TurnFile struct)
* src-tauri/src/agent_overview/commands.rs                                  (3 new commands)
* src-tauri/src/agent_overview/mod.rs                                       (register commands)
+ src-tauri/src/agent_overview/meta_store.rs                                (sqlite table CRUD)
* src-tauri/src/cache/mod.rs                                                (run new migration)
+ src-tauri/src/platform/focus_pane.rs                                      (Windows window-raise)
* src-tauri/src/platform/mod.rs                                             (export focus_pane)
* src-tauri/src/lib.rs                                                      (register commands + state)

* src/services/agent-overview-types.ts                                      (mirror new fields, TurnFile)
* src/services/agent-overview.ts                                            (helpers: isSnoozed, isSeen, fetchTurnFilesDiffstat)
+ src/hooks/useInspectorState.ts
+ src/hooks/useKeyboardShortcuts.ts
+ src/components/agent-overview/InspectorContext.tsx
+ src/components/agent-overview/inspector/InspectorPopover.tsx
+ src/components/agent-overview/inspector/InspectorHeader.tsx
+ src/components/agent-overview/inspector/InspectorMessageCallout.tsx
+ src/components/agent-overview/inspector/InspectorFilesSection.tsx
+ src/components/agent-overview/inspector/InspectorFileRow.tsx
+ src/components/agent-overview/inspector/InspectorActions.tsx
+ src/components/agent-overview/inspector/position.ts
* src/components/agent-overview/AgentCard.tsx                               (drop HoverPopover, wire useInspector + data-session-id)
* src/components/agent-overview/AgentOverviewApp.tsx                        (provider + filter rules)
* src/styles/agent-overview.css                                             (.ag-card--focus-ring, .ag-card--seen, .inspector-popover, etc.)

+ src/components/agent-overview/inspector/__tests__/...                     (per-component tests)
+ src/hooks/__tests__/useInspectorState.test.ts
+ src/hooks/__tests__/useKeyboardShortcuts.test.ts
* src/components/agent-overview/__tests__/AgentOverviewApp.test.tsx         (extend for snooze/seen)
* src/components/agent-overview/__tests__/AgentCard.test.tsx                (replace HoverPopover assertion)
+ src-tauri/src/agent_overview/state_test.rs                                (or inline #[cfg(test)] mod)
+ src-tauri/src/agent_overview/commands_test.rs                             (or inline)
+ src-tauri/src/platform/focus_pane_test.rs                                 (or inline)
```

## Summary

After implementation, every spec bullet from the original Agent Overview
spec maps to shipping code. The inspector popover is the action surface;
the awaiting rail is the alert layer; the keyboard shortcuts let you triage
without reaching for the mouse; snooze and mark-seen turn the dashboard
into something you can curate rather than just read. Backend stays the
source of truth (sqlite + OTel-driven state); the frontend interprets that
into UI rules.
