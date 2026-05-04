# Settings Screen Redesign

**Date:** 2026-05-04
**Status:** Design — pending implementation plan
**Source design:** Anthropic Claude Design bundle `KX5yCS2GTQr1zJi6a6V1Jw` → `BorgDock - Settings.html`

## Goal

Replace the 360 px right-side `SettingsFlyout` with a full-window Settings experience that opens as its own Tauri window (the same kind of secondary window the Agent Overview and PR Detail windows use). The new window has a left rail of grouped sections and a scrollable content pane on the right, modelled on the design bundle's `SettingsScreen` component.

The redesign is also a chance to lift visual quality across every section, add several net-new affordances the design mocks (rate-limit bar, repo folder scan, ADO match-by, release-notes timeline, clear-cache / reset-everything / diagnostics, deep settings search), and unify the sprawling per-section primitives onto a small shared toolkit.

Pre-adoption (no external users yet — see `MEMORY.md`), so breaking changes to the settings shape, callsite contracts, and `useUiStore` are free.

## User-visible outcome

- Clicking the gear icon, picking *Settings* from the tray menu, or hitting *Configure* in the Work Items section opens a new BorgDock window.
- The window has the standard custom titlebar reused from `WindowTitleBar.tsx`, with a `Settings › <active section>` breadcrumb in the meta slot.
- A left rail (232 px) lists ten sections grouped under **Data sources / Application / AI / System**. The active row is highlighted in the accent colour. A search input at the top filters across every field across every section, not just section labels.
- The content pane scrolls a 720 px column of cards. Each section uses the same Card → Field → control vocabulary so the surface feels unified.
- Settings persist via the existing `save_settings` Tauri command, so opening the new window from any callsite shows current state and saves cleanly.

## Out of scope

- Anthropic monthly-budget slider and *Usage this month* card (explicit user decision: skip).
- Any new settings-file migration logic; pre-adoption means defaulting missing fields in `settings_merge.rs` is sufficient.
- Live re-syncing of the settings window with edits made to the same setting in another window. The `save_settings` round-trip on debounce is already the convergence mechanism, and only one settings window will ever exist at a time.

## Decisions taken in brainstorming

| Question | Decision |
|---|---|
| Q1 Packaging | **A** — own Tauri window, modelled on `agent_overview::window`. |
| Q2 Agent Overview placement | **B** — keep as its own rail item under AI; do not fold into Claude Code. |
| Q3 Feature parity scope | **C** — port net-new design features, *except* Anthropic budget slider + monthly usage card. |
| Q4 Rail search | **B** — deep search across every field in every section, not just labels. |
| Q5 Titlebar | Reuse `src/components/shared/WindowTitleBar.tsx`. Pass the breadcrumb as the `meta` slot. |

## Architecture

### New Tauri window

- `settings.html` at repo root. Mirrors `agent-overview.html`: minimal shell, loads `/src/settings-main.tsx`.
- `src/settings-main.tsx` — entry. Mounts `<SettingsApp/>` inside an `ErrorBoundary`. Hydrates the settings store via the same path as the main window (`useSettingsStore.getState().loadSettings()`).
- `src-tauri/src/settings/window.rs` — new module exposing `open_settings_window(app: AppHandle, section: Option<String>)`. Implementation follows the canonical pattern from `agent_overview/window.rs`: `tokio::sync::oneshot` + `app.run_on_main_thread` so any `WebviewWindow` operation runs on the main thread (per CLAUDE.md). Singleton: if the window labelled `settings` exists, focus it (and forward the optional `section` deep-link via emitted event); otherwise build it.
- Default geometry: 1080×760 px, resizable, min 880×560 px. Persists to `AppSettings.windowGeometry.settings` (sibling of `agentOverview`). On close, geometry is captured the same way the agent-overview window does it.
- Window URL: `settings.html#section=<id>` when called with a `section` argument. `SettingsApp` reads `location.hash` on mount; later events from the Rust side update `activeSection` if the user re-invokes `open_settings_window` with a different section.
- `vite.config.ts` `rollupOptions.input`: add `settings: path.resolve(__dirname, "settings.html")`.
- `src-tauri/src/lib.rs::run` registers `open_settings_window` with `tauri::generate_handler!`.

