# Tray-first UX — Manual Test Scenarios

Comprehensive list of scenarios to validate the tray-first rollout. Each scenario tells you what to do, what to expect, and which commit(s) it verifies. Walk through them top to bottom on a fresh launch.

**Before you start:** Close any running instance of BorgDock and any lingering `npm run tauri dev` that has old code loaded. Start fresh.

```bash
cd src/BorgDock.Tauri && npm run tauri dev
```

---

## Phase 1 — Hotkeys

### 1.1 Silent-ish boot: no sidebar auto-opens
- **Do:** Launch the app.
- **Expect:** No 400×900 sidebar pops up on launch. Tray icon appears immediately in the tray.
- **Covers:** `cf6e1136` (park main offscreen)

### 1.2 Sidebar hotkey still works
- **Do:** Press `Ctrl+Win+Shift+G`.
- **Expect:** Sidebar slides in from the right edge at full monitor height, showing the PR list exactly like before.
- Press again → sidebar goes away.
- **Covers:** `40c9647c` (register_user_hotkeys), `cf6e1136` (show_main_window reads settings to re-dock)

### 1.3 New flyout hotkey
- **Do:** Press `Ctrl+Win+Shift+F` from any app (e.g. while your browser is focused).
- **Expect:** The tray flyout opens at the bottom-right corner. Press again → closes.
- **Covers:** `5fa68354`, `40c9647c`, `9b750f4a`

### 1.4 Settings UI shows both hotkey fields
- **Do:** Tray → Settings → scroll to Appearance/Sidebar section.
- **Expect:** Two rebindable rows labeled **Global Hotkey** and **Flyout hotkey**. Flyout hotkey has help text: _"Toggles the tray flyout from anywhere. Default: Ctrl+Win+Shift+F."_
- **Covers:** `ab21f7cd`

### 1.5 Rebinding sticks
- **Do:** In settings, rebind the flyout hotkey to e.g. `Ctrl+Shift+Alt+B`, save, close settings. Press the new chord.
- **Expect:** Flyout opens. Press original `Ctrl+Win+Shift+F` → nothing (old binding released).
- **Do:** Restart the app. Press the new chord → still opens.
- **Covers:** `40c9647c` (selective unregister-by-key), `5fa68354` (serde default)

---

## Phase 2 — Persistent flyout + positioning

### 2.1 Flyout opens instantly on first click
- **Do:** Fresh launch; click the tray icon.
- **Expect:** Flyout appears with no visible lag. (Pre-phase-2 it was lazy-built on first click.)
- **Covers:** `101e8a91` (build once at startup)

### 2.2 Correct corner positioning on Windows
- **Do:** Open the flyout.
- **Expect:** Flyout bottom edge sits cleanly above the taskbar with a visible small gap. No overlap. Right edge aligns with the tray area.
- **Covers:** `713db903`, `101e8a91`, `119d70b0` (DPI scaling fix), `65d1a1a3` (resize_flyout)

### 2.3 Flyout survives tray click / outside click / hotkey cycling
- **Do:** Open flyout (tray click). Click somewhere else on screen → flyout closes. Open again with hotkey → opens. Click tray → closes.
- **Expect:** Every cycle works without the flyout appearing at a wrong position or not appearing at all.
- **Covers:** `101e8a91` (toggle_flyout refactor), `119d70b0`

### 2.4 DPI scaling
- **Do (optional if you can switch scales):** Change Windows display scale (Settings → System → Display) from 100% to 125% or 150%.
- **Expect:** Flyout bottom still sits above the taskbar with no overlap. Text inside the flyout remains legible (not tiny or giant).
- **Covers:** `119d70b0`

---

## Phase 3 — Flyout modes & notifications

### 3.1 Glance mode renders like before
- **Do:** Open the flyout with a repo that has a few PRs.
- **Expect:** Header (BorgDock + count), stat strip (failing / running / passing), PR list with hover states, footer showing sync time + current sidebar hotkey. Same visual style as pre-refactor.
- **Covers:** `ecb0247c` (FlyoutGlance extraction), `1fb90b3c` (mode reducer wiring)

### 3.2 Notification toast appears when a PR event fires
- **Do:** Use a PR that will change state (e.g. a fresh CI build, or fake a transition by re-running a workflow). Wait for polling to pick up the change (~60s default).
- **Expect:** Flyout window auto-opens at the bottom-right in **toast mode** — a small card (~320px wide) with a severity-colored banner showing the event title, body, and action buttons (`Fix`, `Open`, etc.).
- **Covers:** `af6d0a61` (show_flyout_toast command), `670f6e11` (route sendOsNotification), `7deb4584` (FlyoutToast component)

### 3.3 Toast auto-hides after ~7s
- **Do:** Let the toast sit on screen without interacting.
- **Expect:** It disappears after roughly 7 seconds.
- **Covers:** `7deb4584` (timer), `1fb90b3c` (reducer timer-expired path)

