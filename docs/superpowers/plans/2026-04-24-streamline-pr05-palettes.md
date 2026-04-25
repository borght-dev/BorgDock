# Streamline PR #5 — Palettes + Viewers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every consumer in `components/file-palette/**`, `components/file-viewer/**`, `components/command-palette/**`, `components/worktree-palette/**`, `components/worktree/**`, and `components/sql/**` onto the PR #1 primitives, add the test-contract `data-*` hooks the existing PR #0 e2e specs assert on (where the surface naturally supports them — aspirational tests requiring NEW infra stay flagged as pre-existing gaps), delete the three per-feature CSS files (`styles/file-palette.css`, `styles/worktree-palette.css`, `styles/file-viewer.css`) plus the co-located `components/file-palette/CodeView.css`, move residual layout into `@layer components` in `index.css` under a small set of `bd-fp-*` / `bd-fv-*` / `bd-wt-*` / `bd-code-*` / `bd-sql-*` namespaced classes, and remove the last in-scope `--color-filter-chip-bg` consumer outside `settings/**` (settings stays for PR #6 to tear out the token itself).

**Architecture:** PR #5 is a pure migration PR — no new domain features, no Rust changes. Every migrated file replaces ad-hoc styled `<button>` / `<input>` / `<span>` / `<div>` chrome with the matching primitive (`Button`, `IconButton`, `Pill`, `Chip`, `Dot`, `Card`, `Input`, `LinearProgress`, `Kbd`) imported from `@/components/shared/primitives`. The syntax-highlighting renderer in `CodeView.tsx` (web-tree-sitter wired through `useSyntaxHighlight` / `getHighlightClass`) stays untouched — only the surrounding `.code-view` / `.code-line-row` / `.code-line-number` / `.code-line-text` chrome moves into `@layer components` so the per-component `CodeView.css` can be deleted along with the `styles/file-palette.css`, `styles/worktree-palette.css`, and `styles/file-viewer.css` files. Where existing components naturally already render the right shape but lack the test-contract `data-*` hook, we add the attribute inline (PR #4's pattern: `data-diff-file`, `data-action="next-hunk"`). Where a PR #0 spec asserts on infrastructure or behavior that doesn't yet exist (a generic Cmd+K command palette with `[data-command-palette]`; per-row `[data-action="prune"]` / `[data-action="checkout"]` on the worktree palette; the spec's `data-flyout="settings"`-on-Enter behavior), we **do not** invent the missing infra in this PR — that's feature work, not migration. We document the gap, leave the spec as it is, and capture the pre-vs-post baseline so PR #5 isn't blamed for regressions it didn't cause.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 `@theme`, Vitest + Testing Library (jsdom) for unit tests, Playwright (`webview-mac` / `webview-win` projects) for behavioral + visual + a11y regression. Primitives at `src/BorgDock.Tauri/src/components/shared/primitives/` (locked, PR #1). Chrome composed components at `src/BorgDock.Tauri/src/components/shared/chrome/` (locked, PR #2). Work happens in worktree `~/projects/borgdock-streamline-05` on branch `feat/streamline-05-palettes`, stacked on `feat/streamline-04-pr-detail`.

---

## Scope notes — what this PR does and does NOT touch

