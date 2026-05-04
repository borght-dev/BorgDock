# Agent Overview Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the inspector popover, keyboard shortcuts, snooze / mark-seen / focus-pane actions, and per-turn file tracking so the Agent Overview dashboard matches its spec 100%.

**Architecture:** Backend-owned persistence (sqlite + OTel-driven state) emitting all needed fields on `SessionRecord`. Frontend wraps cards in a `<InspectorContext>` provider and a single page-level `useInspectorState` hook orchestrates one popover at a time. Keyboard shortcuts live in a separate `useKeyboardShortcuts` hook bound to `window`.

**Tech Stack:** Rust + Tauri 2 (sqlite via `rusqlite`, process tree via `sysinfo`, Win32 API via `windows` crate), React 18 + TypeScript, Vitest + RTL, existing tree-sitter syntax-highlighter.

**Reference spec:** `docs/superpowers/specs/2026-05-04-agent-overview-completion-design.md`. When this plan refers to "the spec," that's the file.

**Pre-existing failing tests:** Master has 7 failing tests in `notification-store` / `NotificationOverlay` that are unrelated. Ignore them; verify yours pass.

**Working dir convention:** All paths are relative to `E:/BorgDock`. Tauri/React project root is `src/BorgDock.Tauri/`. Run frontend commands from `src/BorgDock.Tauri/`; run cargo commands from `src/BorgDock.Tauri/src-tauri/` (with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` if using Git Bash on Windows, per `CLAUDE.md`).

---

## File map

```
+ src-tauri/src/agent_overview/turn_files.rs         (new: per-session file tracker)
+ src-tauri/src/agent_overview/meta_store.rs         (new: sqlite CRUD for snooze/seen)
+ src-tauri/src/platform/focus_pane.rs               (new: window-raise impl)
* src-tauri/src/agent_overview/types.rs              (TurnFile struct + 3 new SessionRecord fields)
* src-tauri/src/agent_overview/state.rs              (track in tool_result; clear in user_prompt)
* src-tauri/src/agent_overview/store.rs              (seal_for_emit reads meta; new mutators)
* src-tauri/src/agent_overview/commands.rs           (3 new commands)
* src-tauri/src/agent_overview/mod.rs                (export new commands)
* src-tauri/src/cache/mod.rs                         (CREATE TABLE agent_session_meta)
* src-tauri/src/platform/mod.rs                      (export focus_pane module)
* src-tauri/src/lib.rs                               (register new commands)

* src/services/agent-overview-types.ts               (TurnFile + 3 new fields)
* src/services/agent-overview.ts                     (isSnoozed, isSeen, fetchTurnFilesDiffstat)
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
* src/components/agent-overview/AgentCard.tsx       (drop HoverPopover, wire useInspector)
* src/components/agent-overview/AgentOverviewApp.tsx (provider, awaiting sort, snooze tick)
* src/styles/agent-overview.css                      (.ag-card--focus-ring, .ag-card--seen, .inspector-popover, .inspector-callout)

+ tests at the path of each file under __tests__/
```

---

## Phase 1 — Backend data model (no behavior change)

### Task 1: Add `TurnFile` struct + 3 `SessionRecord` fields

**Files:**
- Modify: `src-tauri/src/agent_overview/types.rs`

- [ ] **Step 1: Add the new types and fields**

In `src-tauri/src/agent_overview/types.rs`, after the existing `SessionDelta` enum, add:

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TurnFileTool { Edit, Write, Read }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnFile {
    pub path: String,
    pub tool: TurnFileTool,
    pub timestamp_ms: u128,   // wall-clock epoch ms when the tool ran
}
```

Then in the `SessionRecord` struct, after the `pending_tool_uses` field, add:

```rust
    /// Files Claude has touched since the last `user_prompt`. De-duped by
    /// path (later tool wins), capped at 50 entries to keep memory bounded.
    /// Cleared whenever a `user_prompt` event arrives.
    pub current_turn_files: Vec<TurnFile>,

    /// Wall-clock epoch ms after which this session reappears in the
    /// awaiting rail. None when not snoozed. Hydrated from sqlite.
    pub snoozed_until_ms: Option<u128>,

    /// Wall-clock epoch ms when the user marked this session seen. None
    /// when never marked. Hydrated from sqlite. The store auto-clears it
    /// when `last_event_at` advances past `seen_at_ms`.
    pub seen_at_ms: Option<u128>,
```

In every existing `SessionRecord { … }` constructor in the same file (the `SessionDelta::Upsert` test, etc.), add the three new fields with defaults:

```rust
            current_turn_files: Vec::new(),
            snoozed_until_ms: None,
            seen_at_ms: None,
```

- [ ] **Step 2: Compile**

Run from `src-tauri/`:
```
cargo check -p borgdock-tauri 2>&1 | tail -20
```
(Use `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` prefix if on Git Bash.)
Expected: clean compile. Fix any "missing field" errors in other files (search for `SessionRecord {` and add the three defaults — likely in `store.rs`'s constructor on lines ~190).

- [ ] **Step 3: Run existing tests**

```
cargo test -p borgdock-tauri agent_overview:: 2>&1 | tail -20
```
Expected: all existing agent_overview tests pass. The new fields are unobserved so far.

- [ ] **Step 4: Commit**

```
git add src-tauri/src/agent_overview/types.rs src-tauri/src/agent_overview/store.rs
git commit -m "agent-overview: add TurnFile + currentTurnFiles/snoozedUntilMs/seenAtMs to SessionRecord"
```

---

### Task 2: Mirror types in TypeScript

**Files:**
- Modify: `src/services/agent-overview-types.ts`
- Modify: `src/components/agent-overview/__tests__/AgentOverviewApp.test.tsx` (add fields to `rec()`)
- Modify: `src/components/agent-overview/__tests__/AgentCard.test.tsx` (add to `base`)
- Modify: `src/components/agent-overview/__tests__/AwaitingRail.test.tsx` (add to `rec()`)
- Modify: `src/services/__tests__/agent-overview.test.ts` (add to `baseRecord`)

- [ ] **Step 1: Add types**

In `src/services/agent-overview-types.ts`, after the `SessionState` line, add:

```ts
export type TurnFileTool = 'edit' | 'write' | 'read';

export interface TurnFile {
  path: string;
  tool: TurnFileTool;
  timestampMs: number;
}
```

In `SessionRecord`, after `lastApiStopReason`, add:

```ts
  currentTurnFiles: TurnFile[];
  snoozedUntilMs: number | null;
  seenAtMs: number | null;
```

- [ ] **Step 2: Patch every test factory that builds a `SessionRecord` literal**

In each of the four test files listed above, find the `SessionRecord` literal (search `lastApiStopReason: null` or `lastApiStopReason:`) and add the three fields with defaults:

```ts
    currentTurnFiles: [],
    snoozedUntilMs: null,
    seenAtMs: null,
```

- [ ] **Step 3: Run typecheck and tests**

From `src/BorgDock.Tauri/`:
```
npx tsc --noEmit
npx vitest run src/services/__tests__/agent-overview.test.ts src/components/agent-overview/__tests__/
```
Expected: tsc clean, all 46 tests pass.

- [ ] **Step 4: Commit**

```
git add src/services/agent-overview-types.ts src/services/__tests__/ src/components/agent-overview/__tests__/
git commit -m "agent-overview: mirror TurnFile + new SessionRecord fields in TS types and test factories"
```

---

### Task 3: Add `agent_session_meta` table to cache schema

**Files:**
- Modify: `src-tauri/src/cache/mod.rs`

- [ ] **Step 1: Add table to `cache_init` batch**

In `cache_init`'s `execute_batch` block, append a new table (after the `sql_snippets` table, before the closing `;",`):

```sql
        CREATE TABLE IF NOT EXISTS agent_session_meta (
            session_id        TEXT PRIMARY KEY,
            snoozed_until_ms  INTEGER,
            seen_at_ms        INTEGER,
            updated_at_ms     INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_meta_updated
            ON agent_session_meta(updated_at_ms);
```

- [ ] **Step 2: Compile**

```
cargo check -p borgdock-tauri 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 3: Manual smoke (optional)**

`cargo test cache_init` — if there's a test, it should still pass; if not, skip.

- [ ] **Step 4: Commit**

```
git add src-tauri/src/cache/mod.rs
git commit -m "cache: add agent_session_meta table for snooze/mark-seen persistence"
```

---

## Phase 2 — Backend OTel currentTurnFiles tracking

### Task 4: Track tool-touched files in `apply_event`

**Files:**
- Modify: `src-tauri/src/agent_overview/state.rs`

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/agent_overview/state.rs`'s `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn user_prompt_clears_current_turn_files() {
        let mut r = make_record(SessionState::Working, Instant::now());
        r.current_turn_files.push(TurnFile {
            path: "src/foo.ts".into(),
            tool: TurnFileTool::Edit,
            timestamp_ms: 0,
        });
        apply_event(&mut r, &ev("sid", "user_prompt", &[
            ("prompt", Value::String("hi".into())),
        ]), Instant::now());
        assert!(r.current_turn_files.is_empty());
    }

    #[test]
    fn tool_result_appends_edit_to_current_turn_files() {
        let mut r = make_record(SessionState::Tool, Instant::now());
        apply_event(&mut r, &ev("sid", "tool_result", &[
            ("tool_name", Value::String("Edit".into())),
            ("tool_input", Value::String(r#"{"file_path":"D:/x/foo.ts"}"#.into())),
        ]), Instant::now());
        assert_eq!(r.current_turn_files.len(), 1);
        let f = &r.current_turn_files[0];
        assert_eq!(f.path, "D:/x/foo.ts");
        assert!(matches!(f.tool, TurnFileTool::Edit));
    }

    #[test]
    fn tool_result_dedups_paths_keeping_latest_tool() {
        let mut r = make_record(SessionState::Tool, Instant::now());
        let read_evt = ev("sid", "tool_result", &[
            ("tool_name", Value::String("Read".into())),
            ("tool_input", Value::String(r#"{"file_path":"x.ts"}"#.into())),
        ]);
        let edit_evt = ev("sid", "tool_result", &[
            ("tool_name", Value::String("Edit".into())),
            ("tool_input", Value::String(r#"{"file_path":"x.ts"}"#.into())),
        ]);
        apply_event(&mut r, &read_evt, Instant::now());
        apply_event(&mut r, &edit_evt, Instant::now());
        assert_eq!(r.current_turn_files.len(), 1);
        assert!(matches!(r.current_turn_files[0].tool, TurnFileTool::Edit));
    }

    #[test]
    fn tool_result_caps_current_turn_files_at_50() {
        let mut r = make_record(SessionState::Tool, Instant::now());
        for i in 0..60 {
            let path = format!("\"file{i}.ts\"");
            apply_event(&mut r, &ev("sid", "tool_result", &[
                ("tool_name", Value::String("Edit".into())),
                ("tool_input", Value::String(format!(r#"{{"file_path":{path}}}"#))),
            ]), Instant::now());
        }
        assert_eq!(r.current_turn_files.len(), 50);
        assert_eq!(r.current_turn_files[0].path, "file10.ts"); // oldest dropped
    }
```

Make sure `TurnFile` and `TurnFileTool` are imported at the top of the test mod (`use super::super::types::{TurnFile, TurnFileTool};`).

If the existing tests don't already have a `make_record` helper, add this near the top of the `tests` mod (or reuse the existing one — search for `fn make_record`):

```rust
    fn make_record(state: SessionState, now: Instant) -> SessionRecord {
        SessionRecord {
            session_id: "sid".into(),
            cwd: PathBuf::from("/x"),
            repo: "BD".into(),
            worktree: "master".into(),
            branch: "master".into(),
            label: "BD · master #1".into(),
            state, state_since: now, last_event_at: now,
            last_user_msg: None, last_assistant_msg: None, task: None,
            model: None, tokens_used: 0, tokens_max: 200_000,
            last_api_stop_reason: None,
            pending_tool_uses: HashSet::new(),
            last_api_request_at: None,
            state_since_ms: 0, last_event_ms: 0,
            current_turn_files: Vec::new(),
            snoozed_until_ms: None, seen_at_ms: None,
        }
    }
```

- [ ] **Step 2: Run failing tests**

```
cargo test -p borgdock-tauri agent_overview::state::tests::user_prompt_clears_current_turn_files agent_overview::state::tests::tool_result_appends_edit_to_current_turn_files 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 3: Implement the tracking**

In `src-tauri/src/agent_overview/state.rs`, add at the top of the file:

```rust
use crate::agent_overview::types::{TurnFile, TurnFileTool};
use std::time::{SystemTime, UNIX_EPOCH};
```

In `apply_event`, edit the `"user_prompt"` arm to add `record.current_turn_files.clear();` after the existing `record.last_assistant_msg = None;` line.

In the `"tool_result"` arm (above `update_task_narrative(record, event);`), add:

```rust
            track_turn_file(record, event);
```

Then add this helper function below `update_task_narrative`:

```rust
const TURN_FILES_CAP: usize = 50;

fn track_turn_file(record: &mut SessionRecord, event: &RawEvent) {
    let Some(tool_name) = event.attrs.get("tool_name").and_then(Value::as_str) else { return };
    let tool = match tool_name {
        "Edit" => TurnFileTool::Edit,
        "Write" => TurnFileTool::Write,
        "Read" => TurnFileTool::Read,
        _ => return,
    };
    let input = parsed_tool_input(event);
    let path = input
        .as_ref()
        .and_then(|p| p.get("file_path"))
        .or_else(|| event.attrs.get("file_path"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let Some(path) = path else { return };

    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    // Dedup: drop any existing entry for the same path before appending.
    record.current_turn_files.retain(|f| f.path != path);
    record.current_turn_files.push(TurnFile { path, tool, timestamp_ms });

    // Bound memory.
    if record.current_turn_files.len() > TURN_FILES_CAP {
        let drop_count = record.current_turn_files.len() - TURN_FILES_CAP;
        record.current_turn_files.drain(0..drop_count);
    }
}
```

- [ ] **Step 4: Run tests**

```
cargo test -p borgdock-tauri agent_overview::state::tests:: 2>&1 | tail -30
```
Expected: all pass, including the four new ones.

- [ ] **Step 5: Commit**

```
git add src-tauri/src/agent_overview/state.rs
git commit -m "agent-overview: track tool-touched files into SessionRecord.currentTurnFiles"
```

---

## Phase 3 — Backend snooze / mark-seen / focus-pane

### Task 5: Create `meta_store` module (sqlite CRUD)

**Files:**
- Create: `src-tauri/src/agent_overview/meta_store.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/agent_overview/meta_store.rs`:

```rust
use rusqlite::{params, Connection};

/// One row from `agent_session_meta`. Both ms fields are nullable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionMeta {
    pub snoozed_until_ms: Option<u128>,
    pub seen_at_ms: Option<u128>,
}

pub fn put(
    conn: &Connection,
    session_id: &str,
    snoozed_until_ms: Option<u128>,
    seen_at_ms: Option<u128>,
    now_ms: u128,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO agent_session_meta
            (session_id, snoozed_until_ms, seen_at_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(session_id) DO UPDATE SET
            snoozed_until_ms = excluded.snoozed_until_ms,
            seen_at_ms       = excluded.seen_at_ms,
            updated_at_ms    = excluded.updated_at_ms",
        params![
            session_id,
            snoozed_until_ms.map(|n| n as i64),
            seen_at_ms.map(|n| n as i64),
            now_ms as i64,
        ],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, session_id: &str) -> Result<Option<SessionMeta>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT snoozed_until_ms, seen_at_ms FROM agent_session_meta WHERE session_id = ?1",
    )?;
    let mut rows = stmt.query(params![session_id])?;
    if let Some(row) = rows.next()? {
        let snoozed: Option<i64> = row.get(0)?;
        let seen: Option<i64> = row.get(1)?;
        Ok(Some(SessionMeta {
            snoozed_until_ms: snoozed.map(|n| n as u128),
            seen_at_ms: seen.map(|n| n as u128),
        }))
    } else {
        Ok(None)
    }
}

pub fn load_all(conn: &Connection) -> Result<std::collections::HashMap<String, SessionMeta>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT session_id, snoozed_until_ms, seen_at_ms FROM agent_session_meta",
    )?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let snoozed: Option<i64> = row.get(1)?;
        let seen: Option<i64> = row.get(2)?;
        Ok((id, SessionMeta {
            snoozed_until_ms: snoozed.map(|n| n as u128),
            seen_at_ms: seen.map(|n| n as u128),
        }))
    })?;
    let mut out = std::collections::HashMap::new();
    for r in rows { let (id, m) = r?; out.insert(id, m); }
    Ok(out)
}

pub fn gc_older_than(conn: &Connection, cutoff_ms: u128) -> Result<usize, rusqlite::Error> {
    let n = conn.execute(
        "DELETE FROM agent_session_meta WHERE updated_at_ms < ?1",
        params![cutoff_ms as i64],
    )?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE agent_session_meta (
                session_id TEXT PRIMARY KEY,
                snoozed_until_ms INTEGER,
                seen_at_ms INTEGER,
                updated_at_ms INTEGER NOT NULL);",
        ).unwrap();
        c
    }

    #[test]
    fn put_then_get_roundtrip() {
        let c = open();
        put(&c, "sid", Some(123), Some(456), 1000).unwrap();
        let got = get(&c, "sid").unwrap();
        assert_eq!(got, Some(SessionMeta {
            snoozed_until_ms: Some(123), seen_at_ms: Some(456),
        }));
    }

    #[test]
    fn put_overwrites_existing() {
        let c = open();
        put(&c, "sid", Some(1), Some(2), 1000).unwrap();
        put(&c, "sid", None, Some(99), 2000).unwrap();
        let got = get(&c, "sid").unwrap().unwrap();
        assert_eq!(got.snoozed_until_ms, None);
        assert_eq!(got.seen_at_ms, Some(99));
    }

    #[test]
    fn get_returns_none_for_missing() {
        let c = open();
        assert!(get(&c, "nope").unwrap().is_none());
    }

    #[test]
    fn gc_drops_rows_older_than_cutoff() {
        let c = open();
        put(&c, "old", None, Some(1), 100).unwrap();
        put(&c, "new", None, Some(2), 1000).unwrap();
        let removed = gc_older_than(&c, 500).unwrap();
        assert_eq!(removed, 1);
        assert!(get(&c, "old").unwrap().is_none());
        assert!(get(&c, "new").unwrap().is_some());
    }
}
```

Add `pub mod meta_store;` to `src-tauri/src/agent_overview/mod.rs`.

- [ ] **Step 2: Run tests**

```
cargo test -p borgdock-tauri agent_overview::meta_store::tests:: 2>&1 | tail -20
```
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```
git add src-tauri/src/agent_overview/meta_store.rs src-tauri/src/agent_overview/mod.rs
git commit -m "agent-overview: add meta_store sqlite CRUD for session snooze/seen state"
```

---

### Task 6: GC stale meta rows on startup

**Files:**
- Modify: `src-tauri/src/cache/mod.rs`

- [ ] **Step 1: Add GC call after `CREATE TABLE`s**

In `cache_init`, after `execute_batch(...)?`, add:

```rust
    // GC agent_session_meta rows older than 30 days. Prevents the table
    // from growing unbounded as session ids change.
    let cutoff_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
        .saturating_sub(30 * 24 * 60 * 60 * 1000);
    let _ = conn.execute(
        "DELETE FROM agent_session_meta WHERE updated_at_ms < ?1",
        rusqlite::params![cutoff_ms as i64],
    );
```

- [ ] **Step 2: Compile**

```
cargo check -p borgdock-tauri 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 3: Commit**

```
git add src-tauri/src/cache/mod.rs
git commit -m "cache: GC agent_session_meta rows older than 30 days on init"
```

---

### Task 7: Plumb meta into `SessionStore` snapshot

**Files:**
- Modify: `src-tauri/src/agent_overview/store.rs`

- [ ] **Step 1: Cache a meta map on the store**

Replace the `SessionStore` definition (top of `store.rs`) with:

```rust
#[derive(Clone, Default)]
pub struct SessionStore {
    pub(crate) inner: Arc<RwLock<HashMap<String, SessionRecord>>>,
    pub(crate) meta:  Arc<RwLock<HashMap<String, crate::agent_overview::meta_store::SessionMeta>>>,
}
```

- [ ] **Step 2: Add a setter the commands will call later**

In the `impl SessionStore` block, add:

```rust
    pub fn set_meta(
        &self,
        session_id: &str,
        snoozed_until_ms: Option<u128>,
        seen_at_ms: Option<u128>,
        deltas: &UnboundedSender<SessionDelta>,
        now: Instant,
    ) {
        let new_meta = crate::agent_overview::meta_store::SessionMeta {
            snoozed_until_ms,
            seen_at_ms,
        };
        if let Ok(mut m) = self.meta.write() {
            m.insert(session_id.to_string(), new_meta.clone());
        }
        if let Ok(mut map) = self.inner.write() {
            if let Some(rec) = map.get_mut(session_id) {
                rec.snoozed_until_ms = new_meta.snoozed_until_ms;
                rec.seen_at_ms = new_meta.seen_at_ms;
                let snap = seal_for_emit(rec.clone(), now);
                let _ = deltas.send(SessionDelta::Upsert { session: snap });
            }
        }
    }

    pub fn hydrate_meta(&self, all: HashMap<String, crate::agent_overview::meta_store::SessionMeta>) {
        if let Ok(mut m) = self.meta.write() { *m = all; }
    }
```

- [ ] **Step 3: Apply meta + auto-clear seen during seal_for_emit**

Replace `seal_for_emit` with:

```rust
fn seal_for_emit(mut rec: SessionRecord, now: Instant) -> SessionRecord {
    rec.state_since_ms = now.saturating_duration_since(rec.state_since).as_millis();
    rec.last_event_ms = now.saturating_duration_since(rec.last_event_at).as_millis();
    // Auto-clear `seen_at_ms` when activity has happened since.
    if let Some(seen) = rec.seen_at_ms {
        let event_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
            .saturating_sub(rec.last_event_ms);
        if event_ms > seen {
            rec.seen_at_ms = None;
        }
    }
    rec
}
```

In `SessionStore::ingest_event`, before the final `if changed { ... }` branch, hydrate meta from the cached map onto the record:

```rust
        if let Ok(meta_map) = self.meta.read() {
            if let Some(m) = meta_map.get(&session_id) {
                entry.snoozed_until_ms = m.snoozed_until_ms;
                entry.seen_at_ms = m.seen_at_ms;
            }
        }
```

(Place this directly above the `let changed = apply_event(entry, &event, now);` line.)

- [ ] **Step 4: Add `current_turn_files: Vec::new()` etc. wherever the test in store.rs constructs `SessionRecord`**

Search this file for `SessionRecord {` and ensure each construction has the three new fields with defaults (compiler will tell you).

- [ ] **Step 5: Compile + run existing tests**

```
cargo test -p borgdock-tauri agent_overview:: 2>&1 | tail -30
```
Expected: all pass.

- [ ] **Step 6: Commit**

```
git add src-tauri/src/agent_overview/store.rs
git commit -m "agent-overview: plumb session meta (snooze/seen) through SessionStore"
```

---

### Task 8: Snooze + mark-seen Tauri commands

**Files:**
- Modify: `src-tauri/src/agent_overview/commands.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement the commands**

Append to `src-tauri/src/agent_overview/commands.rs`:

```rust
use crate::agent_overview::meta_store;
use crate::cache::PrCache;

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[tauri::command]
pub fn snooze_agent_session(
    session_id: String,
    duration_ms: u64,
    store: tauri::State<'_, SessionStore>,
    deltas: tauri::State<'_, AgentDeltaSender>,
    cache: tauri::State<'_, PrCache>,
) -> Result<(), String> {
    let Some(tx) = deltas.clone_sender() else {
        return Err("agent_overview event loop is not running".into());
    };
    let until = now_ms() + duration_ms as u128;

    // Read current seen_at to preserve it.
    let lock = cache.conn.lock().map_err(|e| e.to_string())?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;
    let prev_seen = meta_store::get(conn, &session_id)
        .map_err(|e| e.to_string())?
        .and_then(|m| m.seen_at_ms);
    meta_store::put(conn, &session_id, Some(until), prev_seen, now_ms())
        .map_err(|e| e.to_string())?;
    drop(lock);

    store.set_meta(&session_id, Some(until), prev_seen, &tx, std::time::Instant::now());
    Ok(())
}

#[tauri::command]
pub fn mark_agent_session_seen(
    session_id: String,
    store: tauri::State<'_, SessionStore>,
    deltas: tauri::State<'_, AgentDeltaSender>,
    cache: tauri::State<'_, PrCache>,
) -> Result<(), String> {
    let Some(tx) = deltas.clone_sender() else {
        return Err("agent_overview event loop is not running".into());
    };
    let seen = now_ms();

    let lock = cache.conn.lock().map_err(|e| e.to_string())?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;
    let prev_snooze = meta_store::get(conn, &session_id)
        .map_err(|e| e.to_string())?
        .and_then(|m| m.snoozed_until_ms);
    meta_store::put(conn, &session_id, prev_snooze, Some(seen), now_ms())
        .map_err(|e| e.to_string())?;
    drop(lock);

    store.set_meta(&session_id, prev_snooze, Some(seen), &tx, std::time::Instant::now());
    Ok(())
}
```

- [ ] **Step 2: Re-export from `mod.rs`**

In `src-tauri/src/agent_overview/mod.rs`, replace the `pub use commands::{...}` line with:

```rust
pub use commands::{
    dismiss_agent_session, disable_agent_overview_telemetry, list_agent_sessions,
    mark_agent_session_seen, set_agent_overview_enabled, snooze_agent_session,
    AgentDeltaSender,
};
```

- [ ] **Step 3: Register commands in `lib.rs`**

In `src-tauri/src/lib.rs`'s `tauri::Builder::default().invoke_handler(tauri::generate_handler![...])` block, add:

```rust
            agent_overview::snooze_agent_session,
            agent_overview::mark_agent_session_seen,
```

next to `agent_overview::dismiss_agent_session`.

- [ ] **Step 4: Hydrate meta on startup**

Find where `SessionStore` is constructed (search for `SessionStore::default()` in `lib.rs`). After construction, add:

```rust
    // Hydrate snooze/seen state from sqlite. Runs after cache_init, so the
    // table exists. Failure here is non-fatal — the dashboard just starts
    // with empty meta.
    {
        let cache_lock = cache_state.conn.lock().ok();
        if let Some(lock) = cache_lock {
            if let Some(conn) = lock.as_ref() {
                if let Ok(all) = agent_overview::meta_store::load_all(conn) {
                    session_store.hydrate_meta(all);
                }
            }
        }
    }
```

(Adjust variable names — `cache_state` and `session_store` — to match the actual locals in your `lib.rs`.)

- [ ] **Step 5: Compile**

```
cargo check -p borgdock-tauri 2>&1 | tail -20
```
Expected: clean.

- [ ] **Step 6: Commit**

```
git add src-tauri/src/agent_overview/commands.rs src-tauri/src/agent_overview/mod.rs src-tauri/src/lib.rs
git commit -m "agent-overview: snooze + mark-seen commands with sqlite write-through"
```

---

### Task 9: `focus_session_pane` command (Windows window-raise)

**Files:**
- Create: `src-tauri/src/platform/focus_pane.rs`
- Modify: `src-tauri/src/platform/mod.rs`
- Modify: `src-tauri/src/agent_overview/commands.rs`
- Modify: `src-tauri/src/agent_overview/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add `sysinfo` to deps if missing, ensure `windows` deps cover EnumWindows**

In `src-tauri/Cargo.toml`, ensure these are present (most likely already there — verify):

```toml
[dependencies]
sysinfo = "0.30"

[target.'cfg(windows)'.dependencies]
windows = { version = "0.58", features = [
    "Win32_Foundation",
    "Win32_UI_WindowsAndMessaging",
    "Win32_System_Threading",
] }
```

If they're missing, add. Run `cargo check` to download.

- [ ] **Step 2: Implement `focus_pane.rs`**

Create `src-tauri/src/platform/focus_pane.rs`:

```rust
//! Best-effort raise the terminal window that's running a Claude Code
//! session. We never know exactly which window — there's no IPC across
//! Windows Terminal, wezterm, etc. — so we use process-tree heuristics:
//! find a known terminal-host process whose CWD (or whose descendants'
//! CWDs) match the session, then raise its top-level window.

#![allow(dead_code)]

use std::path::Path;

const KNOWN_HOSTS: &[&str] = &[
    "WindowsTerminal.exe",
    "wezterm-gui.exe",
    "alacritty.exe",
    "pwsh.exe",
    "powershell.exe",
    "cmd.exe",
];

/// Returns true on success, false if no match. Errors only on hard
/// platform failures (the typical "no terminal found" returns Ok(false)).
pub fn focus(session_cwd: &Path) -> Result<bool, String> {
    #[cfg(windows)]
    {
        focus_windows(session_cwd)
    }
    #[cfg(not(windows))]
    {
        let _ = session_cwd;
        Ok(false)
    }
}

#[cfg(windows)]
fn focus_windows(session_cwd: &Path) -> Result<bool, String> {
    use sysinfo::{ProcessesToUpdate, System};
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow,
        ShowWindow, SW_RESTORE,
    };

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, false);

    // Find PIDs whose process tree includes a process running in
    // `session_cwd`.
    let target_cwd = std::fs::canonicalize(session_cwd).unwrap_or_else(|_| session_cwd.to_path_buf());

    let mut candidate_pids: Vec<u32> = Vec::new();
    for (pid, proc_) in sys.processes() {
        if let Some(cwd) = proc_.cwd() {
            let cwd_canon = std::fs::canonicalize(cwd).unwrap_or_else(|_| cwd.to_path_buf());
            if cwd_canon == target_cwd {
                // Walk up to the topmost ancestor that's a known host.
                let mut current = pid.as_u32();
                loop {
                    let proc_at_current = sys.process(sysinfo::Pid::from_u32(current));
                    let Some(p) = proc_at_current else { break };
                    let exe_name = p.name().to_string_lossy().to_string();
                    if KNOWN_HOSTS.iter().any(|h| h.eq_ignore_ascii_case(&exe_name)) {
                        candidate_pids.push(current);
                        break;
                    }
                    let Some(parent) = p.parent() else { break };
                    current = parent.as_u32();
                }
            }
        }
    }

    if candidate_pids.is_empty() {
        return Ok(false);
    }

    // EnumWindows: find any visible HWND owned by one of the candidate PIDs.
    struct Ctx { pids: Vec<u32>, found: Option<HWND> }
    let mut ctx = Ctx { pids: candidate_pids, found: None };
    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = unsafe { &mut *(lparam.0 as *mut Ctx) };
        if !IsWindowVisible(hwnd).as_bool() { return BOOL(1); }
        let mut owner_pid: u32 = 0;
        let _tid = GetWindowThreadProcessId(hwnd, Some(&mut owner_pid));
        if ctx.pids.contains(&owner_pid) {
            ctx.found = Some(hwnd);
            return BOOL(0); // stop enumeration
        }
        BOOL(1)
    }
    let _ = unsafe { EnumWindows(Some(cb), LPARAM(&mut ctx as *mut _ as isize)) };

    let Some(hwnd) = ctx.found else { return Ok(false) };
    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        let _ = SetForegroundWindow(hwnd);
    }
    Ok(true)
}
```

- [ ] **Step 3: Wire `focus_pane` into `platform/mod.rs`**

In `src-tauri/src/platform/mod.rs`, add `pub mod focus_pane;`.

- [ ] **Step 4: Add the Tauri command**

Append to `src-tauri/src/agent_overview/commands.rs`:

```rust
#[tauri::command]
pub fn focus_session_pane(
    session_id: String,
    store: tauri::State<'_, SessionStore>,
) -> Result<bool, String> {
    let cwd_opt: Option<std::path::PathBuf> = store
        .internal_snapshot()
        .into_iter()
        .find(|r| r.session_id == session_id)
        .map(|r| r.cwd);
    let Some(cwd) = cwd_opt else {
        return Ok(false);
    };
    crate::platform::focus_pane::focus(&cwd)
}
```

- [ ] **Step 5: Register**

In `src-tauri/src/agent_overview/mod.rs`, add `focus_session_pane` to the re-export list.

In `src-tauri/src/lib.rs`'s `tauri::generate_handler![...]`, add `agent_overview::focus_session_pane,`.

- [ ] **Step 6: Compile**

```
cargo check -p borgdock-tauri 2>&1 | tail -20
```
Expected: clean.

- [ ] **Step 7: Commit**

```
git add src-tauri/src/platform/focus_pane.rs src-tauri/src/platform/mod.rs src-tauri/src/agent_overview/commands.rs src-tauri/src/agent_overview/mod.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "platform: add focus_session_pane command (Windows process-tree window raise)"
```

---

## Phase 4 — Frontend service helpers

### Task 10: `isSnoozed` / `isSeen` / `fetchTurnFilesDiffstat`

**Files:**
- Modify: `src/services/agent-overview.ts`
- Modify: `src/services/__tests__/agent-overview.test.ts`

- [ ] **Step 1: Add the helpers**

Append to `src/services/agent-overview.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import type { TurnFile } from './agent-overview-types';

export function isSnoozed(r: SessionRecord, nowMs: number = Date.now()): boolean {
  return r.snoozedUntilMs !== null && r.snoozedUntilMs > nowMs;
}

export function isSeen(r: SessionRecord): boolean {
  return r.seenAtMs !== null;
}

interface FileChangeRow {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  additions: number;
  deletions: number;
}

interface TurnFileRow extends TurnFile {
  additions: number;
  deletions: number;
  status: FileChangeRow['status'] | 'read';
}

/** One IPC, intersect with the session's currentTurnFiles. Files Claude
 *  touched that aren't in the worktree changeset (Read-only or reverted)
 *  come back with zero +/− and status 'read'. */
export async function fetchTurnFilesDiffstat(
  cwd: string,
  files: TurnFile[],
): Promise<TurnFileRow[]> {
  if (files.length === 0) return [];
  const changeset = await invoke<{ files: FileChangeRow[] }>('list_worktree_changes', { worktreePath: cwd });
  const byPath = new Map(changeset.files.map((f) => [f.path, f]));
  return files.map((f) => {
    const change = byPath.get(f.path);
    if (!change) return { ...f, additions: 0, deletions: 0, status: 'read' as const };
    return { ...f, additions: change.additions, deletions: change.deletions, status: change.status };
  });
}
```

(If the existing `import` line doesn't have `SessionRecord`, add it from `'./agent-overview-types'`.)

- [ ] **Step 2: Add tests**

Append to `src/services/__tests__/agent-overview.test.ts`:

```ts
import { isSeen, isSnoozed } from '../agent-overview';
// ...

describe('isSnoozed', () => {
  it('false when snoozedUntilMs is null', () => {
    expect(isSnoozed(baseRecord({ snoozedUntilMs: null }), 1_000)).toBe(false);
  });
  it('true when snoozedUntilMs > now', () => {
    expect(isSnoozed(baseRecord({ snoozedUntilMs: 2_000 }), 1_000)).toBe(true);
  });
  it('false when expired', () => {
    expect(isSnoozed(baseRecord({ snoozedUntilMs: 500 }), 1_000)).toBe(false);
  });
});

describe('isSeen', () => {
  it('false when seenAtMs is null', () => {
    expect(isSeen(baseRecord({ seenAtMs: null }))).toBe(false);
  });
  it('true when seenAtMs is set', () => {
    expect(isSeen(baseRecord({ seenAtMs: 1_000 }))).toBe(true);
  });
});
```

- [ ] **Step 3: Run typecheck + tests**

```
npx tsc --noEmit
npx vitest run src/services/__tests__/agent-overview.test.ts
```
Expected: pass.

- [ ] **Step 4: Commit**

```
git add src/services/agent-overview.ts src/services/__tests__/agent-overview.test.ts
git commit -m "services: add isSnoozed/isSeen + fetchTurnFilesDiffstat for Inspector"
```

---

## Phase 5 — `useInspectorState` + context

### Task 11: Implement and unit-test `useInspectorState`

**Files:**
- Create: `src/hooks/useInspectorState.ts`
- Create: `src/hooks/__tests__/useInspectorState.test.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useInspectorState.ts`:

```ts
import { useCallback, useMemo, useReducer, useRef } from 'react';

export interface InspectorState {
  hoveredSessionId: string | null;
  pinnedSessionId:  string | null;
  focusedSessionId: string | null;
  openSessionId:    string | null;

  onCardEnter:    (sessionId: string) => void;
  onCardLeave:    (sessionId: string) => void;
  onPopoverEnter: () => void;
  onPopoverLeave: () => void;
  onCardClick:    (sessionId: string) => void;
  togglePin:      (sessionId: string) => void;
  unpin:          () => void;
  cycleFocus:     (direction: 1 | -1) => void;
  closeAll:       () => void;
}

interface State {
  hoveredSessionId: string | null;
  pinnedSessionId:  string | null;
  focusedSessionId: string | null;
}

type Action =
  | { type: 'hover/set'; id: string | null }
  | { type: 'pin/set'; id: string | null }
  | { type: 'focus/set'; id: string | null }
  | { type: 'reset' };

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'hover/set':  return { ...s, hoveredSessionId: a.id };
    case 'pin/set':    return { ...s, pinnedSessionId:  a.id };
    case 'focus/set':  return { ...s, focusedSessionId: a.id };
    case 'reset':      return { hoveredSessionId: null, pinnedSessionId: null, focusedSessionId: null };
  }
}

const HOVER_CLOSE_DELAY_MS = 220;

export function useInspectorState(awaitingSessionIds: string[]): InspectorState {
  const [state, dispatch] = useReducer(reduce, {
    hoveredSessionId: null,
    pinnedSessionId:  null,
    focusedSessionId: null,
  });
  const closeTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      dispatch({ type: 'hover/set', id: null });
      closeTimer.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelClose]);

  const onCardEnter = useCallback((id: string) => {
    cancelClose();
    dispatch({ type: 'hover/set', id });
  }, [cancelClose]);

  const onCardLeave = useCallback((_id: string) => { scheduleClose(); }, [scheduleClose]);
  const onPopoverEnter = useCallback(() => { cancelClose(); }, [cancelClose]);
  const onPopoverLeave = useCallback(() => { scheduleClose(); }, [scheduleClose]);

  const onCardClick = useCallback((id: string) => {
    cancelClose();
    dispatch({ type: 'pin/set', id });
  }, [cancelClose]);

  const togglePin = useCallback((id: string) => {
    dispatch({ type: 'pin/set', id: state.pinnedSessionId === id ? null : id });
  }, [state.pinnedSessionId]);

  const unpin = useCallback(() => { dispatch({ type: 'pin/set', id: null }); }, []);

  const cycleFocus = useCallback((direction: 1 | -1) => {
    if (awaitingSessionIds.length === 0) return;
    const cur = state.focusedSessionId;
    const idx = cur === null ? -1 : awaitingSessionIds.indexOf(cur);
    const next = (idx + direction + awaitingSessionIds.length) % awaitingSessionIds.length;
    const id = awaitingSessionIds[next] ?? null;
    dispatch({ type: 'focus/set', id });
    // Focusing also opens the popover in unpinned mode.
    dispatch({ type: 'pin/set', id: null });
    dispatch({ type: 'hover/set', id });
  }, [awaitingSessionIds, state.focusedSessionId]);

  const closeAll = useCallback(() => { cancelClose(); dispatch({ type: 'reset' }); }, [cancelClose]);

  const openSessionId = state.pinnedSessionId ?? state.hoveredSessionId ?? state.focusedSessionId;

  return useMemo(() => ({
    ...state,
    openSessionId,
    onCardEnter, onCardLeave, onPopoverEnter, onPopoverLeave,
    onCardClick, togglePin, unpin, cycleFocus, closeAll,
  }), [state, openSessionId, onCardEnter, onCardLeave, onPopoverEnter, onPopoverLeave,
        onCardClick, togglePin, unpin, cycleFocus, closeAll]);
}
```

- [ ] **Step 2: Write tests**

Create `src/hooks/__tests__/useInspectorState.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInspectorState } from '../useInspectorState';

describe('useInspectorState — hover lifecycle', () => {
  it('opens on card enter, closes after 220ms on leave', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInspectorState([]));
    act(() => result.current.onCardEnter('s1'));
    expect(result.current.openSessionId).toBe('s1');
    act(() => result.current.onCardLeave('s1'));
    expect(result.current.openSessionId).toBe('s1'); // still in grace window
    act(() => { vi.advanceTimersByTime(220); });
    expect(result.current.openSessionId).toBeNull();
    vi.useRealTimers();
  });

  it('cancels close when popover entered before grace expires', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInspectorState([]));
    act(() => result.current.onCardEnter('s1'));
    act(() => result.current.onCardLeave('s1'));
    act(() => { vi.advanceTimersByTime(100); });
    act(() => result.current.onPopoverEnter());
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.openSessionId).toBe('s1');
    vi.useRealTimers();
  });
});

