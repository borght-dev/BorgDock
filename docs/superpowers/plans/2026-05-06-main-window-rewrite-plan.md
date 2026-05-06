# Main Window Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert BorgDock's main "main" Tauri window from a docked sidebar into a regular floating, resizable window with three tabs (Focus / PRs / Work Items). Implement Work Items as a 3-pane layout. Drop dock-to-edge mode entirely.

**Architecture:** A single Tauri "main" window with custom (non-OS) titlebar containing section tabs in the middle, window controls on the right. Close → hides to tray (window keeps running for polling). Section content is React-routed by `activeSection` (`useUiStore`). Window state (size/position/maximized) persisted via `tauri-plugin-window-state`.

**Tech Stack:** Tauri 2, React 19, TypeScript, Vitest, Tailwind, existing `bd-*` design tokens, existing primitives in `src/components/shared/primitives/`.

**Spec:** `docs/superpowers/specs/2026-05-06-main-window-rewrite-design.md`

---

## Conventions for every task

- **Working directory:** `E:\BorgDock\src\BorgDock.Tauri` for all `npm` / `vitest` / TypeScript paths. `E:\BorgDock\src\BorgDock.Tauri\src-tauri` for `cargo`. Paths in this plan are repo-relative starting from `src/BorgDock.Tauri/`.
- **TDD:** When a task includes a unit test, write the test first, run it (FAIL), then implement, then re-run (PASS). For pure visual restyles where assertion is awkward, the task explicitly says "no unit test — visually verify in storybook/dev."
- **Commits:** Each task ends with a single commit. Commit message format: lowercase imperative, no prefix (matches existing repo style: `storybook phase 6: work item detail catalog`).
- **Path separators:** Bash/PowerShell tolerates either. The plan uses forward slashes.
- **Cargo on Windows:** if invoking `cargo check` from Git Bash, prepend `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` (per CLAUDE.md). PowerShell doesn't need this.
- **Type-check + lint** after non-trivial frontend changes: `npm run build` (catches TS errors) and `npm run lint`.
- **Don't mention badge "deletion"**: the badge window has already been removed in a prior commit. Only `useBadgeSync.ts` (a misnamed flyout-sync hook), the `badge.json` capability file (orphaned), and Header's "Minimize to badge" button remain. The plan handles each explicitly.

---

# Phase 1 — Tauri / Rust foundation

Goal: regular window framing, window-state persistence, close-to-hide, and removal of dock-to-edge code.

## Task 1.1: Install `tauri-plugin-window-state`

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json`

- [ ] **Step 1: Add Rust dep**

In `src-tauri/Cargo.toml`, add to `[dependencies]` (alphabetical):
```toml
tauri-plugin-window-state = "2"
```

- [ ] **Step 2: Add JS dep**

```bash
cd src/BorgDock.Tauri && npm install @tauri-apps/plugin-window-state
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```
Expected: success (`Finished` line; warnings OK).

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/Cargo.toml src/BorgDock.Tauri/src-tauri/Cargo.lock src/BorgDock.Tauri/package.json src/BorgDock.Tauri/package-lock.json
git commit -m "deps: add tauri-plugin-window-state"
```

---

## Task 1.2: Register window-state plugin and grant capability

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/main.json`

- [ ] **Step 1: Register plugin in lib.rs**

In `src-tauri/src/lib.rs`, find the existing `tauri::Builder::default()` chain in `pub fn run()`. Add the plugin registration alongside other `.plugin(...)` calls (e.g., right after `.plugin(tauri_plugin_log::Builder::new()...)` or wherever existing plugins are registered):
```rust
.plugin(tauri_plugin_window_state::Builder::default().build())
```

- [ ] **Step 2: Grant capability**

In `src-tauri/capabilities/main.json`, add `"window-state:default"` to the `permissions` array (alphabetical order in the existing list).

- [ ] **Step 3: Verify compile**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/lib.rs src/BorgDock.Tauri/src-tauri/capabilities/main.json
git commit -m "wire tauri-plugin-window-state into main window"
```

---

## Task 1.3: Rewrite main window definition in tauri.conf.json

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Replace the main window block**

Find the `app.windows[0]` entry (label "main"). Replace it with:
```json
{
  "title": "BorgDock",
  "label": "main",
  "width": 1100,
  "height": 760,
  "minWidth": 720,
  "minHeight": 520,
  "decorations": false,
  "resizable": true,
  "transparent": false,
  "shadow": true,
  "center": true,
  "skipTaskbar": false,
  "visible": false,
  "url": "index.html"
}
```

(Removed: `alwaysOnTop`, the docked-sidebar size 400×900. Added: `minWidth`/`minHeight`, `resizable: true`, `shadow: true`, `center: true`, `skipTaskbar: false`. `transparent: false` confirmed.)

- [ ] **Step 2: Sanity check JSON**

```bash
cd src/BorgDock.Tauri && node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'))"
```
Expected: silent success.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/tauri.conf.json
git commit -m "main window: regular floating window framing (1100x760, resizable, shadowed)"
```

---

## Task 1.4: Add close-to-hide behavior on the main window

**Files:**
- Modify: `src-tauri/src/lib.rs`

The current main window's `WindowEvent::CloseRequested` (if any) probably exits the app. We change it to: prevent default close → hide.

- [ ] **Step 1: Inspect existing window-event handling**

```bash
cd src/BorgDock.Tauri && grep -n "CloseRequested\|on_window_event\|setup\|run_event" src-tauri/src/lib.rs | head -40
```
Expected: locate where setup/window-event lambdas live.

- [ ] **Step 2: Add or extend the on_window_event handler**

In `src-tauri/src/lib.rs`, on the `tauri::Builder` chain, add (or extend if present) `.on_window_event(...)`:
```rust
.on_window_event(|window, event| {
    if window.label() == "main" {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window.hide();
        }
    }
})
```

If an `.on_window_event(...)` already exists, merge this branch into the existing one (don't add a second).

- [ ] **Step 3: Compile**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "main window: intercept close → hide to tray"
```

---

## Task 1.5: Add show/focus/toggle helpers and wire them up

We replace `toggle_sidebar` (which assumed dock math) with a generic `show_or_focus_main` that the global hotkey + tray icon click both call.

**Files:**
- Modify: `src-tauri/src/platform/window.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/platform/tray.rs`

- [ ] **Step 1: Add the new helper to platform/window.rs**

At the bottom of `src-tauri/src/platform/window.rs` (above `get_main_window`):
```rust
/// Show the main window if hidden, focus it if shown-but-unfocused, or hide it
/// if it's the foreground window. Replaces the old `toggle_sidebar`.
#[tauri::command]
pub async fn show_or_focus_main(app: tauri::AppHandle) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let win = app_for_run
                .get_webview_window("main")
                .ok_or_else(|| "main window not found".to_string())?;
            let visible = win.is_visible().unwrap_or(false);
            let focused = win.is_focused().unwrap_or(false);
            if !visible {
                win.show().map_err(|e| e.to_string())?;
                let _ = win.unminimize();
                win.set_focus().map_err(|e| e.to_string())?;
            } else if !focused {
                win.set_focus().map_err(|e| e.to_string())?;
            } else {
                win.hide().map_err(|e| e.to_string())?;
            }
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
```

- [ ] **Step 2: Register the command in lib.rs**

In `src-tauri/src/lib.rs`, find `.invoke_handler(tauri::generate_handler![...])` and add `platform::window::show_or_focus_main` to the list (alphabetical or end — match existing style).

- [ ] **Step 3: Update tray icon click handler**

In `src-tauri/src/platform/tray.rs`, find the tray icon click handler (often inside an `.on_tray_icon_event(...)` lambda or similar). It currently likely calls `toggle_sidebar` or `show_main_window`. Replace with a call to a Rust-side helper that mirrors `show_or_focus_main`. If the handler is async-incompatible, factor a synchronous helper:

In `platform/window.rs`, also add (alongside `show_or_focus_main`):
```rust
/// Synchronous variant for use inside tray callbacks (already on main thread).
pub(crate) fn show_or_focus_main_sync(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let visible = win.is_visible().unwrap_or(false);
        let focused = win.is_focused().unwrap_or(false);
        if !visible {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        } else if !focused {
            let _ = win.set_focus();
        } else {
            let _ = win.hide();
        }
    }
}
```

In `tray.rs`, replace any tray-left-click invocation of `toggle_sidebar`/`show_main_window` with `crate::platform::window::show_or_focus_main_sync(&app);`.

- [ ] **Step 4: Compile**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/platform/window.rs src/BorgDock.Tauri/src-tauri/src/lib.rs src/BorgDock.Tauri/src-tauri/src/platform/tray.rs
git commit -m "rust: add show_or_focus_main helper, wire tray + (next) hotkey"
```

---

## Task 1.6: Wire global hotkey to show_or_focus_main

**Files:**
- Modify: `src-tauri/src/platform/hotkey.rs` (or whichever file registers the global hotkey — find with `grep -rn register.*shortcut src-tauri/src`)

- [ ] **Step 1: Locate the hotkey handler**

```bash
cd src/BorgDock.Tauri && grep -rn "register.*shortcut\|GlobalShortcutManager\|on_shortcut\|shortcut.*handler" src-tauri/src | head -10
```

- [ ] **Step 2: Replace toggle_sidebar invocation in the hotkey lambda**

Inside the global-hotkey callback, replace any call to `toggle_sidebar` or its inner equivalents with:
```rust
crate::platform::window::show_or_focus_main_sync(app_handle);
```

(Use whichever local name the surrounding code uses for the `AppHandle`.)

- [ ] **Step 3: Compile**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/platform/hotkey.rs
git commit -m "rust: route global hotkey through show_or_focus_main"
```

---

## Task 1.7: Delete dock-position Rust code

**Files:**
- Modify: `src-tauri/src/platform/window.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/platform/mod.rs`

- [ ] **Step 1: Remove dock-position code**

In `src-tauri/src/platform/window.rs`, delete:
- `apply_sidebar_position` fn (around line 621)
- `position_sidebar` command (around line 263)
- `toggle_sidebar` command (around line 269)
- `hide_sidebar` command (around line 275)
- `park_main_offscreen` fn (around line 23)
- `show_main_window` and `hide_main_window` if no callers remain (verify with `grep -n` first; if other modules call them, keep stubs that call `.show()` / `.hide()`)
- `SIDEBAR_VISIBLE` static + `sidebar_visible()` (lines 11-17)

