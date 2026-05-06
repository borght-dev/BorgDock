# Main window rewrite: docked sidebar → regular window

**Date:** 2026-05-06
**Status:** Draft (awaiting user review)
**Source design:** `BorgDock - Sidebar.html` from the `borgdock` design package (Claude Design handoff). See `borgdock/chats/chat7.md` for the design intent — the original sidebar variants were deliberately deleted; the file now contains only Focus, PRs, and Work Items as three tabs in one regular window.

---

## Goal

Replace the screen-edge-docked sidebar (the current "main" Tauri window) with a **regular floating, resizable window** containing three section tabs: **Focus**, **PRs**, **Work Items**. Drop the dock-to-edge feature entirely. Implement the **Work Items** tab as a 3-pane layout (queries rail | items list | detail). PR detail moves to its existing pop-out window.

## Non-goals

- Settings window, Setup Wizard, Flyout, SQL window, File Palette, Agent Overview, PR detail pop-out — visual ports for these are separate, future specs.
- `WorkItemDetailPanel` itself — being overhauled in a separate branch. This spec only embeds whatever it becomes into the new 3-pane right rail.
- Resizable column widths in the Work Items 3-pane (drag handles) — fixed widths in v1, follow-up later.
- Backwards-compat / migration UX for dropped settings — no users yet (per `CLAUDE.md`), so cleanup is free. Serde defaults handle stale settings files.

---

## 1. Window framing & lifecycle

### Tauri window definition

`src-tauri/tauri.conf.json` `app.windows[main]` becomes:

```json
{
  "label": "main",
  "decorations": false,
  "resizable": true,
  "shadow": true,
  "transparent": false,
  "center": true,
  "width": 1100,
  "height": 760,
  "minWidth": 720,
  "minHeight": 520,
  "skipTaskbar": false,
  "visible": false
}
```

Drop `alwaysOnTop` and any dock-position math. `visible: false` so React reveals via `window_ready` after first paint (existing pattern).

### Window state persistence

Use the official **`tauri-plugin-window-state`** (Tauri 2 plugin family). Restores size, position, maximized state, per-monitor where the window last lived. No custom code.

- Add to `src-tauri/Cargo.toml`: `tauri-plugin-window-state = "2"`.
- Register in `src-tauri/src/lib.rs::run`: `.plugin(tauri_plugin_window_state::Builder::default().build())`.
- Grant in `src-tauri/capabilities/main.json`: `"window-state:default"`.
- Sidecar JSON written to the existing app config dir; no extra wiring.

### Lifecycle

| Event | Behavior |
|-------|----------|
| Launch | Rust builds main window invisible → React mounts, hydrates settings → `window_ready` shows + focuses. |
| Close (X titlebar) | Window hides; tray icon stays. `WindowEvent::CloseRequested` is intercepted on `label == "main"` only (`api.prevent_close()` then `win.hide()`). |
| Minimize (— titlebar) | Native taskbar minimize via `WebviewWindow::minimize()`. **No badge.** |
| Maximize (□ titlebar) | `WebviewWindow::toggle_maximize()`. |
| Global hotkey (default `Ctrl+Win+Shift+G`) | If hidden → show + focus. If visible & focused → hide. If visible & unfocused → focus. Replaces `toggle_sidebar`. |
| Tray icon left-click | Same as global hotkey. |
| Tray menu "Show BorgDock" | Explicit show + focus. |
| Tray menu "Quit" | App quits (existing). |
| Tray flyout (`flyout` window) | **Untouched.** Hotkey, hide-on-blur, all preserved. |

### Settings cleanup

**Removed from `src/types/settings.ts`** and `src-tauri/src/settings/models.rs`:
- `SidebarEdge` type
- `SidebarMode` type
- `UiSettings.sidebarEdge`
- `UiSettings.sidebarMode`
- `UiSettings.sidebarWidthPx`