### Capabilities

`src-tauri/capabilities/settings.json` lists every plugin/permission the section bodies invoke. Audit by grepping each `<X>Section.tsx` for `invoke(`. At a minimum:

- `core:default`, `window:default`, `event:default`
- `dialog:default` (folder pickers in Repos)
- `opener:default` (open github.com, ADO, releases page, log folder)
- `notification:default` (test notification button)
- `process:default` (only if reset-everything restarts the app)
- `autostart:default` (run-at-startup toggle in Appearance — added to Cargo + lib.rs if not present)
- Custom commands: `save_settings`, `load_settings`, `get_credential`, `set_credential`, `delete_credential`, `test_ado_connection`, `test_sql_connection`, `set_global_hotkey`, `prune_worktrees`, `get_github_rate_limit` (new), `scan_repos_under` (new), `clear_cache` (new), `reset_all_settings` (new), `estimate_worktree_prune_size` (new), `run_self_test` (new), `set_agent_overview_enabled`, `agent_overview_status` (new or existing), and any others the audit surfaces.

### Callsite migration

Three places open settings today:

| File | Change |
|---|---|
| `src/components/Header.tsx` | Settings icon `onClick` → `await invoke('open_settings_window')`. |
| `src/App.tsx` (tray menu + fallback) | Tray-event handler → `invoke('open_settings_window')`. |
| `src/components/work-items/WorkItemsSection.tsx` | "Configure" button → `invoke('open_settings_window', { section: 'ado' })`. |

Then delete:

- `src/components/settings/SettingsFlyout.tsx`
- `useUiStore.isSettingsOpen` and `useUiStore.setSettingsOpen` (along with their consumers — there are no others by the time the three callsites above are migrated).

## Shell layout

`src/components/settings/SettingsApp.tsx` is the new root.

```
┌─ WindowTitleBar (reused; breadcrumb in `meta`) ──────────────────────┐
│ [logo] BorgDock │ ⚙ Settings › <Active section>           _ □ ✕     │
├──────────────────────────────────────────────────────────────────────┤
│ Rail (232px)         │ Content (flex, scrollable)                    │
│ ┌─ search input ─┐   │ ┌─ inner column max-width 720, padding 28/36 ┐│
│ │ [🔍] Search…⌘K │   │ │ <SectionHeader>                            ││
│ └────────────────┘   │ │ <Card>…</Card>                             ││
│ ▾ DATA SOURCES       │ │ <Card>…</Card>                             ││
│   ● GitHub  ●green   │ │                                            ││
│   ● Repos            │ │                                            ││
│   ● Azure DevOps     │ │                                            ││
│   ● SQL Server       │ │                                            ││
│ ▾ APPLICATION        │ │                                            ││
│   ● Appearance       │ │                                            ││
│   ● Notifications    │ │                                            ││
│ ▾ AI                 │ │                                            ││
│   ● Claude Code      │ │                                            ││
│   ● Claude API       │ │                                            ││
│   ● Agent Overview   │ │                                            ││
│ ▾ SYSTEM             │ │                                            ││
│   ● Updates  v1.2.0  │ │                                            ││
│   ● Maintenance      │ │                                            ││
│ ─────────────        │ │                                            ││
│ ✓ All synced  v1.2.0 │ │                                            ││
└──────────────────────────────────────────────────────────────────────┘
```

### Section catalogue