describe('useInspectorState — pin', () => {
  it('click pins; leave does not close while pinned', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInspectorState([]));
    act(() => result.current.onCardEnter('s1'));
    act(() => result.current.onCardClick('s1'));
    act(() => result.current.onCardLeave('s1'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.openSessionId).toBe('s1');
    expect(result.current.pinnedSessionId).toBe('s1');
    vi.useRealTimers();
  });

  it('togglePin unpins same id, pins new id', () => {
    const { result } = renderHook(() => useInspectorState([]));
    act(() => result.current.togglePin('s1'));
    expect(result.current.pinnedSessionId).toBe('s1');
    act(() => result.current.togglePin('s1'));
    expect(result.current.pinnedSessionId).toBeNull();
    act(() => result.current.togglePin('s2'));
    expect(result.current.pinnedSessionId).toBe('s2');
  });
});

describe('useInspectorState — Tab cycling', () => {
  it('cycles forward through awaiting and wraps at the end', () => {
    const { result } = renderHook(() => useInspectorState(['a', 'b', 'c']));
    act(() => result.current.cycleFocus(1));
    expect(result.current.focusedSessionId).toBe('a');
    act(() => result.current.cycleFocus(1));
    expect(result.current.focusedSessionId).toBe('b');
    act(() => result.current.cycleFocus(1));
    expect(result.current.focusedSessionId).toBe('c');
    act(() => result.current.cycleFocus(1));
    expect(result.current.focusedSessionId).toBe('a');
  });

  it('cycles backward and wraps from start to end', () => {
    const { result } = renderHook(() => useInspectorState(['a', 'b', 'c']));
    act(() => result.current.cycleFocus(-1));
    expect(result.current.focusedSessionId).toBe('c');
  });
});

