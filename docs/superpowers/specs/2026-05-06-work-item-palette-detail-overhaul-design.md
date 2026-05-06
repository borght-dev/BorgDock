# Work Item Palette + Detail Overhaul (v2)

**Status:** Approved (brainstorming complete)
**Source design:** `BorgDock - Work Item Palette v2.html` from the Claude Design handoff bundle (extracted to `.design-pkg/` under repo root).
**Direction:** Linear sidepanel ÷ Raycast palette ÷ high-density UI. Same visual vocabulary across palette → detail → activity log.

## Goals

Bring `WorkItemPaletteApp` and `WorkItemDetailApp` (plus the in-app side-panel detail in `WorkItemsSection`) up to the v2 design — pixel-faithful to the HTML mockups but adapted to live ADO data and our existing primitives. This is a "full behavioural overhaul": new layouts AND new interactions (chip-picker popovers, inline operator chips, auto-save, group-by, ↑↓ adjacent-item nav).

Non-goals: redesigning the palette's window framing (kept), changing the work-items section list view (kept), backend/API additions beyond what `WorkItem.relations` already exposes.

## Architecture

### Shared visual vocabulary

New module: `src/components/work-items/shared/wi-visuals.tsx` (single file, named exports).

Components:

- `TypeGlyph({ type, size? })` — colored geometric glyph for the work-item type. Map: `Bug ●` red, `User Story ▲` accent, `Task ■` yellow, `Product Backlog Item ◆` merged, `Epic ◇` accent. Unknown types fall back to neutral `▢`.
- `PrioBars({ prio })` — 4 bars, ascending heights `3/6/9/12px`, lit from left for `lit = 5 - prio` (P1=4 lit, P4=1 lit). Lit color from priority map; unlit = `--color-text-ghost`. Unknown priority → P3.
- `StatePill({ state, compact? })` — colored pill with leading dot. Tone derived from a state→tone map: `New/Closed → neutral`, `Active/Development In Progress → neutral` (dot accent), `Testing Failed → warning`, `Resolved/Done → success`. Unknown states → neutral. Built on top of the existing `Pill` primitive — adds the leading colored dot.
- `MiniAvatar({ initials, tone, size? })` — thin wrapper around the existing `Avatar` primitive with smaller defaults (16/18/20px).
- Helpers: `getInitials(displayName)` (first+last initial, falls back to first 2 chars), `avatarToneFor(initials)` (deterministic hash → tone bucket: `blue|rose|amber|violet|teal`).
- Maps: `WI_TYPES`, `WI_STATES`, `WI_PRIO` exported as `Record<string, ...>`.

Tested by snapshotting each glyph/pill/bar in `__tests__/wi-visuals.test.tsx`.

### Module layout after the change

```
src/components/work-items/
  shared/
    wi-visuals.tsx          (new)
    __tests__/
      wi-visuals.test.tsx   (new)
  WorkItemDetailApp.tsx     (modified — pop-out window shell)
  WorkItemDetailPanel.tsx   (rewritten — two-pane v2)
  WorkItemDetailPanel/      (split out, see below)
    TitleBlock.tsx          (new)
    ChipPicker.tsx          (new)
    RightRail.tsx           (new)
    DiscussionRail.tsx      (new)
    OverviewTab.tsx         (new — renders rich-text/standard/custom + attachments)
    ActivityTab.tsx         (new — placeholder for revisions)
    LinksTab.tsx            (new — parses relations)
    AttachmentsTab.tsx      (new)
    useAutoSave.ts          (new — blur-driven dispatch hook)
    useAdjacentNav.ts       (new — reads localStorage list, exposes prev/next)
    state-tones.ts          (existing pillTone helper, lifted from panel)
  WorkItemsSection.tsx      (modified — narrow-mode wrapper for the panel)

src/components/work-item-palette/
  WorkItemPaletteApp.tsx    (modified)
  WorkItemPaletteRow.tsx    (rewritten — dense grid row)
  ChipInput.tsx             (new — inline-operator search input)
  FilterChip.tsx            (new)
  GroupSeg.tsx               (new)
  useGroupedItems.ts        (new — group-by reducer)
  __tests__/                (new tests for ChipInput, useGroupedItems)
```

The `WorkItemDetailPanel` directory split is necessary: the existing single 535-line file already does too much, and the v2 layout adds five more concerns. CLAUDE.md emphasizes "smaller, well-bounded units" — this is the moment.

### Data flow

