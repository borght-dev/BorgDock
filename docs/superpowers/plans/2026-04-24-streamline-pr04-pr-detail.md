# Streamline PR #4 — PR Detail Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every consumer in `components/pr-detail/**` (Overview + Checks + Files + Reviews + Commits + Comments tabs, plus the diff chrome and the host app/panel), every consumer in `components/review/**`, and `components/layout/FilterBar.tsx` onto the PR #1 primitives, add the test-contract `data-*` hooks the existing `pr-detail.spec.ts` and `diff-viewer.spec.ts` Playwright behavioral specs assert on, fix the 8 cross-test unhandled `invoke()` rejections that PR #3 flagged, and delete every newly-orphaned `pr-detail/`-scoped CSS class so spec §8 PR #4 is fully landed with no carry-over.

**Architecture:** PR #4 is a pure migration PR — no new domain components, no new behavioral surfaces. Every migrated file replaces ad-hoc styled `<button>` / `<span>` / `<div>` chrome with the matching primitive (`Button`, `IconButton`, `Pill`, `Chip`, `Dot`, `Avatar`, `Card`, `Input`, `LinearProgress`) imported from `@/components/shared/primitives`. The diff *line rendering* (added/deleted/context line markup, syntax highlighting via `web-tree-sitter`) stays untouched — only the surrounding chrome (toolbar, file header, file tree, line-kind / hunk-header instrumentation) moves. Three components outside `pr-detail/` (`PRDetailApp`, `WorkItemDetailApp`, `FlyoutApp`) get a `let cancelled = false` mounted-flag added to their async `invoke()` `useEffect`s — the fix for the 8 unhandled rejections that surfaced in PR #3's full-suite vitest run. The `FilterBar` component swaps its bespoke filter buttons for `Chip` primitives, removing the only remaining in-scope JSX consumer of `--color-filter-chip-bg/fg` outside `settings/**` (which migrates in PR #6, so the tokens themselves stay in `index.css`).

