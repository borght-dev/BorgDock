# UI overhaul: Workbench direction

> Target: `src/BorgDock.Tauri/`. Mockups: `design/mockups/borgdock-redesign-iteration-2.html` (Workbench, calmer) and `design/mockups/borgdock-redesign-variants.html` (Workbench v1, for the ⌘K palette and inspector motion).
> Decision (2026-09-24): overhaul the main window on the Workbench direction. PR detail opens full screen inside the main window with a Back button instead of a right-hand inspector or a pop-out. The Review action opens Quick Review. Every state change gets a deliberate transition.

## 1. What changes, in one screen

| Today | After |
|---|---|
| Title bar carries the Focus / PRs / Work Items tabs | Left rail with Focus, Pull requests, Work items, Worktrees, plus sync state and rate meter at the bottom. Title bar keeps logo, refresh, settings and window controls. |
| PR rows: avatar, bold title, chip row, meta row, number, merge-score ring, hover pill bar | One row: avatar, title, one meta line, check count with a proportional bar, one review chip, number. No ring, no pill bar, no per-check glyphs. |
| Clicking a PR opens a separate Tauri window (`open_pr_detail_window`) | Clicking a PR pushes a full-screen detail view in the same window. Back button and `Esc` pop it. The row's title travels into the detail header. The pop-out stays as an explicit "Open in window" action. |
| Review is one of five hover-bar buttons | Review is the primary action for PRs waiting on you and opens Quick Review for that PR. Merge, Rerun, Fix with Claude, Checkout live in the detail view's action bar and the row's context menu. |
| Plum background, violet accent, Segoe UI, monospace numerals | Graphite surfaces, indigo accent used only for selection and the primary button. Inter for the shell and lists, Instrument Sans for the detail and review views, JetBrains Mono only in code. Light theme keeps the same structure with the Porcelain values. |
| Worktrees live in a pop-out palette (Ctrl+F7) | Worktrees is a rail section in the main window. Ctrl+F7 keeps spawning the tool window with the worktrees tool preselected. |
| Focus is a list | Focus has a List / Board toggle. Board is four computed columns (Needs you, Waiting on others, Ready to merge, Stale) with a reason on every card and no drag. |
| Section switch is an instant swap | Section, detail, filter and list changes animate: sliding highlights, crossfade, FLIP reorders, push and pop. All collapse to instant under reduced motion. |