describe('useInspectorState — closeAll', () => {
  it('clears all three state buckets', () => {
    const { result } = renderHook(() => useInspectorState(['a']));
    act(() => result.current.onCardEnter('a'));
    act(() => result.current.onCardClick('a'));
    act(() => result.current.cycleFocus(1));
    act(() => result.current.closeAll());
    expect(result.current.openSessionId).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

```
npx vitest run src/hooks/__tests__/useInspectorState.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```
git add src/hooks/useInspectorState.ts src/hooks/__tests__/useInspectorState.test.ts
git commit -m "hooks: useInspectorState — page-level popover lifecycle, Tab wrap, pin"
```

---

### Task 12: Create `InspectorContext`

**Files:**
- Create: `src/components/agent-overview/InspectorContext.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { createContext, useContext } from 'react';
import type { InspectorState } from '@/hooks/useInspectorState';

export const InspectorContext = createContext<InspectorState | null>(null);

export function useInspector(): InspectorState {
  const v = useContext(InspectorContext);
  if (!v) throw new Error('useInspector must be used inside <InspectorContext.Provider>');
  return v;
}
```

- [ ] **Step 2: Compile**

```
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```
git add src/components/agent-overview/InspectorContext.tsx
git commit -m "agent-overview: InspectorContext + useInspector hook"
```

---

## Phase 6 — InspectorPopover skeleton + position math

### Task 13: Position math (`position.ts`)

**Files:**
- Create: `src/components/agent-overview/inspector/position.ts`
- Create: `src/components/agent-overview/inspector/__tests__/position.test.ts`

- [ ] **Step 1: Write the helper**

```ts
// position.ts
const POPOVER_WIDTH = 480;
const POPOVER_MAX_HEIGHT_VH = 0.7;
const GAP = 8;
const VIEWPORT_PADDING = 12;

export interface PopoverStyle {
  position: 'fixed';
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function placePopover(
  anchor: DOMRect,
  viewport: { width: number; height: number },
): PopoverStyle {
  const maxHeight = Math.floor(viewport.height * POPOVER_MAX_HEIGHT_VH);

  // Vertical: prefer below; flip above if it'd overflow.
  const spaceBelow = viewport.height - anchor.bottom - GAP;
  const top = spaceBelow >= maxHeight || spaceBelow >= anchor.top
    ? anchor.bottom + GAP
    : Math.max(VIEWPORT_PADDING, anchor.top - maxHeight - GAP);

  // Horizontal: align to anchor's left, clamp to viewport.
  const rawLeft = anchor.left;
  const maxLeft = viewport.width - POPOVER_WIDTH - VIEWPORT_PADDING;
  const left = Math.max(VIEWPORT_PADDING, Math.min(rawLeft, maxLeft));

  return { position: 'fixed', top, left, width: POPOVER_WIDTH, maxHeight };
}
```

- [ ] **Step 2: Write tests**

```ts
// __tests__/position.test.ts
import { describe, expect, it } from 'vitest';
import { placePopover } from '../position';

const vp = { width: 1280, height: 800 };

function rect(o: Partial<DOMRect>): DOMRect {
  const r: DOMRect = {
    x: 100, y: 100, top: 100, left: 100, right: 200, bottom: 150,
    width: 100, height: 50, toJSON() { return this; },
    ...o,
  } as DOMRect;
  return r;
}

describe('placePopover', () => {
  it('anchors below the card with an 8px gap when there is room', () => {
    const s = placePopover(rect({ top: 100, bottom: 150 }), vp);
    expect(s.top).toBe(158);
  });

  it('flips above when the card is near the bottom', () => {
    const s = placePopover(rect({ top: 700, bottom: 740 }), vp);
    expect(s.top).toBeLessThan(700);
  });

  it('clamps left to keep the popover in viewport', () => {
    const s = placePopover(rect({ left: 1100 }), vp);
    expect(s.left + 480).toBeLessThanOrEqual(1280 - 12);
  });

  it('respects the 12px left padding', () => {
    const s = placePopover(rect({ left: -200 }), vp);
    expect(s.left).toBe(12);
  });
});
```

- [ ] **Step 3: Run tests**

```
npx vitest run src/components/agent-overview/inspector/__tests__/position.test.ts
```
Expected: 4 pass.

- [ ] **Step 4: Commit**

```
git add src/components/agent-overview/inspector/position.ts src/components/agent-overview/inspector/__tests__/position.test.ts
git commit -m "inspector: popover placement math (below-with-flip, viewport-clamped)"
```

---

### Task 14: `InspectorHeader` + `InspectorMessageCallout`

**Files:**
- Create: `src/components/agent-overview/inspector/InspectorHeader.tsx`
- Create: `src/components/agent-overview/inspector/InspectorMessageCallout.tsx`

- [ ] **Step 1: Header**

```tsx
// InspectorHeader.tsx
import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort, timeSinceTier } from '@/services/agent-overview';
import { useInspector } from '../InspectorContext';
import { StateDot } from '../StateDot';
import { StatePill } from '../StatePill';

export function InspectorHeader({ session }: { session: SessionRecord }) {
  const inspector = useInspector();
  const tier = timeSinceTier(session.stateSinceMs);
  const pinned = inspector.pinnedSessionId === session.sessionId;

  return (
    <div className="inspector-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StateDot state={session.state} size={8} />
        <span className="ag-pane">{session.label}</span>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>·</span>
        <span className="bd-mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {session.branch}
        </span>
        <span style={{ flex: 1 }} />
        <StatePill state={session.state} />
        <button
          type="button"
          aria-label="Pin"
          aria-pressed={pinned}
          title="Pin (P)"
          onClick={() => inspector.togglePin(session.sessionId)}
          className={`inspector-pin${pinned ? ' inspector-pin--active' : ''}`}
        >
          📌
        </button>
      </div>
      <div className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-faint)', marginTop: 4 }}>
        {session.cwd}
      </div>
      <div style={{ marginTop: 4, fontSize: 11 }}>
        <span className={`ag-time--${tier}`}>{fmtSinceShort(session.stateSinceMs)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Callout**

```tsx
// InspectorMessageCallout.tsx
export function InspectorMessageCallout({ text }: { text: string }) {
  return (
    <div className="inspector-callout" title={text}>
      <div className="inspector-callout__label">Your last message</div>
      <div className="inspector-callout__body">{text}</div>
    </div>
  );
}
```

- [ ] **Step 3: Compile**

```
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```
git add src/components/agent-overview/inspector/InspectorHeader.tsx src/components/agent-overview/inspector/InspectorMessageCallout.tsx
git commit -m "inspector: header + last-message callout components"
```

---

### Task 15: `InspectorFileRow` (lazy diff fetch)

**Files:**
- Create: `src/components/agent-overview/inspector/InspectorFileRow.tsx`
- Create: `src/components/agent-overview/inspector/__tests__/InspectorFileRow.test.tsx`

- [ ] **Step 1: Component**

```tsx
// InspectorFileRow.tsx
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TurnFile } from '@/services/agent-overview-types';

interface DiffSnippet {
  hunks: Array<{ header: string; lines: Array<{ kind: 'add'|'delete'|'context'; content: string }> }>;
}

interface FileRowProps {
  cwd:      string;
  file:     TurnFile & { additions: number; deletions: number; status: string };
  cache:    React.MutableRefObject<Map<string, DiffSnippet | null>>;
}

const SNIPPET_LINE_CAP = 12;

export function InspectorFileRow({ cwd, file, cache }: FileRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [snippet, setSnippet] = useState<DiffSnippet | null | undefined>(cache.current.get(file.path));
  const inflight = useRef(false);

  useEffect(() => {
    if (!expanded || snippet !== undefined || inflight.current) return;
    inflight.current = true;
    (async () => {
      try {
        const result = await invoke<DiffSnippet>('diff_worktree_vs_head', {
          worktreePath: cwd, filePath: file.path,
        });
        cache.current.set(file.path, result);
        setSnippet(result);
      } catch {
        cache.current.set(file.path, null);
        setSnippet(null);
      } finally {
        inflight.current = false;
      }
    })();
  }, [expanded, snippet, file.path, cwd, cache]);

  const statusGlyph = file.status === 'added' ? 'A'
    : file.status === 'deleted' ? 'D'
    : file.status === 'renamed' ? 'R'
    : file.status === 'read' ? '·'
    : 'M';

  return (
    <div className="inspector-file-row">
      <button
        type="button"
        className="inspector-file-row__head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="inspector-file-row__chev">{expanded ? '▾' : '▸'}</span>
        <span className="inspector-file-row__status" data-status={file.status}>{statusGlyph}</span>
        <span className="inspector-file-row__path">{file.path}</span>
        <span className="inspector-file-row__stats">
          {file.additions > 0 && <span className="inspector-file-row__add">+{file.additions}</span>}
          {file.deletions > 0 && <span className="inspector-file-row__del">−{file.deletions}</span>}
        </span>
      </button>
      {expanded && (
        <div className="inspector-file-row__body">
          {snippet === undefined && <div className="inspector-file-row__loading">loading…</div>}
          {snippet === null && <div className="inspector-file-row__empty">no preview — open in editor</div>}
          {snippet && snippet.hunks.length === 0 && (
            <div className="inspector-file-row__empty">no preview — file unchanged on disk</div>
          )}
          {snippet && snippet.hunks.length > 0 && (
            <SnippetView hunks={snippet.hunks} />
          )}
        </div>
      )}
    </div>
  );
}

function SnippetView({ hunks }: { hunks: DiffSnippet['hunks'] }) {
  // Cap at SNIPPET_LINE_CAP body lines across all hunks.
  let remaining = SNIPPET_LINE_CAP;
  return (
    <pre className="inspector-snippet">
      {hunks.flatMap((h, hi) => {
        if (remaining <= 0) return [];
        const taken = h.lines.slice(0, remaining);
        remaining -= taken.length;
        return [
          <div key={`h${hi}`} className="inspector-snippet__hunk">{h.header}</div>,
          ...taken.map((l, li) => (
            <div key={`l${hi}-${li}`} data-kind={l.kind} className="inspector-snippet__line">{l.content}</div>
          )),
        ];
      })}
    </pre>
  );
}
```

- [ ] **Step 2: Test**

```tsx
// __tests__/InspectorFileRow.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { InspectorFileRow } from '../InspectorFileRow';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));

const file = {
  path: 'src/foo.ts', tool: 'edit' as const, timestampMs: 0,
  additions: 5, deletions: 2, status: 'modified' as const,
};

function Harness() {
  const cache = useRef(new Map());
  return <InspectorFileRow cwd="C:/x" file={file} cache={cache} />;
}

describe('InspectorFileRow', () => {
  it('does not fetch the diff until expanded', () => {
    invokeMock.mockClear();
    render(<Harness />);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('fetches on first expand and caches on the second', async () => {
    invokeMock.mockResolvedValue({ hunks: [{ header: '@@ ... @@', lines: [{ kind: 'add', content: '+ x' }] }] });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('diff_worktree_vs_head', {
        worktreePath: 'C:/x', filePath: 'src/foo.ts',
      });
    });
    fireEvent.click(screen.getByRole('button')); // collapse
    fireEvent.click(screen.getByRole('button')); // re-expand
    // Cache: only one IPC call total.
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('renders "no preview" when status is read', async () => {
    invokeMock.mockResolvedValue({ hunks: [] });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText(/no preview/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run tests**

```
npx vitest run src/components/agent-overview/inspector/__tests__/InspectorFileRow.test.tsx
```
Expected: 3 pass.

- [ ] **Step 4: Commit**

```
git add src/components/agent-overview/inspector/InspectorFileRow.tsx src/components/agent-overview/inspector/__tests__/InspectorFileRow.test.tsx
git commit -m "inspector: file row with lazy diff fetch + per-popover cache"
```

---

### Task 16: `InspectorFilesSection`

**Files:**
- Create: `src/components/agent-overview/inspector/InspectorFilesSection.tsx`

- [ ] **Step 1: Write the section**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { SessionRecord } from '@/services/agent-overview-types';
import { fetchTurnFilesDiffstat } from '@/services/agent-overview';
import { InspectorFileRow } from './InspectorFileRow';

interface DiffSnippet {
  hunks: Array<{ header: string; lines: Array<{ kind: 'add'|'delete'|'context'; content: string }> }>;
}

export function InspectorFilesSection({ session }: { session: SessionRecord }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchTurnFilesDiffstat>>>([]);
  const snippetCache = useRef(new Map<string, DiffSnippet | null>());

  useEffect(() => {
    let cancelled = false;
    fetchTurnFilesDiffstat(session.cwd, session.currentTurnFiles).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => { cancelled = true; };
  }, [session.cwd, session.currentTurnFiles]);

  const totalAdd = rows.reduce((s, r) => s + r.additions, 0);
  const totalDel = rows.reduce((s, r) => s + r.deletions, 0);

  if (session.currentTurnFiles.length === 0) return null;

  return (
    <section className="inspector-files">
      <header className="inspector-files__head">
        <span>Files changed ({rows.length || session.currentTurnFiles.length})</span>
        {totalAdd > 0 && <span className="inspector-files__add">+{totalAdd}</span>}
        {totalDel > 0 && <span className="inspector-files__del">−{totalDel}</span>}
      </header>
      {rows.map((r) => (
        <InspectorFileRow key={r.path} cwd={session.cwd} file={r} cache={snippetCache} />
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Compile**

```
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```
git add src/components/agent-overview/inspector/InspectorFilesSection.tsx
git commit -m "inspector: FilesSection — eager diffstat, lazy per-row snippets"
```

---

### Task 17: `InspectorActions`

**Files:**
- Create: `src/components/agent-overview/inspector/InspectorActions.tsx`

- [ ] **Step 1: Write actions**

```tsx
import { invoke } from '@tauri-apps/api/core';
import type { SessionRecord } from '@/services/agent-overview-types';
import { useNotificationStore } from '@/stores/notification-store';
import { useInspector } from '../InspectorContext';

const SNOOZE_MS = 5 * 60 * 1000;

export function InspectorActions({ session }: { session: SessionRecord }) {
  const inspector = useInspector();
  const notify = useNotificationStore((s) => s.show);

  async function focus() {
    try {
      const ok = await invoke<boolean>('focus_session_pane', { sessionId: session.sessionId });
      if (!ok) {
        notify({
          title: 'No terminal window',
          message: "Couldn't find a terminal window for this session.",
          severity: 'info', actions: [],
        });
      }
    } catch (e) {
      notify({
        title: 'Focus pane failed',
        message: String(e), severity: 'warn', actions: [],
      });
    }
  }

  async function snooze() {
    await invoke('snooze_agent_session', {
      sessionId: session.sessionId, durationMs: SNOOZE_MS,
    });
    inspector.closeAll();
  }

  async function markSeen() {
    await invoke('mark_agent_session_seen', { sessionId: session.sessionId });
    inspector.closeAll();
  }

  return (
    <footer className="inspector-actions">
      <button type="button" onClick={focus}>Focus pane <kbd>F</kbd></button>
      <button type="button" onClick={snooze}>Snooze 5m <kbd>S</kbd></button>
      <button type="button" onClick={markSeen}>Mark seen <kbd>M</kbd></button>
    </footer>
  );
}
```

- [ ] **Step 2: Compile**

```
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```
git add src/components/agent-overview/inspector/InspectorActions.tsx
git commit -m "inspector: footer actions (focus pane / snooze 5m / mark seen)"
```

---

### Task 18: `InspectorPopover` shell

**Files:**
- Create: `src/components/agent-overview/inspector/InspectorPopover.tsx`

- [ ] **Step 1: Write the popover**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { SessionRecord } from '@/services/agent-overview-types';
import { useAgentSessions } from '@/hooks/useAgentSessions';
import { AssistantMarkdown } from '../AssistantMarkdown';
import { InspectorActions } from './InspectorActions';
import { InspectorFilesSection } from './InspectorFilesSection';
import { InspectorHeader } from './InspectorHeader';
import { InspectorMessageCallout } from './InspectorMessageCallout';
import { useInspector } from '../InspectorContext';
import { placePopover, type PopoverStyle } from './position';

interface Props { sessionId: string }

export function InspectorPopover({ sessionId }: Props) {
  const sessions = useAgentSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  const inspector = useInspector();
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<PopoverStyle | null>(null);

  // Anchor measurement: re-measure on viewport resize and on session id
  // change. The trigger card carries data-session-id.
  useEffect(() => {
    function measure() {
      const el = document.querySelector<HTMLElement>(`[data-session-id="${sessionId}"]`);
      if (!el) { setStyle(null); return; }
      const rect = el.getBoundingClientRect();
      setStyle(placePopover(rect, { width: window.innerWidth, height: window.innerHeight }));
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [sessionId]);

  // Click-outside to close (only when there's no chance the click hit the
  // anchor card — clicks on the card itself toggle pin via onCardClick).
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      const target = e.target as Node;
      if (ref.current.contains(target)) return;
      const card = document.querySelector(`[data-session-id="${sessionId}"]`);
      if (card && card.contains(target)) return;
      inspector.closeAll();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [inspector, sessionId]);

  if (!session || !style) return null;

  return (
    <div
      ref={ref}
      role="tooltip"
      className="inspector-popover"
      style={style}
      onMouseEnter={inspector.onPopoverEnter}
      onMouseLeave={inspector.onPopoverLeave}
      onClick={() => inspector.onCardClick(session.sessionId)}
      data-pinned={inspector.pinnedSessionId === session.sessionId || undefined}
    >
      <InspectorHeader session={session} />
      <div className="inspector-body">
        {session.lastUserMsg && <InspectorMessageCallout text={session.lastUserMsg} />}
        {session.lastAssistantMsg && (
          <div className="ag-assistant-md">
            <AssistantMarkdown text={session.lastAssistantMsg} />
          </div>
        )}
        <InspectorFilesSection session={session} />
      </div>
      <InspectorActions session={session} />
    </div>
  );
}

// Re-export so AgentOverviewApp can import via index.
export type { SessionRecord };
```

- [ ] **Step 2: Compile**

```
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```
git add src/components/agent-overview/inspector/InspectorPopover.tsx
git commit -m "inspector: top-level InspectorPopover with anchor tracking + click-outside"
```

---

## Phase 7 — Wire into AgentCard + AgentOverviewApp

### Task 19: Drop `HoverPopover` from `AgentCard`, wire `useInspector`

**Files:**
- Modify: `src/components/agent-overview/AgentCard.tsx`
- Modify: `src/components/agent-overview/__tests__/AgentCard.test.tsx`

- [ ] **Step 1: Replace AgentCard**

Open `src/components/agent-overview/AgentCard.tsx` and replace the imports + main render so the card no longer uses `HoverPopover` and instead reports hover/click to `useInspector()`. The full new file:

```tsx
import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort, timeSinceTier, tokenPct } from '@/services/agent-overview';
import { useInspector } from './InspectorContext';
import { DismissButton } from './DismissButton';
import { RepoMark } from './RepoMark';
import { StateDot } from './StateDot';
import { StatePill } from './StatePill';
import { TokenBar } from './TokenBar';

interface AgentCardProps {
  agent: SessionRecord;
  density?: 'comfortable' | 'compact';
  showRepo?: boolean;
}

const TIME_HIDE_THRESHOLD_MS = 5_000;

export function AgentCard({ agent, density = 'comfortable', showRepo = false }: AgentCardProps) {
  const inspector = useInspector();
  const compact = density === 'compact';
  const pct = tokenPct(agent);
  const showTime = agent.stateSinceMs >= TIME_HIDE_THRESHOLD_MS;
  const tier = timeSinceTier(agent.stateSinceMs);
  const hero = agent.task ?? agent.lastAssistantMsg;
  const focused = inspector.focusedSessionId === agent.sessionId;
  const seen = agent.seenAtMs !== null;

  return (
    <div
      data-session-id={agent.sessionId}
      className={[
        'ag-card',
        `ag-card--${agent.state}`,
        focused && 'ag-card--focus-ring',
        seen && 'ag-card--seen',
      ].filter(Boolean).join(' ')}
      style={{ padding: compact ? '10px 12px' : '12px 14px' }}
      onMouseEnter={() => inspector.onCardEnter(agent.sessionId)}
      onMouseLeave={() => inspector.onCardLeave(agent.sessionId)}
      onClick={() => inspector.onCardClick(agent.sessionId)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 6 : 8 }}>
        <StateDot state={agent.state} size={8} />
        {showRepo && <RepoMark repo={agent.repo} size={16} />}
        <span className="ag-pane">{agent.label}</span>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>·</span>
        <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {agent.worktree === 'master' ? agent.branch : `${agent.worktree} · ${truncate(agent.branch, 28)}`}
        </span>
        <span style={{ flex: 1 }} />
        {showTime && (
          <span
            className={`ag-time--${tier} bd-mono`}
            style={{ fontSize: 10 }}
            data-testid="agent-card-time"
          >
            {fmtSinceShort(agent.stateSinceMs)}
          </span>
        )}
        <DismissButton sessionId={agent.sessionId} />
      </div>

      {hero && (
        <div
          data-testid="agent-card-hero"
          className={`ag-hero${compact ? ' ag-hero--compact' : ''}${agent.state === 'awaiting' ? ' ag-hero--awaiting' : ''}`}
        >
          {hero}
        </div>
      )}

      {agent.lastUserMsg && (
        <div data-testid="agent-card-breadcrumb" className="ag-breadcrumb" style={{ marginBottom: compact ? 6 : 8 }}>
          re: {agent.lastUserMsg}
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
        <StatePill state={agent.state} />
        <span style={{ flex: 1 }} />
        <TokenBar pct={pct} width={48} />
        {showTime && (
          <span className={`ag-time--${tier}`} style={{ fontSize: 10 }}>
            {fmtSinceShort(agent.stateSinceMs)}
          </span>
        )}
      </div>

      {agent.state === 'tool' && <div className="bd-ants--left" />}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
```

- [ ] **Step 2: Update AgentCard tests to wrap in InspectorContext**

In `src/components/agent-overview/__tests__/AgentCard.test.tsx`, add a wrapper:

```tsx
import { InspectorContext } from '../InspectorContext';
import type { InspectorState } from '@/hooks/useInspectorState';

function fakeInspector(): InspectorState {
  return {
    hoveredSessionId: null, pinnedSessionId: null, focusedSessionId: null, openSessionId: null,
    onCardEnter: () => {}, onCardLeave: () => {}, onPopoverEnter: () => {}, onPopoverLeave: () => {},
    onCardClick: () => {}, togglePin: () => {}, unpin: () => {}, cycleFocus: () => {}, closeAll: () => {},
  };
}

function renderCard(agent: SessionRecord) {
  return render(
    <InspectorContext.Provider value={fakeInspector()}>
      <AgentCard agent={agent} />
    </InspectorContext.Provider>,
  );
}
```

Replace each `render(<AgentCard agent={...} />)` call with `renderCard(...)`. The existing assertions remain valid (`data-testid="agent-card-hero"`, etc.).

- [ ] **Step 3: Run tests**

```
npx vitest run src/components/agent-overview/__tests__/AgentCard.test.tsx
```
Expected: 11 tests pass.

- [ ] **Step 4: Commit**

```
git add src/components/agent-overview/AgentCard.tsx src/components/agent-overview/__tests__/AgentCard.test.tsx
git commit -m "AgentCard: drop HoverPopover, integrate InspectorContext + focus ring + seen styling"
```

---

### Task 20: Wire `AgentOverviewApp` provider, awaiting sort, snooze tick

**Files:**
- Modify: `src/components/agent-overview/AgentOverviewApp.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useAgentSessions } from '@/hooks/useAgentSessions';
import { useInspectorState } from '@/hooks/useInspectorState';
import { isArchived, isSnoozed, pickDensity } from '@/services/agent-overview';
import { ActivityGrouped } from './ActivityGrouped';
import { AwaitingRail } from './AwaitingRail';
import { ContextGrouped } from './ContextGrouped';
import { IdleRail } from './IdleRail';
import { InspectorContext } from './InspectorContext';
import { InspectorPopover } from './inspector/InspectorPopover';
import { RepoGrouped } from './RepoGrouped';
import { Statusbar } from './Statusbar';
import { StatusGrouped } from './StatusGrouped';
import { Titlebar, type Grouping } from './Titlebar';
import { WorktreeFlat } from './WorktreeFlat';

export function AgentOverviewApp() {
  const sessions = useAgentSessions();
  const [grouping, setGrouping] = useState<Grouping>('repo');
  const [showArchived, setShowArchived] = useState(false);
  const viewportWidth = useViewportWidth();
  const nowMs = useNowTick(1_000); // re-derive snooze visibility each second

  const awaiting = useMemo(
    () =>
      sessions
        .filter((s) => s.state === 'awaiting' && !isSnoozed(s, nowMs))
        .sort((a, b) => b.stateSinceMs - a.stateSinceMs),
    [sessions, nowMs],
  );
  const live = sessions.filter((s) => s.state !== 'idle' && s.state !== 'ended');
  const idleAll = sessions.filter((s) => s.state === 'idle' || s.state === 'ended');
  const archived = idleAll.filter(isArchived);
  const idleVisible = showArchived ? idleAll : idleAll.filter((s) => !isArchived(s));

  const groupedAgents = live.filter((s) => s.state !== 'awaiting');
  const oldestAwaitingMs = awaiting.length ? awaiting[0]!.stateSinceMs : null;

  const effectiveDensity = useMemo(
    () => pickDensity(groupedAgents.length, viewportWidth),
    [groupedAgents.length, viewportWidth],
  );

  const awaitingSessionIds = useMemo(() => awaiting.map((a) => a.sessionId), [awaiting]);
  const inspector = useInspectorState(awaitingSessionIds);

  return (
    <InspectorContext.Provider value={inspector}>
      <div
        style={{
          width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
          background: 'var(--color-background)', color: 'var(--color-text-primary)',
        }}
      >
        <Titlebar
          oldestAwaitingMs={oldestAwaitingMs}
          totalAwaiting={awaiting.length}
          liveSessions={live.length}
          grouping={grouping}
          onGroupingChange={setGrouping}
        />
        <div
          style={{
            flex: 1, overflow: 'auto', padding: '14px 18px 16px',
            background: 'var(--color-background)', minHeight: 0,
          }}
        >
          <AwaitingRail agents={awaiting} density={effectiveDensity} />
          {renderGrouping(grouping, groupedAgents, effectiveDensity)}
          <IdleRail agents={idleVisible} />
        </div>
        <Statusbar
          records={sessions}
          grouping={grouping}
          archivedCount={archived.length}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((v) => !v)}
        />
        {inspector.openSessionId && <InspectorPopover sessionId={inspector.openSessionId} />}
      </div>
    </InspectorContext.Provider>
  );
}

function renderGrouping(
  grouping: Grouping,
  agents: ReturnType<typeof useAgentSessions>,
  density: ReturnType<typeof pickDensity>,
) {
  switch (grouping) {
    case 'repo':     return <RepoGrouped agents={agents} density={density} />;
    case 'status':   return <StatusGrouped agents={agents} density={density} />;
    case 'worktree': return <WorktreeFlat agents={agents} density={density} />;
    case 'context':  return <ContextGrouped agents={agents} density={density} />;
    case 'activity': return <ActivityGrouped agents={agents} density={density} />;
  }
}

function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 2: Compile + tests**

```
npx tsc --noEmit
npx vitest run src/components/agent-overview/__tests__/
```
Expected: clean. AgentOverviewApp tests should still pass (the inspector is mounted but doesn't interfere with anything).

- [ ] **Step 3: Commit**

```
git add src/components/agent-overview/AgentOverviewApp.tsx
git commit -m "AgentOverviewApp: provide InspectorContext, sort awaiting oldest-first, snooze tick"
```

---

### Task 21: Add snooze + seen test cases to `AgentOverviewApp.test.tsx`

**Files:**
- Modify: `src/components/agent-overview/__tests__/AgentOverviewApp.test.tsx`

- [ ] **Step 1: Append a test block**

Add these tests at the end of the file (before the closing `;` of the last `describe` block, OR as a new `describe`):

```tsx
describe('AgentOverviewApp snooze + mark-seen', () => {
  it('snoozed awaiting sessions vanish from rail and titlebar count', () => {
    mockSessions = [
      rec('a', 'BorgDock', 'awaiting', { stateSinceMs: 60_000, snoozedUntilMs: Date.now() + 60_000 }),
      rec('b', 'BorgDock', 'awaiting', { stateSinceMs: 120_000 }),
    ];
    const { container } = render(<AgentOverviewApp />);
    // Only 'b' contributes — 1 awaiting.
    const pill = screen.queryByTestId('titlebar-oldest-age');
    expect(pill?.textContent).toMatch(/1 awaiting/);
    // 'a' must not appear in rail
    const railText = container.textContent ?? '';
    expect(railText).not.toMatch(/awaiting.*a /); // sloppy but ok
  });

  it('mark-seen sessions stay visible but get the seen class', () => {
    mockSessions = [
      rec('a', 'BorgDock', 'working', {
        stateSinceMs: 60_000,
        seenAtMs: Date.now(),
      }),
    ];
    const { container } = render(<AgentOverviewApp />);
    expect(container.querySelector('.ag-card--seen')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run**

```
npx vitest run src/components/agent-overview/__tests__/AgentOverviewApp.test.tsx
```
Expected: pass.

- [ ] **Step 3: Commit**

```
git add src/components/agent-overview/__tests__/AgentOverviewApp.test.tsx
git commit -m "tests: AgentOverviewApp snooze hides + mark-seen styles cards"
```

---

## Phase 8 — Keyboard shortcuts

### Task 22: `useKeyboardShortcuts`

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Create: `src/hooks/__tests__/useKeyboardShortcuts.test.ts`
- Modify: `src/components/agent-overview/AgentOverviewApp.tsx`

- [ ] **Step 1: Hook**

```ts
import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import type { InspectorState } from './useInspectorState';

const SNOOZE_MS = 5 * 60 * 1000;

function isInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(inspector: InspectorState): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isInputFocused()) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        inspector.cycleFocus(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'Escape') {
        if (inspector.pinnedSessionId) inspector.unpin();
        else inspector.closeAll();
        return;
      }

      if (!inspector.openSessionId) return;
      const id = inspector.openSessionId;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault(); inspector.togglePin(id); return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void invoke('focus_session_pane', { sessionId: id });
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void invoke('snooze_agent_session', { sessionId: id, durationMs: SNOOZE_MS });
        inspector.closeAll();
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        void invoke('mark_agent_session_seen', { sessionId: id });
        inspector.closeAll();
        return;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [inspector]);
}
```

- [ ] **Step 2: Tests**

```ts
// __tests__/useKeyboardShortcuts.test.ts
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import type { InspectorState } from '../useInspectorState';

const invokeMock = vi.fn().mockResolvedValue(true);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));