| Group | Id | Label | Component |
|---|---|---|---|
| Data sources | `github` | GitHub | `GitHubSection` |
| | `repos` | Repositories | `RepoSection` |
| | `ado` | Azure DevOps | `AdoSection` |
| | `sql` | SQL Server | `SqlSection` |
| Application | `appearance` | Appearance | `AppearanceSection` |
| | `notif` | Notifications | `NotificationSection` |
| AI | `claude` | Claude Code | `ClaudeSection` |
| | `claude-api` | Claude API | `ClaudeApiSection` |
| | `agent-overview` | Agent Overview | `AgentOverviewSection` |
| System | `updates` | Updates | `UpdateSection` |
| | `maintenance` | Maintenance | `MaintenanceSection` |

### Rail decorations

- GitHub & Azure DevOps rows show a green/yellow/red `Dot` mirroring connection status. Source: an existing connection-status hook if one exists; otherwise a small `useConnectionStatus(serviceId)` hook backed by the section's last-test result (kept in a new `connection-status-store.ts`).
- Updates row shows the current version label (`__BORGDOCK_VERSION__`).

### Footer

- "All synced" + green check when no debounced save is pending; "Saving…" with spinner while a save is in flight; "Save failed" with red dot + retry on error.
- Mono version label.

### State

- `activeSection: string` — defaults to `localStorage.getItem('settings.lastSection') ?? 'github'`. Initial value is overridden by `location.hash`'s `section=` parameter if present.
- `searchQuery: string` — drives rail mode (grouped sections vs. search results).
- Section change persists `activeSection` to localStorage and updates `location.hash` (no router; just `history.replaceState`).
- Content pane scrolls to top when `activeSection` changes (unless the change came from a search-result click — see deep search below).

## Primitives

New under `src/components/shared/primitives/`:

| Primitive | API | Notes |
|---|---|---|
| `Toggle` | `{on, onChange, disabled?, ariaLabel?}` | 32×18 pill, accent fill when on. Replaces local `ToggleSwitch` in NotificationSection. |
| `ToggleRow` | `{label, hint?, on, onChange, last?}` | Composes Toggle + label/hint + bottom border. |
| `Slider` | `{value, min, max, step?, onChange, suffix?, format?}` | Track 5 px, 15 px thumb. Keyboard: arrow keys ±step, shift+arrow ±10×step, Home/End jumps to min/max. |
| `Seg2` | `{value, options:Array<{value,label}>, onChange, full?}` | Replaces inline auth-method segmented controls. Keyboard: Left/Right cycles. |
| `Select` | `{value, options:Array<{value,label}>, onChange, placeholder?}` | Wraps native `<select>` styled with chevron. |
| `Checkbox` | `{checked, onChange, label, hint?}` | 16×16, accent fill+check when on. |
| `Field` | `{label?, hint?, dense?, anchorId?, children}` | Wraps a control with label-on-top + hint-below + a `<div id="field-{anchorId}">` for search-jump. |
| `SectionHeader` | `{title, subtitle?, badge?}` | 18 px title, 12 px subtitle, optional `<Pill>` slot. |

Reused as-is: `Card`, `Button`, `IconButton`, `Input`, `Pill`, `Dot`, `Kbd`, `LinearProgress`, `Ring`, `Tabs`, `TitleBar`. `HotkeyRecorder` stays where it is and keeps its capture behaviour; only its outer container is restyled to match the design's `HotkeyField`.

A thin `TextInput` wrapper over `Input` adds the design's `mono?: boolean` and `suffix?: ReactNode` props.

Each new primitive ships with a unit test covering the controlled-state contract and basic a11y attributes.

## Section bodies (visual rewrite, store wiring unchanged)

Each section keeps its `(props, onChange)` interface. Only JSX is rewritten using new primitives + `Card title subtitle right` groupings, matching the design.

### GitHubSection

Single *Authentication* card.