Also delete the old block comment about "transparent + always-on-top WebView2" — no longer relevant.

- [ ] **Step 2: Remove command registrations from lib.rs**

In `src-tauri/src/lib.rs` `invoke_handler!`, remove:
- `platform::window::position_sidebar`
- `platform::window::toggle_sidebar`
- `platform::window::hide_sidebar`

Keep: `show_or_focus_main`, `window_ready`, all `flyout`/`pr_detail`/etc commands.

- [ ] **Step 3: Re-export cleanup in platform/mod.rs**

In `src-tauri/src/platform/mod.rs`, remove any `pub use ... position_sidebar` / `toggle_sidebar` / `hide_sidebar` re-exports if present.

- [ ] **Step 4: Compile and fix any remaining references**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check 2>&1 | tail -40
```
Expected: success, or a small list of unresolved references — chase each one to its file and either delete the line or convert to the new helper.

Likely remaining: `crate::settings::load_settings_internal` may still be called by `show_main_window`'s old body; if `show_main_window` no longer exists, that's fine.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/platform/window.rs src/BorgDock.Tauri/src-tauri/src/lib.rs src/BorgDock.Tauri/src-tauri/src/platform/mod.rs
git commit -m "rust: remove dock-to-edge sidebar code (position_sidebar, hide_sidebar, toggle_sidebar)"
```

---

## Task 1.8: Drop sidebar fields from Rust settings model

**Files:**
- Modify: `src-tauri/src/settings/models.rs`

- [ ] **Step 1: Find the UiSettings struct**

```bash
cd src/BorgDock.Tauri && grep -n "sidebar_edge\|sidebar_mode\|sidebar_width" src-tauri/src/settings/models.rs
```

- [ ] **Step 2: Delete the three fields**

In `src-tauri/src/settings/models.rs`, in the struct(s) holding UI settings, remove:
- `sidebar_edge: ...`
- `sidebar_mode: ...`
- `sidebar_width_px: ...`

Also remove the `SidebarEdge` / `SidebarMode` enum types if nothing else uses them (check with `grep -rn "SidebarEdge\|SidebarMode" src-tauri/src`).

`#[serde(default)]` on the struct ensures stale config files load fine — extra unknown fields are silently ignored by serde.

- [ ] **Step 3: Compile**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check 2>&1 | tail -20
```
Expected: success. If failures, they'll be other Rust files referencing those fields — most likely already removed in 1.7.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/settings/models.rs
git commit -m "settings: drop sidebar_edge / sidebar_mode / sidebar_width_px fields"
```

---

## Task 1.9: Delete dead badge capability file

**Files:**
- Delete: `src-tauri/capabilities/badge.json`

- [ ] **Step 1: Verify badge window is not registered anywhere**

```bash
cd src/BorgDock.Tauri && grep -rn "\"badge\"" src-tauri/ tauri.conf.json 2>&1 | grep -v capabilities/badge.json
```
Expected: no results (the badge window definition is already gone).

- [ ] **Step 2: Delete the file**

```bash
rm src/BorgDock.Tauri/src-tauri/capabilities/badge.json
```

- [ ] **Step 3: Compile**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A src/BorgDock.Tauri/src-tauri/capabilities/badge.json
git commit -m "cleanup: remove orphaned badge capability file"
```

---

# Phase 2 — Frontend settings cleanup

## Task 2.1: Drop sidebar fields from TS settings types

**Files:**
- Modify: `src/types/settings.ts`

- [ ] **Step 1: Find the fields**

```bash
cd src/BorgDock.Tauri && grep -n "sidebarEdge\|sidebarMode\|sidebarWidthPx\|SidebarEdge\|SidebarMode" src/types/settings.ts
```

- [ ] **Step 2: Remove fields and types**

In `src/types/settings.ts`:
- Delete the three fields from `UiSettings`: `sidebarEdge`, `sidebarMode`, `sidebarWidthPx`.
- Delete the `SidebarEdge` and `SidebarMode` type aliases if defined here.

- [ ] **Step 3: Find consumers**

```bash
cd src/BorgDock.Tauri && grep -rn "sidebarEdge\|sidebarMode\|sidebarWidthPx\|SidebarEdge\|SidebarMode" src/ 2>&1 | head -20
```
Expected: list of remaining references (will be fixed in 2.2 + 2.3).

- [ ] **Step 4: Don't compile yet — Task 2.2 will fix the consumers in the same logical commit**

Move on without committing.

---

## Task 2.2: Remove the "Sidebar" card from AppearanceSection

**Files:**
- Modify: `src/components/settings/AppearanceSection.tsx`
- Modify: `src/components/settings/__tests__/AppearanceSection.test.tsx`

- [ ] **Step 1: Edit AppearanceSection.tsx**

Open `src/components/settings/AppearanceSection.tsx`. Delete the entire `<Card variant="default" padding="md">` block that starts with `<h3>Sidebar</h3>` (around lines 34-71 in the current file). Also remove the imports for `SidebarEdge` and `SidebarMode` from the `import type { ... } from '@/types/settings'` line at the top.

- [ ] **Step 2: Update tests**

```bash
cd src/BorgDock.Tauri && grep -n "sidebar\|Sidebar" src/components/settings/__tests__/AppearanceSection.test.tsx
```
Remove any test cases that assert presence of the Sidebar card / its three fields. If a test renders the section and expects "Sidebar" header text, delete that test. Keep theme/hotkey/startup tests.

- [ ] **Step 3: Run tests for this file**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/settings/__tests__/AppearanceSection.test.tsx
```
Expected: PASS.

- [ ] **Step 4: Commit (combines 2.1 + 2.2)**

```bash
git add src/BorgDock.Tauri/src/types/settings.ts src/BorgDock.Tauri/src/components/settings/AppearanceSection.tsx src/BorgDock.Tauri/src/components/settings/__tests__/AppearanceSection.test.tsx
git commit -m "settings: remove sidebar edge/mode/width controls and types"
```

---

## Task 2.3: Strip remaining sidebar references in App.tsx and stores

**Files:**
- Modify: `src/App.tsx`
- Possibly modify: `src/stores/settings-store.ts`, `src/stores/__tests__/settings-store.test.ts`, other files surfaced by grep

- [ ] **Step 1: Locate remaining references**

```bash
cd src/BorgDock.Tauri && grep -rn "sidebarEdge\|sidebarMode\|sidebarWidthPx\|position_sidebar\|hide_sidebar\|toggle_sidebar" src/ 2>&1 | head -30
```

- [ ] **Step 2: Fix App.tsx**

In `src/App.tsx`:
- Delete the `useEffect` block that calls `invoke('position_sidebar', ...)` (around lines 234-244).
- Delete the `useEffect` block that calls `invoke('hide_sidebar')` after setup completes (around lines 106-120). The window's default `visible: false` + `window_ready` reveal flow handles startup visibility.
- In `Header.tsx`'s minimize handler (called from `App.tsx` indirectly), replace `invoke('hide_sidebar')` with `invoke('show_or_focus_main')` — Task 3.x will redo Header anyway, but keep the codebase compiling for now. Or simpler: leave the call as-is and accept a runtime warning until Phase 3 deletes Header.

- [ ] **Step 3: Fix store/test references**

For each file in the grep output, delete or update references. Most should be in test fixtures (default settings objects) — remove the three keys.

- [ ] **Step 4: Type-check**

```bash
cd src/BorgDock.Tauri && npm run build 2>&1 | tail -30
```
Expected: success.

- [ ] **Step 5: Run unit tests**

```bash
cd src/BorgDock.Tauri && npm test 2>&1 | tail -30
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/BorgDock.Tauri/src
git commit -m "frontend: remove dock-sidebar references from App + stores + fixtures"
```

---

# Phase 3 — Main window shell

Goal: replace the `<Sidebar>` chrome with a `<MainWindow>` that has section tabs in a custom titlebar and proper window controls. Fold `Header.tsx` and `FilterBar.tsx`/`SearchBar.tsx` away.

## Task 3.1: Add `middle` slot to TitleBar primitive

**Files:**
- Modify: `src/components/shared/primitives/Titlebar.tsx`
- Test: `src/components/shared/primitives/__tests__/Titlebar.test.tsx` (create if absent)

- [ ] **Step 1: Write failing test**

Create or extend `src/components/shared/primitives/__tests__/Titlebar.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { TitleBar } from '../Titlebar';

describe('TitleBar', () => {
  it('renders middle slot between two growing spacers', () => {
    render(
      <TitleBar
        left={<span>L</span>}
        middle={<span data-testid="mid">M</span>}
        right={<span>R</span>}
      />,
    );
    const mid = screen.getByTestId('mid');
    expect(mid).toBeInTheDocument();
    // Sibling spacer immediately before middle should have flex:1
    const prev = mid.parentElement?.previousElementSibling as HTMLElement | null;
    expect(prev).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — should fail (no `middle` prop yet)**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/shared/primitives/__tests__/Titlebar.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/components/shared/primitives/Titlebar.tsx`, extend `TitleBarProps`:
```ts
/** Optional middle slot. When supplied, layout becomes:
 *  [left] [grow-spacer] [middle] [grow-spacer] [right]. */
middle?: ReactNode;
```

Update the JSX:
```tsx
return (
  <div className={clsx('bd-title-bar', className)} {...rest}>
    {left ?? (
      <>
        {title !== undefined && <span className="bd-title-bar__title">{title}</span>}
        {count !== undefined && <span className="bd-title-bar__count">{count}</span>}
        {meta !== undefined && <span className="bd-title-bar__meta">{meta}</span>}
      </>
    )}
    <span className="bd-title-bar__spacer" />
    {middle && (
      <>
        <span data-bd-titlebar-middle="">{middle}</span>
        <span className="bd-title-bar__spacer" />
      </>
    )}
    {right}
  </div>
);
```