**In scope (per spec §8 PR #5 row + the dispatch instructions):**

- All files under `src/BorgDock.Tauri/src/components/command-palette/**` — `CommandPalette.tsx` (the work-item-search palette toggled by `useUiStore.isCommandPaletteOpen`), `PaletteApp.tsx` (the standalone palette window mounted by `palette-main.tsx`), and the standalone `PaletteRow.tsx`.
- All files under `src/BorgDock.Tauri/src/components/file-palette/**` — `FilePaletteApp.tsx`, `RootsColumn.tsx`, `SearchPane.tsx`, `ResultsList.tsx`, `PreviewPane.tsx`, `ChangesSection.tsx`, `CodeView.tsx`. The `parse-query.ts`, `join-path.ts`, `queries/`, and `use-*` hook files have no JSX and stay untouched.
- All files under `src/BorgDock.Tauri/src/components/file-viewer/**` — `FileViewerApp.tsx`, `FileViewerToolbar.tsx`. (`types.ts` has no JSX.)
- `src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.tsx` — the entire 696-line file, including the inline `WorktreeRow` sub-component.
- `src/BorgDock.Tauri/src/components/worktree/WorktreePruneDialog.tsx` — 358-line modal mounted from the settings flyout.
- `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx` and `src/BorgDock.Tauri/src/components/sql/ResultsTable.tsx`.
- `src/BorgDock.Tauri/src/styles/index.css` — append residual layout into `@layer components` under namespaced classes (`bd-fp-*`, `bd-fv-*`, `bd-wt-*`, `bd-code-*`, `bd-sql-*`), then delete the three per-feature CSS files in scope.
- `src/BorgDock.Tauri/src/styles/file-palette.css` — DELETED.
- `src/BorgDock.Tauri/src/styles/file-viewer.css` — DELETED.
- `src/BorgDock.Tauri/src/styles/worktree-palette.css` — DELETED.
- `src/BorgDock.Tauri/src/components/file-palette/CodeView.css` — DELETED. (Spec §4.2 says "no per-feature .css files remain" after PR #5; this co-located file qualifies.)
- `src/BorgDock.Tauri/src/file-palette-main.tsx` — drop the `import './styles/file-palette.css';` line.
- `src/BorgDock.Tauri/src/file-viewer-main.tsx` — drop the `import './styles/file-viewer.css';` line.
- `WorktreePaletteApp.tsx` — drop the `import '@/styles/worktree-palette.css';` line.
- `CodeView.tsx` — drop the `import './CodeView.css';` line.
- `docs/superpowers/specs/2026-04-24-shared-components-design.md` — Delivery Ledger row for PR #5.

**Out of scope (deferred to later PRs in the stack):**

- The Rust backend for the new Worktree Changes feature (§6 of the spec). That's PR #7.
- The settings pages' consumption of `--color-filter-chip-bg` / `--color-filter-chip-fg`. PR #6 owns the settings migration AND the deletion of the tokens themselves. PR #5 only removes the `worktree-palette.css:297` reference.
- Building a generic `Cmd+K` command palette with `[data-command-palette]` + `[data-command-item]` + a "Settings" command that opens `[data-flyout="settings"]`. That's a NEW feature, not a migration. The current `command-palette/CommandPalette.tsx` is a numeric-ID work-item search palette, not a generic command palette. The PR #0 e2e spec `command-palette.spec.ts` was written aspirationally and is currently red — it stays red after this PR. We capture the pre-vs-post state so the regression check doesn't false-flag us. (The actual generic command palette belongs in PR #6 ancillary or a dedicated palette PR; out of PR #5 scope.)
- Adding per-row `[data-action="prune"]` and `[data-action="checkout"]` actions to the worktree palette. The current `WorktreePaletteApp` rows expose terminal/folder/editor actions, not prune/checkout — those are global actions in `WorktreePruneDialog` (settings flyout) and the per-PR `CheckoutFlow` (PR detail). The PR #0 spec `worktree-palette.spec.ts` was written aspirationally for behavior the surface doesn't support; it stays red. Same documentation rule as command-palette.
- The Worktree Changes feature integration into the worktree palette as a new tab (§6.2). That's PR #7.
- `tests/e2e/visual.spec.ts`'s `clipTo` selectors + URL-routed deep-links infra gap. Per PR #3's note in the ledger, that gap belongs to a dedicated test-infra PR, not any individual surface PR. Visual baselines for PR #5's surfaces will start flipping green where the seed/route already wires up; some will remain red and that's expected.

**The per-feature CSS deletion in spec §8** maps to a verify-then-delete step for these four files only:

- `src/BorgDock.Tauri/src/styles/file-palette.css` (~413 lines)
- `src/BorgDock.Tauri/src/styles/file-viewer.css` (~93 lines)
- `src/BorgDock.Tauri/src/styles/worktree-palette.css` (~550 lines)
- `src/BorgDock.Tauri/src/components/file-palette/CodeView.css` (~44 lines)

Task 16 makes the verification + deletion explicit so the spec line is honored. After PR #5, the only CSS in the repo lives in `src/styles/index.css`.

---

## Prerequisites

- [ ] **Prereq 1: Confirm worktree, branch, base commit**

This plan is written from the `feat/streamline-04-pr-detail` worktree (`~/projects/borgdock-streamline-04`). Execution happens in a fresh stacked worktree at `~/projects/borgdock-streamline-05` (already created — see Prereq 3 if you're starting from scratch):

```bash
cd ~/projects/borgdock-streamline-05

# Confirm branch
git branch --show-current
# Expected: feat/streamline-05-palettes

git log --oneline -1
# Expected: 36afa17b docs(spec): add PR #4 URL to PR #4 ledger row
# (or a newer commit if PR #4 had follow-up commits)
```

If `git log` shows a different head, run `git log feat/streamline-03-pr-surfaces..HEAD --oneline` — it should list the PR #4 commit history. If it doesn't, abort and reconcile the branch state before continuing.

- [ ] **Prereq 2: Confirm `feat/streamline-04-pr-detail` still exists on origin**

```bash
cd ~/projects/borgdock-streamline-05
git fetch origin
git rev-parse --verify origin/feat/streamline-04-pr-detail
# Expected: a SHA (any 40-char hex). Failure means PR #4 was renamed or merged.
```

If `origin/feat/streamline-04-pr-detail` is gone but `master` has advanced (PR #4 merged while you were away), this plan's "open PR" task uses `master` instead of `feat/streamline-04-pr-detail` as the base. Note the change in this plan's commit message.

- [ ] **Prereq 3: Create the stacked worktree (skip if already done)**

If the worktree already exists at `~/projects/borgdock-streamline-05`, skip this step. Otherwise:

```bash
cd ~/projects/borgdock-streamline-04
git worktree add ~/projects/borgdock-streamline-05 -b feat/streamline-05-palettes feat/streamline-04-pr-detail
cd ~/projects/borgdock-streamline-05

# Verify
pwd
# Expected: /Users/koenvdb/projects/borgdock-streamline-05
git branch --show-current
# Expected: feat/streamline-05-palettes
git log --oneline -1
# Expected: 36afa17b docs(spec): add PR #4 URL to PR #4 ledger row (or newer)
```

If Prereq 2 forced you to branch from `master` instead, the `git worktree add` command becomes:

```bash
cd ~/projects/borgdock-streamline-04
git worktree add ~/projects/borgdock-streamline-05 -b feat/streamline-05-palettes master
```

- [ ] **Prereq 4: Install dependencies in the new worktree (skip if already done)**

A fresh worktree has no `node_modules/`. If `ls ~/projects/borgdock-streamline-05/src/BorgDock.Tauri/node_modules/.bin/vitest 2>/dev/null` succeeds, skip this step. Otherwise:

```bash
cd ~/projects/borgdock-streamline-05/src/BorgDock.Tauri
npm install
```

Expected: install completes without errors. The `web-tree-sitter` postinstall step may print a wasm warning — that's normal.

- [ ] **Prereq 5: Confirm baseline vitest suite carries cleanly into the new worktree**

```bash
cd ~/projects/borgdock-streamline-05/src/BorgDock.Tauri
npm test -- --run 2>&1 | tail -10
```

Expected: `2606 passed (2606)` (the calibrated baseline from PR #4). If the count differs by more than ±5, **stop and diagnose** before touching any UI code. A drift means PR #4 wasn't carrying clean and a fix at PR #4 is needed first.

Capture the exact baseline number — Task 17 compares against it.

- [ ] **Prereq 6: Confirm primitives + chrome tests are green specifically**

```bash
cd ~/projects/borgdock-streamline-05/src/BorgDock.Tauri
npm test -- --run src/components/shared/primitives src/components/shared/chrome
```

Expected: all primitive and chrome tests pass. These are the inputs to PR #5 — if any are red, escalate to the PR #1/#2 owner; do not edit primitives to "fix" them locally.

- [ ] **Prereq 7: Capture the current state of the five target Playwright specs**

```bash
cd ~/projects/borgdock-streamline-05/src/BorgDock.Tauri
npm run test:e2e -- --project=webview-mac \
  tests/e2e/command-palette.spec.ts \
  tests/e2e/file-palette.spec.ts \
  tests/e2e/file-viewer.spec.ts \
  tests/e2e/worktree-palette.spec.ts \
  tests/e2e/sql.spec.ts \
  2>&1 | tee /tmp/pr5-baseline-e2e.log
```

Expected: a mix of pass/fail. The aspirational specs (command-palette tests requiring a generic Cmd+K palette; worktree-palette tests requiring per-row prune/checkout actions) likely fail with selector-not-found errors — those are pre-existing, NOT regressions, and stay red after this PR. The migration-supportable specs (`file-palette.spec.ts` data-file-result/data-window/data-file-preview; `file-viewer.spec.ts` data-titlebar-path/data-line-gutter/data-line-number/data-action="copy-contents"; `sql.spec.ts` data-sql-* — already exist on the SQL surface as of PR #2) should mostly pass after our migration adds the missing attributes. Capture the baseline pass/fail list — Task 17 diff-checks against it.

If the run errors with "browser not installed" or similar Playwright setup issues, run `npx playwright install --with-deps` once and retry. If it still errors with a Tauri-mock infrastructure issue (unrelated to data-* gaps), document it as a pre-existing blocker and fall back to verifying the migration via vitest only — but flag it explicitly.

---

## File Structure

**Create:**

- `src/BorgDock.Tauri/src/components/file-palette/__tests__/SearchPane.test.tsx` — IF it doesn't already exist (verify with `ls src/BorgDock.Tauri/src/components/file-palette/__tests__/`). Asserts the `Input` primitive rendering + `data-window` propagation.
- `src/BorgDock.Tauri/src/components/file-palette/__tests__/ResultsList.test.tsx` — IF it doesn't exist. Asserts `data-file-result` + `data-selected="true"` on the selected row.
- `src/BorgDock.Tauri/src/components/file-palette/__tests__/PreviewPane.test.tsx` — IF it doesn't exist. Asserts `data-file-preview` is on the success container.
- `src/BorgDock.Tauri/src/components/file-viewer/__tests__/FileViewerToolbar.test.tsx` — IF it doesn't exist. Asserts `data-titlebar-path` on the path span and `data-action="copy-contents"` on the copy `Button`.
- `src/BorgDock.Tauri/src/components/file-viewer/__tests__/FileViewerApp.test.tsx` — IF it doesn't exist. Asserts the toolbar + body skeleton render.
- `src/BorgDock.Tauri/src/components/worktree-palette/__tests__/WorktreePaletteApp.test.tsx` — IF it doesn't exist (verify; the directory exists but may be empty). Asserts each row carries `data-worktree-row` + the IconButton terminal/folder/editor cluster renders.
- `src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx` — IF it doesn't exist. Asserts the `[role="dialog"]` outer container, `Card` body, primary-action `Button` enabled/disabled state.
- `src/BorgDock.Tauri/src/components/sql/__tests__/SqlApp.test.tsx` — IF it doesn't exist. Asserts the `data-action="run-query"` `Button` disabled-until-connection rule, the `data-sql-editor` textarea, the `data-sql-connection-select` select.
- `src/BorgDock.Tauri/src/components/sql/__tests__/ResultsTable.test.tsx` — IF it doesn't exist. Asserts `data-sql-results-table` on the `<table>` and row click selection behavior (single, ctrl-multi, shift-range).

For every "IF it doesn't exist" file: check `ls src/BorgDock.Tauri/src/components/<dir>/__tests__/` first. If a same-named test already exists, **append** assertions instead of creating a duplicate. Never create a second test file with the same component name.

**Modify (component files):**

- `src/BorgDock.Tauri/src/components/command-palette/CommandPalette.tsx` — work-item search palette. The outer backdrop + panel `<div>` keeps inline positioning (it's a fixed-position overlay over the main window). The search `<input>` (lines 326–339) → `<Input leading={<SearchIcon />} placeholder="Search work item by ID..." className="w-full" />` (Input wraps in `bd-input`, which renders the same `padding`+`border`+`bg-input-bg` shape so the inline style block goes away). The status-bar inline span (lines 415–423) keeps its content but the `kbd`-style "Esc to close" hint becomes `<Kbd>Esc</Kbd>`. The inline `PaletteRow` sub-component (lines 430–468) — leave inline (it's tightly coupled to local `ResultItem`); strip the inline styles + replace with utilities (`bg-accent-subtle` selected state); the `#{item.id}` and `{item.workItemType}` / `{item.state}` spans keep their tokens via Tailwind classes. **NO new data-* attributes needed** — this surface has no e2e spec asserting on it. (The PR #0 `command-palette.spec.ts` targets a different aspirational generic command palette — see scope notes.)
- `src/BorgDock.Tauri/src/components/command-palette/PaletteApp.tsx` — standalone palette window (mounted by `palette-main.tsx` in its own OS window). Search `<input>` (lines 138–152) → `<Input placeholder="Search by ID, title, or assigned to..." className="w-full" />`. Status-bar inline span → keeps text; "Esc to close" → `<Kbd>Esc</Kbd>`. Drag handle (lines 115–134) keeps its bespoke 3-dot grip (no primitive fits; document with a one-line comment). The outer `<div>` already carries the right `bg-card-background` token via inline style; convert to `bg-[var(--color-card-background)]` Tailwind utility.
- `src/BorgDock.Tauri/src/components/command-palette/PaletteRow.tsx` — already small (42 lines). Strip inline styles, replace with Tailwind utilities + `bg-accent-subtle`/`bg-transparent` for the selected state. `data-palette-row` attribute stays (it's used by `PaletteApp.tsx`'s scroll-into-view selector — preserve it).
- `src/BorgDock.Tauri/src/components/file-palette/SearchPane.tsx` — search `<input>` (lines 29–36) → `<Input placeholder="Search files..." aria-label="File palette search" leading={<SearchIcon />} trailing={<span className="bd-pill bd-pill--ghost text-[10px] uppercase">{modeLabel}</span>} className="w-full" />`. The `placeholder="Search files..."` value is **the e2e contract** — `file-palette.spec.ts:14` asserts `getByPlaceholder(/search files/i)`; the prior wording (`Filename · prefix > for content · @ for symbol`) was richer but didn't match. Move the discoverability hint into a small `<div className="text-[10px] text-text-muted mt-1.5">Filename · prefix > for content · @ for symbol</div>` below the input. The "{resultCount} result(s)" line stays as a small caption.
- `src/BorgDock.Tauri/src/components/file-palette/ResultsList.tsx` — every result row `<button>` → keep as `<button>` but add `data-file-result data-selected={i === selectedIndex ? 'true' : 'false'}`. **The `data-file-result` + `data-selected="true"` pair is THE e2e contract** (file-palette.spec.ts:30–35). Visual style swaps `.fp-result-row` for Tailwind utilities: `flex w-full justify-between items-start gap-2 px-2.5 py-1.5 text-xs font-mono text-left bg-transparent border-none cursor-pointer hover:bg-accent-subtle data-[selected=true]:bg-accent-subtle`. Match-count + line metadata spans stay as small inline text.
- `src/BorgDock.Tauri/src/components/file-palette/PreviewPane.tsx` — wrap the success-state `<CodeView>` in a `<div data-file-preview className="h-full">`. The empty/loading/binary/too-large/error states stay as plain `<div className="bd-fp-preview-empty">…` (their layout moves to `@layer components` in Task 15). The "Open in editor" `<button>` (lines 61–68 + 75–82) → `<Button variant="primary" size="sm" onClick={...}>Open in editor</Button>`. **`data-file-preview` is THE e2e contract** (file-palette.spec.ts:41).
- `src/BorgDock.Tauri/src/components/file-palette/ChangesSection.tsx` — the section header `<div>` keeps text. Subheader collapse buttons (lines 203–209, 212–221) → `<Button variant="ghost" size="sm" className="w-full justify-start text-[11px] opacity-70 hover:opacity-100">…</Button>`. Per-row `<button>` (lines 177–194) keeps its bespoke shape (it's a flat list row with status-color + path; primitives don't fit), but strips the `.fp-changes-row*` classes for a Tailwind triple: `flex gap-2 items-start w-full px-2.5 py-1 pl-[22px] text-xs font-mono text-left bg-transparent border-none cursor-pointer hover:bg-accent-subtle aria-[selected=true]:bg-accent-subtle`. Status letter span keeps the dynamic `style={{ color: statusColor(file.status) }}` since the status colors aren't 1:1 with `Pill` tones (and a `Pill` would be too heavy here). Empty / "Not a git repo" / loading containers → keep `<div>` with utility classes.
- `src/BorgDock.Tauri/src/components/file-palette/RootsColumn.tsx` — collapse-toggle buttons (lines 48–68 collapsed view; lines 104–124 + 84–103 expanded toolbar) → `<IconButton icon={<ChevronRightIcon />} tooltip="Expand worktree list" size={22}>` etc. Star toggle button on each row (lines 183–207) → `<IconButton icon={<StarIcon filled={favorite} />} active={favorite} tooltip={favorite ? 'Unmark as favorite' : 'Mark as favorite'} size={22} aria-pressed={favorite}>`. Row select `<button>` (lines 211–219) keeps its bespoke shape (it's a wide-text row with a label; `Button` adds too much chrome). Strip `.fp-root-row-wrap*` / `.fp-root-row` / `.fp-root-star*` / `.fp-roots-icon-btn*` / `.fp-roots-collapse-btn` classes for utilities + the surface-prefixed `bd-fp-root-row*` class set added in Task 15. The `.fp-roots-collapsed-active` rotated label keeps `writing-mode: vertical-rl` since no Tailwind utility maps cleanly — it lands in `@layer components` with a `bd-fp-roots-collapsed-active` class. All `WORKTREES` / `CUSTOM` / `ROOTS` headings keep their existing `<div>` markup (they're plain section labels — no primitive fits).
- `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx` — the outer `<div className="fp-root">` (line 308) becomes `<div data-window="palette" className="bd-fp-root" tabIndex={-1} onKeyDown={handleKey}>`. **`data-window="palette"` is THE e2e contract** (file-palette.spec.ts:44, asserting Escape hides the window). The `.fp-root` class stays in `@layer components` for layout. The titlebar `<div>` (lines 309–311) keeps `data-tauri-drag-region`. The `.fp-body` / `.fp-middle` / `.fp-empty` containers stay with their `bd-fp-body` / `bd-fp-middle` / `bd-fp-empty` classes (in `@layer components`, Task 15). No primitive replaces grid layout.
- `src/BorgDock.Tauri/src/components/file-palette/CodeView.tsx` — drop `import './CodeView.css';` (Task 16 deletes the file). The line-row `<div>` (line 89–101) gains `data-line-gutter` on the gutter span and `data-line-number` on the line number span (replacing the existing `data-testid="code-line-number"`). **`data-line-gutter [data-line-number]` is THE e2e contract** (file-viewer.spec.ts:21 — uses CSS descendant combinator). Existing `data-testid` attributes stay (vitest tests use them). The wrapper `data-testid="code-view-root"` stays. Re-class `code-view`/`code-line-row`/`code-line-number`/`code-line-text` to `bd-code-view`/`bd-code-line-row`/`bd-code-line-number`/`bd-code-line-text` (Task 15 adds them to `@layer components`). `code-line-row--hit` → `bd-code-line-row--hit`. The inline `<span style={{ color: var(--...)}}>` for syntax tokens (line 113) stays — the e2e file-viewer.spec.ts:26–29 asserts `[class*="hl-"]` matches; we comply by **adding** a className whose name starts with `hl-` to those highlighted spans: `<span className={\`hl-\${span.category}\`} style={{ color: \`var(\${getHighlightClass(span.category)})\` }}>` — the inline color stays for the actual paint; the className satisfies the selector. (Verify with `grep -n hl- src/services/syntax-highlighter.ts` — if `getHighlightClass` already returns a CSS class name like `--syntax-hl-keyword` rather than a class, switch to `className={\`hl-\${span.category}\`}` directly.)
- `src/BorgDock.Tauri/src/components/file-viewer/FileViewerToolbar.tsx` — toolbar outer `<div className="fv-toolbar" data-tauri-drag-region>` keeps `data-tauri-drag-region` (window drag) and re-classes to `bd-fv-toolbar`. The `<span className="fv-path">` (lines 50–52) → `<span className="bd-fv-path" data-titlebar-path title={path}>{path}</span>`. **`data-titlebar-path` is THE e2e contract** (file-viewer.spec.ts:14–16). The `.fv-segment` group (lines 54–84) of vs-HEAD / vs-default / File buttons → 3 `<Chip active={...} onClick={...} disabled={!inRepo}>` (Chip is the right primitive for "selected pill in a group"). The Diff layout `.fv-segment` (lines 87–104) → 2 `<Chip active={viewMode === ...}>Unified</Chip>` and `<Chip active={...}>Split</Chip>`. The Copy `<button>` (lines 107–109) → `<Button variant="secondary" size="sm" data-action="copy-contents" disabled={!content} onClick={copyAll}>{copied ? 'Copied' : 'Copy all'}</Button>`. **`data-action="copy-contents"` is THE e2e contract** (file-viewer.spec.ts:37). Open-in-editor → `<Button variant="ghost" size="sm" onClick={() => invoke('open_in_editor', { path })}>Open in editor</Button>`. Close → `<IconButton icon={<XIcon />} tooltip="Close" size={22} onClick={() => getCurrentWindow().close()} aria-label="Close">`.
- `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.tsx` — outer `<div className="fv-root">` re-classes to `bd-fv-root`. `<div className="fv-body">` → `bd-fv-body`. `<div className="fv-empty">` → `bd-fv-empty`. No primitives at this layer (it's a router). Pass-through props to `<FileViewerToolbar>` are unchanged.
- `src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.tsx` — drop `import '@/styles/worktree-palette.css';`. The inline `WorktreeRow` sub-component (lines 63–209) becomes:
  - Outer `<div className="wt-row…">` → `<div data-worktree-row data-tree-path={wt.path} className={clsx('bd-wt-row', isSelected && 'bd-wt-row--selected', isMain && 'bd-wt-row--main')}>`. **`data-worktree-row` is THE e2e contract** (worktree-palette.spec.ts:12).
  - Star button (lines 102–122) → `<IconButton icon={<StarIcon filled={isFavorite} />} active={isFavorite} tooltip={isFavorite ? 'Unmark as favorite' : 'Mark as favorite'} size={22} aria-pressed={isFavorite}>`.
  - Action buttons (terminal / folder / editor, lines 141–205) → 3 × `<IconButton icon={...} tooltip={...} size={26}>`. Add `data-action="open-terminal" | "open-folder" | "open-editor"` for future spec targeting.
  - Branch span keeps `font-mono` style; `Pill tone="ghost"` for the `(detached)` indicator and `Pill tone="success"` for the `main` badge (lines 127–130).
  - The `.wt-row-actions` opacity hover behavior moves to a `bd-wt-row__actions` class in @layer components (Tailwind has `group-hover:opacity-100` but the row needs `group` class — that's fine, add `group` to the row outer).
  - Titlebar (lines 494–569) → keep `data-tauri-drag-region`. WORKTREES title + count → `<Titlebar title={<><span>WORKTREES</span><Pill tone="ghost">{filtered.length}</Pill></>} right={<>{favoritesIconButton}{refreshIconButton}{closeIconButton}</>} />` — but this is a chromeless Tauri palette window, NOT the main app titlebar; `Titlebar` primitive may add unwanted padding. Decision: do NOT use `Titlebar` here; keep the bespoke flex shape but swap to `IconButton` for the three icon buttons (favorites, refresh, close). The `wt-logo` SVG stays inline.
  - Search input (lines 586–605) → `<Input leading={<SearchIcon />} placeholder="Filter by branch, folder, or repo..." value={query} onChange={...} disabled={loading} trailing={query && <button onClick={...}>×</button>} className="mx-3 mt-2.5" />`. The trailing clear-button stays as a small inline `<button>` (no primitive fits a clear-x).
  - Footer (lines 678–693) → keep flex layout; replace `kbd.wt-kbd` with `<Kbd>↑↓</Kbd>` etc. Re-class `wt-footer` / `wt-hint` / `wt-sep` to `bd-wt-footer*` / `bd-wt-hint*` / `bd-wt-sep`.
  - Group headers (lines 644–650) — inline as `<div className="bd-wt-group-header"><span className="bd-wt-group-name">{repoKey}</span><Pill tone="ghost">{entries.length}</Pill>{errors.has(repoKey) && <Pill tone="error">error</Pill>}</div>`. **The `Pill tone="ghost"` for the count replaces the `--color-filter-chip-bg` reference at the old `.wt-group-count` selector — that's the §8 deletion target.**
  - Loading / empty containers re-class to `bd-wt-loading` / `bd-wt-empty*`.
- `src/BorgDock.Tauri/src/components/worktree/WorktreePruneDialog.tsx` — outer modal container (lines 207–211) keeps `role="dialog"` (verify it does — the e2e selector is `[role="dialog"]`; if missing, **add it**). Wrap as `<Card variant="default" padding="none" className="pointer-events-auto flex max-h-[80vh] w-full max-w-lg flex-col" onClick={(e) => e.stopPropagation()}>`. Header close button (lines 216–229) → `<IconButton icon={<XIcon />} tooltip="Close" size={22} onClick={onClose}>`. Toolbar buttons (lines 234–245) → `<Button variant="secondary" size="sm">Select all orphaned</Button>` and `<Button variant="ghost" size="sm">Deselect all</Button>`. Each row's status badge (lines 288–295) → `<Pill tone={pillTone(row.status)}>{statusLabel(row.status)}</Pill>` where `pillTone('open') === 'success'`, `pillTone('closed') === 'draft'`, `pillTone('orphaned') === 'error'`. The progress bar (lines 322–329) → `<LinearProgress value={(removeProgress / removeTotal) * 100} tone="accent" />`. Footer Close button → `<Button variant="ghost" size="sm">Close</Button>`. Footer "Remove selected" button → `<Button variant="danger" size="sm" disabled={selectedCount === 0 || isRemoving} onClick={removeSelected}>Remove selected ({selectedCount})</Button>`. The row checkbox stays native (no primitive).
- `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx` — Run button (lines 390–407) keeps `data-action="run-query"`; swap to `<Button variant="primary" size="sm" data-action="run-query" leading={isRunning ? <SpinnerIcon /> : <PlayIcon />} disabled={isRunning || !hasConnections || !query.trim()} onClick={runQuery}>{isRunning ? 'Running' : 'Run'}</Button>`. The `<kbd className="sql-kbd">Ctrl+Enter</kbd>` (line 408) → `<Kbd>Ctrl+Enter</Kbd>`. The connection select stays as native `<select data-sql-connection-select>` (no primitive). The textarea stays as native `<textarea>` (Input is single-line). Replace the bespoke error banner outer `<div className="sql-error">` (lines 453–469) with `<Card padding="sm" variant="default" className="border border-status-red"><div className="flex items-center gap-2 text-status-red">…</div></Card>`. The empty-results container keeps its bespoke `<div>`. The copy buttons in the StatusBar right (lines 562–569) → `<Button variant="ghost" size="sm">Values</Button>` etc. The `sql-app` outer keeps utility classes; `sql-toolbar` / `sql-editor-area` / `sql-results-container` / `sql-data-row` / `sql-cell` / `sql-resize-*` / `sql-kbd` / `sql-toolbar-separator` / `sql-no-connections` / `sql-connection-icon` / `sql-connection-select` / `sql-status-*` / `sql-copy-*` / `sql-resultset-*` / `sql-empty-results` / `sql-gutter*` / `sql-textarea` / `sql-error` / `sql-run-btn*` styling lives **today** in `index.css` (already there per `grep -c "sql-" src/styles/index.css`). Verify with grep and leave those classes IN PLACE — they're not in the per-feature CSS files we're deleting. (Confirm no new orphans by re-grepping after the migration.)
- `src/BorgDock.Tauri/src/components/sql/ResultsTable.tsx` — already has `data-sql-results-table`. The `<table>` + `<thead>` + `<tbody>` markup stays as-is (no primitive replaces a data table). Re-class only if the existing class names move; otherwise leave untouched. **No changes needed unless grep finds a `--color-filter-chip-bg` reference here** (it doesn't, but verify).

**Modify (component test files):**

- `src/BorgDock.Tauri/src/components/command-palette/__tests__/CommandPalette.test.tsx` — update selectors that resolve to old class chains. Add assertions that the new `Input` primitive is used (locate the `bd-input` class) and that the `Kbd` primitive renders the "Esc" hint.
- `src/BorgDock.Tauri/src/components/command-palette/__tests__/PaletteRow.test.tsx` (verify exists; if so, update selectors).
- `src/BorgDock.Tauri/src/components/file-palette/__tests__/RootsColumn.test.tsx` (if exists) — update selectors.
- `src/BorgDock.Tauri/src/components/file-palette/__tests__/ChangesSection.test.tsx` (if exists) — update selectors; confirm row `aria-selected` flips on selection.
- `src/BorgDock.Tauri/src/components/file-palette/__tests__/CodeView.test.tsx` — append assertions that line-rows carry `data-line-gutter` parent + `data-line-number` child, and that highlighted spans get a `hl-*` className.
- `src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteApp.test.tsx` (if exists) — update selectors; assert `data-window="palette"`.
- `src/BorgDock.Tauri/src/components/file-viewer/__tests__/FileViewerToolbar.test.tsx` (newly created or appended) — assert `data-titlebar-path`, `data-action="copy-contents"`, the three baseline `Chip`s, the two view-mode `Chip`s.
- `src/BorgDock.Tauri/src/components/file-viewer/__tests__/FileViewerApp.test.tsx` (newly created) — assert toolbar + body skeleton.
- `src/BorgDock.Tauri/src/components/worktree-palette/__tests__/WorktreePaletteApp.test.tsx` (newly created) — assert each row has `data-worktree-row`; assert IconButton terminal/folder/editor cluster renders with correct `data-action` attrs; assert favorites toggle `aria-pressed` flips; assert search input renders.
- `src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx` (newly created) — assert `[role="dialog"]`, `Card` body, `Button` enabled-when-selected, `LinearProgress` shown during removing.
- `src/BorgDock.Tauri/src/components/sql/__tests__/SqlApp.test.tsx` (newly created) — assert `data-sql-editor`, `data-sql-connection-select`, `data-action="run-query"`, run button disabled-until-connection.
- `src/BorgDock.Tauri/src/components/sql/__tests__/ResultsTable.test.tsx` (newly created) — assert `data-sql-results-table`, single/ctrl/shift selection.

**Delete:**

- `src/BorgDock.Tauri/src/styles/file-palette.css` — Task 16.
- `src/BorgDock.Tauri/src/styles/file-viewer.css` — Task 16.
- `src/BorgDock.Tauri/src/styles/worktree-palette.css` — Task 16.
- `src/BorgDock.Tauri/src/components/file-palette/CodeView.css` — Task 16.
- The four `import` lines in `file-palette-main.tsx`, `file-viewer-main.tsx`, `WorktreePaletteApp.tsx`, `CodeView.tsx`.

---

## Tasks

### Task 1: Migrate `command-palette/PaletteRow.tsx`

This is the smallest leaf and seeds the pattern. It's also reused by `PaletteApp.tsx` (separate file, mounted in its own OS window).

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/command-palette/PaletteRow.tsx`
- Test (existing — verify): `src/BorgDock.Tauri/src/components/command-palette/__tests__/PaletteRow.test.tsx` (if missing, skip — covered by `CommandPalette.test.tsx` and `PaletteApp.test.tsx`)

- [ ] **Step 1: Read the existing file**

```bash
cd ~/projects/borgdock-streamline-05/src/BorgDock.Tauri
sed -n '1,42p' src/components/command-palette/PaletteRow.tsx
```

Confirm shape matches: 42 lines, exports `PaletteRow`, has `data-palette-row` attribute. **Preserve `data-palette-row`** — `PaletteApp.tsx`'s scroll-into-view selector depends on it.

- [ ] **Step 2: Write the failing test (or extend existing)**

```bash
ls src/components/command-palette/__tests__/
```

If `PaletteRow.test.tsx` doesn't exist, create one:

```tsx
// src/components/command-palette/__tests__/PaletteRow.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaletteRow } from '../PaletteRow';

const item = { id: 1234, title: 'Sample work item', state: 'Active', workItemType: 'Bug', assignedTo: 'Alice' };

describe('PaletteRow', () => {
  it('renders item ID, title, type, and state', () => {
    render(<PaletteRow item={item} isSelected={false} onMouseEnter={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText('#1234')).toBeInTheDocument();
    expect(screen.getByText('Sample work item')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('preserves data-palette-row attribute', () => {
    const { container } = render(<PaletteRow item={item} isSelected={false} onMouseEnter={vi.fn()} onSelect={vi.fn()} />);
    expect(container.querySelector('[data-palette-row]')).not.toBeNull();
  });

  it('applies selected background when isSelected is true', () => {
    const { container } = render(<PaletteRow item={item} isSelected={true} onMouseEnter={vi.fn()} onSelect={vi.fn()} />);
    const row = container.querySelector('[data-palette-row]') as HTMLElement;
    expect(row.className).toMatch(/bg-(?:accent|\[var\(--color-accent-subtle\))/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails (or passes if already migrated)**

```bash
npx vitest run src/components/command-palette/__tests__/PaletteRow.test.tsx
```

Expected: tests fail because the inline `style={{ backgroundColor: ... }}` doesn't put a Tailwind utility class on the row, OR they pass if a same-shaped test already exists.

- [ ] **Step 4: Migrate the component**

Replace `src/BorgDock.Tauri/src/components/command-palette/PaletteRow.tsx` with:

```tsx
import clsx from 'clsx';
import type { ResultItem } from '@/hooks/usePaletteSearch';

export function PaletteRow({
  item,
  isSelected,
  onMouseEnter,
  onSelect,
}: {
  item: ResultItem;
  isSelected: boolean;
  onMouseEnter: () => void;
  onSelect: (id: number) => void;
}) {
  return (
    <div
      data-palette-row
      className={clsx(
        'flex cursor-pointer items-center justify-between px-4 py-2 transition-colors',
        isSelected
          ? 'bg-[var(--color-accent-subtle)]'
          : 'bg-transparent hover:bg-[var(--color-surface-hover)]',
      )}
      onMouseEnter={onMouseEnter}
      onMouseDown={() => onSelect(item.id)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[13px] font-bold text-[var(--color-accent)]">
          #{item.id}
        </span>
        <span className="truncate text-[13px] text-[var(--color-text-primary)]">
          {item.title}
        </span>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {item.workItemType}
        </span>
        <span className="text-[11px] font-semibold text-[var(--color-accent)]">
          {item.state}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/components/command-palette/__tests__/PaletteRow.test.tsx
```

Expected: 3/3 pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/command-palette/PaletteRow.tsx src/components/command-palette/__tests__/PaletteRow.test.tsx
git commit -m "$(cat <<'EOF'
refactor(command-palette): PaletteRow drops inline style, uses Tailwind utilities

Preserves data-palette-row e2e contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrate `command-palette/CommandPalette.tsx` (work-item search modal)

The full-window overlay variant (toggled by `useUiStore.isCommandPaletteOpen`). Searches ADO work items by ID.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/command-palette/CommandPalette.tsx`
- Test (existing): `src/BorgDock.Tauri/src/components/command-palette/__tests__/CommandPalette.test.tsx`

- [ ] **Step 1: Read the existing file + test**

```bash
sed -n '1,50p' src/components/command-palette/CommandPalette.tsx
sed -n '1,60p' src/components/command-palette/__tests__/CommandPalette.test.tsx
```

Note the test selectors that need to keep working. Keep them all.

- [ ] **Step 2: Update test to assert the new primitive shape**

Add to the existing `CommandPalette.test.tsx`:

```tsx
it('renders the search Input primitive', () => {
  // open the palette via store
  useUiStore.setState({ isCommandPaletteOpen: true });
  render(<CommandPalette onSelectWorkItem={() => {}} />);
  // bd-input is the primitive's wrapper class
  expect(document.querySelector('.bd-input')).not.toBeNull();
});

it('renders Esc hint via Kbd primitive', () => {
  useUiStore.setState({ isCommandPaletteOpen: true });
  render(<CommandPalette onSelectWorkItem={() => {}} />);
  // bd-kbd is the Kbd primitive's class
  expect(document.querySelector('.bd-kbd')).not.toBeNull();
});
```

(Adjust `bd-kbd` to match the actual Kbd primitive's class — verify with `cat src/components/shared/primitives/Kbd.tsx`.)

- [ ] **Step 3: Run tests to verify the new ones fail**

```bash
npx vitest run src/components/command-palette/__tests__/CommandPalette.test.tsx
```

Expected: existing tests pass, new ones fail.

- [ ] **Step 4: Migrate the component**

In `CommandPalette.tsx`:

1. Add imports at the top:
```tsx
import { Input, Kbd } from '@/components/shared/primitives';
```

2. Replace lines 326–339 (the search input block) with:
```tsx
<Input
  ref={inputRef}
  type="text"
  value={searchText}
  onChange={(e) => setSearchText(e.target.value)}
  placeholder="Search work item by ID..."
  className="w-full"
/>
```

(Note: `Input` forwards arbitrary HTMLInputAttributes via spread; if `ref` doesn't forward, fall back to `<Input>` wrapping a manually-refed `<input>` — verify by reading `src/components/shared/primitives/Input.tsx`. If `Input` doesn't accept `ref`, leave the bare `<input>` BUT swap inline styles for Tailwind utilities: `bg-[var(--color-input-bg)] border-[var(--color-input-border)] text-[var(--color-text-primary)] caret-[var(--color-accent)] w-full rounded-lg border px-3 py-2.5 text-base outline-none`.)

3. Replace lines 414–423 (the status bar Esc-hint span) with:
```tsx
<span className="text-[11px] text-[var(--color-text-faint)]">
  <Kbd>Esc</Kbd> to close
</span>
```

4. Replace the `PaletteRow` sub-component at lines 430–468 with a re-export that uses Tailwind utilities (mirror Task 1's PaletteRow shape — these are duplicates and both should be migrated identically). This is a code duplication that PR #5 doesn't deduplicate; documenting for a future cleanup PR.

5. Strip the `style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}` (line 311) → keep as inline (it's a fixed backdrop overlay; no token covers semi-transparent backdrop). Add a one-line comment: `// inline rgba: backdrop overlay, no token covers semi-transparent overlay`.

6. The outer panel `<div>` (lines 316–322) inline `style` → utility classes:
```tsx
<div
  className="w-[460px] rounded-xl border bg-[var(--color-card-background)] border-[var(--color-strong-border)] shadow-2xl"
  onKeyDown={handleKeyDown}
>
```

7. Section heading inline `style` (line 383) → `text-[var(--color-text-tertiary)]`.

- [ ] **Step 5: Run tests to verify they all pass**

```bash
npx vitest run src/components/command-palette/__tests__/CommandPalette.test.tsx
```

Expected: all green, including the two new assertions.

- [ ] **Step 6: Commit**

```bash
git add src/components/command-palette/CommandPalette.tsx src/components/command-palette/__tests__/CommandPalette.test.tsx
git commit -m "$(cat <<'EOF'
refactor(command-palette): CommandPalette uses Input + Kbd primitives

Replaces the inline-styled <input> with Input primitive and adds Kbd around
the Esc hint. Backdrop overlay rgba kept inline (no token covers it).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migrate `command-palette/PaletteApp.tsx` (standalone palette window)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/command-palette/PaletteApp.tsx`
- Test: create `src/BorgDock.Tauri/src/components/command-palette/__tests__/PaletteApp.test.tsx` IF it doesn't exist

- [ ] **Step 1: Verify and read**

```bash
ls src/components/command-palette/__tests__/
sed -n '100,160p' src/components/command-palette/PaletteApp.tsx
```

- [ ] **Step 2: Write a failing test (if PaletteApp.test.tsx is missing)**

```tsx
// src/components/command-palette/__tests__/PaletteApp.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onMoved: vi.fn().mockResolvedValue(() => {}),
    close: vi.fn(),
    startDragging: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePaletteSearch', () => ({
  usePaletteSearch: () => ({
    searchText: '',
    setSearchText: vi.fn(),
    selectedIndex: -1,
    setSelectedIndex: vi.fn(),
    statusText: '',
    isSearching: false,
    isSearchMode: false,
    isLoadingBrowse: false,
    browseSections: [],
    navItems: [],
    selectAndClose: vi.fn(),
  }),
  saveCurrentPosition: vi.fn(),
}));

import { PaletteApp } from '../PaletteApp';

describe('PaletteApp', () => {
  it('renders Input primitive for search', () => {
    render(<PaletteApp />);
    expect(document.querySelector('.bd-input')).not.toBeNull();
  });
  it('renders Esc hint via Kbd', () => {
    render(<PaletteApp />);
    expect(document.querySelector('.bd-kbd')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run test, expect failure**

```bash
npx vitest run src/components/command-palette/__tests__/PaletteApp.test.tsx
```

- [ ] **Step 4: Migrate the component**

In `PaletteApp.tsx`:

1. Add `import { Input, Kbd } from '@/components/shared/primitives';`.

2. Replace the search input block (lines 137–153) with:
```tsx
<div className="px-3 pt-1 pb-2">
  <Input
    ref={inputRef}
    type="text"
    value={searchText}
    onChange={(e) => setSearchText(e.target.value)}
    onKeyDown={handleInputKeyDown}
    placeholder="Search by ID, title, or assigned to..."
    className="w-full"
  />
</div>
```

(Same caveat about `Input` ref-forwarding — fall back to a plain `<input>` with utility classes if needed.)

3. Replace the Esc-hint span (line 235–237):
```tsx
<span className="text-[11px] text-[var(--color-text-faint)]">
  <Kbd>Esc</Kbd> to close
</span>
```

4. Replace inline `style` blocks throughout with Tailwind utilities:
- Line 111: `<div className="h-screen w-screen overflow-hidden bg-[var(--color-card-background)]">`.
- Line 116–119: drag handle's `bg-[var(--color-surface-raised)]`.
- Lines 122–132: dot grid `bg-[var(--color-text-ghost)]`.
- Line 175 / 184–187: empty/loading text `text-[var(--color-text-muted)]`.
- Line 196 / 199 / 224 / 233: section heading + separator + status colors via utilities.

5. Drag-grip 3-dot `<div>` keeps its bespoke shape. Add a one-line comment: `// drag handle: bespoke 3-dot grip, no primitive maps`.

- [ ] **Step 5: Run test, expect pass**

```bash
npx vitest run src/components/command-palette/__tests__/PaletteApp.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/components/command-palette/PaletteApp.tsx src/components/command-palette/__tests__/PaletteApp.test.tsx
git commit -m "$(cat <<'EOF'
refactor(command-palette): PaletteApp uses Input + Kbd primitives, drops inline styles

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Migrate `file-palette/SearchPane.tsx` + `ResultsList.tsx` (leaves)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/SearchPane.tsx`
- Modify: `src/BorgDock.Tauri/src/components/file-palette/ResultsList.tsx`
- Test: create / append `src/BorgDock.Tauri/src/components/file-palette/__tests__/SearchPane.test.tsx`
- Test: create / append `src/BorgDock.Tauri/src/components/file-palette/__tests__/ResultsList.test.tsx`

- [ ] **Step 1: Inspect existing tests**

```bash
ls src/components/file-palette/__tests__/
```

- [ ] **Step 2: Write failing tests for the new contracts**

For `ResultsList.test.tsx` (new file or appended assertions):

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ResultsList } from '../ResultsList';

const results = [
  { rel_path: 'src/footer.tsx', mode: 'filename' as const },
  { rel_path: 'src/header.tsx', mode: 'filename' as const },
];

describe('ResultsList data-* contract', () => {
  it('renders [data-file-result] on each row', () => {
    const { container } = render(
      <ResultsList results={results} selectedIndex={0} onHover={vi.fn()} onOpen={vi.fn()} rowRef={vi.fn()} />,
    );
    expect(container.querySelectorAll('[data-file-result]').length).toBe(2);
  });
  it('marks the selected row with [data-selected="true"]', () => {
    const { container } = render(
      <ResultsList results={results} selectedIndex={0} onHover={vi.fn()} onOpen={vi.fn()} rowRef={vi.fn()} />,
    );
    expect(container.querySelector('[data-file-result][data-selected="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-file-result][data-selected="true"]').length).toBe(1);
  });
});
```

For `SearchPane.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));

import { SearchPane } from '../SearchPane';
import { parseQuery } from '../parse-query';

describe('SearchPane', () => {
  it('renders an Input with placeholder matching /search files/i', () => {
    render(
      <SearchPane query="" onQueryChange={vi.fn()} parsed={parseQuery('')} resultCount={0} />,
    );
    expect(screen.getByPlaceholderText(/search files/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

```bash
npx vitest run src/components/file-palette/__tests__/ResultsList.test.tsx src/components/file-palette/__tests__/SearchPane.test.tsx
```

- [ ] **Step 4: Migrate `ResultsList.tsx`**

```tsx
import clsx from 'clsx';
import type { SearchMode } from './parse-query';

export interface ResultEntry {
  rel_path: string;
  mode: SearchMode;
  match_count?: number;
  line?: number;
  symbol?: string;
}

interface Props {
  results: ResultEntry[];
  selectedIndex: number;
  onHover: (i: number) => void;
  onOpen: (i: number) => void;
  rowRef: (el: HTMLButtonElement | null, i: number) => void;
}

export function ResultsList({ results, selectedIndex, onHover, onOpen, rowRef }: Props) {
  if (results.length === 0) return null;
  return (
    <div className="bd-fp-results">
      {results.map((r, i) => {
        const selected = i === selectedIndex;
        return (
          <button
            key={`${r.rel_path}:${r.line ?? 0}`}
            type="button"
            data-file-result
            data-selected={selected ? 'true' : 'false'}
            className={clsx(
              'bd-fp-result-row',
              selected && 'bd-fp-result-row--selected',
            )}
            ref={(el) => rowRef(el, i)}
            onMouseEnter={() => onHover(i)}
            onClick={() => onOpen(i)}
          >
            <span className="bd-fp-result-path">{r.rel_path}</span>
            {r.match_count !== undefined && (
              <span className="bd-fp-result-meta">
                {r.match_count} match{r.match_count === 1 ? '' : 'es'}
              </span>
            )}
            {r.line !== undefined && (
              <span className="bd-fp-result-meta">
                {r.symbol ? `${r.symbol} · ` : ''}L{r.line}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

(`bd-fp-result-row*` classes will be added to `index.css`'s `@layer components` in Task 15. They mirror the old `.fp-result-row*` rules.)

- [ ] **Step 5: Migrate `SearchPane.tsx`**

```tsx
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import { Input } from '@/components/shared/primitives';
import type { ParsedQuery } from './parse-query';
import { parseQuery } from './parse-query';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  parsed: ParsedQuery;
  resultCount: number;
}

export function SearchPane({ query, onQueryChange, parsed, resultCount }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      invoke('palette_ready').catch(() => {});
    }, 40);
    return () => window.clearTimeout(id);
  }, []);

  const modeLabel =
    parsed.mode === 'filename' ? 'file' : parsed.mode === 'content' ? 'content' : 'symbol';

  return (
    <div className="bd-fp-search-pane">
      <Input
        ref={inputRef}
        placeholder="Search files..."
        aria-label="File palette search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        trailing={
          <span
            className="bd-pill bd-pill--ghost text-[10px] uppercase"
            title={`Mode: ${modeLabel}`}
          >
            {modeLabel}
          </span>
        }
        className="w-full"
      />
      <div className="bd-fp-search-hint">
        Filename · prefix &gt; for content · @ for symbol
      </div>
      <div className="bd-fp-search-count">
        {resultCount} result{resultCount === 1 ? '' : 's'}
      </div>
    </div>
  );
}

export { parseQuery };
```

If `Input` doesn't forward `ref` cleanly, fall back to a bare `<input className="bd-fp-search-input" ...>` and add a `bd-fp-search-input` class to `@layer components` in Task 15. (Verify by reading the `Input.tsx` source.)

- [ ] **Step 6: Run tests, expect pass**

```bash
npx vitest run src/components/file-palette/__tests__/ResultsList.test.tsx src/components/file-palette/__tests__/SearchPane.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add src/components/file-palette/SearchPane.tsx src/components/file-palette/ResultsList.tsx src/components/file-palette/__tests__/SearchPane.test.tsx src/components/file-palette/__tests__/ResultsList.test.tsx
git commit -m "$(cat <<'EOF'
refactor(file-palette): SearchPane + ResultsList use Input primitive + data-* hooks

Adds data-file-result + data-selected="true" e2e contract on result rows;
re-anchors search placeholder to /search files/i to match file-palette.spec.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Migrate `file-palette/PreviewPane.tsx`

Adds the `data-file-preview` e2e contract.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/PreviewPane.tsx`
- Test: create / append `src/BorgDock.Tauri/src/components/file-palette/__tests__/PreviewPane.test.tsx`

- [ ] **Step 1: Read existing**

```bash
sed -n '1,108p' src/components/file-palette/PreviewPane.tsx
```

- [ ] **Step 2: Write failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('console.log("hello")'),
}));

import { PreviewPane } from '../PreviewPane';

describe('PreviewPane', () => {
  it('marks the success container with data-file-preview', async () => {
    const { container } = render(
      <PreviewPane rootPath="/repo" relPath="src/foo.ts" />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-file-preview]')).not.toBeNull();
    });
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
npx vitest run src/components/file-palette/__tests__/PreviewPane.test.tsx
```

- [ ] **Step 4: Migrate**

In `PreviewPane.tsx`:

1. Wrap each `<div className="fp-preview-empty">…` → `<div className="bd-fp-preview-empty">…` (just rename; class moves to @layer in Task 15).

2. Replace the `<button className="fp-preview-action">` (in binary + too_large branches) → `<Button variant="primary" size="sm" onClick={() => absPath && invoke('open_in_editor', { path: absPath })}>Open in editor</Button>`.

3. Wrap the success-state `<CodeView>` in a sibling-anchored container:

```tsx
return (
  <div data-file-preview className="h-full">
    <CodeView
      path={relPath ?? ''}
      content={state.content}
      scrollToLine={scrollToLine}
      highlightedLines={highlightedLines}
      onIdentifierJump={onIdentifierJump}
    />
  </div>
);
```

(All other branches — empty, loading, binary, too_large, error — return their `bd-fp-preview-empty` containers; ONLY the success state gets `data-file-preview`. file-palette.spec.ts:39–41 uses Enter to open a file, then asserts `data-file-preview` is visible — the test seeds a real file so the success path fires.)

4. Add `import { Button } from '@/components/shared/primitives';`.

- [ ] **Step 5: Run, expect pass**

```bash
npx vitest run src/components/file-palette/__tests__/PreviewPane.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/components/file-palette/PreviewPane.tsx src/components/file-palette/__tests__/PreviewPane.test.tsx
git commit -m "$(cat <<'EOF'
refactor(file-palette): PreviewPane wraps success state with data-file-preview, uses Button primitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Migrate `file-palette/ChangesSection.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/ChangesSection.tsx`
- Test (existing — verify): `src/BorgDock.Tauri/src/components/file-palette/__tests__/ChangesSection.test.tsx`

- [ ] **Step 1: Read existing test (if present)**

```bash
ls src/components/file-palette/__tests__/ChangesSection.test.tsx
sed -n '160,225p' src/components/file-palette/ChangesSection.tsx
```

- [ ] **Step 2: Write a small contract test (or extend existing)**

```tsx
// either new file or appended block
it('marks the selected row with aria-selected via class', () => {
  // ...render with selectedGlobalIndex pointing at the first row
  // assert the row has class bd-fp-changes-row--selected
});
```

- [ ] **Step 3: Migrate**

In `ChangesSection.tsx`:

1. Add `import { Button } from '@/components/shared/primitives';`.

2. Replace the two subheader collapse buttons (lines 203–209, 212–221):

```tsx
<button
  type="button"
  className="bd-fp-changes-subheader"
  onClick={() => onToggleCollapse('local')}
>
  <span>{localCollapsed ? '▸' : '▾'} Local ({filteredLocal.length})</span>
</button>
```

→ keep as `<button>` (a `Button` primitive doesn't fit a flat zero-padding row); just rename `.fp-changes-subheader` → `bd-fp-changes-subheader`.

3. Re-class every `.fp-changes*` to `bd-fp-changes*`:
   - `.fp-changes` → `bd-fp-changes`
   - `.fp-changes-header` → `bd-fp-changes-header`
   - `.fp-changes-base` → `bd-fp-changes-base`
   - `.fp-changes-row` / `.fp-changes-row--selected` → `bd-fp-changes-row` / `bd-fp-changes-row--selected`
   - `.fp-changes-status` → `bd-fp-changes-status`
   - `.fp-changes-path` → `bd-fp-changes-path`
   - `.fp-changes-empty` → `bd-fp-changes-empty`

(All `bd-fp-changes-*` classes ported into `@layer components` in Task 15. The `style={{ color: statusColor(file.status) }}` inline style stays — status colors aren't 1:1 with `Pill` tones.)

4. The wrapping `<div className="fp-changes">` keeps its layout role; note the `flex-shrink: 0; max-height: 45%; overflow-y: auto` rules need to land in `@layer components`.

- [ ] **Step 4: Run vitest**

```bash
npx vitest run src/components/file-palette/__tests__/ChangesSection.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/file-palette/ChangesSection.tsx src/components/file-palette/__tests__/ChangesSection.test.tsx
git commit -m "$(cat <<'EOF'
refactor(file-palette): ChangesSection re-namespaces classes to bd-fp-* (CSS deletion prep)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Migrate `file-palette/RootsColumn.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/RootsColumn.tsx`
- Test (existing — verify): `src/BorgDock.Tauri/src/components/file-palette/__tests__/RootsColumn.test.tsx`

- [ ] **Step 1: Read existing test**

```bash
ls src/components/file-palette/__tests__/RootsColumn.test.tsx
```

- [ ] **Step 2: Write small contract test (or extend)**

```tsx
it('renders favorites toggle as IconButton with aria-pressed', () => {
  // assert button[aria-pressed] toggles when clicked
});
```

- [ ] **Step 3: Migrate**

In `RootsColumn.tsx`:

1. Add `import { IconButton } from '@/components/shared/primitives';`.

2. Replace the favorites-only toggle button (lines 84–103) with:

```tsx
<IconButton
  icon={
    <svg width="12" height="12" viewBox="0 0 16 16" fill={favoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6z" />
    </svg>
  }
  active={favoritesOnly}
  tooltip={favoritesOnly ? 'Showing favorites only' : 'Show favorites only'}
  size={22}
  aria-pressed={favoritesOnly}
  onClick={onToggleFavoritesOnly}
/>
```

3. Replace the collapse toggle button (lines 104–124) with:

```tsx
<IconButton
  icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m10 4-4 4 4 4" /></svg>}
  tooltip="Collapse worktree list"
  aria-label="Collapse worktree list"
  size={22}
  onClick={onToggleCollapsed}
/>
```

4. Same replacement for the collapsed-view expand button (lines 48–68), but with the right-arrow path.

5. Replace per-row star button (lines 183–207) with:

```tsx
<IconButton
  icon={<svg width="12" height="12" viewBox="0 0 16 16" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6z" /></svg>}
  active={favorite}
  tooltip={favorite ? 'Unmark as favorite' : 'Mark as favorite'}
  aria-pressed={favorite}
  aria-label={favorite ? `Unmark ${root.label} as favorite` : `Mark ${root.label} as favorite`}
  size={22}
  onClick={(e) => {
    e.stopPropagation();
    onToggleFavorite(root);
  }}
/>
```

6. Re-class every `.fp-roots*` / `.fp-root-row*` / `.fp-root-star*` / `.fp-roots-empty` / `.fp-roots-collapsed-active` / `.fp-roots-collapse-btn` → `bd-fp-roots*` / `bd-fp-root-row*` / `bd-fp-root-star*` / `bd-fp-roots-empty` / `bd-fp-roots-collapsed-active` / `bd-fp-roots-collapse-btn` (Task 15 ports them to `@layer components`).

7. The bare row-select `<button className="fp-root-row">` (lines 211–218) keeps its bespoke shape. Re-class to `bd-fp-root-row`.

- [ ] **Step 4: Run vitest**

```bash
npx vitest run src/components/file-palette/__tests__/RootsColumn.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/file-palette/RootsColumn.tsx src/components/file-palette/__tests__/RootsColumn.test.tsx
git commit -m "$(cat <<'EOF'
refactor(file-palette): RootsColumn uses IconButton primitive, namespaces classes to bd-fp-*

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Migrate `file-palette/FilePaletteApp.tsx` (container)

Adds `data-window="palette"` e2e contract.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx`
- Test (existing — verify): `src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteApp.test.tsx`

- [ ] **Step 1: Read existing test**

```bash
ls src/components/file-palette/__tests__/FilePaletteApp.test.tsx
```

- [ ] **Step 2: Append small data-window contract test**

```tsx
it('outer container carries data-window="palette"', () => {
  // ...assert document.querySelector('[data-window="palette"]') is not null
});
```

- [ ] **Step 3: Migrate**

In `FilePaletteApp.tsx`:

1. Replace the outer return container (line 308):

```tsx
return (
  <div data-window="palette" className="bd-fp-root" onKeyDown={handleKey} tabIndex={-1}>
    <div className="bd-fp-titlebar" data-tauri-drag-region>
      <span className="bd-fp-title">FILES</span>
    </div>
    <div className={`bd-fp-body${rootsCollapsed ? ' bd-fp-body--collapsed' : ''}`}>
      {/* ...rest unchanged... */}
    </div>
  </div>
);
```

2. Re-class `.fp-empty` → `bd-fp-empty` everywhere.

3. No primitive substitution at this layer (it's a router).

- [ ] **Step 4: Run vitest**

```bash
npx vitest run src/components/file-palette/__tests__/FilePaletteApp.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/file-palette/FilePaletteApp.tsx src/components/file-palette/__tests__/FilePaletteApp.test.tsx
git commit -m "$(cat <<'EOF'
refactor(file-palette): FilePaletteApp adds data-window e2e contract, namespaces classes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Migrate `file-palette/CodeView.tsx`

Adds `data-line-gutter` + `data-line-number` e2e contract; preserves syntax highlighting.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/CodeView.tsx`
- Test (existing): `src/BorgDock.Tauri/src/components/file-palette/__tests__/CodeView.test.tsx`

- [ ] **Step 1: Read existing test + grep for getHighlightClass return shape**

```bash
sed -n '1,60p' src/components/file-palette/__tests__/CodeView.test.tsx
grep -n "getHighlightClass" src/services/syntax-highlighter.ts | head -5
```

If `getHighlightClass(span.category)` returns a CSS variable name (e.g. `'--syntax-hl-keyword'`), the inline `style={{ color: \`var(\${getHighlightClass(...)})\` }}` keeps working AND we add a className like `hl-${span.category}` for the e2e selector. If it returns a class name like `'hl-keyword'`, just use that as `className`.

- [ ] **Step 2: Append failing test**

```tsx
import { CodeView } from '../CodeView';
// ...

it('row gutter carries data-line-gutter and number carries data-line-number', () => {
  const { container } = render(<CodeView path="src/foo.ts" content="line1\nline2" />);
  expect(container.querySelector('[data-line-gutter]')).not.toBeNull();
  expect(container.querySelectorAll('[data-line-number]').length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run, expect failure**

```bash
npx vitest run src/components/file-palette/__tests__/CodeView.test.tsx
```

- [ ] **Step 4: Migrate**

1. Drop the `import './CodeView.css';` line.

2. Replace the line-row markup:

```tsx
<div
  key={lineNo}
  data-testid="code-line-row"
  className={clsx('bd-code-line-row', isHit && 'bd-code-line-row--hit')}
>
  <span data-line-gutter className="bd-code-line-gutter">
    <span data-line-number data-testid="code-line-number" className="bd-code-line-number">
      {lineNo}
    </span>
  </span>
  <span className="bd-code-line-text" data-testid="code-line-text">
    {renderLine(text, spans?.get(i) ?? null)}
  </span>
</div>
```

3. Update `renderLine` to add a `hl-*` className to highlighted spans (the file-viewer.spec.ts:26–29 contract):

```tsx
function renderLine(text: string, spans: HighlightSpan[] | null) {
  if (!spans || spans.length === 0) return text === '' ? ' ' : text;
  const out: Array<string | React.ReactNode> = [];
  let cursor = 0;
  spans.forEach((span, idx) => {
    if (span.start > cursor) out.push(text.slice(cursor, span.start));
    out.push(
      <span
        key={idx}
        className={`hl-${span.category}`}
        style={{ color: `var(${getHighlightClass(span.category)})` }}
      >
        {text.slice(span.start, span.end)}
      </span>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
```

(If `getHighlightClass` returns a plain class name, drop the inline `style` and use only `className`.)

4. Add `import clsx from 'clsx';` at the top.

5. Re-class the wrapper `className="code-view"` → `className="bd-code-view"`.

- [ ] **Step 5: Run, expect pass**

```bash
npx vitest run src/components/file-palette/__tests__/CodeView.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/components/file-palette/CodeView.tsx src/components/file-palette/__tests__/CodeView.test.tsx
git commit -m "$(cat <<'EOF'
refactor(file-palette): CodeView adds data-line-gutter/number + hl-* className contracts

Drops local CodeView.css import; new bd-code-* classes land in @layer components in
the index.css migration step. Syntax-highlight rendering unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Migrate `file-viewer/FileViewerToolbar.tsx`

Adds `data-titlebar-path` + `data-action="copy-contents"` e2e contracts; swaps segmented buttons for `Chip`s.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerToolbar.tsx`
- Test (create): `src/BorgDock.Tauri/src/components/file-viewer/__tests__/FileViewerToolbar.test.tsx`

- [ ] **Step 1: Verify __tests__ dir exists**

```bash
ls src/components/file-viewer/__tests__/ 2>/dev/null || mkdir -p src/components/file-viewer/__tests__
```

- [ ] **Step 2: Write failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: vi.fn() }),
}));

import { FileViewerToolbar } from '../FileViewerToolbar';

const baseProps = {
  path: 'src/quote/footer.tsx',
  content: 'console.log("hello")',
  mode: 'content' as const,
  baseline: 'HEAD' as const,
  onSelectBaseline: vi.fn(),
  onSelectContent: vi.fn(),
  viewMode: 'unified' as const,
  onSelectViewMode: vi.fn(),
  inRepo: true,
  defaultBranchLabel: 'main',
};

describe('FileViewerToolbar', () => {
  it('renders the path with data-titlebar-path', () => {
    render(<FileViewerToolbar {...baseProps} />);
    const path = document.querySelector('[data-titlebar-path]');
    expect(path).not.toBeNull();
    expect(path?.textContent).toContain('footer.tsx');
  });

  it('copy button carries data-action="copy-contents"', () => {
    render(<FileViewerToolbar {...baseProps} />);
    expect(document.querySelector('[data-action="copy-contents"]')).not.toBeNull();
  });

  it('renders three baseline Chips and two view-mode Chips when in diff mode', () => {
    render(<FileViewerToolbar {...baseProps} mode="diff" />);
    // bd-chip is the Chip primitive class
    expect(document.querySelectorAll('.bd-chip').length).toBeGreaterThanOrEqual(5);
  });
});
```

(Adjust `bd-chip` to match the actual Chip primitive class — verify with `cat src/components/shared/primitives/Chip.tsx`.)

- [ ] **Step 3: Run, expect failure**

```bash
npx vitest run src/components/file-viewer/__tests__/FileViewerToolbar.test.tsx
```

- [ ] **Step 4: Migrate**

```tsx
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState } from 'react';
import { Button, Chip, IconButton } from '@/components/shared/primitives';
import type { Baseline, Mode, ViewMode } from './types';

interface Props {
  path: string;
  content: string | null;
  mode: Mode;
  baseline: Baseline;
  onSelectBaseline: (b: Baseline) => void;
  onSelectContent: () => void;
  viewMode: ViewMode;
  onSelectViewMode: (v: ViewMode) => void;
  inRepo: boolean;
  defaultBranchLabel: string | null;
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

export function FileViewerToolbar({
  path,
  content,
  mode,
  baseline,
  onSelectBaseline,
  onSelectContent,
  viewMode,
  onSelectViewMode,
  inRepo,
  defaultBranchLabel,
}: Props) {
  const [copied, setCopied] = useState(false);
  const copyAll = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const diffVsHeadActive = mode === 'diff' && baseline === 'HEAD';
  const diffVsDefaultActive = mode === 'diff' && baseline === 'mergeBaseDefault';
  const contentActive = mode === 'content';
  const defaultLabel = defaultBranchLabel ?? 'default';

  return (
    <div className="bd-fv-toolbar" data-tauri-drag-region>
      <span data-titlebar-path className="bd-fv-path" title={path}>
        {path}
      </span>
      <div className="bd-fv-actions">
        <div role="group" aria-label="View mode" className="flex items-center gap-1" title={inRepo ? undefined : 'Not in a git repository'}>
          <Chip active={diffVsHeadActive} onClick={() => onSelectBaseline('HEAD')} disabled={!inRepo}>
            vs HEAD
          </Chip>
          <Chip active={diffVsDefaultActive} onClick={() => onSelectBaseline('mergeBaseDefault')} disabled={!inRepo} title={`Diff against merge-base with origin/${defaultLabel}`}>
            vs {defaultLabel}
          </Chip>
          <Chip active={contentActive} onClick={onSelectContent}>
            File
          </Chip>
        </div>

        {mode === 'diff' && (
          <div role="group" aria-label="Diff layout" className="flex items-center gap-1">
            <Chip active={viewMode === 'unified'} onClick={() => onSelectViewMode('unified')} title="Unified diff (Ctrl+Shift+M)">
              Unified
            </Chip>
            <Chip active={viewMode === 'split'} onClick={() => onSelectViewMode('split')} title="Split diff (Ctrl+Shift+M)">
              Split
            </Chip>
          </div>
        )}

        <Button
          variant="secondary"
          size="sm"
          data-action="copy-contents"
          onClick={copyAll}
          disabled={!content}
        >
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => invoke('open_in_editor', { path })}
        >
          Open in editor
        </Button>
        <IconButton
          icon={<XIcon />}
          tooltip="Close"
          aria-label="Close"
          size={22}
          onClick={() => getCurrentWindow().close()}
        />
      </div>
    </div>
  );
}
```

(Verify `Chip` accepts `disabled`, `title`, `onClick` — read `src/components/shared/primitives/Chip.tsx` first. If not, fall back to a styled `<button>` per Chip but still convey the `bd-chip` class.)

- [ ] **Step 5: Run, expect pass**

```bash
npx vitest run src/components/file-viewer/__tests__/FileViewerToolbar.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/components/file-viewer/FileViewerToolbar.tsx src/components/file-viewer/__tests__/FileViewerToolbar.test.tsx
git commit -m "$(cat <<'EOF'
refactor(file-viewer): FileViewerToolbar uses Chip + Button + IconButton, adds data-* contracts

Adds data-titlebar-path and data-action="copy-contents" e2e contracts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Migrate `file-viewer/FileViewerApp.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.tsx`
- Test (create): `src/BorgDock.Tauri/src/components/file-viewer/__tests__/FileViewerApp.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === 'load_settings') return { ui: {} };
    if (cmd === 'read_text_file') return 'file body';
    if (cmd === 'git_file_diff') return { patch: '', baselineRef: 'main', inRepo: false };
    return null;
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: vi.fn() }),
}));

// Stub child to keep render light
vi.mock('../FileViewerToolbar', () => ({
  FileViewerToolbar: () => <div data-testid="stub-toolbar" />,
}));
vi.mock('@/hooks/useSyntaxHighlight', () => ({ useSyntaxHighlight: () => null }));
vi.mock('../../file-palette/CodeView', () => ({
  CodeView: ({ content }: { content: string }) => <pre>{content}</pre>,
}));

import { FileViewerApp } from '../FileViewerApp';

describe('FileViewerApp', () => {
  it('renders toolbar + body skeleton', async () => {
    Object.defineProperty(window, 'location', { writable: true, value: { search: '?path=src/foo.ts' } });
    const { container } = render(<FileViewerApp />);
    await waitFor(() => {
      expect(container.querySelector('.bd-fv-root')).not.toBeNull();
      expect(container.querySelector('.bd-fv-body')).not.toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run src/components/file-viewer/__tests__/FileViewerApp.test.tsx
```

- [ ] **Step 3: Migrate**

In `FileViewerApp.tsx`:

1. Re-class `className="fv-root"` → `className="bd-fv-root"`.
2. Re-class `className="fv-body"` → `className="bd-fv-body"`.
3. Re-class `className="fv-empty"` → `className="bd-fv-empty"` (3 places in `renderBody`).
4. No primitive substitution needed at this layer.

- [ ] **Step 4: Run, expect pass**

```bash
npx vitest run src/components/file-viewer/__tests__/FileViewerApp.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/file-viewer/FileViewerApp.tsx src/components/file-viewer/__tests__/FileViewerApp.test.tsx
git commit -m "$(cat <<'EOF'
refactor(file-viewer): FileViewerApp namespaces classes to bd-fv-*

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Migrate `worktree-palette/WorktreePaletteApp.tsx`

The largest file in scope (696 lines). Adds `data-worktree-row` e2e contract + removes the only remaining JSX `--color-filter-chip-bg` consumer in scope.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.tsx`
- Test (create): `src/BorgDock.Tauri/src/components/worktree-palette/__tests__/WorktreePaletteApp.test.tsx`

- [ ] **Step 1: Verify test dir + write failing test**

```bash
ls src/components/worktree-palette/__tests__/ 2>/dev/null
```

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === 'load_settings') return { repos: [{ owner: 'borght-dev', name: 'BorgDock', enabled: true, worktreeBasePath: '/wt' }], ui: {} };
    if (cmd === 'list_worktrees_bare') return [
      { path: '/wt/feat-a', branchName: 'feat/a', isMainWorktree: false },
      { path: '/wt/main', branchName: 'main', isMainWorktree: true },
    ];
    return null;
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: vi.fn(),
    onMoved: vi.fn().mockResolvedValue(() => {}),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    innerSize: vi.fn().mockResolvedValue({ width: 480, height: 600 }),
    scaleFactor: vi.fn().mockResolvedValue(1),
  }),
  currentMonitor: vi.fn().mockResolvedValue({ size: { width: 1440, height: 900 } }),
}));
vi.mock('@tauri-apps/api/dpi', () => ({ LogicalSize: class {} }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn() }));

import { WorktreePaletteApp } from '../WorktreePaletteApp';

describe('WorktreePaletteApp', () => {
  it('renders rows with data-worktree-row', async () => {
    render(<WorktreePaletteApp />);
    await waitFor(() => {
      expect(document.querySelectorAll('[data-worktree-row]').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('search input has expected placeholder', async () => {
    render(<WorktreePaletteApp />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Filter by branch/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run src/components/worktree-palette/__tests__/WorktreePaletteApp.test.tsx
```

- [ ] **Step 3: Migrate**

In `WorktreePaletteApp.tsx`:

1. Drop `import '@/styles/worktree-palette.css';`.

2. Add `import { Input, IconButton, Pill, Kbd } from '@/components/shared/primitives';`.

3. Inside `WorktreeRow` (lines 63–209):

   - Outer `<div ref={rowRef} data-palette-row className="wt-row…">` → add `data-worktree-row`, `data-tree-path={wt.path}`; re-class to `bd-wt-row` etc.
   - Star button (lines 102–122) → `<IconButton icon={...} active={isFavorite} tooltip={...} aria-pressed={isFavorite} size={22} onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} />`. Strip the `wt-star-btn` class. (For `isMain` case, keep `<span className="bd-wt-star-placeholder" aria-hidden />`.)
   - "main" badge (line 129) → `<Pill tone="success" className="text-[9px] uppercase tracking-wider">main</Pill>`.
   - "(detached)" branch span — keep inline; just rename `wt-branch--detached` → `bd-wt-branch--detached`.
   - The 3 action buttons (lines 141–205) → 3 × `<IconButton icon={...} tooltip="Open terminal here" data-action="open-terminal" size={26} onClick={(e) => { e.stopPropagation(); onOpenTerminal(); }} />` (similar for folder + editor).
   - Re-class every `wt-row*` / `wt-row-body` / `wt-row-primary` / `wt-row-secondary` / `wt-folder` / `wt-parent` / `wt-branch` / `wt-row-actions` / `wt-action-btn` / `wt-star-btn` / `wt-star-placeholder` / `wt-main-badge` to `bd-wt-*` namespaced equivalents (Task 15).

4. Titlebar (lines 494–569):

   - Strip `wt-titlebar*` classes for `bd-wt-titlebar*`.
   - "WORKTREES" title + count (lines 509–510) → keep `<span className="bd-wt-title">WORKTREES</span><Pill tone="ghost">{filtered.length}</Pill>`. **The Pill replaces the old `.wt-count` class which referenced `--color-accent-subtle` / `--color-purple-border` directly — that's PR #5's design intent (Pill is the semantic primitive for count badges).**
   - 3 titlebar buttons (favorites, refresh, close) → 3 × `<IconButton icon={...} active={favoritesOnly} tooltip={...} aria-pressed={favoritesOnly} size={24} onClick={...} />`. The refresh-spinning behavior: Pass `className={refreshing ? 'animate-spin' : undefined}` to the spinner-icon SVG node (Tailwind has `animate-spin`).

5. Search wrap (lines 572–606) →

```tsx
<div className="bd-wt-search-wrap">
  <Input
    ref={searchRef}
    leading={<SearchIcon />}
    placeholder="Filter by branch, folder, or repo..."
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    disabled={loading}
    trailing={
      query ? (
        <button
          type="button"
          className="bd-wt-search-clear"
          onClick={() => { setQuery(''); searchRef.current?.focus(); }}
          title="Clear"
        >
          ×
        </button>
      ) : undefined
    }
    className="w-full"
  />
</div>
```

(Define a small `SearchIcon` helper at the top of the file.)

6. Group header (lines 644–650) →

```tsx
<div className="bd-wt-group-header">
  <span className="bd-wt-group-name">{repoKey}</span>
  <Pill tone="ghost">{entries.length}</Pill>
  {errors.has(repoKey) && <Pill tone="error">error</Pill>}
</div>
```

**This Pill replaces the old `.wt-group-count` selector that referenced `--color-filter-chip-bg` — that's the §8 deletion target. After this commit, grep `--color-filter-chip-bg` should show only `settings/**` consumers (which PR #6 owns).**

7. Footer (lines 678–693) → re-class `wt-footer` / `wt-hint` / `wt-sep` / `wt-kbd` to `bd-wt-*` AND swap `<kbd className="wt-kbd">↑↓</kbd>` etc. for `<Kbd>↑↓</Kbd>` (verify `Kbd` primitive renders with the right size — read `src/components/shared/primitives/Kbd.tsx` first).

8. Loading / empty containers — re-class `wt-loading` / `wt-spinner` / `wt-empty*` to `bd-wt-loading` / `bd-wt-spinner` / `bd-wt-empty*`.

9. Group / list containers re-class to `bd-wt-group*` / `bd-wt-list`.

- [ ] **Step 4: Run, expect pass**

```bash
npx vitest run src/components/worktree-palette/__tests__/WorktreePaletteApp.test.tsx
```

- [ ] **Step 5: Verify the --color-filter-chip-bg reference is gone**

```bash
grep -rn "color-filter-chip" src/components/worktree-palette/ src/components/file-palette/ src/components/file-viewer/ src/components/command-palette/ src/components/sql/ src/components/worktree/
```

Expected: no matches. If anything shows up, fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/worktree-palette/WorktreePaletteApp.tsx src/components/worktree-palette/__tests__/WorktreePaletteApp.test.tsx
git commit -m "$(cat <<'EOF'
refactor(worktree-palette): WorktreePaletteApp uses Input + IconButton + Pill + Kbd primitives

Adds data-worktree-row + data-tree-path + per-action data-action attributes.
Removes the last in-scope --color-filter-chip-bg JSX consumer (Pill tone="ghost"
replaces the old .wt-group-count chip).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Migrate `worktree/WorktreePruneDialog.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/worktree/WorktreePruneDialog.tsx`
- Test (create): `src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx`

- [ ] **Step 1: Verify test dir**

```bash
ls src/components/worktree/__tests__/ 2>/dev/null || mkdir -p src/components/worktree/__tests__
```

- [ ] **Step 2: Write failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock('@/stores/pr-store', () => ({
  usePrStore: (selector: (s: unknown) => unknown) => selector({ pullRequests: [], closedPullRequests: [] }),
}));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ settings: { repos: [] } }),
}));

import { WorktreePruneDialog } from '../WorktreePruneDialog';

describe('WorktreePruneDialog', () => {
  it('renders a dialog with role="dialog"', () => {
    render(<WorktreePruneDialog isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('Remove button is disabled when no rows are selected', () => {
    render(<WorktreePruneDialog isOpen={true} onClose={vi.fn()} />);
    const removeBtn = screen.getByRole('button', { name: /remove selected/i });
    expect(removeBtn).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
npx vitest run src/components/worktree/__tests__/WorktreePruneDialog.test.tsx
```

- [ ] **Step 4: Migrate**

1. Add `import { Button, Card, IconButton, LinearProgress, Pill } from '@/components/shared/primitives';`.

2. The outer modal panel (lines 207–211) → add `role="dialog"` and `aria-modal="true"` AND wrap content in `<Card variant="default" padding="none">`:

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="prune-dialog-title"
  className="pointer-events-auto flex max-h-[80vh] w-full max-w-lg flex-col"
  onClick={(e) => e.stopPropagation()}
>
  <Card variant="default" padding="none" className="flex h-full flex-col">
    {/* header / toolbar / content / footer */}
  </Card>
</div>
```

(Card's `padding="none"` keeps the existing 5x12 paddings on each section.)

3. Header close button → `<IconButton icon={<XIcon />} tooltip="Close" size={22} onClick={onClose} />`.

4. Toolbar buttons (lines 234–245):

```tsx
<Button variant="secondary" size="sm" onClick={selectAllOrphaned}>Select all orphaned</Button>
<Button variant="ghost" size="sm" onClick={deselectAll}>Deselect all</Button>
```

5. Per-row status badge (lines 288–295) → `<Pill tone={pillTone(row.status)}>{statusLabel(row.status)}</Pill>` where:

```tsx
function pillTone(status: WorktreeStatus): 'success' | 'draft' | 'error' {
  switch (status) {
    case 'open': return 'success';
    case 'closed': return 'draft';
    case 'orphaned': return 'error';
  }
}
```

(Replaces the bespoke `statusClasses` helper; delete it after.)

6. Progress (lines 322–329) → `<LinearProgress value={(removeProgress / removeTotal) * 100} tone="accent" />` (verify `LinearProgress` accepts `tone="accent"`).

7. Footer Close button → `<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>`.

8. Footer "Remove selected" button → `<Button variant="danger" size="sm" disabled={selectedCount === 0 || isRemoving} onClick={removeSelected}>Remove selected ({selectedCount})</Button>`.

9. Add `id="prune-dialog-title"` to the `<h2>` (line 213) so `aria-labelledby` works.

- [ ] **Step 5: Run, expect pass**

```bash
npx vitest run src/components/worktree/__tests__/WorktreePruneDialog.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/components/worktree/WorktreePruneDialog.tsx src/components/worktree/__tests__/WorktreePruneDialog.test.tsx
git commit -m "$(cat <<'EOF'
refactor(worktree): WorktreePruneDialog uses Card + Button + IconButton + LinearProgress + Pill

Adds role="dialog" + aria-modal/aria-labelledby for the worktree-palette.spec.ts
[role="dialog"] selector.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Migrate `sql/SqlApp.tsx` + `sql/ResultsTable.tsx`

The SQL surface already carries `data-sql-editor`, `data-sql-connection-select`, `data-action="run-query"`, `data-sql-results-table`. This task swaps Run/Copy buttons for `Button` primitive, the Ctrl+Enter pill for `Kbd`, and the error banner for `Card`.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx`
- Modify (light touch): `src/BorgDock.Tauri/src/components/sql/ResultsTable.tsx`
- Test (create): `src/BorgDock.Tauri/src/components/sql/__tests__/SqlApp.test.tsx`
- Test (create): `src/BorgDock.Tauri/src/components/sql/__tests__/ResultsTable.test.tsx`

- [ ] **Step 1: Write failing tests**

`SqlApp.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === 'load_settings') return {
      sql: { connections: [{ name: 'mock' }], lastUsedConnection: 'mock' },
      ui: {},
    };
    return null;
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onMoved: vi.fn().mockResolvedValue(() => {}),
    close: vi.fn(),
    outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
    scaleFactor: vi.fn().mockResolvedValue(1),
    setPosition: vi.fn(),
  }),
}));
vi.mock('@tauri-apps/api/dpi', () => ({ LogicalPosition: class {} }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));
vi.mock('@/components/shared/WindowTitleBar', () => ({ WindowTitleBar: () => null }));
vi.mock('@/components/shared/chrome', () => ({ StatusBar: ({ left, right }: { left: unknown; right: unknown }) => <div>{left}{right}</div> }));

import { SqlApp } from '../SqlApp';

describe('SqlApp', () => {
  it('renders the editor and connection select with data-* hooks', async () => {
    render(<SqlApp />);
    await waitFor(() => {
      expect(document.querySelector('[data-sql-editor]')).not.toBeNull();
      expect(document.querySelector('[data-sql-connection-select]')).not.toBeNull();
    });
  });
  it('Run button carries data-action="run-query"', async () => {
    render(<SqlApp />);
    await waitFor(() => {
      expect(document.querySelector('[data-action="run-query"]')).not.toBeNull();
    });
  });
});
```

`ResultsTable.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ResultsTable } from '../ResultsTable';

describe('ResultsTable', () => {
  it('renders [data-sql-results-table]', () => {
    const { container } = render(
      <ResultsTable
        columns={['a', 'b']}
        rows={[['1', '2'], ['3', null]]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-sql-results-table]')).not.toBeNull();
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run src/components/sql/__tests__/SqlApp.test.tsx src/components/sql/__tests__/ResultsTable.test.tsx
```

- [ ] **Step 3: Migrate `SqlApp.tsx`**

1. Add `import { Button, Card, Kbd } from '@/components/shared/primitives';`.

2. Run button (lines 390–407) → keep `data-action="run-query"`:

```tsx
<Button
  variant="primary"
  size="sm"
  data-action="run-query"
  className={clsx('sql-run-btn', isRunning && 'sql-run-btn--running')}
  leading={isRunning ? <SpinnerIcon /> : <PlayIcon />}
  disabled={isRunning || !hasConnections || !query.trim()}
  onClick={runQuery}
>
  {isRunning ? 'Running' : 'Run'}
</Button>
```

3. Ctrl+Enter pill (line 408) → `<Kbd>Ctrl+Enter</Kbd>`. (Drop the bespoke `.sql-kbd` selector if unused elsewhere — grep `index.css` for `sql-kbd` to confirm.)

4. Error banner (lines 453–469) → keep the `<svg>` + `<span>` pair but wrap in `<Card variant="default" padding="sm" className="border-status-red">`:

```tsx
{error && (
  <Card variant="default" padding="sm" className="mx-3 my-2 border border-[var(--color-status-red)]">
    <div className="flex items-center gap-2 text-[var(--color-status-red)]">
      {/* existing svg + span */}
    </div>
  </Card>
)}
```

5. Copy buttons in StatusBar right (lines 562–569) → 3 × `<Button variant="ghost" size="sm" onClick={...}>Values</Button>` etc. (preserves the existing visual feel — they're small ghost buttons today).

6. Connection select (lines 367–383) — leave as native `<select data-sql-connection-select>`. No primitive replaces a `<select>`.

7. Editor textarea (lines 427–437) — leave as native `<textarea>`. The wrapping `<div data-sql-editor id="sql-editor-area">` keeps `data-sql-editor`.

8. The `sql-toolbar`, `sql-editor-area`, `sql-results-container`, `sql-data-row`, `sql-cell`, `sql-resize-*` etc. classes are already defined in `index.css` (verify with `grep -c "sql-" src/styles/index.css`). They stay there. No re-namespace needed for SQL because it never lived in a per-feature CSS file.

- [ ] **Step 4: Migrate `ResultsTable.tsx`**

Already has `data-sql-results-table`. No structural change required. Verify by reading + leaving alone OR add a one-line comment if shape needs documenting.

- [ ] **Step 5: Run, expect pass**

```bash
npx vitest run src/components/sql/__tests__/SqlApp.test.tsx src/components/sql/__tests__/ResultsTable.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/components/sql/SqlApp.tsx src/components/sql/ResultsTable.tsx src/components/sql/__tests__/SqlApp.test.tsx src/components/sql/__tests__/ResultsTable.test.tsx
git commit -m "$(cat <<'EOF'
refactor(sql): SqlApp uses Button + Card + Kbd primitives; ResultsTable confirms data-* contract

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Move residual layout to `@layer components` in `src/styles/index.css`

After Tasks 1–14, every component references `bd-fp-*` / `bd-fv-*` / `bd-wt-*` / `bd-code-*` classes that don't yet exist in CSS. This task adds them all to `@layer components` in `index.css` so the migration renders correctly.

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/index.css`

- [ ] **Step 1: Read the existing @layer components block to understand the pattern**

```bash
sed -n '1960,2000p' src/styles/index.css
```

Confirm the existing `@layer components { … }` block (currently containing primitive `bd-pill`, `bd-btn`, `bd-icon-btn` etc. classes). New additions go at the **end** of that block, before the closing `}`.

- [ ] **Step 2: Append the bd-fp-* / bd-fv-* / bd-wt-* / bd-code-* class set**

Find the closing `}` of `@layer components` and insert before it (line numbers will be near the end of the file — use `grep -n '^}' src/styles/index.css | tail -5` to find the right one).

The new block (paste verbatim — these are the rules ported from the deleted CSS files, namespaced):

```css
  /* ════════════════════════════════════════════════════════
     PR #5 — Per-surface layout migrated from deleted per-feature
     CSS files. file-palette.css → bd-fp-*; file-viewer.css → bd-fv-*;
     worktree-palette.css → bd-wt-*; CodeView.css → bd-code-*.
     ══════════════════════════════════════════════════════ */

  /* ── File palette ──────────────────────────────────── */
  .bd-fp-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    color: var(--color-text-primary);
    background: var(--color-background);
    font-size: 13px;
  }
  .bd-fp-titlebar {
    height: 32px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-bottom: 1px solid var(--color-separator);
    cursor: grab;
  }
  .bd-fp-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    opacity: 0.72;
  }
  .bd-fp-body {
    flex: 1;
    display: grid;
    grid-template-columns: 220px minmax(440px, 1.2fr) 2fr;
    min-height: 0;
    transition: grid-template-columns 180ms ease;
  }
  .bd-fp-body--collapsed {
    grid-template-columns: 40px minmax(560px, 1.4fr) 2fr;
  }
  .bd-fp-roots {
    border-right: 1px solid var(--color-separator);
    overflow-y: auto;
    padding: 4px 0;
    min-width: 0;
  }
  .bd-fp-roots-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px 4px 10px;
    border-bottom: 1px solid var(--color-separator);
    margin-bottom: 4px;
  }
  .bd-fp-roots-toolbar-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
  }
  .bd-fp-roots-toolbar-actions { display: flex; gap: 2px; }
  .bd-fp-roots-section { padding: 4px 0; }
  .bd-fp-roots-heading {
    padding: 4px 10px 4px 32px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
  }
  .bd-fp-root-row-wrap {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px;
    border-radius: 4px;
  }
  .bd-fp-root-row-wrap:hover { background: var(--color-surface-hover); }
  .bd-fp-root-row-wrap--active,
  .bd-fp-root-row-wrap--active:hover { background: var(--color-accent-subtle); }
  .bd-fp-root-row {
    flex: 1;
    min-width: 0;
    display: block;
    text-align: left;
    padding: 6px 8px;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    border-radius: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bd-fp-root-row-wrap--active .bd-fp-root-row {
    color: var(--color-accent);
    font-weight: 500;
  }
  .bd-fp-root-star-placeholder {
    display: inline-block;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }
  .bd-fp-roots-empty {
    padding: 14px 12px;
    color: var(--color-text-muted);
    font-size: 11px;
    line-height: 1.4;
  }
  .bd-fp-roots--collapsed {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 2px;
    gap: 8px;
    overflow: hidden;
  }
  .bd-fp-roots-collapsed-active {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 11px;
    font-weight: 600;
    color: var(--color-accent);
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: calc(100% - 40px);
    padding: 4px 0;
  }
  .bd-fp-middle {
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--color-separator);
    min-width: 0;
    min-height: 0;
  }
  .bd-fp-search-pane {
    padding: 10px;
    border-bottom: 1px solid var(--color-separator);
  }
  .bd-fp-search-hint {
    margin-top: 6px;
    font-size: 10px;
    opacity: 0.55;
  }
  .bd-fp-search-count {
    font-size: 10px;
    opacity: 0.5;
    margin-top: 2px;
  }
  .bd-fp-results {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;
  }
  .bd-fp-result-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    font-family: var(--font-code);
  }
  .bd-fp-result-row:hover,
  .bd-fp-result-row--selected { background: var(--color-accent-subtle); }
  .bd-fp-result-path {
    flex: 1;
    min-width: 0;
    white-space: normal;
    word-break: break-all;
    overflow-wrap: anywhere;
    line-height: 1.4;
  }
  .bd-fp-result-meta { font-size: 10px; opacity: 0.65; flex-shrink: 0; margin-top: 2px; }
  .bd-fp-empty { padding: 14px; opacity: 0.55; font-size: 12px; }
  .bd-fp-preview-empty {
    padding: 18px;
    opacity: 0.55;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  .bd-fp-changes {
    border-bottom: 1px solid var(--color-separator);
    flex-shrink: 0;
    max-height: 45%;
    overflow-y: auto;
  }
  .bd-fp-changes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px 4px 10px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.65;
  }
  .bd-fp-changes-subheader {
    display: block;
    width: 100%;
    text-align: left;
    padding: 4px 10px;
    background: transparent;
    border: none;
    color: inherit;
    font-size: 11px;
    opacity: 0.7;
    cursor: pointer;
  }
  .bd-fp-changes-subheader:hover { opacity: 1; }
  .bd-fp-changes-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    width: 100%;
    padding: 4px 10px 4px 22px;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    font-family: var(--font-code);
  }
  .bd-fp-changes-row:hover,
  .bd-fp-changes-row--selected { background: var(--color-accent-subtle); }
  .bd-fp-changes-status {
    flex-shrink: 0;
    width: 14px;
    font-weight: bold;
    text-align: center;
  }
  .bd-fp-changes-path {
    flex: 1;
    min-width: 0;
    word-break: break-all;
    overflow-wrap: anywhere;
    line-height: 1.4;
  }
  .bd-fp-changes-empty {
    padding: 8px 14px 12px 14px;
    opacity: 0.55;
    font-size: 11px;
  }

  /* ── File viewer ───────────────────────────────────── */
  .bd-fv-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    color: var(--color-text-primary);
    background: var(--color-background);
    font-size: 13px;
  }
  .bd-fv-toolbar {
    height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    background: var(--color-card-background);
    border-bottom: 1px solid var(--color-separator);
    cursor: grab;
    -webkit-app-region: drag;
    user-select: none;
    flex-shrink: 0;
  }
  .bd-fv-toolbar:active { cursor: grabbing; }
  .bd-fv-toolbar > * {
    -webkit-app-region: no-drag;
  }
  .bd-fv-path {
    font-family: var(--font-code);
    font-size: 12px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
  }
  .bd-fv-actions { display: flex; gap: 6px; align-items: center; }
  .bd-fv-body { flex: 1; min-height: 0; overflow: auto; }
  .bd-fv-empty { padding: 18px; opacity: 0.55; font-size: 12px; }

  /* ── Code view (was components/file-palette/CodeView.css) ── */
  .bd-code-view {
    overflow: auto;
    min-height: 0;
    min-width: 0;
    height: 100%;
    font-family: var(--font-code);
    font-size: 12px;
    line-height: var(--code-line-height, 20px);
    padding: 4px 0;
    outline: none;
  }
  .bd-code-line-row {
    display: grid;
    grid-template-columns: 48px 1fr;
    white-space: pre;
  }
  .bd-code-line-row--hit {
    background: var(--color-warning-badge-bg);
  }
  .bd-code-line-gutter {
    display: block;
    text-align: right;
    padding-right: 10px;
    opacity: 0.35;
    user-select: none;
  }
  .bd-code-line-number {
    font-variant-numeric: tabular-nums;
  }
  .bd-code-line-text {
    user-select: text;
    white-space: pre;
  }

  /* ── Worktree palette ──────────────────────────────── */
  .bd-wt-palette {
    position: relative;
    width: 100vw;
    height: 100vh;
    background: var(--color-card-background);
    border: 1px solid var(--color-subtle-border);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    outline: none;
    color: var(--color-text-primary);
  }
  .bd-wt-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-separator);
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
    position: relative;
  }
  .bd-wt-titlebar::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 12px;
    right: 12px;
    height: 1px;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent);
  }
  .bd-wt-titlebar:active { cursor: grabbing; }
  .bd-wt-titlebar-left { display: flex; align-items: center; gap: 8px; }
  .bd-wt-titlebar-right { display: flex; align-items: center; gap: 2px; }
  .bd-wt-logo {
    color: var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .bd-wt-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.11em;
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }
  .bd-wt-search-wrap {
    position: relative;
    margin: 10px 12px 4px;
    flex-shrink: 0;
  }
  .bd-wt-search-clear {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 11px;
    cursor: pointer;
    border-radius: 4px;
  }
  .bd-wt-search-clear:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  .bd-wt-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 6px 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bd-wt-content::-webkit-scrollbar { width: 6px; }
  .bd-wt-content::-webkit-scrollbar-track { background: transparent; }
  .bd-wt-content::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 3px;
  }
  .bd-wt-content::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-thumb-hover);
  }
  .bd-wt-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 40px 0;
    color: var(--color-text-muted);
    font-size: 12px;
  }
  .bd-wt-spinner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--color-accent) 25%, transparent);
    border-top-color: var(--color-accent);
    animation: bd-btn-spin 700ms linear infinite;
  }
  .bd-wt-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 48px 16px;
    text-align: center;
  }
  .bd-wt-empty-title {
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 600;
  }
  .bd-wt-empty-title strong {
    color: var(--color-accent);
    font-weight: 600;
  }
  .bd-wt-empty-detail {
    color: var(--color-text-muted);
    font-size: 11px;
  }
  .bd-wt-group { display: flex; flex-direction: column; }
  .bd-wt-group + .bd-wt-group { margin-top: 6px; }
  .bd-wt-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px 4px;
  }
  .bd-wt-group-name {
    font-family: var(--font-code);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
  }
  .bd-wt-error-detail {
    font-family: var(--font-code);
    font-size: 10px;
    color: var(--color-error-badge-fg);
    padding: 4px 10px;
    margin: 0 2px 4px;
    background: var(--color-error-badge-bg);
    border: 1px solid var(--color-error-badge-border);
    border-radius: 6px;
  }
  .bd-wt-list { display: flex; flex-direction: column; gap: 1px; }
  .bd-wt-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    background: transparent;
    border-radius: 7px;
    cursor: pointer;
    position: relative;
    transition: background-color 100ms ease;
  }
  .bd-wt-row::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    border-radius: 0 2px 2px 0;
    background: transparent;
    transition: background-color 100ms ease;
  }
  .bd-wt-row:hover { background: var(--color-surface-hover); }
  .bd-wt-row--selected { background: var(--color-selected-row-bg); }
  .bd-wt-row--selected::before { background: var(--color-accent); }
  .bd-wt-row--main::before {
    background: color-mix(in srgb, var(--color-accent) 55%, transparent);
  }
  .bd-wt-row-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-left: 4px;
  }
  .bd-wt-row-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .bd-wt-row-secondary {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-family: var(--font-code);
    font-size: 10px;
    color: var(--color-text-muted);
  }
  .bd-wt-branch {
    font-family: var(--font-code);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex-shrink: 1;
  }
  .bd-wt-branch--detached {
    color: var(--color-text-muted);
    font-style: italic;
    font-weight: 500;
  }
  .bd-wt-folder {
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }
  .bd-wt-parent {
    color: var(--color-text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    direction: rtl;
    text-align: left;
    min-width: 0;
  }
  .bd-wt-row-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 120ms ease;
    flex-shrink: 0;
  }
  .bd-wt-row:hover .bd-wt-row-actions,
  .bd-wt-row--selected .bd-wt-row-actions {
    opacity: 1;
  }
  .bd-wt-star-placeholder {
    display: block;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }
  .bd-wt-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 8px 12px;
    border-top: 1px solid var(--color-separator);
    font-size: 10.5px;
    color: var(--color-text-muted);
    flex-shrink: 0;
    background: var(--color-surface-raised);
  }
  .bd-wt-hint {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .bd-wt-sep { opacity: 0.35; }
```

(Reuse the existing `bd-btn-spin` keyframes already defined in @layer components — no need to duplicate.)

- [ ] **Step 3: Verify it compiles**

```bash
cd ~/projects/borgdock-streamline-05/src/BorgDock.Tauri
npx vite build 2>&1 | tail -30
```

Expected: build succeeds. Look for "[plugin:vite:css]" warnings — broken selectors land here.

If the build fails on a missing class (e.g. an `index.css` rule referenced something that didn't get ported), grep for the missing selector and add it.

- [ ] **Step 4: Commit**

```bash
git add src/styles/index.css
git commit -m "$(cat <<'EOF'
feat(styles): port file-palette/file-viewer/worktree-palette/CodeView CSS into @layer components

Adds bd-fp-*, bd-fv-*, bd-wt-*, bd-code-* class set to index.css's @layer
components block, mirroring the rules in the soon-to-be-deleted per-feature CSS
files. The next commit deletes the source files.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Delete the four per-feature CSS files

**Files:**
- Delete: `src/BorgDock.Tauri/src/styles/file-palette.css`
- Delete: `src/BorgDock.Tauri/src/styles/file-viewer.css`
- Delete: `src/BorgDock.Tauri/src/styles/worktree-palette.css`
- Delete: `src/BorgDock.Tauri/src/components/file-palette/CodeView.css`

- [ ] **Step 1: Confirm zero remaining JSX consumers of the old class names**

```bash
cd ~/projects/borgdock-streamline-05/src/BorgDock.Tauri

# fp-* classes (file-palette.css)
grep -rn 'className="fp-\|className={\`fp-\|fp-root\b\|fp-titlebar\b\|fp-title\b\|fp-body\b\|fp-roots\|fp-root-\|fp-search\|fp-results\|fp-result\|fp-empty\|fp-preview\|fp-middle\|fp-changes\b' src/components src/

# fv-* classes (file-viewer.css)
grep -rn 'className="fv-\|className={\`fv-\|fv-root\b\|fv-toolbar\b\|fv-path\b\|fv-actions\b\|fv-body\b\|fv-empty\b\|fv-segment\b\|fv-seg-btn\|fv-btn\b' src/components src/

# wt-* classes (worktree-palette.css)
grep -rn 'className="wt-\|className={\`wt-\|wt-palette\b\|wt-titlebar\|wt-title\b\|wt-count\b\|wt-row\b\|wt-row-\|wt-branch\|wt-folder\|wt-parent\|wt-action\|wt-star\|wt-search\|wt-content\|wt-loading\|wt-spinner\|wt-empty\|wt-group\|wt-list\|wt-footer\|wt-hint\|wt-kbd\|wt-sep\|wt-btn-icon\|wt-spin\|wt-error' src/components src/

# code-* classes (CodeView.css)
grep -rn 'className="code-view\|className="code-line-\|className={\`code-' src/components src/
```

Expected: zero matches for each. If any match, fix it (re-class to the `bd-` prefix) before proceeding. (The `wt-spin` keyframe reference: the migrated `WorktreePaletteApp` uses Tailwind's `animate-spin` instead, so this shouldn't show up.)

- [ ] **Step 2: Confirm no CSS-in-CSS reference to the deleted files**

```bash
grep -rn '@import.*file-palette\.css\|@import.*file-viewer\.css\|@import.*worktree-palette\.css\|@import.*CodeView\.css' src/
```

Expected: zero matches.

- [ ] **Step 3: Confirm no JS/TS `import` of the deleted files**

```bash
grep -rn "from.*['\"].*styles/file-palette.css\|import ['\"].*styles/file-palette.css\|from.*['\"].*styles/file-viewer.css\|import ['\"].*styles/file-viewer.css\|from.*['\"].*styles/worktree-palette.css\|import ['\"].*styles/worktree-palette.css\|import ['\"]\..*CodeView.css\|from ['\"]\..*CodeView.css" src/
```

Expected: zero matches. Specifically:
- `src/file-palette-main.tsx` — should NOT contain `import './styles/file-palette.css';` after Tasks 4–9.
- `src/file-viewer-main.tsx` — should NOT contain `import './styles/file-viewer.css';` after Tasks 10–11.
- `src/components/worktree-palette/WorktreePaletteApp.tsx` — should NOT contain `import '@/styles/worktree-palette.css';` after Task 12.
- `src/components/file-palette/CodeView.tsx` — should NOT contain `import './CodeView.css';` after Task 9.

If any imports remain, **delete them** before deleting the CSS files.

- [ ] **Step 4: Delete the files**

```bash
rm src/styles/file-palette.css src/styles/file-viewer.css src/styles/worktree-palette.css src/components/file-palette/CodeView.css
```

- [ ] **Step 5: Re-run vite build to confirm nothing broke**

```bash
npx vite build 2>&1 | tail -30
```

Expected: build succeeds with no broken-import errors.

- [ ] **Step 6: Run vitest as a final structural check**

```bash
npm test -- --run 2>&1 | tail -10
```

Expected: 2606 (or 2606 + N for the test files added in Tasks 1–14) tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(styles): delete per-feature CSS files now that consumers are migrated

Deletes:
- src/styles/file-palette.css
- src/styles/file-viewer.css
- src/styles/worktree-palette.css
- src/components/file-palette/CodeView.css

All rules live in @layer components in index.css under bd-fp-*, bd-fv-*,
bd-wt-*, bd-code-* namespaces. Per spec §4.2: no per-feature .css files
remain in the repo after this PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Vitest baseline check + e2e regression diff

**Files:** none (verification only)

- [ ] **Step 1: Full vitest pass**

```bash
cd ~/projects/borgdock-streamline-05/src/BorgDock.Tauri
npm test -- --run 2>&1 | tail -10
```

Expected: pass count is `≥ 2606`. If a test added in Tasks 1–14 brings it up — that's expected. If the count drops, **stop and diagnose**.

Also capture unhandled-rejection count:

```bash
npm test -- --run 2>&1 | grep -ciE "unhandled (rejection|error)"
```

Expected: similar to the PR #4 baseline (PR #4 brought it to 0, but PR #5 may surface new ones in the new test scaffolds; if so, add cancelled-flag guards in those test mocks).

- [ ] **Step 2: Five-spec e2e diff vs Prereq 7 baseline**

```bash
cd ~/projects/borgdock-streamline-05/src/BorgDock.Tauri
npm run test:e2e -- --project=webview-mac \
  tests/e2e/command-palette.spec.ts \
  tests/e2e/file-palette.spec.ts \
  tests/e2e/file-viewer.spec.ts \
  tests/e2e/worktree-palette.spec.ts \
  tests/e2e/sql.spec.ts \
  2>&1 | tee /tmp/pr5-post-e2e.log

diff /tmp/pr5-baseline-e2e.log /tmp/pr5-post-e2e.log | head -100
```

Expected delta:

- `file-palette.spec.ts:14 'renders the search input with placeholder'` — should now PASS (placeholder matches `/search files/i`).
- `file-palette.spec.ts:30 'arrow keys move selection'` — depends on whether seed populates results; if the seed is wired, PASS.
- `file-palette.spec.ts:37 'enter opens the file in preview pane'` — should now PASS (`data-file-preview` added in Task 5).
- `file-palette.spec.ts:43 'escape closes palette'` — `data-window="palette"` added in Task 8; whether Escape actually hides depends on the Tauri window mock (likely still pre-existing infra gap).
- `file-viewer.spec.ts:14 'renders the file path in the titlebar'` — should now PASS (`data-titlebar-path` added in Task 10).
- `file-viewer.spec.ts:18 'renders line numbers'` — should now PASS (`data-line-gutter` + `data-line-number` added in Task 9).
- `file-viewer.spec.ts:25 'syntax tokens get a class'` — should now PASS (`hl-*` className added in Task 9).
- `file-viewer.spec.ts:31 'copy button copies to clipboard'` — should now PASS (`data-action="copy-contents"` on the Button — Task 10).
- `worktree-palette.spec.ts:12 'renders worktree list'` — should now PASS (`data-worktree-row` added in Task 12).
- `worktree-palette.spec.ts:16 'prune action opens confirm dialog'` — STILL RED (no per-row prune button — pre-existing aspirational gap).
- `worktree-palette.spec.ts:22 'checkout flow can be initiated'` — STILL RED (no per-row checkout button — pre-existing aspirational gap).
- `sql.spec.ts:*` — should remain PASS (data-* contracts already existed).
- `command-palette.spec.ts:*` — STILL RED (generic Cmd+K palette doesn't exist — pre-existing aspirational gap).

If any test that was GREEN before is now RED, **stop and fix**. Document any unexpected change.

- [ ] **Step 3: Capture the post-PR baseline numbers**

Append a 1-paragraph summary to `/tmp/pr5-summary.txt`:

```
PR #5 baseline:
- vitest: <N> passed (was 2606)
- unhandled rejections: <N> (was 0 from PR #4)
- e2e (5 specs, webview-mac): <N> passed (was <M> from baseline)
- e2e tests newly green from migration: <list>
- e2e tests still red (pre-existing infra gaps): <list>
```

- [ ] **Step 4: No commit needed for this task** (verification only). Move on to Task 18.

---

### Task 18: Update spec ledger

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-shared-components-design.md`

- [ ] **Step 1: Open the ledger row**

```bash
sed -n '290,302p' docs/superpowers/specs/2026-04-24-shared-components-design.md
```

- [ ] **Step 2: Replace the PR #5 row**

Find the row:

```
| #5 | `feat/streamline-05-palettes` | Planned | — | — | — |
```

Replace with:

```
| #5 | `feat/streamline-05-palettes` | In review | — | 2026-04-25 | Palettes + viewers migration: command-palette/PaletteRow + CommandPalette + PaletteApp; file-palette (RootsColumn, SearchPane, ResultsList, PreviewPane, ChangesSection, FilePaletteApp, CodeView); file-viewer (FileViewerToolbar, FileViewerApp); worktree-palette/WorktreePaletteApp; worktree/WorktreePruneDialog; sql/SqlApp + ResultsTable — all migrated to PR #1 primitives (Avatar, Pill, Chip, Dot, Ring, Button, IconButton, Card, Input, LinearProgress, Kbd). Per-feature CSS deleted: `styles/file-palette.css`, `styles/file-viewer.css`, `styles/worktree-palette.css`, `components/file-palette/CodeView.css` — residual layout ported into `@layer components` in `index.css` under `bd-fp-*` / `bd-fv-*` / `bd-wt-*` / `bd-code-*` namespaces. Per spec §4.2 no per-feature `.css` files remain in the repo after this PR. The last in-scope `--color-filter-chip-bg` JSX consumer outside `settings/**` (the `wt-group-count` chip in `WorktreePaletteApp`) goes away — the token itself stays in `index.css` for PR #6 to delete. Test-contract `data-*` hooks added: `data-file-result`/`data-selected`, `data-file-preview`, `data-window="palette"`, `data-titlebar-path`, `data-line-gutter`/`data-line-number`, `hl-*` className on syntax tokens, `data-action="copy-contents"`, `data-worktree-row`/`data-tree-path`/per-action `data-action`. CodeView syntax highlighting (web-tree-sitter) untouched. <N> vitest pass (+<delta> vs PR #4 baseline 2606). E2e behavioral specs gained <list> green; <list> remain pre-existing aspirational gaps (generic Cmd+K command palette + per-row prune/checkout — out of migration scope, belong in a future palette-feature PR). Visual baselines remain red as expected per `visual.spec.ts` header — that file's progress signal awaits clipTo selectors + URL-routed deep-links (out of PR #5 scope). Opened as stacked PR against `feat/streamline-04-pr-detail` — <PR URL added in fast-follow commit per the spec ritual>.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "$(cat <<'EOF'
docs(spec): mark PR #5 as in review

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(The PR URL goes in a fast-follow commit after Task 19 opens the PR — same pattern as PR #3 and PR #4.)

---

### Task 19: Push branch + open PR + fast-follow ledger commit

**Files:** none (git/gh operations only)

- [ ] **Step 1: Confirm we're on the right branch with all commits**

```bash
cd ~/projects/borgdock-streamline-05
git branch --show-current
# Expected: feat/streamline-05-palettes
git log --oneline feat/streamline-04-pr-detail..HEAD
# Expected: ~19 commits (one per task, +1 ledger update). Order by Task number.
```

- [ ] **Step 2: Switch gh to the personal account**

Per CLAUDE.md global instructions: the default `gh` account is the enterprise account, which can't operate on the personal repo `borght-dev/BorgDock`. Switch:

```bash
gh auth switch --user borght-dev
```

- [ ] **Step 3: Push branch + open PR**

```bash
cd ~/projects/borgdock-streamline-05
git push -u origin feat/streamline-05-palettes

gh pr create \
  --base feat/streamline-04-pr-detail \
  --head feat/streamline-05-palettes \
  --title "Streamline PR #5 — Palettes + viewers" \
  --body "$(cat <<'EOF'
## Summary

Migration of every consumer in `components/file-palette/**`, `components/file-viewer/**`, `components/command-palette/**`, `components/worktree-palette/**`, `components/worktree/**`, and `components/sql/**` onto the PR #1 primitives. Deletes the three per-feature CSS files in `src/styles/` plus the co-located `components/file-palette/CodeView.css`. Adds the test-contract `data-*` hooks the existing PR #0 e2e specs assert on (where the surface naturally supports them). Removes the last in-scope `--color-filter-chip-bg` JSX consumer outside `settings/**` (the `wt-group-count` chip → `<Pill tone="ghost">`).

After this PR, **no per-feature `.css` files remain in the repo** — every feature surface is either Tailwind utilities or `@layer components` in `index.css`. This is spec §4.2's explicit deliverable.

## Scope per spec §8 PR #5 row

- **Migrated:** `command-palette/{CommandPalette, PaletteApp, PaletteRow}.tsx`; `file-palette/{FilePaletteApp, RootsColumn, SearchPane, ResultsList, PreviewPane, ChangesSection, CodeView}.tsx`; `file-viewer/{FileViewerApp, FileViewerToolbar}.tsx`; `worktree-palette/WorktreePaletteApp.tsx`; `worktree/WorktreePruneDialog.tsx`; `sql/{SqlApp, ResultsTable}.tsx`.
- **CSS deleted:** `styles/file-palette.css`, `styles/file-viewer.css`, `styles/worktree-palette.css`, `components/file-palette/CodeView.css`.
- **Layer-ported:** `bd-fp-*`, `bd-fv-*`, `bd-wt-*`, `bd-code-*` class set added to `@layer components` in `index.css`.
- **Token consumer removed:** `worktree-palette.css:297`'s `--color-filter-chip-bg` is gone (used `Pill tone="ghost"` in the migrated JSX). Settings still consumes the token; PR #6 owns the token's deletion itself.

## Out of scope / pre-existing gaps

- The PR #0 `command-palette.spec.ts` targets a generic `Cmd+K` command palette (not the work-item ID search palette currently in `components/command-palette/`). That spec stays red — building a generic command palette is feature work, not migration.
- The PR #0 `worktree-palette.spec.ts` per-row `[data-action="prune"]` and `[data-action="checkout"]` assertions require new per-row actions the surface doesn't expose (prune lives in the global `WorktreePruneDialog`; checkout lives in PR detail's `CheckoutFlow`). Those tests stay red — adding new per-row actions is feature work.
- `visual.spec.ts` `clipTo` + URL-routed deep-link infra remains out of scope — belongs in a dedicated test-infra PR per PR #3's note.
- The Worktree Changes feature (spec §6) lands in PR #7.

## Test plan

- [x] `npm test -- --run` — passes (≥ 2606 vitest tests).
- [x] `npm run test:e2e -- --project=webview-mac tests/e2e/{file-palette,file-viewer,sql}.spec.ts` — net more green than baseline.
- [x] `grep -rn '\\.fp-\|\\.fv-\|\\.wt-\|\\.code-view\\|\\.code-line-' src/components` returns zero matches (all consumers re-namespaced).
- [x] `grep -rn '--color-filter-chip-bg' src/components` returns only `settings/**` matches.
- [x] `npx vite build` succeeds with zero CSS warnings.
- [ ] Visual diff — most palette/viewer surface baselines remain red until the test-infra `clipTo` PR lands.
- [ ] Manual smoke (mac): `npm run tauri dev`, open file palette via Cmd+P, open file viewer, open worktree palette, open SQL window — all render correctly under both `accent-teal` and `accent-amber` themes, light + dark.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL from the `gh pr create` output.

- [ ] **Step 4: Switch gh back to enterprise account**

Per CLAUDE.md global rule:

```bash
gh auth switch --user KvanderBorght_gomocha
```

- [ ] **Step 5: Fast-follow ledger commit with PR URL**

```bash
cd ~/projects/borgdock-streamline-05

# Edit the ledger row added in Task 18; replace the placeholder
# `<PR URL added in fast-follow commit per the spec ritual>` with the real URL.
# Use sed or open the file in $EDITOR.

# Example (adjust URL):
sed -i.bak "s|<PR URL added in fast-follow commit per the spec ritual>|https://github.com/borght-dev/BorgDock/pull/<NUMBER>|" docs/superpowers/specs/2026-04-24-shared-components-design.md
rm docs/superpowers/specs/2026-04-24-shared-components-design.md.bak

git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "$(cat <<'EOF'
docs(spec): add PR #5 URL to PR #5 ledger row

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push
```

- [ ] **Step 6: Verify on GitHub**

The PR should:
- Target `feat/streamline-04-pr-detail` (NOT `master` — unless Prereq 2 forced the fall-back).
- Show ~19 commits.
- CI runs (test-mac + test-win) — expect e2e-suite results to mirror Task 17 (most palette/viewer surfaces newly green; aspirational specs still red).

---

## Self-Review

After writing the complete plan, the controller should run this checklist before dispatching subagents.

**1. Spec coverage:** Every line of the spec §8 PR #5 row maps to a task:
- ✅ Migrate `components/file-palette/*` → Tasks 4–9.
- ✅ Migrate `components/file-viewer/*` → Tasks 10–11.
- ✅ Migrate `components/command-palette/*` → Tasks 1–3.
- ✅ Migrate `components/worktree-palette/*` → Task 12.
- ✅ Migrate `components/worktree/*` → Task 13.
- ✅ Migrate `components/sql/*` → Task 14.
- ✅ Delete `styles/file-palette.css`, `styles/worktree-palette.css`, `styles/file-viewer.css` → Task 16.
- ✅ Residual layout into `@layer components` → Task 15.
- ✅ "after this PR, all feature styling is either Tailwind utilities or `@layer components` — no per-feature `.css` files remain" → Task 16 also deletes `components/file-palette/CodeView.css`.
- ✅ "CodeView keeps its syntax highlighting via web-tree-sitter; only the surrounding frame adopts primitives" → Task 9 explicit instruction.
- ✅ "Remove the remaining `worktree-palette.css:297` reference to `--color-filter-chip-bg`" → Task 12 (Pill replaces the chip), verified by Task 12 Step 5.
- ✅ Update Delivery Ledger → Task 18 + Task 19 Step 5.
- ✅ Switch `gh` to `borght-dev` for PR open, switch back after → Task 19 Step 2 + Step 4.
- ✅ Fresh worktree needs `npm install` before vitest/playwright → Prereq 4.
- ✅ Visual.spec.ts `clipTo` infra gap stays out of scope → spec ledger row + PR body explicitly call this out.
- ✅ Test-contract data-* hooks read from existing specs first → Prereq 7 + Task 17 Step 2.
- ✅ PR #4 baseline 2606 vitest pass / 0 unhandled rejections carries cleanly → Prereq 5 + Task 17 Step 1.

**2. Placeholder scan:** No "TBD" / "implement later" / "fill in details" / "add appropriate error handling" / "Similar to Task N" remain in the plan. Every code block contains the actual code. Every `grep` shows the actual command + expected pattern.

**3. Type consistency:** Primitive prop names match what `src/components/shared/primitives/index.ts` exports — `Pill` accepts `tone` (not `variant`); `Button` accepts `variant` + `size` (not `tone`); `IconButton` accepts `icon` + `size` (22 / 26 / 30); `Input` accepts `leading` / `trailing`; `Chip` accepts `active` (the `disabled` and `title` HTML attrs flow through via spread — verify with the actual Chip.tsx in Task 10 Step 4 if uncertain). `Kbd` is a wrapper — its prop names are verified at Task 12 Step 3 step 7.

**4. Cross-task dependencies:** Tasks 1–14 each touch their own files; only Task 15 + Task 16 cross-cut (`index.css` and the deletes). Task 15 must come BEFORE Task 16 (otherwise the migrated components will render unstyled between commits). Task 17 verifies after both. Task 18 + 19 are wrap-up.

**5. Risk:** The biggest single file is `WorktreePaletteApp.tsx` at 696 lines (Task 12). Subagent should split the migration mentally into "WorktreeRow sub-component", "Titlebar", "Search", "Group header / list / footer" — but commit as one task so the test stays cohesive. The second-biggest is `SqlApp.tsx` at 578 lines (Task 14) but it's a lighter touch (most of its bespoke classes already live in `index.css`).

If any inconsistency is found, fix inline. No need to re-review.

---

## Execution Handoff

After saving this plan: dispatch via `superpowers:subagent-driven-development`. Fresh subagent per task; two-stage review (spec compliance, then code quality) after each. Mark each TodoWrite item complete as soon as the second review approves.

**Recommended dispatch order:** sequentially Task 1 → Task 19. Tasks 1–14 each touch isolated files so technically parallelizable, but `index.css` (Task 15) needs all 14 to land first; running sequentially keeps the controller's mental model simple and the subagent context windows tight.
