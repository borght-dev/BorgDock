# BorgDock — Streamlined Shared Components

**Date:** 2026-04-24
**Status:** Approved for planning. Implementation not yet started.
**Source design bundle:** `borgdock/` export from Claude Design (handoff chat dated 2026-04-23).

---

## 1. Purpose

BorgDock today has no shared primitive layer. Buttons, pills, tabs, cards, titlebars, and input controls are re-rolled per feature. Styling is split between Tailwind utilities (no `@theme` block), per-feature CSS files (`file-palette.css`, `worktree-palette.css`, `file-viewer.css`, inline class bundles in `index.css`), and ad-hoc `style={{}}` overrides. The result is a codebase that works but looks and feels like several apps glued together.

This spec lands a single primitive library, promotes every token to a Tailwind theme variable, and migrates every user-facing surface to consume those primitives and match the Claude Design mockups pixel-for-pixel.

## 2. Goals

1. A reusable `components/shared/primitives/` library covering Button, IconButton, Pill, Chip, Dot, Avatar, Ring, LinearProgress, Tabs, Kbd, Input, Card, Titlebar.
2. Tailwind `@theme` integration exposing every existing semantic token as a utility.
3. Pixel-match every surface in the Claude Design `BorgDock - Streamlined.html` mockups, across light/dark themes and compact/comfortable densities.
4. One new feature — the Worktree Changes panel (diff-vs-HEAD + diff-vs-base-branch) — because the design introduces it.
5. A full regression safety net built first: behavioral e2e coverage, design-sourced visual baselines, accessibility, performance, motion, cross-OS.
6. Stacked, reviewable PRs. The app remains fully usable after every PR.

## 3. Non-goals

- Replacing the existing diff viewer logic or syntax highlighter.
- Rewriting IPC commands or data models.
- Redesigning features beyond what the mockups in `BorgDock - Streamlined.html` specify.

Nothing else is deferred. Accessibility, performance, cross-OS, and animation tests are all part of this work.

## 4. Token & styling strategy

### 4.1 Promote the 327 semantic tokens into a `@theme` block

`src/BorgDock.Tauri/src/styles/index.css` gets a `@theme` directive that:

- Zeroes out Tailwind's default palette (`--color-*: initial`).
- Re-exports every existing `--color-*` token as a Tailwind theme variable so utilities like `bg-surface`, `text-primary`, `bg-accent-subtle`, `border-subtle-border`, `bg-success-badge-bg`, `text-review-approved`, `bg-diff-added-bg` all generate.
- Promotes spacing to `--spacing-1..12` theme variables (backed by new `--space-*` custom properties: `2/4/6/8/10/12/16/20/24px`).
- Promotes radii to `--radius-sm/md/lg/xl/pill` theme variables.
- Promotes type scale to `--text-micro/small/body/base/title` theme variables (`10/11/12/13/18px`).
- Promotes motion durations to `--duration-press/color/ui/tab/breath`.
- Registers `--font-sans` and `--font-mono` theme variables pointing at the existing `--font-ui` / `--font-code` values.

Dark-mode continues to work via the existing `.dark` class on `<html>`. `@theme` reads variables at runtime, so overriding `--color-accent` under `.dark` still propagates through Tailwind utilities. Accent tweaks (`accent-teal`, `accent-amber`) continue to work the same way.

### 4.2 Delete per-feature CSS files

These files go away as their consuming surfaces migrate:

- `src/styles/file-palette.css` — deleted in PR #5.
- `src/styles/worktree-palette.css` — deleted in PR #5.
- `src/styles/file-viewer.css` — deleted in PR #5.

Anything in those files that can't be a utility moves into an `@layer components` section of `index.css` with a minimal, surface-prefixed class (e.g. `.bd-code-gutter`). `@layer components` is preferred over re-emitting per-feature CSS files.

### 4.3 Delete inline overrides