- [ ] **Step 4: Re-run test**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/shared/primitives/__tests__/Titlebar.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/Titlebar.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Titlebar.test.tsx
git commit -m "primitives: TitleBar middle slot for centered content"
```

---

## Task 3.2: Add `WindowControls` primitive

**Files:**
- Create: `src/components/shared/primitives/WindowControls.tsx`
- Modify: `src/components/shared/primitives/index.ts`
- Test: `src/components/shared/primitives/__tests__/WindowControls.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/shared/primitives/__tests__/WindowControls.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

import { WindowControls } from '../WindowControls';
import { getCurrentWindow } from '@tauri-apps/api/window';

describe('WindowControls', () => {
  it('renders three buttons and wires them to window APIs', () => {
    render(<WindowControls />);
    const min = screen.getByLabelText('Minimize');
    const max = screen.getByLabelText('Maximize');
    const close = screen.getByLabelText('Close');
    fireEvent.click(min);
    fireEvent.click(max);
    fireEvent.click(close);
    const win = getCurrentWindow() as ReturnType<typeof getCurrentWindow> & {
      minimize: ReturnType<typeof vi.fn>;
      toggleMaximize: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
    expect(win.minimize).toHaveBeenCalled();
    expect(win.toggleMaximize).toHaveBeenCalled();
    expect(win.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/shared/primitives/__tests__/WindowControls.test.tsx
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `src/components/shared/primitives/WindowControls.tsx`:
```tsx
import { getCurrentWindow } from '@tauri-apps/api/window';

const MinusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M4 8h8" />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="10" height="10" rx="1" />
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export function WindowControls() {
  const win = getCurrentWindow();
  return (
    <div className="bd-window-controls">
      <button
        type="button"
        className="bd-window-control"
        aria-label="Minimize"
        onClick={() => void win.minimize()}
      >
        <MinusIcon />
      </button>
      <button
        type="button"
        className="bd-window-control"
        aria-label="Maximize"
        onClick={() => void win.toggleMaximize()}
      >
        <MaximizeIcon />
      </button>
      <button
        type="button"
        className="bd-window-control bd-window-control--close"
        aria-label="Close"
        onClick={() => void win.close()}
      >
        <XIcon />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Add CSS for the buttons**

Append to `src/styles/index.css` (or the file that owns `.bd-title-bar` — find with `grep -n "bd-title-bar" src/styles`):
```css
.bd-window-controls {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
}
.bd-window-control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border-radius: 4px;
  background: transparent;
  border: 0;
  color: var(--color-text-tertiary);
  cursor: pointer;
}
.bd-window-control:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}
.bd-window-control--close:hover {
  background: var(--color-status-red);
  color: #fff;
}
```

- [ ] **Step 5: Export**

In `src/components/shared/primitives/index.ts`, add:
```ts
export { WindowControls } from './WindowControls';
```

- [ ] **Step 6: Re-run test**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/shared/primitives/__tests__/WindowControls.test.tsx
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/shared/primitives/WindowControls.tsx src/BorgDock.Tauri/src/components/shared/primitives/__tests__/WindowControls.test.tsx src/BorgDock.Tauri/src/components/shared/primitives/index.ts src/BorgDock.Tauri/src/styles/index.css
git commit -m "primitives: WindowControls (min / max / close)"
```

---

## Task 3.3: Add `useStatusBar` hook

**Files:**
- Create: `src/hooks/useStatusBar.ts`
- Test: `src/hooks/__tests__/useStatusBar.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/hooks/__tests__/useStatusBar.test.ts`:
```ts
import { renderHook } from '@testing-library/react';
import { useStatusBar } from '../useStatusBar';

describe('useStatusBar', () => {
  it('returns Focus copy', () => {
    const { result } = renderHook(() => useStatusBar('focus'));
    expect(result.current.left).toMatch(/focus/i);
    expect(result.current.right).toMatch(/Quick Review/i);
  });
  it('returns PRs copy with rate', () => {
    const { result } = renderHook(() => useStatusBar('prs'));
    expect(result.current.left).toMatch(/synced/i);
    expect(result.current.right).toMatch(/F7|F8|F9/);
  });
  it('returns Work Items copy', () => {
    const { result } = renderHook(() => useStatusBar('workitems'));
    expect(result.current.left).toMatch(/ado:/i);
    expect(result.current.right).toMatch(/F9/i);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd src/BorgDock.Tauri && npx vitest run src/hooks/__tests__/useStatusBar.test.ts
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `src/hooks/useStatusBar.ts`:
```ts
import { useSettingsStore } from '@/stores/settings-store';
import { usePrStore } from '@/stores/pr-store';
import type { ActiveSection } from '@/stores/ui-store';

export interface StatusBarCopy {
  left: string;
  right: string;
}

function ago(ms: number | null | undefined): string {
  if (!ms) return 'never';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function useStatusBar(section: ActiveSection): StatusBarCopy {
  const lastSyncMs = usePrStore((s) => s.lastSyncMs);
  const rate = usePrStore((s) => s.rateLimit);
  const adoOrg = useSettingsStore((s) => s.settings.azureDevOps.organization);
  const adoProject = useSettingsStore((s) => s.settings.azureDevOps.project);

  switch (section) {
    case 'focus':
      return {
        left: 'focus computed just now · weights from settings',
        right: 'Press R for Quick Review',
      };
    case 'prs': {
      const ratePart = rate ? ` · rate ${rate.used}/${rate.limit}` : '';
      return {
        left: `synced ${ago(lastSyncMs)}${ratePart}`,
        right: 'Ctrl+F7 worktrees · Ctrl+F8 files · Ctrl+F9 ADO',
      };
    }
    case 'workitems':
      return {
        left: `ado: ${adoOrg || '—'}/${adoProject || '—'}`,
        right: 'Ctrl+F9 command palette',
      };
  }
}
```

(If `pr-store` doesn't have `lastSyncMs` or `rateLimit` selectors, swap to whatever it does export; the hook just needs to compile. Use `usePrStore.getState()` keys to discover. If a field doesn't exist, fall back to a static string and TODO won't matter — the user can refine.)

- [ ] **Step 4: Re-run test**

```bash
cd src/BorgDock.Tauri && npx vitest run src/hooks/__tests__/useStatusBar.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/hooks/useStatusBar.ts src/BorgDock.Tauri/src/hooks/__tests__/useStatusBar.test.ts
git commit -m "hooks: useStatusBar for per-section status bar copy"
```

---

## Task 3.4: Restyle `StatusBar` to accept left/right props

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`

- [ ] **Step 1: Read current implementation**

```bash
cd src/BorgDock.Tauri && cat src/components/layout/StatusBar.tsx
```

- [ ] **Step 2: Replace with prop-driven version**

Replace `src/components/layout/StatusBar.tsx`:
```tsx
interface StatusBarProps {
  left: string;
  right: string;
}

export function StatusBar({ left, right }: StatusBarProps) {
  return (
    <div className="bd-statusbar">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}
```

- [ ] **Step 3: Add CSS for `.bd-statusbar`**

In `src/styles/index.css` (add only if missing):
```css
.bd-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 22px;
  padding: 0 14px;
  border-top: 1px solid var(--color-subtle-border);
  background: var(--color-surface);
  font-size: 10.5px;
  color: var(--color-text-muted);
  font-family: var(--font-mono, ui-monospace, monospace);
}
```

- [ ] **Step 4: Type-check**

```bash
cd src/BorgDock.Tauri && npm run build 2>&1 | tail -10
```
Expected: success (the old StatusBar callers may break — fixed in Task 3.5 / 3.6).

- [ ] **Step 5: Don't commit yet** — combine with Task 3.5.

---

## Task 3.5: Build `MainWindow` component (replaces Sidebar + Header)

**Files:**
- Create: `src/components/layout/MainWindow.tsx`
- Test: `src/components/layout/__tests__/MainWindow.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/layout/__tests__/MainWindow.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() }),
}));

import { MainWindow } from '../MainWindow';

describe('MainWindow', () => {
  it('renders titlebar, section content, and statusbar', () => {
    render(
      <MainWindow>
        <div data-testid="content">section body</div>
      </MainWindow>,
    );
    expect(screen.getByText('BorgDock')).toBeInTheDocument();
    expect(screen.getByLabelText('Minimize')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximize')).toBeInTheDocument();
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/layout/__tests__/MainWindow.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/components/layout/MainWindow.tsx`:
```tsx
import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Pill, Tabs, TitleBar, WindowControls } from '@/components/shared/primitives';
import type { TabDef } from '@/components/shared/primitives';
import { RefreshIcon } from '@/components/shared/icons';
import { StatusBar } from './StatusBar';
import { useStatusBar } from '@/hooks/useStatusBar';
import { type ActiveSection, useUiStore } from '@/stores/ui-store';
import { usePrStore } from '@/stores/pr-store';

const SECTIONS: { id: ActiveSection; label: string }[] = [
  { id: 'focus',     label: 'Focus' },
  { id: 'prs',       label: 'PRs' },
  { id: 'workitems', label: 'Work Items' },
];

const STORAGE_KEY = 'mainWindow.activeSection';

function dispatchRefresh() {
  document.dispatchEvent(new CustomEvent('borgdock-refresh'));
}

function openSettings() {
  void invoke('open_settings_window', {}).catch((e) => console.error('open_settings_window failed', e));
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <defs>
        <linearGradient id="mw-logo" x1="0" y1="0" x2="16" y2="16">
          <stop offset="0%" stopColor="var(--color-logo-gradient-start)" />
          <stop offset="100%" stopColor="var(--color-logo-gradient-end)" />
        </linearGradient>
      </defs>
      <rect width="16" height="16" rx="4.5" fill="url(#mw-logo)" />
      <path
        d="M2 9 L4 9 L5.5 5 L7.5 12 L9 3 L11 11 L12.5 7 L14 9"
        stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="14" cy="9" r="1.3" fill="white" opacity="0.85" />
    </svg>
  );
}

interface MainWindowProps {
  children: ReactNode;
}

export function MainWindow({ children }: MainWindowProps) {
  const activeSection = useUiStore((s) => s.activeSection);
  const setActiveSection = useUiStore((s) => s.setActiveSection);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const counts = usePrStore((s) => s.counts)();
  const focusCount = usePrStore((s) => s.focusCount)();
  const hasFailing = counts.failing > 0;
  const sb = useStatusBar(activeSection);

  // Persist active section across launches
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, activeSection); } catch {}
  }, [activeSection]);

  return (
    <div className="bd-window">
      <TitleBar
        left={
          <span className="bd-titlebar__left">
            <Logo />
            <span className="bd-title-bar__title">BorgDock</span>
            <Pill tone="neutral">{pullRequests.length} open</Pill>
          </span>
        }
        middle={
          <Tabs
            value={activeSection}
            onChange={(id) => setActiveSection(id as ActiveSection)}
            tabs={SECTIONS.map<TabDef>((s) => ({
              id: s.id,
              label: s.label,
              count: s.id === 'focus' && focusCount > 0 ? focusCount : undefined,
            }))}
            dense
          />
        }
        right={
          <span className="bd-titlebar__right">
            <span className={clsx('bd-status-dot', hasFailing && 'bd-status-dot--red')} aria-hidden />
            <button type="button" className="bd-icon-btn" aria-label="Refresh" onClick={dispatchRefresh}>
              <RefreshIcon />
            </button>
            <button type="button" className="bd-icon-btn" aria-label="Settings" onClick={openSettings}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="8" cy="8" r="2.5" />
                <path d="M13.5 8a5.5 5.5 0 0 0-.1-1.1l1.5-1.2-1-1.7-1.8.5a5.5 5.5 0 0 0-1-.6L10.7 2H8.7l-.4 1.9a5.5 5.5 0 0 0-1 .6l-1.8-.5-1 1.7 1.5 1.2a5.5 5.5 0 0 0 0 2.2l-1.5 1.2 1 1.7 1.8-.5a5.5 5.5 0 0 0 1 .6L9.3 14h2l.4-1.9a5.5 5.5 0 0 0 1-.6l1.8.5 1-1.7-1.5-1.2a5.5 5.5 0 0 0 .1-1.1z" />
              </svg>
            </button>
            <WindowControls />
          </span>
        }
      />
      <main className="bd-window__body">{children}</main>
      <StatusBar left={sb.left} right={sb.right} />
    </div>
  );
}
```

- [ ] **Step 4: Add CSS**

In `src/styles/index.css`:
```css
.bd-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-background);
  color: var(--color-text-primary);
  overflow: hidden;
}
.bd-window__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.bd-titlebar__left,
.bd-titlebar__right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.bd-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-status-green);
  display: inline-block;
}
.bd-status-dot--red { background: var(--color-status-red); }
.bd-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--color-text-tertiary);
  border-radius: 4px;
  cursor: pointer;
}
.bd-icon-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}
```

- [ ] **Step 5: Re-run test**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/layout/__tests__/MainWindow.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Commit (combines 3.4 + 3.5)**

```bash
git add src/BorgDock.Tauri/src/components/layout/MainWindow.tsx src/BorgDock.Tauri/src/components/layout/__tests__/MainWindow.test.tsx src/BorgDock.Tauri/src/components/layout/StatusBar.tsx src/BorgDock.Tauri/src/styles/index.css
git commit -m "layout: MainWindow component (titlebar tabs + status bar)"
```

---

## Task 3.6: Mount `MainWindow` from `App.tsx` (replace `<Sidebar>`)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the imports**

In `src/App.tsx`, change:
```ts
import { Sidebar } from '@/components/layout/Sidebar';
```
to:
```ts
import { MainWindow } from '@/components/layout/MainWindow';
```

- [ ] **Step 2: Replace `<Sidebar>` mounts**

Find both `<Sidebar>...</Sidebar>` blocks (in the fade-out branch and the main return). Replace each with:
```tsx
<MainWindow>
  {activeSection === 'focus' && <FocusList />}
  {activeSection === 'prs' && <PrList />}
  {activeSection === 'workitems' && <WorkItemsSection />}
</MainWindow>
```

- [ ] **Step 3: Type-check + run app tests**

```bash
cd src/BorgDock.Tauri && npm run build 2>&1 | tail -20
```
Expected: success.

```bash
cd src/BorgDock.Tauri && npx vitest run src/__tests__/App.test.tsx 2>&1 | tail -30
```
Expected: PASS, or update `App.test.tsx` references to `Sidebar` → `MainWindow`.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/App.tsx src/BorgDock.Tauri/src/__tests__/App.test.tsx
git commit -m "App: mount MainWindow in place of Sidebar"
```

---

## Task 3.7: Delete `Sidebar.tsx`, `Header.tsx`

**Files:**
- Delete: `src/components/layout/Sidebar.tsx`
- Delete: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/index.ts` (drop exports)
- Modify: `src/components/layout/__tests__/*.test.tsx` (drop Sidebar/Header tests)

- [ ] **Step 1: Confirm no consumers**

```bash
cd src/BorgDock.Tauri && grep -rn "from '@/components/layout/Sidebar'\|from '@/components/layout/Header'" src/ 2>&1
```
Expected: empty (or only the about-to-be-deleted index.ts).

- [ ] **Step 2: Delete files**

```bash
rm src/BorgDock.Tauri/src/components/layout/Sidebar.tsx
rm src/BorgDock.Tauri/src/components/layout/Header.tsx
```

- [ ] **Step 3: Update layout index**

In `src/components/layout/index.ts`, drop the `Sidebar` and `Header` exports.

- [ ] **Step 4: Drop dead tests**

```bash
cd src/BorgDock.Tauri && ls src/components/layout/__tests__
```
For each test file that targets `Sidebar` or `Header` (e.g., `Sidebar.test.tsx`, `Header.test.tsx`), delete it.

- [ ] **Step 5: Type-check + tests**

```bash
cd src/BorgDock.Tauri && npm run build 2>&1 | tail -10 && npm test 2>&1 | tail -20
```
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add -A src/BorgDock.Tauri/src/components/layout
git commit -m "layout: delete Sidebar.tsx and Header.tsx (folded into MainWindow)"
```

---

# Phase 4 — PRs tab

## Task 4.1: Build `PrToolbar` (filter pills + search)

**Files:**
- Create: `src/components/pr/PrToolbar.tsx`
- Test: `src/components/pr/__tests__/PrToolbar.test.tsx`

- [ ] **Step 1: Inspect existing FilterBar/SearchBar to preserve filter state shape**

```bash
cd src/BorgDock.Tauri && cat src/components/layout/FilterBar.tsx src/components/layout/SearchBar.tsx
```

Identify which store / hook holds the filter and search state (likely `useUiStore` with selectors like `prFilter`, `setPrFilter`, `prSearch`, `setPrSearch`). Note the exact shape — the new `PrToolbar` reads/writes the same state.

- [ ] **Step 2: Write failing test**

Create `src/components/pr/__tests__/PrToolbar.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { PrToolbar } from '../PrToolbar';

describe('PrToolbar', () => {
  it('renders filter pills and search', () => {
    render(<PrToolbar counts={{ all: 9, needs: 1, mine: 3, failing: 2, ready: 1, review: 2, closed: 0 }} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Needs Review')).toBeInTheDocument();
    expect(screen.getByText('Failing')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Filter pull requests/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — fail**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/pr/__tests__/PrToolbar.test.tsx
```
Expected: FAIL.

- [ ] **Step 4: Implement**

Create `src/components/pr/PrToolbar.tsx`:
```tsx
import { Chip, Kbd, TextInput } from '@/components/shared/primitives';
import { SearchIcon } from '@/components/shared/icons';
import { useUiStore } from '@/stores/ui-store';

export type PrFilterId = 'all' | 'needs' | 'mine' | 'failing' | 'ready' | 'review' | 'closed';

export interface PrFilterCounts {
  all: number;
  needs: number;
  mine: number;
  failing: number;
  ready: number;
  review: number;
  closed: number;
}

const FILTERS: { id: PrFilterId; label: string; tone?: 'error' }[] = [
  { id: 'all',     label: 'All' },
  { id: 'needs',   label: 'Needs Review' },
  { id: 'mine',    label: 'Mine' },
  { id: 'failing', label: 'Failing', tone: 'error' },
  { id: 'ready',   label: 'Ready' },
  { id: 'review',  label: 'Review' },
  { id: 'closed',  label: 'Closed' },
];

interface Props {
  counts: PrFilterCounts;
}

export function PrToolbar({ counts }: Props) {
  // Use whichever selectors are real in your useUiStore — adjust to actual names.
  const filter = useUiStore((s) => s.prFilter ?? 'all') as PrFilterId;
  const setFilter = useUiStore((s) => s.setPrFilter ?? (() => {})) as (f: PrFilterId) => void;
  const search = useUiStore((s) => s.prSearch ?? '') as string;
  const setSearch = useUiStore((s) => s.setPrSearch ?? (() => {})) as (q: string) => void;

  return (
    <div className="bd-pr-toolbar">
      <div className="bd-pr-toolbar__pills">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            active={filter === f.id}
            count={counts[f.id]}
            tone={f.tone}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Chip>
        ))}
      </div>
      <span className="bd-spacer" />
      <div className="bd-pr-toolbar__search">
        <TextInput
          ariaLabel="Filter pull requests"
          value={search}
          onChange={setSearch}
          placeholder="Filter pull requests…"
          leftSlot={<SearchIcon />}
          rightSlot={<Kbd>⌘K</Kbd>}
        />
      </div>
    </div>
  );
}
```

If `TextInput` doesn't accept `leftSlot`/`rightSlot`, swap to a small inline `<div>` wrapper or use the existing `Input` primitive — check `src/components/shared/primitives/Input.tsx` and adapt.

- [ ] **Step 5: Add CSS**

```css
.bd-pr-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px 10px;
  border-bottom: 1px solid var(--color-subtle-border);
  background: var(--color-surface);
}
.bd-pr-toolbar__pills { display: inline-flex; gap: 8px; flex-wrap: wrap; }
.bd-pr-toolbar__search { width: 280px; }
.bd-spacer { flex: 1; }
```

- [ ] **Step 6: Re-run test**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/pr/__tests__/PrToolbar.test.tsx
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr/PrToolbar.tsx src/BorgDock.Tauri/src/components/pr/__tests__/PrToolbar.test.tsx src/BorgDock.Tauri/src/styles/index.css
git commit -m "pr: PrToolbar (filter pills + search) replacing FilterBar/SearchBar"
```

---

## Task 4.2: Make `PrCard` whole-card click open the pop-out detail

**Files:**
- Modify: `src/components/pr/PrCardContainer.tsx`
- Modify: `src/components/pr/PrCardView.tsx`

- [ ] **Step 1: Find the existing pop-out invoke**

```bash
cd src/BorgDock.Tauri && grep -n "open_pr_detail_window" src/ -r
```

Note the call shape (likely `invoke('open_pr_detail_window', { number: pr.number })`).

- [ ] **Step 2: Make container clickable**

In `src/components/pr/PrCardContainer.tsx`, find where the card root element is rendered. Add an `onClick` that calls `invoke('open_pr_detail_window', ...)`. Ensure inner action buttons (`HoverActionPillBar`, etc.) call `e.stopPropagation()` in their click handlers so they don't trigger the card open.

```tsx
function handleCardClick(e: React.MouseEvent) {
  if ((e.target as HTMLElement).closest('[data-pr-card-action]')) return;
  void invoke('open_pr_detail_window', { number: pr.pullRequest.number });
}

return (
  <PrCardView
    pr={pr}
    onClick={handleCardClick}
    /* ...existing props... */
  />
);
```

In `PrCardView.tsx`, make the root `<div>` accept and apply the `onClick`. Add `role="button"`, `tabIndex={0}`, and a keyboard handler:
```tsx
<div
  className="bd-pr-card"
  role="button"
  tabIndex={0}
  onClick={onClick}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(e as unknown as React.MouseEvent); }}
>
```

In `HoverActionPillBar.tsx` (and any other in-card interactive), wrap action button click handlers:
```tsx
onClick={(e) => { e.stopPropagation(); originalHandler(); }}
```
Or add `data-pr-card-action="true"` to the wrapper element so `handleCardClick`'s closest-check skips it.

- [ ] **Step 3: Add a click-to-popout test**

Create `src/components/pr/__tests__/PrCardContainer.click.test.tsx`:
```tsx
import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import { PrCardContainer } from '../PrCardContainer';
const fakePr = { pullRequest: { number: 42 }, /* fill in minimal required fields */ } as any;

describe('PrCardContainer click', () => {
  it('opens pr-detail pop-out on card click', () => {
    const { container } = render(<PrCardContainer pr={fakePr} />);
    fireEvent.click(container.firstChild as Element);
    expect(invokeMock).toHaveBeenCalledWith('open_pr_detail_window', expect.objectContaining({ number: 42 }));
  });
});
```

If `PrCardContainer` requires more props than just `pr`, fill in minimal stubs to satisfy types.

- [ ] **Step 4: Run test**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/pr/__tests__/PrCardContainer.click.test.tsx
```
Expected: PASS after implementation.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr/PrCardContainer.tsx src/BorgDock.Tauri/src/components/pr/PrCardView.tsx src/BorgDock.Tauri/src/components/pr/HoverActionPillBar.tsx src/BorgDock.Tauri/src/components/pr/__tests__/PrCardContainer.click.test.tsx
git commit -m "pr: whole-card click opens pop-out detail; inner actions stop propagation"
```

---

## Task 4.3: Delete `PrCardExpanded` and chevron-toggle wiring

**Files:**
- Delete: `src/components/pr/PrCardExpanded.tsx`
- Modify: `src/components/pr/PrCardContainer.tsx` (remove expand state + chevron)
- Modify: `src/components/pr/PrCardView.tsx` (remove expand-related markup)
- Modify: `src/stores/ui-store.ts` if it tracks `expandedPrId`

- [ ] **Step 1: Find references**

```bash
cd src/BorgDock.Tauri && grep -rn "PrCardExpanded\|expandedPrId\|prExpanded" src/ 2>&1 | head -20
```

- [ ] **Step 2: Delete file**

```bash
rm src/BorgDock.Tauri/src/components/pr/PrCardExpanded.tsx
```

- [ ] **Step 3: Strip references in PrCardContainer + View**

In `PrCardContainer.tsx`: remove any `expanded`/`isExpanded` state, the chevron button, and the `<PrCardExpanded>` mount.

In `PrCardView.tsx`: remove the chevron, remove the conditional expanded section.

Also drop any `expandedPrId` from `useUiStore` and its tests.

- [ ] **Step 4: Run all PR-related tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/pr 2>&1 | tail -20
```
Expected: PASS (or update tests to match the simplified shape).

- [ ] **Step 5: Commit**

```bash
git add -A src/BorgDock.Tauri/src/components/pr src/BorgDock.Tauri/src/stores
git commit -m "pr: drop inline expansion (PrCardExpanded) — click opens pop-out"
```

---

## Task 4.4: Restyle `RepoGroup` header

**Files:**
- Modify: `src/components/pr/RepoGroup.tsx`

- [ ] **Step 1: Replace header markup**

In `src/components/pr/RepoGroup.tsx`, find the group header. Replace with:
```tsx
<div className="bd-repo-group__header">
  <button className="bd-repo-group__chevron" onClick={onToggle} aria-label={collapsed ? 'Expand' : 'Collapse'}>
    <ChevronIcon collapsed={collapsed} />
  </button>
  <span className="bd-section-label">{repo}</span>
  <span className="bd-repo-group__hr" />
  <Pill tone="ghost">{count}</Pill>
</div>
```

If `ChevronIcon` doesn't exist, inline an SVG. If `Pill` doesn't accept `tone="ghost"`, add the tone in `Pill.tsx` (lookup table) — small change, keep the commit scoped.

- [ ] **Step 2: CSS**

```css
.bd-repo-group__header { display: flex; align-items: center; gap: 8px; padding: 6px 4px 10px; }
.bd-repo-group__chevron { background: transparent; border: 0; color: var(--color-text-tertiary); cursor: pointer; padding: 0; }
.bd-repo-group__hr { flex: 1; height: 1px; background: var(--color-subtle-border); }
```

- [ ] **Step 3: Visual verify**

Run `npm run dev` (or storybook) and confirm the new header matches the design's screenshot. No unit test — purely visual.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr/RepoGroup.tsx src/BorgDock.Tauri/src/styles/index.css src/BorgDock.Tauri/src/components/shared/primitives/Pill.tsx
git commit -m "pr: restyle RepoGroup header (chevron + label + hr + count pill)"
```

---

## Task 4.5: Wrap PR list in PrToolbar; delete FilterBar/SearchBar

**Files:**
- Modify: `src/components/pr/PrList.tsx`
- Delete: `src/components/layout/FilterBar.tsx`
- Delete: `src/components/layout/SearchBar.tsx`
- Modify: `src/components/layout/index.ts`

- [ ] **Step 1: Add PrToolbar to PrList**

In `src/components/pr/PrList.tsx`, at the top of the rendered tree, add:
```tsx
<>
  <PrToolbar counts={prFilterCounts} />
  {/* existing list rendering */}
</>
```

Compute `prFilterCounts` from the PR store, mirroring whatever filter logic FilterBar used.

- [ ] **Step 2: Delete old layout files**

```bash
rm src/BorgDock.Tauri/src/components/layout/FilterBar.tsx
rm src/BorgDock.Tauri/src/components/layout/SearchBar.tsx
```

- [ ] **Step 3: Drop exports + tests**

In `src/components/layout/index.ts`, remove `FilterBar` / `SearchBar` exports.

```bash
cd src/BorgDock.Tauri && ls src/components/layout/__tests__
```
Delete tests targeting `FilterBar` / `SearchBar`.

- [ ] **Step 4: Type-check + tests**

```bash
cd src/BorgDock.Tauri && npm run build 2>&1 | tail -10 && npm test 2>&1 | tail -20
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add -A src/BorgDock.Tauri/src
git commit -m "pr: PrList renders PrToolbar; remove FilterBar.tsx and SearchBar.tsx"
```

---

# Phase 5 — Work Items tab (3-pane)

## Task 5.1: Add `workItemsSelectedId` to `useUiStore`

**Files:**
- Modify: `src/stores/ui-store.ts`
- Test: `src/stores/__tests__/ui-store.test.ts` (extend if exists; create if not)

- [ ] **Step 1: Write failing test**

In `src/stores/__tests__/ui-store.test.ts` (or new file), add:
```ts
it('sets and reads workItemsSelectedId', () => {
  useUiStore.getState().setWorkItemsSelectedId(42);
  expect(useUiStore.getState().workItemsSelectedId).toBe(42);
  useUiStore.getState().setWorkItemsSelectedId(null);
  expect(useUiStore.getState().workItemsSelectedId).toBeNull();
});
```

- [ ] **Step 2: Run — fail**

```bash
cd src/BorgDock.Tauri && npx vitest run src/stores/__tests__/ui-store.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Add field + setter**

In `src/stores/ui-store.ts`, in the state interface and creator:
```ts
workItemsSelectedId: number | null;
setWorkItemsSelectedId: (id: number | null) => void;
```
Inside `create<...>((set) => ({ ... }))`:
```ts
workItemsSelectedId: null,
setWorkItemsSelectedId: (workItemsSelectedId) => set({ workItemsSelectedId }),
```

- [ ] **Step 4: Re-run test**

```bash
cd src/BorgDock.Tauri && npx vitest run src/stores/__tests__/ui-store.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/stores/ui-store.ts src/BorgDock.Tauri/src/stores/__tests__/ui-store.test.ts
git commit -m "store: workItemsSelectedId for 3-pane work items selection"
```

---

## Task 5.2: Build `QueriesRail` component

**Files:**
- Create: `src/components/work-items/QueriesRail.tsx`
- Test: `src/components/work-items/__tests__/QueriesRail.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/work-items/__tests__/QueriesRail.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { QueriesRail } from '../QueriesRail';

describe('QueriesRail', () => {
  it('renders favorites and my-queries sections; click selects', () => {
    const onSelect = vi.fn();
    render(
      <QueriesRail
        favorites={[{ id: 'q1', name: 'Assigned to Me', count: 12 }]}
        myQueries={[{ id: 'q2', name: 'Active Bugs', count: 28 }]}
        selectedId="q1"
        onSelectQuery={onSelect}
        onOpenQueryBrowser={() => {}}
      />,
    );
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('My Queries')).toBeInTheDocument();
    expect(screen.getByText('Assigned to Me')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Active Bugs'));
    expect(onSelect).toHaveBeenCalledWith('q2');
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

Create `src/components/work-items/QueriesRail.tsx`:
```tsx
import { Button } from '@/components/shared/primitives';

export interface QueryRowData {
  id: string;
  name: string;
  count?: number;
}

interface Props {
  favorites: QueryRowData[];
  myQueries: QueryRowData[];
  selectedId?: string;
  onSelectQuery: (id: string) => void;
  onOpenQueryBrowser: () => void;
}

function QueryRow({ q, active, star, onClick }: { q: QueryRowData; active: boolean; star?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`bd-query-row${active ? ' bd-query-row--active' : ''}`}
      onClick={onClick}
    >
      {star ? <span className="bd-query-row__star">★</span> : <span className="bd-query-row__star-spacer" />}
      <span className="bd-query-row__name">{q.name}</span>
      {q.count !== undefined && <span className="bd-query-row__count">{q.count}</span>}
    </button>
  );
}

export function QueriesRail({ favorites, myQueries, selectedId, onSelectQuery, onOpenQueryBrowser }: Props) {
  return (
    <aside className="bd-queries-rail">
      <div className="bd-section-label bd-queries-rail__heading">Favorites</div>
      {favorites.map((q) => (
        <QueryRow key={q.id} q={q} star active={selectedId === q.id} onClick={() => onSelectQuery(q.id)} />
      ))}
      <div className="bd-section-label bd-queries-rail__heading">My Queries</div>
      {myQueries.map((q) => (
        <QueryRow key={q.id} q={q} active={selectedId === q.id} onClick={() => onSelectQuery(q.id)} />
      ))}
      <div className="bd-queries-rail__footer">
        <Button variant="ghost" size="sm" onClick={onOpenQueryBrowser}>Browse all queries…</Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: CSS**

```css
.bd-queries-rail { display: flex; flex-direction: column; height: 100%; padding: 14px 0; background: var(--color-surface); border-right: 1px solid var(--color-subtle-border); overflow-y: auto; }
.bd-queries-rail__heading { padding: 0 16px 6px; }
.bd-queries-rail__heading:not(:first-child) { padding-top: 14px; }
.bd-queries-rail__footer { margin-top: auto; padding: 10px 14px; border-top: 1px solid var(--color-subtle-border); }
.bd-query-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 16px; background: transparent; border: 0; border-left: 2px solid transparent; cursor: pointer; font-size: 12px; color: var(--color-text-secondary); text-align: left; }
.bd-query-row:hover { background: var(--color-surface-hover); }
.bd-query-row--active { background: var(--color-selected-row-bg); border-left-color: var(--color-accent); color: var(--color-accent); font-weight: 600; }
.bd-query-row__star { color: var(--color-accent); width: 11px; }
.bd-query-row__star-spacer { width: 11px; }
.bd-query-row__name { flex: 1; }
.bd-query-row__count { font-size: 10px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 5: Re-run test → PASS**

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/work-items/QueriesRail.tsx src/BorgDock.Tauri/src/components/work-items/__tests__/QueriesRail.test.tsx src/BorgDock.Tauri/src/styles/index.css
git commit -m "work-items: QueriesRail component (favorites + my queries + browser button)"
```

---

## Task 5.3: Build `WorkItemRow` (compact row replacing card)

**Files:**
- Create: `src/components/work-items/WorkItemRow.tsx`
- Test: `src/components/work-items/__tests__/WorkItemRow.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkItemRow } from '../WorkItemRow';

const w = {
  id: 54482,
  type: 'Bug' as const,
  title: 'Quote footer broken',
  state: 'Active',
  priority: 2,
  isWorking: true,
  isTracked: false,
};

describe('WorkItemRow', () => {
  it('renders type pill, id, title, meta, working pill', () => {
    render(<WorkItemRow item={w} selected={false} onClick={() => {}} onToggleTracked={() => {}} onToggleWorking={() => {}} />);
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('AB#54482')).toBeInTheDocument();
    expect(screen.getByText('Quote footer broken')).toBeInTheDocument();
    expect(screen.getByText('working')).toBeInTheDocument();
  });
  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(<WorkItemRow item={w} selected={false} onClick={onClick} onToggleTracked={() => {}} onToggleWorking={() => {}} />);
    fireEvent.click(screen.getByText('Quote footer broken'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

Create `src/components/work-items/WorkItemRow.tsx`:
```tsx
import { Pill } from '@/components/shared/primitives';

export type WorkItemType = 'Bug' | 'User Story' | 'Task' | 'Feature' | string;

export interface WorkItemRowData {
  id: number;
  type: WorkItemType;
  title: string;
  state: string;
  priority?: number;
  isWorking: boolean;
  isTracked: boolean;
}

interface Props {
  item: WorkItemRowData;
  selected: boolean;
  onClick: () => void;
  onToggleTracked: () => void;
  onToggleWorking: () => void;
}

const TYPE_TONE: Record<string, 'error' | 'neutral' | 'warning'> = {
  Bug: 'error',
  'User Story': 'neutral',
  Task: 'warning',
  Feature: 'neutral',
};

export function WorkItemRow({ item, selected, onClick, onToggleTracked, onToggleWorking }: Props) {
  return (
    <div
      className={`bd-wi-row${selected ? ' bd-wi-row--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <div className="bd-wi-row__top">
        <Pill tone={TYPE_TONE[item.type] ?? 'neutral'}>{item.type}</Pill>
        <span className="bd-mono bd-wi-row__id">AB#{item.id}</span>
        <span className="bd-spacer" />
        {item.isWorking && <Pill tone="neutral">working</Pill>}
        <span className="bd-wi-row__actions">
          <button
            type="button"
            data-pr-card-action
            className={`bd-wi-row__action${item.isTracked ? ' bd-wi-row__action--on' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleTracked(); }}
            aria-label={item.isTracked ? 'Untrack' : 'Track'}
            title={item.isTracked ? 'Untrack' : 'Track'}
          >
            ★
          </button>
          <button
            type="button"
            data-pr-card-action
            className={`bd-wi-row__action${item.isWorking ? ' bd-wi-row__action--on' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleWorking(); }}
            aria-label={item.isWorking ? 'Stop working on' : 'Start working on'}
            title={item.isWorking ? 'Stop working on' : 'Start working on'}
          >
            ●
          </button>
        </span>
      </div>
      <div className="bd-wi-row__title">{item.title}</div>
      <div className="bd-meta bd-wi-row__meta">
        <span>{item.state}</span>
        {item.priority !== undefined && <><span className="sep">·</span><span>P{item.priority}</span></>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: CSS**

```css
.bd-wi-row { padding: 10px 14px; border-bottom: 1px solid var(--color-subtle-border); border-left: 2px solid transparent; cursor: pointer; }
.bd-wi-row:hover { background: var(--color-surface-hover); }
.bd-wi-row--selected { background: var(--color-selected-row-bg); border-left-color: var(--color-accent); }
.bd-wi-row__top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.bd-wi-row__id { font-size: 11px; color: var(--color-text-muted); }
.bd-wi-row__title { font-size: 12.5px; font-weight: 500; color: var(--color-text-primary); line-height: 1.35; }
.bd-wi-row__meta { margin-top: 6px; font-size: 11px; }
.bd-wi-row__actions { display: inline-flex; gap: 2px; opacity: 0; }
.bd-wi-row:hover .bd-wi-row__actions, .bd-wi-row__actions:has(.bd-wi-row__action--on) { opacity: 1; }
.bd-wi-row__action { background: transparent; border: 0; color: var(--color-text-muted); cursor: pointer; padding: 2px 4px; }
.bd-wi-row__action--on { color: var(--color-accent); }
```

- [ ] **Step 5: Re-run test → PASS**

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/work-items/WorkItemRow.tsx src/BorgDock.Tauri/src/components/work-items/__tests__/WorkItemRow.test.tsx src/BorgDock.Tauri/src/styles/index.css
git commit -m "work-items: WorkItemRow (compact row with hover-revealed track/working actions)"
```

---

## Task 5.4: Build `WorkItemFilterPopover`

**Files:**
- Create: `src/components/work-items/WorkItemFilterPopover.tsx`
- Test: `src/components/work-items/__tests__/WorkItemFilterPopover.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkItemFilterPopover } from '../WorkItemFilterPopover';

describe('WorkItemFilterPopover', () => {
  it('renders state, assignee, tracking selects', () => {
    render(
      <WorkItemFilterPopover
        states={['Active', 'Resolved']}
        assignees={['Alice', 'Bob']}
        selectedState="All"
        selectedAssignee="Anyone"
        trackingFilter="all"
        onStateChange={() => {}}
        onAssigneeChange={() => {}}
        onTrackingChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('State')).toBeInTheDocument();
    expect(screen.getByLabelText('Assignee')).toBeInTheDocument();
    expect(screen.getByLabelText('Tracking')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

Create `src/components/work-items/WorkItemFilterPopover.tsx`:
```tsx
import { Field, Select } from '@/components/shared/primitives';

export type TrackingFilter = 'all' | 'tracked' | 'workingOn';

interface Props {
  states: string[];
  assignees: string[];
  selectedState: string;
  selectedAssignee: string;
  trackingFilter: TrackingFilter;
  onStateChange: (s: string) => void;
  onAssigneeChange: (a: string) => void;
  onTrackingChange: (t: TrackingFilter) => void;
}

export function WorkItemFilterPopover(p: Props) {
  return (
    <div className="bd-wi-filter-popover">
      <Field label="State">
        <Select
          ariaLabel="State"
          value={p.selectedState}
          onChange={p.onStateChange}
          options={['All', ...p.states].map((s) => ({ value: s, label: s }))}
        />
      </Field>
      <Field label="Assignee">
        <Select
          ariaLabel="Assignee"
          value={p.selectedAssignee}
          onChange={p.onAssigneeChange}
          options={['Anyone', ...p.assignees].map((s) => ({ value: s, label: s }))}
        />
      </Field>
      <Field label="Tracking">
        <Select
          ariaLabel="Tracking"
          value={p.trackingFilter}
          onChange={(v) => p.onTrackingChange(v as TrackingFilter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'tracked', label: 'Tracked' },
            { value: 'workingOn', label: 'Working on' },
          ]}
        />
      </Field>
    </div>
  );
}
```

If `Select` has a different prop shape, adapt to match it (find with `cat src/components/shared/primitives/Select.tsx`).

- [ ] **Step 4: CSS**

```css
.bd-wi-filter-popover { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-width: 240px; background: var(--color-surface); border: 1px solid var(--color-subtle-border); border-radius: 8px; box-shadow: var(--elevation-2); }
```

- [ ] **Step 5: Re-run test → PASS**

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/work-items/WorkItemFilterPopover.tsx src/BorgDock.Tauri/src/components/work-items/__tests__/WorkItemFilterPopover.test.tsx src/BorgDock.Tauri/src/styles/index.css
git commit -m "work-items: WorkItemFilterPopover (state, assignee, tracking)"
```

---

## Task 5.5: Rewrite `WorkItemsSection` as 3-pane shell

**Files:**
- Modify: `src/components/work-items/WorkItemsSection.tsx`
- Modify: `src/components/work-items/__tests__/*` (update tests to match new shell)

- [ ] **Step 1: Replace the body**

Open `src/components/work-items/WorkItemsSection.tsx`. Replace the bottom-half rendering (everything from the not-configured early-return onward) with the 3-pane structure:

```tsx
// Imports (add to existing):
import { useState } from 'react';
import { HoverPopover } from '@/components/shared/primitives';
import { QueriesRail } from './QueriesRail';
import { WorkItemRow } from './WorkItemRow';
import { WorkItemFilterPopover } from './WorkItemFilterPopover';
import { WorkItemDetailPanel } from './WorkItemDetailPanel';

// Replace the return JSX (after the not-configured check) with:
const [filterOpen, setFilterOpen] = useState(false);

return (
  <div className="bd-workitems">
    {queryBrowserOpen && (
      <div className="bd-modal-backdrop" onClick={() => setQueryBrowserOpen(false)}>
        <div className="bd-modal" onClick={(e) => e.stopPropagation()}>
          <QueryBrowser
            queryTree={queryTreeNodes}
            favoriteQueries={favoriteQueries}
            isLoading={isLoading}
            selectedQueryId={selectedQueryId ?? undefined}
            onSelectQuery={handleSelectQuery}
            onToggleFavorite={handleToggleFavorite}
            onClose={() => setQueryBrowserOpen(false)}
          />
        </div>
      </div>
    )}

    <QueriesRail
      favorites={favoriteQueriesForRail}
      myQueries={myQueriesForRail}
      selectedId={selectedQueryId ?? undefined}
      onSelectQuery={handleSelectQuery}
      onOpenQueryBrowser={() => setQueryBrowserOpen(true)}
    />

    <div className="bd-workitems__items">
      <div className="bd-workitems__items-toolbar">
        <input
          className="bd-input"
          placeholder={`Filter ${items.length} items…`}
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
        />
        <HoverPopover
          open={filterOpen}
          onOpenChange={setFilterOpen}
          content={
            <WorkItemFilterPopover
              states={availableStates()}
              assignees={availableAssignees()}
              selectedState={stateFilter === 'all' ? 'All' : stateFilter}
              selectedAssignee={assignedToFilter === '' ? 'Anyone' : assignedToFilter}
              trackingFilter={trackingFilter}
              onStateChange={(s) => useWorkItemsStore.getState().setStateFilter(s === 'All' ? 'all' : s)}
              onAssigneeChange={(a) => useWorkItemsStore.getState().setAssignedToFilter(a === 'Anyone' ? '' : a)}
              onTrackingChange={(t) => useWorkItemsStore.getState().setTrackingFilter(t)}
            />
          }
        >
          <button type="button" className="bd-icon-btn" aria-label="Filter">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M2 4h12M4 8h8M6 12h4" />
            </svg>
          </button>
        </HoverPopover>
      </div>
      <div className="bd-workitems__items-list">
        {cardItems.map((it) => (
          <WorkItemRow
            key={it.id}
            item={{
              id: it.id,
              type: it.type,
              title: it.title,
              state: it.state,
              priority: it.priority,
              isTracked: trackedWorkItemIds.has(it.id),
              isWorking: workingOnWorkItemIds.has(it.id),
            }}
            selected={selectedWorkItemId === it.id}
            onClick={() => handleSelectWorkItem(it.id)}
            onToggleTracked={() => useWorkItemsStore.getState().toggleTracked(it.id)}
            onToggleWorking={() => useWorkItemsStore.getState().toggleWorkingOn(it.id)}
          />
        ))}
        {cardItems.length === 0 && selectedQueryId && (
          <div className="bd-empty">No items in {selectedQueryName}</div>
        )}
        {!selectedQueryId && <div className="bd-empty">Pick a query from the rail</div>}
      </div>
    </div>

    <div className="bd-workitems__detail">
      {selectedWorkItemId !== null && detailData ? (
        <WorkItemDetailPanel
          item={detailData}
          isLoading={isDetailLoading}
          isSaving={isSaving}
          statusText={statusText}
          availableStates={detailStates}
          availableAssignees={availableAssignees()}
          richTextFields={richText}
          standardFields={standard}
          customFields={custom}
          attachments={attachments}
          comments={detailComments}
          isLoadingComments={isLoadingComments}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={handleCloseDetail}
          onOpenInBrowser={handleOpenInBrowser}
          onDownloadAttachment={handleDownloadAttachment}
          onAddComment={handleAddComment}
        />
      ) : (
        <div className="bd-empty">Select a work item</div>
      )}
    </div>
  </div>
);
```

Add a `listSearch` `useState` and filter `cardItems` by it client-side (or wire to existing store search if present). Compute `favoriteQueriesForRail` / `myQueriesForRail` from the existing `flattenQueries(queryTree)` + `favoriteQueryIds` (favorites = those in the favorite set; myQueries = the rest).

- [ ] **Step 2: CSS**

```css
.bd-workitems { display: grid; grid-template-columns: 240px 380px 1fr; flex: 1; min-height: 0; position: relative; }
.bd-workitems__items { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--color-subtle-border); }
.bd-workitems__items-toolbar { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--color-subtle-border); background: var(--color-surface); }
.bd-workitems__items-list { flex: 1; overflow-y: auto; }
.bd-workitems__detail { overflow: auto; background: var(--color-background); }
.bd-empty { padding: 32px 24px; color: var(--color-text-muted); font-size: 12px; text-align: center; }
.bd-modal-backdrop { position: absolute; inset: 0; background: var(--color-overlay-bg, rgba(0,0,0,0.4)); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 32px; }
.bd-modal { background: var(--color-surface); border-radius: 10px; max-width: 720px; width: 100%; max-height: 100%; overflow: auto; box-shadow: var(--elevation-3); }
```

- [ ] **Step 3: Run all work-items tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/work-items 2>&1 | tail -30
```
Likely some existing tests now fail because `WorkItemList` is no longer rendered by `WorkItemsSection`. Update or delete those tests as appropriate.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.tsx src/BorgDock.Tauri/src/components/work-items/__tests__ src/BorgDock.Tauri/src/styles/index.css
git commit -m "work-items: rewrite section as 3-pane (rail | list | detail)"
```

---

## Task 5.6: Delete `WorkItemList`, `WorkItemCard`, `WorkItemFilterBar`

**Files:**
- Delete: `src/components/work-items/WorkItemList.tsx`
- Delete: `src/components/work-items/WorkItemCard.tsx`
- Delete: `src/components/work-items/WorkItemFilterBar.tsx`

- [ ] **Step 1: Confirm no consumers**

```bash
cd src/BorgDock.Tauri && grep -rn "WorkItemList\|WorkItemCard\|WorkItemFilterBar" src/ 2>&1 | grep -v __tests__
```
Expected: empty (besides any leftover tests).

- [ ] **Step 2: Delete the source files**

```bash
rm src/BorgDock.Tauri/src/components/work-items/WorkItemList.tsx
rm src/BorgDock.Tauri/src/components/work-items/WorkItemCard.tsx
rm src/BorgDock.Tauri/src/components/work-items/WorkItemFilterBar.tsx
```

- [ ] **Step 3: Delete or update orphaned tests**

```bash
cd src/BorgDock.Tauri && ls src/components/work-items/__tests__
```
For each test that targets one of the deleted files, delete it.

- [ ] **Step 4: Type-check + tests**

```bash
cd src/BorgDock.Tauri && npm run build 2>&1 | tail -10 && npm test 2>&1 | tail -20
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add -A src/BorgDock.Tauri/src/components/work-items
git commit -m "work-items: delete WorkItemList, WorkItemCard, WorkItemFilterBar (replaced by 3-pane)"
```

---

# Phase 6 — Focus tab restyle

## Task 6.1: Wrap `FocusList` in `<FocusTab>` shell with hero

**Files:**
- Modify: `src/components/focus/FocusList.tsx` (turn it into the tab body, or add `FocusTab.tsx` wrapping it)

- [ ] **Step 1: Decide structure**

Read `src/components/focus/FocusList.tsx`. If it's already the top-level body of the focus surface, edit it in place. Otherwise create `FocusTab.tsx` and have it render the hero + the existing list.

- [ ] **Step 2: Add hero header**

At the top of the tab body, add:
```tsx
<div className="bd-focus-hero">
  <span className="bd-focus-hero__icon" aria-hidden>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
  </span>
  <div className="bd-focus-hero__text">
    <div className="bd-focus-hero__title">{focusItems.length} pull requests need your attention</div>
    <div className="bd-focus-hero__sub">Ranked by readiness, CI state, and review signals</div>
  </div>
  <Button variant="primary" size="lg" onClick={openQuickReview}>Start Quick Review</Button>
</div>
```

`openQuickReview` already exists somewhere — find with `grep -n "QuickReviewOverlay\|setQuickReviewOpen\|openQuickReview" src/`. Wire to that.

- [ ] **Step 3: CSS**

```css
.bd-focus-hero {
  display: flex; align-items: center; gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--color-subtle-border);
  background: linear-gradient(180deg, var(--color-purple-soft, rgba(102,85,212,0.08)), transparent);
}
.bd-focus-hero__icon { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; background: var(--color-accent-subtle); color: var(--color-accent); }
.bd-focus-hero__text { flex: 1; }
.bd-focus-hero__title { font-size: 14px; font-weight: 600; color: var(--color-text-primary); }
.bd-focus-hero__sub { font-size: 12px; color: var(--color-text-tertiary); margin-top: 2px; }
```

- [ ] **Step 4: Visual verify in dev**

```bash
cd src/BorgDock.Tauri && npm run dev
```
Open the focus tab and confirm the hero renders.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/focus/FocusList.tsx src/BorgDock.Tauri/src/styles/index.css
git commit -m "focus: hero header (count + Start Quick Review CTA)"
```

---

## Task 6.2: Restyle FocusRow grid to match design

**Files:**
- Modify: `src/components/focus/FocusList.tsx` (or wherever rows are rendered)

- [ ] **Step 1: Replace row markup**

Change each focus row to the design's grid:
```tsx
<div className="bd-focus-row">
  <div className="bd-focus-row__rank">{rank}</div>
  <Ring value={item.score} size={38} stroke={3} />
  <div className="bd-focus-row__main">
    <div className="bd-focus-row__chips">
      <Pill tone={reasonTone}>{reasonText}</Pill>
      <span className="bd-mono bd-focus-row__points">+{item.points}</span>
    </div>
    <div className="bd-focus-row__title">{item.title}</div>
    <div className="bd-meta bd-focus-row__meta">
      <Avatar initials={item.initials} tone={item.tone} size="sm" />
      <span className="bd-mono">{item.repo}</span>
      <span className="sep">·</span>
      <span className="bd-mono">#{item.number}</span>
    </div>
  </div>
  <div className="bd-focus-row__status" data-tone={item.statusTone}>{item.statusLabel}</div>
  <Button variant="default" size="sm" onClick={() => openPr(item)}>Open</Button>
</div>
```

`Ring` exists in primitives. Use whatever data the existing focus items already have; map missing fields if needed (e.g., `points`, `score`).

- [ ] **Step 2: CSS**

```css
.bd-focus-row { display: grid; grid-template-columns: auto 44px 1fr auto auto; column-gap: 14px; align-items: center; padding: 14px; margin-bottom: 8px; background: var(--color-surface); border: 1px solid var(--color-subtle-border); border-radius: 10px; }
.bd-focus-row__rank { width: 22px; height: 22px; border-radius: 6px; background: var(--color-surface-hover); color: var(--color-text-tertiary); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
.bd-focus-row__main { min-width: 0; }
.bd-focus-row__chips { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.bd-focus-row__points { font-size: 10px; color: var(--color-text-muted); }
.bd-focus-row__title { font-size: 13px; font-weight: 600; color: var(--color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd-focus-row__meta { margin-top: 3px; }
.bd-focus-row__status { font-size: 11px; }
.bd-focus-row__status[data-tone="failing"] { color: var(--color-status-red); }
.bd-focus-row__status[data-tone="running"] { color: var(--color-status-yellow); }
.bd-focus-row__status[data-tone="passing"] { color: var(--color-status-green); }
```

- [ ] **Step 3: Visual verify**

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/focus/FocusList.tsx src/BorgDock.Tauri/src/styles/index.css
git commit -m "focus: restyle rows to design grid (rank · ring · main · status · open)"
```

---

# Phase 7 — Final cleanup, e2e, smoke

## Task 7.1: Delete `useBadgeSync.ts` (or rename to `useFlyoutSync.ts`)

**Files:**
- Decide: rename or delete

`useBadgeSync.ts` actually syncs to the flyout — it's misnamed. Per the spec it was marked for deletion, but the *flyout sync logic inside it must survive*.

- [ ] **Step 1: Inspect what it does**

```bash
cd src/BorgDock.Tauri && head -60 src/hooks/useBadgeSync.ts
```

- [ ] **Step 2: Rename to reflect actual purpose**

```bash
git mv src/BorgDock.Tauri/src/hooks/useBadgeSync.ts src/BorgDock.Tauri/src/hooks/useFlyoutSync.ts
```

In the renamed file, change the exported symbol `useBadgeSync` → `useFlyoutSync`.

Update consumers:
```bash
cd src/BorgDock.Tauri && grep -rn "useBadgeSync" src/
```
For each hit, replace `useBadgeSync` with `useFlyoutSync`, and update the import path.

- [ ] **Step 3: Type-check**

```bash
cd src/BorgDock.Tauri && npm run build 2>&1 | tail -10
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A src/BorgDock.Tauri/src
git commit -m "rename useBadgeSync → useFlyoutSync (reflects actual flyout payload)"
```

---

## Task 7.2: Update `Header.tsx` "Minimize to badge" button removal artifact

`Header.tsx` was deleted in Task 3.7, so the minimize-to-badge button is already gone. Skip if Phase 3 completed cleanly.

- [ ] **Step 1: Sanity check**

```bash
cd src/BorgDock.Tauri && grep -rn "Minimize to badge\|hide_sidebar" src/
```
Expected: empty.

- [ ] **Step 2: If anything remains, delete it.** Otherwise no-op.

---

## Task 7.3: Tokens audit — diff against design's tokens.css

**Files:**
- Modify: `src/styles/index.css`

- [ ] **Step 1: Pull the design's tokens**

```bash
cat /tmp/borgdock-design/borgdock/project/styles/tokens.css | head -120
```

- [ ] **Step 2: Diff against current tokens**

```bash
cd src/BorgDock.Tauri && grep -E "^\s*--color-" src/styles/index.css | sort > /tmp/current-tokens.txt
grep -E "^\s*--color-" /tmp/borgdock-design/borgdock/project/styles/tokens.css | sort > /tmp/design-tokens.txt
diff /tmp/current-tokens.txt /tmp/design-tokens.txt | head -40
```

- [ ] **Step 3: Add missing tokens**

For each token in the design but missing locally (especially `--color-status-yellow`, `--color-status-green`, `--color-status-red`, `--color-purple-soft`, `--color-accent-subtle`, `--color-overlay-bg`, `--color-selected-row-bg`, `--color-text-faint`, `--elevation-1/2/3`, `--font-mono`), add it to the `:root` and `.dark` blocks of `src/styles/index.css`. **Do not bulk-import.** Only add what the new components actually reference (grep for them).

- [ ] **Step 4: Visual verify**

Run the dev server, switch tabs, verify nothing renders unstyled.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "tokens: add missing CSS variables referenced by new components"
```

---

## Task 7.4: Update e2e tests

**Files:**
- Modify: `tests/e2e/helpers/test-utils.ts`
- Modify: `tests/e2e/window-rendering.spec.ts`
- Modify: `tests/e2e/visual.spec.ts` (any sidebar references)

- [ ] **Step 1: Find references**

```bash
cd src/BorgDock.Tauri && grep -rn "sidebarEdge\|sidebarMode\|sidebarWidthPx\|hide_sidebar\|toggle_sidebar\|position_sidebar" tests/
```

- [ ] **Step 2: For each hit:**
- If it's setting up a fixture default settings object, drop the three keys.
- If it's invoking `hide_sidebar`/`toggle_sidebar`, switch to `show_or_focus_main` or remove (the badge flow is gone).
- If `window-rendering.spec.ts` asserts dimensions of the docked sidebar, update to 1100×760 default.

- [ ] **Step 3: Run e2e**

```bash
cd src/BorgDock.Tauri && npm run test:e2e 2>&1 | tail -40
```
Expected: PASS, or known-flaky tests skipped (don't chase those if pre-existing).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "e2e: update fixtures + dimensions for the regular main window"
```

---

## Task 7.5: Final smoke: `tauri dev`

- [ ] **Step 1: Start the app**

```bash
cd src/BorgDock.Tauri && npm run tauri dev
```

- [ ] **Step 2: Verify the golden path**

Confirm in the running app:
- Window opens centered, ~1100×760, with shadow, native-style chrome (custom titlebar, no OS frame).
- Three tabs visible (Focus / PRs / Work Items). Click each — content swaps.
- Resize the window — content reflows.
- Move the window. Close (X). Re-open via tray icon — restored to last position + size.
- PRs tab: filter pills clickable, search input works, click a PR card — pop-out window opens.
- Work Items tab: queries rail on the left, list in the middle, detail in the right pane. Click a query, click an item — detail loads.
- Filter icon in items toolbar opens the popover. Toggle filters — list updates.
- Focus tab: hero header with "Start Quick Review" button. Click — overlay opens.
- Status bar at the bottom — copy changes per tab.
- Settings window opens — no Sidebar card present.
- Tray icon left-click toggles main window. Global hotkey toggles main window.
- Flyout: Ctrl+Win+Shift+F still opens it.

- [ ] **Step 3: Note any visual regressions**

Anything broken — fix in a follow-up commit; don't roll into this commit.

- [ ] **Step 4: Final no-op commit (or skip)**

If everything looks good, no commit needed. Otherwise, fix and commit.

---

## Self-review (already done by plan author)

**Spec coverage** — every section of the spec has at least one task:
- §1 Tauri framing → Tasks 1.1–1.9
- §2 Frontend settings cleanup → Tasks 2.1–2.3
- §2 Main window shell + WindowControls + TitleBar middle → Tasks 3.1, 3.2, 3.5, 3.6, 3.7
- §3 PRs tab → Tasks 4.1–4.5
- §4 Work Items tab → Tasks 5.1–5.6
- §5 Focus tab → Tasks 6.1, 6.2
- §5 Status bar + tokens audit → Tasks 3.3, 3.4, 7.3
- §6 File inventory cleanup → Tasks 1.7, 1.9, 3.7, 4.5, 5.6, 7.1
- E2E + smoke → Tasks 7.4, 7.5

**No placeholders** — checked. Each task either contains the code to write or, where the codebase variable is not knowable from outside (e.g., exact `useUiStore` selector names), the task gives the inspection command and the substitution rule.

**Type consistency** — `WindowControls`, `MainWindow`, `useStatusBar`, `PrToolbar`, `QueriesRail`, `WorkItemRow`, `WorkItemFilterPopover`, `WorkItemsSection` shapes all reference one another consistently. `ActiveSection` type used everywhere via `useUiStore`.