- Palette: `useWorkItemPaletteSearch` hook unchanged for ADO calls. New helpers (`parseOperators`, `applyOperators`, `useGroupedItems`) layer on top of its `searchResults` / `browseSections` outputs.
- Detail: `WorkItemDetailApp` keeps owning ADO state (work item, comments, states). The panel's `useAutoSave` hook receives the current edited values + the ADO patch dispatcher and debounces (500ms) blur events into a single `updateWorkItem` call per dirty field set.
- Adjacent nav: palette writes `borgdock-palette-navlist` to localStorage on `selectAndClose` — `{ ids: number[], origin: 'palette'|'section', savedAt: number }`. Detail reads it, finds current id's index. Buttons hidden when not present or stale (>1h).

### Window resizing

`selectAndClose` in `useWorkItemPaletteSearch.ts`: `width: 550 → 1180`, `height: 700 → 820`, set `shadow: true`. The capabilities file for `workitem-detail` already permits everything we use.

## Palette (`WorkItemPaletteApp`)

### Search input → `ChipInput`

Replaces the bare `<input>`. The text value is the source of truth; chips are a *visual rendering* of regex-matched operator tokens overlaid on the input. Two-line approach:

1. A `<div contenteditable="false">` styled to look like the design (icon + chips + transparent input)
2. The actual `<input>` keeps focus/cursor; chips render as decorative `<span>`s positioned via the parsed token spans.

The simpler approach we'll take: render chips before the `<input>` for operators that appear at the *start* of the query (before any whitespace), and let everything else flow through the input naturally. This matches the design's example queries (`state:active type:bug fix the toast`).

Operator regex: `/(\w+):(\S+)|@(\w+)/g`. Recognized keys: `state`, `type`, `assignee`/`@`, `iter`. Anything else still renders as a chip but doesn't filter (visual fidelity over correctness — they're hints).

### Filter chips + group-by

Below the search:

```
[All] [Open] [Mine] [● Testing Failed]      GROUP  [—] [State] [Owner] [Iter]
```

State stored as `stateFilter: 'all' | 'open' | 'mine' | 'failing'` and `groupBy: 'none' | 'state' | 'assignee' | 'iter'`. Persisted in localStorage as `borgdock-palette-prefs`.

`Mine` is `assignedTo === currentUser` — current user comes from settings (`adoSettings.userIdentifier` if present, otherwise the first KV-style match in recent items, otherwise hidden).

`Failing` is exact match `state === 'Testing Failed'` — if the team's process doesn't have that state, the chip still works but matches nothing. Acceptable.

### Row layout

12-column grid: `16px 14px 78px 1fr auto auto 18px` columns, `column-gap: 10px`, `padding: 7px 14px`. Selected row: `var(--color-selected-row-bg)` background + 2px accent left border (offset paddingLeft to 12 to keep alignment).

Cells: `[PrioBars] [TypeGlyph] [#ID mono] [title truncate] [💬N if any] [StatePill compact] [MiniAvatar 18px]`.

### Group-by behavior

- `none` — flat list. Browse mode falls back to existing sections when there's no search and no filter active.
- `state` — group by `item.state`, sticky header per group with name + count.
- `assignee` (Owner) — group by `assignedTo` display name; unassigned bucket last.
- `iter` — group by `iterationPath` last segment.

Within a group, items keep their original relevance order. Groups themselves are sorted by name (alphabetical) for `state`/`iter`; for `assignee`, "Mine" first, then alphabetical.

### Footer

Existing `WindowStatusBar` is kept but the right side updates to: `↑↓ nav · ↵ open · ⌘K actions · esc close`. Left side stays as result count + spinner.

## Detail (`WorkItemDetailApp` + `WorkItemDetailPanel`)

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ titlebar  [Work Items][←Back to palette esc]  [↑][↓] [↗][_][□][×] │
├──────────────────────────────────┬──────────────────────────┤
│ TITLE BLOCK                      │ Properties               │
│  ▲ Story · #54519 · copy ID  [↗] │  State, Priority, ...    │
│  H1 — clickable to edit          │ People                   │
│  STATE ▾  PRIORITY ▾  ASSIGNEE ▾ │ Planning                 │
│  ITERATION ▾    updated 2h ago   │ Tags                     │
├──────────────────────────────────│ Linked PRs               │
│ Tabs: Overview Activity Links … │  ──────────────          │
├──────────────────────────────────│ Discussion               │
│ BODY (overview/activity/...)     │  · comment               │
│  Repro / Observed / ...          │  · comment               │
│                                  │  [reply input  ⌘↵]       │
├──────────────────────────────────┤                          │
│ Auto-saves on blur  [Delete][↗] │                          │
└──────────────────────────────────┴──────────────────────────┘
```

`grid-template-columns: 1fr 320px`. Below 760px container width: right rail hides; a `[Details ▸]` button appears in the title row, opening it as an absolute overlay covering the right side.

### Title block (`TitleBlock.tsx`)

- Row 1 (meta): `<TypeGlyph size={13} />` · type name · ` · ` · `#${id}` mono · ` · ` · `[copy ID]` button · spacer · `[Open in ADO ↗]` icon button · `[⋯ more]` icon button.
- Row 2 (h1): `<h1>` 22px, weight 600, letter-spacing -0.015em. Click to swap into a `<TextInput>` for editing; commit on blur or Enter.
- Row 3 (chip pickers): four `<ChipPicker>` instances + `updated Xh ago` muted timestamp on the right.