**Removed from `src/components/settings/AppearanceSection.tsx`**: the entire "Sidebar" `<Card>` (3 fields). Theme card stays; Hotkeys card stays; Terminal & startup card stays.

**Kept**: `globalHotkey`, `flyoutHotkey`, `quickReviewHotkey`, `theme`, `runAtStartup`, `startMinimizedToTray`, `restoreLastSelection`, `windowsTerminalProfile`.

Serde `#[serde(default)]` on `UiSettings` already covers loading old configs that contain the dropped fields — they're silently ignored.

### Rust cleanup

**Removed** from `src-tauri/src/platform/window.rs`:
- `position_sidebar` command
- `apply_sidebar_position` fn
- `hide_sidebar` command
- `toggle_sidebar` command (replaced by show/focus logic in the global-hotkey handler)
- AppBar work-area reservation (Windows-only code)
- `set_badge_visible`, `resize_badge`

**Removed** elsewhere:
- Badge HTML shell (`src/badge.html` or equivalent) and any `BadgeApp` component.
- `useBadgeSync` hook.
- Badge entry in `src-tauri/tauri.conf.json` if present.
- Badge-related capabilities files.

**Updated**:
- `src-tauri/src/lib.rs` — main window's `WindowEvent::CloseRequested` now hides instead of closing. Tray "Show" handler calls `show + set_focus`. Tray icon left-click handler same.
- Global hotkey handler: implements show/hide/focus tri-state.
- `src/App.tsx` — drop the `position_sidebar` `useEffect` (lines ~234-244), drop the `hide_sidebar` call after setup completes (lines ~110-119, replaced with a no-op or a `show` call).

---

## 2. Main window shell

### Component layout

Replaces the current `App.tsx` → `Sidebar` → children pattern.

```
<MainWindow>                            (replaces Sidebar.tsx)
  <TitleBar
    left={
      <Logo /> "BorgDock" <Pill tone="neutral">{n} open</Pill>
    }
    right={
      <SectionTabs value={activeSection} onChange />
      <Spacer />
      <StatusDot tone={hasFailing ? "red" : "green"} />
      <IconButton Refresh onClick={refresh} />
      <IconButton Settings onClick={openSettings} />
      <Spacer width={4} />
      <WindowControls />
    }
  />
  <SectionRouter activeSection>
    <FocusTab />        when 'focus'
    <PrsTab />          when 'prs'
    <WorkItemsTab />    when 'workitems'
  </SectionRouter>
  <StatusBar
    left={statusBarLeft(activeSection)}
    right={statusBarRight(activeSection)}
  />
</MainWindow>
```

### File moves / renames

| Today | After |
|-------|-------|
| `components/layout/Sidebar.tsx` | `components/layout/MainWindow.tsx` (rename + restructure: drop `data-section` shell, drop inline `PrDetailPanel` mount, drop `sidebar-toolbar` row) |
| `components/layout/Header.tsx` | folded into `MainWindow.tsx` (split across titlebar slots; the standalone Header is gone) |
| `components/layout/StatusBar.tsx` | stays; restyled to design's `.bd-statusbar` |
| `components/layout/FilterBar.tsx` | merged into `components/pr/PrToolbar.tsx` |
| `components/layout/SearchBar.tsx` | merged into `components/pr/PrToolbar.tsx` |

### Section persistence

`activeSection` already in `useUiStore`. Add localStorage persistence (`mainWindow.activeSection`) so re-opens land where the user left.

### Window controls (the three buttons on the right)

New `WindowControls` component (in `components/shared/primitives/` or `components/layout/`):

```tsx
function WindowControls() {
  const win = getCurrentWindow();
  return (
    <>
      <IconButton tone="window" onClick={() => win.minimize()} aria-label="Minimize"><MinusIcon /></IconButton>
      <IconButton tone="window" onClick={() => win.toggleMaximize()} aria-label="Maximize"><MaximizeIcon /></IconButton>
      <IconButton tone="window-close" onClick={() => win.close()} aria-label="Close"><XIcon /></IconButton>
    </>
  );
}
```