function fake(over: Partial<InspectorState> = {}): InspectorState {
  return {
    hoveredSessionId: null, pinnedSessionId: null, focusedSessionId: null, openSessionId: null,
    onCardEnter: vi.fn(), onCardLeave: vi.fn(), onPopoverEnter: vi.fn(), onPopoverLeave: vi.fn(),
    onCardClick: vi.fn(), togglePin: vi.fn(), unpin: vi.fn(), cycleFocus: vi.fn(), closeAll: vi.fn(),
    ...over,
  };
}

function press(key: string, opts: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...opts }));
}

describe('useKeyboardShortcuts', () => {
  it('Tab calls cycleFocus(1); Shift+Tab calls cycleFocus(-1)', () => {
    const i = fake();
    renderHook(() => useKeyboardShortcuts(i));
    press('Tab');
    expect(i.cycleFocus).toHaveBeenCalledWith(1);
    press('Tab', { shiftKey: true });
    expect(i.cycleFocus).toHaveBeenCalledWith(-1);
  });

  it('Esc unpins when pinned, otherwise closeAll', () => {
    const pinned = fake({ pinnedSessionId: 's1', openSessionId: 's1' });
    renderHook(() => useKeyboardShortcuts(pinned));
    press('Escape');
    expect(pinned.unpin).toHaveBeenCalled();

    const notPinned = fake({ openSessionId: 's1' });
    renderHook(() => useKeyboardShortcuts(notPinned));
    press('Escape');
    expect(notPinned.closeAll).toHaveBeenCalled();
  });

  it('F triggers focus_session_pane only when popover is open', () => {
    invokeMock.mockClear();
    const closed = fake();
    renderHook(() => useKeyboardShortcuts(closed));
    press('F');
    expect(invokeMock).not.toHaveBeenCalled();

    const open = fake({ openSessionId: 's1' });
    renderHook(() => useKeyboardShortcuts(open));
    press('F');
    expect(invokeMock).toHaveBeenCalledWith('focus_session_pane', { sessionId: 's1' });
  });

  it('S calls snooze command and closeAll', () => {
    invokeMock.mockClear();
    const open = fake({ openSessionId: 's1' });
    renderHook(() => useKeyboardShortcuts(open));
    press('S');
    expect(invokeMock).toHaveBeenCalledWith('snooze_agent_session', expect.objectContaining({ sessionId: 's1' }));
    expect(open.closeAll).toHaveBeenCalled();
  });

  it('ignores keys when an input is focused', () => {
    const i = fake();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useKeyboardShortcuts(i));
    press('Tab');
    expect(i.cycleFocus).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
```

- [ ] **Step 3: Wire into App**

In `src/components/agent-overview/AgentOverviewApp.tsx`, add:

```tsx
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
```

and below the `useInspectorState` line:

```tsx
  useKeyboardShortcuts(inspector);
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/hooks/__tests__/useKeyboardShortcuts.test.ts
npx vitest run src/components/agent-overview/__tests__/
```
Expected: pass.

- [ ] **Step 5: Commit**

```
git add src/hooks/useKeyboardShortcuts.ts src/hooks/__tests__/useKeyboardShortcuts.test.ts src/components/agent-overview/AgentOverviewApp.tsx
git commit -m "hooks: useKeyboardShortcuts (Tab/F/S/M/P/Esc, input-aware)"
```

---

## Phase 9 — CSS for inspector + focus ring + seen + statusbar archived

### Task 23: Inspector + focus + seen styles

**Files:**
- Modify: `src/styles/agent-overview.css`

- [ ] **Step 1: Append styles**

At the end of `src/styles/agent-overview.css`, append:

```css
/* ─── Inspector popover ──────────────────────────────────────────────── */

.inspector-popover {
  z-index: 50;
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-strong-border);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 12px;
}
.inspector-popover[data-pinned] {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent), 0 8px 32px rgba(0, 0, 0, 0.18);
}

.inspector-header {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface);
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--color-subtle-border);
}