Grep for `style={{` across `src/` at the end of PR #6; every remaining usage must be justified in a comment. The expected residue is dynamic positioning (e.g. floating badge anchor coords) and `--ring-size` style custom properties — nothing chromatic.

## 5. Primitive catalog

All primitives live in `src/BorgDock.Tauri/src/components/shared/primitives/` with a barrel `index.ts`. Each primitive is its own file. All props are named, typed, and documented via TSDoc. No default exports.

| Primitive | Signature | Replaces |
|---|---|---|
| `Button` | `{ variant: "primary" \| "secondary" \| "ghost" \| "danger"; size: "sm" \| "md" \| "lg"; leading?; trailing?; loading?; ...HTMLButtonProps }` | Every ad-hoc `<button>` except icon buttons. Sizes: sm=24h/11px, md=28h/12px, lg=32h/13px. |
| `IconButton` | `{ icon: ReactNode; active?: boolean; tooltip?: string; size?: 22\|26\|30; ...HTMLButtonProps }` | `.tactile-icon-btn`, `.bd-icon-btn`, one-off icon buttons. |
| `Pill` | `{ tone: "success" \| "warning" \| "error" \| "neutral" \| "draft" \| "ghost"; icon?; children }` | Status chips, review state pills, branch labels, draft indicators, PR number badges. |
| `Chip` | `{ active?: boolean; count?: number; tone?: "neutral" \| "error"; onClick; children }` | Filter-bar chips across PR list, Work Items filter, detail tab filters. |
| `Dot` | `{ tone: "green" \| "red" \| "yellow" \| "gray" \| "merged"; pulse?: boolean; size?: number }` | Status dots, tray dots, floating badge indicators. |
| `Avatar` | `{ initials: string; tone?: "own" \| "them" \| "blue" \| "rose"; size?: "sm" \| "md" \| "lg" }` | Gradient avatar patterns scattered across PR/Focus/Reviews/WorkItems. |
| `Ring` | `{ value: number; size?: number; stroke?: number; label?: boolean }` | Readiness scores. Thresholds: ≥80 green, ≥50 yellow, else red. |
| `LinearProgress` | `{ value: number; tone?: "accent" \| "success" \| "warning" \| "error" }` | 4px linear bars (rate-limit meter, readiness bar). |
| `Tabs` | `{ value: string; onChange: (id) => void; tabs: { id; label; count? }[]; dense?: boolean }` | Section tabs, PR detail tabs, review tabs, settings tabs, focus sub-tabs. |
| `Kbd` | `{ children }` | Keyboard key pills in tooltips, palette, onboarding. |
| `Input` | `{ leading?: ReactNode; trailing?: ReactNode; ...HTMLInputProps }` | Raw `<input>` usages across search bars, SQL connection, settings forms. |
| `Card` | `{ variant?: "default" \| "own"; padding?: "sm" \| "md" \| "lg"; interactive?: boolean; children }` | Every card background across PR list, Work Items, Settings panels, Notifications. |
| `Titlebar` | `{ title: ReactNode; count?: number; left?; right?; meta? }` | Used by every window; composed with `WindowControls` in `right`. |

**Kept shared components, not newly primitivized:**

- `shared/ConfirmDialog.tsx`, `shared/ErrorBoundary.tsx` — already shared; no changes.
- `shared/WindowTitleBar.tsx` — rewritten on top of `Titlebar` + `WindowControls` primitives, kept at same path to preserve imports.
- `shared/chrome/StatusBar.tsx`, `shared/chrome/SectionTabs.tsx` — new composed chrome; live alongside the primitives under `shared/chrome/`.

**Not primitivized, stays feature-local:**

- `PRCard` / `PRRow` under `components/pr/` — domain-specific, but built on primitives. Takes a `density: "compact" | "normal"` prop so flyout row and main card are the same component.
- Toasts, wizard steppers, flyout shell, palette shells — composed at feature level on top of primitives.

## 6. New feature: Worktree Changes panel

The design adds this surface. It's a live view of uncommitted edits vs HEAD and commits ahead of the base branch for a worktree, with "vs HEAD" and "vs base" diff actions.