Two new tone variants on `IconButton`: `window` (subtle hover) and `window-close` (red hover). The window's `CloseRequested` interceptor turns `.close()` into hide.

### TitleBar composition

`TitleBar` today exposes `left`/`right` slots with a single growing spacer between. Design centers `SectionTabs` between the title cluster and the controls — that requires **two** growing spacers (one on each side of the tabs). Two ways to land it:

- **A.** Add a `middle` slot to `TitleBar` (`left` — spacer — `middle` — spacer — `right`). Cleanest API, callable from any future window.
- **B.** Compose inside the `right` slot with a leading `<span style={{flex:1}} />` so layout becomes `[left] [spacer] [right-spacer] [Tabs] [status dot] [refresh] [settings] [windowcontrols]`.

Pick **A** — the middle slot is the right primitive shape and other surfaces (Settings, SQL window) will likely want it too.

### Right-side titlebar buttons

- **Refresh** — keep, calls existing `dispatchRefresh()`.
- **Settings** — keep, opens settings window via existing `open_settings_window` invoke.
- **"Minimize to badge" button** in current Header — **removed** (badge is gone).
- **Polling spinner** — removed (status dot conveys it).

---

## 3. PRs tab

### Layout

```
<PrsTab>
  <PrToolbar>
    {FILTER_PILLS.map(f => <Chip active count tone>)}
    <Spacer />
    <Input variant="search" placeholder="Filter pull requests…"
           leftSlot={<SearchIcon />} rightSlot={<Kbd>⌘K</Kbd>} />
  </PrToolbar>

  <ScrollArea>
    {repoGroups.map(g =>
      <RepoGroup repo header pillCount onCollapse>
        {g.prs.map(pr => <PrCard pr onClick={() => openPrDetail(pr)} />)}
      </RepoGroup>
    )}
  </ScrollArea>
</PrsTab>
```

### Filter pills

Replace `components/layout/FilterBar.tsx` with a `Chip`-based row inside `components/pr/PrToolbar.tsx`. Filter list (per design):

```
{ id: "all",     label: "All",          count: total }
{ id: "needs",   label: "Needs Review", count: ... }
{ id: "mine",    label: "Mine",         count: ... }
{ id: "failing", label: "Failing",      count: ..., tone: "error" }
{ id: "ready",   label: "Ready",        count: ... }
{ id: "review",  label: "Review",       count: ... }
{ id: "closed",  label: "Closed",       count: ... }
```

Filter state stays in whichever store currently owns it (`useUiStore` or filter-specific) — keep wiring, rebuild UI only.

### Search input

Replace `components/layout/SearchBar.tsx`. Use existing `Input`/`TextInput` primitive with `leftSlot`/`rightSlot`. ⌘K opens it focused — verify against existing keyboard shortcut hook (`useKeyboardShortcuts`); add binding if missing.

### Repo grouping

`components/pr/RepoGroup.tsx` exists. Restyle header per design:

```
<ChevronDown size={13} /> <SectionLabel>{repo}</SectionLabel>
<Hr flex /> <Pill tone="ghost">{count}</Pill>
```

Internal PR card stack: `flex-direction: column; gap: 8px`.

### PR card

Existing `PrCardView.tsx` / `PrCardContainer.tsx` audit against design. **`PrCardExpanded.tsx` is deleted** — the chevron toggle and inline expand-on-chevron behavior go away. Clicking anywhere on the card opens the existing `pr-detail` pop-out window via `open_pr_detail_window`.

### Inline PR detail mount goes away

`Sidebar.tsx`'s `selectedPr ? <PrDetailPanel /> : children` branch is gone. `selectedPrNumber` in `useUiStore` is kept only if the keyboard nav highlight needs it; otherwise delete.

---

## 4. Work Items tab (3-pane)