- Auth method `Seg2` (gh CLI / PAT). gh: success banner with username + Re-auth button. PAT: masked `TextInput mono` with show/hide.
- Username `TextInput`.
- **Net-new — Rate limit bar.** New Tauri command `get_github_rate_limit() -> {used: u32, limit: u32, reset_at: i64}`. Polled every 60 s while the section is mounted (cleared on unmount). Renders as `LinearProgress` (height 5 px) + `4,823 / 5,000` mono caption. Track colour via thresholds: green ≤ 80 %, yellow 80–95 %, red ≥ 95 %.
- Buttons: Test connection (existing flow), Open on github.com (uses `opener` plugin).

### ReposSection

Two cards.

- *Tracked repositories*: list rows with branch icon (accent-subtle pill), `owner/name` + `path · branch` mono caption, `n open` Pill (count from existing PR store), Edit + Remove `IconButton`s. Add-repository `Button` in the `right` slot.
- *Add a repository* card:
  - Local folder field: `Input` with leading folder icon + Browse button (existing dialog plugin).
  - **Net-new — Scan parent folder.** New Tauri command `scan_repos_under(path: String) -> Vec<{path, owner, name, already_tracked}>`. UI: monospaced parent path (defaults to `$HOME`) + "*N* git folders, *M* not yet tracked" caption + "Scan…" button. Click opens a small `RepoScanDialog` listing untracked candidates with checkboxes → multi-add.
  - "No local clone yet?" hint with a *Clone from URL…* ghost button. If a `git_clone` command does not already exist, scope this button to surface a tooltip "Use `git clone` and then add the local folder above" — no new clone command in this round.

### AzureDevOpsSection

Two cards.