### 3.4 Hover pauses auto-hide
- **Do:** Trigger another toast, then mouse-over the card.
- **Expect:** The toast stays open while your mouse is on it. Move the mouse away → ~7s later it disappears.
- **Covers:** `7deb4584` (clearTimeout on mouseEnter, reschedule on mouseLeave)

### 3.5 Toast action buttons work
- **Do:** Trigger a toast that has a `Fix` or `Open` action; click it.
- **Expect:** The corresponding action fires (e.g. `Open` opens the PR detail window, `Fix` triggers the Claude fix flow on main). The flyout closes after the click.
- **Covers:** `1fb90b3c`, `02dc1680` (handleToastAction with finally block)

### 3.6 Toast stack: multiple events
- **Do:** Trigger 2 or 3 notifications in quick succession (e.g. manually re-run 3 workflows).
- **Expect:** Flyout window grows to accommodate each new card. Up to 3 cards visible; a 4th evicts the oldest (LIFO). Each card is legible, none clipped.
- **Covers:** `f16ec406` (resize on queue change), `0c644516` (TOAST_MAX cap)

### 3.7 Notification while glance is open
- **Do:** Open the flyout in glance mode (tray click). While it's open, trigger a PR event.
- **Expect:** A thin severity-colored banner appears at the top of the flyout's header. The PR list stays visible. Auto-hide does **not** fire (you're looking at it).
- **Covers:** `1fb90b3c` (glance + toast → banner), `ecb0247c` + banner prop

### 3.8 Click-outside during toast
- **Do:** Trigger a toast, then click anywhere outside the flyout.
- **Expect:** Flyout closes immediately. Next `flyout-toast` event opens a fresh toast (NOT a banner on a stale glance).
- **Covers:** `02dc1680` (hide_flyout also dispatches close)

### 3.9 No Windows toast shows up
- **Do:** Trigger any notification while Windows Action Center is open in the corner (slide in from right).
- **Expect:** **No** native Windows toast appears in Action Center. Only the flyout toast.
- **Covers:** `2c328838` (removed send_notification and tauri-winrt-notification)

---

## Phase 4 — Tray-first startup

### 4.1 Tray icon pulses during init
- **Do:** Close the app completely. Kill any lingering `BorgDock` process via Task Manager if needed. Relaunch via Start Menu or `npm run tauri dev`.
- **Expect:** Tray icon appears immediately and **pulses** (gentle brightness breathing) for the first few seconds. Hover it → tooltip reads `"BorgDock — loading…"`. Once init completes (PR fetch done), the pulse stops and the icon shows the PR count + worst status.
- **Covers:** `674cdd66` (Initializing variant + tooltip), `78aa1bc6` (pulse animation + dedup bypass)

### 4.2 Clicking the tray during init shows loading splash
- **Do:** Relaunch the app. Before the pulse stops, click the tray icon.
- **Expect:** Flyout opens showing the init step-list (auth → discover repos → fetch PRs → fetch checks) live-updating. When init completes the flyout transitions to the normal glance/PR-list view.
- **Covers:** `1fb90b3c` (FlyoutInitializing mode), `674cdd66`

### 4.3 Tray right-click menu
- **Do:** Right-click the tray icon.
- **Expect:** Menu items in this order: **Show flyout** (first), **Show sidebar**, **Settings**, **What's new…**, separator, **Quit**. Clicking `Show flyout` opens the flyout. Clicking `Show sidebar` docks the sidebar.
- **Covers:** `9d1c3911`

### 4.4 First-run setup wizard appears
- **Do:** Close the app. Wipe your settings: `del "%APPDATA%\BorgDock\settings.json"`. Relaunch.
- **Expect:** A centered ~520×640 window appears showing the setup wizard (not the docked sidebar). Walk through it.
- **Covers:** `355deae1` (show_setup_wizard)

### 4.5 After setup wizard completes, window parks
- **Do:** Complete the setup wizard and close it.
- **Expect:** The setup window disappears. No docked sidebar appears. Tray icon stays in the tray. Press the flyout hotkey — the flyout opens normally.
- **Covers:** `355deae1` (hide_sidebar on needsSetup===false), `cf6e1136` (park_main_offscreen)

### 4.6 Polling still runs when sidebar is "hidden"
- **Do:** After initial launch (no sidebar summoned), wait 60+ seconds and let polling fire. Then open the flyout.
- **Expect:** Data in the flyout is fresh — `synced just now` or at most a few seconds old. The polling loop is running normally despite the main window being parked.
- **Covers:** `cf6e1136` (off-screen 1×1 trick preserves WebView2 JS execution)

---

## Phase 5 — Cleanup sanity checks