### Layout

```
<WorkItemsTab>                          // CSS Grid: 240px | 380px | 1fr
  <QueriesRail>                         // 240px wide, scroll-y, right separator
    <SectionLabel>Favorites</SectionLabel>
    {favoriteQueries.map(q => <QueryRow star q active={selected} count />)}
    <SectionLabel>My Queries</SectionLabel>
    {myQueries.map(q => <QueryRow q active={selected} count />)}
    <Spacer flex />
    <Button variant="ghost" size="sm" onClick={openQueryBrowser}>Browse all queries…</Button>
  </QueriesRail>

  <ItemsColumn>                         // 380px wide, right separator
    <ItemsToolbar>                      // sticky top
      <Input search placeholder="Filter {n} items…" />
      <FilterPopoverButton>              // Q10 = B
        <IconButton FilterIcon />
        <Popover>
          <Field label="State">{stateFilter}</Field>
          <Field label="Assignee">{assigneeFilter}</Field>
          <Field label="Tracking">{trackingFilter}</Field>
        </Popover>
      </FilterPopoverButton>
    </ItemsToolbar>
    <ScrollArea>
      {items.map(w => <WorkItemRow w selected={w.id === selectedId} onClick />)}
    </ScrollArea>
  </ItemsColumn>

  <DetailPane>                          // 1fr, scroll-y
    {selectedId
      ? <WorkItemDetailPanel ... />     // unchanged — overhauled in other branch
      : <EmptyState>Select a work item</EmptyState>}
  </DetailPane>
</WorkItemsTab>
```

### QueriesRail

New component. Drives off existing `useWorkItemsStore` selectors (`queryTree`, `selectedQueryId`, `favoriteQueryIds`). `QueryRow` props: `name`, `count`, `active`, `star`, `onSelect`.

The existing `QueryBrowser.tsx` overlay component **stays** — wired to the "Browse all queries…" button at the rail's bottom. It opens as a **modal** (centered, with backdrop), not a full-window overlay. Used for exploring the full ADO query tree and adding favorites.

### WorkItemRow

New compact row component (replaces card-based `WorkItemList` / `WorkItemCard` rendering). Per design:

```
[Pill tone={typeColor[type]}>{type}</>] [mono AB#{id}] [spacer] [Pill "working" if working]
{title}                                                                     // 12.5px, weight 500
{state} · P{prio}                                                           // meta row
```

`typeColor`: `Bug → error`, `User Story → neutral`, `Task → warning`.

Click → selects (sets `workItemsSelectedId`), detail pane updates. Tracking/working-on toggles move to a **hover-revealed icon button row** in the row's right gutter (visible only on row hover, plus always-visible when active so the user can see *which* rows are tracked/working at a glance).

### Filter popover (Q10 = B)

Existing `WorkItemFilterBar.tsx` is split:
- The state / assignee / tracking filters move into a **popover** opened by the Filter `IconButton` in the items toolbar.
- The refresh + open-query-browser buttons move to other locations (refresh → main titlebar; query browser → rail bottom).
- `WorkItemFilterBar.tsx` itself is deleted; the popover content lives in `components/work-items/WorkItemFilterPopover.tsx` (new).

### Persistence

New state in `useUiStore`: `workItemsSelectedId: number | null`. Mirrors `selectedPrNumber` pattern — restored on tab switch + on app launch.

### Empty / not-configured states

| Condition | Surface |
|-----------|---------|
| ADO not configured (no org or no creds) | Existing "Configure Azure DevOps in Settings" `<Card>` spans **all three panes** (rendered above the grid). |
| Configured, no query selected | Rail has no `active` row; items column shows "Pick a query from the rail" empty state; detail pane shows nothing. |
| Query selected, 0 items | Items column shows "No items in *{queryName}*"; detail pane shows the empty state. |
| Items present, none selected | Detail pane shows "Select a work item" empty state. |

### Resizable panes

