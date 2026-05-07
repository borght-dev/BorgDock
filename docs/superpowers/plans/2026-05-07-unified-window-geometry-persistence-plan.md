# Unified Window Geometry Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BorgDock's three coexisting window-geometry mechanisms with a single helper, so every Tauri window (except the tray flyout) restores position + size + maximized-state across launches.

**Architecture:** A new `platform::window_geometry` module owns a `HashMap<kind, Geometry>` backed by `<app_data>/window-geometry.json`. The map lives behind `Arc<WindowGeometryStore>` registered as Tauri-managed state. A debounced background task flushes mutations to disk. One `persist_window_geometry(app, win, label)` helper handles both restore-on-build and listener installation; every window-creating builder calls it after `.build()`. Per-instance windows (e.g. multiple `pr-detail-*`) collapse to a single "kind" — last to move wins.

**Tech Stack:** Rust, Tauri 2.11, serde / serde_json, tokio (`Notify` + `async_runtime::spawn`), `std::fs` atomic write via `.tmp` + `rename`.

**Spec:** `docs/superpowers/specs/2026-05-07-unified-window-geometry-persistence-design.md`

---

## File structure

**Created:**

- `src-tauri/src/platform/window_geometry.rs` — module: `Geometry` struct, `kind_of`, `is_position_on_screen`, file I/O, `WindowGeometryStore`, `persist_window_geometry`, and unit tests under `#[cfg(test)]`.

**Modified:**

- `src-tauri/src/platform/mod.rs` — declare new module.
- `src-tauri/src/lib.rs` — register `Arc<WindowGeometryStore>` in `manage(...)`, spawn flusher in `setup()`, call `persist_window_geometry` for `main`.
- `src-tauri/src/platform/hotkey.rs` — call `persist_window_geometry` from `open_or_toggle_palette` after build succeeds.
- `src-tauri/src/platform/window.rs` — call helper from `open_pr_detail_window` and `open_whats_new_window`. Delete the manual save/restore in `open_pr_detail_window` (current lines 303-384 area).
- `src-tauri/src/agent_overview/window.rs` — call helper. Delete the manual save/restore (lines 24, 72).
- `src-tauri/src/file_palette/windows.rs` — call helper from `open_file_viewer_window`.
- `src-tauri/src/settings/window.rs` — call helper.
- `src-tauri/src/settings/models.rs` — delete `pr_detail.window_state` and `agent_overview.window_state` fields and their references.
- `src/components/sql/SqlApp.tsx` — delete localStorage position persistence (`POSITION_KEY`, `loadSavedPosition`, `saveCurrentPosition`, the `onMoved` effect, the `setPosition` block).

**Note on `workitem-detail`:** the spec listed it as a builder integration site, but no Rust builder for it exists today (only a capability file). `kind_of` still handles `workitem-detail-*` for future use; no wiring task is needed.

---

### Task 1: `Geometry` struct + `kind_of` with unit tests

**Files:**
- Create: `src-tauri/src/platform/window_geometry.rs`
- Modify: `src-tauri/src/platform/mod.rs`

- [ ] **Step 1: Create module skeleton with the failing tests first**

```rust
// src-tauri/src/platform/window_geometry.rs
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_of_static_labels_pass_through() {
        assert_eq!(kind_of("main"), "main");
        assert_eq!(kind_of("sql"), "sql");
        assert_eq!(kind_of("file-palette"), "file-palette");
        assert_eq!(kind_of("agent-overview"), "agent-overview");
    }

    #[test]
    fn kind_of_dynamic_labels_collapse() {
        assert_eq!(kind_of("pr-detail-Gomocha-FSP-fsp-horizon-1571"), "pr-detail");
        assert_eq!(kind_of("file-viewer-abc123def456"), "file-viewer");
        assert_eq!(kind_of("workitem-detail-7777"), "workitem-detail");
    }
}
```

- [ ] **Step 2: Wire the module in**