### 5.1 No Windows toast notifications whatsoever
- **Do:** Over a polling cycle or two, trigger several transitions.
- **Expect:** Zero native Windows toasts. All delivered via the flyout.
- **Covers:** `2c328838`

### 5.2 No "badge" window anywhere
- **Do:** Open Settings → Appearance. Check the full screen area around the tray.
- **Expect:** No "Show badge" / "Badge style" / "Indicator style" rows in settings. No separate pill-shaped indicator window anywhere.
- **Covers:** `0e3f46b6`

### 5.3 No stale tray menu items or commands
- **Do:** Right-click tray.
- **Expect:** Menu matches 4.3 exactly, no orphan items. No clickable action does nothing (all five items work).
- **Covers:** Cumulative cleanup

---

## Phase 6 — Regression spot-checks

### 6.1 Palettes still work
- **Do:** Press `Ctrl+F7` (worktree), `Ctrl+F8` (file), `Ctrl+F9` (command), `Ctrl+F10` (SQL).
- **Expect:** Each palette opens normally, unchanged from before.
- **Covers:** Regression — hotkey refactor preserves fixed-hotkey registration.

### 6.2 PR detail pop-out still works
- **Do:** In the flyout (glance mode), click a PR row.
- **Expect:** PR detail window pops out as a first-class window with title bar, skipTaskbar=false (shows in Alt+Tab per your feedback memory).
- **Covers:** Regression — `open_pr_detail_window` unchanged.

### 6.3 Fix with Claude still works
- **Do:** Open the flyout, hover a failing PR, click `Fix`.
- **Expect:** Flyout hides. Main sidebar pops open (or docks) and the Claude fix flow starts. This is the existing `flyout-fix-pr` emit flow.
- **Covers:** Regression — `FlyoutGlance` handlers preserved through refactor.

### 6.4 Auto-hide sidebar on blur (if you had that enabled)
- **Do:** Summon the sidebar (`Ctrl+Win+Shift+G`). Click outside or focus another window.
- **Expect:** Sidebar hides (parks off-screen).
- **Covers:** `cf6e1136` — `hide_main_window` still called on blur; now parks instead of `win.hide()`.

### 6.5 What's New window
- **Do:** Tray → What's new…
- **Expect:** The existing What's New window opens unchanged.
- **Covers:** Regression.

---

## Known quirks / expected behavior

- **Task 12 reviewer flagged (not fixed, by design):** `App.tsx:168` only registers the flyout hotkey when `globalHotkey` is non-empty. If you clear the sidebar hotkey entirely and leave only the flyout hotkey, the flyout hotkey won't register. No UI exists to clear hotkeys today, so this is harmless. Tighten if a clear-button is ever added.
- **E2E test file:** `tests/e2e/tray-first.spec.ts` is committed but currently skipped. The existing Playwright harness can't run main-window specs while `tauri dev` is active. Manual testing covers the same ground. To run the E2E manually: stop `tauri dev`, `npm run dev` instead, then `npm run test:e2e -- tray-first`.
- **Tray pulse renders a brightness-modulated idle icon.** It breathes across ~9s per full cycle. If you find it distracting we can tune the amplitude or frequency — the code is in `src-tauri/src/platform/tray.rs::render_initializing_icon`.
- **Flyout toast size.** Each card is budgeted 160px tall plus outer padding. Bodies with 3+ lines of text might get tight; we can bump the per-card budget if real notifications start hitting this.

## Rollback points

If anything is badly broken you can `git reset --hard <sha>` back to:

| Phase | Last commit | Good-to-here meaning |
|---|---|---|
| Before any tray-first work | `68504d37` | Plan + spec only landed; nothing broken |
| End of Phase 1 | `ab21f7cd` | Flyout hotkey works; no window changes |
| End of Phase 2 | `119d70b0` | Persistent flyout + per-OS position |
| End of Phase 3 | `f16ec406` | Toasts + notification routing (OS toasts still fire in parallel) |
| End of Phase 4 | `9d1c3911` | Tray-first startup, all behavior in place (cleanup still to come) |
| End of Phase 5 | `0e3f46b6` | OS toast path + badge removed |

## Summary of commits landed (in order)

Phase 1 — `5fa68354`, `40c9647c`, `9b750f4a`, `ab21f7cd`
Phase 2 — `713db903`, `101e8a91`, `65d1a1a3`, `119d70b0`
Phase 3 — `af6d0a61`, `0c644516`, `1319092c`, `ecb0247c`, `1fb90b3c`, `02dc1680`, `7deb4584`, `670f6e11`, `f16ec406`
Phase 4 — `cf6e1136`, `355deae1`, `674cdd66`, `78aa1bc6`, `9d1c3911`
Phase 5 — `2c328838`, `140dce4d`, `0e3f46b6`
Phase 6 — `47b1e639` (skipped E2E, see quirks)
