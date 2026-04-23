# Tray-first UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BorgDock tray-first — tray icon + flyout are the default surface; sidebar is on-demand; notifications are delivered as BorgDock-styled toasts in the flyout instead of OS toasts; add a user-configurable hotkey for the flyout.

**Architecture:** The flyout window is built once at Tauri `setup` (invisibly) and kept alive for the whole process. It renders one of four modes (`idle` / `initializing` / `glance` / `toast`) driven by React state. The `main` (sidebar) window starts at 1×1 off-screen so its React tree keeps polling without WebView2 background-throttling, and gets resized + repositioned when the user summons the sidebar. Notifications route through a new `show_flyout_toast` Rust command that replaces the OS-level `send_notification` + `tauri-winrt-notification` path. Per-OS tray positioning: bottom-right on Windows (grow up), top-right on macOS and Linux (grow down).

**Tech Stack:** Rust (Tauri 2, tokio, serde), TypeScript (React 19, Zustand, Vitest, Playwright), Biome, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-04-23-tray-first-ux-design.md`

---

## Phase overview — each phase ships as its own PR

| Phase | Tasks | Ships | Ship condition |
|---|---|---|---|
| **1. Settings & user hotkeys** | 1–3 | `Ctrl+Shift+Win+F` toggles the existing flyout; settings UI shows both hotkeys | app launches, both hotkeys work, nothing else changes |
| **2. Persistent flyout** | 4–6 | Flyout built at startup, per-OS position, `resize_flyout` command | tray click still works, flyout opens fast, macOS/Linux users see flyout near top-right |
| **3. Toast mode + notifications** | 7–12 | Flyout auto-opens as toast on PR events; OS toasts still fire too (until phase 5) | `useStateTransitions` → flyout toast works end-to-end |
| **4. Tray-first startup** | 13–17 | Sidebar doesn't auto-open on launch; tray Initializing state; setup wizard is a modal | fresh boot shows no sidebar, first-run still walks through wizard |
| **5. Cleanup** | 18–21 | Remove `tauri-winrt-notification`, `send_notification`, `badge` window, `useNotificationActions` | `cargo check` + `npm test` + `npm run lint` clean |
| **6. Verification** | 22 | Playwright smoke + manual cross-OS notes | you're happy |

Phases are dependency-ordered but independently shippable. Each task ends with a commit; phases end with a PR marker task.

---

## File structure

**New files:**

```
src/BorgDock.Tauri/src-tauri/src/flyout/mod.rs            # new module: flyout window lifecycle, toast IPC, glance IPC
src/BorgDock.Tauri/src-tauri/src/flyout/position.rs       # pure position_flyout_near_tray + unit tests
src/BorgDock.Tauri/src-tauri/src/flyout/toast.rs          # ToastPayload types + show_flyout_toast command
src/BorgDock.Tauri/src/components/flyout/FlyoutGlance.tsx # extracted glance-mode body (current FlyoutApp innards)
src/BorgDock.Tauri/src/components/flyout/FlyoutToast.tsx  # toast-mode card stack with auto-hide timer
src/BorgDock.Tauri/src/components/flyout/FlyoutInitializing.tsx  # shell around SplashScreen for flyout-mode init display
src/BorgDock.Tauri/src/components/flyout/flyout-mode.ts   # discriminated-union mode type + reducer, pure
src/BorgDock.Tauri/src/components/flyout/__tests__/flyout-mode.test.ts  # state machine unit tests
src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutToast.test.tsx # timer + hover pause tests
```

**Modified files:**

```
src/BorgDock.Tauri/src-tauri/Cargo.toml                   # remove tauri-winrt-notification
src/BorgDock.Tauri/src-tauri/src/lib.rs                   # register new commands, build flyout in setup, tray init state
src/BorgDock.Tauri/src-tauri/src/main.rs                  # no changes expected, included for completeness
src/BorgDock.Tauri/src-tauri/src/platform/window.rs       # hide_sidebar repurpose, show_setup_wizard, delete badge fns, move flyout code
src/BorgDock.Tauri/src-tauri/src/platform/tray.rs         # add Initializing variant + animation, reorder menu
src/BorgDock.Tauri/src-tauri/src/platform/hotkey.rs       # register both user-configurable hotkeys
src/BorgDock.Tauri/src-tauri/src/settings/models.rs       # UiSettings gains flyout_hotkey
src/BorgDock.Tauri/src-tauri/tauri.conf.json              # main window visible: false
src/BorgDock.Tauri/src-tauri/src/notification.rs          # DELETED (file)
src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx    # shell that dispatches to mode-specific component
src/BorgDock.Tauri/src/services/notification.ts           # sendOsNotification → invoke('show_flyout_toast')
src/BorgDock.Tauri/src/hooks/useStateTransitions.ts       # remove isSidebarVisible gate
src/BorgDock.Tauri/src/hooks/useReviewNudges.ts           # no behavioral change; keeps calling sendOsNotification
src/BorgDock.Tauri/src/hooks/useNotificationActions.ts    # DELETED (file)
src/BorgDock.Tauri/src/App.tsx                            # remove useNotificationActions import
src/BorgDock.Tauri/src/components/BadgeApp.tsx            # DELETED (file) — confirm no remaining callers first
src/BorgDock.Tauri/src/badge-main.tsx                     # DELETED (file)
src/BorgDock.Tauri/badge.html                             # DELETED (file)
src/BorgDock.Tauri/src/__tests__/App.test.tsx             # update mock: no send_notification mock
src/BorgDock.Tauri/src/services/__tests__/notification.test.ts  # update OS-notification test: assert show_flyout_toast invoke
```

---

## Spec adjustments (read before starting)

Two small deviations from the brainstormed spec, kept here for continuity:

1. **`main` window `visible` flip.** The spec said "main window's `visible` flag in `tauri.conf.json` flips to `false`." Existing code (`lib.rs:156-159`) already calls `win.show()` manually after setup. We preserve that call but move it so it fires *after* `main` is positioned off-screen at 1×1. The `tauri.conf.json` window entry does flip to `"visible": false` to prevent the big 400×900 flash before the off-screen reposition runs.

2. **The fixed palette hotkeys (`Ctrl+F7/F8/F9/F10`) already have a dedicated setup path** (`register_fixed_hotkeys`). We add the flyout hotkey to the *user-configurable* path (`register_hotkey`, renamed to `register_user_hotkeys`), not to the fixed-hotkey path, so users can rebind it in settings alongside the sidebar hotkey.

Both adjustments preserve the spec's intent.

---

# Phase 1 — Settings & user hotkeys

Goal of this phase: user can press `Ctrl+Shift+Win+F` to toggle the flyout. No other behavioral change.

### Task 1: Add `flyout_hotkey` to UiSettings

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/settings/models.rs`

- [ ] **Step 1: Edit `UiSettings` struct to add `flyout_hotkey` field**

In `src/BorgDock.Tauri/src-tauri/src/settings/models.rs`, inside `pub struct UiSettings`, after the `global_hotkey` field (around line 102), add:

```rust
    #[serde(default = "default_flyout_hotkey")]
    pub flyout_hotkey: String,
```

- [ ] **Step 2: Add the default function**

After `fn default_global_hotkey` (around line 146), add:

```rust
fn default_flyout_hotkey() -> String {
    "Ctrl+Win+Shift+F".to_string()
}
```

- [ ] **Step 3: Update `Default for UiSettings` impl**

In `impl Default for UiSettings`, inside the `Self { ... }` struct-literal (around line 164), add after `global_hotkey: "Ctrl+Win+Shift+G".to_string(),`:

```rust
            flyout_hotkey: "Ctrl+Win+Shift+F".to_string(),
```

- [ ] **Step 4: Build to verify**

Run:

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: `Finished` with no errors. Warnings about unused `default_flyout_hotkey` are acceptable — next task consumes it.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/settings/models.rs
git commit -m "feat(settings): add flyout_hotkey to UiSettings"
```

---

### Task 2: Register both user-configurable hotkeys

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/platform/hotkey.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`
- Modify: `src/BorgDock.Tauri/src/stores/settings-store.ts` (call site, inspect first)

- [ ] **Step 1: Inspect the current call site**

Run:

```bash
grep -rn "register_hotkey" src/BorgDock.Tauri/src
```

Expected output: one call in `src/stores/settings-store.ts` (or similar) that invokes `register_hotkey` with a single `shortcut` argument.

- [ ] **Step 2: Rename `register_hotkey` → `register_user_hotkeys` and accept both shortcuts**

In `src/BorgDock.Tauri/src-tauri/src/platform/hotkey.rs`, replace the `register_hotkey` fn signature and body above the command-palette block with:

```rust
#[tauri::command]
pub fn register_user_hotkeys(
    app: tauri::AppHandle,
    sidebar_shortcut: String,
    flyout_shortcut: String,
) -> Result<(), String> {
    // Unregister any previously-registered user hotkeys. Fixed palette/SQL
    // hotkeys are registered once at setup via register_fixed_hotkeys and
    // are not affected.
    let _ = app.global_shortcut().unregister_all();
    // Re-register fixed hotkeys since unregister_all is not selective.
    register_fixed_hotkeys(&app)?;

    // Sidebar toggle
    let app_toggle = app.clone();
    app.global_shortcut()
        .on_shortcut(sidebar_shortcut.as_str(), move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let app_cb = app_toggle.clone();
            let _ = app_toggle.run_on_main_thread(move || {
                if super::window::sidebar_visible() {
                    let _ = super::window::hide_main_window(&app_cb);
                } else {
                    let _ = super::window::show_main_window(&app_cb);
                }
            });
        })
        .map_err(|e| format!("Failed to register sidebar hotkey: {e}"))?;

    // Flyout toggle
    let app_flyout = app.clone();
    app.global_shortcut()
        .on_shortcut(flyout_shortcut.as_str(), move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let app_cb = app_flyout.clone();
            let _ = app_flyout.run_on_main_thread(move || {
                if let Err(e) = super::window::toggle_flyout(&app_cb) {
                    log::error!("flyout hotkey: toggle_flyout failed: {e}");
                }
            });
        })
        .map_err(|e| format!("Failed to register flyout hotkey: {e}"))?;

    Ok(())
}
```

Delete the old `register_hotkey` command (keep `unregister_hotkey` and the fixed-hotkey functions unchanged).

- [ ] **Step 3: Split the fixed-hotkey block into its own fn if not already**

In the same file, find the existing `Ctrl+F9`/`Ctrl+F7`/`Ctrl+F8`/`Ctrl+F10` blocks. If they're still part of the deleted `register_hotkey`, extract them to a standalone `pub fn register_fixed_hotkeys(app: &tauri::AppHandle) -> Result<(), String>` using the same `on_shortcut` pattern. (The spec adjustments note that this function already exists — verify with `grep -n "register_fixed_hotkeys" src/BorgDock.Tauri/src-tauri/src/platform/hotkey.rs`. If it exists, skip this step.)

- [ ] **Step 4: Update `lib.rs` `invoke_handler!`**

Replace `platform::hotkey::register_hotkey` in the `invoke_handler!` list (around line 180) with:

```rust
            platform::hotkey::register_user_hotkeys,
```

- [ ] **Step 5: Update the TS call site**

Find the caller in `src/BorgDock.Tauri/src/stores/settings-store.ts` (or wherever the grep in step 1 reported). Replace:

```typescript
await invoke('register_hotkey', { shortcut: settings.ui.globalHotkey });
```

with:

```typescript
await invoke('register_user_hotkeys', {
  sidebarShortcut: settings.ui.globalHotkey,
  flyoutShortcut: settings.ui.flyoutHotkey,
});
```

- [ ] **Step 6: Add `flyoutHotkey` to the TS settings shape**

Run:

```bash
grep -n "globalHotkey" src/BorgDock.Tauri/src/types
```

Find the `UiSettings` (or `AppSettings.ui`) TS interface and add, next to `globalHotkey: string;`:

```typescript
  flyoutHotkey: string;
```

- [ ] **Step 7: Build both sides**

Run:

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
cd src/BorgDock.Tauri && npm run build
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -u
git commit -m "feat(hotkey): register separate flyout hotkey; rename command to register_user_hotkeys"
```

---

### Task 3: Settings UI — add flyout hotkey input

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/**` (grep to find the existing hotkey binding input)

- [ ] **Step 1: Locate the existing hotkey binding UI**

Run:

```bash
grep -rn "globalHotkey" src/BorgDock.Tauri/src/components/settings
```

Expected: a file that renders an `<input>` or custom key-capture component for `globalHotkey`.

- [ ] **Step 2: Add a matching input for `flyoutHotkey`**

In the file identified in step 1, directly below the existing hotkey row (same component, same handler wiring, same validation), add a second row with:

- Label: `"Flyout hotkey"`
- Value source: `settings.ui.flyoutHotkey`
- Write: same setter pattern as the sidebar hotkey, saving to `ui.flyoutHotkey`
- Help text: `"Toggles the tray flyout from anywhere. Default: Ctrl+Win+Shift+F."`

- [ ] **Step 3: Manual verify**

Run:

```bash
cd src/BorgDock.Tauri && npm run tauri dev
```

Open Settings → Sidebar/Hotkeys. Verify two fields are visible, both captureable. Close dev. Press the new flyout hotkey — flyout should toggle.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(settings-ui): add flyout hotkey input"
```

---

### Task 4: Phase 1 PR marker

- [ ] **Step 1: Push branch and open PR**

```bash
git push -u origin <branch>
gh pr create --title "Tray-first UX phase 1: flyout hotkey" --body "$(cat <<'EOF'
## Summary
- Adds `flyoutHotkey` setting (default `Ctrl+Win+Shift+F`)
- Registers it alongside the existing sidebar hotkey via renamed `register_user_hotkeys` command
- Adds matching input in Settings

## Test plan
- [ ] App still launches
- [ ] Old sidebar hotkey still toggles the sidebar
- [ ] New flyout hotkey toggles the flyout from any app
- [ ] Settings lets you rebind both, changes take effect without restart

Part of the tray-first UX roadmap. Spec: docs/superpowers/specs/2026-04-23-tray-first-ux-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Phase 2 — Persistent flyout

Goal: flyout is built once at startup, positioned correctly on each OS, and can be resized cleanly.

### Task 5: Create `flyout` module skeleton

**Files:**
- Create: `src/BorgDock.Tauri/src-tauri/src/flyout/mod.rs`
- Create: `src/BorgDock.Tauri/src-tauri/src/flyout/position.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`

- [ ] **Step 1: Create `flyout/position.rs` with a pure positioning function and a test**

Create `src/BorgDock.Tauri/src-tauri/src/flyout/position.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlyoutAnchor {
    BottomRight, // Windows
    TopRight,    // macOS, Linux (default)
}

pub fn default_anchor_for_os() -> FlyoutAnchor {
    if cfg!(target_os = "windows") {
        FlyoutAnchor::BottomRight
    } else {
        FlyoutAnchor::TopRight
    }
}

/// Compute the top-left physical position of the flyout window given the
/// monitor work area, flyout size, and anchor corner. `work_area_*` values
/// are in physical pixels. Returns `(x, y)` in physical pixels.
///
/// The "offset" values are the tray/indicator area height we leave clear
/// (taskbar on Windows, menu bar on macOS, indicator area on Linux).
pub fn compute_flyout_position(
    work_x: i32,
    work_y: i32,
    work_w: i32,
    work_h: i32,
    flyout_w: i32,
    flyout_h: i32,
    anchor: FlyoutAnchor,
    chrome_offset: i32,
) -> (i32, i32) {
    let x = work_x + work_w - flyout_w;
    let y = match anchor {
        FlyoutAnchor::BottomRight => work_y + work_h - chrome_offset - flyout_h,
        FlyoutAnchor::TopRight => work_y + chrome_offset,
    };
    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bottom_right_places_flyout_above_taskbar() {
        let (x, y) = compute_flyout_position(
            0, 0, 1920, 1080, 412, 512, FlyoutAnchor::BottomRight, 48,
        );
        assert_eq!(x, 1920 - 412);
        assert_eq!(y, 1080 - 48 - 512);
    }

    #[test]
    fn top_right_places_flyout_below_menu_bar() {
        let (x, y) = compute_flyout_position(
            0, 0, 1920, 1080, 412, 512, FlyoutAnchor::TopRight, 28,
        );
        assert_eq!(x, 1920 - 412);
        assert_eq!(y, 28);
    }

    #[test]
    fn bottom_right_respects_nonzero_work_origin() {
        let (x, y) = compute_flyout_position(
            -1920, 0, 1920, 1080, 412, 512, FlyoutAnchor::BottomRight, 48,
        );
        assert_eq!(x, -412);
        assert_eq!(y, 1080 - 48 - 512);
    }

    #[test]
    fn default_anchor_is_os_specific() {
        // This test's expectation varies by host OS; it just documents the rule.
        let a = default_anchor_for_os();
        if cfg!(target_os = "windows") {
            assert_eq!(a, FlyoutAnchor::BottomRight);
        } else {
            assert_eq!(a, FlyoutAnchor::TopRight);
        }
    }
}
```

- [ ] **Step 2: Create `flyout/mod.rs` that re-exports `position`**