**Out of scope for v1.** Fixed widths (240 / 380 / 1fr). Drag-resize handles are a follow-up spec.

### Files touched

| File | Action |
|------|--------|
| `WorkItemsSection.tsx` | Rewritten as 3-pane shell. |
| `WorkItemList.tsx` | Rewritten to render compact rows (or replaced by `WorkItemRow.tsx` + a thin list wrapper). |
| `WorkItemCard.tsx` | Deleted (rows replace cards in this view). |
| `WorkItemFilterBar.tsx` | Deleted; logic split between popover (new) and main titlebar (refresh). |
| `WorkItemFilterPopover.tsx` | **New.** State / assignee / tracking filters. |
| `QueriesRail.tsx` | **New.** Left rail. |
| `QueryRow.tsx` | **New** (or inline in `QueriesRail.tsx`). |
| `QueryBrowser.tsx` | Stays; rendered as centered modal instead of full overlay. |
| `WorkItemDetailPanel.tsx` | **Untouched** (other branch). Embedded in detail pane. |

---

## 5. Focus tab + cross-cutting

### Focus tab

Structurally close to design — `FocusList` + `QuickReviewOverlay` exist. **Restyle, don't rebuild.**

```
<FocusTab>
  <FocusHero>                           // gradient bg per design
    <IconTile><ZapIcon size={18} /></IconTile>
    <div>
      <Title>{n} pull requests need your attention</Title>
      <Subtitle>Ranked by readiness, CI state, and review signals</Subtitle>
    </div>
    <Button variant="primary" size="lg" onClick={openQuickReview}>
      <EyeIcon /> Start Quick Review
    </Button>
  </FocusHero>

  <ScrollArea>
    {focusItems.map((item, i) => <FocusRow rank={i+1} item />)}
    <EverythingElseClearCard hiddenCount={n} />
  </ScrollArea>
</FocusTab>
```

`FocusRow` grid: `[rank pill 22px] [Ring score 38px] [reason Pill + title + meta column 1fr] [status label] [Open button]`. Reuses `Ring`, `Pill`, `Avatar`, `Button` primitives. `PriorityReasonLabel.tsx` reason→tone mapping survives, rendered inside the row.

`EverythingElseClearCard`: dashed border, "{n} PRs not listed — switch to PRs to see them all."

### StatusBar copy

Driven from a small `useStatusBar(activeSection)` hook returning `{left, right}` strings.

| Section | Left | Right |
|---------|------|-------|
| Focus | `focus computed just now · weights from settings` | `Press R for Quick Review` |
| PRs | `synced just now · rate {used}/{limit} · next poll in {Ns}` | `Ctrl+F7 worktrees · Ctrl+F8 files · Ctrl+F9 ADO` |
| Work Items | `ado: {org}/{project} · synced {ago}` | `Ctrl+F9 command palette` |

### Tokens

Audit `src/styles/index.css` against `borgdock/project/styles/tokens.css` from the design package. Add only missing CSS variables (status colors, accent variants, surface gradients, elevation shadows). **No bulk import** — diff and add.

### Primitive gaps to add

- `WindowControls` (3-button cluster, see §2).
- `EmptyState` primitive (reusable across tabs) — only if not already covered by `Card` + composition.
- Audit `Tabs` count badge — verify it matches the design's accent-subtle bubble; tweak if not.
- Audit `Chip` `tone` prop — verify coverage of `error / success / warning / neutral / ghost`; add missing tones.

### `MultiSignalIndicator`, `ReviewSlaIndicator`, `TeamReviewLoad`, etc.

These existing components are referenced by `PrCard`. Keep as-is; just verify they render correctly inside the restyled `PrCard`. Out-of-scope for visual rework here.

---

## 6. Files inventory

### Created