### `ChipPicker.tsx`

Built on existing `HoverPopover`. Props: `label`, `value` (rendered preview), `options` (string[]), `onChange`, optional `renderOption`. Closed state: bordered button showing `LABEL` (uppercase 9.5px muted) + value preview + chevron. Opened: popover with a list of options; first letter focusable.

For `Assignee`: free-text input + recent suggestions (no live people-picker — defer). For `Iteration`: free-text input. For `State` and `Priority`: option list from `availableStates` / fixed `[1..4]`.

### Right rail (`RightRail.tsx`)

`RailGroup` components (the same compact `LABEL` heading + table of `RailRow`s seen in the mock). Skip rendering a row if its value is empty/null.

- **Properties**: State, Priority, Severity (`Microsoft.VSTS.Common.Severity` if set), Type
- **People**: Assignee, Reporter (`System.CreatedBy`), Watching (only if `relations` has any `subscribers` info — likely empty; hide otherwise)
- **Planning**: Iteration (`System.IterationPath` last segment), Area (`System.AreaPath` last segment), BacklogPriority (`Microsoft.VSTS.Common.BacklogPriority` if set), FoundIn (`Microsoft.VSTS.Build.FoundIn` if set)
- **Tags**: split `System.Tags` on `; ` → individual `Pill tone="neutral"` chips + a `+` icon button
- **Linked PRs**: parse `relations[]` for `rel === 'ArtifactLink'` and `url` matching `/Git\/PullRequestId\//`. Extract PR id from the trailing segment, render `[branch icon] #${prId} ${attributes.name || ''} [→]`. Status badge skipped this iteration (would require a reverse lookup; deferred follow-up).

### Discussion in rail (`DiscussionRail.tsx`)

Hairline separator + `MessageSquare` icon + `DISCUSSION` heading + count. Comments rendered via the existing `WorkItemComment` data, formatted to the design's tighter row (20px avatar + name+time row + body, `font-size: 11.5px`, `lineHeight: 1.55`). Reply input is a single-line styled box with `⌘↵` hint (also wired to plain Enter on Windows since `⌘` doesn't apply).

### Tabs

Built on existing `Tabs` primitive with counts.

- **Overview**: replaces the current "Details / Fields / Custom Fields / Attachments" stack with `BlockSection`s — bigger headers (`label: 'Repro Steps'`, etc), the current rich-text rendering machinery moves in unchanged.
- **Activity**: TODO panel — render placeholder ("Activity timeline coming soon") *unless* we can wire `getWorkItemRevisions` quickly. Worth attempting in this pass: ADO returns a `revisions` array; map state-change diffs to the design's `ActivityItem` rows. If it slips, the placeholder is fine.
- **Links**: relations table — work-item-to-work-item (Parent/Child/Related) and the same Linked-PRs the rail shows but with extra detail.
- **Attachments**: bigger file rows (the `FilesBody` in the mock).

### Footer & auto-save

Footer text: `Auto-saves on blur · last saved Nm ago` (relative; `5s ago` → `Nm ago` → `Nh ago`). On the right: `[Delete]` (small destructive) + `[Open in ADO ↗]`. No `Save` button.

`useAutoSave({ initial, current, onPatch, debounceMs: 500 })`:
- Compares `current` to last-known-saved values per field (title, state, assignedTo, priority, tags).
- On any field's blur (caller wires `onBlur` per input), schedules a debounced patch dispatch.
- Tracks `lastSavedAt: number | null` and `isSaving: boolean`. Returns `{ isSaving, lastSavedAt, savedAgoLabel }`.
- Failures: footer text becomes `Save failed — retry?` with a retry button. Last-known stays at the previous successful save.

The Discussion reply input also auto-commits on `Enter` (or `⌘↵`/`Ctrl+↵`), via the same blur path → `addWorkItemComment`.