- *Connection*: 2-column grid (Org / Project) with `Field dense`, `Seg2` auth method, poll-interval `Slider` (30–900 s), Test/Open buttons. Existing structured error handling (`az_not_installed`, `az_not_logged_in`) preserved verbatim.
- *Work-item linking*:
  - **Net-new — match-by `Seg2`** (Branch / PR title (AB#) / Both). New `azureDevOps.linkMatchBy: 'branch' | 'title' | 'both'` field on `AppSettings` (default `'branch'`).
  - `ToggleRow` "Show work-item state on PR card" (existing or new flag).
  - `ToggleRow` "Update PR status when WI moves to Done" (new flag).

### SqlSection

Two cards.

- *Connections*: list rows mirroring design (terminal icon, name + `host · db · auth` mono caption, saved/session `Pill`, Edit/Delete buttons). Inline `ConnectionEditor` opens in a small dialog rather than expanding inline.
- *Defaults*: `Default connection` `Select` (lists existing saved connections), `ToggleRow` "Read-only by default", `ToggleRow` "Confirm DELETE/UPDATE without WHERE". New `sql.defaultConnectionName`, `sql.readOnlyByDefault`, `sql.confirmDestructiveWithoutWhere` settings fields. The SQL window already has read-only behaviour; this just surfaces the default toggle in settings and wires it on window open.

### AppearanceSection

Four cards.

- *Theme*: `Seg2` System / Light / Dark.
- *Sidebar*: `Seg2` edge, `Seg2` mode, width `Slider`.
- *Hotkeys*: existing `HotkeyRecorder` (skinned) for global, flyout, and **net-new** "Quick review" hotkey → `ui.quickReviewHotkey`. Quick-review handler registered alongside the existing global/flyout hotkeys in `src-tauri/src/platform/hotkey.rs` (or wherever the registry lives — verify during implementation). The handler triggers the same code path as the *Open in review* button on the focused PR card.
- *Terminal & startup*: WT profile `TextInput`. Three `ToggleRow`s:
  - "Run at startup" — new field `ui.runAtStartup`. Backed by the `tauri-plugin-autostart` plugin (added to `Cargo.toml` and `lib.rs::run` if not already present, plus the capability grant). Toggling registers / unregisters the autostart entry.
  - "Start minimized to tray" — new field `ui.startMinimizedToTray`, read at startup in the main entry to decide whether to call `window.show()`.
  - "Restore last selection" — new field `ui.restoreLastSelection`. Persists `lastSelectedPrId` on close, restores on launch when the flag is on. Last item, no bottom border.

### NotificationSection

Three cards.

- *What to notify me about*: 6 `ToggleRow`s — check status changes, new PRs, review updates, mergeable, sound on merge, only my PRs.
- *Review reminders*:
  - `ToggleRow` "Nudge for pending reviews".
  - Custom row: label + hint on the left, `Select` "Remind every" interval on the right (15 min / 30 min / 1 hour / 2 hours / 4 hours).
  - `ToggleRow` "Escalate urgency over time" (last).
- *Channels*: chip-style multi-select for Tray balloon / System toast / Sound / Email digest, backed by `notifications.channels: { tray, system, sound, emailDigest }`. Test button + `E S W I M` keyboard hint mono + last-fired mono caption (drawn from `notifications.lastTestFiredAt` updated by the test command).

### ClaudeSection (Claude Code)

One card — *Fix-with-Claude*.

- Post-fix action `Select`, Claude Code path `TextInput mono`, default model `Select`.

### ClaudeApiSection

Two cards (no budget slider, no usage card).

- *Anthropic API*: API key (masked mono `TextInput`), model `Select`, max tokens `TextInput mono`.
- *Where AI is used*: 4 `ToggleRow`s — PR summary card, Diff explanations, Review nudge phrasing, Commit message suggestions.

### AgentOverviewSection

Kept as its own rail item under AI. Bodies re-skinned to match the design's checkbox-list pattern:

- `Checkbox` "Enable telemetry collection" (existing).
- `Checkbox` "Open on BorgDock startup" (existing).
- `Checkbox` "Auto-archive completed sessions after 24 h" — new field `agentOverview.autoArchiveAfterHours: number | null` (24 = on, null = off; UI is a checkbox, value derived).
- OTel health card: status `Pill` (green / yellow / red) + `127.0.0.1:4317 · N events/min · last write Ns ago` mono caption + Open dashboard `Button`. Health driven by an `agent_overview_status` Tauri command (existing or thin new one); polled every 5 s.

### UpdatesSection

Three cards.

- *Channel*: `ToggleRow` "Auto-check for updates", `ToggleRow` "Auto-download updates" (last).
- *Check now*: existing `useAutoUpdate` buttons + status `Pill` + View releases ghost button (opens GitHub releases via opener).
- **Net-new — *Recent releases* card.** Pulled from `src/generated/changelog.ts`. Shows the three most-recent entries. Current version row gets `--color-accent-subtle` background + accent mono version label + "installed" Pill. No mock data — empty changelog → render an inline empty-state hint.

### MaintenanceSection

Three cards.

- *Worktrees*: candidate-count + size estimate row + "Prune worktrees" button. Candidates from existing prune scan; size estimate is **net-new — `estimate_worktree_prune_size() -> {count: u32, bytes: u64}`** Rust command summing recursive sizes on candidate dirs. Result formatted as "≈ 1.2 GB".
- *Onboarding & cache*:
  - "Reset onboarding" (existing — `useOnboardingStore.resetAll`).
  - **Net-new** "Clear cache" → `clear_cache() -> {bytes_freed: u64}` Rust command that drops `%APPDATA%/BorgDock/cache/`. Caption shows current cache size, refreshed on mount and after the action.
  - **Net-new** "Reset everything" → `reset_all_settings()` Rust command. Wipes settings file + every keychain entry tagged with the BorgDock service name. Confirm dialog warning before invoking; on success, calls `process::restart` so the user is taken through onboarding fresh.
- **Net-new — *Diagnostics* card** (`padding=16`):
  - "Copy diagnostic info" — clipboard write of `{appVersion, os, arch, settingsHash, lastConnectionTests}` JSON blob.
  - "Open log folder" — opener on `%APPDATA%/BorgDock/logs/`.
  - "Run self-test" → `run_self_test() -> Vec<{service, ok, message}>` Rust command. Walks every configured service's `test_*_connection` and surfaces results in a small results dialog.

## Deep search

`src/components/settings/settings-search-index.ts`:

```ts
export type FieldEntry = {
  sectionId: SettingsSectionId; // 'github' | 'repos' | …
  anchorId: string;             // unique within section, slug of label
  label: string;                // user-visible field label
  hint?: string;                // matched too, weighted lower
  keywords?: string[];          // synonyms not in label/hint (e.g. ['pat','token'])
};
export const SETTINGS_FIELDS: readonly FieldEntry[] = [ … ];
```

Every `<Field anchorId="…">` in every section corresponds to exactly one entry. A test asserts no orphans (each `SETTINGS_FIELDS` anchor exists in rendered output of its section) and no duplicates per section.

### Behaviour

- Empty query → rail shows the normal grouped section list.
- Non-empty query → rail content swaps to **search results**: matching fields grouped under their section header. Match: case-insensitive substring on label (highest), hint, then keywords. Highlights matched substring with a `<mark>` styled via `--color-accent-subtle`.
- Click a result → `setActiveSection(entry.sectionId)`, then on next paint scroll the field's anchor (`#field-{anchorId}`) into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) and pulse it (300 ms accent-subtle background) via a `data-pulse` attribute set for one paint.
- `⌘K` / `Ctrl+K` focuses the search input from anywhere in the window.
- `Esc` clears the query and refocuses the search.

### Components

- `RailSearchInput` — controlled input + `Kbd` hint.
- `RailSectionList` — renders normal grouped sections.
- `RailSearchResults` — renders search results, sorted by section group order then match score.
- `useFieldPulse(anchorId)` — small hook returning the pulse class for the given anchor when it's the current search target.

## Settings shape additions

```ts
type AppSettings = {
  // …existing…
  windowGeometry: {
    // …existing geometry slots…
    settings?: { x: number; y: number; width: number; height: number };
  };
  azureDevOps: {
    // …existing…
    linkMatchBy: 'branch' | 'title' | 'both';
    showWorkItemStateOnPrCard: boolean;
    updatePrStatusWhenWiDone: boolean;
  };
  ui: {
    // …existing…
    quickReviewHotkey: string;
    runAtStartup: boolean;
    startMinimizedToTray: boolean;
    restoreLastSelection: boolean;
  };
  sql: {
    // …existing…
    defaultConnectionName: string | null;
    readOnlyByDefault: boolean;
    confirmDestructiveWithoutWhere: boolean;
  };
  notifications: {
    // …existing…
    channels: { tray: boolean; system: boolean; sound: boolean; emailDigest: boolean };
    reviewNudge: { enabled: boolean; intervalMinutes: number; escalate: boolean };
    lastTestFiredAt: number | null; // epoch ms
  };
  agentOverview: {
    // …existing…
    autoArchiveAfterHours: number | null; // 24 = on, null = off
  };
  repoPriority: { /* unchanged */ };
};
```

Defaults for every new field added to the general settings module (`src-tauri/src/settings/models.rs` is the entry point — the implementation plan resolves whether merge logic lives there or in a sibling `settings_merge.rs`; agent-overview-specific defaults already live under `src-tauri/src/agent_overview/settings_merge.rs` and stay there). Pre-adoption means no migration code, just defaults filling in missing fields on load.

## New Rust commands

| Command | Purpose | Rough signature |
|---|---|---|
| `open_settings_window` | Spawn or focus the settings window | `async fn(app, section: Option<String>) -> Result<(), String>` |
| `get_github_rate_limit` | Return GitHub REST quota | `async fn() -> Result<RateLimit, String>` |
| `scan_repos_under` | Find git folders under a parent dir | `async fn(path: String) -> Result<Vec<RepoCandidate>, String>` |
| `clear_cache` | Drop %APPDATA%/BorgDock/cache | `async fn() -> Result<u64, String>` (bytes freed) |
| `reset_all_settings` | Wipe settings + keychain | `async fn() -> Result<(), String>` |
| `estimate_worktree_prune_size` | Count + size of prune candidates | `async fn() -> Result<PruneEstimate, String>` |
| `run_self_test` | Test every configured service | `async fn() -> Result<Vec<SelfTestResult>, String>` |
| `agent_overview_status` | OTel endpoint health | `async fn() -> Result<AgentOverviewStatus, String>` (if not already present) |

Every command that creates / focuses a window uses the canonical `tokio::oneshot` + `run_on_main_thread` pattern from `agent_overview/window.rs`. Commands that call `WebviewWindow` builders MUST follow this pattern (deadlock prevention — see `CLAUDE.md`).

## Tests

### Vitest / React

- `src/components/shared/primitives/__tests__/Toggle.test.tsx`, `Slider.test.tsx`, `Seg2.test.tsx`, `Select.test.tsx`, `Checkbox.test.tsx`, `Field.test.tsx` — controlled-state contract + basic a11y attributes.
- `src/components/settings/__tests__/SettingsApp.test.tsx` — renders, switches sections via rail, persists `lastSection` to localStorage, search filters into results, clicking a result scrolls + pulses the anchor (mock `Element.prototype.scrollIntoView`).
- `src/components/settings/__tests__/settings-search-index.test.ts` — every `SETTINGS_FIELDS` entry has a matching `<Field anchorId>` in rendered output of its section; no duplicate anchors per section.
- Existing per-section tests updated to assert via the new primitives (only assertion bodies that referenced `ToggleSwitch` / inline class names change).
- `src/__tests__/build-integrity.test.ts` updated to register `settings.html` as a window entry alongside `agent-overview.html`, `pr-detail.html` etc.

### Rust / cargo

- `src-tauri/src/settings/window.rs` — unit test for the existing-window-focus path (singleton).
- Unit tests for new commands: `get_github_rate_limit` (mocked HTTP), `scan_repos_under` (against a tmp dir), `clear_cache` (against a tmp cache dir), `reset_all_settings` (against tmp settings dir + a mock keychain), `estimate_worktree_prune_size`, `run_self_test`.

## Migration / cleanup

Pre-adoption (per `MEMORY.md`), so:

- Delete `src/components/settings/SettingsFlyout.tsx`, `useUiStore.isSettingsOpen`, `useUiStore.setSettingsOpen`. No backwards-compat shim.
- Update `Header.tsx`, `App.tsx`, `WorkItemsSection.tsx` callsites to invoke `open_settings_window`.
- `settings_merge.rs` defaults handle every new settings field; no settings-file migration.
- `useOnboardingStore` + `WorktreePruneDialog` are kept; the new Maintenance card just calls them differently.

## Worktree

Implementation will be done in a worktree branch named `settings-screen-redesign`, created at the start of plan execution. The spec itself is committed to `master`.

## Open questions for implementation

The implementation plan should resolve:

1. Does an `agent_overview_status` Tauri command already exist? If not, what's the minimum viable implementation (port-open check + an OTel event-counter snapshot)?
2. Where exactly is the global-hotkey registry today — `platform/hotkey.rs` or somewhere else? Naming determines where to wire `ui.quickReviewHotkey`.
3. Is `tauri-plugin-autostart` already in `Cargo.toml`? If yes, audit existing capability grants. If no, add it before the Appearance autostart toggle ships.
4. How does the existing `connection-status` plumbing (if any) report green/yellow/red for GitHub & ADO? If absent, define a tiny `connection-status-store.ts` that listens to `test_*_connection` results.
5. Concrete shape of `lastConnectionTests` for the "Copy diagnostic info" payload.

These don't change the design — they're details to nail down when writing the step-by-step implementation plan.