Create `src/BorgDock.Tauri/src-tauri/src/flyout/mod.rs`:

```rust
pub mod position;
```

- [ ] **Step 3: Register the module in `lib.rs`**

In `src/BorgDock.Tauri/src-tauri/src/lib.rs`, near the top where other `mod` declarations live (alongside `mod platform;`, `mod settings;`, etc.), add:

```rust
mod flyout;
```

- [ ] **Step 4: Run the unit tests**

Run:

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib flyout::position
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(flyout): pure position_flyout_near_tray with per-OS anchors"
```

---

### Task 6: Build flyout window at startup (invisible)

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`

- [ ] **Step 1: Add `build_flyout_window` helper**

In `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`, above `toggle_flyout`, add:

```rust
const FLYOUT_GLANCE_W: f64 = 412.0;
const FLYOUT_GLANCE_H: f64 = 512.0;

const CHROME_OFFSET_WIN: i32 = 48;
const CHROME_OFFSET_MAC: i32 = 28;
const CHROME_OFFSET_LINUX: i32 = 32;

fn chrome_offset_for_os() -> i32 {
    if cfg!(target_os = "windows") {
        CHROME_OFFSET_WIN
    } else if cfg!(target_os = "macos") {
        CHROME_OFFSET_MAC
    } else {
        CHROME_OFFSET_LINUX
    }
}

/// Build the flyout window invisibly. Called once, from Tauri `setup`.
/// Position is computed from the current primary monitor.
pub(crate) fn build_flyout_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    let win = WebviewWindowBuilder::new(
        app,
        "flyout",
        WebviewUrl::App("flyout.html".into()),
    )
    .title("BorgDock")
    .inner_size(FLYOUT_GLANCE_W, FLYOUT_GLANCE_H)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .shadow(false)
    .visible(false)
    .focused(false)
    .build()
    .map_err(|e| e.to_string())?;

    if let Err(e) = position_flyout_near_tray(&win, FLYOUT_GLANCE_W, FLYOUT_GLANCE_H) {
        log::warn!("initial flyout positioning failed: {e}");
    }
    Ok(win)
}

/// Position the flyout's bottom-right (Windows) or top-right (macOS/Linux)
/// corner near the tray/indicator area.
pub(crate) fn position_flyout_near_tray(
    win: &WebviewWindow,
    inner_w: f64,
    inner_h: f64,
) -> Result<(), String> {
    use crate::flyout::position::{compute_flyout_position, default_anchor_for_os};

    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| win.primary_monitor().ok().flatten())
        .ok_or("No monitor found")?;
    let scale = win.scale_factor().unwrap_or(1.0);

    let w = (inner_w * scale) as i32;
    let h = (inner_h * scale) as i32;
    let ws = monitor.size();
    let wp = monitor.position();

    let (x, y) = compute_flyout_position(
        wp.x, wp.y, ws.width as i32, ws.height as i32,
        w, h, default_anchor_for_os(), chrome_offset_for_os(),
    );

    win.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::Size::Physical(PhysicalSize::new(w as u32, h as u32)))
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 2: Replace the old `position_flyout_above_tray` call in `toggle_flyout`**

In the same file, inside `toggle_flyout`, replace every call to `position_flyout_above_tray(app, &win)?;` with `position_flyout_near_tray(&win, FLYOUT_GLANCE_W, FLYOUT_GLANCE_H)?;`.

Delete the old `position_flyout_above_tray` function.

- [ ] **Step 3: Update `toggle_flyout` to expect the window to exist**

In `toggle_flyout`, remove the lazy-create `else` branch (`WebviewWindowBuilder::new(...)` block inside `toggle_flyout`). Replace it with:

```rust
    let win = app
        .get_webview_window("flyout")
        .ok_or_else(|| "flyout window not built yet".to_string())?;
    let visible = win.is_visible().unwrap_or(false);
    if visible {
        log::info!("toggle_flyout: hiding");
        #[cfg(target_os = "windows")]
        super::click_outside::uninstall_hook();
        win.hide().map_err(|e| e.to_string())?;
    } else {
        log::info!("toggle_flyout: showing");
        position_flyout_near_tray(&win, FLYOUT_GLANCE_W, FLYOUT_GLANCE_H)?;
        win.show().map_err(|e| e.to_string())?;
        let _ = win.set_always_on_top(true);
        force_repaint(&win);
        let _ = win.set_focus();
        install_click_outside_hook(app, &win);
        let _ = app.emit_to("main", "flyout-request-data", ());
    }
    Ok(())
```

- [ ] **Step 4: Call `build_flyout_window` from `setup`**

In `src/BorgDock.Tauri/src-tauri/src/lib.rs`, inside the `.setup(|app| { ... })` closure, after `platform::tray::setup_tray(app)?;` and before the `register_fixed_hotkeys` call:

```rust
            if let Err(e) = platform::window::build_flyout_window(&app.handle().clone()) {
                log::error!("build_flyout_window failed: {e}");
            }
```

- [ ] **Step 5: Build and run**

Run:

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
cd src/BorgDock.Tauri && npm run tauri dev
```

Click tray icon. Expected: flyout opens **faster** than before (no lazy creation). Click tray again or outside — hides. No behavioral regression.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "feat(flyout): build window once at startup, reuse for every toggle"
```

---

### Task 7: Anchor-aware `resize_flyout` command

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`

- [ ] **Step 1: Add `resize_flyout` command**

In `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`, below `resize_badge`:

```rust
/// Resize the flyout and reposition so the correct corner stays anchored to
/// the tray/indicator area. On Windows (BottomRight anchor) the flyout's
/// bottom edge stays fixed relative to the taskbar; on macOS/Linux
/// (TopRight) the top edge stays fixed relative to the menu bar.
#[tauri::command]
pub async fn resize_flyout(
    app: tauri::AppHandle,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let win = app_for_run
                .get_webview_window("flyout")
                .ok_or_else(|| "flyout window not built".to_string())?;
            position_flyout_near_tray(&win, width as f64, height as f64)?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}
```

- [ ] **Step 2: Register the command in `lib.rs`**

Add to `invoke_handler!` near the existing `platform::window::*` entries:

```rust
            platform::window::resize_flyout,
```

- [ ] **Step 3: Build**

Run:

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(flyout): anchor-aware resize_flyout command"
```

---

### Task 8: Phase 2 PR marker

- [ ] **Step 1: Push and open PR**

Use the same `gh pr create` command template as Task 4, with:
- Title: `"Tray-first UX phase 2: persistent flyout + per-OS positioning"`
- Summary: flyout built once at startup, `resize_flyout` command added, per-OS anchor.
- Test plan: tray click and hotkey both open flyout; on macOS/Linux the flyout appears top-right.

---

# Phase 3 — Toast mode & notifications

Goal: notifications (check failed, review nudges, mergeable, etc.) deliver as BorgDock-styled toasts inside the flyout. OS toasts still fire in parallel; phase 5 removes them.

### Task 9: `ToastPayload` types + `show_flyout_toast` Rust command

**Files:**
- Create: `src/BorgDock.Tauri/src-tauri/src/flyout/toast.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/flyout/mod.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`

- [ ] **Step 1: Define the payload and the command**

Create `src/BorgDock.Tauri/src-tauri/src/flyout/toast.rs`:

```rust
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastAction {
    pub label: String,
    /// One of: "open-pr" | "fix-pr" | "monitor-pr" | "open-url" | "merge-pr" | "start-review"
    pub action: String,
    /// Optional URL payload for "open-url" / "start-review" actions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastPayload {
    /// Stable id so React can dedupe / animate. Use pr-key + event-type.
    pub id: String,
    /// "info" | "success" | "warning" | "error"
    pub severity: String,
    pub title: String,
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pr_owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pr_repo: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pr_number: Option<u32>,
    #[serde(default)]
    pub actions: Vec<ToastAction>,
}

/// Show the flyout in toast mode and emit the payload to the flyout webview.
/// Idempotent: if the flyout is already shown (glance or toast), we emit the
/// payload and let the React app decide how to render it (stack, banner).
#[tauri::command]
pub async fn show_flyout_toast(
    app: tauri::AppHandle,
    payload: ToastPayload,
) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let win = app_for_run
                .get_webview_window("flyout")
                .ok_or_else(|| "flyout window not built".to_string())?;
            if !win.is_visible().unwrap_or(false) {
                crate::platform::window::position_flyout_near_tray(&win, 340.0, 170.0)?;
                win.show().map_err(|e| e.to_string())?;
                let _ = win.set_always_on_top(true);
            }
            app_for_run
                .emit_to("flyout", "flyout-toast", &payload)
                .map_err(|e| e.to_string())?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}
