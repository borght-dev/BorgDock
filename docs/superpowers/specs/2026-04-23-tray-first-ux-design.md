# Tray-first UX: startup, unified flyout, in-app notifications

**Date:** 2026-04-23
**Status:** Spec

## Motivation

BorgDock currently docks a 400-pixel-wide sidebar to the screen edge on startup and keeps it there for the session. It shows a splash step-list on boot and the PR list afterwards. Users who only need at-a-glance status pay for a constantly-present column of screen real estate.

Notifications today fire as native Windows toasts via `tauri-winrt-notification` (and `osascript` on macOS). These land in Action Center, are styled by the OS, and can't carry the same interaction affordances as the rest of the app.

This spec reshapes BorgDock around a tray-first model:

- Tray icon + flyout are the primary surface.
- Sidebar becomes an on-demand deep-dive view, summoned with `Ctrl+Shift+Win+G`.
- Notifications are delivered as BorgDock-styled toasts in the flyout window, positioned near the tray, replacing the OS toast path entirely.

## Non-goals

- Notification history / log view.
- Moving GitHub polling to Rust (a future refactor if the off-screen trick proves flaky).
- Redesigning the sidebar layout beyond "don't auto-open it."
- KDE/Linux-with-bottom-panel first-class tray positioning (a follow-up setting).
- Full cross-platform tray-position detection. We use per-OS defaults.

## User-facing behavior

### On launch

1. Tray icon appears immediately in an **initializing** state — brand gradient with a subtle pulse overlay, tooltip `BorgDock — loading…`.
2. No window is visible on screen.
3. If the user clicks the tray during init, the flyout opens showing the existing `SplashScreen` step-list inline, with the same retry wiring as today.
4. When init completes, tray icon updates to its normal `idle` / `passing` / `pending` / `failing` state and the flyout (if open) transitions to `glance` mode.
5. **First-run / setup-needed exception:** if `needsSetup === true`, the main window opens as a centered ~520×640 setup-wizard window (not docked). When setup completes, the window hides and behavior returns to tray-first.

### The flyout

The flyout is one window with four render modes driven by React state:

| Mode | Size (approx.) | Shown by | Exits on |
|---|---|---|---|
| `idle` | hidden | — | — |
| `initializing` | 412×512 | tray click / hotkey while init running | init-complete → `glance` or `idle` |
| `glance` | 412×512 | tray click, `Ctrl+Shift+Win+F`, tray-menu "Show flyout" | click-outside, window blur |
| `toast` | 340 × (140 × N + gap) for N ≤ 3 | `flyout-toast` event from polling | 7s auto-hide (paused on hover), click-outside, action button |

**Glance mode** renders the current `FlyoutApp` body — header, stat strip, scrollable PR list, footer. No changes to this layout.

**Toast mode** renders a vertical stack of up to 3 cards. Each card has:

- A severity-colored top bar (red/amber/green/violet matching the existing `--color-status-*` vars).
- Title, body text.
- Action buttons supplied by the notification builder (`Fix`, `Open`, `Start Review`, `Merge`, `Open in GitHub`). Buttons invoke the same commands as the existing in-app notifications (`open_pr_detail_window`, `emitTo('main', 'flyout-fix-pr', …)`, etc.).

When a 4th notification arrives while 3 cards are visible, the **oldest** card is evicted. No "+N more" counter.

### Transitions between modes

- **Notification while `idle`** → show window, enter `toast`, start 7s timer.
- **Notification while `glance`** → stay in `glance`, render a thin severity-colored banner at the top of the PR list (a 4th banner variant inside the glance body). Don't start a timer — the user is already engaged.
- **Notification while `toast`** → append card, re-start timer based on newest item.
- **Tray click while `toast`** → transition to `glance`, cancel timer.
- **Hover while `toast`** → clear timer. **Mouse-leave** → restart timer with full duration (simpler than tracking remaining time; acceptable in practice).
- **Click-outside** while `glance` or `toast` → hide, return to `idle`. Existing `click_outside` hook on Windows plus the `blur` handler on non-Windows remain the mechanism.

### Hotkeys

- `Ctrl+Shift+Win+G` → toggle **sidebar** (main window). Unchanged, still user-configurable.
- `Ctrl+Shift+Win+F` → toggle **flyout** in `glance` mode. New, user-configurable.
- Palette hotkeys (`Ctrl+F7` / `F8` / `F9` / `F10`) — unchanged.

### Tray

- Left-click → toggle flyout (`glance` mode) — unchanged.
- Right-click menu items, in order:
  - **Show flyout** (default / first; Enter-after-menu-open does the common thing)
  - Show sidebar
  - Settings
  - What's new…
  - (separator)
  - Quit
- Tray icon gains a new `TrayWorstState::Initializing` variant rendered by `render_tray_icon` using the brand gradient with a pulse overlay. Tooltip becomes `BorgDock — loading…` during this state.

## Architecture

### Window topology