Add to `src-tauri/src/platform/mod.rs`:

```rust
pub mod window_geometry;
```

- [ ] **Step 3: Run tests, expect compile failure**

Run: `cargo test -p borgdock window_geometry`
Expected: compile error — `cannot find function kind_of in this scope`.

- [ ] **Step 4: Implement `kind_of`**

Add above the `#[cfg(test)]` block in `window_geometry.rs`:

```rust
/// Map a window label to its persistence "kind". Multiple windows of the
/// same kind (e.g. several `pr-detail-*` tabs) share one geometry slot —
/// last to move/close wins. Static labels pass through unchanged.
pub fn kind_of(label: &str) -> &str {
    if label.starts_with("pr-detail-") { return "pr-detail"; }
    if label.starts_with("file-viewer-") { return "file-viewer"; }
    if label.starts_with("workitem-detail-") { return "workitem-detail"; }
    label
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `cargo test -p borgdock window_geometry`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/platform/window_geometry.rs src-tauri/src/platform/mod.rs
git commit -m "feat(window-geometry): Geometry struct and kind_of mapper"
```

---

### Task 2: Off-screen position validation

**Files:**
- Modify: `src-tauri/src/platform/window_geometry.rs`

- [ ] **Step 1: Add the failing tests**

Append inside the existing `tests` mod in `window_geometry.rs`:

```rust
    #[test]
    fn position_inside_a_monitor_is_valid() {
        let monitors = vec![(0, 0, 1920, 1080)];
        assert!(is_position_on_screen((100, 100), &monitors));
    }

    #[test]
    fn position_off_all_monitors_is_invalid() {
        let monitors = vec![(0, 0, 1920, 1080)];
        assert!(!is_position_on_screen((3000, 100), &monitors));
        assert!(!is_position_on_screen((-100, 100), &monitors));
        assert!(!is_position_on_screen((100, -100), &monitors));
        assert!(!is_position_on_screen((1920, 100), &monitors)); // boundary: right edge is exclusive
    }

    #[test]
    fn position_on_secondary_monitor_is_valid() {
        // Primary at (0, 0), secondary to its right at (1920, 0)
        let monitors = vec![(0, 0, 1920, 1080), (1920, 0, 1920, 1080)];
        assert!(is_position_on_screen((2500, 500), &monitors));
    }
```

- [ ] **Step 2: Run tests, expect failure**

Run: `cargo test -p borgdock window_geometry`
Expected: compile error — `cannot find function is_position_on_screen` and type `MonitorBounds`.

- [ ] **Step 3: Implement**

Add above the `#[cfg(test)]` block:

```rust
/// A monitor's bounds in physical pixels: `(origin_x, origin_y, width, height)`.
pub type MonitorBounds = (i32, i32, u32, u32);

/// True if `(x, y)` lies inside any of the supplied monitors. Right and
/// bottom edges are exclusive (a window placed exactly at `mx + mw` is on
/// the next monitor over, not this one).
pub fn is_position_on_screen(pos: (i32, i32), monitors: &[MonitorBounds]) -> bool {
    let (x, y) = pos;
    monitors.iter().any(|&(mx, my, mw, mh)| {
        x >= mx && x < mx + mw as i32 && y >= my && y < my + mh as i32
    })
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test -p borgdock window_geometry`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/platform/window_geometry.rs
git commit -m "feat(window-geometry): off-screen position validation"
```

---

### Task 3: Atomic file I/O

**Files:**
- Modify: `src-tauri/src/platform/window_geometry.rs`

- [ ] **Step 1: Add the failing tests**

Append inside the existing `tests` mod:

```rust
    #[test]
    fn write_atomic_then_read_or_empty_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("window-geometry.json");

        let mut map = GeometryMap::new();
        map.insert("main".to_string(), Geometry {
            x: 100, y: 200, width: 800, height: 600, maximized: false,
        });
        map.insert("sql".to_string(), Geometry {
            x: -50, y: 300, width: 1200, height: 800, maximized: true,
        });

        write_atomic(&path, &map).unwrap();
        assert_eq!(read_or_empty(&path), map);
    }

    #[test]
    fn read_or_empty_on_missing_file_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nonexistent.json");
        assert_eq!(read_or_empty(&path), GeometryMap::new());
    }

    #[test]
    fn read_or_empty_on_garbage_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("garbage.json");
        std::fs::write(&path, b"not valid json").unwrap();
        assert_eq!(read_or_empty(&path), GeometryMap::new());
    }
