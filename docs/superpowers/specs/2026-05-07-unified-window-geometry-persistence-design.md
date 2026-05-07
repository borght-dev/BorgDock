# Unified Window Geometry Persistence — Design Spec

_Date: 2026-05-07_
_Status: Draft, brainstorming complete, awaiting plan_

## Problem

Today, BorgDock has **four** mechanisms for persisting window geometry across launches, none of them consistent:

1. **Typed `Settings` fields** — `pr_detail.window_state`, `agent_overview.window_state`, and `settings_window` (`platform/window.rs:303-384`, `agent_overview/window.rs:21-77`, `settings/window.rs:31-93`). Each has its own load-on-build / save-on-`CloseRequested` plumbing, plus an HiDPI workaround that re-applies geometry post-build.
2. **localStorage in the renderer** — only SQL (`SqlApp.tsx:43,57-84,191-205`). Saves position via `onMoved`. **Size is not persisted.**
3. **Nothing** — main, file-palette, work-item-palette, worktree-palette, whats-new, file-viewer-*. Every open re-centers.

A previous attempt to standardize via `tauri-plugin-window-state` deadlocked `WebviewWindowBuilder::build()` for non-`main` windows on Tauri 2.11 / wry 0.55.1 and was removed (see commit history around 2026-05-07).

Result: inconsistent UX. Some windows remember where they were, some don't. The SQL window remembers position but loses size. Users can't predict behavior.

## Goal

Every Tauri window in BorgDock — except the tray flyout, which is anchored — saves and restores its geometry across launches via a single shared mechanism:

- **Position** (outer x, y)
- **Size** (outer width, height)
- **Maximized state**

Adding persistence to a new window becomes a one-line call to a single helper.

## Non-goals