```

- [ ] **Step 2: Expose the module + command**

In `src/BorgDock.Tauri/src-tauri/src/flyout/mod.rs`:

```rust
pub mod position;
pub mod toast;
```

In `src/BorgDock.Tauri/src-tauri/src/lib.rs`, `invoke_handler!`:

```rust
            flyout::toast::show_flyout_toast,
```

- [ ] **Step 3: Make `position_flyout_near_tray` `pub(crate)` if it isn't already**

In `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`, confirm the function is `pub(crate)`. If not, change `fn` to `pub(crate) fn`.

- [ ] **Step 4: Build**

Run:

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(flyout): show_flyout_toast command and ToastPayload types"
```

---

### Task 10: Flyout mode state machine (pure TS + tests)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/flyout/flyout-mode.ts`
- Create: `src/BorgDock.Tauri/src/components/flyout/__tests__/flyout-mode.test.ts`

- [ ] **Step 1: Write the test first**

Create `src/BorgDock.Tauri/src/components/flyout/__tests__/flyout-mode.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { ToastPayload } from '../flyout-mode';
import { reduceFlyoutMode, initialFlyoutMode, TOAST_MAX, TOAST_AUTOHIDE_MS } from '../flyout-mode';

const makeToast = (id: string, severity: ToastPayload['severity'] = 'info'): ToastPayload => ({
  id,
  severity,
  title: `title-${id}`,
  body: `body-${id}`,
  actions: [],
});

describe('reduceFlyoutMode', () => {
  it('starts in initializing', () => {
    expect(initialFlyoutMode.kind).toBe('initializing');
  });

  it('init-complete with no pending toasts becomes idle', () => {
    const next = reduceFlyoutMode(initialFlyoutMode, { type: 'init-complete' }, 1000);
    expect(next.kind).toBe('idle');
  });

  it('user-open from idle enters glance', () => {
    const next = reduceFlyoutMode({ kind: 'idle' }, { type: 'user-open' }, 1000);
    expect(next.kind).toBe('glance');
  });

  it('toast from idle enters toast with one queue item and deadline', () => {
    const t = makeToast('a');
    const next = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: t }, 1000);
    expect(next.kind).toBe('toast');
    if (next.kind !== 'toast') return;
    expect(next.queue).toHaveLength(1);
    expect(next.queue[0]!.id).toBe('a');
    expect(next.timerDeadline).toBe(1000 + TOAST_AUTOHIDE_MS);
  });

  it('toast while toast appends and resets deadline', () => {
    const first = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    const next = reduceFlyoutMode(first, { type: 'toast', payload: makeToast('b') }, 3000);
    expect(next.kind).toBe('toast');
    if (next.kind !== 'toast') return;
    expect(next.queue.map((t) => t.id)).toEqual(['a', 'b']);
    expect(next.timerDeadline).toBe(3000 + TOAST_AUTOHIDE_MS);
  });

  it('toast overflow evicts oldest past TOAST_MAX', () => {
    let m = { kind: 'idle' } as ReturnType<typeof reduceFlyoutMode>;
    for (let i = 0; i < TOAST_MAX + 1; i++) {
      m = reduceFlyoutMode(m, { type: 'toast', payload: makeToast(String(i)) }, 1000 + i);
    }
    expect(m.kind).toBe('toast');
    if (m.kind !== 'toast') return;
    expect(m.queue).toHaveLength(TOAST_MAX);
    expect(m.queue[0]!.id).toBe('1'); // '0' was evicted
  });

  it('toast while glance attaches banner, stays in glance, no timer', () => {
    const next = reduceFlyoutMode(
      { kind: 'glance' },
      { type: 'toast', payload: makeToast('x', 'warning') },
      2000,
    );
    expect(next.kind).toBe('glance');
    if (next.kind !== 'glance') return;
    expect(next.banner?.id).toBe('x');
  });

  it('user-open while toast transitions to glance', () => {
    const toastState = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    const next = reduceFlyoutMode(toastState, { type: 'user-open' }, 2000);
    expect(next.kind).toBe('glance');
  });

  it('close from any visible state goes to idle', () => {
    const toastState = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    expect(reduceFlyoutMode(toastState, { type: 'close' }, 2000).kind).toBe('idle');
    expect(reduceFlyoutMode({ kind: 'glance' }, { type: 'close' }, 2000).kind).toBe('idle');
  });

  it('timer-expired while toast goes to idle', () => {
    const toastState = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    const next = reduceFlyoutMode(toastState, { type: 'timer-expired' }, 1000 + TOAST_AUTOHIDE_MS + 1);
    expect(next.kind).toBe('idle');
  });

  it('hover-enter clears deadline; hover-leave resets it', () => {
    const toastState = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    const hovered = reduceFlyoutMode(toastState, { type: 'hover-enter' }, 2000);
    if (hovered.kind !== 'toast') throw new Error('expected toast');
    expect(hovered.timerDeadline).toBe(null);
    const left = reduceFlyoutMode(hovered, { type: 'hover-leave' }, 5000);
    if (left.kind !== 'toast') throw new Error('expected toast');
    expect(left.timerDeadline).toBe(5000 + TOAST_AUTOHIDE_MS);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run:

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/flyout/__tests__/flyout-mode.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the reducer**

Create `src/BorgDock.Tauri/src/components/flyout/flyout-mode.ts`:

```typescript
export const TOAST_MAX = 3;
export const TOAST_AUTOHIDE_MS = 7000;

export interface ToastAction {
  label: string;
  action: 'open-pr' | 'fix-pr' | 'monitor-pr' | 'open-url' | 'merge-pr' | 'start-review';
  url?: string;
}

export interface ToastPayload {
  id: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string;
  prOwner?: string;
  prRepo?: string;
  prNumber?: number;
  actions: ToastAction[];
}

export type FlyoutMode =
  | { kind: 'initializing' }
  | { kind: 'idle' }
  | { kind: 'glance'; banner?: ToastPayload }
  | { kind: 'toast'; queue: ToastPayload[]; timerDeadline: number | null };

export type FlyoutEvent =
  | { type: 'init-complete' }
  | { type: 'user-open' }
  | { type: 'toast'; payload: ToastPayload }
  | { type: 'close' }
  | { type: 'timer-expired' }
  | { type: 'hover-enter' }
  | { type: 'hover-leave' };

export const initialFlyoutMode: FlyoutMode = { kind: 'initializing' };

/**
 * Pure reducer — the single source of truth for flyout mode transitions.
 * `now` is injected so the timer deadline is testable without wall-clock.
 */
export function reduceFlyoutMode(mode: FlyoutMode, event: FlyoutEvent, now: number): FlyoutMode {
  switch (event.type) {
    case 'init-complete':
      return mode.kind === 'initializing' ? { kind: 'idle' } : mode;

    case 'user-open':
      return { kind: 'glance' };

    case 'close':
      return { kind: 'idle' };

    case 'toast': {
      if (mode.kind === 'glance') return { kind: 'glance', banner: event.payload };
      if (mode.kind === 'initializing') return mode;

      const prev = mode.kind === 'toast' ? mode.queue : [];
      const next = [...prev, event.payload];
      const trimmed = next.length > TOAST_MAX ? next.slice(next.length - TOAST_MAX) : next;
      return {
        kind: 'toast',
        queue: trimmed,
        timerDeadline: now + TOAST_AUTOHIDE_MS,
      };
    }

    case 'timer-expired':
      return mode.kind === 'toast' ? { kind: 'idle' } : mode;

    case 'hover-enter':
      return mode.kind === 'toast' ? { ...mode, timerDeadline: null } : mode;

    case 'hover-leave':
      return mode.kind === 'toast'
        ? { ...mode, timerDeadline: now + TOAST_AUTOHIDE_MS }
        : mode;
  }
}
```

- [ ] **Step 4: Run the tests — expect PASS**

Run:

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/flyout/__tests__/flyout-mode.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(flyout): pure mode-state reducer with TDD"
```

---

### Task 11: Extract `FlyoutGlance` from `FlyoutApp`

**Files:**
- Create: `src/BorgDock.Tauri/src/components/flyout/FlyoutGlance.tsx`
- Modify: `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx`

- [ ] **Step 1: Move the current glance-mode body into `FlyoutGlance.tsx`**

Create `src/BorgDock.Tauri/src/components/flyout/FlyoutGlance.tsx` containing the **entire body** currently returned by `FlyoutApp` (the `<div className="flex h-screen w-screen items-end justify-end">` and everything inside, plus all sub-components `PrRow`, `ReviewBadge`, `StatDot`, `IconButton`, `StatusIcon`, `CommentIcon`, `PanelRightOpenIcon`, `SettingsIcon`, `avatarColor`). Export as `export function FlyoutGlance({ data }: { data: FlyoutData }) { ... }`. Move the `FlyoutData` and `FlyoutPr` interfaces with it, re-exporting them.