```

- [ ] **Step 2: Run, expect failure**

Run: `cargo test -p borgdock window_geometry`
Expected: compile errors — `GeometryMap`, `read_or_empty`, `write_atomic` not defined.

- [ ] **Step 3: Implement**

Add to `window_geometry.rs` near the top:

```rust
use std::collections::HashMap;
use std::path::Path;

pub type GeometryMap = HashMap<String, Geometry>;

/// Read the geometry file. Returns an empty map if the file is missing,
/// unreadable, or contains invalid JSON. We never want a corrupted file
/// to keep the user from launching — worst case is windows fall back to
/// default placement.
pub fn read_or_empty(path: &Path) -> GeometryMap {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(_) => return GeometryMap::new(),
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

/// Write atomically: serialize to a sibling `.tmp`, then `rename` over the
/// target. Crash mid-write leaves the previous valid file intact. Same
/// approach `settings::save_settings_internal` uses.
pub fn write_atomic(path: &Path, map: &GeometryMap) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_vec_pretty(map).map_err(std::io::Error::other)?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cargo test -p borgdock window_geometry`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/platform/window_geometry.rs
git commit -m "feat(window-geometry): atomic JSON read/write"
```

---

### Task 4: `WindowGeometryStore` with debounced flush

**Files:**
- Modify: `src-tauri/src/platform/window_geometry.rs`

This is one task because the store + flusher are tightly coupled. There is no useful pure-unit-test surface beyond what tasks 1-3 already cover; correctness is verified end-to-end in later tasks via the smoke checks in the spec.

- [ ] **Step 1: Add imports**

At the top of `window_geometry.rs`:

```rust
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Notify;
```

- [ ] **Step 2: Add the store + flusher**

Add to `window_geometry.rs`:

```rust
/// In-memory cache + on-disk JSON store for window geometry. Live behind
/// `Arc<...>` and registered as Tauri-managed state in `setup()`. Mutations
/// (`put`) are non-blocking — they signal a debounced flusher task that
/// writes the file ~250 ms after the last change. `flush_now()` is
/// synchronous and used on `CloseRequested` so the close path doesn't lose
/// the final geometry.
pub struct WindowGeometryStore {
    map: Mutex<GeometryMap>,
    notify: Notify,
    path: PathBuf,
}

impl WindowGeometryStore {
    /// Read the on-disk file once and seed the cache. Missing/corrupt file
    /// → empty cache (intentional: never block launch on geometry IO).
    pub fn load(app_data_dir: &Path) -> Self {
        let path = app_data_dir.join("window-geometry.json");
        Self {
            map: Mutex::new(read_or_empty(&path)),
            notify: Notify::new(),
            path,
        }
    }

    pub fn get(&self, kind: &str) -> Option<Geometry> {
        self.map.lock().ok()?.get(kind).copied()
    }

    pub fn put(&self, kind: String, geom: Geometry) {
        if let Ok(mut map) = self.map.lock() {
            map.insert(kind, geom);
        }
        self.notify.notify_one();
    }

    pub fn flush_now(&self) -> std::io::Result<()> {
        let snapshot = self.map.lock()
            .map_err(|_| std::io::Error::other("geometry map mutex poisoned"))?
            .clone();
        write_atomic(&self.path, &snapshot)
    }

    /// Spawn the background flusher. Pulls work via Notify; debounces by
    /// sleeping 250 ms after each wake before writing. Continuous drag
    /// (hundreds of `Moved` events) collapses into a single write at the
    /// end. Idempotent flushes are cheap so we don't track dirty state.
    pub fn spawn_flusher(self: Arc<Self>) {
        tauri::async_runtime::spawn(async move {
            loop {
                self.notify.notified().await;
                tokio::time::sleep(Duration::from_millis(250)).await;
                if let Err(e) = self.flush_now() {
                    log::error!("window-geometry: debounced flush failed: {e}");
                }
            }
        });
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p borgdock`
Expected: clean compile (no errors). Tasks 1-3 tests still pass: `cargo test -p borgdock window_geometry`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/platform/window_geometry.rs
git commit -m "feat(window-geometry): WindowGeometryStore with debounced flusher"
```

---

### Task 5: `persist_window_geometry` helper

**Files:**
- Modify: `src-tauri/src/platform/window_geometry.rs`

Like Task 4, this is one piece — it touches `WebviewWindow` so unit tests don't add value. Verified end-to-end in later tasks.

- [ ] **Step 1: Add the helper**

Append to `window_geometry.rs`:

```rust
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Apply any saved geometry to `win`, then attach a listener that captures
/// future moves/resizes/closes back into the store. Called from each
/// window-creating builder right after `.build()` succeeds.
///
/// Restoration only fires when the saved `(x, y)` lies within at least one
/// currently-connected monitor — protects against waking up with a window
/// stranded on a now-disconnected display.
///
/// MUST be called from the main thread (set_position / set_size /
/// is_maximized / available_monitors all have GUI-thread affinity on
/// Windows). Every existing window-builder site we wire into already runs
/// inside `app.run_on_main_thread`.
pub fn persist_window_geometry(app: &AppHandle, win: &WebviewWindow, label: &str) {
    let kind = kind_of(label).to_string();
    let store = match app.try_state::<Arc<WindowGeometryStore>>() {
        Some(s) => s.inner().clone(),
        None => {
            log::error!("persist_window_geometry[{label}]: store not registered in Tauri state");
            return;
        }
    };

    if let Some(g) = store.get(&kind) {
        let monitors: Vec<MonitorBounds> = app.available_monitors()
            .map(|ms| ms.into_iter().map(|m| {
                let p = m.position();
                let s = m.size();
                (p.x, p.y, s.width, s.height)
            }).collect())
            .unwrap_or_default();

        if is_position_on_screen((g.x, g.y), &monitors) {
            let _ = win.set_size(tauri::Size::Physical(PhysicalSize::new(g.width, g.height)));
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition::new(g.x, g.y)));
            if g.maximized {
                let _ = win.maximize();
            }
            log::info!("persist_window_geometry[{label}]: restored kind={kind}");
        } else {
            log::info!("persist_window_geometry[{label}]: saved geometry is off-screen, falling back to default placement");
        }
    }

    let win_for_handler = win.clone();
    let store_for_handler = store.clone();
    let kind_for_handler = kind.clone();

    win.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                if let Some(g) = capture(&win_for_handler) {
                    store_for_handler.put(kind_for_handler.clone(), g);
                }
            }
            tauri::WindowEvent::CloseRequested { .. } => {
                if let Some(g) = capture(&win_for_handler) {
                    store_for_handler.put(kind_for_handler.clone(), g);
                    if let Err(e) = store_for_handler.flush_now() {
                        log::error!("persist_window_geometry[close]: flush failed: {e}");
                    }
                }
            }
            _ => {}
        }
    });
}