| Window | Visibility at boot | Lifecycle |
|---|---|---|
| `main` (sidebar) | **visible, 1×1, off-screen** | Built in Tauri `setup`. Polling and init run here. Summoned = resize + reposition to edge-dock. Hidden = back to 1×1 off-screen. |
| `flyout` | **invisible, positioned near tray** | Built in Tauri `setup`. Never destroyed. Shown/hidden/resized only. |
| `badge` | **n/a — removed** | See "Cleanup" below. |
| Palettes, SQL, whats-new, pr-detail, file-viewer | unchanged | Created on demand as today. |

The 1×1-off-screen trick for `main` avoids WebView2's background-JS throttling on Windows while still giving the user the perception of "no window on startup." When the user summons the sidebar, Rust resizes `main` back to its dock dimensions and positions it on the correct edge via the existing `apply_sidebar_position` helper.

### Flyout positioning per OS

| OS | Anchor | Anchor offset | Growth direction |
|---|---|---|---|
| Windows | bottom-right of work area | ~48px taskbar height | grow **up** |
| macOS | top-right of work area | ~28px menu bar height | grow **down** |
| Linux (default) | top-right of work area | ~32px indicator area | grow **down** |

`position_flyout_above_tray` is renamed `position_flyout_near_tray` and switches on `cfg!(target_os = ...)`. `resize_flyout` takes an implicit per-OS anchor; on Windows, the top-left Y coordinate is recomputed each resize (anchor = bottom-right), on macOS/Linux the top-left stays put (anchor = top-right).

KDE / Linux-with-bottom-panel users will find the flyout at the top-right of the screen even if their panel is at the bottom. A follow-up setting can add a `flyoutAnchor: 'top-right' | 'bottom-right'` override — not in scope for this spec.

### IPC surface changes

**New Rust commands:**

- `show_flyout_toast(payload: ToastPayload)` — enqueue a toast event for the flyout, show the window in toast size, emit `flyout-toast` to the flyout webview.
- `resize_flyout(width: u32, height: u32)` — main-thread-marshalled resize (same oneshot pattern as `resize_badge`).
- `show_flyout_glance()` — helper called by the flyout hotkey to show the flyout in glance mode.

**Modified:**

- `register_hotkey` now registers both the sidebar hotkey and the flyout hotkey. Settings model carries `flyoutHotkey: String` with default `"Ctrl+Shift+Win+F"`.
- Tray menu gains `Show flyout` as the first item.

**Removed:**

- `send_notification` Rust command — replaced by `show_flyout_toast`.
- `tauri-winrt-notification` dependency and the whole `#[cfg(windows)]` / `#[cfg(not(windows))]` notification.rs split.
- The `notification-action` event channel and `useNotificationActions` hook — toast action buttons dispatch directly inside the flyout React code.
- `badge` window and its commands (`set_badge_visible`, `resize_badge`, `hide_badge`) along with `BadgeApp.tsx` and `badge.html` — confirmed unused after a grep before the cleanup commit lands.

### Data flow for a notification

```
poll tick →
  services/github/aggregate or check diff detects event →
  services/notification.ts builds InAppNotification →
  sendOsNotification (renamed or reimplemented) →
    invoke('show_flyout_toast', payload) →
      Rust: ensure flyout sized for N toasts, show + focus, emit 'flyout-toast' →
        FlyoutApp receives event →
          push onto toast queue, transition to `toast` mode (or stay `glance` with banner), start/reset 7s timer →
            on action click: invoke existing command (open_pr_detail_window, emitTo main, etc.) →
              invoke('hide_flyout')
```

### React-side state machine

`FlyoutApp` owns a discriminated-union `mode` state:

```ts
type FlyoutMode =
  | { kind: 'initializing' }
  | { kind: 'glance'; banner?: ToastPayload }
  | { kind: 'toast'; queue: ToastPayload[]; timerDeadline: number };
```

Transitions are pure functions of the current mode + incoming event (`tray-click`, `hotkey`, `flyout-toast`, `init-complete`, `mouse-enter`, `mouse-leave`, `action-click`, `click-outside`).

The hover timer is modeled as an effect that reads `mode.timerDeadline` and schedules a single `setTimeout`. Hover resets the deadline to `Date.now() + 7000`. Keep the reset-on-leave simple — no pause/resume math.

### Startup sequence (Rust `lib.rs` `setup`)

1. Install panic hook, logging, DB init — unchanged.
2. Build `main` at 1×1, off-screen (e.g. `(−32000, −32000)` clamped to the primary monitor's `position().x - 32000` as a floor so multi-monitor setups don't send it to the wrong display). `visible: true`, `skipTaskbar: true`, `decorations: false`, `alwaysOnTop: false`.
3. Build `flyout` invisibly, call `position_flyout_near_tray` once.
4. Register tray icon in `Initializing` state.
5. Register hotkeys (sidebar + flyout).
6. Spawn updater, setup wizard check, etc. — unchanged.