**Tech Stack:** React 19 + TypeScript, Tailwind v4 `@theme`, Vitest + Testing Library (jsdom) for unit tests, Playwright (`webview-mac` / `webview-win` projects) for behavioral + visual + a11y regression. Primitives at `src/BorgDock.Tauri/src/components/shared/primitives/` (locked, PR #1). Chrome composed components at `src/BorgDock.Tauri/src/components/shared/chrome/` (locked, PR #2). Work happens in worktree `~/projects/borgdock-streamline-04` on branch `feat/streamline-04-pr-detail`, stacked on `feat/streamline-03-pr-surfaces`.

---

## Scope notes — what this PR does and does NOT touch

**In scope (per spec §8 PR #4 row + the dispatch instructions):**

- All files under `src/BorgDock.Tauri/src/components/pr-detail/**` — `OverviewTab.tsx`, `ChecksTab.tsx`, `FilesTab.tsx`, `ReviewsTab.tsx`, `CommitsTab.tsx`, `CommentsTab.tsx`, `MergeReadinessChecklist.tsx`, `LinkedWorkItemBadge.tsx`, `CheckoutFlow.tsx`, `PRDetailApp.tsx`, `PRDetailPanel.tsx`, and the entire `pr-detail/diff/` subtree (`DiffToolbar.tsx`, `DiffFileSection.tsx`, `DiffFileTree.tsx`, `UnifiedDiffView.tsx`, `SplitDiffView.tsx`, `DiffLineContent.tsx`).
- All files under `src/BorgDock.Tauri/src/components/review/**` — `ClaudeReviewPanel.tsx`, `ReviewCommentCard.tsx`.
- `src/BorgDock.Tauri/src/components/layout/FilterBar.tsx` (per dispatch — its `--color-filter-chip-bg/fg` references go away when it adopts `Chip`).
- Test-only `useEffect` fixes in three components that surface unhandled `invoke()` rejections during full-suite vitest: `pr-detail/PRDetailApp.tsx` (in scope already), `work-items/WorkItemDetailApp.tsx`, `flyout/FlyoutApp.tsx` (out of scope for migration but the dispatch makes the rejection fix part of PR #4).
- `src/BorgDock.Tauri/src/styles/index.css` — only to delete classes (`.checks-*`, `.merge-celebration*`, `.merge-checkmark`, `.comment-card-enter`) that grep-prove orphaned by the migrations above.
- `docs/superpowers/specs/2026-04-24-shared-components-design.md` — Delivery Ledger row for PR #4.

**Out of scope (deferred to later PRs in the stack):**

- Rendering logic inside `pr-detail/diff/` — `DiffLineContent.tsx`, the line-by-line patch parsing in `UnifiedDiffView.tsx` / `SplitDiffView.tsx`, the syntax highlighting via `web-tree-sitter`. Only the chrome around them migrates; we add `data-line-kind="add"|"del"|"context"` and `data-hunk-header` attributes during that migration, but those are pure instrumentation — no markup or styling change.
- Settings pages (`components/settings/**`) — they're the other JSX consumer of `--color-filter-chip-bg/fg`, so the tokens themselves stay in `index.css`; deletion belongs in PR #6.
- `worktree-palette.css:297` — also references `--color-filter-chip-bg`. Out of scope; PR #5 deletes this CSS file entirely.
- Palettes (`components/file-palette/**`, `command-palette/**`, `worktree-palette/**`) — PR #5.
- Notifications, settings, wizard, onboarding, what's new — PR #6.
- The Worktree Changes feature — PR #7.
- `visual.spec.ts` `clipTo` selectors + URL-routed deep-links — out of scope for individual surface PRs (per PR #3's note); belongs in a dedicated test-infra PR. Visual baselines for pr-detail / diff / review surfaces will start flipping green where the seed/route already works; some will remain red and that's expected.

**The `pr-detail/` CSS deletion in spec §8** maps to a verify-then-delete step for these classes only:

- `.checks-*` (38 selectors, ~226 lines — all consumed only by `ChecksTab.tsx`).
- `.merge-celebration`, `.merge-celebration-inner`, `.merge-celebration-icon`, `.merge-checkmark`, `.merge-celebration-title`, `.merge-celebration-subtitle` (~46 lines — all consumed only by `OverviewTab.tsx`).
- `.comment-card-enter` (~6 lines — consumed only by `CommentsTab.tsx`).

Task 14 makes the verification + deletion explicit so the spec line is honored.

---

## Prerequisites

- [ ] **Prereq 1: Confirm worktree, branch, base commit**

This plan is written from the `feat/streamline-03-pr-surfaces` worktree (`~/projects/borgdock-streamline-03`). Execution happens in a fresh stacked worktree:

```bash
cd ~/projects/borgdock-streamline-03

# Confirm PR #3 branch is intact
git branch --show-current
# Expected: feat/streamline-03-pr-surfaces

git log --oneline -1
# Expected: 9663d258 docs(spec): add PR #4 URL to PR #3 ledger row
# (or a newer commit if PR #3 had follow-up commits)
```

If `git log` shows a different head, run `git log feat/streamline-02-chrome..HEAD --oneline` — it should be the PR #3 commit list. If it isn't, abort and reconcile the branch state before continuing.

- [ ] **Prereq 2: Confirm `feat/streamline-03-pr-surfaces` still exists on origin**

```bash
cd ~/projects/borgdock-streamline-03
git fetch origin
git rev-parse --verify origin/feat/streamline-03-pr-surfaces
# Expected: a SHA (any 40-char hex). Failure means PR #3 was renamed or merged.
```

If `origin/feat/streamline-03-pr-surfaces` is gone but `master` has advanced (PR #3 merged while you were away), branch off `master` instead and update Task 17's `--base` from `feat/streamline-03-pr-surfaces` to `master`. Note the change in this plan's commit message.

- [ ] **Prereq 3: Create the stacked worktree**

```bash
cd ~/projects/borgdock-streamline-03
git worktree add ~/projects/borgdock-streamline-04 -b feat/streamline-04-pr-detail
cd ~/projects/borgdock-streamline-04

# Verify
pwd
# Expected: /Users/koenvdb/projects/borgdock-streamline-04
git branch --show-current
# Expected: feat/streamline-04-pr-detail
git log --oneline -1
# Expected: same SHA as the parent worktree's HEAD (9663d258 or newer)
```

If Prereq 2 forced you to branch from `master` instead, the `git worktree add` command becomes:

```bash
cd ~/projects/borgdock-streamline-03
git worktree add ~/projects/borgdock-streamline-04 -b feat/streamline-04-pr-detail master
```

- [ ] **Prereq 4: Install dependencies in the new worktree**

A fresh worktree has no `node_modules/`:

```bash
cd ~/projects/borgdock-streamline-04/src/BorgDock.Tauri
npm install
```

Expected: install completes without errors. The `web-tree-sitter` postinstall step may print a wasm warning — that's normal.

- [ ] **Prereq 5: Confirm baseline vitest suite carries cleanly into the new worktree**

```bash
cd ~/projects/borgdock-streamline-04/src/BorgDock.Tauri
npm test -- --run
```

Expected: 2551 tests pass (the calibrated baseline from PR #3's ledger row). If the count differs by more than ±5, **stop and diagnose** before touching any UI code. A drift means PR #3 wasn't carrying clean and a fix at PR #3 is needed first.

Capture the exact baseline number — Task 21 compares against it.

While there, capture the unhandled-rejection count too:

```bash
npm test -- --run 2>&1 | grep -ciE "unhandled (rejection|error)" | tee /tmp/pr4-baseline-rejections
```

Expected: a count near `8` (PR #3's documented number). The exact number doesn't matter — what matters is it drops to `0` after Task 6 + Task 13.

- [ ] **Prereq 6: Confirm primitives + chrome tests are green specifically**

```bash
cd ~/projects/borgdock-streamline-04/src/BorgDock.Tauri
npm test -- --run src/components/shared/primitives src/components/shared/chrome
```

Expected: all primitive and chrome tests pass. These are the inputs to PR #4 — if any are red, escalate to the PR #1/#2 owner; do not edit primitives to "fix" them locally.

- [ ] **Prereq 7: Confirm the two target Playwright specs run cleanly (or capture their current state)**

```bash
cd ~/projects/borgdock-streamline-04/src/BorgDock.Tauri
npm run test:e2e -- --project=webview-mac tests/e2e/pr-detail.spec.ts tests/e2e/diff-viewer.spec.ts 2>&1 | tee /tmp/pr4-baseline-e2e.log
```

Expected: most assertions in `pr-detail.spec.ts` already pass (the spec uses `getByRole('button', { name: ... })` for tab labels — those are PR #2's `Tabs` primitive output and already green). Some `diff-viewer.spec.ts` assertions are likely red because the `data-diff-file` / `data-diff-stat` / `data-hunk-header` / `data-line-kind` / `data-action="next-hunk"` attributes aren't yet on the JSX. Note which specific tests fail — Tasks 8, 9, 10 add those exact attributes and Task 15 verifies them flipping green.

If the run errors with "browser not installed" or similar Playwright setup issues, run `npx playwright install --with-deps` once and retry. If it still errors with a Tauri-mock infrastructure issue (unrelated to the data-* gaps), document it as a pre-existing blocker and fall back to running the two specs with `.skip` after verifying the migration via vitest only — but flag it explicitly.

---

## File Structure

**Create:**

- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/MergeReadinessChecklist.test.tsx` — IF the file doesn't already exist (verify with `ls src/BorgDock.Tauri/src/components/pr-detail/__tests__/` first). Asserts the Pill score badge + LinearProgress integration.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/LinkedWorkItemBadge.test.tsx` — IF it doesn't already exist. Asserts compact Pill + full Card variants render correctly.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/CommitsTab.test.tsx` — IF it doesn't already exist. Asserts the SHA Pill + commit row Card.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailApp.test.tsx` — append assertions for the close `IconButton` + the `cancelled` mounted-flag protection (verifies setState isn't called after teardown).
- `src/BorgDock.Tauri/src/components/work-items/__tests__/WorkItemDetailApp.invoke-cancellation.test.tsx` — new test file scoped strictly to verifying the cancelled-flag fix landed (so we don't have to expand the existing detail-app test suite).
- `src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutApp.invoke-cancellation.test.tsx` — same idea for `FlyoutApp`.

**Modify (component files):**

- `src/BorgDock.Tauri/src/components/pr-detail/MergeReadinessChecklist.tsx` — score badge → `<Pill tone={...} data-pill-tone={tone}>`; horizontal progress bar → `<LinearProgress value={percent} tone={tone}>`. Status icons stay (they're SVGs, not primitive candidates).
- `src/BorgDock.Tauri/src/components/pr-detail/LinkedWorkItemBadge.tsx` — compact mode → `<Pill tone="neutral" data-linked-work-item={workItemId}>`. Full mode → `<Card padding="sm" variant="default">`.
- `src/BorgDock.Tauri/src/components/pr-detail/CommitsTab.tsx` — short SHA → `<Pill tone="neutral">`. Empty / loading containers wrap in `<Card padding="md">`.
- `src/BorgDock.Tauri/src/components/pr-detail/ReviewsTab.tsx` — sort buttons → `<Chip active={...}>`. Per-review header avatar → `<Avatar initials={...} tone="them" size="sm">`. State badge → `<Pill tone={pillTone(state)} data-pill-tone={pillToneAttr(state)}>`. The list container stays a `<div>` (the dividing rule between rows is fine as `divide-y`).
- `src/BorgDock.Tauri/src/components/pr-detail/CommentsTab.tsx` — each comment card outer `<div>` → `<Card padding="sm" interactive={false}>` with the per-author left-stripe inline (the stripe is a 3px colored bar; keep as inline `<div>` since it's a chromatic decoration). Avatar → `<Avatar initials={...} tone={authorTone(author)} size="md">` (use a deterministic mapping: bots → `tone="them"`, otherwise hash to one of `own | them | blue | rose`). "bot" badge → `<Pill tone="neutral" data-bot-pill>`. Sort toggle → `<Chip active={sortNewest} onClick={...}>` for both options OR a `<Button variant="ghost" size="sm">` with the directional caret. New-comment textarea: stays a `<textarea>` (Input is single-line) — wrap container with the existing rounded border but trim per-style references where Tailwind tokens cover. "Comment" submit → `<Button variant="primary" size="sm" disabled={...}>Comment</Button>`. Add `data-comment-card` to each comment card container so future visual specs can target.
- `src/BorgDock.Tauri/src/components/pr-detail/ChecksTab.tsx` — biggest CSS hit. Replace the `.checks-*` class soup with primitives + `clsx`-d Tailwind utilities: `.checks-summary` outer `<div>` → `<Card padding="sm">`; `.checks-progress-bar` → `<LinearProgress value={...} tone={...}>` (segmented variant — see implementation note). `.checks-counts` row of `.checks-count` items → 4 × `<Pill tone={tone} icon={<StatusSvg .../>}>...</Pill>`. `.checks-suite` wrapper → `<Card padding="none" variant="default">` (or a plain `<div>` with `bd-` no-prefix Tailwind) + the per-suite border-color `tone` is no longer needed because each `.checks-run` carries its own pill. `.checks-run` → row `<div>` with `<StatusSvg>` + name + duration + `Pill running` for pending + `<Button variant="ghost" size="sm">Fix</Button>` for failed. `.checks-run-arrow` chevron icon stays inline. Add `data-check-row=""` on each row and `data-check-state={state}` for tests.
- `src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx` — the largest button surface. Six action-bar buttons (`Squash & Merge`, `Open in Browser`, `Copy Branch`, `Checkout`, `Mark Ready/Draft`, `Resolve Conflicts`, `Bypass Merge`, `Close PR`) → `<Button>` with the right variant per design (primary for Squash & Merge, secondary for Open/Copy, ghost for Checkout/MarkDraft, danger for Bypass Merge / Close PR; the special "Resolve Conflicts" purple button keeps a `variant="ghost"` with className override since `Button` doesn't define a `purple` variant — document the override with a one-line comment). Inline branch + target-ref pills → `<Pill tone="neutral" data-branch-pill="head">{p.headRef}</Pill>` and `<Pill tone="neutral" data-branch-pill="base">{p.baseRef}</Pill>`. Mergeable/draft inline status pills → `<Pill tone="error">Merge Conflicts</Pill>` etc. AI summary card outer wrapper → `<Card padding="sm">`. AI summary trigger button → `<Button variant="secondary" size="sm" leading={<SparklesIcon />}>Summarize with AI</Button>`. Review submission row: textarea stays; "Submit" → `<Button variant="primary" size="sm">Submit</Button>`; the `<select>` for review event keeps the native select (consistent with DiffToolbar pattern). Quick-comment inline `<input>` → `<Input placeholder="Write a comment..." onKeyDown={...}>`; "Post" → `<Button variant="primary" size="sm" disabled={!commentBody.trim()}>Post</Button>`. The MergeCelebration helper at the bottom keeps the `.merge-celebration*` classes IN PLACE during this task (deletion is Task 14 after the migration is verified). Add `data-overview-action={kind}` (`merge|browser|copy|checkout|draft|resolve|bypass|close`) to each action button so e2e specs can target without relying on label text in the future.
- `src/BorgDock.Tauri/src/components/pr-detail/CheckoutFlow.tsx` — 838-line wizard. Dismiss `<button>` (line 266 area) → `<IconButton icon={<XIcon />} tooltip="Cancel" size={22}>`. Back button (line 407) → `<Button variant="ghost" size="md" leading={<ArrowLeftIcon />}>Back</Button>`. "Create & check out →" (line 413) → `<Button variant="primary" size="md" trailing={<ArrowRightIcon />}>Create & check out</Button>`. Cancel button (line 636) → `<Button variant="ghost" size="md">Cancel</Button>`. "Check out here →" main action (line 642) → `<Button variant="primary" size="md" trailing={<ArrowRightIcon />}>Check out here</Button>`. New-worktree-name `<input>` (line 386) → `<Input placeholder="my-feature-branch" autoFocus value={...} onChange={...}>`. Favorites toggle (line 438) → `<IconButton icon={<StarIcon filled={favoritesOnly} />} active={favoritesOnly} tooltip="Show favorites only">`. Worktree picker rows (line 490–546) → `<Card variant="default" interactive padding="sm" onClick={...} data-worktree-row data-worktree-slot={slot}>`. ActionChip sub-component (lines 796–815) → `<Chip onClick={...}>` for Explorer/Terminal/Claude/VSCode shortcuts (this drops the per-status-color logic to `Chip`'s tone vocabulary; if a chip needs a danger tint pass `tone="error"`). Hardcoded hex backgrounds on lines 255, 320, 359, 599–609, 736, 754 → semantic tokens (`var(--color-accent-soft)`, `var(--color-status-red)`, etc.). Status sub-components (`StatusDot`, `StatusStrip`) at lines 707–760 — keep the inline dot rendering (semantic tokens already in use). Add `data-checkout-stage={stage}` to the outer flow container so motion / behavioral tests can target.
- `src/BorgDock.Tauri/src/components/pr-detail/PRDetailApp.tsx` — close `<button>` (lines 148–161) → `<IconButton icon={<XIcon />} tooltip="Close" size={22} onClick={handleClose}>`. **Plus the invoke() rejection fix:** the `useEffect` at lines 52–129 gains `let cancelled = false` + `cancelled` guards on every `setIsLoading` / `setPr` / `setError` call inside the async `(async () => { ... })()` IIFE, with a `return () => { cancelled = true; }` cleanup. See Task 6 for the exact diff.
- `src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx` — close `<button>` (lines 93–109) → `<IconButton icon={<XIcon />} tooltip="Close" size={22}>`. Pop-out `<button>` (lines 121–140) → `<IconButton icon={<PopOutIcon />} tooltip="Open in window" size={22}>`. Preserve `data-tauri-drag-region` on lines 90, 113 (window drag region — critical for Tauri).
- `src/BorgDock.Tauri/src/components/pr-detail/diff/DiffToolbar.tsx` — Unified/Split toggle (lines 48–69) → two `<Button variant={mode === 'unified' ? 'primary' : 'ghost'} size="sm">Unified</Button>` etc.; consider a tone="accent" `Chip` group instead since the visual is "selected pill" — go with `Chip` for visual fidelity: `<Chip active={mode === 'unified'} onClick={...}>Unified</Chip>` and `<Chip active={mode === 'split'} onClick={...}>Split</Chip>`. File-tree toggle (line 73) → `<IconButton icon={<TreeIcon />} active={showFileTree} tooltip={showFileTree ? "Hide file tree" : "Show file tree"} size={22}>`. Expand/collapse (line 97) → `<IconButton icon={allExpanded ? <CollapseIcon /> : <ExpandIcon />} active={allExpanded} tooltip={...} size={22}>`. Status filter row (line 127) → 4 × `<Chip active={statusFilter === f} onClick={() => onStatusFilterChange(f)}>{label}</Chip>` for `all | added | modified | deleted`. Stats span (line 144) — keep as plain text. Native commit `<select>` (line 152) — keep native; it's the right control for this. Add `data-diff-toolbar` to the outer toolbar container.
- `src/BorgDock.Tauri/src/components/pr-detail/diff/DiffFileSection.tsx` — collapse-toggle button (line 74) → `<IconButton icon={collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />} tooltip={collapsed ? "Expand file" : "Collapse file"} size={18}>`. Status badge (line 99) → `<Pill tone={statusPillTone(file.status)} data-diff-stat-status>{file.status[0].toUpperCase()}</Pill>`. Copy-path button (line 126) → `<IconButton icon={<CopyIcon />} tooltip="Copy file path" size={18}>`. Open-in-GitHub (line 144) → `<IconButton icon={<ExternalLinkIcon />} tooltip="Open in GitHub" size={18}>`. **Plus the e2e contract:** the outer file-section `<div>` (currently has `data-filename`) gains `data-diff-file=""` (preserve `data-filename`); the `+N` additions span gains `data-diff-stat="added"`; the `-N` deletions span gains `data-diff-stat="deleted"`. **Plus the new hunk-nav buttons:** add a "Next hunk" `<IconButton icon={<ArrowDownIcon />} tooltip="Next hunk (n)" data-action="next-hunk" onClick={handleNextHunk} size={18}>` and "Prev hunk" `<IconButton icon={<ArrowUpIcon />} tooltip="Prev hunk (p)" data-action="prev-hunk" onClick={handlePrevHunk} size={18}>` to the sticky file header right cluster. Implement scroll-to-hunk via `el.scrollIntoView({ block: 'start' })` on the matching `[data-hunk-header]` (added in Task 9). The keyboard handlers `n` / `p` go onto the file-section root `tabIndex={-1}` so the diff-viewer.spec.ts assertion `window.scrollY` change after click works.
- `src/BorgDock.Tauri/src/components/pr-detail/diff/DiffFileTree.tsx` — search `<input>` (line 79) → `<Input leading={<SearchIcon />} placeholder="Filter files..." value={search} onChange={...}>`. Tree-mode toggle (line 93) → `<IconButton icon={treeMode ? <ListIcon /> : <TreeIcon />} active={treeMode} tooltip={treeMode ? "Show flat list" : "Show tree"} size={18}>`. File-list rows (line 113–151) — keep as bespoke (the indentation + status indicator + active-row highlight is intricate; primitives don't fit well). Add `data-file-tree-row data-filename={file.filename}` on each row.
- `src/BorgDock.Tauri/src/components/pr-detail/diff/UnifiedDiffView.tsx` — **NO migration of rendering.** Add only: `data-line-kind="add"` / `data-line-kind="del"` / `data-line-kind="context"` on the line `<div>`s (or `<tr>`s — read the file first to confirm shape); `data-hunk-header=""` on the hunk-header rows. These are pure attribute additions; no className or computed-style change.
- `src/BorgDock.Tauri/src/components/pr-detail/diff/SplitDiffView.tsx` — same as UnifiedDiffView: add `data-line-kind` and `data-hunk-header` only. The split view has two columns (left=before, right=after); add `data-line-kind` to BOTH the left and right cell — `del` on the left side of a deletion row, `add` on the right side of an addition row, `context` on both for context rows, and the empty-cell side (left of an addition, right of a deletion) gets no `data-line-kind` (or `data-line-kind="empty"` if needed; the spec doesn't assert on empty cells).
- `src/BorgDock.Tauri/src/components/pr-detail/diff/DiffLineContent.tsx` — **no changes** (rendering logic, out of scope).
- `src/BorgDock.Tauri/src/components/pr-detail/FilesTab.tsx` — verify the file's only inline-styled bits are the loading skeletons (lines 296–306) and the error banner (lines 309–323). Both wrap in `<Card padding="md" variant="default">`. The error retry button → `<Button variant="ghost" size="sm">Retry</Button>`. The "large PR" warning banner (line 354) → `<Card padding="sm">` with the warning text + an inline `<Pill tone="warning">{files.length} files</Pill>`. Empty state (line 326) → `<Card padding="md">`. No other migration here — `<DiffToolbar>`, `<DiffFileSection>`, `<DiffFileTree>` already migrated.
- `src/BorgDock.Tauri/src/components/review/ClaudeReviewPanel.tsx` — group toggle button (lines 65–91) → `<Button variant="ghost" size="sm">` with the chevron + label. Group count badge (line 89) → `<Chip>{count}</Chip>` (replaces the `--color-filter-chip-bg` inline reference). Add `data-review-group={severity}` on each toggle for spec targeting.
- `src/BorgDock.Tauri/src/components/review/ReviewCommentCard.tsx` — severity dot → `<Dot tone={severityDotTone(severity)} size={8}>`. The card outer wrapper stays a `<div>` (the per-comment border + bg pattern is fine inline). Add `data-review-card data-review-severity={severity}`.
- `src/BorgDock.Tauri/src/components/layout/FilterBar.tsx` — every filter button → `<Chip active={isActive} count={count} onClick={() => setFilter(f.key)}>{f.label}</Chip>`. The `--color-filter-chip-bg` / `--color-filter-chip-fg` inline className references (line 55) go away — `Chip` uses its own `bd-pill--*` classes. Add `data-filter-chip data-filter-key={f.key} data-filter-active={isActive}` for keyboard-nav / e2e.

**Modify (component test files):**

- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/OverviewTab.test.tsx` — update selectors that resolve to old class chains. Add assertions for `data-overview-action`, `data-branch-pill`, the AI summary `<Card>` shell.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/ChecksTab.test.tsx` — update selectors. Add assertions for `data-check-row`, `data-check-state`. Replace `.checks-summary` queries with role / `data-` queries.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/CheckoutFlow.test.tsx` (if it exists; check first) — update selectors.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailPanel.test.tsx` — update selectors that reference the old `<button>` chrome.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailApp.test.tsx` — update selectors + add the cancellation-fix assertion (Task 6).
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/MergeReadinessChecklist.test.tsx` (existing or created) — assert `<Pill>` + `<LinearProgress>` rendering.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/LinkedWorkItemBadge.test.tsx` — assert compact and full variants.
- `src/BorgDock.Tauri/src/components/pr-detail/__tests__/CommitsTab.test.tsx` — assert SHA Pill renders.
- `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/DiffToolbar.test.tsx` — update selectors. Add assertions for the four status-filter `<Chip>`s and the unified/split `<Chip>` group.
- `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/DiffFileSection.test.tsx` — assert `data-diff-file`, `data-diff-stat="added"`, `data-diff-stat="deleted"`, the new prev/next-hunk `IconButton`s with `data-action`.
- `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/DiffFileTree.test.tsx` — assert the `Input` search field + `IconButton` tree-mode toggle.
- `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/UnifiedDiffView.test.tsx` — assert `data-line-kind` and `data-hunk-header` attributes are present.
- `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/SplitDiffView.test.tsx` — same as Unified.
- `src/BorgDock.Tauri/src/components/review/__tests__/ClaudeReviewPanel.test.tsx` — update selectors. Add `data-review-group` assertion.
- `src/BorgDock.Tauri/src/components/review/__tests__/ReviewCommentCard.test.tsx` — assert `<Dot>` severity rendering, `data-review-severity`.
- `src/BorgDock.Tauri/src/components/layout/__tests__/FilterBar.test.tsx` (if it exists; if not, create a small one) — assert `<Chip>` rendering with the `count` prop and `active` state.

**Modify (other files):**

- `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.tsx` — invoke-rejection fix only (Task 13). No primitive migration here (work-items are fully migrated by PR #3).
- `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx` — invoke-rejection fix only (Task 13). No primitive migration here (flyout is fully migrated by PR #3).
- `src/BorgDock.Tauri/src/styles/index.css` — Task 14 deletes `.checks-*` (lines ~1528–1753), `.merge-celebration*` + `.merge-checkmark` (lines ~1416–1461), `.comment-card-enter` (line ~1408). Confirmed via grep that no other consumer references these classes.
- `docs/superpowers/specs/2026-04-24-shared-components-design.md` — Delivery Ledger row #4 → "In review" with the new PR URL (Task 16).

**Leave alone:**

- `src/BorgDock.Tauri/src/components/shared/primitives/**` (locked by PR #1).
- `src/BorgDock.Tauri/src/components/shared/chrome/**` (locked by PR #2).
- `src/BorgDock.Tauri/src/components/pr-detail/diff/DiffLineContent.tsx` (rendering logic; out of scope).
- The internal patch parsing / `useSyntaxHighlight` / virtualization logic in `UnifiedDiffView.tsx` and `SplitDiffView.tsx` — only attribute additions, no rendering changes.
- `src/BorgDock.Tauri/src/components/pr-detail/CheckoutFlow.tsx`'s sub-components `StatusDot`, `StatusStrip`, `Sep` (lines 707–760) — they're already token-clean inline; no primitive applies.
- `src/BorgDock.Tauri/src/components/pr/**`, `flyout/**`, `focus/**`, `work-items/**` (PR #3, except the rejection fix in `WorkItemDetailApp.tsx` and `FlyoutApp.tsx`).
- `src/BorgDock.Tauri/src/styles/file-palette.css`, `worktree-palette.css`, `file-viewer.css` (PR #5).
- `--color-filter-chip-bg` / `--color-filter-chip-fg` token *definitions* in `index.css` (still consumed by `worktree-palette.css` and `settings/**`; deletion belongs in PR #5 / PR #6).

---

## Task 1 — Migrate three small surfaces: `LinkedWorkItemBadge`, `MergeReadinessChecklist`, `CommitsTab`

These three files are small (≤245 lines), structurally similar (single-purpose presentational components), and their migrations don't ripple. Done as one task to keep momentum; each gets its own commit.

### 1.1 — `LinkedWorkItemBadge` → `Pill` (compact) + `Card` (full)

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/LinkedWorkItemBadge.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/LinkedWorkItemBadge.test.tsx` (verify it exists; create if missing)

- [ ] **Step 1.1.1: Read the current file**

```bash
cat src/BorgDock.Tauri/src/components/pr-detail/LinkedWorkItemBadge.tsx
```

Note the `compact` boolean prop and the conditional render branches.

- [ ] **Step 1.1.2: Write/update the test**

If the test file doesn't exist:

```tsx
// src/BorgDock.Tauri/src/components/pr-detail/__tests__/LinkedWorkItemBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LinkedWorkItemBadge } from '../LinkedWorkItemBadge';

describe('LinkedWorkItemBadge', () => {
  it('renders compact pill with AB#<id>', () => {
    const { container } = render(
      <LinkedWorkItemBadge workItemId={54258} compact />,
    );
    expect(screen.getByText('AB#54258')).toBeInTheDocument();
    expect(container.querySelector('[data-linked-work-item="54258"]')).toBeInTheDocument();
  });

  it('renders full Card variant when not compact and workItem is provided', () => {
    const { container } = render(
      <LinkedWorkItemBadge
        workItemId={54258}
        workItem={{ id: 54258, title: 'Resolve list price', state: 'Active', url: '' }}
      />,
    );
    expect(screen.getByText(/Resolve list price/)).toBeInTheDocument();
    expect(container.querySelector('.bd-card')).toBeInTheDocument();
  });
});
```

If it already exists, append the two assertions above.

- [ ] **Step 1.1.3: Run the test — expect failure on the data-attr / Card selector**

```bash
cd src/BorgDock.Tauri && npm test -- --run src/components/pr-detail/__tests__/LinkedWorkItemBadge.test.tsx
```

Expected: at least one assertion fails because `[data-linked-work-item]` and `.bd-card` aren't yet rendered.

- [ ] **Step 1.1.4: Implement the migration**

Replace the file content with:

```tsx
import { Card, Pill } from '@/components/shared/primitives';
import type { WorkItem } from '@/types';

interface LinkedWorkItemBadgeProps {
  workItemId: number;
  workItem?: WorkItem;
  compact?: boolean;
}

export function LinkedWorkItemBadge({
  workItemId,
  workItem,
  compact,
}: LinkedWorkItemBadgeProps) {
  if (compact) {
    return (
      <Pill tone="neutral" data-linked-work-item={workItemId}>
        AB#{workItemId}
      </Pill>
    );
  }
  if (!workItem) {
    return (
      <Pill tone="neutral" data-linked-work-item={workItemId}>
        AB#{workItemId}
      </Pill>
    );
  }
  return (
    <Card padding="sm" variant="default" data-linked-work-item={workItemId}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
          AB#{workItem.id}
        </span>
        <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">
          {workItem.title}
        </span>
        <Pill tone="neutral">{workItem.state}</Pill>
      </div>
    </Card>
  );
}
```

(If the existing file's prop names differ, match them — read the existing file first.)

- [ ] **Step 1.1.5: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/LinkedWorkItemBadge.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/LinkedWorkItemBadge.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/LinkedWorkItemBadge.test.tsx
git commit -m "refactor(pr-detail): LinkedWorkItemBadge uses Pill + Card primitives"
```

### 1.2 — `MergeReadinessChecklist` → `Pill` for score badge, `LinearProgress` for bar

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/MergeReadinessChecklist.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/MergeReadinessChecklist.test.tsx` (existing)

- [ ] **Step 1.2.1: Read the current file**

The file has a `computeMergeScore` import, a status-icon helper that emits SVGs per status, a score badge at the top (lines ~169–179), and a horizontal progress bar (lines ~200–215).

- [ ] **Step 1.2.2: Write the failing assertions**

Append to the existing test file (or create one if missing):

```tsx
it('renders the score with a Pill primitive', () => {
  const { container } = render(<MergeReadinessChecklist pr={mockReadyPr} />);
  expect(container.querySelector('[data-merge-score]')).toBeInTheDocument();
  expect(container.querySelector('.bd-pill')).toBeInTheDocument();
});

it('renders the readiness progress as LinearProgress', () => {
  const { container } = render(<MergeReadinessChecklist pr={mockReadyPr} />);
  expect(container.querySelector('.bd-linear-progress')).toBeInTheDocument();
});
```

(Reuse the existing `mockReadyPr` fixture in the test file. If the test file doesn't exist, create one with a single "renders without crashing" smoke test plus the two above.)

- [ ] **Step 1.2.3: Run the test — expect failures**

```bash
npm test -- --run src/components/pr-detail/__tests__/MergeReadinessChecklist.test.tsx
```

- [ ] **Step 1.2.4: Migrate the score badge**

Replace the inline score badge `<span>` (around line 169–179) with:

```tsx
<Pill
  tone={scoreTone(score)}
  data-merge-score={score}
  data-pill-tone={scoreToneAttr(score)}
>
  {Math.round(score)} / 100
</Pill>
```

Add helper at the top of the file:

```tsx
import type { PillTone } from '@/components/shared/primitives';

function scoreTone(score: number): PillTone {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
}
function scoreToneAttr(score: number): 'approved' | 'pending' | 'changes' {
  if (score >= 80) return 'approved';
  if (score >= 50) return 'pending';
  return 'changes';
}
```

- [ ] **Step 1.2.5: Migrate the progress bar**

Replace the segmented inline `<div>` progress bar (around line 200–215) with:

```tsx
<LinearProgress value={score} tone={scoreTone(score)} />
```

(`LinearProgress` is single-tone; if the existing visual is multi-segment, drop the segmentation in favor of a single tone — the segmentation is a stylistic choice that the design canvas doesn't preserve.)

- [ ] **Step 1.2.6: Update the imports**

Top of `MergeReadinessChecklist.tsx`:

```tsx
import { LinearProgress, Pill, type PillTone } from '@/components/shared/primitives';
```

Status icons (the inline SVGs at lines 101–162) stay as they are — they're not primitives.

- [ ] **Step 1.2.7: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/MergeReadinessChecklist.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/MergeReadinessChecklist.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/MergeReadinessChecklist.test.tsx
git commit -m "refactor(pr-detail): MergeReadinessChecklist uses Pill + LinearProgress"
```

### 1.3 — `CommitsTab` → `Pill` for short SHA, `Card` for empty/loading states

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/CommitsTab.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/CommitsTab.test.tsx` (verify exists; create if missing)

- [ ] **Step 1.3.1: Read the current file**

Lines 62–78 render a list of commits; the short SHA is in a `<span>` with `bg-[var(--color-code-block-bg)]` styling.

- [ ] **Step 1.3.2: Write the failing test**

```tsx
// CommitsTab.test.tsx — append or create
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommitsTab } from '../CommitsTab';

vi.mock('@/services/github', async () => ({
  getPRCommits: vi.fn().mockResolvedValue([
    { sha: 'abc1234567', message: 'Fix bug\nDetails...', authorLogin: 'sschmidt', date: '2026-04-23T10:00:00Z' },
  ]),
}));
vi.mock('@/services/github/singleton', () => ({
  getClient: () => ({}),
}));
vi.mock('@/hooks/useCachedTabData', () => ({
  useCachedTabData: (_o: any, _r: any, _n: any, _k: any, _u: any, fn: any) => {
    const [data, setData] = (require('react') as typeof import('react')).useState(null);
    (require('react') as typeof import('react')).useEffect(() => { fn().then(setData); }, []);
    return { data, isLoading: data === null };
  },
}));

describe('CommitsTab', () => {
  it('renders the short SHA inside a Pill primitive', async () => {
    const { container } = render(
      <CommitsTab prNumber={1} repoOwner="o" repoName="r" prUpdatedAt="" />,
    );
    await screen.findByText('Fix bug');
    expect(container.querySelector('.bd-pill')).toBeInTheDocument();
    expect(screen.getByText('abc1234')).toBeInTheDocument();
  });
});
```

- [ ] **Step 1.3.3: Run + expect failure**

```bash
npm test -- --run src/components/pr-detail/__tests__/CommitsTab.test.tsx
```

- [ ] **Step 1.3.4: Migrate**

In `CommitsTab.tsx` line 65 area, replace:

```tsx
<span className="shrink-0 mt-0.5 rounded bg-[var(--color-code-block-bg)] px-1.5 py-0.5 font-[var(--font-code)] text-[10px] text-[var(--color-text-muted)]">
  {commit.sha.slice(0, 7)}
</span>
```

with:

```tsx
<Pill tone="neutral" data-commit-sha={commit.sha}>
  {commit.sha.slice(0, 7)}
</Pill>
```

Wrap the loading and empty branches with `<Card padding="md">`. Top-of-file imports:

```tsx
import { Card, Pill } from '@/components/shared/primitives';
```

- [ ] **Step 1.3.5: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/CommitsTab.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/CommitsTab.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/CommitsTab.test.tsx
git commit -m "refactor(pr-detail): CommitsTab uses Pill + Card primitives"
```

---

## Task 2 — Migrate `ReviewsTab` and `CommentsTab`

These two tabs share `Avatar` / `Pill` / `Card` patterns. Done together.

### 2.1 — `ReviewsTab` migration

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/ReviewsTab.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/ReviewsTab.test.tsx`

- [ ] **Step 2.1.1: Read the current file** (lines 137–200 area).

The sort buttons (lines 141–155) are inline `<button>` with `bg-[var(--color-accent)]` for active. The per-review header (lines 161–183) has a custom avatar `<span>`, an author name, a relative date, and a state badge `<span>` with inline `style={{ color, backgroundColor: color-mix(...) }}`.

- [ ] **Step 2.1.2: Migrate**

```tsx
// ReviewsTab.tsx — replace the sort button row + per-review header

import { Avatar, Chip, Pill, type PillTone } from '@/components/shared/primitives';

// helper at top of file:
function statePill(state: string): { tone: PillTone; toneAttr: 'approved' | 'changes' | 'commented' | 'pending'; label: string } | null {
  switch (state) {
    case 'APPROVED':       return { tone: 'success', toneAttr: 'approved',  label: 'Approved' };
    case 'CHANGES_REQUESTED':
                            return { tone: 'error',   toneAttr: 'changes',   label: 'Changes Requested' };
    case 'COMMENTED':      return { tone: 'draft',   toneAttr: 'commented', label: 'Commented' };
    default:               return null;
  }
}
```

Sort row:

```tsx
<div className="flex gap-1 px-3 py-1.5 border-b border-[var(--color-separator)]">
  {SORT_MODES.map((mode) => (
    <Chip
      key={mode}
      active={sortMode === mode}
      onClick={() => setSortMode(mode)}
      data-sort-mode={mode}
    >
      {mode.charAt(0).toUpperCase() + mode.slice(1)}
    </Chip>
  ))}
</div>
```

Per-review header (replace lines 163–182):

```tsx
<div className="flex items-center gap-2">
  <Avatar
    initials={avatarInitials(review.user)}
    tone="them"
    size="sm"
    data-review-author={review.user}
  />
  <span className="text-xs font-medium text-[var(--color-text-primary)]">
    {review.user}
  </span>
  <span className="text-[10px] text-[var(--color-text-muted)]">
    {formatRelativeDate(review.submittedAt)}
  </span>
  {statePill(review.state) && (
    <Pill
      tone={statePill(review.state)!.tone}
      data-pill-tone={statePill(review.state)!.toneAttr}
      className="ml-auto"
    >
      {statePill(review.state)!.label}
    </Pill>
  )}
</div>
```

- [ ] **Step 2.1.3: Update test**

Add to the existing test (or create one if absent):

```tsx
it('renders sort buttons as Chip primitives', () => {
  const { container } = render(<ReviewsTab {...props} />);
  expect(container.querySelectorAll('[data-sort-mode]')).toHaveLength(4);
  expect(container.querySelector('[data-sort-mode="newest"]')).toHaveAttribute(
    'data-active',
    expect.any(String),
  );
});

it('renders Approved state with data-pill-tone="approved"', () => {
  const { container } = renderWithMockReviews([
    { id: 1, user: 'me', state: 'APPROVED', body: '', submittedAt: '...' },
  ]);
  expect(container.querySelector('[data-pill-tone="approved"]')).toBeInTheDocument();
});
```

- [ ] **Step 2.1.4: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/ReviewsTab.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/ReviewsTab.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/ReviewsTab.test.tsx
git commit -m "refactor(pr-detail): ReviewsTab uses Avatar + Chip + Pill primitives"
```

### 2.2 — `CommentsTab` migration

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/CommentsTab.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/CommentsTab.test.tsx`

- [ ] **Step 2.2.1: Read** the current file (it's large — lines 70–333).

Key migration targets:
- Loading skeleton card outer `<div>` (line 122 area) → `<Card padding="sm">`.
- Each comment card outer `<div>` (line 184) → `<Card padding="none">` (the per-author left stripe is a flex child, so we keep `<Card>` zero-padding and let internal `<div>` handle stripe + padded content). Add `data-comment-card data-comment-id={comment.id}`.
- Author avatar `<span>` (line 199–225) → `<Avatar initials={avatarInitials(comment.author)} tone={authorTone(comment.author)} size="md">` for non-bots; for bots, render the existing inline SVG inside a `<Avatar>`-styled wrapper — actually, since `Avatar` doesn't support custom children, KEEP the inline `<span>` for bots (with a one-line comment justifying); migrate non-bot avatars to `<Avatar>`. The deterministic color picked by `authorColor(login)` doesn't map cleanly to `Avatar`'s 4 tones (`own | them | blue | rose`); collapse to `tone="them"` for everyone except `me` (the user) — accept the visual diff and document it.
- "bot" badge (line 232–242) → `<Pill tone="neutral" data-bot-pill>bot</Pill>`.
- Sort toggle `<button>` (line 158–174) → `<Button variant="ghost" size="sm">` with the directional caret as `leading`.
- "Comment" submit button (line 321–328) → `<Button variant="primary" size="sm" disabled={posting || !newComment.trim()}>{posting ? 'Posting...' : 'Comment'}</Button>`.
- The new-comment `<textarea>` (line 307–319) — keep as-is (Input is single-line). Document the constraint in a one-line comment.

- [ ] **Step 2.2.2: Migrate** — patch by patch. Top-of-file imports:

```tsx
import { Avatar, Button, Card, Pill } from '@/components/shared/primitives';
```

Sort toggle:

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setSortNewest((v) => !v)}
  leading={
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {sortNewest ? <path d="M8 3v10M4 7l4-4 4 4" /> : <path d="M8 3v10M4 9l4 4 4-4" />}
    </svg>
  }
>
  {sortNewest ? 'Newest first' : 'Oldest first'}
</Button>
```

Comment card outer (line 184 area):

```tsx
<Card
  key={comment.id}
  padding="none"
  data-comment-card=""
  data-comment-id={comment.id}
  className="comment-card-enter flex overflow-hidden"
  style={{
    animationDelay: `${idx * 40}ms`,
    marginTop: prevSameAuthor ? '4px' : undefined,
  }}
>
```

(Keep the `comment-card-enter` className temporarily — Task 14 deletes it once the cards no longer reference it; the migration here keeps the entrance animation intact.)

Avatar header — for non-bots, swap inline `<span>` for:

```tsx
{!bot ? (
  <Avatar
    initials={avatarInitials(comment.author)}
    tone="them"
    size="sm"
    data-comment-author={comment.author}
  />
) : (
  <span /* keep existing bot SVG inline */ ... />
)}
```

"bot" badge:

```tsx
{bot && (
  <Pill tone="neutral" data-bot-pill>bot</Pill>
)}
```

Submit button:

```tsx
<Button
  variant="primary"
  size="sm"
  onClick={handlePost}
  disabled={posting || !newComment.trim()}
>
  {posting ? 'Posting...' : 'Comment'}
</Button>
```

- [ ] **Step 2.2.3: Update test**

Add assertions for `data-comment-card`, `data-bot-pill`, the `<Button>` Comment trigger, and the avatar fallback for bots-vs-humans.

- [ ] **Step 2.2.4: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/CommentsTab.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/CommentsTab.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/CommentsTab.test.tsx
git commit -m "refactor(pr-detail): CommentsTab uses Avatar + Button + Card + Pill"
```

---

## Task 3 — Migrate `ChecksTab` (CSS-killer)

`ChecksTab` is the biggest CSS hit in the PR — it consumes 38 `.checks-*` selectors. The migration replaces them with primitives + Tailwind utilities; Task 14 then deletes the CSS.

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/ChecksTab.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/ChecksTab.test.tsx`

- [ ] **Step 3.1: Read the current file** (331 lines).

`SummaryBar` (lines 145–211) renders a multi-segment progress bar (`.checks-progress-bar` + four `.checks-progress-segment` variants) and a count row (`.checks-counts` + `.checks-count-{state}` × 4).

`groupBySuite` returns suites; each suite renders inside a `.checks-suite` div (with state-dependent border color), and each run renders inside `.checks-run` (state-dependent bg + hover effect + arrow + optional Fix button).

- [ ] **Step 3.2: Update test fixtures**

The existing `ChecksTab.test.tsx` likely queries `.checks-summary` / `.checks-run--failed`. Update queries to use new attributes:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChecksTab } from '../ChecksTab';

const fixtureChecks = [
  { id: 1, name: 'ci/build', status: 'completed', conclusion: 'success', startedAt: '2026-04-23T10:00:00Z', completedAt: '2026-04-23T10:01:00Z', htmlUrl: 'https://example/1', checkSuiteId: 100 },
  { id: 2, name: 'ci/test',  status: 'completed', conclusion: 'failure', startedAt: '2026-04-23T10:00:00Z', completedAt: '2026-04-23T10:02:30Z', htmlUrl: 'https://example/2', checkSuiteId: 100 },
  { id: 3, name: 'ci/lint',  status: 'in_progress', conclusion: null,    startedAt: '2026-04-23T10:00:00Z', completedAt: null,                  htmlUrl: 'https://example/3', checkSuiteId: 101 },
];

describe('ChecksTab', () => {
  it('renders one [data-check-row] per check', () => {
    const { container } = render(<ChecksTab checks={fixtureChecks as any} />);
    expect(container.querySelectorAll('[data-check-row]')).toHaveLength(3);
  });

  it('marks failed checks with data-check-state="failed"', () => {
    const { container } = render(<ChecksTab checks={fixtureChecks as any} />);
    expect(
      container.querySelector('[data-check-row][data-check-state="failed"]'),
    ).toBeInTheDocument();
  });

  it('renders LinearProgress in the summary', () => {
    const { container } = render(<ChecksTab checks={fixtureChecks as any} />);
    expect(container.querySelector('.bd-linear-progress')).toBeInTheDocument();
  });

  it('renders four count Pills (passed/failed/pending/skipped) with data-check-count', () => {
    const { container } = render(<ChecksTab checks={fixtureChecks as any} />);
    const pills = container.querySelectorAll('[data-check-count]');
    expect(pills.length).toBeGreaterThanOrEqual(2); // at least passed + failed
  });

  it('renders Fix button on failed checks when pr is provided', () => {
    const { container } = render(
      <ChecksTab checks={fixtureChecks as any} pr={{ pullRequest: { repoOwner: 'o', repoName: 'r', number: 1, headRef: 'b', baseRef: 'main', authorLogin: 'a', state: 'open', isDraft: false, mergeable: true, htmlUrl: '', body: '', labels: [], additions: 0, deletions: 0, changedFiles: 0, commitCount: 0, createdAt: '', updatedAt: '', commentCount: 0, reviewStatus: 'none' }, checks: [], overallStatus: 'red', failedCheckNames: ['ci/test'], pendingCheckNames: [], passedCount: 1, skippedCount: 0 } as any} />,
    );
    expect(
      container.querySelector('[data-check-row][data-check-state="failed"] .bd-btn'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.3: Run — expect failures** (the new selectors don't exist yet).

```bash
npm test -- --run src/components/pr-detail/__tests__/ChecksTab.test.tsx
```

- [ ] **Step 3.4: Migrate `SummaryBar`**

```tsx
import { Card, LinearProgress, Pill, type PillTone } from '@/components/shared/primitives';

function checkCountTone(state: CheckState): PillTone {
  if (state === 'passed') return 'success';
  if (state === 'failed') return 'error';
  if (state === 'pending') return 'warning';
  return 'neutral';
}

function summaryProgressTone(passed: number, failed: number, pending: number): 'success' | 'error' | 'warning' {
  if (failed > 0) return 'error';
  if (pending > 0) return 'warning';
  return 'success';
}

function SummaryBar({ checks }: { checks: CheckRun[] }) {
  const passed = checks.filter((c) => classifyCheck(c) === 'passed').length;
  const failed = checks.filter((c) => classifyCheck(c) === 'failed').length;
  const pending = checks.filter((c) => classifyCheck(c) === 'pending').length;
  const skipped = checks.filter((c) => classifyCheck(c) === 'skipped').length;
  const total = checks.length;
  const relevant = total - skipped;
  const percent = relevant > 0 ? ((passed / relevant) * 100) : 0;
  const tone = summaryProgressTone(passed, failed, pending);

  return (
    <Card padding="sm" className="space-y-2">
      <LinearProgress value={percent} tone={tone} />
      <div className="flex flex-wrap items-center gap-2">
        {passed > 0 && (
          <Pill tone="success" data-check-count="passed">
            <CheckIcon /> {passed} passed
          </Pill>
        )}
        {failed > 0 && (
          <Pill tone="error" data-check-count="failed">
            <FailIcon /> {failed} failed
          </Pill>
        )}
        {pending > 0 && (
          <Pill tone="warning" data-check-count="pending">
            <SpinnerIcon /> {pending} in progress
          </Pill>
        )}
        {skipped > 0 && (
          <Pill tone="neutral" data-check-count="skipped">
            <SkipIcon /> {skipped} skipped
          </Pill>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3.5: Migrate the suite + run loop**

Replace lines 256–328 with:

```tsx
import { Button, IconButton } from '@/components/shared/primitives';

return (
  <div className="space-y-3 p-3" data-checks-tab>
    <SummaryBar checks={checks} />
    <div className="space-y-2">
      {sortedEntries.map(([suiteId, runs]) => {
        const sortedRuns = [...runs].sort(
          (a, b) => sortOrder[classifyCheck(a)] - sortOrder[classifyCheck(b)],
        );
        return (
          <div key={suiteId} className="space-y-1">
            {sortedRuns.map((run) => {
              const state = classifyCheck(run);
              const duration = formatDuration(run.startedAt, run.completedAt);
              return (
                <div
                  key={run.id}
                  data-check-row=""
                  data-check-state={state}
                  role="button"
                  tabIndex={0}
                  onClick={() => openUrl(run.htmlUrl).catch(console.error)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') openUrl(run.htmlUrl).catch(console.error);
                  }}
                  className={clsx(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                    'hover:bg-[var(--color-surface-hover)]',
                    state === 'failed' && 'bg-[color-mix(in_srgb,var(--color-status-red)_5%,transparent)]',
                  )}
                >
                  <StatusSvg state={state} />
                  <span className={clsx(
                    'flex-1 truncate text-xs',
                    state === 'failed' ? 'text-[var(--color-status-red)]' : 'text-[var(--color-text-primary)]',
                    state === 'skipped' && 'text-[var(--color-text-muted)]',
                  )}>
                    {run.name}
                  </span>
                  {state === 'pending' && (
                    <Pill tone="warning">running</Pill>
                  )}
                  {duration && (
                    <span className="text-[10px] text-[var(--color-text-muted)]">{duration}</span>
                  )}
                  {state === 'failed' && pr && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFixCheck(run.name);
                      }}
                      data-check-action="fix"
                    >
                      Fix
                    </Button>
                  )}
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  </div>
);
```

- [ ] **Step 3.6: Empty state**

```tsx
if (checks.length === 0) {
  return (
    <Card padding="md" className="m-3 flex items-center justify-center gap-2">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
        <path d="m3 8.5 3.5 3.5 6.5-8" />
      </svg>
      <span className="text-xs text-[var(--color-text-muted)]">No CI checks configured</span>
    </Card>
  );
}
```

- [ ] **Step 3.7: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/ChecksTab.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/ChecksTab.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/ChecksTab.test.tsx
git commit -m "refactor(pr-detail): ChecksTab uses Card + LinearProgress + Pill + Button (drops .checks-* CSS consumption)"
```

After this commit, no consumer references `.checks-*` selectors. Task 14 deletes the CSS.

---

## Task 4 — Migrate `OverviewTab` (the largest button surface)

`OverviewTab` is 656 lines; the action bar alone has 8 buttons with bespoke variants (primary green, accent purple-soft, ghost subtle, danger dashed, danger outline, etc.). The migration aligns them to `Button` variants and accepts a small visual diff where necessary.

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/OverviewTab.test.tsx` (existing)

- [ ] **Step 4.1: Read the file** — focus on:
  - Metadata pills (lines 280–298): branch + target-ref pills.
  - Mergeable/draft badges (lines 320–336).
  - AI summary block (lines 342–423).
  - Action bar (lines 444–505).
  - Action status banner (line 508–515).
  - Review submission textarea + select + button (lines 564–593).
  - Quick comment input + button (lines 595–622).

- [ ] **Step 4.2: Update test**

Append assertions for `data-overview-action`, `data-branch-pill`, action-bar `<Button>`s, AI summary `<Card>`:

```tsx
it('renders branch + base pills with data-branch-pill', () => {
  const { container } = render(<OverviewTab pr={mockPr} />);
  expect(container.querySelector('[data-branch-pill="head"]')).toBeInTheDocument();
  expect(container.querySelector('[data-branch-pill="base"]')).toBeInTheDocument();
});

it('renders action buttons with data-overview-action', () => {
  const { container } = render(<OverviewTab pr={mockPr} />);
  expect(container.querySelector('[data-overview-action="browser"]')).toBeInTheDocument();
  expect(container.querySelector('[data-overview-action="copy"]')).toBeInTheDocument();
  expect(container.querySelector('[data-overview-action="checkout"]')).toBeInTheDocument();
});

it('renders Squash & Merge primary button when ready', () => {
  const readyPr = { ...mockPr, overallStatus: 'green' as const, pullRequest: { ...mockPr.pullRequest, isDraft: false, mergeable: true, reviewStatus: 'approved' as const } };
  const { container } = render(<OverviewTab pr={readyPr} />);
  expect(container.querySelector('[data-overview-action="merge"]')).toBeInTheDocument();
});
```

- [ ] **Step 4.3: Migrate metadata pills**

```tsx
import { Avatar, Button, Card, Input, Pill } from '@/components/shared/primitives';

// Replace the head + base ref spans (lines 280–298) with:
<Pill tone="neutral" data-branch-pill="head">{p.headRef}</Pill>
<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
  <path d="m5 8 6 0M9 5l3 3-3 3" />
</svg>
<Pill tone="neutral" data-branch-pill="base">{p.baseRef}</Pill>
```

- [ ] **Step 4.4: Migrate mergeable/draft pills** (lines 320–336)

```tsx
{p.mergeable === false && <Pill tone="error">Merge Conflicts</Pill>}
{p.mergeable === true && <Pill tone="success">Mergeable</Pill>}
{p.isDraft && <Pill tone="draft">Draft</Pill>}
```

- [ ] **Step 4.5: Migrate AI summary block** (lines 342–423)

Wrap the entire summary block in `<Card padding="sm">`. Replace the "Summarize with AI" `<button>` with:

```tsx
<Button
  variant="secondary"
  size="sm"
  onClick={handleGenerateSummary}
  data-overview-action="summarize"
  className="w-full"
>
  Summarize with AI
  <FeatureBadge badgeId="pr-summary" />
</Button>
```

The "Regenerate" inline link → `<Button variant="ghost" size="sm">Regenerate</Button>`.

The summary-loading inline div stays (keeps the spinner inline). The summary-error inline div → wrap in `<Card padding="sm" variant="default">` with a `<Button variant="ghost" size="sm">Retry</Button>`.

- [ ] **Step 4.6: Migrate the action bar** (lines 444–505) — eight buttons:

```tsx
<div className="flex flex-wrap gap-2">
  {isReady && (
    <Button variant="primary" size="sm" onClick={handleMerge} data-overview-action="merge">
      Squash &amp; Merge
    </Button>
  )}
  <Button variant="secondary" size="sm" onClick={() => handleOpenInBrowser(p.htmlUrl)} data-overview-action="browser">
    Open in Browser
  </Button>
  <Button variant="ghost" size="sm" onClick={() => handleCopyBranch(p.headRef)} data-overview-action="copy">
    Copy Branch
  </Button>
  <Button
    variant="ghost"
    size="sm"
    onClick={handleCheckout}
    aria-expanded={checkoutOpen}
    data-overview-action="checkout"
    className={clsx(checkoutOpen && 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-purple-border)]')}
  >
    Checkout
  </Button>
  <Button variant="ghost" size="sm" onClick={handleToggleDraft} data-overview-action="draft">
    {p.isDraft ? 'Mark Ready' : 'Mark Draft'}
  </Button>
  {p.mergeable === false && (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleResolveConflicts}
      data-overview-action="resolve"
      className="border border-[var(--color-purple-border)] bg-[var(--color-purple-soft)] text-[var(--color-purple)]"
    >
      &#10022; Resolve Conflicts
    </Button>
  )}
  <Button
    variant="danger"
    size="sm"
    onClick={handleBypassConfirm}
    data-overview-action="bypass"
    className="border-2 border-dashed bg-transparent"
  >
    Bypass Merge
  </Button>
  {p.state === 'open' && (
    <Button variant="danger" size="sm" onClick={handleCloseConfirm} data-overview-action="close" className="bg-transparent">
      Close PR
    </Button>
  )}
</div>
```

(`Button`'s vocabulary doesn't cover the bespoke "purple-soft" / "dashed-danger" treatments — keep them as className overrides; document with a one-line comment over the action bar that these className overrides are intentional and a future PR can promote them to `Button` variants if recurring.)

- [ ] **Step 4.7: Migrate the action status banner** (lines 508–515)

```tsx
{actionStatus && !mergeSuccess && (
  <Card padding="sm" className="flex items-center gap-2">
    {actionStatus.includes('...') && (
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
    )}
    <span className="text-xs text-[var(--color-text-secondary)]">{actionStatus}</span>
  </Card>
)}
```

- [ ] **Step 4.8: Migrate review submission** (lines 564–593)

Keep the `<textarea>` (Input is single-line). Replace the Submit button:

```tsx
<Button variant="primary" size="sm" onClick={handleSubmitReview} data-overview-action="submit-review">
  Submit
</Button>
```

The `<select>` for review event stays native (consistent with DiffToolbar).

- [ ] **Step 4.9: Migrate quick comment** (lines 595–622)

```tsx
<div className="flex gap-2">
  <Input
    value={commentBody}
    onChange={(e) => setCommentBody(e.target.value)}
    placeholder="Write a comment..."
    onKeyDown={(e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handlePostComment();
      }
    }}
    className="flex-1"
  />
  <Button
    variant="primary"
    size="sm"
    onClick={handlePostComment}
    disabled={!commentBody.trim()}
    data-overview-action="post-comment"
  >
    Post
  </Button>
</div>
```

- [ ] **Step 4.10: MergeCelebration** (lines 627–656) — leave intact. The `.merge-celebration*` classes stay; Task 14 deletes them. (Note: deleting them would orphan this helper — Task 14 first migrates MergeCelebration to inline Tailwind + a `<Card>` wrapper, then drops the CSS.)

- [ ] **Step 4.11: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/OverviewTab.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/OverviewTab.test.tsx
git commit -m "refactor(pr-detail): OverviewTab uses Button + Card + Input + Pill primitives"
```

---

## Task 5 — Migrate `CheckoutFlow` (838 lines, multi-stage wizard)

The longest file in the PR. Migrates buttons, inputs, cards, pills, and the dismiss icon-button. Keep the wizard's stage state machine + worktree-list logic completely intact — those drive the `dispatch_*` invokes that PR #4 must not break.

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/CheckoutFlow.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/CheckoutFlow.test.tsx` (verify exists; if not, write a minimal smoke test)

- [ ] **Step 5.1: Read the file in three slices** (it's 838 lines):

```bash
sed -n '1,250p'   src/BorgDock.Tauri/src/components/pr-detail/CheckoutFlow.tsx
sed -n '251,500p' src/BorgDock.Tauri/src/components/pr-detail/CheckoutFlow.tsx
sed -n '501,838p' src/BorgDock.Tauri/src/components/pr-detail/CheckoutFlow.tsx
```

(Use Read tool in the agent; bash sed is just illustrative.)

Identify the stage-by-stage UI:
- Stage 1: picker (lines ~254–540) — favorites toggle, worktree list, "different worktree" link.
- Stage 2: form (lines ~543–620) — new-worktree-name input, action chips for what to launch.
- Stage 3: running (lines ~624–720) — log streaming, status strip.
- Stage 4: done (lines ~720–790) — action chip row.

- [ ] **Step 5.2: Top-of-file imports**

```tsx
import { Button, Card, Chip, IconButton, Input, Pill } from '@/components/shared/primitives';
```

- [ ] **Step 5.3: Migrate the dismiss button** (line ~266)

```tsx
<IconButton
  icon={<XIcon />}
  tooltip="Cancel checkout"
  size={22}
  onClick={onDismiss}
  data-checkout-dismiss
/>
```

(Define `XIcon` inline at the bottom of the file: a 12×12 SVG with two diagonal lines, matching the existing inline glyph.)

- [ ] **Step 5.4: Migrate the picker stage** (lines ~254–540)

Outer container:

```tsx
<div className="space-y-3" data-checkout-stage="picker">
  ...
</div>
```

Favorites toggle (line ~438):

```tsx
<IconButton
  icon={<StarIcon filled={favoritesOnly} />}
  active={favoritesOnly}
  tooltip={favoritesOnly ? 'Show all worktrees' : 'Show favorites only'}
  onClick={() => setFavoritesOnly((v) => !v)}
  size={22}
  data-checkout-favorites-toggle
/>
```

Each worktree row (line ~490):

```tsx
<Card
  key={slot.path}
  variant={isSelected ? 'own' : 'default'}
  padding="sm"
  interactive
  onClick={() => handlePickWorktree(slot)}
  data-worktree-row
  data-worktree-slot={slot.path}
  className={clsx(
    'flex items-center gap-3',
    isSelected && 'border-[var(--color-accent)]',
  )}
>
  ...{/* keep inline content: indicator, name, status pill */}
  {slot.isInUse && <Pill tone="warning">in use</Pill>}
  {slot.isFavorite && <Pill tone="neutral">★</Pill>}
</Card>
```

"Different worktree" link (line ~302):

```tsx
<Button variant="ghost" size="sm" onClick={() => setShowDifferent(true)}>
  Pick a different worktree
</Button>
```

- [ ] **Step 5.5: Migrate the form stage** (lines ~543–620)

```tsx
<div className="space-y-3" data-checkout-stage="form">
  <Input
    autoFocus
    placeholder="my-feature-branch"
    value={newWorktreeName}
    onChange={(e) => setNewWorktreeName(e.target.value)}
    data-checkout-input="worktree-name"
  />

  <div className="flex gap-2">
    <Button variant="ghost" size="md" leading={<ArrowLeftIcon />} onClick={handleBack}>
      Back
    </Button>
    <Button
      variant="primary"
      size="md"
      trailing={<ArrowRightIcon />}
      disabled={!isValidName(newWorktreeName)}
      onClick={handleCreate}
      data-checkout-action="create"
    >
      Create &amp; check out
    </Button>
  </div>
</div>
```

- [ ] **Step 5.6: Migrate the running stage** (lines ~624–720)

```tsx
<div className="space-y-3" data-checkout-stage="running">
  {/* Status strip (StatusDot + StatusStrip sub-components stay) */}
  ...
  <div className="flex gap-2">
    <Button variant="ghost" size="md" onClick={handleCancelRunning} data-checkout-action="cancel">
      Cancel
    </Button>
  </div>
</div>
```

The logs viewport (whatever inline `<pre>` / log lines exist) stays — primitive doesn't fit log streams.

- [ ] **Step 5.7: Migrate the done stage** (lines ~720–790)

```tsx
<div className="space-y-3" data-checkout-stage="done">
  <Card padding="sm">
    {/* status text */}
  </Card>
  <div className="flex flex-wrap gap-2">
    <Chip onClick={handleOpenExplorer} data-checkout-launch="explorer">
      <FolderIcon /> Explorer
    </Chip>
    <Chip onClick={handleOpenTerminal} data-checkout-launch="terminal">
      <TerminalIcon /> Terminal
    </Chip>
    <Chip onClick={handleOpenClaude} data-checkout-launch="claude">
      <ClaudeIcon /> Claude
    </Chip>
    <Chip onClick={handleOpenVSCode} data-checkout-launch="vscode">
      <VSCodeIcon /> VSCode
    </Chip>
  </div>
  <Button variant="primary" size="md" trailing={<ArrowRightIcon />} onClick={handleDone} data-checkout-action="done">
    Check out here
  </Button>
</div>
```

- [ ] **Step 5.8: Replace hardcoded hex colors with semantic tokens**

Search for `#5fd39b`, `#7a8dff`, `#f17a7a` in the file and replace with `var(--color-status-green)`, `var(--color-accent)`, `var(--color-status-red)` respectively (the gradient backgrounds are stylistic; either keep them as gradients with `color-mix` against the semantic tokens, or simplify to a flat `bg-[var(--color-accent-soft)]`).

- [ ] **Step 5.9: Update test**

```tsx
it('renders the picker stage with data-checkout-stage="picker"', () => {
  const { container } = render(<CheckoutFlow {...defaultProps} />);
  expect(container.querySelector('[data-checkout-stage="picker"]')).toBeInTheDocument();
});

it('renders the dismiss IconButton', () => {
  const { container } = render(<CheckoutFlow {...defaultProps} />);
  expect(container.querySelector('[data-checkout-dismiss]')).toBeInTheDocument();
});
```

- [ ] **Step 5.10: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/CheckoutFlow.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/CheckoutFlow.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/CheckoutFlow.test.tsx
git commit -m "refactor(pr-detail): CheckoutFlow uses Button + Card + Chip + IconButton + Input + Pill"
```

---

## Task 6 — Migrate `PRDetailApp` (incl. invoke-rejection fix Cluster A) and `PRDetailPanel`

These are the chrome containers. `PRDetailApp` also gets the cancellation-flag fix for the unhandled invoke() rejection cluster.

### 6.1 — `PRDetailApp` migration + invoke fix

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/PRDetailApp.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailApp.test.tsx`

- [ ] **Step 6.1.1: Read the file** (196 lines).

The close button is at lines 148–161. The async `useEffect` at lines 52–129 calls `invoke<AppSettings>('load_settings')` then `invoke('cache_init')` then potentially more, with no `cancelled` flag.

- [ ] **Step 6.1.2: Update the test — add cancellation assertion**

Append:

```tsx
it('does not call setState after unmount when invoke resolves late', async () => {
  let resolveSettings: (s: any) => void = () => {};
  const settingsPromise = new Promise((r) => { resolveSettings = r; });
  vi.mocked(invoke).mockImplementation(((cmd: string) => {
    if (cmd === 'load_settings') return settingsPromise;
    return Promise.resolve(null);
  }) as any);

  const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { unmount } = render(<PRDetailApp />);
  unmount();
  resolveSettings({ azureDevOps: {}, github: {}, repos: [], ui: {}, claudeApi: {} });

  // wait a tick for any pending setState
  await new Promise((r) => setTimeout(r, 50));
  expect(consoleErrSpy).not.toHaveBeenCalledWith(
    expect.stringContaining('not wrapped in act'),
  );
  consoleErrSpy.mockRestore();
});

it('renders the close button as an IconButton', () => {
  const { container } = render(<PRDetailApp />);
  expect(container.querySelector('.bd-icon-btn')).toBeInTheDocument();
});
```

- [ ] **Step 6.1.3: Apply the cancellation fix**

Edit the `useEffect` (lines ~52–129) — add `let cancelled = false;` at the top of the effect body, gate every `setIsLoading` / `setPr` / `setError` / `useSettingsStore.setState` / `useThemeStore.getState().setTheme(...)` call inside the IIFE on `if (cancelled) return;`, and add the cleanup at the end:

```tsx
useEffect(() => {
  let cancelled = false;
  if (!owner || !repo || !number) {
    setError('Missing PR parameters (owner, repo, number)');
    setIsLoading(false);
    return;
  }

  (async () => {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      if (cancelled) return;
      useSettingsStore.setState({ settings, isLoading: false });
      // (theme application — also gate on cancelled)
      if (settings.ui?.theme) {
        useThemeStore.getState().setTheme(settings.ui.theme);
      }

      await invoke('cache_init');
      if (cancelled) return;

      // ... rest of the existing async work, gated likewise ...
      // Every setPr / setError / setIsLoading inside this IIFE prefixed with `if (cancelled) return;`
      // For example:
      const cachedPr = /* ... fetch ... */;
      if (cancelled) return;
      setPr(cachedPr);
    } catch (err) {
      if (cancelled) return;
      console.error('Failed to load PR:', err);
      setError('Failed to load pull request');
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [owner, repo, number]);
```

(Match the existing variable names — `setPr`, `setError`, `setIsLoading`, `useSettingsStore`, `useThemeStore` — exactly as they appear in the current code; the snippet above is illustrative.)

- [ ] **Step 6.1.4: Migrate the close button** (lines 148–161)

```tsx
<IconButton
  icon={<XIcon />}
  tooltip="Close"
  size={22}
  onClick={() => window.close()}
  data-pr-detail-close
/>
```

(Keep `data-tauri-drag-region` on the surrounding header `<div>` if present — only the `<button>` becomes IconButton.)

- [ ] **Step 6.1.5: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/PRDetailApp.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/PRDetailApp.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailApp.test.tsx
git commit -m "refactor(pr-detail): PRDetailApp uses IconButton + cancelled-flag guard on invoke()"
```

### 6.2 — `PRDetailPanel` migration

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailPanel.test.tsx`

- [ ] **Step 6.2.1: Migrate** the close `<button>` (lines 93–109) and pop-out `<button>` (lines 121–140) to `IconButton`. Preserve `data-tauri-drag-region` on the surrounding header(s) at lines 90 and 113.

```tsx
<IconButton icon={<XIcon />} tooltip="Close" size={22} onClick={handleClose} data-pr-detail-panel-close />
<IconButton icon={<PopOutIcon />} tooltip="Open in window" size={22} onClick={handlePopOut} data-pr-detail-panel-popout />
```

- [ ] **Step 6.2.2: Update test selectors** — replace any `.tactile-icon-btn` queries with `[data-pr-detail-panel-close]` / `[data-pr-detail-panel-popout]`.

- [ ] **Step 6.2.3: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/PRDetailPanel.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailPanel.test.tsx
git commit -m "refactor(pr-detail): PRDetailPanel uses IconButton chrome"
```

---

## Task 7 — Migrate `pr-detail/diff/DiffToolbar`

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/diff/DiffToolbar.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/DiffToolbar.test.tsx`

- [ ] **Step 7.1: Read the file** (167 lines).

- [ ] **Step 7.2: Update test**

```tsx
it('renders Unified/Split mode chips', () => {
  const { container } = render(<DiffToolbar {...defaultProps} viewMode="unified" />);
  const chips = container.querySelectorAll('[data-diff-view-mode]');
  expect(chips).toHaveLength(2);
  expect(container.querySelector('[data-diff-view-mode="unified"][data-active="true"]')).toBeInTheDocument();
});

it('renders the four status filter chips', () => {
  const { container } = render(<DiffToolbar {...defaultProps} statusFilter="all" />);
  expect(container.querySelectorAll('[data-diff-filter]')).toHaveLength(4);
  expect(container.querySelector('[data-diff-filter="all"][data-active="true"]')).toBeInTheDocument();
});

it('renders the file-tree IconButton with active state when shown', () => {
  const { container } = render(<DiffToolbar {...defaultProps} showFileTree />);
  expect(container.querySelector('[data-diff-toolbar-action="file-tree"]')).toBeInTheDocument();
});
```

- [ ] **Step 7.3: Migrate**

```tsx
import { Chip, IconButton } from '@/components/shared/primitives';

return (
  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-diff-border)] px-3 py-1.5" data-diff-toolbar>
    <div className="flex gap-1">
      <Chip
        active={viewMode === 'unified'}
        onClick={() => onViewModeChange('unified')}
        data-diff-view-mode="unified"
      >
        Unified
      </Chip>
      <Chip
        active={viewMode === 'split'}
        onClick={() => onViewModeChange('split')}
        data-diff-view-mode="split"
      >
        Split
      </Chip>
    </div>
    <IconButton
      icon={<TreeIcon />}
      active={showFileTree}
      tooltip={showFileTree ? 'Hide file tree' : 'Show file tree'}
      size={22}
      onClick={onToggleFileTree}
      data-diff-toolbar-action="file-tree"
    />
    <IconButton
      icon={allExpanded ? <CollapseIcon /> : <ExpandIcon />}
      active={allExpanded}
      tooltip={allExpanded ? 'Collapse all' : 'Expand all'}
      size={22}
      onClick={onToggleAllExpanded}
      data-diff-toolbar-action="expand-collapse"
    />
    <div className="flex gap-1">
      {(['all', 'added', 'modified', 'deleted'] as const).map((f) => (
        <Chip
          key={f}
          active={statusFilter === f}
          onClick={() => onStatusFilterChange(f)}
          data-diff-filter={f}
        >
          {f.charAt(0).toUpperCase() + f.slice(1)}
        </Chip>
      ))}
    </div>
    <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
      {fileCount} file{fileCount !== 1 ? 's' : ''} · <span className="text-[var(--color-status-green)]">+{totalAdditions}</span> · <span className="text-[var(--color-status-red)]">-{totalDeletions}</span>
    </span>
    {commits.length > 0 && (
      <select
        value={selectedCommit ?? ''}
        onChange={(e) => onCommitChange(e.target.value || null)}
        className="rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
        data-diff-commit-selector
      >
        <option value="">All commits</option>
        {commits.map((c) => (
          <option key={c.sha} value={c.sha}>
            {c.sha.slice(0, 7)} {c.message.split('\n')[0]}
          </option>
        ))}
      </select>
    )}
  </div>
);
```

- [ ] **Step 7.4: Run + commit**

```bash
npm test -- --run src/components/pr-detail/diff/__tests__/DiffToolbar.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/diff/DiffToolbar.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/DiffToolbar.test.tsx
git commit -m "refactor(pr-detail/diff): DiffToolbar uses Chip + IconButton primitives"
```

---

## Task 8 — Migrate `DiffFileSection` + `DiffFileTree` (incl. data-* contracts and hunk-nav buttons)

This task adds the e2e contract attributes that `diff-viewer.spec.ts` asserts on: `data-diff-file`, `data-diff-stat="added"`, `data-diff-stat="deleted"`, `data-action="next-hunk"` (and prev-hunk).

### 8.1 — `DiffFileSection`

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/diff/DiffFileSection.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/DiffFileSection.test.tsx`

- [ ] **Step 8.1.1: Read** (194 lines).

- [ ] **Step 8.1.2: Update test**

```tsx
it('renders data-diff-file on the file root', () => {
  const { container } = render(<DiffFileSection file={mockFile} viewMode="unified" />);
  expect(container.querySelector('[data-diff-file]')).toBeInTheDocument();
});

it('renders data-diff-stat="added" with the additions count', () => {
  const { container } = render(
    <DiffFileSection file={{ ...mockFile, additions: 42, deletions: 5 }} viewMode="unified" />,
  );
  const added = container.querySelector('[data-diff-stat="added"]');
  expect(added).toBeInTheDocument();
  expect(added?.textContent).toContain('42');
});

it('renders data-diff-stat="deleted" with the deletions count', () => {
  const { container } = render(
    <DiffFileSection file={{ ...mockFile, additions: 42, deletions: 5 }} viewMode="unified" />,
  );
  const deleted = container.querySelector('[data-diff-stat="deleted"]');
  expect(deleted).toBeInTheDocument();
  expect(deleted?.textContent).toContain('5');
});

it('renders prev/next hunk IconButtons with data-action', () => {
  const { container } = render(<DiffFileSection file={mockFile} viewMode="unified" />);
  expect(container.querySelector('[data-action="prev-hunk"]')).toBeInTheDocument();
  expect(container.querySelector('[data-action="next-hunk"]')).toBeInTheDocument();
});

it('scrolls to next hunk when next-hunk button is clicked', () => {
  const { container } = render(<DiffFileSection file={mockFile} viewMode="unified" />);
  const nextBtn = container.querySelector('[data-action="next-hunk"]') as HTMLButtonElement;
  // Mock element.scrollIntoView since jsdom doesn't implement it
  const scrollIntoViewMock = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoViewMock;
  nextBtn.click();
  expect(scrollIntoViewMock).toHaveBeenCalled();
});
```

- [ ] **Step 8.1.3: Migrate**

Top-of-file imports:

```tsx
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { IconButton, Pill, type PillTone } from '@/components/shared/primitives';
```

Status pill helper:

```tsx
function statusPillTone(status: DiffFile['status']): PillTone {
  if (status === 'added') return 'success';
  if (status === 'removed') return 'error';
  if (status === 'renamed' || status === 'copied') return 'neutral';
  return 'warning'; // modified
}
function statusBadgeLetter(status: DiffFile['status']): string {
  return status === 'added' ? 'A' : status === 'removed' ? 'D' : status === 'renamed' ? 'R' : status === 'copied' ? 'C' : 'M';
}
```

Outer container (line ~63):

```tsx
<div
  ref={ref}
  data-diff-file=""
  data-filename={file.filename}
  className="border-b border-[var(--color-diff-border)]"
  tabIndex={-1}
  onKeyDown={handleKeyDown}
>
```

Sticky header — the collapse-toggle, status pill, file name, stats, prev/next hunk, copy, open-in-github:

```tsx
<div
  className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5"
  style={{ backgroundColor: 'var(--color-diff-file-header-bg)', backdropFilter: 'blur(8px)' }}
>
  <IconButton
    icon={collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
    tooltip={collapsed ? 'Expand file' : 'Collapse file'}
    size={18}
    onClick={() => setCollapsed((v) => !v)}
  />
  <Pill tone={statusPillTone(file.status)} data-diff-status>
    {statusBadgeLetter(file.status)}
  </Pill>
  <span className="font-mono text-xs text-[var(--color-text-primary)] truncate">
    {file.filename}
  </span>
  <span className="text-[10px] text-[var(--color-status-green)]" data-diff-stat="added">
    +{file.additions}
  </span>
  <span className="text-[10px] text-[var(--color-status-red)]" data-diff-stat="deleted">
    &minus;{file.deletions}
  </span>
  <div className="ml-auto flex items-center gap-1">
    <IconButton icon={<ArrowUpIcon />} tooltip="Previous hunk (p)" size={18} onClick={handlePrevHunk} data-action="prev-hunk" />
    <IconButton icon={<ArrowDownIcon />} tooltip="Next hunk (n)" size={18} onClick={handleNextHunk} data-action="next-hunk" />
    {onCopyPath && (
      <IconButton icon={<CopyIcon />} tooltip="Copy file path" size={18} onClick={() => onCopyPath(file.filename)} />
    )}
    {onOpenInGitHub && (
      <IconButton icon={<ExternalLinkIcon />} tooltip="Open in GitHub" size={18} onClick={() => onOpenInGitHub(file.filename)} />
    )}
  </div>
</div>
```

Hunk nav handlers:

```tsx
const sectionRef = useRef<HTMLDivElement | null>(null);
const handleNextHunk = useCallback(() => {
  const headers = sectionRef.current?.querySelectorAll('[data-hunk-header]');
  if (!headers || headers.length === 0) return;
  // Find the first hunk-header below the current viewport top (relative to the diff pane).
  const target = Array.from(headers).find((h) => {
    const rect = (h as HTMLElement).getBoundingClientRect();
    return rect.top > 80; // 80px = sticky header height + buffer
  });
  (target ?? headers[0]).scrollIntoView({ behavior: 'smooth', block: 'start' });
}, []);
const handlePrevHunk = useCallback(() => {
  const headers = sectionRef.current?.querySelectorAll('[data-hunk-header]');
  if (!headers || headers.length === 0) return;
  const target = Array.from(headers).reverse().find((h) => {
    const rect = (h as HTMLElement).getBoundingClientRect();
    return rect.bottom < 80;
  });
  (target ?? headers[headers.length - 1]).scrollIntoView({ behavior: 'smooth', block: 'start' });
}, []);
```

Wire `sectionRef` to the outer `data-diff-file` container.

Also wire `n` / `p` keyboard handlers on the section root:

```tsx
const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key === 'n') { e.preventDefault(); handleNextHunk(); }
  else if (e.key === 'p') { e.preventDefault(); handlePrevHunk(); }
}, [handleNextHunk, handlePrevHunk]);
```

- [ ] **Step 8.1.4: Run + commit**

```bash
npm test -- --run src/components/pr-detail/diff/__tests__/DiffFileSection.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/diff/DiffFileSection.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/DiffFileSection.test.tsx
git commit -m "refactor(pr-detail/diff): DiffFileSection uses IconButton + Pill, adds data-diff-file/stat/action attrs and hunk-nav"
```

### 8.2 — `DiffFileTree`

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/diff/DiffFileTree.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/DiffFileTree.test.tsx`

- [ ] **Step 8.2.1: Read** (164 lines).

- [ ] **Step 8.2.2: Update test**

```tsx
it('renders the search field as Input primitive', () => {
  const { container } = render(<DiffFileTree files={mockFiles} statusFilter="all" onFileClick={vi.fn()} />);
  expect(container.querySelector('.bd-input')).toBeInTheDocument();
});

it('renders the tree-mode toggle as IconButton', () => {
  const { container } = render(<DiffFileTree files={mockFiles} statusFilter="all" onFileClick={vi.fn()} />);
  expect(container.querySelector('[data-file-tree-toggle]')).toBeInTheDocument();
});

it('emits data-file-tree-row on each file row', () => {
  const { container } = render(<DiffFileTree files={mockFiles} statusFilter="all" onFileClick={vi.fn()} />);
  expect(container.querySelectorAll('[data-file-tree-row]').length).toBe(mockFiles.length);
});
```

- [ ] **Step 8.2.3: Migrate**

```tsx
import { IconButton, Input } from '@/components/shared/primitives';

// Search input (line 79):
<Input
  leading={<SearchIcon />}
  placeholder="Filter files..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
/>

// Tree-mode toggle (line 93):
<IconButton
  icon={treeMode ? <ListIcon /> : <TreeIcon />}
  active={treeMode}
  tooltip={treeMode ? 'Show flat list' : 'Show tree'}
  size={18}
  onClick={() => setTreeMode((v) => !v)}
  data-file-tree-toggle
/>

// File-list row wrapper (line 113 area):
<div
  data-file-tree-row
  data-filename={file.filename}
  /* keep existing className + onClick */
>
  ...
</div>
```

- [ ] **Step 8.2.4: Run + commit**

```bash
npm test -- --run src/components/pr-detail/diff/__tests__/DiffFileTree.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/diff/DiffFileTree.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/DiffFileTree.test.tsx
git commit -m "refactor(pr-detail/diff): DiffFileTree uses Input + IconButton primitives"
```

---

## Task 9 — Add `data-line-kind` and `data-hunk-header` to `UnifiedDiffView` and `SplitDiffView`

**No migration of rendering.** Pure attribute additions for the `diff-viewer.spec.ts` contract. The line-rendering markup, syntax highlighting via `web-tree-sitter`, and virtualization logic stay completely intact.

### 9.1 — `UnifiedDiffView`

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/diff/UnifiedDiffView.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/UnifiedDiffView.test.tsx`

- [ ] **Step 9.1.1: Read** (251 lines). Identify where the line `<div>` (or `<tr>`) is rendered for each kind: `add`, `del`, `context`, and where the hunk-header row is rendered.

- [ ] **Step 9.1.2: Update test**

```tsx
it('renders data-line-kind="add" on added lines', () => {
  const { container } = render(<UnifiedDiffView ...mockProps file={fileWithAddedLine} />);
  expect(container.querySelector('[data-line-kind="add"]')).toBeInTheDocument();
});

it('renders data-line-kind="del" on deleted lines', () => {
  const { container } = render(<UnifiedDiffView ...mockProps file={fileWithDeletedLine} />);
  expect(container.querySelector('[data-line-kind="del"]')).toBeInTheDocument();
});

it('renders data-hunk-header on hunk header rows', () => {
  const { container } = render(<UnifiedDiffView ...mockProps file={fileWithHunk} />);
  const header = container.querySelector('[data-hunk-header]');
  expect(header).toBeInTheDocument();
  expect(header?.textContent).toContain('@@');
});
```

- [ ] **Step 9.1.3: Add the attributes**

Locate the per-line rendering switch. For each line render branch, add the `data-line-kind` attribute on the outer line element:

```tsx
// Hunk header row:
<div data-hunk-header className="...existing...">
  {hunkHeaderText}
</div>

// Per-line:
<div data-line-kind={kind} className="...existing...">
  ...
</div>
```

`kind` is one of `'add' | 'del' | 'context'` per the existing classification logic.

- [ ] **Step 9.1.4: Run + commit**

```bash
npm test -- --run src/components/pr-detail/diff/__tests__/UnifiedDiffView.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/diff/UnifiedDiffView.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/UnifiedDiffView.test.tsx
git commit -m "feat(pr-detail/diff): UnifiedDiffView emits data-line-kind + data-hunk-header for e2e contract"
```

### 9.2 — `SplitDiffView`

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/diff/SplitDiffView.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/SplitDiffView.test.tsx`

- [ ] **Step 9.2.1: Read** (378 lines). Identify the left/right cell rendering for each line.

- [ ] **Step 9.2.2: Update test**

```tsx
it('renders data-line-kind="add" on the right cell of an addition row', () => {
  const { container } = render(<SplitDiffView ...mockProps file={fileWithAddedLine} />);
  expect(container.querySelector('[data-line-kind="add"]')).toBeInTheDocument();
});

it('renders data-line-kind="del" on the left cell of a deletion row', () => {
  const { container } = render(<SplitDiffView ...mockProps file={fileWithDeletedLine} />);
  expect(container.querySelector('[data-line-kind="del"]')).toBeInTheDocument();
});

it('renders data-hunk-header on hunk header rows', () => {
  const { container } = render(<SplitDiffView ...mockProps file={fileWithHunk} />);
  const headers = container.querySelectorAll('[data-hunk-header]');
  expect(headers.length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 9.2.3: Add attributes**

For the split view, add `data-line-kind` to the populated side of each row:
- Addition row: `data-line-kind="add"` on the right cell; left cell is empty (no attribute).
- Deletion row: `data-line-kind="del"` on the left cell; right cell is empty.
- Context row: `data-line-kind="context"` on both cells.

Hunk-header row: `data-hunk-header` on the spanning row (whether it's a `<tr>` with `colspan` or a `<div>` covering the full width).

- [ ] **Step 9.2.4: Run + commit**

```bash
npm test -- --run src/components/pr-detail/diff/__tests__/SplitDiffView.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/diff/SplitDiffView.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/diff/__tests__/SplitDiffView.test.tsx
git commit -m "feat(pr-detail/diff): SplitDiffView emits data-line-kind + data-hunk-header for e2e contract"
```

---

## Task 10 — `FilesTab` verification + minor migrations

`FilesTab` mostly composes already-migrated children. This task verifies the composition is clean and migrates the remaining inline UI (loading skeletons, error banner, large-PR warning, empty state).

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/pr-detail/FilesTab.tsx`
- Test: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/FilesTab.test.tsx`

- [ ] **Step 10.1: Read** (398 lines). The relevant lines:
  - Loading skeleton (296–306).
  - Error banner (309–323).
  - Empty state (326–331).
  - Large-PR warning (354–359).

- [ ] **Step 10.2: Update test** — add assertions for the `<Card>` wrappers on each state.

- [ ] **Step 10.3: Migrate**

```tsx
import { Button, Card, Pill } from '@/components/shared/primitives';

// Loading:
return (
  <Card padding="md" className="m-3 space-y-2">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="space-y-1">
        <div className="h-6 w-full rounded bg-[var(--color-surface-raised)] animate-pulse" />
        <div className="h-16 w-full rounded bg-[var(--color-surface-raised)] animate-pulse opacity-50" />
      </div>
    ))}
  </Card>
);

// Error:
return (
  <Card padding="md" className="m-3 text-center">
    <p className="text-xs text-[var(--color-status-red)] mb-2">{error}</p>
    <Button variant="ghost" size="sm" onClick={() => { setError(null); setRetryKey((k) => k + 1); }}>
      Retry
    </Button>
  </Card>
);

// Empty:
return (
  <Card padding="md" className="m-3 text-center">
    <p className="text-xs text-[var(--color-text-muted)]">No files changed in this pull request.</p>
  </Card>
);

// Large-PR warning:
{files.length > 300 && (
  <Card padding="sm" className="m-3 flex items-center gap-2">
    <Pill tone="warning">{files.length} files</Pill>
    <span className="text-[10px] text-[var(--color-status-yellow)]">This PR has {files.length} changed files. Large PRs may be slow.</span>
  </Card>
)}
```

- [ ] **Step 10.4: Run + commit**

```bash
npm test -- --run src/components/pr-detail/__tests__/FilesTab.test.tsx
git add src/BorgDock.Tauri/src/components/pr-detail/FilesTab.tsx \
        src/BorgDock.Tauri/src/components/pr-detail/__tests__/FilesTab.test.tsx
git commit -m "refactor(pr-detail): FilesTab states wrap in Card + Button + Pill primitives"
```

---

## Task 11 — Migrate `review/ClaudeReviewPanel` and `review/ReviewCommentCard`

### 11.1 — `ClaudeReviewPanel`

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/review/ClaudeReviewPanel.tsx`
- Test: `src/BorgDock.Tauri/src/components/review/__tests__/ClaudeReviewPanel.test.tsx`

- [ ] **Step 11.1.1: Read** (106 lines). The group toggle button is at lines 65–91; the count badge is at lines 89–91 and uses `--color-filter-chip-bg/fg` inline.

- [ ] **Step 11.1.2: Update test**

```tsx
it('renders each group with data-review-group', () => {
  const { container } = render(<ClaudeReviewPanel comments={mockComments} />);
  expect(container.querySelector('[data-review-group="critical"]')).toBeInTheDocument();
});

it('renders count as a Chip primitive (no --color-filter-chip-bg reference)', () => {
  const { container } = render(<ClaudeReviewPanel comments={mockComments} />);
  expect(container.querySelector('.bd-chip')).toBeInTheDocument();
  // Ensure the old token reference is gone:
  expect(container.innerHTML).not.toMatch(/var\(--color-filter-chip-bg\)/);
});
```

- [ ] **Step 11.1.3: Migrate**

```tsx
import { Button, Chip } from '@/components/shared/primitives';

// Group toggle (line 65 area):
<Button
  variant="ghost"
  size="sm"
  onClick={() => toggleGroup(severity)}
  data-review-group={severity}
  className="w-full justify-start"
  leading={
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={clsx('transition-transform', isCollapsed ? 'rotate-0' : 'rotate-90')}>
      <path d="m6 4 4 4-4 4" />
    </svg>
  }
>
  <span className="flex-1 text-left">
    {severityLabel(severity)}
  </span>
  <Chip>{count}</Chip>
</Button>
```

- [ ] **Step 11.1.4: Run + commit**

```bash
npm test -- --run src/components/review/__tests__/ClaudeReviewPanel.test.tsx
git add src/BorgDock.Tauri/src/components/review/ClaudeReviewPanel.tsx \
        src/BorgDock.Tauri/src/components/review/__tests__/ClaudeReviewPanel.test.tsx
git commit -m "refactor(review): ClaudeReviewPanel uses Button + Chip (drops --color-filter-chip token consumption)"
```

### 11.2 — `ReviewCommentCard`

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/review/ReviewCommentCard.tsx`
- Test: `src/BorgDock.Tauri/src/components/review/__tests__/ReviewCommentCard.test.tsx`

- [ ] **Step 11.2.1: Read** (50 lines).

- [ ] **Step 11.2.2: Update test**

```tsx
it('emits data-review-card and data-review-severity', () => {
  const { container } = render(<ReviewCommentCard comment={{ ...mockComment, severity: 'critical' }} />);
  const card = container.querySelector('[data-review-card]');
  expect(card).toBeInTheDocument();
  expect(card).toHaveAttribute('data-review-severity', 'critical');
});

it('renders the severity Dot primitive', () => {
  const { container } = render(<ReviewCommentCard comment={{ ...mockComment, severity: 'critical' }} />);
  expect(container.querySelector('.bd-dot')).toBeInTheDocument();
});
```

- [ ] **Step 11.2.3: Migrate**

```tsx
import { Dot, type DotTone } from '@/components/shared/primitives';

function severityDotTone(severity: string): DotTone {
  if (severity === 'critical') return 'red';
  if (severity === 'suggestion') return 'yellow';
  if (severity === 'praise') return 'green';
  return 'gray';
}

// Replace the inline severity dot span with:
<Dot tone={severityDotTone(comment.severity)} size={8} />
```

Add `data-review-card data-review-severity={comment.severity}` to the outer wrapper.

- [ ] **Step 11.2.4: Run + commit**

```bash
npm test -- --run src/components/review/__tests__/ReviewCommentCard.test.tsx
git add src/BorgDock.Tauri/src/components/review/ReviewCommentCard.tsx \
        src/BorgDock.Tauri/src/components/review/__tests__/ReviewCommentCard.test.tsx
git commit -m "refactor(review): ReviewCommentCard uses Dot primitive + adds data-review-* hooks"
```

---

## Task 12 — Migrate `layout/FilterBar` to `Chip` primitive

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/layout/FilterBar.tsx`
- Test: `src/BorgDock.Tauri/src/components/layout/__tests__/FilterBar.test.tsx` (verify exists; create if missing)

- [ ] **Step 12.1: Read** (66 lines).

- [ ] **Step 12.2: Update / write test**

```tsx
// FilterBar.test.tsx
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterBar } from '../FilterBar';

vi.mock('@/stores/pr-store', () => ({
  usePrStore: () => ({
    filter: 'all',
    setFilter: vi.fn(),
    counts: { all: 5, needsReview: 2, mine: 1, failing: 1, ready: 0, review: 0, closed: 0 },
  }),
}));

describe('FilterBar', () => {
  it('renders one Chip per filter key', () => {
    const { container } = render(<FilterBar />);
    expect(container.querySelectorAll('[data-filter-chip]').length).toBeGreaterThanOrEqual(5);
  });

  it('marks the active filter with data-filter-active="true"', () => {
    const { container } = render(<FilterBar />);
    expect(container.querySelector('[data-filter-chip][data-filter-active="true"]')).toBeInTheDocument();
  });

  it('uses Chip primitive (no --color-filter-chip-bg token reference)', () => {
    const { container } = render(<FilterBar />);
    expect(container.querySelector('.bd-chip')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/var\(--color-filter-chip-bg\)/);
  });
});
```

- [ ] **Step 12.3: Migrate**

```tsx
import { Chip } from '@/components/shared/primitives';
import { usePrStore } from '@/stores/pr-store';

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'needsReview', label: 'Needs Review' },
  { key: 'mine', label: 'Mine' },
  { key: 'failing', label: 'Failing' },
  { key: 'ready', label: 'Ready' },
  { key: 'review', label: 'Review' },
  { key: 'closed', label: 'Closed' },
];

export function FilterBar() {
  const { filter, setFilter, counts } = usePrStore();
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-[var(--color-separator)]">
      {FILTERS.map((f) => {
        const isActive = filter === f.key;
        const count = counts[f.key as keyof typeof counts];
        return (
          <Chip
            key={f.key}
            active={isActive}
            count={count > 0 ? count : undefined}
            onClick={() => setFilter(f.key)}
            data-filter-chip
            data-filter-key={f.key}
            data-filter-active={isActive ? 'true' : 'false'}
          >
            {f.label}
          </Chip>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 12.4: Run + commit**

```bash
npm test -- --run src/components/layout/__tests__/FilterBar.test.tsx
git add src/BorgDock.Tauri/src/components/layout/FilterBar.tsx \
        src/BorgDock.Tauri/src/components/layout/__tests__/FilterBar.test.tsx
git commit -m "refactor(layout): FilterBar uses Chip primitive (drops --color-filter-chip-* JSX consumers)"
```

---

## Task 13 — Fix unhandled `invoke()` rejections in `WorkItemDetailApp` and `FlyoutApp`

The PR #3 vitest full-suite shows ~8 unhandled rejections. Cluster A is fixed in Task 6 (PRDetailApp). Clusters B and C live in `WorkItemDetailApp.tsx` and `FlyoutApp.tsx` — both call `invoke()` in `useEffect`s without a cancelled-flag guard, so a `setState` after unmount fires the rejection.

The fix is the same shape as Task 6: add `let cancelled = false`, gate every `setState` inside the IIFE on `if (cancelled) return;`, return a cleanup that sets `cancelled = true`.

### 13.1 — `WorkItemDetailApp` (Cluster B)

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.tsx`
- Test (new): `src/BorgDock.Tauri/src/components/work-items/__tests__/WorkItemDetailApp.invoke-cancellation.test.tsx`

- [ ] **Step 13.1.1: Read** the file. Identify the `useEffect` at lines ~251–321 that calls `invoke<AppSettings>('load_settings')`.

- [ ] **Step 13.1.2: Write the cancellation test**

```tsx
// WorkItemDetailApp.invoke-cancellation.test.tsx
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { WorkItemDetailApp } from '../WorkItemDetailApp';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: { setState: vi.fn(), getState: () => ({ settings: { azureDevOps: {} } }) },
}));

describe('WorkItemDetailApp invoke() cancellation', () => {
  it('does not call setState after unmount when invoke resolves late', async () => {
    let resolveSettings: (s: any) => void = () => {};
    const settingsPromise = new Promise((r) => { resolveSettings = r; });
    vi.mocked(invoke).mockImplementation(((cmd: string) => {
      if (cmd === 'load_settings') return settingsPromise;
      return Promise.resolve(null);
    }) as any);
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<WorkItemDetailApp />);
    unmount();
    resolveSettings({ azureDevOps: { organization: 'o', project: 'p' } });
    await new Promise((r) => setTimeout(r, 50));
    expect(consoleErrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('not wrapped in act'),
    );
    consoleErrSpy.mockRestore();
  });
});
```

- [ ] **Step 13.1.3: Apply the fix**

In `WorkItemDetailApp.tsx`, in the `useEffect` at ~251:

```tsx
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      if (cancelled) return;
      setAdoSettings(settings.azureDevOps);
      useSettingsStore.setState({ settings, isLoading: false });
      // ... rest of the existing async work, gated likewise ...
    } catch (err) {
      if (cancelled) return;
      console.error('Failed to load work item:', err);
      setError('Failed to load work item');
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, [workItemId]);
```

- [ ] **Step 13.1.4: Run + commit**

```bash
npm test -- --run src/components/work-items/__tests__/WorkItemDetailApp.invoke-cancellation.test.tsx
git add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.tsx \
        src/BorgDock.Tauri/src/components/work-items/__tests__/WorkItemDetailApp.invoke-cancellation.test.tsx
git commit -m "fix(work-items): cancelled-flag guard on WorkItemDetailApp invoke() effect (resolves PR #3 rejections cluster B)"
```

### 13.2 — `FlyoutApp` (Cluster C)

**Files:**

- Modify: `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx`
- Test (new): `src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutApp.invoke-cancellation.test.tsx`

- [ ] **Step 13.2.1: Read** the file. There are two effects to fix:
  - Lines ~46–73: `invoke('get_flyout_data')` + `listen()` setup; `setData(parsed)` can fire after unmount.
  - Lines ~135–150: `blur` listener that calls `invoke('hide_flyout')` + `dispatch({ type: 'close' })`; both can fire after unmount.

- [ ] **Step 13.2.2: Write the cancellation tests**

```tsx
// FlyoutApp.invoke-cancellation.test.tsx
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlyoutApp } from '../FlyoutApp';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

describe('FlyoutApp invoke() cancellation', () => {
  it('does not setState after unmount when get_flyout_data resolves late', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<FlyoutApp />);
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(consoleErrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('not wrapped in act'),
    );
    consoleErrSpy.mockRestore();
  });

  it('does not dispatch close after unmount on blur', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<FlyoutApp />);
    // simulate blur immediately before unmount
    window.dispatchEvent(new Event('blur'));
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(consoleErrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('not wrapped in act'),
    );
    consoleErrSpy.mockRestore();
  });
});
```

- [ ] **Step 13.2.3: Apply the fixes**

Effect 1 (lines ~46–73):

```tsx
useEffect(() => {
  let cancelled = false;
  let unlisten: (() => void) | undefined;
  (async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const cached = await invoke<string | null>('get_flyout_data');
      if (cancelled) return;
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as FlyoutData;
          hasReceivedData.current = true;
          setData(parsed);
          if (parsed.theme) applyTheme(parsed.theme);
        } catch {
          /* ignore parse errors */
        }
      }
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<FlyoutData>('flyout-update', (event) => {
        if (cancelled) return;
        hasReceivedData.current = true;
        setData(event.payload);
        if (event.payload.theme) applyTheme(event.payload.theme);
      });
    } catch (err) {
      if (cancelled) return;
      console.error('[Flyout] Failed to initialize:', err);
    }
  })();
  return () => {
    cancelled = true;
    unlisten?.();
  };
}, []);
```

Effect 2 (lines ~135–150):

```tsx
useEffect(() => {
  let cancelled = false;
  const hide = async () => {
    if (cancelled) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('hide_flyout');
    } catch {
      /* ignore */
    }
    if (!cancelled) dispatch({ type: 'close' });
  };
  window.addEventListener('blur', hide);
  return () => {
    cancelled = true;
    window.removeEventListener('blur', hide);
  };
}, []);
```

- [ ] **Step 13.2.4: Run + commit**

```bash
npm test -- --run src/components/flyout/__tests__/FlyoutApp.invoke-cancellation.test.tsx
git add src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx \
        src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutApp.invoke-cancellation.test.tsx
git commit -m "fix(flyout): cancelled-flag guard on FlyoutApp init + blur effects (resolves PR #3 rejections cluster C)"
```

### 13.3 — Verify all rejections are gone

- [ ] **Step 13.3.1: Run the full vitest suite and count unhandled rejections**

```bash
cd src/BorgDock.Tauri
npm test -- --run 2>&1 | grep -ciE "unhandled (rejection|error)"
```

Expected: `0`. If non-zero, the remaining rejection traces will be visible in the prior `npm test -- --run` output — read the stack and add a fourth cluster fix to this task.

If the count is `0`, the dispatch's "8 unhandled invoke() rejections" requirement is satisfied. Move on.

---

## Task 14 — Delete orphaned per-feature CSS

After Tasks 3, 4, 6, the `.checks-*`, `.merge-celebration*`, `.merge-checkmark`, and `.comment-card-enter` classes have no more JSX consumers in scope. Delete them from `index.css`.

**Files:**

- Modify: `src/BorgDock.Tauri/src/styles/index.css`

- [ ] **Step 14.1: Verify orphan status — `grep` for each prefix**

```bash
cd src/BorgDock.Tauri

# Should now return ZERO matches in src/components/:
grep -rn "checks-\|merge-celebration\|merge-checkmark\|comment-card-enter" src/components/ | grep -v "__tests__" | grep -v "\.test\."
```

Expected: empty (the classes have no remaining consumer JSX in the migrated tree). If matches appear:

- A migration in Task 3 / Task 4 / Task 4 missed a className. Open the offending file and remove the className (the styling now comes from primitives + Tailwind).
- A test still mounts something that pulls a `<div className="merge-celebration*">`. That's a stale assertion — update or remove.

Re-run the grep until it returns empty.

- [ ] **Step 14.2: Migrate `MergeCelebration` inline**

`MergeCelebration` (the helper at the bottom of `OverviewTab.tsx`) is the one place the `.merge-celebration*` classes still serve a purpose — the success animation. Inline its styling:

```tsx
function MergeCelebration({ prNumber, title }: { prNumber: number; title: string }) {
  return (
    <Card padding="lg" className="text-center my-3 animate-[fadeSlideIn_0.3s_ease-out]" data-merge-celebration>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-2">
        <circle cx="20" cy="20" r="19" stroke="var(--color-status-green)" strokeWidth="2" fill="var(--color-action-success-bg)" />
        <path d="M12 20.5l5.5 5.5L28 15" stroke="var(--color-status-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-[checkmark_0.4s_ease-out]" />
      </svg>
      <div className="text-sm font-semibold text-[var(--color-text-primary)]">PR #{prNumber} merged!</div>
      <div className="text-xs text-[var(--color-text-secondary)]">{title}</div>
    </Card>
  );
}
```

(The `@keyframes checkmark` and `fadeSlideIn` keyframes stay in `index.css` — only the `.merge-celebration*` class definitions are deleted, not the keyframes themselves. Move the inline `animation: ...` references onto Tailwind-shorthand `animate-[checkmark_...]` instead.)

Commit this small migration before deleting the CSS:

```bash
git add src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx
git commit -m "refactor(pr-detail): MergeCelebration uses Card primitive + inline animation classes"
```

- [ ] **Step 14.3: Delete the CSS blocks**

In `src/BorgDock.Tauri/src/styles/index.css`, delete:

- The `.checks-*` block (lines ~1528–1753 — verify exact range with `grep -n "^\s*\.checks-" src/BorgDock.Tauri/src/styles/index.css | head -2` and `tail -2`).
- The `.merge-celebration`, `.merge-celebration-inner`, `.merge-celebration-icon`, `.merge-celebration-title`, `.merge-celebration-subtitle` selectors (lines ~1416–1458).
- The `.merge-checkmark` selector (line ~1446 area).
- The `.comment-card-enter` selector (line ~1408).

KEEP the `@keyframes checkmark` and `@keyframes fadeSlideIn` blocks (they're consumed by the inline `animate-[...]` class in `MergeCelebration` after Step 14.2).

- [ ] **Step 14.4: Verify the deletions don't break the app**

```bash
cd src/BorgDock.Tauri
npm test -- --run
```

Expected: 2551+ tests still pass.

```bash
npm run dev  # smoke test in browser if available
```

(Skip if not on the executor's machine or if the dev server can't run; the vitest sweep is the primary gate.)

- [ ] **Step 14.5: Commit**

```bash
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "chore(styles): drop .checks-*, .merge-celebration*, .comment-card-enter — orphaned by PR #4"
```

- [ ] **Step 14.6: Final grep confirmation**

```bash
grep -nE "^\s*\.(checks-|merge-celebration|merge-checkmark|comment-card-enter)" src/BorgDock.Tauri/src/styles/index.css
```

Expected: empty.

---

## Task 15 — Run the full e2e gate (behavioral + diff-viewer + a11y)

After Tasks 1–14, every required `data-*` attribute is in place; the migration is functionally complete. Confirm by running the affected Playwright specs.

- [ ] **Step 15.1: Run pr-detail.spec.ts and diff-viewer.spec.ts**

```bash
cd src/BorgDock.Tauri
npm run test:e2e -- --project=webview-mac \
  tests/e2e/pr-detail.spec.ts \
  tests/e2e/diff-viewer.spec.ts
```

Expected: both specs green. Common failure modes if not:

- `[data-pr-card]` count mismatch → fixture drift; verify `seedDesignFixturesIfAvailable` actually seeds 9 PRs (design-fixtures.ts).
- `getByRole('button', { name: 'Open in Browser' })` fails → Task 4's Action bar didn't preserve the exact button label; fix the label string.
- `[data-diff-file]` not found → Task 8.1 didn't add the attribute on the `DiffFileSection` outer.
- `[data-diff-stat="added"]` text mismatch → the stat is rendered as `+135` but the test expects a number-only match; verify the regex `/\d+/` captures it.
- `[data-hunk-header]` `toContainText('@@')` fails → Task 9 missed the hunk-header element in either Unified or Split view.
- `[data-line-kind="add"]` not found → Task 9 missed the line element.
- `[data-action="next-hunk"]` click does not change `window.scrollY` → the `handleNextHunk` in Task 8.1 didn't call `scrollIntoView`; verify the implementation.
- `expectNoA11yViolations` reports a contrast issue → check the new `IconButton` / `Pill` / `Chip` color combinations against `surface-hover` / `accent-subtle` backgrounds. Fix by adjusting the className override only on the offending consumer; don't touch primitives.

- [ ] **Step 15.2: Run the previous-stack behavioral specs to ensure no regression**

```bash
npm run test:e2e -- --project=webview-mac \
  tests/e2e/focus.spec.ts \
  tests/e2e/flyout.spec.ts \
  tests/e2e/work-items.spec.ts \
  tests/e2e/pr-list.spec.ts \
  tests/e2e/motion.spec.ts
```

Expected: same green state as PR #3 baseline. The cancelled-flag fix in Task 13 should NOT change behavior — only suppress noise.

- [ ] **Step 15.3: Run the visual.spec.ts for the four migrated surfaces (best-effort)**

```bash
npm run test:e2e -- --project=webview-mac \
  tests/e2e/visual.spec.ts \
  --grep="pr-detail|diff|review|filter-bar"
```

Expected: visual baselines start matching where the seed/route already wires up. Some surfaces will remain red (the `clipTo` infra gap from PR #3 — out of scope). Document any surface that ALREADY had a working baseline pre-PR-#4 and now diffs > 4% — that's a regression and must be fixed in this PR. Surfaces that were ALREADY red in PR #3's baseline stay red — that's the documented infra gap, not a regression.

- [ ] **Step 15.4: Commit any visual-tolerances adjustments**

If a surface diffs at 5–8% (above the default 4%) and the diff is purely sub-pixel anti-aliasing, add a tolerance entry:

```ts
// src/BorgDock.Tauri/tests/e2e/visual-tolerances.ts
export const VISUAL_TOLERANCES = {
  ...
  'pr-detail-overview-light': 0.06, // sub-pixel font rendering between WebView2 and prototype Chromium
};
```

Commit only if needed:

```bash
git add src/BorgDock.Tauri/tests/e2e/visual-tolerances.ts
git commit -m "test(visual): add per-surface tolerances for PR #4 surfaces"
```

---

## Task 16 — Run the full vitest suite

- [ ] **Step 16.1: Full pass**

```bash
cd src/BorgDock.Tauri
npm test -- --run 2>&1 | tail -20
```

Expected:
- Pass count: ≥ 2551 (PR #3 baseline) + the new tests added in Tasks 1, 6, 13.
- Failure count: 0.
- Unhandled rejection count: 0.

Capture the exact pass count for the PR description.

- [ ] **Step 16.2: Final unhandled-rejection check**

```bash
npm test -- --run 2>&1 | grep -ciE "unhandled (rejection|error)"
```

Expected: `0`. If non-zero, the missing fix lives somewhere not yet covered — investigate per the same approach as Task 13 (find the offending `useEffect`, add cancelled-flag).

---

## Task 17 — Update spec Delivery Ledger

- [ ] **Step 17.1: Edit `docs/superpowers/specs/2026-04-24-shared-components-design.md`**

Update the Delivery Ledger row for PR #4 (currently: `| #4 | feat/streamline-04-pr-detail | Planned | — | — | — |`) to:

```markdown
| #4 | `feat/streamline-04-pr-detail` | In review | — | 2026-04-25 | PR detail surfaces migration: every consumer in `components/pr-detail/**` (Overview, Checks, Files, Reviews, Commits, Comments, MergeReadinessChecklist, LinkedWorkItemBadge, CheckoutFlow, PRDetailApp, PRDetailPanel) and `components/review/**` (ClaudeReviewPanel, ReviewCommentCard) migrated onto PR #1 primitives (Avatar, Button, Card, Chip, Dot, IconButton, Input, LinearProgress, Pill). `components/pr-detail/diff/{DiffToolbar,DiffFileSection,DiffFileTree}` chrome migrated; diff-line rendering (`UnifiedDiffView`, `SplitDiffView`, `DiffLineContent`) untouched apart from `data-line-kind` + `data-hunk-header` instrumentation. `components/layout/FilterBar.tsx` migrated to `Chip`, dropping the in-scope JSX consumers of `--color-filter-chip-bg/fg` (tokens themselves remain pending PR #6). Test-contract `data-*` hooks added (`data-diff-file`, `data-diff-stat="added"|"deleted"`, `data-hunk-header`, `data-line-kind="add"|"del"|"context"`, `data-action="next-hunk"|"prev-hunk"`, `data-overview-action`, `data-branch-pill`, `data-check-row`, `data-check-state`, `data-check-count`, `data-comment-card`, `data-bot-pill`, `data-review-card`, `data-review-severity`, `data-review-group`, `data-merge-score`, `data-linked-work-item`, `data-commit-sha`, `data-checkout-stage`, `data-checkout-action`, `data-worktree-row`, `data-worktree-slot`, `data-diff-toolbar`, `data-diff-view-mode`, `data-diff-filter`, `data-file-tree-row`, `data-file-tree-toggle`, `data-pr-detail-close`, `data-pr-detail-panel-close`, `data-pr-detail-panel-popout`, `data-filter-chip`, `data-filter-key`, `data-filter-active`, `data-merge-celebration`, `data-checks-tab`, `data-sort-mode`). Per-surface `pr-detail/`-scoped CSS deleted: `.checks-*` (~226 lines), `.merge-celebration*` + `.merge-checkmark` (~46 lines), `.comment-card-enter` (~6 lines). PR #3-flagged 8 cross-test unhandled `invoke()` rejections fixed via `let cancelled = false` mounted-flag guard in `PRDetailApp`, `WorkItemDetailApp`, `FlyoutApp` async effects. Vitest passes (2551+ tests + new). `pr-detail.spec.ts` + `diff-viewer.spec.ts` behavioral + a11y green. Visual baselines begin flipping green for the migrated surfaces (the `clipTo` infra gap remains out of scope for surface PRs). Opened as stacked PR against `feat/streamline-03-pr-surfaces` — <PR_URL_HERE>. |
```

(Replace `<PR_URL_HERE>` with the URL `gh pr create` returns in Task 17. The "2026-04-25" date should match the day Task 17 runs — replace if different.)

- [ ] **Step 17.2: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): mark PR #4 as in review"
```

---

## Task 18 — Open the PR

The user's `gh` is on the enterprise account by default (`KvanderBorght_gomocha`). Switch to `borght-dev` for the personal repo, open the PR, then switch back. CLAUDE.md `# GITHUB CLI ACCOUNTS` documents the rule.

- [ ] **Step 18.1: Push the branch**

```bash
cd ~/projects/borgdock-streamline-04
gh auth switch --user borght-dev
git push -u origin feat/streamline-04-pr-detail
```

If the push fails with a credential error, double-check with `gh auth status` that `borght-dev` is the active account.

- [ ] **Step 18.2: Open the PR**

```bash
gh pr create \
  --repo borght-dev/BorgDock \
  --base feat/streamline-03-pr-surfaces \
  --head feat/streamline-04-pr-detail \
  --title "Streamline PR #4 — PR detail surfaces" \
  --body "$(cat <<'EOF'
## Summary
- Migrates every consumer in `components/pr-detail/**` (Overview, Checks, Files, Reviews, Commits, Comments, MergeReadinessChecklist, LinkedWorkItemBadge, CheckoutFlow, PRDetailApp, PRDetailPanel) and `components/review/**` (ClaudeReviewPanel, ReviewCommentCard) to the PR #1 primitives (`Avatar`, `Button`, `Card`, `Chip`, `Dot`, `IconButton`, `Input`, `LinearProgress`, `Pill`).
- Migrates `components/pr-detail/diff/{DiffToolbar,DiffFileSection,DiffFileTree}` chrome to primitives. The diff-line rendering (`UnifiedDiffView`, `SplitDiffView`, `DiffLineContent`) is untouched apart from `data-line-kind` + `data-hunk-header` instrumentation for the e2e contract.
- Migrates `components/layout/FilterBar.tsx` to `Chip`, dropping the in-scope JSX consumers of `--color-filter-chip-bg/fg`. The token definitions themselves remain in `index.css` (still consumed by `settings/**` and `worktree-palette.css`, both out of scope).
- Adds the test-contract `data-*` hooks the existing `pr-detail.spec.ts` and `diff-viewer.spec.ts` behavioral specs assert on (`data-diff-file`, `data-diff-stat="added"|"deleted"`, `data-hunk-header`, `data-line-kind="add"|"del"|"context"`, `data-action="next-hunk"|"prev-hunk"`, plus 30+ migration-specific data hooks).
- Adds prev/next-hunk `IconButton`s on each `DiffFileSection` header (with `n` / `p` keyboard shortcuts).
- Fixes the 8 cross-test unhandled `invoke()` rejections PR #3 flagged: `PRDetailApp`, `WorkItemDetailApp`, `FlyoutApp` async effects gain `let cancelled = false` + cancelled-flag guards on every `setState` call inside the IIFE.
- Deletes the now-orphaned per-feature CSS in `src/styles/index.css`: `.checks-*` (~226 lines), `.merge-celebration*` + `.merge-checkmark` (~46 lines), `.comment-card-enter` (~6 lines). The keyframes (`checkmark`, `fadeSlideIn`) stay — `MergeCelebration` now uses them via Tailwind `animate-[...]`.

Stacks on PR #3 (`feat/streamline-03-pr-surfaces`).

## Test plan
- [x] `npm test -- --run` (vitest, full suite — 2551+ tests green; unhandled-rejection count = 0)
- [x] `npm run test:e2e -- --project=webview-mac tests/e2e/pr-detail.spec.ts tests/e2e/diff-viewer.spec.ts`
- [x] `npm run test:e2e -- --project=webview-mac tests/e2e/{focus,flyout,work-items,pr-list,motion}.spec.ts` (no regression vs PR #3 baseline)
- [x] `npm run test:e2e -- --project=webview-mac tests/e2e/visual.spec.ts --grep="pr-detail|diff|review|filter-bar"` (visual baselines flipping green where the seed/route already wires up; the documented `clipTo` infra gap remains out of scope)
- [ ] CI runs `webview-win` project (post-merge automatic)

## Spec coverage (PR #4 row, §8)
- [x] Migrate `components/pr-detail/**` (Overview + Checks + Files + Reviews + Commits + Comments) onto primitives.
- [x] `components/review/**` swap.
- [x] `pr-detail/diff/*` chrome (toolbar, file header, line gutter / file tree) adopts primitives; diff-line rendering unchanged apart from `data-*` instrumentation.
- [x] Per-surface CSS in `pr-detail/` deleted (`.checks-*`, `.merge-celebration*`, `.comment-card-enter`).
- [x] `components/layout/FilterBar.tsx` migrated to `Chip` (the carry-over from spec §8 PR #3 row).
- [x] PR #3-flagged 8 cross-test unhandled `invoke()` rejections fixed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the printed PR URL.

- [ ] **Step 18.3: Switch back to enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status
# Expected: Active account: KvanderBorght_gomocha
```

- [ ] **Step 18.4: Append the PR URL to the spec ledger**

The Task 17 cell currently reads `... — <PR_URL_HERE>.` Edit the placeholder with the real URL:

```bash
cd ~/projects/borgdock-streamline-04
# Edit docs/superpowers/specs/2026-04-24-shared-components-design.md row #4 — replace <PR_URL_HERE> with the actual URL from Step 18.2.
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): add PR #4 URL to PR #4 ledger row"
git push origin feat/streamline-04-pr-detail
```

---

## Self-Review (engineer's checklist after writing the plan)

- **Spec coverage:** PR #4 row §8 has four bullets — migrate `pr-detail/**` to primitives ✓ (Tasks 1–10); `review/**` swap ✓ (Task 11); `pr-detail/diff/*` chrome to primitives + diff-line rendering unchanged ✓ (Tasks 7–10, with Task 9 limited to attribute additions); per-surface CSS deletion ✓ (Task 14). The dispatch-added `FilterBar` migration ✓ (Task 12). The dispatch-added invoke rejection fix ✓ (Task 6 + Task 13).
- **Behavioral contracts:** `pr-detail.spec.ts` + `diff-viewer.spec.ts` named in Task 15 with the data-* hooks they need (`data-pr-card`, `data-diff-file`, `data-diff-stat="added"|"deleted"`, `data-hunk-header`, `data-line-kind`, `data-action="next-hunk"`). Tasks 8 + 9 ADD the missing attributes; Task 8 adds the prev/next-hunk buttons.
- **a11y:** Task 15 runs `expectNoA11yViolations` via the helper; the diff-viewer.spec.ts already calls it.
- **Visual baselines:** Task 15.3 names the visual sweep; the `clipTo` infra gap is documented as out of scope.
- **No placeholders:** every code block contains the actual code; no "// TODO" / "implement later" / "similar to TaskN" — Tasks 13.1 and 13.2 repeat the cancellation-flag pattern explicitly so each component fix stands alone.
- **Frequent commits:** every step ends in `git commit -m`; smallest commit unit is one component migration; biggest is `CheckoutFlow` (warranted given its 838-line scope).
- **TDD:** tasks creating new test files (Tasks 1.1, 1.2, 1.3, 6.1, 13.1, 13.2) write the failing test before the implementation; subsequent component migrations update existing tests in the same commit.
- **Reversibility:** every step is an Edit / Write under the worktree; nothing is destructive. Task 14's CSS deletion is reversible via `git revert` if a class turns out to still be needed.
- **Type / method consistency:** the plan uses `cancelled` (lowercase) consistently across Tasks 6, 13.1, 13.2; `data-pill-tone` matches PR #3's casing; `Pill` / `Chip` / `Card` / `IconButton` props match the primitive index from PR #1.
- **Test-contract data-attribute set:** the union of new attributes is documented in the Task 17 ledger row so future stack PRs can reference the contract.

---

## Risks / known unknowns

1. **`Button` variant vocabulary doesn't cover "purple-soft" / "dashed-danger" / "danger-outline" / "primary-green-solid".** OverviewTab's action bar has these bespoke treatments. Plan keeps them as `variant="ghost" | "danger" | "primary"` with className overrides. The visual diff vs the design canvas may exceed the 4% tolerance for the action bar — accept and document, or push the variants up to `Button` in a future PR. The decision in PR #4 is to ship the migration with className overrides.
2. **`Input` is single-line; OverviewTab review body, OverviewTab comment hint, and CommentsTab new-comment box use `<textarea>`.** All three keep the native `<textarea>` element. A future `Textarea` primitive belongs in a separate PR.
3. **`<select>` is not a primitive; DiffToolbar commit selector and OverviewTab review-event picker keep native `<select>`.** Consistent with PR #2's pattern.
4. **`data-action="next-hunk"` requires new prev/next-hunk buttons on each `DiffFileSection`.** This adds a UI element the design canvas may not show explicitly. The design's diff-toolbar mockup has a chevron cluster — the buttons land in that visual slot. If the design canvas doesn't have hunk-nav, the visual.spec.ts diff for the diff-file header will be > 4% and we add a tolerance entry. Acceptable; the e2e contract is more important than pixel-fidelity here.
5. **`MergeReadinessChecklist`'s segmented progress bar collapses to a single-tone `LinearProgress`.** A small visual diff. Documented inline.
6. **`CommentsTab`'s deterministic per-author color hash collapses to `Avatar tone="them"` for everyone.** Eliminates the rainbow-stripe effect. Visual diff acceptable; the test fixtures already use ~3 authors so the diff is small.
7. **The 8 unhandled rejection count is approximate.** PR #3's note said "8" but the executor should rely on the actual count surfaced by `npm test -- --run 2>&1 | grep -ciE "unhandled (rejection|error)"`. If only 5 surface, fix all 5; if 12 surface, find the additional clusters and apply the same pattern.
8. **`diff-viewer.spec.ts` may be currently red because the data-* attributes don't exist.** Prereq 7 captures the baseline. After Tasks 8 + 9, every assertion the spec makes should resolve. If a specific assertion still fails (e.g. `getComputedStyle().backgroundColor` differs), the cause is most likely the diff-line rendering color tokens — out of scope for migration; document and tolerate.
9. **`--color-filter-chip-bg/fg` tokens stay in `index.css`.** Still consumed by `settings/**` (PR #6 scope) and `worktree-palette.css` (PR #5 scope). Token deletion is NOT a PR #4 deliverable; only the in-scope JSX consumers go away.
10. **`CheckoutFlow` is 838 lines and the trickiest to migrate.** The wizard's stage state machine + worktree-list logic must NOT change. Read the file three times before editing; commit per stage if needed (split Task 5 into 5.1 picker, 5.2 form, 5.3 running, 5.4 done if the executor wants finer-grained checkpoints).
11. **The new `data-*` instrumentation on `UnifiedDiffView` and `SplitDiffView` is the closest the migration comes to "touching diff-line rendering".** The dispatch said line rendering stays untouched; pure attribute additions are interpreted as instrumentation, not rendering changes. If a code reviewer pushes back, an alternative is to refactor the data-attribute injection into a wrapper component — but that's needlessly more complex; the inline addition is correct.