### 6.1 Rust backend (src-tauri)

Three new `#[tauri::command]` functions on the worktree service:

- `list_worktree_changes(worktree_path: String) -> Result<WorktreeChangeSet, String>` — returns `{ vs_head: [FileChange], vs_base: [FileChange], base_branch: String }`. Uses `git2::Repository::statuses` for uncommitted, `diff_tree_to_tree` for vs-base.
- `diff_worktree_vs_head(worktree_path: String, file_path: String) -> Result<UnifiedDiff, String>` — git2 diff with `DiffOptions` (rename detection on, 3 context lines), returns hunks.
- `diff_worktree_vs_base(worktree_path: String, base_branch: String, file_path: String) -> Result<UnifiedDiff, String>` — merge-base against `base_branch`, then `diff_tree_to_tree`.

**Base-branch resolution order:** origin's HEAD symbolic ref → repo config `init.defaultBranch` → `main` → `master`. Whichever resolves first wins; the resolved value is surfaced in the UI.

**Edge cases to handle:** detached HEAD, shallow clone missing the merge-base, binary files (return `BinaryMarker` variant), untracked files (listed as new with size; content diff opt-in), ignored files (excluded by default; togglable), submodules (listed as "submodule change" without content diff).

### 6.2 React surface

- New `components/worktree-changes/WorktreeChangesPanel.tsx`.
- Integrated as a tab inside the existing worktree palette.
- Two sections: "Uncommitted" (vs HEAD) and "Ahead of `<base>`" (vs base). Each section is a list of `FileChange` rows with +/− stats.
- Click a file → opens the existing diff viewer under `pr-detail/diff/` (refactored slightly to accept a generic diff source, not just PR diffs), with a toggle Pill at the top: "vs HEAD" / "vs base".
- Empty states: "No changes in this worktree" / "No commits ahead of base".
- Error states: "Couldn't determine base branch — click to pick one" with a dropdown of refs.

### 6.3 Tests

- Rust unit tests for base-branch resolution (each fallback case).
- Rust integration tests against a fixture repo (`tests/fixtures/worktree-changes/`) covering: clean tree, modified file, added file, deleted file, renamed file, binary file, untracked file, submodule.
- React component tests for `WorktreeChangesPanel` against fixture data.
- E2E spec `tests/e2e/worktree-changes.spec.ts` covering the full flow: open panel → see files → click → diff opens → toggle HEAD/base.

## 7. Regression safety net

Built first, before any UI code is touched.

### 7.1 Behavioral e2e coverage

Existing specs cover: pr-list, pr-detail, pr-context-menu, settings, wizard, theme, keyboard-nav, notifications, work-items, window-rendering, tray-first.

New specs added in PR #0:

- `flyout.spec.ts`
- `focus.spec.ts` (including QuickReview flow)
- `file-palette.spec.ts`
- `file-viewer.spec.ts`
- `command-palette.spec.ts`
- `sql.spec.ts`
- `worktree-palette.spec.ts`
- `diff-viewer.spec.ts`
- `whats-new.spec.ts`

Each asserts the user-facing contract: what renders, what's clickable, what keyboard shortcuts work.

### 7.2 Design-sourced visual baselines

Baselines come from the design bundle, not the current app. This flips "regression" into "verify migration lands on target."