When `needsSetup === true`, `main`'s React tree detects this and invokes a new `show_setup_wizard` Rust command that resizes `main` to ~520×640 centered and shows it. When the wizard completes, the React tree invokes `hide_sidebar`, which is repurposed: instead of calling `win.hide()`, it resizes `main` to 1×1 and repositions it off-screen, leaving it visible so the polling loop keeps running. The old `hide_sidebar` callers (tray menu, flyout "open sidebar" action after user closes it) already want the same "make it invisible" outcome — they just never cared about `win.hide()` specifically. The one place `win.hide()` behavior is semantically required, the flyout's own hide, uses `hide_flyout` which is a separate command.

When init completes, the React tree invokes `update_tray_icon(count, worst_state)` as today, which implicitly exits the `Initializing` tray state.

### Settings model change

`AppSettings` (or wherever `hotkey` lives today — `settings/models.rs`) gains:

```rust
pub struct AppSettings {
    pub hotkey: String,            // existing: sidebar toggle
    pub flyout_hotkey: String,     // new: flyout toggle, default "Ctrl+Shift+Win+F"
    // ...
}
```

The settings UI gains a matching input, rendered next to the existing hotkey field, same binding-capture component.

Migration: existing users on an older settings shape get `flyout_hotkey` populated to the default on first load via serde `#[serde(default)]` and a default function — no migration SQL.

### WebView2 / Windows caveats

- Main-thread marshalling for `WebviewWindowBuilder::build()`, `show`, `hide`, `set_position`, `set_size` is still mandatory (see CLAUDE.md). `show_flyout_toast` is async and uses the same oneshot-to-main-thread pattern as `open_pr_detail_window` and `resize_badge`.
- The `'wasm-unsafe-eval'` CSP carve-out (syntax highlighter) stays.
- Off-screen positioning of `main`: use `PhysicalPosition::new(monitor.position.x - 32000, monitor.position.y - 32000)` to make sure we move it off whichever monitor the app is on, not hardcoded (−32000,−32000) which could land on an adjacent monitor on multi-head setups.

### macOS/Linux notes

- Menu-bar tray on macOS: `position_flyout_near_tray` uses the top-right of the monitor work area. The tauri tray on macOS surfaces near the menu bar's right edge; anchoring flyout's top-right to a fixed offset below the menu bar is accurate enough.
- GNOME (Ubuntu): indicator area is top-right — same positioning as macOS works. Non-GNOME Linux (KDE, XFCE) may have trays elsewhere — out of scope until users complain.
- Non-Windows `send_notification` path (`osascript`) is deleted along with the Rust command. The flyout gives them the same UX cross-platform.

## Testing

- Unit tests for the React `FlyoutApp` state machine: every transition in the table above, plus hover timer reset and click-outside from each visible state.
- Playwright E2E: startup shows no window, tray click opens flyout, hotkey opens flyout, notification event opens toast and auto-hides, hover pauses auto-hide.
- Manual verification on Windows (primary), macOS, and Ubuntu GNOME for flyout positioning and tray behavior. Not automated — per-OS work-area math is small and stable.
- Lint / type-check / existing test suite must pass after cleanup — the `tauri-winrt-notification` dep removal and `send_notification` deletion will surface any remaining call sites.

## Risks

- **Off-screen `main` window trick** may interact with Windows screensavers, RDP session changes, or display-remap events and re-appear at (−32000, −32000) on-screen for a frame. Mitigation: re-apply off-screen position on `WindowEvent::Resized` or `Moved` while in "hidden" state. If flaky, escalate to moving polling into a Rust background task.
- **Click-outside hook on Windows** already exists (`platform::click_outside`); it must now be installed whenever the flyout is shown in *any* mode, including `toast`. Current code installs it only in `toggle_flyout`. Small refactor to centralize.
- **Tray `Initializing` pulse animation** — `render_tray_icon` renders a static 64×64 RGBA buffer. A true pulse requires re-rendering on an interval while init is running. A tokio task in Rust that re-renders every ~500ms with a phase-shifted overlay, stopping on `init-complete`, is the simplest implementation. The existing `LAST_ICON_STATE` dedup cache must be bypassed while the `Initializing` animation is running — it fast-paths equal states, which is the wrong behavior for an animated frame sequence.
- **`notification-action` listener removal** — if any currently-unknown code path still depends on it, we'll see test failures. The grep before cleanup is the safety net.
- **Flyout hotkey conflict with a user's other app** — user-configurable, so recoverable.

## Open items that don't block the plan

- Tray icon design for `Initializing` state — pulse vs. spinner vs. the existing "dormant" gradient. Pick during implementation.
- Toast card visual design — severity bar width, corner radius, button hover state. Pick during implementation; follow existing `FlyoutApp` palette.
- Whether to reuse `FlyoutApp.tsx` for all four modes or split into `FlyoutGlance`, `FlyoutToast`, `FlyoutInitializing` components. Likely split, with a small `FlyoutApp` shell that picks one based on `mode.kind`. Decide during implementation.