- `src/components/layout/MainWindow.tsx`
- `src/components/layout/WindowControls.tsx` *(or in `shared/primitives/`)*
- `src/components/pr/PrToolbar.tsx`
- `src/components/work-items/QueriesRail.tsx`
- `src/components/work-items/WorkItemRow.tsx`
- `src/components/work-items/WorkItemFilterPopover.tsx`
- `src/hooks/useStatusBar.ts`

### Modified

- `src/components/shared/primitives/Titlebar.tsx` — add a `middle` slot rendered between two growing spacers (see §2 TitleBar composition).
- `src/App.tsx` — replace `<Sidebar>` mount with `<MainWindow>`; drop `position_sidebar` + `hide_sidebar` effects; update `useEffect` cleanup.
- `src/components/layout/StatusBar.tsx` — restyle to `.bd-statusbar`, accept `left`/`right` props.
- `src/components/work-items/WorkItemsSection.tsx` — rewrite as 3-pane shell.
- `src/components/work-items/WorkItemList.tsx` — render compact rows.
- `src/components/work-items/QueryBrowser.tsx` — render as centered modal instead of full overlay.
- `src/components/pr/RepoGroup.tsx` — restyle header.
- `src/components/pr/PrCardView.tsx` / `PrCardContainer.tsx` — make whole card clickable → open pop-out; restyle per design.
- `src/components/focus/FocusList.tsx` — wrap in `<FocusTab>` with hero; restyle row to design's grid.
- `src/components/focus/FocusEmptyState.tsx` — restyle as dashed card.
- `src/components/settings/AppearanceSection.tsx` — delete "Sidebar" Card.
- `src/types/settings.ts` — drop `SidebarEdge`, `SidebarMode`, three `sidebar*` UI fields.
- `src/stores/ui-store.ts` — add `workItemsSelectedId`; persist `activeSection` to localStorage.
- `src/styles/index.css` — token additions (diff against design's `tokens.css`).
- `src-tauri/tauri.conf.json` — main window config rewrite (decorations/resizable/shadow/centered/sized); remove badge window if present.
- `src-tauri/Cargo.toml` — add `tauri-plugin-window-state`.
- `src-tauri/src/lib.rs` — register window-state plugin; rewrite `WindowEvent::CloseRequested` for `main`; rewrite global hotkey + tray handlers for show/focus/toggle.
- `src-tauri/src/platform/window.rs` — delete dock-position commands; add show/focus helper used by hotkey + tray.
- `src-tauri/src/settings/models.rs` — drop sidebar fields from `UiSettings` (Serde defaults handle stale files).
- `src-tauri/capabilities/main.json` — add `window-state:default`.

### Deleted

- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/FilterBar.tsx`
- `src/components/layout/SearchBar.tsx`
- `src/components/pr/PrCardExpanded.tsx`
- `src/components/work-items/WorkItemCard.tsx`
- `src/components/work-items/WorkItemFilterBar.tsx`
- `src/hooks/useBadgeSync.ts`
- Badge HTML shell + any `BadgeApp` component
- Badge entry in `tauri.conf.json` (if a separate window) + corresponding capabilities file

### Tests

- Update `src/__tests__/App.test.tsx` and any test that references `<Sidebar>` / `<Header>` / `Sidebar*` settings fields.
- Add tests for: window-controls behavior, section persistence, work-items 3-pane selection wiring, work-items filter popover state, PR-card click→pop-out invoke.
- Update `tests/e2e/window-rendering.spec.ts` for the new framing.
- Update `tests/e2e/helpers/test-utils.ts` for any `sidebar*` references.

---

## Open follow-ups (not blocking this spec)

- Drag-resize between Work Items panes.
- Visual port of Settings, Setup Wizard, Flyout, SQL, File Palette, Agent Overview, PR detail pop-out.
- Storybook coverage for new components (`MainWindow`, `WindowControls`, `QueriesRail`, `WorkItemRow`, `PrToolbar`, `FocusTab`).
- "Reset window position" button in settings (if window state ever gets stuck off-screen on monitor changes).