- The tray **flyout** is excluded — its position is computed from tray/taskbar anchor math (`platform::window::resize_flyout`), not from saved state.
- **Per-instance** persistence for windows with dynamic labels. `pr-detail-Gomocha-FSP-fsp-horizon-1571` and `pr-detail-OtherRepo-42` share one geometry slot — last-closed wins. (Matches today's `pr_detail.window_state` behavior.)
- **Internal layout state** (SQL rail width, editor split, file-palette roots-collapsed, etc.) stays where it is — already persisted via separate localStorage keys. This spec is only about OS-level window geometry.
- **Migrating existing user data.** Per project memory `project_no_users_yet`, BorgDock is pre-adoption. Existing typed `window_state` fields are deleted, not migrated. New file starts empty; first launch after this lands gives every window default placement once, then persists from there.
- **Cross-monitor heuristics beyond off-screen safety.** No "remember which monitor by serial number" or similar. If the saved (x, y) lands within any currently-connected monitor's bounds, restore it. Otherwise, fall back to centered on the primary monitor.

## Constraints

1. **Tauri 2.11 / wry 0.55.1** is the runtime. The deleted `tauri-plugin-window-state` will not be reintroduced.
2. **Must run on the main GUI thread for window APIs.** `set_position`, `set_size`, `is_maximized`, `available_monitors` all have main-thread affinity on Windows. The helper is called from inside the same `run_on_main_thread` closure that already drives `WebviewWindowBuilder::build()`.
3. **Must not block window creation on disk I/O.** The cache file is read once at app startup, not on every window build.
4. **Must not fight with `settings.json` writes.** A user dragging a window can fire dozens of `Moved` events per second. Routing those through `load_settings_internal` → mutate → `save_settings_internal` would re-serialize the entire `settings.json` on every drag. Geometry gets its own file.

## Architecture

### New module: `platform::window_geometry`

A self-contained module with three pieces:

1. **Persistent store** — a `HashMap<String, Geometry>` keyed by **kind** (see below), backed by a single JSON file `<app_data>/window-geometry.json`. Loaded once at app setup; mutated in-memory thereafter; debounce-flushed to disk.
2. **Tauri-managed state** — a `WindowGeometryStore { map: Mutex<HashMap<String, Geometry>>, dirty: AtomicBool }` registered via `app.manage(...)` so it's accessible from any command or event handler.
3. **Public helper** — `persist_window_geometry(app: &AppHandle, win: &WebviewWindow, label: &str)`. The single entry point every opt-in window calls right after `.build()`.

### Data model

```rust
#[derive(Clone, Serialize, Deserialize)]
struct Geometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

type GeometryMap = HashMap<String, Geometry>;
```

`Geometry` uses `i32` for position (Windows allows negative coordinates for secondary monitors arranged left/above the primary) and `u32` for size (always positive).

The on-disk file format is a single JSON object: `{ "main": {...}, "sql": {...}, "pr-detail": {...}, ... }`. No top-level wrapper or version field — pre-adoption, schema is allowed to break and start over.

### Kind derivation

```rust
fn kind_of(label: &str) -> &str {
    if label.starts_with("pr-detail-") { return "pr-detail"; }
    if label.starts_with("file-viewer-") { return "file-viewer"; }
    if label.starts_with("workitem-detail-") { return "workitem-detail"; }
    label
}
```

Static labels (`main`, `sql`, `file-palette`, `work-item-palette`, `worktree-palette`, `settings`, `whats-new`, `agent-overview`) map to themselves. Dynamic labels collapse to their kind.

Unit-tested in isolation.

### `persist_window_geometry` flow

Called from the main thread after a successful `.build()`:

1. **Restore.** Look up kind in the cache. If a `Geometry` exists, validate that `(x, y)` lies within the bounds of at least one monitor in `app.available_monitors()`. If yes:
   - `win.set_size(PhysicalSize::new(g.width, g.height))`
   - `win.set_position(PhysicalPosition::new(g.x, g.y))`
   - if `g.maximized`, `win.maximize()`
   If no (off-screen) or no entry exists: do nothing — the builder's `.center()` placement stays.

2. **Subscribe.** Install a `win.on_window_event` listener that handles three events:
   - `WindowEvent::Moved(_)` — capture `outer_position()`, update cache entry for the kind, schedule debounced flush.
   - `WindowEvent::Resized(_)` — capture `outer_position()` + `outer_size()` + `is_maximized()`, update cache, schedule flush.
   - `WindowEvent::CloseRequested { .. }` — same as Resized **plus** flush immediately (don't trust the debounce).

   The handler reads geometry from the live `WebviewWindow`, not from the event payload, because event payloads are inner sizes/positions while we want outer geometry.

### Debounced flush

Single shared `tokio::task` per app:

- A `Notify` is signaled on every cache mutation.
- The task awaits `Notify::notified()`, then waits `tokio::time::sleep(250 ms)`, then writes the cache to `window-geometry.json` atomically (write to `.tmp`, then rename).
- If multiple notifications arrive during the 250 ms window, they collapse into one write.

250 ms is fast enough to feel "instant" for users but slow enough that a continuous drag fires one write at the end, not hundreds. `CloseRequested` bypasses the debounce by writing synchronously.

### Atomic write

Write to `window-geometry.json.tmp` first, then `std::fs::rename` over the real path. Crash mid-write leaves the previous valid file intact. Same pattern used by `settings::save_settings_internal`.

### Builder integration

Six call sites get one new line each — *after* `.build()` succeeds (or, for the main window, from `setup()`):

1. **`platform/hotkey.rs::open_or_toggle_palette`** — applies to all four `PaletteSpec` windows (sql, file-palette, work-item-palette, worktree-palette).
2. **`platform/window.rs::open_pr_detail_window`** — replaces the existing manual `pr_detail.window_state` save/restore (lines 303-384).
3. **`agent_overview/window.rs::show_or_create_agent_overview`** — replaces the existing manual `agent_overview.window_state` save/restore (lines 24, 72).
4. **`file_palette/windows.rs::open_file_viewer_window`** — newly persists.
5. **Main window — from `lib.rs::setup`.** Main is declared in `tauri.conf.json` (not built imperatively), so the persistence helper is wired by calling `app.get_webview_window("main")` inside `setup()` and passing the handle to `persist_window_geometry`. Restores main's last position/size/maximized state on launch and saves on subsequent moves/resizes/hides — the behavior the deleted `tauri-plugin-window-state` was meant to provide.
6. **`workitem-detail`, `settings`, `whats-new`** builders — newly persist (one line per builder).

The builder still calls `.center()`. The helper overrides post-build only when valid saved geometry exists.

## Migration

All in one PR (multiple commits per the plan):

1. Delete the three typed `Settings` geometry fields:
   - `Settings::pr_detail::window_state` (`settings/models.rs:570`)
   - `Settings::agent_overview::window_state` (`settings/models.rs:508`)
   - `Settings::settings_window` (top-level field on `Settings`)
   Keep the parent structs themselves.
2. Delete the manual save/restore code at:
   - `platform/window.rs:303-384` (pr-detail)
   - `agent_overview/window.rs:21-77` (load + builder apply + post-build snap + on_window_event)
   - `settings/window.rs:31-93` (same shape)
3. Delete the `borgdock-sql-position` localStorage logic in `SqlApp.tsx`:
   - `POSITION_KEY` constant (line 43)
   - `loadSavedPosition` and `saveCurrentPosition` functions (lines 57-84)
   - The `onMoved` listener `useEffect` (lines 215-223)
   - The `setPosition` block in the init effect (lines 191-205)
4. Delete `WindowGeometry` from `settings/models.rs` if no remaining references.
5. Existing user `settings.json` files keep the deleted fields as unknown JSON keys; serde tolerates that. They'll vanish on next save.

## Testing

### Pure Rust unit tests in `platform::window_geometry`

- `kind_of("pr-detail-foo-bar-1234")` → `"pr-detail"`
- `kind_of("main")` → `"main"`
- `kind_of("workitem-detail-7777")` → `"workitem-detail"`
- Off-screen validation: given a fixed mock monitor list `[(0, 0, 1920, 1080)]`, `(50, 50)` is valid, `(3000, 50)` is not, `(-100, 50)` is not, `(0, -50)` is not.
- Atomic write: write to a `tempfile::TempDir`, kill mid-write (force `panic`), confirm previous file content survives.

### End-to-end (manual)

Same shape as the rest of Tauri behavior we don't have e2e for:

1. Open SQL via Ctrl+F10. Move to (200, 200), resize to 1200×800. Close (Escape). Re-open via Ctrl+F10. Confirm geometry restored.
2. Open SQL, maximize, close, re-open. Confirm reopens maximized.
3. With BorgDock running on a single monitor, manually set `window-geometry.json`'s `sql.x` to `5000`. Re-open SQL. Confirm it falls back to centered, not invisible.
4. Open file-palette via Ctrl+F8. Move/resize. Hide via re-press. Quit BorgDock. Relaunch. Open file-palette. Confirm it returns to the saved geometry, not centered.

## Open questions

None remaining at design stage. Implementation may surface:
- Whether `on_window_event` listeners survive `win.hide()` / `win.show()` (expected: yes — they're tied to the HWND, not visibility. Main relies on this since it hides instead of closing.)
- Whether multiple windows of the same kind being open simultaneously (e.g., two `pr-detail-*` for different PRs) cause "last to move wins" surprises. Rare in practice; revisit if it bites.