### Adjacent nav (↑↓)

`useAdjacentNav(currentId)` hook:
- Reads `borgdock-palette-navlist` from localStorage.
- If list contains `currentId` and `savedAt > now - 60min`, exposes `{ prevId, nextId, total, index }`.
- Buttons in the titlebar disabled when prev/next missing.
- Click → updates the current window's URL via `history.replaceState({}, '', '?id=' + nextId)` and re-runs the load effect (effect already keyed off `workItemId`).

Palette writes the navlist on `selectAndClose`. WorkItemsSection writes it whenever it sets `selectedWorkItemId` (so adjacent nav also works from the in-app section).

## Side-panel narrow-mode (`WorkItemsSection`)

The detail overlay is `absolute inset-0 z-50` over the sidebar (~800px wide). In the new layout, that's exactly enough for `1fr 320px` — no special handling needed at the default width. The narrow-mode (collapse rail to drawer) only kicks in if the user has shrunk the sidebar below 760px. Implemented via a `ResizeObserver` on the panel root; `<html data-rail-collapsed="true">` toggles a CSS class on the panel that stacks rail behind a drawer.

## Testing

- **Visuals**: snapshot `wi-visuals.tsx` components for each tone/state/type.
- **Palette behaviour**: unit tests for `parseOperators`, `applyOperators`, `useGroupedItems`. Integration test of `WorkItemPaletteApp` covering: type-to-search, filter chip click, group-by toggle, keyboard nav.
- **Detail behaviour**: unit tests for `useAutoSave` (blur → patch dispatched), `useAdjacentNav` (localStorage shape, staleness). Integration test of the panel covering: edit title → blur → patch fired with right path, comment add → optimistic insert.
- **Storybook**: a new `WorkItemPaletteApp.stories.tsx` covering 4 variants (browse / search / filter+group / empty), and an updated `WorkItemDetailApp.stories.tsx` covering 6 variants (overview / activity / links / attachments / sparse-with-empty-rail / narrow-mode-rail-collapsed). The existing storybook roadmap entry `phase6-workitem-detail` is already complete; this updates those stories rather than adding a new phase.

## Migration / breaking changes

- **No users yet** (per memory) → no migration plan needed for the data shape changes. localStorage keys are new (`borgdock-palette-prefs`, `borgdock-palette-navlist`).
- The pop-out window default size changes (550×700 → 1180×820). Existing positions cached in localStorage stay valid — only the size is overridden.
- `WorkItemDetailPanel`'s public props gain `onArrowNav?: (dir: 'prev'|'next') => void` and `adjacentInfo?: { prev: number|null, next: number|null }`. Existing call sites (pop-out, side-panel) wire both.

## Risk register

- **Auto-save regressions** — losing changes on a failed save is the main risk. Mitigation: footer error state + retry button + console.error trail. Don't clear `current` on failure.
- **Inline operator chips fragile** — overlaying chips on a real `<input>` is fiddly. Fallback: render chips *before* the input only (start-of-string operators). Fall back further to plain text input + filter rows if chips break in WebView2.
- **Narrow-mode in side-panel** — at 800px we're at the boundary; ResizeObserver + CSS class avoids React re-renders.
- **Adjacent nav stale list** — `>1h` stale → buttons hidden. The list also doesn't follow the user's filter changes after they leave the palette; that's acceptable (snapshot at navigate-time).

## Out of scope (follow-ups)

- Linked-PR status badges (requires reverse lookup or background fetch of PR state).
- Severity/Watching/Reporter live editing — read-only this pass.
- Activity tab full timeline — placeholder if `getWorkItemRevisions` wiring slips.
- Live people-picker for Assignee chip — free-text only this pass.
- Iteration picker tree — free-text + recent suggestions.

## Implementation team

Two parallel agents after I extract the shared visuals first:

1. **Shared step (me, sequential)**: create `wi-visuals.tsx` + tests. Update the detail-window size in `useWorkItemPaletteSearch.selectAndClose`.
2. **Agent A — Palette**: rewrites `WorkItemPaletteApp.tsx`, `WorkItemPaletteRow.tsx`, adds `ChipInput`/`FilterChip`/`GroupSeg`/`useGroupedItems` + tests + storybook.
3. **Agent B — Detail**: rewrites `WorkItemDetailPanel.tsx` into the new directory split, adds `useAutoSave`/`useAdjacentNav`, updates `WorkItemDetailApp.tsx` props, updates `WorkItemsSection.tsx` to wire adjacent nav, updates storybook.

Both agents land in the working tree (no worktrees — same repo, different files). I review/integrate after both report done.