fn capture(win: &WebviewWindow) -> Option<Geometry> {
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    let maximized = win.is_maximized().unwrap_or(false);
    Some(Geometry {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        maximized,
    })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p borgdock`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/platform/window_geometry.rs
git commit -m "feat(window-geometry): persist_window_geometry helper"
```

---

### Task 6: Register store + spawn flusher + wire main window

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Locate the existing `setup` block**

In `src-tauri/src/lib.rs`, find the `.setup(|app| { … })` closure (around line 150). Note the `app` parameter — that's the `App`, not `AppHandle`. We'll need both.

- [ ] **Step 2: Add the store + spawn flusher + main wire-in**

Inside `setup`, after the existing `platform::tray::setup_tray(app)?;` line (and before later setup blocks), add:

```rust
            // Window geometry store: load once, register, spawn flusher,
            // wire main on first launch so it picks up restored geometry.
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("app_data_dir unavailable: {e}"))?;
            std::fs::create_dir_all(&app_data_dir).map_err(|e| format!("create app data dir: {e}"))?;

            let geometry_store = std::sync::Arc::new(
                crate::platform::window_geometry::WindowGeometryStore::load(&app_data_dir)
            );
            geometry_store.clone().spawn_flusher();
            app.manage(geometry_store.clone());

            // Wire main on the main thread. Main is declared in tauri.conf.json
            // (built before `setup` runs), so we look it up by label.
            if let Some(main_win) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                app_handle.run_on_main_thread(move || {
                    crate::platform::window_geometry::persist_window_geometry(
                        &app_handle.clone(), &main_win, "main",
                    );
                }).map_err(|e| format!("dispatch persist_window_geometry for main: {e}"))?;
            } else {
                log::error!("setup: main window not found at startup; geometry persistence skipped");
            }
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p borgdock`
Expected: clean. If `tauri::Manager::path` import is missing, add `use tauri::Manager;` at the top of lib.rs (it's likely already there).

- [ ] **Step 4: Smoke test**

Run: `npm run tauri dev` (from `src-tauri`'s parent — `BorgDock.Tauri`).

Manually:
1. Resize main window from default (1400×900) to (1100×700). Move to a non-default position. Quit BorgDock fully.
2. Relaunch. Main window comes back at the moved/resized geometry.

Expected log line in `%APPDATA%\BorgDock\logs\borgdock.log`:
```
persist_window_geometry[main]: restored kind=main
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(window-geometry): register store, spawn flusher, persist main"
```

---

### Task 7: Wire palettes/SQL via `open_or_toggle_palette`

**Files:**
- Modify: `src-tauri/src/platform/hotkey.rs`

- [ ] **Step 1: Add the helper call after `.build()` success**

In `hotkey.rs`, find the `match builder.build() { Ok(_) => … Err(e) => … }` at the end of `open_or_toggle_palette` (around line 144 of the current file). Replace it with:

```rust
    match builder.build() {
        Ok(win) => {
            log::info!("palette[{label}]: build succeeded in {:?}", t0.elapsed());
            crate::platform::window_geometry::persist_window_geometry(app, &win, spec.label);
        }
        Err(e) => log::error!("palette[{label}]: build failed in {:?}: {e}", t0.elapsed()),
    }
```

(Only change: capture `win` from `Ok(_)` and call the helper. Error path unchanged.)

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p borgdock`
Expected: clean.

- [ ] **Step 3: Smoke test**

Manually after `npm run tauri dev`:
1. Press Ctrl+F10. Move SQL window. Resize. Hit Escape (closes it).
2. Press Ctrl+F10 again. Window comes back at moved/resized position.
3. Repeat for Ctrl+F8 (file-palette), Ctrl+F9 (work-item-palette), Ctrl+F7 (worktree-palette).

Expected: each window reopens at last geometry.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/platform/hotkey.rs
git commit -m "feat(window-geometry): persist palettes and SQL via open_or_toggle_palette"
```

---

### Task 8: Wire pr-detail and remove its manual save/restore

**Files:**
- Modify: `src-tauri/src/platform/window.rs`
- Modify: `src-tauri/src/settings/models.rs`

- [ ] **Step 1: Locate the manual block**

In `platform/window.rs`, the `open_pr_detail_window` async command currently does three things related to geometry:

1. Loads `Settings.pr_detail.window_state` near line 303 (`saved_geometry` binding).
2. In the build closure, applies that geometry to the builder via `inner_size` + `position` (around lines 341-344).
3. Installs a `win.on_window_event(CloseRequested)` listener that writes back to `Settings.pr_detail.window_state` (around lines 367-384).

All three are replaced by one `persist_window_geometry` call.

- [ ] **Step 2: Delete the manual save/restore**

Remove:
- The `saved_geometry` binding (line ~303).
- The conditional `if let Some(g) = &saved_geometry { builder = builder.inner_size(...).position(...); } else { builder = builder.center(); }` — replace with a plain `.center()`.
- The `if let Some(g) = &saved_geometry { let _ = win.set_size(...); let _ = win.set_position(...); }` block after the build (around lines 359-362).
- The `win.on_window_event(move |event| { if let CloseRequested { .. } = event { … settings.pr_detail.window_state = Some(geom); … } })` block (around lines 367-384).

Keep the rest of `open_pr_detail_window` (the `init_script`, `force_repaint` thread, the existing-window short-circuit at the top).

- [ ] **Step 3: Add the helper call**

Where the deleted `on_window_event` listener was, add:

```rust
                crate::platform::window_geometry::persist_window_geometry(
                    &app_for_build, &win, &label_for_build,
                );
```

This goes inside the `Ok(win) => { … }` arm of the existing `match result { Ok(win) => { … } Err(e) => … }`, before the `Ok(())` that ends the closure.

- [ ] **Step 4: Delete the `window_state` field on `PrDetailSettings`**

In `settings/models.rs` around line 564:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrDetailSettings {
    /// Persisted from the most recently closed PR detail window. New PR
    /// windows restore to this geometry instead of always centering.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window_state: Option<WindowGeometry>,
}
```

becomes:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrDetailSettings {}
```

(Empty struct, but kept so the `Settings.pr_detail` field type doesn't churn elsewhere. Future per-PR-detail prefs land here.)

If `WindowGeometry` becomes unused after Task 9, leave it for now — Task 9 will check.

- [ ] **Step 5: Verify it compiles**

Run: `cargo check -p borgdock`
Expected: clean. (If `WindowGeometry` shows as unused after this task, that's expected — Task 9 also removes its other reference.)

- [ ] **Step 6: Smoke test**

`npm run tauri dev`. Click a PR card. Move/resize the pop-out. Close it. Click another PR card — pop-out opens at last geometry.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/platform/window.rs src-tauri/src/settings/models.rs
git commit -m "refactor(window-geometry): pr-detail uses unified store, remove manual"
```

---

### Task 9: Wire agent-overview and remove its manual save/restore

**Files:**
- Modify: `src-tauri/src/agent_overview/window.rs`
- Modify: `src-tauri/src/settings/models.rs`

The current `show_or_create_agent_overview` (lines 14-80) has four geometry-related chunks to delete and replace with one helper call.

- [ ] **Step 1: Delete the `win_state` lookup (lines 21-24)**

```rust
    let settings = load_settings_internal().ok();
    let win_state = settings
        .as_ref()
        .and_then(|s| s.agent_overview.window_state.clone());
```

Delete these four lines.

- [ ] **Step 2: Delete the conditional builder restore (lines 40-44)**

```rust
    if let Some(g) = &win_state {
        builder = builder
            .inner_size(g.width as f64, g.height as f64)
            .position(g.x as f64, g.y as f64);
    }
```

Delete this block. The builder keeps its default `.inner_size(DEFAULT_W, DEFAULT_H)` from line 32. (No `.center()` was previously called here — the window was either restored or used default size at default position. Add `.center()` to the builder so default-position windows land centered.)

In the builder chain (currently ending at line 38 with `.visible(false)`), insert `.center()` before `.visible(false)`:

```rust
        .skip_taskbar(false)
        .shadow(true)
        .center()
        .visible(false);
```

- [ ] **Step 3: Delete the post-build geometry snap (lines 51-56)**

```rust
    if let Some(g) = &win_state {
        win.set_size(tauri::Size::Physical(PhysicalSize::new(g.width, g.height)))
            .ok();
        win.set_position(tauri::Position::Physical(PhysicalPosition::new(g.x, g.y)))
            .ok();
    }
```

Delete this block.

- [ ] **Step 4: Delete the on-close save listener (lines 58-77)**

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
                if let Ok(mut settings) = crate::settings::load_settings_internal() {
                    settings.agent_overview.window_state = Some(geom);
                    let _ = crate::settings::save_settings_internal(&settings);
                }
            }
        }
    });
```

Delete this block.

- [ ] **Step 5: Add the helper call**

Where the deleted on-close listener was, before the final `Ok(())`:

```rust
    crate::platform::window_geometry::persist_window_geometry(app, &win, "agent-overview");

    Ok(())
}
```

(`app` is the function's `&tauri::AppHandle` parameter from line 14.)

- [ ] **Step 6: Clean up unused imports**

`PhysicalPosition` and `PhysicalSize` (line 3) are no longer used — remove them from the use statement. `load_settings_internal` (line 1) is no longer needed — remove. The final imports should be:

```rust
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
```

- [ ] **Step 7: Delete the `window_state` field on `AgentOverviewSettings`**

In `settings/models.rs` line 507-508, delete:

```rust
    #[serde(default)]
    pub window_state: Option<WindowGeometry>,
```

Line 542, delete `window_state: None,` from the `Default` impl.

- [ ] **Step 8: Verify it compiles**

Run: `cargo check -p borgdock`
Expected: clean. (`WindowGeometry` may still be used by `PrDetailSettings` from Task 8 step 4 — leave it alone here. Task 12 step 7 cleans up if unused after settings_window is also gone.)

- [ ] **Step 9: Smoke test**

`npm run tauri dev`. Open Agent Overview (Ctrl+Win+Shift+A). Move/resize. Close. Reopen — geometry restored.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/agent_overview/window.rs src-tauri/src/settings/models.rs
git commit -m "refactor(window-geometry): agent-overview uses unified store"
```

---

### Task 10: Wire file-viewer

**Files:**
- Modify: `src-tauri/src/file_palette/windows.rs`

- [ ] **Step 1: Add the helper call**

In `open_file_viewer_window` after the builder `.build()` returns `Ok(win)` — currently around line 86 the builder ends with `.build().map_err(…)?;`. Right after that (still inside the main-thread closure):

```rust
            crate::platform::window_geometry::persist_window_geometry(
                &app_for_run, &win, &label,
            );
            bring_to_front(&win);
            Ok(())
```

Replacing the existing `bring_to_front(&win); Ok(())`.

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p borgdock`
Expected: clean.

- [ ] **Step 3: Smoke test**

`npm run tauri dev`. Open file palette (Ctrl+F8), open a file → viewer pops out. Move/resize the viewer. Close it. Open another file — viewer opens at last geometry (per-kind, so any file's viewer shares one slot).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/file_palette/windows.rs
git commit -m "feat(window-geometry): persist file-viewer windows"
```

---

### Task 11: Wire whats-new

**Files:**
- Modify: `src-tauri/src/platform/window.rs`

- [ ] **Step 1: Add the helper call**

In `open_whats_new_window` (around line 460), inside the `Ok(win) => { … }` arm of `match result`, add the call before `Ok(())`:

```rust
            Ok(win) => {
                let _ = win.set_skip_taskbar(true);
                crate::platform::window_geometry::persist_window_geometry(
                    &app_for_build, &win, "whats-new",
                );
                Ok(())
            }
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p borgdock`

- [ ] **Step 3: Smoke test**

Trigger "What's New" (typically tray menu or post-update). Move/resize. Close. Re-open — geometry restored.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/platform/window.rs
git commit -m "feat(window-geometry): persist whats-new window"
```

---

### Task 12: Wire settings window

**Files:**
- Modify: `src-tauri/src/settings/window.rs`

- [ ] **Step 1: Add the helper call**

In `settings/window.rs`, find the `WebviewWindowBuilder::new` (around line 41) and the `.build()` call that follows. After build success, add the helper call. The exact placement depends on how the function is structured (tray-callback vs main-thread closure), but the call goes right after the `Ok(win)` arm, before any subsequent operation.

```rust
            crate::platform::window_geometry::persist_window_geometry(
                &app, &win, "settings",
            );
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p borgdock`
Expected: clean.

- [ ] **Step 3: Smoke test**

Open Settings (tray menu). Move/resize. Close. Reopen — geometry restored.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/settings/window.rs
git commit -m "feat(window-geometry): persist settings window"
```

---

### Task 13: Remove SqlApp localStorage position persistence

**Files:**
- Modify: `src/components/sql/SqlApp.tsx`

- [ ] **Step 1: Delete `POSITION_KEY` constant (line 43)**

```ts
const POSITION_KEY = 'borgdock-sql-position';
```

Delete this line.

- [ ] **Step 2: Delete `loadSavedPosition` and `saveCurrentPosition` (lines 57-84)**

Delete both functions.

- [ ] **Step 3: Delete the position-restore block in the init effect (lines 191-205)**

In the init `useEffect` near line 169, delete the block that runs after settings load:

```ts
    const saved = loadSavedPosition();
    if (
      saved &&
      saved.x >= 0 &&
      saved.y >= 0 &&
      saved.x < screen.width &&
      saved.y < screen.height
    ) {
      try {
        const { LogicalPosition } = await import('@tauri-apps/api/dpi');
        await getCurrentWindow().setPosition(new LogicalPosition(saved.x, saved.y));
      } catch {
        /* ignore */
      }
    }
```

- [ ] **Step 4: Delete the `onMoved` listener effect (lines 215-223)**

```ts
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWindow().onMoved(() => {
        saveCurrentPosition();
      });
    })();
    return () => unlisten?.();
  }, []);
```

Delete the entire effect.

- [ ] **Step 5: Verify dev build is clean**

Run: `npm run dev` (from `src/BorgDock.Tauri`).
Expected: no TypeScript errors. Vite reloads cleanly.

- [ ] **Step 6: Smoke test**

`npm run tauri dev`. Open SQL (Ctrl+F10). Move/resize/maximize. Close (Escape). Reopen — geometry restored from the unified store, not localStorage. Confirm via DevTools (Application → Local Storage): no `borgdock-sql-position` key.

- [ ] **Step 7: Commit**

```bash
git add src/components/sql/SqlApp.tsx
git commit -m "refactor(sql): remove localStorage position, rely on unified geometry store"
```

---

## Self-review checklist

After running through the implementation tasks above, before declaring done:

- [ ] Open `%APPDATA%\BorgDock\window-geometry.json` after using the app for ~5 minutes touching every window. Confirm entries for `main`, `sql`, `pr-detail`, `agent-overview`, `file-palette`, `work-item-palette`, `worktree-palette`, `file-viewer`, `whats-new`, `settings` (only the ones you've actually opened). Each should have valid `x`, `y`, `width`, `height`, `maximized` values.
- [ ] Edit `window-geometry.json` manually: set `sql.x` to `99999`. Reopen SQL. Confirm it falls back to centered (off-screen guard fired).
- [ ] Maximize main, quit, relaunch. Main reopens maximized.
- [ ] Open two PR detail windows for different PRs. Move only the second one. Close both. Open a third — it gets the second one's last geometry (per-kind; last to move wins).
- [ ] Confirm `WindowGeometry` either still has at least one user (and isn't being held alive just for tests) or has been deleted in Task 9 / Step 5.
- [ ] No references to `tauri-plugin-window-state` or its identifiers remain.
- [ ] No references to `borgdock-sql-position` localStorage key remain in any `.ts`/`.tsx` file.