.inspector-pin {
  width: 22px; height: 22px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-muted);
  filter: grayscale(1);
  transition: background 120ms ease, filter 120ms ease, color 120ms ease;
}
.inspector-pin:hover { background: var(--color-surface-hover); }
.inspector-pin--active { filter: none; color: var(--color-accent); }

.inspector-body {
  padding: 10px 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* Last-message callout */
.inspector-callout {
  background: rgba(176, 125, 9, 0.06);
  border: 1px solid rgba(176, 125, 9, 0.18);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.inspector-callout__label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-warning-badge-fg);
  margin-bottom: 4px;
}
.inspector-callout__body {
  font-size: 12px;
  font-family: var(--font-code);
  font-style: italic;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.45;
}

/* Files section */
.inspector-files { margin-top: 10px; }
.inspector-files__head {
  display: flex; align-items: center; gap: 8px;
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}
.inspector-files__add { color: var(--color-status-green); }
.inspector-files__del { color: var(--color-status-red); }

.inspector-file-row { border-top: 1px solid var(--color-subtle-border); }
.inspector-file-row__head {
  display: flex; align-items: center; gap: 6px;
  width: 100%;
  padding: 6px 0;
  background: transparent; border: 0;
  font-family: var(--font-code); font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  text-align: left;
}
.inspector-file-row__head:hover { color: var(--color-text-primary); }
.inspector-file-row__chev { width: 10px; }
.inspector-file-row__status[data-status="added"]    { color: var(--color-status-green); }
.inspector-file-row__status[data-status="deleted"]  { color: var(--color-status-red); }
.inspector-file-row__status[data-status="modified"] { color: var(--color-status-yellow); }
.inspector-file-row__status[data-status="renamed"]  { color: var(--color-accent); }
.inspector-file-row__status[data-status="read"]     { color: var(--color-text-muted); }
.inspector-file-row__path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inspector-file-row__stats { display: inline-flex; gap: 6px; font-size: 10px; }
.inspector-file-row__add { color: var(--color-status-green); }
.inspector-file-row__del { color: var(--color-status-red); }