Move the `handleOpenSidebar`, `handleOpenSettings`, `handleClickPr`, `handleFixPr`, `handleMonitorPr`, and `handleBackdropMouseDown` callbacks into `FlyoutGlance` (they're purely glance-mode concerns).

- [ ] **Step 2: Collapse `FlyoutApp` to a shell**

Replace the body of `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx` with a shell that:
- Owns the `data` state + the existing `flyout-update` event listener + `get_flyout_data` initial fetch (unchanged).
- Renders `<FlyoutGlance data={data} />` (no mode logic yet — Task 12 adds it).

The result: visual behavior is identical to before, but the code is split into two files.

- [ ] **Step 3: Run typecheck + lint**

Run:

```bash
cd src/BorgDock.Tauri && npm run build && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Smoke test**

Run:

```bash
cd src/BorgDock.Tauri && npm run tauri dev
```

Click tray. Flyout should render exactly as before.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor(flyout): extract FlyoutGlance from FlyoutApp"
```

---

### Task 12: Wire the mode state machine into `FlyoutApp`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx`
- Create: `src/BorgDock.Tauri/src/components/flyout/FlyoutInitializing.tsx`

- [ ] **Step 1: Create a minimal `FlyoutInitializing`**

Create `src/BorgDock.Tauri/src/components/flyout/FlyoutInitializing.tsx`:

```tsx
import { SplashScreen } from '@/components/SplashScreen';

/** Rendered inside the flyout frame while init is still running. */
export function FlyoutInitializing() {
  return (
    <div
      className="flex h-screen w-screen items-end justify-end"
      style={{ background: 'transparent', padding: 16 }}
    >
      <div
        className="w-[380px] overflow-hidden rounded-[14px] border"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-strong-border)',
          boxShadow: 'var(--flyout-shadow)',
          height: 480,
        }}
      >
        <SplashScreen />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire mode state into `FlyoutApp`**

Edit `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx` to:

1. `useReducer` over `reduceFlyoutMode` starting at `initialFlyoutMode`.
2. Listen for a new Tauri event `init-complete` → dispatch `{ type: 'init-complete' }`.
3. Listen for `flyout-toast` event → dispatch `{ type: 'toast', payload }`.
4. Detect "user-open" by listening to `flyout-request-data` (already emitted by `toggle_flyout`) → dispatch `{ type: 'user-open' }`. (Also fine to add a `flyout-user-open` event if `flyout-request-data` turns out to be ambiguous.)
5. Render based on `mode.kind`:
   - `'initializing'` → `<FlyoutInitializing />`
   - `'idle'` → `null`
   - `'glance'` → `<FlyoutGlance data={data} banner={mode.banner} />`
   - `'toast'` → `<FlyoutToast queue={mode.queue} onHover={...} onLeave={...} onExpire={...} onActionClick={...} />` (placeholder import — Task 13 creates the component).

Extend `FlyoutGlance` to accept an optional `banner?: ToastPayload` prop and render it as a thin severity-colored strip at the top of the panel when present. Keep it visual-only for now.

- [ ] **Step 3: Emit `init-complete` from main-window React on init finish**

In `src/BorgDock.Tauri/src/hooks/useInitSequence.ts`, after `store.markComplete()` in the success path, emit:

```typescript
import { emitTo } from '@tauri-apps/api/event';
// ...
await emitTo('flyout', 'init-complete', {});
```

(Import at top: `import { emitTo } from '@tauri-apps/api/event';`.)

- [ ] **Step 4: Build**

Run:

```bash
cd src/BorgDock.Tauri && npm run build
```

Expected: build fails at `FlyoutToast` import — that's next task. If other errors appear, fix them first.

- [ ] **Step 5: Temporarily stub `FlyoutToast`**

Create a placeholder `src/BorgDock.Tauri/src/components/flyout/FlyoutToast.tsx`:

```tsx
import type { ToastPayload } from './flyout-mode';

export function FlyoutToast(_props: {
  queue: ToastPayload[];
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onExpire: () => void;
  onActionClick: (toast: ToastPayload, action: string, url?: string) => void;
}) {
  return <div data-testid="flyout-toast-placeholder" />;
}
```

Re-run `npm run build`. Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "feat(flyout): wire mode reducer into FlyoutApp shell"
```

---

### Task 13: Implement `FlyoutToast` with timer + hover pause

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/flyout/FlyoutToast.tsx`
- Create: `src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutToast.test.tsx`

- [ ] **Step 1: Write the behavior test**

Create `src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutToast.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { FlyoutToast } from '../FlyoutToast';
import type { ToastPayload } from '../flyout-mode';
import { TOAST_AUTOHIDE_MS } from '../flyout-mode';

const makeToast = (id: string, overrides: Partial<ToastPayload> = {}): ToastPayload => ({
  id,
  severity: 'error',
  title: `Title ${id}`,
  body: `Body ${id}`,
  actions: [],
  ...overrides,
});

describe('FlyoutToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders one card per queue item', () => {
    render(
      <FlyoutToast
        queue={[makeToast('a'), makeToast('b')]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onExpire={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Title a')).toBeDefined();
    expect(screen.getByText('Title b')).toBeDefined();
  });

  it('fires onExpire after TOAST_AUTOHIDE_MS', () => {
    const onExpire = vi.fn();
    render(
      <FlyoutToast
        queue={[makeToast('a')]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onExpire={onExpire}
        onActionClick={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTOHIDE_MS + 10);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('pauses timer on mouse enter and resumes on leave', () => {
    const onExpire = vi.fn();
    render(
      <FlyoutToast
        queue={[makeToast('a')]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onExpire={onExpire}
        onActionClick={vi.fn()}
      />,
    );
    const card = screen.getByTestId('flyout-toast-card-a');
    act(() => {
      fireEvent.mouseEnter(card);
      vi.advanceTimersByTime(TOAST_AUTOHIDE_MS + 10);
    });
    expect(onExpire).not.toHaveBeenCalled();
    act(() => {
      fireEvent.mouseLeave(card);
      vi.advanceTimersByTime(TOAST_AUTOHIDE_MS + 10);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('invokes onActionClick with action + payload when a button is clicked', () => {
    const onActionClick = vi.fn();
    const t = makeToast('a', {
      actions: [{ label: 'Fix', action: 'fix-pr' }],
    });
    render(
      <FlyoutToast
        queue={[t]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onExpire={vi.fn()}
        onActionClick={onActionClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fix' }));
    expect(onActionClick).toHaveBeenCalledWith(t, 'fix-pr', undefined);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/flyout/__tests__/FlyoutToast.test.tsx
```

Expected: tests fail because `FlyoutToast` is a stub.

- [ ] **Step 3: Implement `FlyoutToast`**

Replace `src/BorgDock.Tauri/src/components/flyout/FlyoutToast.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { ToastPayload, ToastAction } from './flyout-mode';
import { TOAST_AUTOHIDE_MS } from './flyout-mode';

interface Props {
  queue: ToastPayload[];
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onExpire: () => void;
  onActionClick: (toast: ToastPayload, action: string, url?: string) => void;
}

export function FlyoutToast({ queue, onHoverEnter, onHoverLeave, onExpire, onActionClick }: Props) {
  const hoveredRef = useRef(false);

  useEffect(() => {
    if (queue.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (hoveredRef.current) return;
      timer = setTimeout(() => onExpire(), TOAST_AUTOHIDE_MS);
    };
    start();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [queue, onExpire]);

  return (
    <div
      className="flex h-screen w-screen items-end justify-end"
      style={{ background: 'transparent', padding: 16 }}
    >
      <div className="flex w-[320px] flex-col gap-2">
        {queue.map((toast) => (
          <div
            key={toast.id}
            data-testid={`flyout-toast-card-${toast.id}`}
            className="overflow-hidden rounded-[12px] border shadow-lg"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-strong-border)',
              boxShadow: 'var(--flyout-shadow)',
            }}
            onMouseEnter={() => {
              hoveredRef.current = true;
              onHoverEnter();
            }}
            onMouseLeave={() => {
              hoveredRef.current = false;
              onHoverLeave();
            }}
          >
            <div
              className="px-3 py-2 text-[11px] font-semibold text-white"
              style={{ background: severityColor(toast.severity) }}
            >
              {toast.title}
            </div>
            <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
              {toast.body}
            </div>
            {toast.actions.length > 0 && (
              <div className="flex gap-1.5 border-t px-3 py-2" style={{ borderColor: 'var(--color-subtle-border)' }}>
                {toast.actions.map((a) => (
                  <button
                    key={`${toast.id}-${a.action}`}
                    type="button"
                    onClick={() => onActionClick(toast, a.action, a.url)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      background: 'var(--color-surface-hover)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-subtle-border)',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function severityColor(s: ToastAction extends never ? never : ToastPayload['severity']): string {
  switch (s) {
    case 'error':
      return 'linear-gradient(90deg,#dc2646,#b01834)';
    case 'warning':
      return 'linear-gradient(90deg,#d97706,#b05800)';
    case 'success':
      return 'linear-gradient(90deg,#05966a,#046e4e)';
    case 'info':
    default:
      return 'linear-gradient(90deg,#7c6af6,#5b45e8)';
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

Run:

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/flyout/__tests__/FlyoutToast.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Wire `FlyoutToast` action click into the existing action dispatchers**

In `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx`, pass an `onActionClick` that mirrors the existing glance-mode handlers (`open_pr_detail_window`, `emitTo('main', 'flyout-fix-pr', …)`, etc.), switching on `action`. After any action click, dispatch `{ type: 'close' }` and `invoke('hide_flyout')`.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "feat(flyout): FlyoutToast with auto-hide timer and hover pause"
```

---

### Task 14: `sendOsNotification` → `show_flyout_toast` (OS toasts still fire)

**Files:**
- Modify: `src/BorgDock.Tauri/src/services/notification.ts`
- Modify: `src/BorgDock.Tauri/src/hooks/useStateTransitions.ts`
- Modify: `src/BorgDock.Tauri/src/services/__tests__/notification.test.ts`

- [ ] **Step 1: Update the existing notification test to expect both invokes**

Open `src/BorgDock.Tauri/src/services/__tests__/notification.test.ts`. In the `describe('sendOsNotification', …)` block around line 372, replace the assertion

```typescript
    expect(mockInvoke).toHaveBeenCalledWith('send_notification', {
```

with an assertion that **`show_flyout_toast` is called** with the mapped `ToastPayload`:

```typescript
    expect(mockInvoke).toHaveBeenCalledWith('show_flyout_toast', {
      payload: expect.objectContaining({
        title: expect.any(String),
        body: expect.any(String),
        severity: expect.any(String),
      }),
    });
```

Keep any additional assertion that `send_notification` is still invoked for now — both paths coexist in this phase. Phase 5 removes `send_notification`.

- [ ] **Step 2: Run the test — expect FAIL**

Run:

```bash
cd src/BorgDock.Tauri && npx vitest run src/services/__tests__/notification.test.ts
```

Expected: the modified test fails because `sendOsNotification` only invokes `send_notification` today.

- [ ] **Step 3: Update `sendOsNotification`**

Edit `src/BorgDock.Tauri/src/services/notification.ts`. Replace `sendOsNotification`:

```typescript
export async function sendOsNotification(options: OsNotificationOptions): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const severity = options.severity ?? 'info';
  const id =
    options.id ??
    (options.prOwner && options.prRepo && options.prNumber
      ? `${options.prOwner}/${options.prRepo}#${options.prNumber}`
      : `${options.title}-${Date.now()}`);
  const payload = {
    id,
    severity,
    title: options.title,
    body: options.body,
    prOwner: options.prOwner,
    prRepo: options.prRepo,
    prNumber: options.prNumber,
    actions: options.actions ?? [],
  };
  await invoke('show_flyout_toast', { payload });
  // Keep OS toast in parallel until phase 5 removes send_notification.
  await invoke('send_notification', {
    title: options.title,
    body: options.body,
    prOwner: options.prOwner,
    prRepo: options.prRepo,
    prNumber: options.prNumber,
    buttons: options.buttons,
  });
}
```

Add `severity` and `actions` to `OsNotificationOptions`:

```typescript
export interface OsNotificationOptions {
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  id?: string;
  prOwner?: string;
  prRepo?: string;
  prNumber?: number;
  buttons?: OsNotificationButton[];
  actions?: { label: string; action: string; url?: string }[];
}
```

- [ ] **Step 4: Remove the `isSidebarVisible` gate**

In `src/BorgDock.Tauri/src/hooks/useStateTransitions.ts` around line 113, remove the `if (!useUiStore.getState().isSidebarVisible) { … }` wrapper so `sendOsNotification` is always called.

Rationale: the sidebar is hidden-by-default in tray-first mode, so the gate is meaningless. In-app toasts (via `useNotificationStore.show`) continue to fire inside the sidebar when it's open; the flyout toast is the always-visible delivery.

- [ ] **Step 5: Run the test — expect PASS**

Run:

```bash
cd src/BorgDock.Tauri && npx vitest run src/services/__tests__/notification.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the whole unit test suite**

```bash
cd src/BorgDock.Tauri && npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "feat(notifications): route sendOsNotification through show_flyout_toast"
```

---

### Task 15: Phase 3 PR marker

- [ ] **Step 1: Push and open PR**

Title: `"Tray-first UX phase 3: in-flyout notification toasts"`. Summary: flyout now auto-opens with a toast on PR events; OS toasts still fire (removed in phase 5); state machine is tested.

---

# Phase 4 — Tray-first startup

Goal: no sidebar auto-shows on launch; tray icon animates during init; setup wizard still runs.

### Task 16: Main window off-screen at 1×1 on boot

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/tauri.conf.json`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`

- [ ] **Step 1: Flip `tauri.conf.json`**

In `src/BorgDock.Tauri/src-tauri/tauri.conf.json`, in the main window entry, add:

```json
        "visible": false,
```

Keep the existing size — it doesn't matter once Rust repositions.

- [ ] **Step 2: Add `park_main_offscreen` helper**

In `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`, above `show_main_window`:

```rust
/// Move the main window to a 1×1 off-screen position. Used so its React tree
/// keeps running (WebView2 throttles JS in hidden windows on Windows) without
/// being visible to the user. Called at startup and whenever the user hides
/// the sidebar.
pub(crate) fn park_main_offscreen(app: &tauri::AppHandle) -> Result<(), String> {
    let win = get_main_window(app)?;
    let scale = win.scale_factor().unwrap_or(1.0);
    let mon_x = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten())
        .map(|m| m.position().x)
        .unwrap_or(0);
    let off_x = mon_x - (32000.0 * scale) as i32;
    let off_y = -(32000.0 * scale) as i32;
    win.set_position(tauri::Position::Physical(PhysicalPosition::new(off_x, off_y)))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::Size::Physical(PhysicalSize::new(1, 1)))
        .map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    SIDEBAR_VISIBLE.store(false, Ordering::SeqCst);
    Ok(())
}
```

- [ ] **Step 3: Call `park_main_offscreen` from setup instead of `show()`**

In `src/BorgDock.Tauri/src-tauri/src/lib.rs`, inside the `.setup(|app| { ... })` closure, replace the existing

```rust
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
```

block with:

```rust
            if let Err(e) = platform::window::park_main_offscreen(&app.handle().clone()) {
                log::error!("park_main_offscreen failed: {e}");
            }
```

- [ ] **Step 4: Repurpose `hide_sidebar` to park instead of hide**

Edit `hide_main_window` in `platform/window.rs` so it calls `park_main_offscreen` instead of `win.hide()`:

```rust
pub(crate) fn hide_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    park_main_offscreen(app)
}
```

- [ ] **Step 5: Build and run**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
cd src/BorgDock.Tauri && npm run tauri dev
```

On launch: nothing visible. Tray icon appears. Press `Ctrl+Shift+Win+G` → sidebar docks to edge. Press again → sidebar disappears (parked off-screen). Press `Ctrl+Shift+Win+F` → flyout opens.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "feat(startup): park main window off-screen on launch"
```

---

### Task 17: `show_setup_wizard` path for first-run

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`
- Modify: `src/BorgDock.Tauri/src/App.tsx` (or wherever `needsSetup` is observed)

- [ ] **Step 1: Add `show_setup_wizard` command**

In `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`:

```rust
/// Resize the main window into a centered ~520×640 modal and show it. Used
/// on first run to host the setup wizard.
#[tauri::command]
pub async fn show_setup_wizard(app: tauri::AppHandle) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let win = get_main_window(&app_for_run)?;
            let scale = win.scale_factor().unwrap_or(1.0);
            win.set_size(tauri::Size::Physical(PhysicalSize::new(
                (520.0 * scale) as u32,
                (640.0 * scale) as u32,
            )))
            .map_err(|e| e.to_string())?;
            // Center on current monitor
            if let Ok(Some(monitor)) = win.current_monitor() {
                let mw = monitor.size().width as i32;
                let mh = monitor.size().height as i32;
                let mp = monitor.position();
                let ww = (520.0 * scale) as i32;
                let wh = (640.0 * scale) as i32;
                let x = mp.x + (mw - ww) / 2;
                let y = mp.y + (mh - wh) / 2;
                win.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)))
                    .map_err(|e| e.to_string())?;
            }
            win.show().map_err(|e| e.to_string())?;
            let _ = win.set_focus();
            SIDEBAR_VISIBLE.store(true, Ordering::SeqCst);
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
```

Register it in `lib.rs invoke_handler!`.

- [ ] **Step 2: Call it from React when setup is needed**

In `src/BorgDock.Tauri/src/App.tsx`, find where `needsSetup` is first computed (or inside the setup wizard's mount). On the first render that sees `needsSetup === true`, invoke `show_setup_wizard`:

```typescript
useEffect(() => {
  if (needsSetup) {
    void invoke('show_setup_wizard');
  } else {
    // When setup completes, return the window to off-screen parked state.
    void invoke('hide_sidebar');
  }
}, [needsSetup]);
```

- [ ] **Step 3: Manual verify**

Clear settings (`del "%APPDATA%\BorgDock\settings.json"`) and run `npm run tauri dev`. Expected: main window opens centered, 520×640, showing the setup wizard. Complete setup → main hides (parks off-screen). Press flyout hotkey → flyout shows normal glance.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(startup): show_setup_wizard centered modal on first run"
```

---

### Task 18: Tray `Initializing` state (static icon for now)

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/platform/tray.rs`

- [ ] **Step 1: Add the enum variant**

In `src/BorgDock.Tauri/src-tauri/src/platform/tray.rs`, edit `TrayWorstState`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrayWorstState {
    Failing,
    Pending,
    Passing,
    Idle,
    Initializing,
}
```

And in `as_u8`:

```rust
impl TrayWorstState {
    fn as_u8(&self) -> u8 {
        match self {
            TrayWorstState::Failing => 0,
            TrayWorstState::Pending => 1,
            TrayWorstState::Passing => 2,
            TrayWorstState::Idle => 3,
            TrayWorstState::Initializing => 4,
        }
    }
}
```

- [ ] **Step 2: Render it (static)**

In `status_gradient`:

```rust
        TrayWorstState::Idle => brand_gradient(dark),
        TrayWorstState::Initializing => brand_gradient(dark),
```

The distinguishing signal is the tooltip + the animation (next task). The initial render just matches idle.

- [ ] **Step 3: Default startup icon is Initializing**

In `setup_tray`, replace:

```rust
    let icon = render_tray_icon(0, TrayWorstState::Idle, dark);
```

with:

```rust
    let icon = render_tray_icon(0, TrayWorstState::Initializing, dark);
```

And set tooltip:

```rust
        .tooltip("BorgDock — loading…")
```

- [ ] **Step 4: Build**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(tray): Initializing state variant and startup tooltip"
```

---

### Task 19: Tray `Initializing` pulse animation

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/platform/tray.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`

- [ ] **Step 1: Add an atomic "is initializing" flag + an animator task**

In `tray.rs`, near the top:

```rust
use std::sync::atomic::AtomicBool;

static IS_INITIALIZING: AtomicBool = AtomicBool::new(true);
```

Below `render_tray_icon`, add:

```rust
/// Render the Initializing icon with a brightness pulse driven by phase
/// [0.0, 1.0]. Reuses the idle waveform with an alpha overlay.
pub(crate) fn render_initializing_icon(dark: bool, phase: f32) -> tauri::image::Image<'static> {
    // Re-render the idle icon, then blend a translucent overlay whose alpha
    // follows a triangle wave. Simple, cheap, and avoids introducing a new
    // drawing path.
    let mut img = render_tray_icon(0, TrayWorstState::Idle, dark);
    let overlay_alpha = (phase.sin().abs() * 120.0) as u8;
    // Image::into_bytes() is not exposed — easier to re-render directly with
    // a modified brand_gradient. For a triangle-wave alpha, mix toward white.
    // If perf matters later, cache frames.
    // Placeholder implementation: return the idle image unchanged. The real
    // animator below updates the tray at a lower frequency with a second set
    // of colors to simulate pulse. Leave visual polish for implementation
    // time — the wiring is what matters.
    let _ = overlay_alpha;
    img
}

/// Spawn a tokio task that updates the tray icon while IS_INITIALIZING is
/// true. The dedup cache (LAST_ICON_STATE) is intentionally bypassed here:
/// animated frames are not "state" and each tick must render.
pub fn start_initializing_animation(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let dark = app
            .get_webview_window("main")
            .and_then(|w| w.theme().ok())
            .map(|t| matches!(t, tauri::Theme::Dark))
            .unwrap_or(true);
        let mut phase: f32 = 0.0;
        while IS_INITIALIZING.load(Ordering::SeqCst) {
            phase += 0.2;
            if let Some(tray) = app.tray_by_id("main") {
                let icon = render_initializing_icon(dark, phase);
                let _ = tray.set_icon(Some(icon));
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    });
}

pub fn stop_initializing_animation() {
    IS_INITIALIZING.store(false, Ordering::SeqCst);
}
```

(The pulse visual can be tuned during implementation — the important thing is the lifecycle: start at boot, stop at init-complete, bypass the dedup cache.)

- [ ] **Step 2: Bypass `LAST_ICON_STATE` dedup while initializing**

In `update_tray_icon`, at the top of the function:

```rust
    if matches!(worst_state, TrayWorstState::Initializing) {
        // Animated frames are not "state" — don't dedup.
        let icon = render_tray_icon(count, worst_state, dark);
        if let Some(tray) = app.tray_by_id("main") {
            tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
```

And the **first time** a non-Initializing state arrives, call `stop_initializing_animation()`:

```rust
    stop_initializing_animation();
```

Insert that before the existing state-dedup logic in `update_tray_icon`.

- [ ] **Step 3: Start the animation in `setup`**

In `src/BorgDock.Tauri/src-tauri/src/lib.rs`, inside `.setup(|app| { ... })`, after `platform::tray::setup_tray(app)?;`:

```rust
            platform::tray::start_initializing_animation(app.handle().clone());
```

- [ ] **Step 4: Build and run**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
cd src/BorgDock.Tauri && npm run tauri dev
```

Observe: tray icon tooltip says "BorgDock — loading…" during init. When init completes, tooltip updates (via the existing `update_tray_tooltip` flow) and icon settles on real state.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(tray): pulse animation during init, bypass dedup cache"
```

---

### Task 20: Tray menu: "Show flyout" first

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/platform/tray.rs`

- [ ] **Step 1: Add the menu item**

In `setup_tray`, replace the existing `show` / `settings` / `whats_new` / `separator` / `quit` block with:

```rust
    let show_flyout = MenuItemBuilder::with_id("show_flyout", "Show flyout").build(app)?;
    let show_sidebar = MenuItemBuilder::with_id("show", "Show sidebar").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let whats_new = MenuItemBuilder::with_id("whats_new", "What's new…").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_flyout)
        .item(&show_sidebar)
        .item(&settings)
        .item(&whats_new)
        .item(&separator)
        .item(&quit)
        .build()?;
```

- [ ] **Step 2: Handle the new event**

In `.on_menu_event`, add the new arm at the top of the match:

```rust
            "show_flyout" => {
                let app_handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Err(e) = crate::platform::window::toggle_flyout(&app_handle) {
                        log::error!("tray show_flyout: {e}");
                    }
                });
            }
```

- [ ] **Step 3: Build and verify**

```bash
cd src/BorgDock.Tauri && npm run tauri dev
```

Right-click tray → verify menu order: Show flyout / Show sidebar / Settings / What's new… / (sep) / Quit. Click "Show flyout" → flyout opens.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(tray): 'Show flyout' is the first menu item"
```

---

### Task 21: Phase 4 PR marker

- [ ] **Step 1: Push and open PR**

Title: `"Tray-first UX phase 4: silent boot & tray initializing state"`. Summary: main window parked off-screen on boot, setup wizard runs as centered modal on first run, tray shows Initializing state during init, menu reorders.

---

# Phase 5 — Cleanup

Goal: remove dead code now that the flyout owns notifications.

### Task 22: Remove `send_notification` / `tauri-winrt-notification` / `notification.rs`

**Files:**
- Delete: `src/BorgDock.Tauri/src-tauri/src/notification.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/Cargo.toml`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`
- Modify: `src/BorgDock.Tauri/src/services/notification.ts`
- Modify: `src/BorgDock.Tauri/src/services/__tests__/notification.test.ts`

- [ ] **Step 1: Verify no remaining call sites**

Run:

```bash
grep -rn "send_notification" src/BorgDock.Tauri/src src/BorgDock.Tauri/src-tauri/src
```

Expected: only `notification.rs` (to be deleted), the invoke_handler entry, and the `notification.ts` compat-call added in Task 14.

- [ ] **Step 2: Remove compat-call from `notification.ts`**

In `src/BorgDock.Tauri/src/services/notification.ts::sendOsNotification`, delete the second `await invoke('send_notification', …)` block. The function should only invoke `show_flyout_toast`.

- [ ] **Step 3: Update the test**

In `src/BorgDock.Tauri/src/services/__tests__/notification.test.ts`, remove any assertion about `send_notification`. Keep only the `show_flyout_toast` assertion.

- [ ] **Step 4: Delete the Rust file and handler entry**

Delete `src/BorgDock.Tauri/src-tauri/src/notification.rs`.

In `src/BorgDock.Tauri/src-tauri/src/lib.rs`:
- Remove `mod notification;` (top of file)
- Remove `notification::send_notification,` from `invoke_handler!`

- [ ] **Step 5: Remove the Cargo dependency**

In `src/BorgDock.Tauri/src-tauri/Cargo.toml`, delete the line:

```toml
tauri-winrt-notification = "0.5"
```

(Adjust to whatever version string is actually present.)

- [ ] **Step 6: Build**

Run:

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
cd src/BorgDock.Tauri && npm run build && npm test && npm run lint
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "chore: remove send_notification, tauri-winrt-notification, osascript path"
```

---

### Task 23: Remove `useNotificationActions` hook and `notification-action` listener

**Files:**
- Delete: `src/BorgDock.Tauri/src/hooks/useNotificationActions.ts`
- Delete: `src/BorgDock.Tauri/src/hooks/__tests__/useNotificationActions.test.ts`
- Modify: `src/BorgDock.Tauri/src/App.tsx`

- [ ] **Step 1: Verify no remaining callers of the hook**

Run:

```bash
grep -rn "useNotificationActions" src/BorgDock.Tauri/src
```

Expected: only `App.tsx` and the hook/test files themselves.

- [ ] **Step 2: Remove the import and call from `App.tsx`**

In `src/BorgDock.Tauri/src/App.tsx`, remove the `import { useNotificationActions } from …` line and the `useNotificationActions()` call.

- [ ] **Step 3: Delete the hook and its test**

```bash
rm src/BorgDock.Tauri/src/hooks/useNotificationActions.ts
rm src/BorgDock.Tauri/src/hooks/__tests__/useNotificationActions.test.ts
```

- [ ] **Step 4: Build / test / lint**

```bash
cd src/BorgDock.Tauri && npm run build && npm test && npm run lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore: remove useNotificationActions hook; action dispatch lives in flyout"
```

---

### Task 24: Remove the `badge` window

**Files:**
- Delete: `src/BorgDock.Tauri/src/components/BadgeApp.tsx`
- Delete: `src/BorgDock.Tauri/src/badge-main.tsx`
- Delete: `src/BorgDock.Tauri/badge.html`
- Modify: `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`
- Modify: `src/BorgDock.Tauri/vite.config.ts` (remove badge entrypoint if present)
- Modify: `src/BorgDock.Tauri/src-tauri/src/settings/models.rs` (consider removing `badge_enabled` / `badge_style`)

- [ ] **Step 1: Confirm no remaining users**

Run:

```bash
grep -rn "set_badge_visible\|BadgeApp\|badge.html\|badge-main" src/BorgDock.Tauri
```

Expected: the definition files plus any vite config references; no usage elsewhere.

- [ ] **Step 2: Delete files**

```bash
rm src/BorgDock.Tauri/src/components/BadgeApp.tsx
rm src/BorgDock.Tauri/src/badge-main.tsx
rm src/BorgDock.Tauri/badge.html
```

- [ ] **Step 3: Remove Rust commands**

In `src/BorgDock.Tauri/src-tauri/src/platform/window.rs`, delete:

- `build_badge_window`
- `set_badge_visible`
- `hide_badge`
- `resize_badge`
- The `BADGE_DEFAULT_W` / `BADGE_DEFAULT_H` constants

In `src/BorgDock.Tauri/src-tauri/src/lib.rs invoke_handler!`, remove:

```rust
            platform::window::set_badge_visible,
            platform::window::hide_badge,
            platform::window::resize_badge,
```

- [ ] **Step 4: Remove badge entrypoint from vite config**

Open `src/BorgDock.Tauri/vite.config.ts`. In the `rollupOptions.input` map, delete the `badge` entry if present.

- [ ] **Step 5: Settings cleanup (optional but preferred)**

In `src/BorgDock.Tauri/src-tauri/src/settings/models.rs`, remove `badge_enabled`, `badge_style` fields and their defaults if no code references them. Verify with:

```bash
grep -rn "badge_enabled\|badgeEnabled\|badge_style\|badgeStyle" src/BorgDock.Tauri
```

- [ ] **Step 6: Build / test / lint**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
cd src/BorgDock.Tauri && npm run build && npm test && npm run lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "chore: remove badge window; flyout is the only tray-adjacent surface"
```

---

### Task 25: Phase 5 PR marker

- [ ] **Step 1: Push and open PR**

Title: `"Tray-first UX phase 5: cleanup"`. Summary: removed `send_notification` + `tauri-winrt-notification`, `notification-action` listener, `badge` window.

---

# Phase 6 — Verification

Goal: confirm the whole system works end-to-end.

### Task 26: Playwright smoke test

**Files:**
- Modify: `src/BorgDock.Tauri/tests/e2e/window-rendering.spec.ts` (or a new `tray-first.spec.ts`)

- [ ] **Step 1: Add a smoke test asserting no sidebar flash on boot**

Add an E2E test that:
- Launches the app with a pre-seeded settings file (setup_complete = true, one repo).
- Asserts that within 2 seconds after launch, the main window is either `visible: false` to the user (check via Tauri's window API) or sized 1×1.
- Asserts the flyout opens on `hide_flyout` (no-op) + `toggle_flyout` invoke and contains the glance-mode heading.

Full test template:

```typescript
import { expect, test } from '@playwright/test';

test('boots without showing the sidebar', async ({ page }) => {
  // The Playwright harness already launches the app — see existing
  // window-rendering.spec.ts for setup conventions.
  const size = await page.evaluate(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return (await getCurrentWindow().outerSize()).width;
  });
  expect(size).toBeLessThan(100); // parked off-screen at 1×1
});
```

(Adjust to the project's actual Playwright harness — the existing `window-rendering.spec.ts` is the reference.)

- [ ] **Step 2: Run**

```bash
cd src/BorgDock.Tauri && npm run test:e2e
```

Expected: pass.

- [ ] **Step 3: Manual cross-OS checklist**

Cover each in the PR description:

- [ ] Windows: boot shows no window; `Ctrl+Win+Shift+F` opens flyout; tray click opens flyout; notification fires as toast in flyout; setup wizard runs as centered modal on fresh install.
- [ ] macOS: flyout appears top-right (near menu bar); same events work.
- [ ] Linux (Ubuntu GNOME): flyout appears top-right (near indicator area); same events work.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "test(e2e): smoke test for tray-first boot"
```

---

### Task 27: Final PR marker

- [ ] **Step 1: Push and open the verification PR**

Title: `"Tray-first UX phase 6: verification"`. Summary: smoke test + manual cross-OS confirmation.

---

## Self-review checklist (already applied)

- **Spec coverage**: every requirement in the spec maps to a task — settings model (Task 1), hotkey (Task 2), settings UI (Task 3), persistent flyout (Task 6), per-OS position (Task 5), resize_flyout (Task 7), show_flyout_toast (Task 9), reducer (Task 10), glance extraction (Task 11), mode wiring (Task 12), toast + timer (Task 13), notification routing (Task 14), off-screen main (Task 16), setup wizard (Task 17), tray Initializing (Tasks 18–19), tray menu (Task 20), cleanup (Tasks 22–24), verification (Task 26).
- **Placeholder scan**: no "TBD" / "implement later" — every code block is concrete. The only visual polish deferred is the exact pulse animation shading inside `render_initializing_icon`, which is noted as tune-during-implementation.
- **Type consistency**: `ToastPayload` / `ToastAction` shapes are identical in Rust (serde camelCase) and TS.  `reduceFlyoutMode` / `FlyoutMode` / `FlyoutEvent` are consistent across the reducer tests and the `FlyoutApp` wiring. `TrayWorstState::Initializing` is added in one place (tray.rs) and consumed in one place (tray.rs + tray startup).
- **Ambiguity check**: the "glance with banner" render is called out as a visual addition to `FlyoutGlance` in Task 12; the component signature change is explicit. `hide_sidebar` becoming "park off-screen" is flagged in Task 16 and the spec adjustments note preserves that intent.