The tool windows (SQL, file palette, file viewer, settings, setup wizard, What's new, work item palette, worktree tool window, flyout) keep their layouts and get the new style and colourway in phase 6. The marketing site is overhauled in phase 8, after cutover, with new copy, screenshots and recordings made from mock data.

## 2. Principles the code must honour

1. **One window, a view stack.** The main window renders one of `list`, `pr-detail`, `work-item-detail`. Navigation is push and pop, never a second window, unless the user asks for a pop-out.
2. **The row grammar is shared.** Focus, Pull requests and the detail header all use the same `PrRowCore`. Work items get the same shape in a later phase.
3. **Motion answers the user.** Nothing animates on its own except running checks and the sync spinner. Every transition has a token from `motion.css` and a reduced-motion fallback.
4. **Status has three colours, the accent has one job.** `ok`, `fail`, `run` for checks; the accent marks selection and the single primary action.
5. **Tokens keep their names.** The Tailwind bridge in `src/styles/index.css` re-exports token names as utilities. Change values, not names, so every `bg-surface` and `text-primary` keeps working.

## 3. Navigation model

Add to `src/stores/ui-store.ts`:

```ts
export type MainView =
  | { kind: 'list' }
  | { kind: 'pr-detail'; owner: string; repo: string; number: number; initialTab?: PrDetailTab }
  | { kind: 'work-item-detail'; id: number };

interface UiState {
  // existing fields
  viewStack: MainView[];          // always starts with { kind: 'list' }
  pushView: (v: MainView) => void;
  popView: () => void;            // no-op at depth 1
  replaceView: (v: MainView) => void;
}
```

Rules:
- `activeSection` stays and only applies to the `list` view.
- Push and pop are the only way to change the top of the stack. The Back button, `Esc`, `Alt+Left` and the mouse back button call `popView`.
- The stack is not persisted. A restart opens on the list.
- Deep links that today open the pop-out (flyout list item, flyout toast, notification click, work item → PR link) call `pushView` when the main window is visible and fall back to `openPrDetail` when it is not. One helper: `src/services/navigation.ts` with `showPr({ owner, repo, number, tab })`.

Today the section switch is a conditional in `src/App.tsx` (lines 374 to 391), written twice for the splash and normal branches, and `MainWindow` only receives the result as `children`. That moves into one component:

```tsx
<MainWindow>
  <ViewStack>               // owns the push/pop transition
    {top.kind === 'list' && <SectionView section={activeSection} />}
    {top.kind === 'pr-detail' && <PrDetailView {...top} />}
    {top.kind === 'work-item-detail' && <WorkItemDetailView id={top.id} />}
  </ViewStack>
</MainWindow>
```

`MergeToast`, `QuickReviewOverlay` and `T3CheckoutDialog` keep mounting beside `MainWindow` in `App.tsx`; they overlay whichever view is on top.

## 4. Motion spec

New file `src/styles/motion.css`, imported from `index.css`. `index.css` already has `--duration-press`, `--duration-color`, `--duration-ui`, `--duration-tab` and `--duration-breath` (80, 120, 150, 200, 2600 ms) and no easing tokens; keep those, add the ones below, and migrate the 31 ad-hoc `transition:` declarations to them as files are touched.

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | hover, press, chip colour |
| `--motion-exit` | 110 ms | whatever leaves: gone before the newcomer settles |
| `--motion-base` | 200 ms | fades, section and layout swaps |
| `--motion-move` | 300 ms | sliding highlights, FLIP reorders |
| `--motion-push` | 260 ms | push and pop of a view |
| `--motion-expand` | 240 ms | grid-row expansion, inspector-like panels |
| `--ease-out` | `cubic-bezier(.22, 1, .36, 1)` | enter, expand, push, fade-outs |
| `--ease-std` | `cubic-bezier(.2, 0, 0, 1)` | reflow, progress fills |
| `--ease-spring` | `linear(...)` damped spring, <2% overshoot | highlights, underlines, FLIP slides |
| `--ease-in` | `cubic-bezier(.4, 0, 1, 1)` | things thrown off screen (Quick Review fling) |

No crossfade ever shows two full layers at once: the outgoing layer fades over `--motion-exit` and the incoming one starts halfway through it.

Reduced motion: `@media (prefers-reduced-motion: reduce)` and a `.reduce-motion` class on `<html>` (new setting under Appearance) set every `--motion-*` to `0.01ms`. The JS helper `motionOK()` in `src/utils/motion.ts` reads the same two signals and gates FLIP and View Transitions.

Transitions, one per interaction:

| Interaction | Transition |
|---|---|
| Rail item or filter click | The highlight slides to the new item (`--motion-move`, `--ease-std`). Content crossfades (`--motion-base`). |
| Section switch | Outgoing section fades out over `--motion-exit`; incoming fades and rises 6 px, starting halfway through. |
| Filter, sort or group change | Rows that survive FLIP to their new slot. Leaving rows fade in 140 ms first. New rows fade in. Only the Recently Closed list is virtualized today (above 50 items); that list gets a plain crossfade instead. |
| Row click → detail | View Transitions API, one horizontal axis: the detail slides in 32 px from the right while the list drifts 24 px left and fades out over `--motion-exit`. The title bar swaps without a crossfade. No shared-element morph (scaled text snapshots read as blur). Fallback: the detail slides in from the right over `--motion-push`. |
| Back | The reverse: the detail slides out to the right, the list slides back in from the left. The list keeps its scroll position and the row keeps its selection highlight. |
| Tab change in detail | Sliding underline plus content crossfade. |
| Suite expand in Checks | `<details>` with a grid-row transition; failing suites open by default. |
| Review click | Quick Review overlay scales from 0.96 and fades (existing `qr-overlay`, tuned to the tokens). Closing reverses. |
| Merge, Rerun, Fix | Button shows progress fill for the in-flight request, flips to the result label, then the row updates via FLIP. Failures show a toast. |
| Toast | Slides up 16 px and fades (flyout toasts: 24 px in from the right, no overshoot, no looping glow or shimmer). Undo where the action is reversible (snooze, mark seen). |
| Sync | The rail's rate meter width animates; the refresh icon spins only while a poll is running. |

## 5. Phases

Each phase is one pull request, shippable behind the `ui.layoutV3` setting until phase 7 removes the flag. Order matters: later phases build on the row grammar and the view stack.

### Phase 0: foundations (small)

**Create**
- `src/styles/motion.css`: tokens above and the reduced-motion rules.
- `src/utils/motion.ts`: `motionOK()`, `flip(container, mutate, selector)`, `withViewTransition(fn)` that calls `document.startViewTransition` when available and allowed, else runs `fn` directly.
- `src/components/shared/primitives/CheckBar.tsx`: count plus proportional bar. Props `{ ok, fail, run, total }`. Label rules: `N failing` (red), `k of N, running` (amber), `N passing`.
- `src/components/shared/primitives/SlidingHighlight.tsx`: measures the active child and positions an absolutely placed highlight; used by the rail, filter control and detail tabs.

**Modify**
- `src/styles/index.css`: swap palette values in `:root` and `.dark` to the graphite and porcelain sets (section 6). Keep names. `--font-ui` becomes Inter and a new `--font-reading` becomes Instrument Sans; both self-hosted under `public/fonts/` with JetBrains Mono (no network on first run). The shell, rails, lists and Board use `--font-ui` at 13 px; `PrDetailView`, `WorkItemDetailView` and Quick Review set `--font-reading` at 14 px on their root so everything inside inherits it. Remove the uppercase `letter-spacing` group-heading styles.
- `src/stores/settings-store.ts` and `src/types`: add `ui.reduceMotion: boolean` and `ui.layoutV3: boolean`.
- `src/components/settings/`: Appearance panel gets the two toggles.

**Tests**: `src/utils/__tests__/motion.test.ts` (reduced-motion gating, FLIP no-ops when nothing moved), `CheckBar` label rules, Storybook stories for `CheckBar` at 6, 12, 80 checks.

### Phase 1: shell with left rail (medium)

**Create**
- `src/components/layout/Rail.tsx`: workspace name, nav (Focus, Pull requests, Work items, Worktrees) with counts, sync line and rate meter. Uses `SlidingHighlight`.
- `src/components/layout/ViewStack.tsx`: renders the top view, owns push and pop transitions, handles `Esc`, `Alt+Left` and the mouse back button.
- `src/components/layout/SectionView.tsx`: crossfades between sections.

**Modify**
- `src/App.tsx`: replace both copies of the section conditional (lines 374 to 391) with `<ViewStack />`. The splash fade-out branch and the normal branch render the same tree.
- `src/components/layout/MainWindow.tsx`: grid `rail | main`. Title bar loses the tabs. Keep `TitleBar`, `WindowControls`, `WindowLauncher`, `StatusBar`.
- `src/components/layout/MainWindow.stories.tsx`: it copies App's section switch today; point it at `ViewStack` so Storybook and the app cannot drift.
- `src/stores/ui-store.ts`: view stack (section 3). `selectPr` stays for row highlight.
- `src/hooks/useStatusBar.ts`: the status bar shows the keys for the current view (`R` refresh, `/` search, `Esc` back).
- `ActiveSection` gains `'worktrees'`. Until phase 5 lands, the rail item renders a placeholder section with a button that opens the tool window, so the rail is complete from day one.

**Tests**: ui-store push/pop/replace; ViewStack keyboard; e2e `tests/e2e/shell-navigation.spec.ts` (rail switch persists section, `Esc` at depth 1 does nothing). Update `MainWindow.stories.tsx`.

### Phase 2: pull request list, Workbench rows (medium)

**Create**
- `src/components/pr/PrRowCore.tsx`: the shared row: avatar, title, meta line, `CheckBar`, review chip, number. Props are the card data from `pr-card-data.ts`. Adds `data-key` and the view-transition names.
- `src/components/pr/PrFilterControl.tsx`: segmented All / Needs you / Mine / Failing with counts and the sliding highlight. Replaces the seven-chip `PrToolbar` filter row. Group by and sort move into a single menu.

**Modify**
- `src/components/pr/PrRow.tsx`, `PrCardContainer.tsx`: comfortable and compact densities both render `PrRowCore`; compact drops the meta line. Remove `MergeScoreBadge` and `HoverActionPillBar` from the row. The merge score itself stays in `pr-card-data.ts` and `pr-store.sortBy` keeps its readiness sort; it is no longer drawn. Row click pushes `pr-detail` immediately (no double-click delay). Ctrl/Cmd+click, middle-click, Ctrl+Enter and the context menu open the pop-out. Selection is keyed by `owner/repo#number`, never by number alone.
- `src/components/pr/PrContextMenu.tsx`: keep every action; add "Open in window" for the pop-out.
- `src/components/pr/RepoGroup.tsx` and `PrList.tsx`: sentence-case group headings with a count and a hairline. "Needs you" group first when the filter is All. FLIP on filter and group changes below the virtualization threshold; crossfade above it.
- `src/components/pr/PrToolbar.tsx`: becomes the head row: title, `PrFilterControl`, search with `⌘K` hint.
- Delete `MultiSignalIndicator.tsx` and `HoverActionPillBar.tsx` once nothing imports them; keep `pr-action-resolver.ts` (the detail action bar and context menu still use `primaryFor`).

**Tests**: `PrRowCore` renders each review state and check state; filter control counts; FLIP skipped for the virtualized Recently Closed list; the 13 existing specs in `pr/__tests__` updated. Stories: there are none under `components/pr/` today; add `PrRowCore` matrix, `PrList` with 18 PRs across three repos, and an 80-check PR.

### Phase 3: full-screen PR detail with Back (large)

Starting point: `PRDetailPanel.tsx` already has a non-pop-out mode (without `popOutWindow`, its close button calls `ui-store.selectPr(null)`), so the panel itself needs little change. The work is in data and hosting.

**Create**
- `src/hooks/usePrDetailData.ts`: extracted from `PRDetailApp.tsx`. Takes `{ owner, repo, number }`, seeds from `usePrStore` when the PR is in the list (instant header, no spinner), fetches check runs with `getCheckRunsForRef`, and subscribes to the main window's poll results. Today each pop-out has its own zustand instance and only hears mutations made inside itself (`PR_REFRESHED_EVENT`); the in-window view fixes that for free because it shares the store. The pop-out keeps its own instance and uses the same hook.
- `src/components/pr-detail/PrDetailView.tsx`: full-screen host inside `ViewStack`. Header: Back button, repo and number, title (view-transition name), branch into base, readiness sentence, action bar. Body: the existing tabs (Overview, Checks, Files, Commits, Discussion) from `PRDetailPanel`. Right-hand "Open in window" icon calls `openPrDetail`.
- `src/components/pr-detail/ReadinessLine.tsx`: the sentence from the mockup ("Not ready: 2 checks failing", "Ready to merge: approved, all checks passed", "Waiting for review").
- `src/components/pr-detail/ChecksGrouped.tsx`: suites as `<details>`, failing first and open, passing collapsed; failed rows get "Fix with Claude". Duration on the right. Replaces the flat list in `ChecksTab.tsx` (the suite comes from the check run's `app`/workflow name; fall back to the name prefix before the first parenthesis).

**Modify**
- `src/components/pr-detail/PRDetailPanel.tsx`: accept an `embedded` prop that hides the pop-out chrome and drops the window-ready call.
- `src/components/pr-detail/PRDetailApp.tsx`: shrink to `usePrDetailData` plus `PRDetailPanel`.
- `src/components/pr-detail/ActionBar.tsx`: primary from `primaryFor`, then Checkout, Open in T3, Open in GitHub. Progress fill and result label per section 4.
- `src/components/pr-detail/OverviewTab.tsx`: description with a six-line clamp and "Show more" that scrolls inside a 320 px box; linked work item and agent strip (`LinkedWorkItemBadge`, `T3SessionStrip`) below it.
- `src/stores/pr-detail-jump-store.ts`: unchanged, it already assumes any host.
- `src/services/navigation.ts`: `showPr` decides push vs pop-out (section 3). Replace every `openPrDetail` caller with it: `PrCardContainer`, `PrContextMenu`, `FocusList`, `PRDetailPanel` (pop-out button keeps calling `openPrDetail` directly), `FlyoutApp`, `FlyoutGlance`, `FlyoutPrContextMenu`, and `useFlyoutSync` (the `open-pr-detail` event). The flyout paths must call `show_or_focus_main`, set the section to Pull requests and push the detail; that is the only way a tray click lands on the right screen.
- `src-tauri`: no Rust change. `open_pr_detail_window` stays for the explicit pop-out.

**Transition**: `withViewTransition(() => pushView(...))`. Names: `view-transition-name: pr-title-<n>` on the row title and the detail `h1`, `pr-avatar-<n>` on both avatars. The old view gets `::view-transition-old(root)` fade, the new one `::view-transition-new(root)` fade. On pop the same names run in reverse. The list is kept mounted but `inert` while detail is on top so scroll position survives.

**Tests**: `usePrDetailData` seeds from the store and refetches on refresh; `PrDetailView` Back pops; keyboard `Esc`; `ChecksGrouped` ordering (failing suites first, open by default); e2e `tests/e2e/pr-detail-inline.spec.ts` covering click → detail → Back keeps scroll and selection, and "Open in window" still invokes the command (mocked). Stories: `PrDetailView` for failing, ready, waiting.

### Phase 4: actions and Quick Review (medium)

**Modify**
- `src/hooks/usePrCardActions.ts` and `src/services/pr-actions.ts`: the `review` action opens the PR in the browser today. Change it to `useQuickReviewStore.startSinglePr(pr)`. `useKeyboardNav` already maps `R` to a single review and `Shift+R` to the whole needs-my-review queue; keep both.
- `src/components/pr/PrRowCore.tsx`: one trailing action slot shown on hover and focus, rendered only when `primaryFor` is `review` or `merge` (the two actions that make sense without opening). Review calls the action above; Merge runs the existing merge flow with the progress fill.
- `src/components/focus/QuickReviewOverlay.tsx` and `quick-review.css`: retint to the tokens; open and close transitions from section 4; the overlay reads `motionOK()`.
- `src/components/focus/QuickReviewSummary.tsx`: add the files-by-folder summary and the "N of M files to review" line from the iteration 2 mockup; Approve disabled until every non-generated file is marked, tooltip says how many are left. Generated files (`bun.lock`, `package-lock.json`, `*.generated.*`, `src/generated/**`, `*.snap`) can be skipped in one go.
- `src/components/pr-detail/ActionBar.tsx`: Review button opens Quick Review for this PR from the detail view too.
- Toasts: `src/components/focus/MergeToast.tsx` generalised to `src/components/shared/Toast.tsx` with an optional Undo.

**Tests**: row action slot appears only for review and merge shapes; Approve gating on reviewed files; skip-generated marks the right paths; existing quick review tests keep passing. Story: Quick Review with the 23-file fixture.

### Phase 5: Focus, Work items and Worktrees on the same grammar (large)

**Focus, list and board**
- `src/services/focus-bucket.ts`: pure classification of a PR into `you | wait | ready | stale` plus a `why(pr)` sentence, ported from the iteration 2 mockup. Stale is no update in 7 days (setting `ui.staleAfterDays`, default 7). Unit-tested against fixtures for every review and check state; this one function drives the count strip, the Board columns and the Timeline-style filters, so it must not be duplicated.
- `src/types/settings.ts`: `ui.focusLayout?: 'list' | 'board'` (default `list`).
- `src/components/focus/FocusList.tsx`: rows use `PrRowCore` plus a one-line reason from `why()`; a count strip at the top (Needs you, Waiting on others, Ready to merge, Stale) that filters; a List / Board segmented toggle on the right of the head row that writes `ui.focusLayout`.
- `src/components/focus/FocusBoard.tsx`: four columns from `focus-bucket`. Cards show repo and number, review chip, title, the reason line, author and `CheckBar`, then one action row: Review for reviews waiting on you (opens Quick Review), Fix with Claude and Rerun for your failing PRs, Open comments for changes and comments on your PRs, Merge and Open for ready ones. Stale is a narrow column of compact cards. No drag anywhere; placement is a fact, not an opinion. Columns scroll independently.
- Motion: switching layout crossfades the two; column counts bump on change; Merge fills, flips to Merged, the card fades and the "Merged today" tally bumps; Later snoozes a card into Waiting with a FLIP.
- Tests: `focus-bucket` matrix; `FocusBoard` places each fixture in the right column and the Review button calls `startSinglePr`; layout toggle persists. Stories: `FocusBoard` with the 18-PR fixture and an empty state.

**Work items**
- `src/components/work-items/WorkItemRow.tsx`: type pill, id, title, state line; same heights and hover as `PrRowCore`. Clicking pushes `work-item-detail`, hosting the existing detail panel the way phase 3 hosts the PR panel. Note the current wiring is broken: `windows.ts` exports `openWorkItemDetail`, which invokes a Rust command that does not exist, and nothing calls it while `workitem-detail.html` is still a Vite entry. The in-window view replaces that; drop the dead export and decide whether to keep the entry for a pop-out.
- `src/components/flyout/`: rows use `PrRowCore` compact; flyout list item click focuses the main window and calls `showPr`.

**Worktrees section**
- `src/components/worktree-palette/WorktreePaletteApp.tsx` (724 lines) mixes the worktree list, favourites, search and actions with tool-window chrome (`WindowTitleBar`, `LogicalSize`, `currentMonitor`, `getCurrentWindow`, `listen`). Split it: `src/components/worktree/WorktreeList.tsx` holds the list, favourites, search, prune and the open-in-terminal and open-in-T3 actions and takes an `onClose?` prop; `WorktreePaletteApp` becomes chrome around `WorktreeList`; the new `src/components/worktree/WorktreesSection.tsx` renders `WorktreeList` inside the main window with the section head row.
- The rail item switches `activeSection` to `worktrees`. Ctrl+F7 and `open_tool_window("worktrees")` in `src-tauri/src/platform/hotkey.rs` are unchanged and keep opening the tool window with the worktrees tool preselected. No Rust change.
- `WorktreeChangesPanel` and `WorktreeDiffOverlay` from `worktree-changes/` mount inside the section when a worktree is selected, replacing the separate overlay window flow for the in-window case.
- Tests: `WorktreeList` renders and acts identically under both hosts (shared test file, two render wrappers); existing `worktree-palette/__tests__` keep passing. Story: `WorktreesSection` with favourites and a dirty worktree.

### Phase 6: the tool windows match the new style (medium)

No layout work. Every window keeps its structure and picks up the graphite and porcelain tokens, the fonts, the motion tokens and reduced motion. The token swap in phase 0 does most of it because every entry imports `index.css`; this phase is the sweep that finds what the swap missed.

**Once, for all windows**
- `src/components/shared/WindowTitleBar.tsx` and `shared/chrome/WindowStatusBar`: restyle to the main window's title and status bars (same heights, hairlines, Inter 13 px, keyboard hints in the status bar). Every tool window inherits it.
- Window open: each tool window fades and scales in from 0.98 over `--motion-base` on first paint (they are built invisible and revealed by `window_ready`, so the animation runs on the reveal). Reduced motion skips it.
- Hard-coded colours: today eight component files carry hex values outside `index.css`: `sql/SqlEditor.tsx` (the CodeMirror theme), `flyout/FlyoutGlance.tsx`, `flyout/FlyoutToast.tsx`, `pr/TeamReviewLoad.tsx`, `shared/ConfirmDialog.tsx`, `whats-new/HeroBanner.tsx`, `work-items/shared/wi-visuals.tsx` and `pr/HoverActionPillBar.tsx` (deleted in phase 7). Replace each with tokens. The known families in `index.css` to retint are `.sql-*`, `.bd-fp-*` (file palette), `.bd-fv-*` (file viewer), `.bd-wt-*` (worktrees), `.bd-wp-*` (work item palette), `.bd-wi-*` (work items), `.bd-code-*`, `.markdown-body`, `.tactile-icon-btn`, plus `focus/quick-review.css`.
- Theme: only the main window uses `hooks/useTheme.ts`. Four windows carry their own copy of the dark-class toggle (`FlyoutApp.tsx:15`, `SqlApp.tsx:150`, `WorkItemDetailApp.tsx:291`, `hooks/useWorkItemPaletteSearch.ts:122`, plus `PRDetailApp.tsx:88`), the HTML entries for the file palette, file viewer, worktree and What's new read `localStorage['borgdock-theme']` in a pre-paint script, and `settings.html` and `SettingsApp.tsx` have no theme logic at all. Replace all of it with one `applyTheme(settings)` in `src/utils/theme.ts` that sets `.dark`, `.reduce-motion` and `color-scheme`, called from every entry and from the settings-changed event. Keep the pre-paint script, generated from the same helper, so no window flashes light.
- Chrome: What's new uses the `TitleBar` primitive instead of `WindowTitleBar` (comment at `WhatsNewApp.tsx:103`), and the file viewer and flyout have no title bar component. Standardise on `WindowTitleBar` where a window has a title bar; the flyout keeps its own frame.
- Storybook: the tool windows are well covered (22 to 43 stories each) but the primitives in `components/shared/primitives/` have none. Add a primitives story file so `CheckBar`, `SlidingHighlight`, buttons and chips can be checked in both themes without booting a window.

**Per window**
- **SQL** (`components/sql`, `sql-main.tsx`): the CodeMirror highlight style in `sql/SqlEditor.tsx` (line 82) already maps tags to `var(--color-syntax-*)`, and the small `EditorView.theme` at line 309 only sets font and caret colour. Nothing to rebuild; verify the syntax tokens after the phase 0 swap and move the editor's gutter and selection colours to tokens if any are still literal. Results grid rows to the list row heights and hairlines. Run and cancel buttons use `.btn` semantics (primary fill, progress while running).
- **File palette** (`bd-fp-*`) and **work item palette** (`bd-wp-*`): same list row grammar as the main window (hover wash, selection bar, tabular numerals), sliding highlight on the palette tabs, results FLIP on query change.
- **File viewer** (`bd-fv-*`): chrome in Inter, code in JetBrains Mono, unified and split toggles as a segmented control. Diff colours from the tokens.
- **Worktree tool window**: after the phase 5 split it is chrome around `WorktreeList`, so it inherits the section's styling.
- **Settings**: panels and inputs to the primitives; the Appearance panel hosts theme, reduce motion, Focus layout, density and the stale threshold. Toggles animate their knob over `--motion-fast`.
- **Setup wizard**: renders inside the main window (`App.tsx`, `?wizard=force`), not as its own window, and has no stories. Steps crossfade; the progress indicator slides. Copy pass in the same voice as the site (phase 8). Add stories for each step.
- **What's new**: reading view in Instrument Sans (`--font-reading`), hero images at 2× as today, section reveal on scroll only for the hero (one orchestrated moment).
- **Flyout**: rows are `PrRowCore` compact (phase 5); the `flyoutIn` keyframe moves to the motion tokens.

**Acceptance**
- One Storybook story per window in both themes, screenshotted by `scripts/screenshot-stories.mjs` into `docs/whats-new/<version>/tools-*.png` for the release and for the site.
- `@axe-core/playwright` contrast checks on the SQL grid, file palette rows and settings inputs in both themes.
- No `#hex` or `rgba(` left in `src/components/**` outside `index.css` and the CodeMirror theme file.
- Update `DESIGN-SYSTEM.md` and `BorgDock-Styling-Guide.md` with the new values, the fonts and the motion tokens.

### Phase 7: cutover and polish (small)

- Remove `ui.layoutV3`; delete the old `PrToolbar` filter row, `MergeScoreBadge` from rows, `HoverActionPillBar`, `MultiSignalIndicator`, and `src/components/review/` (`ClaudeReviewPanel`, `ReviewCommentCard`: exported, imported nowhere).
- Hero screenshots for the release via `design/whats-new/<version>.heroes.json` and `scripts/screenshot-stories.mjs`. Changelog entry in the Home Assistant voice. The 3.0.0 What's new uses Storybook stills only; the recordings come with the site launch (phase 8).
- Performance check (as asserted): with 200 open PRs, Recently closed stays virtualized and the open list skips FLIP above `FLIP_MAX_ROWS` (150) (`PrList.test.tsx`); `SlidingHighlight` reads no layout per frame or on a same-key re-render (`SlidingHighlight.test.tsx`); and `tests/e2e/perf.spec.ts` seeds 200 PRs, times a row click → `showPr` push → forced layout with `performance.mark/measure` under reduced motion, and asserts the median of three pushes (after one warm-up) stays under 100 ms of script and layout in CI conditions (dev build of React). Measured on 2026-09-25 over four runs: median 33 to 58 ms (single pushes 29 to 83 ms). The 16 ms figure was a laptop frame target, not what is asserted. `SectionView` is memoised so a push no longer re-renders the list under the detail view (it took the push from about 70 to 110 ms down to about 40 ms).
- Ship as **3.0.0**. The What's new post for it is the first one built from the phase 8 recordings.

### Phase 8: marketing site overhaul (large, after cutover)

The site is `site/` (Astro 5 with React islands, workspace member `borgdock-site`). It stays Astro; the work is content, visuals and the asset pipeline. Everything visual on the site comes from Storybook stories with mock data, never from a real account.

**Content**
- Today's hero reads "Less context switching. More shipping." over "A docked cockpit for your open work." That sells a mood. The new hero names the job.
- New positioning in one sentence, used as the hero: BorgDock is where your pull requests, their checks, your work items and the agents fixing them sit in one window on the side of your screen. Candidate headline: "Every pull request, one window." Subhead: "BorgDock watches your checks, tells you what needs you, hands failures to Claude, and lets you review and merge without opening a browser tab."
- Page structure: `index` (hero recording, three jobs as three short sections with a recording each, a quiet download block), `features` (one section per job: watch, decide, fix with an agent, review and merge, work items and worktrees; each with a screenshot or recording and three sentences), `gallery` (every screenshot and recording, both themes, filterable), `download` (platform detection, release notes link, checksum line), `changelog` (built from `/CHANGELOG.md` as today), `whats-new/<version>` (long-form posts as today).
- **Downloads are placeholders today.** Every button on `download.astro` is `href="#"` with fake `BorgDock-0.14.0.*` file names, and the brew, winget and `install.sh` commands do not exist. The site package, the download page and the hero badge all say 0.14 while the app is at 2.4.3. Phase 8 wires the download page to the GitHub release assets that `release-tauri.yml` publishes (fetched at build time from the releases API, with the version and checksums from the release), removes the install-command block unless those channels exist, and reads the version from the app's `package.json` so the site cannot drift again.
- The changelog page's hard-coded `FEATURED` map (release to what's new post) becomes a convention: a post exists at `whats-new/<version>` when `src/pages/whats-new/<version>.astro` exists.
- Voice: the Home Assistant release blog voice already used for the changelog. Benefit first, "you", plain verbs, no engineering prose. Every feature name on the site matches the label in the app.
- Rewrite `site/README.md` with the asset pipeline below.

**Visual**
- Same graphite and porcelain tokens as the app, Inter for the UI, Instrument Sans for long-form pages (what's new posts, features prose). Copy the token block from `index.css` into `site/src/styles/tokens.css` and keep the two in sync by a script check (`scripts/site-tokens-check.ts` diffs the two blocks and fails the site build on drift).
- The twelve hand-built React mocks under `site/src/components/screens` (`MainPRsWindow`, `PrDetail`, `FocusSidebar`, `SqlWindow`, `FilePalette`, `WorktreePalette`, `WorkItemsList`, `DiffViewer`, `CiLogPanel`, `BadgeSet`, `FloatingBadgeMock`, `WindowFrame`) and `ui/PrCard.tsx` are deleted and replaced by real captures. The fourteen feature sections under `components/sections` are rewritten around the five jobs; `WindowFrame` survives only as the frame around a capture. No hand-drawn UI on the site.
- Motion on the site follows the app's rules: the hero has one orchestrated reveal, recordings play on hover or when in view, everything else is still. Reduced motion shows posters instead of video.

**Asset pipeline**
- Screenshots: `scripts/screenshot-stories.mjs` as today, driven by `design/site/screens.json` (same fields as the heroes manifests: `slug`, `storyId`, `viewport`, `theme`, `delay`, `selector`), output to `site/public/screens/<slug>-<theme>@2x.png`. Both themes for every screen.
- Recordings: new `scripts/record-stories.mjs`. Playwright opens a Storybook story with `recordVideo`, runs a scripted step list from `design/site/recordings.json` (`hover`, `click`, `press`, `type`, `wait`, `scroll` with selectors or story-level `data-testid`s), and stops. The WebM is converted with the ffmpeg Playwright already ships (`%LOCALAPPDATA%\ms-playwright\ffmpeg-*`) into an H.264 MP4 and a poster PNG from the first frame, written to `site/public/recordings/<slug>-<theme>.mp4` and `.png`. Mock data comes from the story fixtures, so the same recording is reproducible on any machine.
- Recordings to make first: row to full-screen detail and back; filter change with the FLIP; Review opening Quick Review and marking two files; Fix with Claude on a failing check; Focus board merge with the tally bump; the flyout from the tray.
- Launch video (added 2026-09-24): a Remotion project at `site/video/` (workspace member `borgdock-video`) with one composition per format: `Launch` (1920×1080, 45 to 60 s) for the site hero and YouTube, `Short` (1080×1920, 20 s) for social. Scenes: a title card, then each of the six recordings above framed in the app window with animated captions in the site's voice, then the download card. It reads the MP4s and posters from `site/public/recordings/` through `staticFile`, so the video is regenerated from the same mock data as the site. Rendered with `bunx remotion render` into `site/public/video/launch.mp4` and a poster; the hero uses it with the same reduced-motion fallback as the recordings. Not part of CI; rendered locally per release.
- `site/src/components/ui/Recording.astro`: `<video autoplay muted loop playsinline preload="metadata">` with the poster, paused until in view, replaced by the poster under `prefers-reduced-motion`.
- Both scripts run against `storybook dev -p 6006`; a `bun run site:assets` root script boots Storybook, runs both, and shuts it down. Generated assets are committed (the site deploys from `master` to GitHub Pages through `.github/workflows/deploy-site.yml`, which only runs `bun run site:build`, so CI never needs Storybook or a browser).
- The ffmpeg binary Playwright installs (`ffmpeg-1011/ffmpeg-win64.exe` under `%LOCALAPPDATA%\ms-playwright`) is enough for the WebM to MP4 step; no new dependency. The `promo-video/` folder at the repo root is a gitignored leftover of a Remotion project removed in April 2026 (commit `26479df1`); only an empty `node_modules` remains locally and it can be deleted. Its scenes rendered from a mock sidebar under the old PRDock name, so nothing in it is reusable. If a launch video is wanted later, the Playwright recordings above are the source material.

**Acceptance**
- `astro check` and `astro build` pass; internal links checked in CI; Lighthouse performance and accessibility at 90 or above on `index` and `features` in both themes.
- Every screenshot and recording on the site has a manifest entry, so a release can regenerate all assets with one command.
- The 3.0.0 What's new post and the site launch land in the same week; the post reuses the site's recordings.

Size: L. Depends on phase 7. Can start its copy and page structure while phases 5 and 6 are in review.

## 6. Token values

Dark (Workbench graphite):

| Token | Value |
|---|---|
| `background` | `#151618` |
| `surface` | `#1b1c1f` |
| `surface-raised` | `#212226` |
| `surface-hover` | `rgba(255,255,255,.028)` |
| `subtle-border` | `rgba(255,255,255,.065)` |
| `strong-border` | `rgba(255,255,255,.12)` |
| `text-primary` / `secondary` / `tertiary` | `#ededef` / `#9c9da4` / `#82838a` |
| `accent` | `#7f7eff` |
| `status-green` / `red` / `yellow` / `blue` | `#5cc98f` / `#f0616d` / `#e5b454` / `#6fa8ff` |

Light (Porcelain):

| Token | Value |
|---|---|
| `background` | `#f5f5f7` |
| `surface` | `#ffffff` |
| `subtle-border` | `#e5e6ea` |
| `text-primary` / `secondary` / `tertiary` | `#17181c` / `#5d606a` / `#6d707a` |
| `accent` | `#4f46e5` |
| `status-green` / `red` / `yellow` / `blue` | `#1f9d6b` / `#d64560` / `#c98a12` / `#2d6be4` |

Badge, diff and syntax tokens are derived from these in `index.css` and need a pass in phase 6, not phase 0.

## 7. Keyboard model

| Key | List view | Detail view | Quick Review |
|---|---|---|---|
| `J` / `K`, `↓` / `↑` | move selection | next / previous tab | next / previous file |
| `Enter` | open detail | | mark reviewed and next |
| `Esc` | clear search or selection | back | close |
| `R` | refresh | rerun failed checks | |
| `/` | focus search | | |
| `⌘K` / `Ctrl K` | command palette (phase 2, reuse `work-item-palette` plumbing) | same | |
| `1` `2` `3` `4` | rail sections | | |
| `F` | | Fix with Claude | |
| `V` | | | mark file reviewed |

## 8. Risks and how to handle them

- **View Transitions API in WebView2.** `document.startViewTransition` needs Chromium 111+. WebView2 Evergreen is well past that, but `withViewTransition` must fall back to the slide-and-fade when the API is missing or `motionOK()` is false. Test both paths in Storybook with a stub.
- **FLIP and virtualization.** Only Recently Closed is virtualized (`@tanstack/react-virtual`, above 50 items) and it recycles rows, so FLIP there would animate garbage. Crossfade that list. If the open list ever gets virtualized, gate FLIP on the same threshold.
- **Tests that boot the pop-out.** `tests/e2e/pr-detail.spec.ts` and `pr-detail-review.spec.ts` open `pr-detail.html?owner=…`. They keep passing because the pop-out survives; the new `pr-detail-inline.spec.ts` covers the in-window path. Of the 239 vitest files, the 13 under `pr/__tests__` and the pr-detail ones are the ones to expect churn in.
- **The detail view needs data the list does not have.** Check runs, files, commits and discussion are fetched by the tabs today. `usePrDetailData` seeds the header from the store so the push feels instant; tabs keep their own loading states.
- **Five call sites open the pop-out.** All go through `showPr`. The flyout, notifications and work-item links must not lose deep links; e2e covers each.
- **React Compiler is inactive** (see CLAUDE.md), so `SlidingHighlight` and `flip` must not rely on referential identity; measure with `ResizeObserver` and on explicit change only.
- **Fresh worktree line endings.** Run `bunx biome check --write` on touched files before every commit (CLAUDE.md).
- **Fonts.** Self-host Inter and JetBrains Mono under `public/fonts/`; the CSP in `tauri.conf.json` already allows same-origin assets.

## 9. Order and size

| Phase | Size | Depends on |
|---|---|---|
| 0 Foundations | S | |
| 1 Shell and rail | M | 0 |
| 2 PR rows and filters | M | 0 |
| 3 Full-screen detail | L | 1, 2 |
| 4 Actions and Quick Review | M | 2, 3 |
| 5 Focus, Work items, Worktrees | L | 2, 3, 4 |
| 6 Tool windows match the style | M | 0, 5 |
| 7 Cutover and 3.0.0 | S | all |
| 8 Marketing site | L | 7 |

Phases 1 and 2 can run in parallel worktrees. Phase 3 is the one to review most carefully; it changes how every PR is opened. Phase 5 can be split into three pull requests (Focus board, Work items, Worktrees) that only share `focus-bucket.ts` and `PrRowCore`.

## 10. Facts the plan relies on (verified 2026-09-24)

- No router and no animation library in `package.json`; the only `@tanstack` package is `react-virtual`. The plan adds none: CSS tokens, the Web Animations API and the View Transitions API cover every transition in section 4.
- `index.css` is 4 789 lines with about 23 keyframes and no `prefers-reduced-motion` handling anywhere.
- `pr-store.ts` (601 lines) owns filter, search, sort and the derived selectors `groupedPrs`, `filteredPrs`, `counts`, `needsMyReview`, `focusPrs`. Group by lives in `ui-store.prGroupBy`. Density is `settings.ui.prDensity`.
- The pop-out creates one window per PR (`platform/window.rs:325`) and passes its parameters through an injected `window.__BORGDOCK_PR_DETAIL__` global.
- `quick-review-store.ts` exposes `startSession(prs)` and `startSinglePr(pr)`; both take `PullRequestWithChecks`, which the list already has.
- Storybook 10 with Tauri mocks under `.storybook/mocks/`; 32 stories, 10 of them for pr-detail, none for `components/pr/`.

## 11. Decisions taken (2026-09-24)

1. **Fonts:** Inter for the shell and lists, Instrument Sans for the PR detail, work item detail and Quick Review views. Both self-hosted.
2. **Merge score:** kept for sorting only. Not drawn in rows; the detail header shows the readiness sentence instead.
3. **Worktrees:** a real section behind the rail item. The Ctrl+F7 shortcut is unchanged and spawns the tool window with the worktrees tool preselected.
4. **Focus board:** yes, as a List / Board toggle persisted in `ui.focusLayout`. Board has no drag.

Nothing is open. The next step is phase 0.