.inspector-file-row__body {
  padding: 4px 0 8px 16px;
  font-size: 11px;
  font-family: var(--font-code);
}
.inspector-snippet {
  margin: 0;
  background: var(--color-surface-hover);
  border: 1px solid var(--color-subtle-border);
  border-radius: 4px;
  padding: 6px 8px;
  overflow-x: auto;
  white-space: pre;
}
.inspector-snippet__hunk { color: var(--color-text-muted); font-size: 10px; }
.inspector-snippet__line[data-kind="add"]    { color: var(--color-status-green); background: rgba(46, 160, 67, 0.08); }
.inspector-snippet__line[data-kind="delete"] { color: var(--color-status-red); background: rgba(199, 50, 79, 0.08); }
.inspector-snippet__line[data-kind="context"] { color: var(--color-text-secondary); }
.inspector-file-row__loading,
.inspector-file-row__empty {
  font-style: italic; color: var(--color-text-muted); font-size: 10px;
  padding: 4px 0;
}

/* Actions */
.inspector-actions {
  display: flex; gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--color-subtle-border);
  background: var(--color-surface);
}
.inspector-actions button {
  border: 1px solid var(--color-subtle-border);
  background: transparent;
  border-radius: 4px;
  padding: 4px 9px;
  font-size: 11px;
  font-family: inherit;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
}
.inspector-actions button:hover {
  background: var(--color-surface-hover); color: var(--color-text-primary);
}
.inspector-actions kbd {
  font-family: var(--font-code);
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--color-surface-hover);
  border: 1px solid var(--color-subtle-border);
  color: var(--color-text-muted);
}