- The design bundle is copied into the repo at `tests/e2e/design-bundle/` in PR #0 — specifically `BorgDock - Streamlined.html` plus any referenced assets. This gives the capture script a stable, version-controlled source instead of depending on an external path.
- `tests/e2e/scripts/capture-design-baselines.ts` — one-off Playwright script that opens `tests/e2e/design-bundle/BorgDock - Streamlined.html`, iterates every artboard (targeted by the design-canvas's `DCSection` wrappers), screenshots each at its native pixel dimensions, and writes per-surface PNGs into `tests/e2e/__screenshots__/design/{mac,win}/`.
- Runner: `npm run test:e2e:capture-design`. Baselines committed once; regenerated only when the design bundle is updated (bundle re-import is itself a small dedicated commit with visible PNG churn for review).
- `tests/e2e/visual.spec.ts` — per surface × theme × density, seeds design fixtures, navigates, calls `toHaveScreenshot('design/<surface>-<theme>.png', { maxDiffPixelRatio: 0.04 })`. The 4% tolerance absorbs sub-pixel anti-aliasing differences between the prototype HTML's Chromium and the app's WebView2/Chromium.
- `tests/e2e/visual-tolerances.ts` — per-surface tolerance overrides, each requiring a code-comment justification. Default 0.04.

### 7.3 Design-sourced test fixtures

Ported from the design's `data.jsx` into `tests/e2e/fixtures/design-fixtures.ts`. Seeded through a test-only `window.__borgdock_test_seed` hook (available only under `import.meta.env.DEV`), consumed by both the live-app visual tests and the behavioral specs where deterministic data matters.

### 7.4 Accessibility (axe-playwright)

Every surface spec — behavioral and visual — runs `axe.analyze()` with the WCAG 2.1 AA rule set. Violations fail the test. Common findings to pre-verify: color-contrast on text-tertiary/text-muted against `surface-hover` and `accent-subtle` backgrounds (the DESIGN-SYSTEM.md §12 flags this as unverified).

### 7.5 Performance

`tests/e2e/performance.spec.ts` budgets (enforced in CI):

| Metric | Budget |
|---|---|
| Initial main-window paint | < 800ms |
| PR card click → detail render | < 150ms |
| Command palette open (Cmd+K) | < 50ms |
| File palette search keystroke → first result | < 80ms |
| Tab switch in PR detail | < 100ms |

Budgets live in `tests/e2e/perf-budgets.ts` so they're adjustable without editing test code. The table is keyed by project (`webview-mac` / `webview-win`) since CI runners have different baseline speeds — initial values are calibrated on PR #0 using three warmup runs per project; subsequent PRs must stay within ±10% of the calibrated baseline or explain the regression.

### 7.6 Motion

`tests/e2e/motion.spec.ts` uses Playwright's CDP to sample computed styles across keyframes:

- Button press: `transform: scale(...)` hits 0.97 within 80ms of `mousedown`.
- Tab underline: `left` / `width` of the active underline animates to target across 200ms when `value` changes.
- Toast slide-in: `translateX` ends at 0 with a brief overshoot.
- Badge pulse: opacity oscillates over the `--duration-breath` window.

Tests run with `prefers-reduced-motion: no-preference` forced.

### 7.7 Cross-OS

Two Playwright projects: `webview-mac` and `webview-win`. Baselines captured on both. Two sets of PNGs in `__screenshots__/design/mac/` and `__screenshots__/design/win/`. Every PR in the stack passes on both before merge.

### 7.8 CI

New `.github/workflows/test.yml` triggered on push and pull_request. Two jobs: `test-mac` (`macos-latest`) and `test-win` (`windows-latest`). Each job runs: `npm ci` → `npm run test` (Vitest) → `npm run test:e2e` (all Playwright specs: behavioral + visual + a11y + perf + motion). Artifacts on failure: Playwright trace + diff PNGs.

The existing `release-tauri.yml` workflow is unchanged.

## 8. Stacked PR sequence

Seven PRs, plus a foundation PR #0. Each stacks on the previous. Worktree directory: `~/projects/borgdock-streamline` (created fresh via `git worktree add`). Base branch: `master`.

### PR #0 — Regression baseline
**Branch:** `feat/streamline-00-regression-baseline`

- Missing behavioral e2e specs (§7.1).
- `capture-design-baselines.ts` + `visual.spec.ts` + `__screenshots__/design/{mac,win}/` (§7.2).
- `design-fixtures.ts` + `window.__borgdock_test_seed` hook (§7.3).
- `axe-playwright` integration (§7.4).
- `performance.spec.ts` + `perf-budgets.ts` (§7.5).
- `motion.spec.ts` (§7.6).
- Two Playwright projects for mac + win (§7.7).
- New `.github/workflows/test.yml` (§7.8).

**Initial state:** all visual specs fail (current app ≠ design). Intentional — that's the work list.

### PR #1 — Foundation: tokens + primitives
**Branch:** `feat/streamline-01-foundation`
**Stacks on:** #0.

- `@theme` block + promoted spacing/radius/type/motion custom properties (§4.1).
- `components/shared/primitives/` with all 13 primitives + barrel (§5).
- Unit tests (Vitest + Testing Library) for each primitive.
- No consumer changes; primitives unused until PR #2.

### PR #2 — Chrome: titlebar, status bar, tabs vocabulary
**Branch:** `feat/streamline-02-chrome`
**Stacks on:** #1.

- Rewrite `shared/WindowTitleBar.tsx` on top of `Titlebar` + `WindowControls`.
- New `shared/chrome/StatusBar.tsx`; migrate every window showing rate-limit/sync state.
- Every tab bar swaps to `Tabs` primitive (pr-detail, section switcher, review tabs, settings, focus sub-tabs).
- Delete `.tab-underline*`, `.window-ctrl-btn*`, `.status-bar*` classes.

### PR #3 — PR surfaces: main window + flyout + Focus
**Branch:** `feat/streamline-03-pr-surfaces`
**Stacks on:** #2.

- New unified `PRCard` with `density` prop; `PRRow` becomes a thin wrapper.
- Migrate `components/pr/*`, `components/flyout/*`, `components/focus/*`, `components/work-items/*` to primitives.
- QuickReview* rebuilt on primitives.
- Delete `.pr-card*`, `.filter-chip*`, `.pr-row*` classes.

### PR #4 — PR detail surfaces
**Branch:** `feat/streamline-04-pr-detail`
**Stacks on:** #3.

- Migrate `components/pr-detail/**` (Overview + Checks + Files + Reviews + Commits + Comments) to primitives.
- `components/review/**` swap.
- `pr-detail/diff/*` chrome (toolbar, file header, line gutter) adopts primitives; diff-line rendering unchanged.
- Delete per-surface CSS in `pr-detail/`.

### PR #5 — Palettes + viewers
**Branch:** `feat/streamline-05-palettes`
**Stacks on:** #4.

- Migrate `components/file-palette/*`, `components/file-viewer/*`, `components/command-palette/*`, `components/worktree-palette/*`, `components/worktree/*`, `components/sql/*` to primitives.
- Delete `styles/file-palette.css`, `styles/worktree-palette.css`, `styles/file-viewer.css` — residual layout into `@layer components` in `index.css`. These are the only per-feature CSS files in the repo; after this PR, all feature styling is either Tailwind utilities or `@layer components`.
- `CodeView` keeps syntax highlighting; only frame adopts primitives.

### PR #6 — Ancillary: settings, wizard, notifications, badge, what's new
**Branch:** `feat/streamline-06-ancillary`
**Stacks on:** #5.

- Migrate `components/settings/*`, `components/wizard/*`, `components/onboarding/*`, `components/notifications/*`, `components/whats-new/*`.
- Floating Badge (5 variants) uses `elevation-2` + status-glow tokens via utilities.
- Final sweep: every remaining `style={{}}` fixed or justified with a single-line comment.

### PR #7 — Worktree Changes feature
**Branch:** `feat/streamline-07-worktree-changes`
**Stacks on:** #6.

- Rust commands (§6.1).
- React panel (§6.2) integrated into worktree palette.
- Component + integration + e2e tests (§6.3).

### Merge & rebase protocol

- Each PR rebases on the prior PR's branch while the stack is in flight.
- When PR #N merges to `master`, PR #N+1 rebases onto `master` and CI re-runs.
- If a PR needs to be pulled from the stack, subsequent PRs rebase onto the prior one's base; primitive dependencies remain satisfied because #1 is the only prerequisite for #2–#7.

## 9. Living spec ritual

The spec stays current with reality.

At the close of each PR's work, the final commit in that PR updates the Delivery Ledger row below — status transitions from `Planned` → `In review` → `Merged`, records the merge commit SHA and date, and notes anything material (scope trims, discovered issues, follow-up tasks created). After merge, a fast-follow commit on `master` (`chore(spec): mark PR #N merged`) ensures the ledger on master is always truthful.

### 9.1 Delivery ledger

| PR | Branch | Status | Merge SHA | Date | Notes |
|---|---|---|---|---|---|
| #0 | `feat/streamline-00-regression-baseline` | In review | — | 2026-04-24 | Regression safety net: behavioral specs, design baselines, a11y, perf, motion, cross-OS CI. |
| #1 | `feat/streamline-01-foundation` | In review | — | 2026-04-24 | Foundation: `@theme inline` token promotion + 13 shared primitives (Avatar, Button, Card, Chip, Dot, IconButton, Input, Kbd, LinearProgress, Pill, Ring, Tabs, Titlebar). Opened as stacked PR against `feat/streamline-00-regression-baseline`. No consumer migration in this PR. |
| #2 | `feat/streamline-02-chrome` | In review | — | 2026-04-24 | Chrome migration: new `WindowControls` + `StatusBar` under `shared/chrome/`; `WindowTitleBar` rewritten on `Titlebar` + `WindowControls` primitives; PR-detail pop-out, What's-New, and PR-detail-preload migrated; `layout/StatusBar` + SQL window footer migrated to shared `StatusBar`; PR-detail tabs and Header section switcher migrated to `Tabs` primitive; legacy `.window-titlebar*`, `.window-ctrl-btn*`, `.sidebar-section-btn*`, `.sql-status-bar` CSS deleted (~150 lines). Review / Settings / Focus sub-tabs don't exist in code today — their tabification is deferred to the feature PRs (#3 / #4 / #6) that redesign those surfaces. Playwright e2e suite remains blocked by pre-existing Tauri mock auth failure (independent of this PR's scope). |
| #3 | `feat/streamline-03-pr-surfaces` | In review | — | 2026-04-25 | PR surfaces migration: unified `PRCard` with `density: "compact" \| "normal"`; `flyout/PRRow` is a thin wrapper around `<PRCard density="compact" />`; every consumer in `pr/*`, `flyout/*`, `focus/*`, `work-items/*` migrated to PR #1 primitives (Avatar, Pill, Chip, Dot, Ring, Button, IconButton, Card); QuickReview overlay rebuilt on primitives with preserved keyboard contract + FocusTrap. Test-contract `data-*` hooks added (`data-pr-row`, `data-pr-number`, `data-active`, `data-pill-tone`, `data-focus-item`, `data-priority-reason`, `data-overlay`, `data-pr-title`, `data-quick-review-summary`, `data-toast`). 2551 vitest pass (+34 vs PR #2 baseline). All five behavioral e2e specs (focus, flyout, work-items, pr-list, motion) green; 1 pre-existing self-skip (`motion › tab underline`). 8 cross-test unhandled `invoke()` rejections appear in full-suite vitest (no individual test fails) — known noise from async Tauri mocks; investigate in PR #4. Visual baselines remain red as expected per `visual.spec.ts` header — that file's progress signal awaits clipTo selectors + URL-routed deep-links (out of PR #3 scope). Opened as stacked PR against `feat/streamline-02-chrome` — https://github.com/borght-dev/BorgDock/pull/4. |
| #4 | `feat/streamline-04-pr-detail` | In review | — | 2026-04-25 | PR detail surfaces migration: every consumer in `components/pr-detail/**` (Overview, Checks, Files, Reviews, Commits, Comments, MergeReadinessChecklist, LinkedWorkItemBadge, CheckoutFlow, PRDetailApp, PRDetailPanel) and `components/review/**` (ClaudeReviewPanel, ReviewCommentCard) migrated onto PR #1 primitives (Avatar, Button, Card, Chip, Dot, IconButton, Input, LinearProgress, Pill). `components/pr-detail/diff/{DiffToolbar,DiffFileSection,DiffFileTree}` chrome migrated; diff-line rendering (`UnifiedDiffView`, `SplitDiffView`, `DiffLineContent`) untouched apart from `data-line-kind="add"\|"del"\|"context"` + `data-hunk-header` instrumentation. `components/layout/FilterBar.tsx` migrated to `Chip`, dropping the in-scope JSX consumers of `--color-filter-chip-bg/fg` (tokens themselves remain pending PR #6). 35+ test-contract `data-*` hooks added (incl. `data-diff-file`, `data-diff-stat="added"\|"deleted"`, `data-action="next-hunk"\|"prev-hunk"`, `data-overview-action`, `data-branch-pill`, `data-check-row`, `data-check-state`, `data-comment-card`, `data-bot-pill`, `data-review-card`, `data-review-severity`, `data-review-group`, `data-merge-score`, `data-checkout-stage`, `data-checkout-action`, `data-worktree-row`, `data-diff-toolbar`, `data-diff-view-mode`, `data-diff-filter`, `data-file-tree-row`, `data-file-tree-toggle`, `data-pr-detail-close`, `data-pr-detail-panel-close`/`-popout`, `data-filter-chip`/`-key`/`-active`, `data-merge-celebration`, `data-checks-tab`, `data-sort-mode`). Per-surface `pr-detail/`-scoped CSS deleted: `.checks-*` (~226 lines), `.merge-celebration*` + `.merge-checkmark` (~46 lines), `.comment-card-enter` (~3 lines) — 294 lines total dropped from `index.css`; keyframes preserved and now consumed via Tailwind `animate-[...]` utilities. PR #3-flagged 8 cross-test unhandled `invoke()` rejections fixed via `let cancelled = false` mounted-flag guard in `PRDetailApp` (Cluster A), `WorkItemDetailApp` (Cluster B), `FlyoutApp` (Cluster C) async effects (init + blur). New prev/next-hunk `IconButton`s on `DiffFileSection` with `n`/`p` keyboard shortcuts. **2606 vitest pass** (+55 vs PR #3 baseline 2551, 0 failures, 0 unhandled rejections). `pr-detail.spec.ts` 6/6 green; `pr-list.spec.ts` 7/7 green (FilterBar contract update); prior-stack behavioral specs (focus, flyout, work-items, motion) 25/25 green. `diff-viewer.spec.ts` 5/11 still red (URL-routing + seed infra gap — same as baseline, documented out of scope per spec §2 + PR #0 infra deferral). Visual baselines remain pending the `clipTo` infra gap (out of scope). Opened as stacked PR against `feat/streamline-03-pr-surfaces` — https://github.com/borght-dev/BorgDock/pull/5. |
| #5 | `feat/streamline-05-palettes` | Planned | — | — | — |
| #6 | `feat/streamline-06-ancillary` | Planned | — | — | — |
| #7 | `feat/streamline-07-worktree-changes` | Planned | — | — | — |

## 10. References

- `borgdock/README.md` — handoff bundle instructions.
- `borgdock/project/uploads/DESIGN-SYSTEM.md` — 327-token catalog, component inventory, current gaps.
- `borgdock/project/uploads/BorgDock-Styling-Guide.md` — palette and typography reference.
- `borgdock/project/BorgDock - Streamlined.html` — the standalone design canvas; source of every visual baseline.
- `borgdock/project/styles/tokens.css` — the prototype's CSS (informative — the real app ports these tokens into `@theme` in `styles/index.css`).
- `borgdock/project/components/primitives.jsx` — prototype primitive shapes; informative, not a direct import target.
- `borgdock/chats/chat1.md` — design iteration transcript.
- Existing BorgDock token source: `src/BorgDock.Tauri/src/styles/index.css`.