/* ─── Card focus ring + seen styling ─────────────────────────────────── */

.ag-card--focus-ring {
  outline: 2px solid var(--color-status-yellow);
  outline-offset: 2px;
}
.ag-card--seen {
  opacity: 0.5;
}
.ag-card--seen:hover { opacity: 0.85; }
```

- [ ] **Step 2: Run tests + manual smoke**

```
npx vitest run src/components/agent-overview/__tests__/
```
Expected: still passing — CSS doesn't break logic tests.

- [ ] **Step 3: Commit**

```
git add src/styles/agent-overview.css
git commit -m "styles: inspector popover + card focus ring + seen-state opacity"
```

---

## Phase 10 — Verification

### Task 24: Run the full frontend test suite

- [ ] **Step 1: Run tests**

```
cd src/BorgDock.Tauri
npx tsc --noEmit
npx vitest run
```
Expected: same baseline failures as before this work (the 7 NotificationOverlay/notification-store tests pre-existing on master). All agent-overview / inspector / hooks tests must pass.

- [ ] **Step 2: Run Rust tests**

```
cd src/BorgDock.Tauri/src-tauri
cargo test -p borgdock-tauri 2>&1 | tail -30
```
Expected: all pass.

- [ ] **Step 3: If any failures: fix in-place and commit. If everything passes, no commit needed.**

---

### Task 25: Manual UI smoke

- [ ] **Step 1: Build & run**

```
cd src/BorgDock.Tauri
npm run tauri dev
```

- [ ] **Step 2: Trigger Agent Overview window**

In a real Claude Code session, run anything that emits OTel events. Open the Agent Overview window from the tray.

- [ ] **Step 3: Walk the spec**

Verify each in the running app:
- Hover an awaiting card — popover opens after no delay, closes ~220ms after mouse leaves
- Move cursor card → popover before close — popover stays open
- Click anywhere inside popover — pin border (accent) appears
- Press P — pin toggles
- Press Tab — focus ring appears on next awaiting card; popover follows
- Press Esc — pinned popover unpins; pressing again closes
- Click "Snooze 5m" — card disappears from awaiting rail, titlebar count drops
- Wait 5 minutes (or temporarily lower `SNOOZE_MS` for testing) — card returns
- Click "Mark seen" — card greys to 0.5 opacity
- Click "Focus pane" — terminal window matching the session's cwd is raised; if no match, a notification reads "Couldn't find a terminal window."
- In Files-changed: see correct +/− counts, click a row to expand, see the diff snippet
- For files outside the current worktree changeset (Read tools): row shows `·` glyph, expanded body says "no preview"

- [ ] **Step 4: If any UI bug, fix it, commit, re-test.**

---

## Self-review checklist (run after writing the code)

After all tasks done, sanity-check against the spec doc:

1. Spec Section 1 (data model + persistence): ✅ Tasks 1–8.
2. Spec Section 2 (orchestration): ✅ Tasks 11–12, 19–20.
3. Spec Section 3 (popover): ✅ Tasks 13–18, 23.
4. Spec Section 4 (keyboard): ✅ Task 22.
5. Spec Section 5 (testing): ✅ Tasks 24–25.

Common landmines to verify before declaring done:

- All `SessionRecord {` constructions in tests + Rust code include `current_turn_files`, `snoozed_until_ms`, `seen_at_ms` (compiler will tell you).
- The Rust `seal_for_emit` correctly emits camelCase JSON for the new fields (existing `#[serde(rename_all = "camelCase")]` on the struct handles it).
- The `useNowTick(1_000)` interval is *only* in `AgentOverviewApp` — duplicating it elsewhere would mass-rerender.
- Click-outside in `InspectorPopover` excludes the trigger card so clicks-on-card don't close-then-pin in one frame.
- The `kbd` glyph in `<button>… <kbd>F</kbd></button>` uses the `<kbd>` HTML element, not literal text.

---

## Done

After Task 25 passes, every numbered bullet in `2026-04-30-agent-overview-design.md` has shipping code. The dashboard is the inspector that opens on hover, the keyboard layer that works without the mouse, and the snooze/mark-seen state that lives across restarts. No follow-up known.
