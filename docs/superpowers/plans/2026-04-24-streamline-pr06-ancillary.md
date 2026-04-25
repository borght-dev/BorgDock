# Streamline PR #6 — Ancillary Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every consumer in `components/settings/**`, `components/wizard/**`, `components/onboarding/**`, `components/notifications/**`, and `components/whats-new/**` onto the PR #1 primitives; rebuild the Floating Badge (NotificationBubble — 5 severity variants) on `elevation-2` + status-glow tokens via Tailwind utilities; finish the spec §4.3 sweep so every remaining `style={{}}` across `src/` is either eliminated or carries a single-line justification comment; delete the `--color-filter-chip-bg` / `--color-filter-chip-fg` tokens from `src/styles/index.css` once the last settings consumers migrate; restore the 13 wrapper-style `WorktreePruneDialog` test permutations PR #5's Task 13 dropped (covering empty / loading / path-truncation / plural / refs-heads-stripping / multi-select-count); and fix the `text-muted` color-contrast token so `whats-new.spec.ts` can drop its `disableRules: ['color-contrast']` guard.

**Architecture:** PR #6 is a pure migration PR — no new domain features, no Rust changes. Every migrated file replaces ad-hoc styled `<button>` / `<input>` / `<span>` / `<div>` chrome with the matching primitive (`Button`, `IconButton`, `Pill`, `Chip`, `Dot`, `Card`, `Input`, `LinearProgress`, `Kbd`, `Avatar`) imported from `@/components/shared/primitives`. The dominant settings pattern — a row of segmented toggle buttons (theme picker, sidebar edge, sidebar mode) — collapses to `<Chip active={value === current} onClick={…}>label</Chip>` with the active tone pulled from accent tokens. The toggle switch pattern (run-at-startup, notification toggles, telemetry) becomes a small purpose-built `<ToggleSwitch>` consumed locally by the settings sections (it stays feature-local — settings doesn't justify another primitive). The Floating Badge is the existing `NotificationBubble`: its 5 severity variants (`success` / `error` / `warning` / `info` / `merged`) keep their stripe + glow colors but rebuild the bubble's frame on `Card` + `IconButton`, lifting `elevation-2` and `status-glow-*` to Tailwind arbitrary utilities (`shadow-[var(--elevation-2)]`, `shadow-[0_0_28px_var(--color-toast-success-glow)]`). The `style={{}}` sweep is data-driven: enumerate every occurrence with `grep -n`, classify each as **(a)** chromatic and replaceable with a Tailwind utility or a primitive prop, **(b)** dynamic (positioning, custom property, motion delay) and inherently style-bound, or **(c)** unused dead leftover. (a) gets fixed; (b) gets a one-line `// style: <reason>` justification comment; (c) gets deleted. Where existing components naturally already render the right shape but lack a test-contract `data-*` hook (e.g. `data-settings-section`, `data-toggle`, `data-wizard-step`, `data-notification-severity`, `data-release-version`, `data-onboarding-hint`), we add the attribute inline (PR #2/3/4/5's pattern). The dropped `WorktreePruneDialog` permutations get restored as a wrapper-style test file (`TestDialog` shim that exercises the same JSX without the Set-deps render-loop) — the cleanest answer is the same shim PR #4 used; reworking the real component's render-loop is out of PR #6 scope (the shim covers the visual contract; a future PR can refactor the real component if desired). Finally the `text-muted` token gets nudged to a higher-contrast value in dark and light themes so WCAG 2.1 AA passes; a unit test asserts the computed contrast ratio against `--color-surface-raised` so the regression can't silently return.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 `@theme`, Vitest + Testing Library (jsdom) for unit tests, Playwright (`webview-mac` / `webview-win` projects) for behavioral + visual + a11y regression. Primitives at `src/BorgDock.Tauri/src/components/shared/primitives/` (locked, PR #1). Chrome composed components at `src/BorgDock.Tauri/src/components/shared/chrome/` (locked, PR #2). Work happens in worktree `~/projects/borgdock-streamline-06` on branch `feat/streamline-06-ancillary`, stacked on `feat/streamline-05-palettes`.

---

## Scope notes — what this PR does and does NOT touch

**In scope (per spec §8 PR #6 row + the dispatch instructions):**

- All files under `src/BorgDock.Tauri/src/components/settings/**` — `AdoSection.tsx` (218), `AppearanceSection.tsx` (184), `ClaudeApiSection.tsx` (60), `ClaudeSection.tsx` (50), `GitHubSection.tsx` (97), `HotkeyRecorder.tsx` (94), `NotificationSection.tsx` (222), `RepoSection.tsx` (161), `SettingsFlyout.tsx` (195), `SqlSection.tsx` (258), `UpdateSection.tsx` (96).
- All files under `src/BorgDock.Tauri/src/components/wizard/**` — `AuthStep.tsx` (124), `RepoStep.tsx` (169), `SetupWizard.tsx` (201).
- All files under `src/BorgDock.Tauri/src/components/onboarding/**` — `FeatureBadge.tsx` (25), `FirstRunOverlay.tsx` (47), `InlineHint.tsx` (50). The barrel `index.ts` only re-exports; no JSX.
- All files under `src/BorgDock.Tauri/src/components/notifications/**` — `NotificationBubble.tsx` (318 — the Floating Badge frame), `NotificationManager.tsx` (69), `NotificationOverlay.tsx` (21).
- All files under `src/BorgDock.Tauri/src/components/whats-new/**` — `AlsoFixedList.tsx` (38), `HeroBanner.tsx` (91), `HighlightCard.tsx` (72), `ReleaseAccordion.tsx` (72), `WhatsNewApp.tsx` (194). The `useReleasesToShow.ts` hook and `index.ts` barrel have no JSX.
- `src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx` — restore the 13 wrapper-style permutations dropped in PR #5 Task 13 (empty / loading / path-truncation×2 / plural / singular / refs-heads-stripping / multi-select-count + status-class permutations).
- `src/BorgDock.Tauri/src/styles/index.css` — delete the `--color-filter-chip-bg` / `--color-filter-chip-fg` token declarations from the light theme block (lines 317–318), the dark theme block (lines 607–608), and the `@theme inline` block (lines 54–55). Bump `--color-text-muted` light + dark values to pass WCAG 2.1 AA against `--color-surface-raised`.
- `src/BorgDock.Tauri/tests/e2e/whats-new.spec.ts` — drop the `disableRules: ['color-contrast']` argument once `--color-text-muted` is fixed (and remove the now-stale comment).
- `docs/superpowers/specs/2026-04-24-shared-components-design.md` — Delivery Ledger row for PR #6.

**Out of scope (deferred to PR #7 or a dedicated future PR):**

- The Worktree Changes feature (§6 of the spec — Rust commands, the React panel, the integration into the worktree palette as a tab). That's PR #7.
- `tests/e2e/visual.spec.ts`'s `clipTo` selectors + URL-routed deep-links infra gap. Per PR #3/#4/#5 ledger notes, that gap belongs to a dedicated test-infra PR, not any individual surface PR.
- Refactoring the underlying render-loop in `WorktreePruneDialog.tsx` so the real component can be tested without a wrapper. PR #5's Task 13 chose to swap the wrapper for a thin two-test direct-component file, dropping coverage permutations. PR #6 restores the dropped permutations using the same wrapper shim PR #4 used; a real-component refactor is a separate concern.
- A general "command palette" with `[data-command-palette]` + `[data-command-item]` (the aspirational `command-palette.spec.ts` + `worktree-palette.spec.ts:16/22` gaps flagged in PR #5 stay out of scope here too).
- The 8 unhandled cross-test `invoke()` rejections in `onboarding-store.test.ts` baseline. They're identical in shape to the PR #3 cluster A/B/C rejections PR #4 fixed via mounted-flag guards, but located in a `useOnboardingStore` Tauri-store init and a `loadDismissed` race; fixing them belongs in a dedicated store-init PR (or in PR #7 if a settings consumer requires it). PR #6 confirms the count stays at 8 (no new ones introduced) and documents the unchanged status in the ledger.

**The token-deletion in spec §8** maps to a verify-then-delete step (Task 21) that:

1. Greps `src/` for any remaining `--color-filter-chip-bg` / `--color-filter-chip-fg` reference. Migrations in Tasks 11–20 must drive the count to **zero outside `index.css` itself** before this task runs.
2. Removes the three pairs of declarations in `index.css` (`@theme inline`, light, dark) — 6 lines total.
3. Verifies no test or grep regression remains.

---

## Prerequisites

- [ ] **Prereq 1: Confirm worktree, branch, base commit**

This plan is written from the `feat/streamline-03-pr-surfaces` worktree (`~/projects/borgdock-streamline-03`) but the new branch was already created (see Prereq 3). Execution happens in the fresh stacked worktree at `~/projects/borgdock-streamline-06`:

```bash
cd ~/projects/borgdock-streamline-06

# Confirm branch
git branch --show-current
# Expected: feat/streamline-06-ancillary

git log --oneline -1
# Expected: ecbbe590 docs(spec): add PR #5 URL to PR #5 ledger row
# (or a newer commit if PR #5 had follow-up commits)

git log feat/streamline-05-palettes..HEAD --oneline
# Expected: empty (no commits yet on this branch above PR #5's HEAD)
```

If `git log` shows a different head, run `git log feat/streamline-04-pr-detail..HEAD --oneline` — it should list the PR #5 commit history. If it doesn't, abort and reconcile the branch state before continuing.

- [ ] **Prereq 2: Confirm `feat/streamline-05-palettes` still exists on origin**

```bash
cd ~/projects/borgdock-streamline-06
git fetch origin
git rev-parse --verify origin/feat/streamline-05-palettes
# Expected: a SHA (any 40-char hex). Failure means PR #5 was renamed or merged.
```

If `origin/feat/streamline-05-palettes` is gone but `master` has advanced (PR #5 merged while you were away), this plan's "open PR" task uses `master` instead of `feat/streamline-05-palettes` as the base. Note the change in this plan's commit message.

- [ ] **Prereq 3: Worktree creation (already done — verify only)**

The worktree was created during plan-writing via:

```bash
git -C ~/projects/borgdock-streamline-05 \
  worktree add ~/projects/borgdock-streamline-06 \
  -b feat/streamline-06-ancillary feat/streamline-05-palettes
```

Verify:

```bash
git worktree list | grep borgdock-streamline-06
# Expected: /Users/koenvdb/projects/borgdock-streamline-06 <SHA> [feat/streamline-06-ancillary]
```

If the line is missing, re-run the `git worktree add` command above.

- [ ] **Prereq 4: Install dependencies (already done — verify only)**

A fresh worktree has no `node_modules/`. Verify:

```bash
ls ~/projects/borgdock-streamline-06/src/BorgDock.Tauri/node_modules/.bin/vitest 2>/dev/null && echo "deps present"
```

Expected: `deps present`. If missing, run:

```bash
cd ~/projects/borgdock-streamline-06/src/BorgDock.Tauri
npm install
```

The `web-tree-sitter` postinstall step may print a wasm warning — that's normal.

- [ ] **Prereq 5: Confirm vitest baseline carries cleanly**

```bash
cd ~/projects/borgdock-streamline-06/src/BorgDock.Tauri
npm test -- --run 2>&1 | tail -10
```

Expected (verified during plan-writing):

```
 Test Files  188 passed (188)
      Tests  2593 passed (2593)
     Errors  8 errors
```

The 8 errors are the known `onboarding-store.test.ts` async-mock rejections (same shape as PR #3/4 cluster) — they don't fail any individual test and are documented as out-of-scope for PR #6 in the Scope notes above. The 2593-test pass count is the PR #5 baseline; **after Task 1 restores the 13 dropped WorktreePruneDialog permutations, the running count must climb to 2606**, and stay ≥2606 through every subsequent task.

If the baseline is below 2593 (i.e., something regressed since PR #5 was opened) or the 8 errors have changed shape, abort and reconcile before any migration work.

---

## File structure overview

After this PR, the touched directory tree looks like:

```
src/BorgDock.Tauri/src/
├── components/
│   ├── notifications/
│   │   ├── NotificationBubble.tsx        ← Card frame, IconButton dismiss, elevation-2 + status-glow utilities
│   │   ├── NotificationManager.tsx       ← unchanged logic; pruned style imports
│   │   └── NotificationOverlay.tsx       ← container only; no styling change
│   ├── onboarding/
│   │   ├── FeatureBadge.tsx              ← Pill primitive
│   │   ├── FirstRunOverlay.tsx           ← Card + Button primitives
│   │   ├── InlineHint.tsx                ← Card variant + IconButton dismiss
│   │   └── index.ts                      ← unchanged barrel
│   ├── settings/
│   │   ├── AdoSection.tsx                ← Chip toggles + Input + Button
│   │   ├── AppearanceSection.tsx         ← Chip segmented controls + ToggleSwitch + Input range
│   │   ├── ClaudeApiSection.tsx          ← Input + Button
│   │   ├── ClaudeSection.tsx             ← Input
│   │   ├── GitHubSection.tsx             ← Chip toggles + Input + Button
│   │   ├── HotkeyRecorder.tsx            ← Button (variant-driven recording state)
│   │   ├── NotificationSection.tsx       ← ToggleSwitch repeated; Input
│   │   ├── RepoSection.tsx               ← Card per repo + ToggleSwitch + IconButton
│   │   ├── SettingsFlyout.tsx            ← FocusTrap shell + Card sections + IconButton close
│   │   ├── SqlSection.tsx                ← Chip toggle + Input + Button
│   │   ├── UpdateSection.tsx             ← Chip toggle + ToggleSwitch + LinearProgress
│   │   └── _ToggleSwitch.tsx             ← NEW — small feature-local switch (settings only); not a primitive
│   ├── wizard/
│   │   ├── AuthStep.tsx                  ← Card method picker + Input + Button
│   │   ├── RepoStep.tsx                  ← Card per repo + Chip + Button
│   │   └── SetupWizard.tsx               ← Card overlay + Button + step indicator dots
│   ├── whats-new/
│   │   ├── AlsoFixedList.tsx             ← Pill list
│   │   ├── HeroBanner.tsx                ← Card variant + Pill + Button
│   │   ├── HighlightCard.tsx             ← Card + Pill (kind tone)
│   │   ├── ReleaseAccordion.tsx          ← Card + IconButton expand
│   │   ├── useReleasesToShow.ts          ← unchanged hook
│   │   ├── WhatsNewApp.tsx               ← Card frame + Pill version chip
│   │   └── index.ts                      ← unchanged barrel
│   └── worktree/
│       └── __tests__/
│           └── WorktreePruneDialog.test.tsx  ← restored wrapper-style suite (≥13 permutations)
├── styles/
│   └── index.css                          ← bumped --color-text-muted (light + dark); deleted --color-filter-chip-bg/fg in @theme + light + dark
└── tests/
    └── e2e/
        └── whats-new.spec.ts              ← drop disableRules: ['color-contrast'] (a11y now passes natively)
```

A new `_ToggleSwitch.tsx` lives alongside the settings sections it serves (the leading underscore signals "feature-local; not a primitive"). The repeated toggle pattern (`AppearanceSection.tsx`'s `Run at startup`, `NotificationSection.tsx`'s 5 toggles, `RepoSection.tsx`'s per-repo enable, `UpdateSection.tsx`'s auto-update enable) collapses to one component.

---

### Task 1: Restore `WorktreePruneDialog` wrapper-style test permutations

**Why this is Task 1, not later:** PR #5's ledger flagged the 13-permutation drop as a PR #6 follow-up. Restoring them first lifts the running test count to ≥2606 *before* any migration work starts. That way every subsequent task can assert "vitest count must stay ≥2606" — same discipline PR #4 / #5 followed against their own pre-migration baselines.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx` (full rewrite — current file is 26 lines; new file is the wrapper-style suite, ≥13 permutations across the listed scenarios)

**Background context (read-only — do not commit this section):**

The pre-PR5 file (`git show 2f6c65bc^:src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx`) used a `TestDialog` wrapper because the real `WorktreePruneDialog` had a render-loop issue with `Set` objects in `useCallback` deps. The wrapper exercised the same JSX shape (status pills, count strings, prune-toolbar, progress bar, error banner) without the loop. PR #5's Task 13 swapped that wrapper for a 2-test direct-component file (verifying only `role="dialog"` + Remove-button-disabled-when-empty), dropping the 13 permutation tests.

The fix: restore the wrapper-style file. Keep the two direct-component tests PR #5 added (so we don't lose those either). The result is a hybrid file: wrapper-style for permutations the real component would render, direct-component for the dialog-shell contract.

- [ ] **Step 1.1: Read the dropped file from git**

```bash
cd ~/projects/borgdock-streamline-06
git show 2f6c65bc^:src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx > /tmp/pr06-prune-tests-original.txt
wc -l /tmp/pr06-prune-tests-original.txt
# Expected: 708 lines
```

- [ ] **Step 1.2: Write the restored test file**

Write the full file at `src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx` with the following content. The structure: a `TestDialog` component that mirrors the real `WorktreePruneDialog`'s JSX + handler contract, plus the wrapper-style `describe('WorktreePruneDialog', …)` block exercising it, plus the helper-function `describe`s, plus the two direct-component tests PR #5 added.

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/stores/pr-store', () => ({
  usePrStore: (selector: (s: unknown) => unknown) =>
    selector({ pullRequests: [], closedPullRequests: [] }),
}));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ settings: { repos: [] } }),
}));

// --- Helpers replicated from the module under test ---
function statusLabel(status: 'open' | 'closed' | 'orphaned'): string {
  switch (status) {
    case 'open':
      return 'Open PR';
    case 'closed':
      return 'Closed';
    case 'orphaned':
      return 'Orphaned';
  }
}

function statusClasses(status: 'open' | 'closed' | 'orphaned'): string {
  switch (status) {
    case 'open':
      return 'bg-[var(--color-success-badge-bg)] text-[var(--color-success-badge-fg)] border border-[var(--color-success-badge-border)]';
    case 'closed':
      return 'bg-[var(--color-draft-badge-bg)] text-[var(--color-draft-badge-fg)] border border-[var(--color-draft-badge-border)]';
    case 'orphaned':
      return 'bg-[var(--color-error-badge-bg)] text-[var(--color-error-badge-fg)] border border-[var(--color-error-badge-border)]';
  }
}

function truncatePath(path: string, maxLen = 50): string {
  if (path.length <= maxLen) return path;
  return `...${path.slice(-(maxLen - 3))}`;
}

interface PruneRow {
  branchName: string;
  path: string;
  status: 'open' | 'closed' | 'orphaned';
  isSelected: boolean;
}

interface TestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rows: PruneRow[];
  isLoading: boolean;
  isRemoving?: boolean;
  removeProgress?: number;
  removeTotal?: number;
  error?: string;
  onToggleRow: (i: number) => void;
  onSelectAllOrphaned: () => void;
  onDeselectAll: () => void;
  onRemoveSelected: () => void;
}

function TestDialog({
  isOpen,
  onClose,
  rows,
  isLoading,
  isRemoving,
  removeProgress,
  removeTotal,
  error,
  onToggleRow,
  onSelectAllOrphaned,
  onDeselectAll,
  onRemoveSelected,
}: TestDialogProps) {
  if (!isOpen) return null;
  const selectedCount = rows.filter((r) => r.isSelected).length;
  const stripPrefix = (b: string) =>
    b.startsWith('refs/heads/') ? b.slice('refs/heads/'.length) : b;

  return (
    <div role="dialog" aria-modal="true" aria-label="Prune worktrees">
      <div onClick={onClose} data-testid="overlay" />
      <div>
        <header>
          <h2>Prune Worktrees</h2>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div>
          <button onClick={onSelectAllOrphaned}>Select Orphaned</button>
          <button onClick={onDeselectAll}>Deselect All</button>
        </div>
        {isLoading && <div role="status">Loading worktrees…</div>}
        {!isLoading && rows.length === 0 && (
          <div data-testid="empty">No worktrees to prune.</div>
        )}
        {!isLoading && rows.length > 0 && (
          <>
            <div data-testid="count">
              {rows.length === 1 ? '1 worktree found' : `${rows.length} worktrees found`}
            </div>
            <ul>
              {rows.map((r, i) => (
                <li
                  key={i}
                  data-testid={`row-${i}`}
                  data-selected={r.isSelected ? 'true' : 'false'}
                  className={r.isSelected ? 'bg-[var(--color-accent-subtle)]' : ''}
                >
                  <input
                    type="checkbox"
                    checked={r.isSelected}
                    onChange={() => onToggleRow(i)}
                    aria-label={`Select ${stripPrefix(r.branchName)}`}
                  />
                  <span>{stripPrefix(r.branchName)}</span>
                  <span>{truncatePath(r.path)}</span>
                  <span className={statusClasses(r.status)}>{statusLabel(r.status)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <div role="alert">{error}</div>}
        {isRemoving && removeTotal !== undefined && (
          <div role="progressbar" aria-valuenow={removeProgress ?? 0} aria-valuemax={removeTotal}>
            {removeProgress ?? 0} / {removeTotal}
          </div>
        )}
        <footer>
          <button onClick={onClose}>Close</button>
          <button
            onClick={onRemoveSelected}
            disabled={selectedCount === 0 || isRemoving}
          >
            Remove selected ({selectedCount})
          </button>
        </footer>
      </div>
    </div>
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- 1) Wrapper-style permutation suite (≥13 cases) ---

describe('WorktreePruneDialog (wrapper)', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    rows: [],
    isLoading: false,
    onToggleRow: vi.fn(),
    onSelectAllOrphaned: vi.fn(),
    onDeselectAll: vi.fn(),
    onRemoveSelected: vi.fn(),
  };

  it('returns null when not open', () => {
    const { container } = render(<TestDialog {...baseProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows empty message when no worktrees and not loading', () => {
    render(<TestDialog {...baseProps} rows={[]} isLoading={false} />);
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });

  it('shows loading indicator when isLoading is true', () => {
    render(<TestDialog {...baseProps} isLoading={true} />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading worktrees/i);
  });

  it('does not show empty message while loading', () => {
    render(<TestDialog {...baseProps} rows={[]} isLoading={true} />);
    expect(screen.queryByTestId('empty')).not.toBeInTheDocument();
  });

  it('shows worktree count (plural) for multiple rows', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[
          { branchName: 'a', path: '/a', status: 'open', isSelected: false },
          { branchName: 'b', path: '/b', status: 'closed', isSelected: false },
          { branchName: 'c', path: '/c', status: 'orphaned', isSelected: false },
        ]}
      />,
    );
    expect(screen.getByTestId('count')).toHaveTextContent('3 worktrees found');
  });

  it('shows worktree count (singular) for one row', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: false }]}
      />,
    );
    expect(screen.getByTestId('count')).toHaveTextContent('1 worktree found');
  });

  it('strips refs/heads/ prefix from branch names', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[
          { branchName: 'refs/heads/feature/x', path: '/x', status: 'open', isSelected: false },
        ]}
      />,
    );
    expect(screen.getByText('feature/x')).toBeInTheDocument();
    expect(screen.queryByText('refs/heads/feature/x')).not.toBeInTheDocument();
  });

  it('truncates long paths with ... prefix', () => {
    const longPath = '/a/very/long/path/to/some/deep/worktree/folder/that/exceeds/fifty/characters';
    render(
      <TestDialog
        {...baseProps}
        rows={[{ branchName: 'long', path: longPath, status: 'open', isSelected: false }]}
      />,
    );
    expect(screen.getByText(/^\.\.\..*characters$/)).toBeInTheDocument();
  });

  it('does not truncate short paths', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[{ branchName: 'x', path: '/short', status: 'open', isSelected: false }]}
      />,
    );
    expect(screen.getByText('/short')).toBeInTheDocument();
  });

  it('applies selected row styling when row is selected', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: true }]}
      />,
    );
    expect(screen.getByTestId('row-0')).toHaveAttribute('data-selected', 'true');
  });

  it('handles multiple selected rows in count', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[
          { branchName: 'a', path: '/a', status: 'open', isSelected: true },
          { branchName: 'b', path: '/b', status: 'closed', isSelected: true },
          { branchName: 'c', path: '/c', status: 'orphaned', isSelected: false },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /remove selected \(2\)/i })).toBeEnabled();
  });

  it('shows error message via role="alert"', () => {
    render(<TestDialog {...baseProps} error="Something exploded" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something exploded');
  });

  it('shows progress bar when removing with totals', () => {
    render(
      <TestDialog
        {...baseProps}
        isRemoving={true}
        removeProgress={2}
        removeTotal={5}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: true }]}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
  });

  it('disables Remove button during removal', () => {
    render(
      <TestDialog
        {...baseProps}
        isRemoving={true}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: true }]}
      />,
    );
    expect(screen.getByRole('button', { name: /remove selected/i })).toBeDisabled();
  });

  it('calls onClose from header X button', () => {
    const onClose = vi.fn();
    render(<TestDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onToggleRow when checkbox changes', () => {
    const onToggleRow = vi.fn();
    render(
      <TestDialog
        {...baseProps}
        onToggleRow={onToggleRow}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: false }]}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleRow).toHaveBeenCalledWith(0);
  });

  it('calls onSelectAllOrphaned and onDeselectAll', () => {
    const onSelectAllOrphaned = vi.fn();
    const onDeselectAll = vi.fn();
    render(
      <TestDialog
        {...baseProps}
        onSelectAllOrphaned={onSelectAllOrphaned}
        onDeselectAll={onDeselectAll}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /select orphaned/i }));
    fireEvent.click(screen.getByRole('button', { name: /deselect all/i }));
    expect(onSelectAllOrphaned).toHaveBeenCalled();
    expect(onDeselectAll).toHaveBeenCalled();
  });

  it('calls onRemoveSelected when Remove button clicked with selection', () => {
    const onRemoveSelected = vi.fn();
    render(
      <TestDialog
        {...baseProps}
        onRemoveSelected={onRemoveSelected}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: true }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove selected/i }));
    expect(onRemoveSelected).toHaveBeenCalled();
  });
});

// --- 2) Helper-function suites ---

describe('statusLabel', () => {
  it('returns "Open PR" for open', () => {
    expect(statusLabel('open')).toBe('Open PR');
  });
  it('returns "Closed" for closed', () => {
    expect(statusLabel('closed')).toBe('Closed');
  });
  it('returns "Orphaned" for orphaned', () => {
    expect(statusLabel('orphaned')).toBe('Orphaned');
  });
});

describe('statusClasses', () => {
  it('returns success classes for open', () => {
    expect(statusClasses('open')).toMatch(/success-badge/);
  });
  it('returns draft classes for closed', () => {
    expect(statusClasses('closed')).toMatch(/draft-badge/);
  });
  it('returns error classes for orphaned', () => {
    expect(statusClasses('orphaned')).toMatch(/error-badge/);
  });
});

describe('truncatePath', () => {
  it('returns path as-is when short', () => {
    expect(truncatePath('/short', 50)).toBe('/short');
  });
  it('truncates long paths with ... prefix', () => {
    const long = 'x'.repeat(60);
    const out = truncatePath(long, 50);
    expect(out.startsWith('...')).toBe(true);
    expect(out).toHaveLength(50);
  });
  it('respects custom maxLen', () => {
    expect(truncatePath('abcdefghij', 5)).toBe('...ij');
  });
  it('returns exact length path unchanged', () => {
    const exact = 'x'.repeat(50);
    expect(truncatePath(exact, 50)).toBe(exact);
  });
});

// --- 3) Direct-component dialog-shell contract (kept from PR #5) ---

import { WorktreePruneDialog } from '../WorktreePruneDialog';

describe('WorktreePruneDialog (component)', () => {
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

- [ ] **Step 1.3: Run the restored suite**

```bash
cd ~/projects/borgdock-streamline-06/src/BorgDock.Tauri
npm test -- --run src/components/worktree/__tests__/WorktreePruneDialog.test.tsx 2>&1 | tail -20
```

Expected: `Tests  19 passed (19)` — 16 wrapper + 3 statusLabel + 3 statusClasses + 4 truncatePath + 2 component = 28 total. Treat anything <19 wrapper-suite cases as a failure (typo / vi.fn missing). The exact total may differ slightly if you collapse cases — minimum is **13 wrapper-style permutations + 2 direct-component tests = 15 total in this file**, exceeding PR #5's 2.

- [ ] **Step 1.4: Run the full vitest suite**

```bash
npm test -- --run 2>&1 | tail -8
```

Expected: `Tests  ≥2606 passed`. 2593 baseline + at least 13 net new permutations. The 8 known errors stay at 8 (don't introduce new ones).

- [ ] **Step 1.5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx
git commit -m "$(cat <<'EOF'
test(worktree): restore WorktreePruneDialog wrapper-style permutations

Restores the 13+ permutation tests dropped in PR #5 Task 13 covering
empty/loading/path-truncation/plural/refs-heads-stripping/multi-select-count
and progress/error/disabled states. Uses the same TestDialog wrapper PR #4
relied on (real component has a Set-deps render-loop the wrapper avoids;
refactoring the real component is out of PR #6 scope).

Keeps the two direct-component tests PR #5 added so the dialog-shell
contract is still asserted against the real component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify:

```bash
git log --oneline -1
# Expected: <SHA> test(worktree): restore WorktreePruneDialog wrapper-style permutations
```

---

### Task 2: Migrate `notifications/NotificationBubble.tsx` (Floating Badge)

This is the spec §8 PR #6 row's "Floating Badge (5 variants)" item. The 5 variants — `success`, `error`, `warning`, `info`, `merged` — keep their stripe and glow color tokens but rebuild the bubble's outer frame on `Card` + `IconButton`, lifting `--elevation-2` and `--color-toast-*-glow` to Tailwind arbitrary utilities so we don't carry inline `style={{ boxShadow: … }}` across every render.

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/notifications/NotificationBubble.tsx` (318 lines → ~280)
- Modify: `src/BorgDock.Tauri/src/components/notifications/__tests__/NotificationBubble.test.tsx` (existing — extend with severity-attribute assertion)

**Read first:** `src/BorgDock.Tauri/src/components/notifications/NotificationBubble.tsx:1-318` end-to-end. Note the existing `SEVERITY_CONFIG` map (5 entries: `success`/`error`/`warning`/`info`/`merged`); the action-buttons block; the progress-bar at `:303` (`<div className="h-[2px]" style={{ background: 'var(--color-badge-progress-track)' }}>`); the `ENTER_MS`/`EXIT_MS` constants; the `phase: 'enter' | 'visible' | 'exit'` state machine.

**Read for primitives:** `src/BorgDock.Tauri/src/components/shared/primitives/Card.tsx` and `IconButton.tsx`. Card supports `padding="sm" | "md" | "lg"`; IconButton has `size: 22 | 26 | 30`.

- [ ] **Step 2.1: Identify what stays inline vs what becomes a primitive**

Stays inline (chromatic data driven by `severity`):
- The 4-px left stripe (`config.stripe`).
- The icon disc background + foreground.
- The progress-bar fill color.
- The animated glow (`box-shadow`) — moves to a Tailwind arbitrary utility on the outer Card: `shadow-[0_0_28px_var(--color-toast-${severity}-glow)]` is dynamic, so it stays on a single style attribute with a `// style: severity-driven glow color` justification comment (this is intended residue).

Replaced with primitives:
- Outer container → `Card variant="default" padding="sm"` plus the dynamic glow style above.
- Dismiss `<button>` → `IconButton size={22} icon={<XIcon />} aria-label="Dismiss" />`.
- Action buttons (the per-action `<a>` chips) → `Pill tone="ghost"` wrapping a clickable `<a>` (or `<button>` if no URL).

- [ ] **Step 2.2: Rewrite the file**

Read the current file fully via the `Read` tool, then replace its body with the primitive-driven version. The structure stays identical (props, state-machine, raf progress loop, hover-pause, action handling) — only the JSX shape changes. Below is the AFTER `return` block — keep all the imports, `SEVERITY_CONFIG`, constants, and effect-handlers above unchanged except for swapping `clsx` arg order if needed:

```tsx
return (
  <Card
    variant="default"
    padding="sm"
    data-toast
    data-notification-severity={severity}
    role="alert"
    aria-live={isMerged ? 'assertive' : 'polite'}
    className={clsx(
      'relative w-[360px] overflow-hidden rounded-xl border-l-4 p-0',
      'shadow-[var(--elevation-2)]',
      // Severity-driven glow lives in style — the token name is dynamic.
      'transition-transform duration-[var(--duration-ui)]',
      phase === 'enter' && 'translate-x-2 opacity-0',
      phase === 'visible' && 'translate-x-0 opacity-100',
      phase === 'exit' && 'translate-x-3 opacity-0',
    )}
    style={{
      borderLeftColor: config.stripe,
      // style: severity-driven glow — token name (--color-toast-{severity}-glow) varies per render
      boxShadow: `var(--elevation-2), 0 0 28px ${config.glow}`,
    }}
    onMouseEnter={() => {
      pausedRef.current = true;
    }}
    onMouseLeave={() => {
      pausedRef.current = false;
    }}
  >
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <div
        aria-hidden
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
        style={{
          // style: severity-driven icon-background — token name varies per render
          background: config.iconBg,
          color: config.iconColor,
        }}
      >
        {config.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-[var(--color-text-primary)]" data-notification-title>
          {notification.title}
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]" data-notification-message>
          {notification.message}
        </div>
        {notification.actions && notification.actions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" data-notification-actions>
            {notification.actions.map((action, i) => (
              <Pill key={i} tone="ghost">
                {action.url ? (
                  <a
                    href={action.url}
                    onClick={(e) => {
                      e.preventDefault();
                      void openUrl(action.url);
                    }}
                  >
                    {action.label}
                  </a>
                ) : (
                  <button type="button">{action.label}</button>
                )}
              </Pill>
            ))}
          </div>
        )}
      </div>
      <IconButton
        size={22}
        icon={<span aria-hidden>&#10005;</span>}
        aria-label="Dismiss"
        data-testid="dismiss-notification"
        onClick={handleDismiss}
      />
    </div>
    <div
      ref={progressRef}
      className="h-[2px] w-full"
      // style: progress fill is the bubble's primary feedback affordance and tweens via raf — dynamic width
      style={{ background: 'var(--color-badge-progress-track)' }}
    >
      <div
        className="h-full"
        // style: severity-driven progress-fill color + raf-tweened width
        style={{ width: '100%', background: config.iconColor }}
      />
    </div>
  </Card>
);
```

Imports add: `import { Card, IconButton, Pill } from '@/components/shared/primitives';`. Drop any stale local class names for the bubble shell.

- [ ] **Step 2.3: Update the existing test**

Open `src/BorgDock.Tauri/src/components/notifications/__tests__/NotificationBubble.test.tsx`. After the existing render assertion, add:

```ts
it('exposes severity via data-notification-severity', () => {
  const { container } = render(
    <NotificationBubble
      notification={{
        id: 'x',
        title: 'Hello',
        message: 'World',
        severity: 'success',
        timestamp: Date.now(),
      }}
      onDismiss={vi.fn()}
    />,
  );
  expect(container.querySelector('[data-notification-severity="success"]')).toBeInTheDocument();
  expect(container.querySelector('[data-toast]')).toBeInTheDocument();
});
```

(Adjust the import path / mock setup to match the existing file's pattern.)

- [ ] **Step 2.4: Run vitest**

```bash
npm test -- --run src/components/notifications 2>&1 | tail -20
```

Expected: 0 failures. The new severity assertion passes.

- [ ] **Step 2.5: Run the full suite**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: ≥2606 + 1 = ≥2607 (one new test added). Errors stay at 8.

- [ ] **Step 2.6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/notifications/NotificationBubble.tsx \
        src/BorgDock.Tauri/src/components/notifications/__tests__/NotificationBubble.test.tsx
git commit -m "$(cat <<'EOF'
refactor(notifications): rebuild Floating Badge on Card + IconButton

NotificationBubble — the Floating Badge — keeps its 5 severity variants
(success/error/warning/info/merged) but moves its outer frame to
Card primitive + IconButton dismiss. Elevation lifts to a
shadow-[var(--elevation-2)] utility; severity-driven glow stays on a
style attribute (token name --color-toast-{severity}-glow varies per
render — justified inline).

Adds data-toast (kept) + data-notification-severity={severity} for
e2e assertions. Existing dismiss-button test selector preserved via
data-testid pass-through on IconButton.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migrate `notifications/NotificationOverlay.tsx` + `notifications/NotificationManager.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/notifications/NotificationOverlay.tsx` (21 lines)
- Modify: `src/BorgDock.Tauri/src/components/notifications/NotificationManager.tsx` (69 lines)

**Why combined:** Both are thin: `NotificationOverlay` is a fixed-positioned container and `NotificationManager` is a logic-only orchestrator that doesn't render chrome. The migration is mechanical — make sure neither file imports anything we're about to delete, add `data-notification-overlay` for e2e assertions, and confirm both compile.

- [ ] **Step 3.1: Read both files**

```bash
# Use the Read tool on each path
```

Note: `NotificationOverlay.tsx` returns the fixed-position container `<div className="fixed right-3 top-3 z-50 flex flex-col gap-2">…</div>`. Add `data-notification-overlay` to that div. Don't introduce primitives here — there's no card/button to swap.

`NotificationManager.tsx` orchestrates queue / debouncing — no JSX to migrate.

- [ ] **Step 3.2: Add `data-notification-overlay` attribute**

Edit `NotificationOverlay.tsx`:

```tsx
<div className="fixed right-3 top-3 z-50 flex flex-col gap-2" data-notification-overlay>
  {visible.map((n) => (
    <NotificationBubble key={n.id} notification={n} onDismiss={() => dismiss(n.id)} />
  ))}
</div>
```

If the file already uses different selectors / classNames, preserve them — just add the data attribute.

- [ ] **Step 3.3: Verify no styling regression in `NotificationManager.tsx`**

Read the file. If it has a `<div>` rendering anything visible, ensure that JSX is consistent with primitives. Currently it's logic-only (queue management, no JSX) — confirm with `grep '<' src/components/notifications/NotificationManager.tsx`. If there's no JSX, no edit is required.

- [ ] **Step 3.4: Run vitest**

```bash
npm test -- --run src/components/notifications 2>&1 | tail -10
```

Expected: 0 failures.

- [ ] **Step 3.5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/notifications/NotificationOverlay.tsx
# Also add NotificationManager.tsx if any change was made
git commit -m "$(cat <<'EOF'
chore(notifications): add data-notification-overlay to fixed container

Surfaces the notification overlay container for e2e assertions
without changing any visual or behavioral contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Migrate `onboarding/{FeatureBadge,FirstRunOverlay,InlineHint}.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/onboarding/FeatureBadge.tsx` (25 lines)
- Modify: `src/BorgDock.Tauri/src/components/onboarding/FirstRunOverlay.tsx` (47 lines)
- Modify: `src/BorgDock.Tauri/src/components/onboarding/InlineHint.tsx` (50 lines)

**Why combined:** All three are leaves under 50 lines, each is one straightforward primitive swap, and they share no internal coupling.

- [ ] **Step 4.1: Migrate `FeatureBadge.tsx` to `Pill`**

Read the current file. It's a tiny "NEW" / "UPDATED" badge dot/pill rendered next to feature labels. Replace whatever it currently is (`<span className="...">`) with:

```tsx
import { Pill } from '@/components/shared/primitives';

interface FeatureBadgeProps {
  kind: 'new' | 'updated';
}

export function FeatureBadge({ kind }: FeatureBadgeProps) {
  return (
    <Pill tone={kind === 'new' ? 'success' : 'neutral'} data-feature-badge data-feature-kind={kind}>
      {kind === 'new' ? 'NEW' : 'UPDATED'}
    </Pill>
  );
}
```

(If the existing component already takes different props — adapt the Pill swap to those props. Don't change the public API.)

- [ ] **Step 4.2: Migrate `FirstRunOverlay.tsx` to `Card` + `Button`**

Read the current file (likely a centered modal-ish welcome overlay). Replace the outer `<div className="fixed inset-0 ...">` body with `Card variant="default" padding="lg"` and any CTA buttons with `Button variant="primary" size="md"`. Add `data-first-run-overlay` attribute.

- [ ] **Step 4.3: Migrate `InlineHint.tsx` to `Card` variant + `IconButton`**

Read `src/BorgDock.Tauri/src/components/onboarding/InlineHint.tsx` (current content shown below for clarity):

```tsx
return (
  <button
    onClick={dismiss}
    className="mb-2 flex w-full items-center gap-2 rounded-md border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-3 py-1.5 text-left text-[10px] text-[var(--color-text-secondary)] transition-opacity duration-200"
    style={{ opacity: fading ? 0 : 1 }}
  >
    {/* svg + text */}
  </button>
);
```

After:

```tsx
return (
  <Card
    as="button"
    onClick={dismiss}
    padding="sm"
    className={clsx(
      'mb-2 flex w-full items-center gap-2 rounded-md border-l-2',
      'border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-3 py-1.5',
      'text-left text-[10px] text-[var(--color-text-secondary)]',
      'transition-opacity duration-[var(--duration-ui)]',
      fading ? 'opacity-0' : 'opacity-100',
    )}
    data-onboarding-hint
    data-hint-id={hintId}
  >
    {/* svg + text */}
  </Card>
);
```

If `Card` doesn't support `as="button"`, drop that line and keep a regular `<button>` — but apply the same className + data attributes. Either approach is acceptable; the goal is the data hooks + the no-`style={{}}` outcome. The opacity transition is a class-based replacement of the previous inline `style={{ opacity: … }}`.

- [ ] **Step 4.4: Update existing tests for data attributes**

For each of the 3 files there's a test in `onboarding/__tests__/`. Add an assertion that the new `data-*` attribute appears on the rendered element. Don't break existing assertions.

Example (`InlineHint.test.tsx`):

```ts
it('exposes hint id via data-hint-id', () => {
  // existing setup
  const { container } = render(<InlineHint hintId="some-hint" text="Click me" />);
  expect(container.querySelector('[data-onboarding-hint][data-hint-id="some-hint"]')).toBeInTheDocument();
});
```

- [ ] **Step 4.5: Run vitest**

```bash
npm test -- --run src/components/onboarding 2>&1 | tail -10
```

Expected: 0 failures.

- [ ] **Step 4.6: Run the full suite**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: count grows by 3 (one new assertion per file). Errors stay at 8.

- [ ] **Step 4.7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/onboarding/
git commit -m "$(cat <<'EOF'
refactor(onboarding): migrate FeatureBadge, FirstRunOverlay, InlineHint to primitives

FeatureBadge → Pill (tone driven by kind: new=success, updated=neutral).
FirstRunOverlay → Card + Button.
InlineHint → Card frame + class-based opacity transition (drops the
prior inline style={{ opacity }}).

Adds data-feature-badge / data-feature-kind / data-first-run-overlay /
data-onboarding-hint / data-hint-id hooks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Migrate `whats-new/HighlightCard.tsx` + `whats-new/AlsoFixedList.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/whats-new/HighlightCard.tsx` (72 lines)
- Modify: `src/BorgDock.Tauri/src/components/whats-new/AlsoFixedList.tsx` (38 lines)

**Why combined:** Both render highlights from the same release-notes data shape. `HighlightCard` is a single highlight (with kind tone — new/improved/fixed). `AlsoFixedList` is a flat list of fix bullets.

The PR #0 spec `whats-new.spec.ts:25-36` asserts `[data-highlight-kind="new"|"improved"|"fixed"]` is present — preserve that hook on the migrated `HighlightCard`.

- [ ] **Step 5.1: Migrate `HighlightCard.tsx` to `Card` + `Pill`**

Read the file. Replace the outer wrapper with `<Card variant="default" padding="sm" data-highlight-kind={highlight.kind}>`. The kind-driven label (`NEW` / `IMPROVED` / `FIXED`) becomes a `<Pill>` with tone `success` / `neutral` / `warning` respectively. Body text stays inline.

- [ ] **Step 5.2: Migrate `AlsoFixedList.tsx` to use `Pill` for fix-tag**

If the file currently renders each fix as a styled list item, leave the layout (`<ul>` / `<li>`) untouched and replace any inline styled "FIX" / "•" badge with a small `<Pill tone="neutral">FIX</Pill>` or a `<Dot tone="gray" size={4} />`. Add `data-also-fixed-list` to the root `<ul>`.

- [ ] **Step 5.3: Update tests in `whats-new/__tests__/HighlightCard.test.tsx`**

Add an assertion the migrated `Pill` carries `data-pill-tone` matching the kind. Reference: PR #5's pattern (the migrated `WorktreePaletteApp` exposed `data-pill-tone` for e2e diffability).

- [ ] **Step 5.4: Run vitest**

```bash
npm test -- --run src/components/whats-new 2>&1 | tail -10
```

Expected: 0 failures.

- [ ] **Step 5.5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/whats-new/HighlightCard.tsx \
        src/BorgDock.Tauri/src/components/whats-new/AlsoFixedList.tsx \
        src/BorgDock.Tauri/src/components/whats-new/__tests__/HighlightCard.test.tsx
git commit -m "refactor(whats-new): HighlightCard + AlsoFixedList migrate to Card + Pill

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Migrate `whats-new/HeroBanner.tsx` + `whats-new/ReleaseAccordion.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/whats-new/HeroBanner.tsx` (91 lines)
- Modify: `src/BorgDock.Tauri/src/components/whats-new/ReleaseAccordion.tsx` (72 lines)

The PR #0 spec `whats-new.spec.ts:38-45` asserts `[data-fixed-accordion]` + a `data-open` attribute on the accordion root. Preserve that contract.

- [ ] **Step 6.1: Migrate `HeroBanner.tsx`**

Read the file. Wrap the banner in `<Card variant="default" padding="lg" data-hero-banner>`. The version chip becomes `<Pill tone="success">v{version}</Pill>` with `data-release-version={version}` (the PR #0 spec asserts on this). Any CTA → `<Button variant="primary" size="md">`.

- [ ] **Step 6.2: Migrate `ReleaseAccordion.tsx`**

Read the file. The accordion expand/collapse already exists. Wrap each accordion in `<Card>` and replace the expand button with `<IconButton icon={<Chevron />} aria-label={open ? 'Collapse' : 'Expand'} />`. Preserve the `data-fixed-accordion` + `data-open` attributes the e2e spec asserts on. Header click handler stays.

- [ ] **Step 6.3: Update tests in `whats-new/__tests__/HeroBanner.test.tsx` + `ReleaseAccordion.test.tsx`**

If existing tests assert on classNames or DOM structure, adapt them to the primitives. Add `data-release-version` / `data-fixed-accordion` assertions.

- [ ] **Step 6.4: Run vitest**

```bash
npm test -- --run src/components/whats-new 2>&1 | tail -10
```

Expected: 0 failures.

- [ ] **Step 6.5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/whats-new/HeroBanner.tsx \
        src/BorgDock.Tauri/src/components/whats-new/ReleaseAccordion.tsx \
        src/BorgDock.Tauri/src/components/whats-new/__tests__/
git commit -m "refactor(whats-new): HeroBanner + ReleaseAccordion migrate to primitives

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Migrate `whats-new/WhatsNewApp.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.tsx` (194 lines)

The PR #0 spec asserts on the `data-release-version` attribute (Task 6 above wires it on `HeroBanner`). `WhatsNewApp` is the window's root composing all the whats-new pieces — its outer chrome (window titlebar + scroll container) wraps the migrated children.

- [ ] **Step 7.1: Read the file**

Use the Read tool on `src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.tsx`.

- [ ] **Step 7.2: Identify chrome to swap**

The window root: keep the existing `WindowTitleBar` (PR #2 already migrated). The body's outer wrapper → `Card variant="default" padding="md"` if it's a card-shaped frame; otherwise leave layout-only `<div>`s alone. Any "X versions behind" / "release notes" header pills → `<Pill tone="neutral">`. Any close-this-window button → `IconButton` (likely already provided by WindowTitleBar's right-slot — verify before duplicating).

- [ ] **Step 7.3: Add data hooks**

Add `data-whats-new-app` on the window root. The release-version chip gets `data-release-version={version}` (passed down or rendered locally — match how PR #0 expects it).

- [ ] **Step 7.4: Update tests**

`__tests__/WhatsNewApp.test.tsx` should pass without new assertions provided the primitives swap is mechanical. If the test asserts on class names, adapt to the new structure.

- [ ] **Step 7.5: Run vitest**

```bash
npm test -- --run src/components/whats-new 2>&1 | tail -10
```

Expected: 0 failures.

- [ ] **Step 7.6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.tsx \
        src/BorgDock.Tauri/src/components/whats-new/__tests__/WhatsNewApp.test.tsx
git commit -m "refactor(whats-new): WhatsNewApp window root composes migrated children

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Migrate `wizard/AuthStep.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/wizard/AuthStep.tsx` (124 lines)

The PR #0 spec `setup-wizard.spec.ts` asserts: `getByText('Connect to GitHub')`, `getByText('GitHub CLI')` / `getByText('Access Token')`, `getByPlaceholder('ghp_...')`, `getByRole('button', { name: 'Verify Connection' })`. **Preserve these labels and roles.**

- [ ] **Step 8.1: Map current shape to primitives**

Reference the current file (`src/BorgDock.Tauri/src/components/wizard/AuthStep.tsx`):

- The auth-status pill (`isAuthValid` / `'Checking...'` / error) → `<Pill tone="success" | "warning" | "error">` with a leading `<Dot tone="green" pulse | "yellow" pulse | "red">`.
- The two method picker `<button>`s (GitHub CLI / Access Token) → keep as plain `<button>` cards because they're large 2-line cards, not pill-shaped chips. Wrap each in `<Card variant={authMethod === method ? 'own' : 'default'} padding="md" interactive onClick={…}>` with `data-auth-method={method}`.
- The PAT input → `<Input type={showToken ? 'text' : 'password'} placeholder="ghp_..." />` from primitives. The Show/Hide toggle stays inline (it's an `Input` `trailing` slot — pass `<IconButton size={22} icon={<EyeIcon />} aria-label={showToken ? 'Hide' : 'Show'} />`).
- The Verify Connection button → `<Button variant="primary" size="md">Verify Connection</Button>`.

- [ ] **Step 8.2: Add data attributes for the wizard step**

On the root `<div>`: `data-wizard-step="auth"`. On the auth-status indicator: `data-auth-status={isAuthValid ? 'valid' : authStatus === 'Checking...' ? 'pending' : 'invalid'}`.

- [ ] **Step 8.3: Run vitest + e2e (vitest only at this point)**

```bash
npm test -- --run src/components/wizard 2>&1 | tail -10
```

Expected: 0 failures. The `getByText` / `getByRole` selectors used by the e2e spec are role-agnostic so the e2e suite stays compatible.

- [ ] **Step 8.4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/wizard/AuthStep.tsx \
        src/BorgDock.Tauri/src/components/wizard/__tests__/AuthStep.test.tsx
git commit -m "refactor(wizard): AuthStep migrates to Card + Input + Pill + Button

Preserves the e2e contract: 'Connect to GitHub', 'GitHub CLI',
'Access Token', 'ghp_...' placeholder, 'Verify Connection' button label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Migrate `wizard/RepoStep.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/wizard/RepoStep.tsx` (169 lines)

- [ ] **Step 9.1: Map current shape to primitives**

Read the file first. The discovered-repos list typically renders one row per repo with a checkbox / toggle:

- Each repo row → `<Card variant="default" padding="sm" interactive>` with the toggle becoming the `_ToggleSwitch` introduced in Task 11 (or a primitive `Chip` with `active` if that's a closer match — see the existing visual; if it's a square checkbox, leave it as a styled `<input type="checkbox">` and just wrap the row in a `Card`).
- Discover / refresh button → `<Button variant="secondary" size="sm">`.
- Search filter input → `<Input>` from primitives.
- Add `data-wizard-step="repos"` on the root and `data-repo-row data-repo-name={repo.name}` per row.

- [ ] **Step 9.2: Run tests**

```bash
npm test -- --run src/components/wizard 2>&1 | tail -10
```

Expected: 0 failures.

- [ ] **Step 9.3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/wizard/RepoStep.tsx \
        src/BorgDock.Tauri/src/components/wizard/__tests__/RepoStep.test.tsx
git commit -m "refactor(wizard): RepoStep migrates to Card per repo + Input + Button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Migrate `wizard/SetupWizard.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/wizard/SetupWizard.tsx` (201 lines)

`SetupWizard` is the orchestrating shell — it hosts the three steps (`AuthStep` from Task 8, `RepoStep` from Task 9, the inline position step), the Back / Next / Finish buttons, and the step-indicator dots.

The PR #0 e2e spec `setup-wizard.spec.ts` asserts on:
- The full-screen overlay (`page.locator('[class*="fixed inset-0"]')`)
- Buttons: `'Back'`, `'Next'`, `'Finish'`
- Step text: `'Customize Appearance'`, `'Sidebar Position'`, `'Theme'`
- Sidebar position buttons named `'left'` / `'right'`
- Theme buttons: `'System'` / `'Light'` / `'Dark'`

**Preserve every label.**

- [ ] **Step 10.1: Map shape to primitives**

- Outer overlay `<div className="fixed inset-0 ...">` → keep as-is (positioning, z-index — primitives don't model fullscreen overlays). Add `data-wizard-overlay`.
- Step content card → `<Card variant="default" padding="lg">`.
- Step indicator dots → 3 × `<Dot tone={i === currentStep ? 'green' : 'gray'} size={6} />`.
- Back / Next / Finish → `<Button variant="ghost" size="md">Back</Button>`, `<Button variant="primary" size="md">Next</Button>` / `Finish`.
- Sidebar position picker (left / right) → 2 × `<Chip active={ui.sidebarEdge === val} onClick={…}>{label}</Chip>` (label is `'left'` / `'right'` to match e2e spec — if existing source uses 'Left' / 'Right' uppercase, the e2e spec uses `getByRole('button', { name: 'left' })` which is case-insensitive in Playwright by default; verify and match the existing case).
- Theme picker → 3 × `<Chip>` same pattern.

- [ ] **Step 10.2: Add data hooks**

`data-wizard-step={step}` on the step container. `data-wizard-action="back" | "next" | "finish"` on the navigation buttons.

- [ ] **Step 10.3: Run tests**

```bash
npm test -- --run src/components/wizard 2>&1 | tail -10
```

Expected: 0 failures.

- [ ] **Step 10.4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/wizard/SetupWizard.tsx \
        src/BorgDock.Tauri/src/components/wizard/__tests__/SetupWizard.test.tsx
git commit -m "refactor(wizard): SetupWizard migrates to Card + Chip + Button + Dot

Preserves the e2e contract: 'Back'/'Next'/'Finish' buttons,
'Customize Appearance', 'Sidebar Position', 'Theme', 'left'/'right',
'System'/'Light'/'Dark' labels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Add the local `_ToggleSwitch.tsx` + migrate `settings/HotkeyRecorder.tsx`

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/_ToggleSwitch.tsx` (~40 lines)
- Create: `src/BorgDock.Tauri/src/components/settings/__tests__/_ToggleSwitch.test.tsx` (~20 lines)
- Modify: `src/BorgDock.Tauri/src/components/settings/HotkeyRecorder.tsx` (94 lines)
- Modify: `src/BorgDock.Tauri/src/components/settings/__tests__/HotkeyRecorder.test.tsx`

**Why combined:** `_ToggleSwitch` is a 40-line shared dependency that Tasks 12, 16, 17, 18, 19 all consume. Land it now and add a quick HotkeyRecorder migration in the same commit (HotkeyRecorder doesn't use the switch but is the other small leaf in `settings/`).

The leading underscore in `_ToggleSwitch.tsx` signals "feature-local". It does not get exported from the primitives barrel — it lives next to its only consumers.

- [ ] **Step 11.1: Write `_ToggleSwitch.tsx`**

```tsx
import clsx from 'clsx';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Local-only switch used by Settings sections. Not a primitive — kept
 * feature-local because it has no consumer outside settings/.
 *
 * The bg-on color was previously --color-accent and the bg-off color was
 * --color-filter-chip-bg; PR #6 deletes the latter and pulls bg-off from
 * --color-surface-hover instead.
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-toggle
      data-checked={checked ? 'true' : 'false'}
      onClick={() => !disabled && onChange(!checked)}
      className={clsx(
        'relative h-5 w-9 rounded-full transition-colors',
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-hover)]',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div
        className={clsx(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
```

- [ ] **Step 11.2: Write `_ToggleSwitch.test.tsx`**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleSwitch } from '../_ToggleSwitch';

describe('ToggleSwitch', () => {
  it('renders with role=switch and aria-checked reflecting the prop', () => {
    render(<ToggleSwitch checked={true} onChange={vi.fn()} aria-label="Run at startup" />);
    const sw = screen.getByRole('switch', { name: 'Run at startup' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
  it('calls onChange with the inverted value on click', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} aria-label="x" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('does not fire onChange when disabled', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} disabled aria-label="x" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('exposes data-checked attribute', () => {
    const { container } = render(<ToggleSwitch checked={true} onChange={vi.fn()} aria-label="x" />);
    expect(container.querySelector('[data-toggle][data-checked="true"]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 11.3: Migrate `HotkeyRecorder.tsx` to `Button`**

Read `src/BorgDock.Tauri/src/components/settings/HotkeyRecorder.tsx`. The recording-state button → `<Button variant={recording ? 'primary' : 'secondary'} size="sm" className="font-mono">`. The Cancel button → `<Button variant="ghost" size="sm">Cancel</Button>`. Add `data-hotkey-recorder data-recording={recording ? 'true' : 'false'}` on the recording button.

- [ ] **Step 11.4: Run vitest**

```bash
npm test -- --run src/components/settings 2>&1 | tail -10
```

Expected: ≥4 new ToggleSwitch tests pass + HotkeyRecorder existing tests pass.

- [ ] **Step 11.5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/settings/_ToggleSwitch.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/_ToggleSwitch.test.tsx \
        src/BorgDock.Tauri/src/components/settings/HotkeyRecorder.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/HotkeyRecorder.test.tsx
git commit -m "$(cat <<'EOF'
refactor(settings): add local _ToggleSwitch + migrate HotkeyRecorder

_ToggleSwitch is the feature-local switch consumed by AppearanceSection,
NotificationSection, RepoSection, UpdateSection. Not a primitive — kept
local because settings is its only consumer.

HotkeyRecorder swaps its recording-state button for the Button primitive
with variant=primary when recording, variant=secondary otherwise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Migrate `settings/AppearanceSection.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/AppearanceSection.tsx` (184 lines)
- Modify: `src/BorgDock.Tauri/src/components/settings/__tests__/AppearanceSection.test.tsx`

**This is the canonical chip-segmented-control migration.** Subsequent settings tasks reference its pattern.

The PR #0 e2e spec `settings.spec.ts:71-99` asserts `getByRole('button', { name: 'System' / 'Light' / 'Dark' })`, `getByRole('button', { name: 'Left' / 'Right', exact: true })`. **Preserve these labels.**

- [ ] **Step 12.1: Map current shape to primitives**

The dominant pattern is repeated 3 times (Theme / Sidebar Edge / Sidebar Mode):

```tsx
// Before
<button className={clsx(
  'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
  ui.theme === value
    ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
    : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
)}
onClick={() => update({ theme: value })}
>{label}</button>
```

```tsx
// After
<Chip
  active={ui.theme === value}
  onClick={() => update({ theme: value })}
  data-segmented-option
  data-active={ui.theme === value}
  className="flex-1 justify-center"
>
  {label}
</Chip>
```

The "Run at startup" toggle is the canonical `ToggleSwitch` consumer:

```tsx
<ToggleSwitch
  checked={ui.runAtStartup}
  onChange={(next) => update({ runAtStartup: next })}
  aria-label="Run at startup"
/>
```

The slider for sidebar width: `<input type="range">` stays a native range input. Add `data-settings-control="sidebar-width"` and **a single justification comment** if any inline styling remains:

```tsx
<input
  type="range"
  className="w-full accent-[var(--color-accent)]"
  // No style={{}} here — the previous implementation didn't have any.
  …
/>
```

The Windows Terminal profile text input: `<Input>` from primitives.

- [ ] **Step 12.2: Add data hooks on root**

`data-settings-section="appearance"` on the section root.

- [ ] **Step 12.3: Drop all `--color-filter-chip-bg` / `--color-filter-chip-fg` references**

After migration, grep:

```bash
grep -n "color-filter-chip" src/BorgDock.Tauri/src/components/settings/AppearanceSection.tsx
# Expected: no output
```

- [ ] **Step 12.4: Run vitest**

```bash
npm test -- --run src/components/settings/__tests__/AppearanceSection 2>&1 | tail -10
```

Expected: 0 failures.

- [ ] **Step 12.5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/settings/AppearanceSection.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/AppearanceSection.test.tsx
git commit -m "$(cat <<'EOF'
refactor(settings): AppearanceSection migrates segmented controls to Chip

Theme/SidebarEdge/SidebarMode pickers each become a row of Chip
primitives with active={current === option}. Run-at-startup uses the
new local _ToggleSwitch. Drops all --color-filter-chip-bg/fg references.

Preserves the e2e contract: 'System'/'Light'/'Dark' button labels,
'Left'/'Right' edge labels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Migrate `settings/ClaudeSection.tsx` + `settings/ClaudeApiSection.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/ClaudeSection.tsx` (50 lines)
- Modify: `src/BorgDock.Tauri/src/components/settings/ClaudeApiSection.tsx` (60 lines)

**Why combined:** Both are small (50–60 lines), both are settings sections rendering primarily `<input>` fields for paths/keys, both use the same field-label pattern as `AppearanceSection`'s `FieldLabel`.

- [ ] **Step 13.1: Map both files to primitives**

For each section:

- Each `<input>` → `<Input>` from primitives.
- Each `<label>` text → unchanged (they're plain `<label>` tags).
- Add `data-settings-section="claude" | "claude-api"` on the section root.
- Any verify / test-connection button → `<Button variant="secondary" size="sm">`.

Neither section uses `--color-filter-chip-bg` (they're pure form sections). After migration, grep to confirm.

- [ ] **Step 13.2: Run vitest**

```bash
npm test -- --run src/components/settings/__tests__/Claude 2>&1 | tail -10
```

Expected: 0 failures across both files.

- [ ] **Step 13.3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/settings/ClaudeSection.tsx \
        src/BorgDock.Tauri/src/components/settings/ClaudeApiSection.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/ClaudeSection.test.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/ClaudeApiSection.test.tsx
git commit -m "refactor(settings): ClaudeSection + ClaudeApiSection use Input + Button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Migrate `settings/GitHubSection.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/GitHubSection.tsx` (97 lines)

**Pattern:** Auth method picker (gh CLI vs PAT) + PAT input + verify button. Same mechanic as the wizard's AuthStep (Task 8) but as a settings section.

- [ ] **Step 14.1: Map to primitives**

- The 2-button auth method picker → 2 × `<Chip active={authMethod === val}>`. (Per the file's current code at line 27, this matches the `--color-filter-chip-bg` pattern — Chip swap eliminates it.)
- The PAT input → `<Input>`.
- The Verify button → `<Button variant="secondary" size="sm">`.
- Status indicator → `<Pill>` + `<Dot>` like AuthStep.
- Add `data-settings-section="github"` + `data-auth-method={authMethod}`.

- [ ] **Step 14.2: Run vitest + commit**

```bash
npm test -- --run src/components/settings/__tests__/GitHubSection 2>&1 | tail -10
git add src/BorgDock.Tauri/src/components/settings/GitHubSection.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/GitHubSection.test.tsx
git commit -m "refactor(settings): GitHubSection migrates to Chip + Input + Button + Pill

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Migrate `settings/RepoSection.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/RepoSection.tsx` (161 lines)

**Pattern:** A list of saved repos with a per-repo enable toggle + an add-new-repo input. The current code at line 68 references `--color-filter-chip-bg` for the toggle off-state — `_ToggleSwitch` (Task 11) replaces that.

- [ ] **Step 15.1: Map to primitives**

- Each repo row → `<Card variant="default" padding="sm" interactive>` with `data-repo-row data-repo-name={repo.name}`.
- Per-repo toggle → `<ToggleSwitch checked={repo.enabled} onChange={…} aria-label={`Enable ${repo.name}`} />`.
- Add-new-repo input → `<Input>` + `<Button variant="primary" size="sm">Add</Button>`.
- Per-repo remove → `<IconButton size={22} icon={<TrashIcon />} aria-label="Remove" />`.
- Add `data-settings-section="repos"` on root.

- [ ] **Step 15.2: Run vitest + commit**

```bash
npm test -- --run src/components/settings/__tests__/RepoSection 2>&1 | tail -10
git add src/BorgDock.Tauri/src/components/settings/RepoSection.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/RepoSection.test.tsx
git commit -m "refactor(settings): RepoSection per-repo Card + ToggleSwitch + IconButton

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Migrate `settings/AdoSection.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/AdoSection.tsx` (218 lines)

**Pattern:** Auth method picker (likely `azCli` / `pat`) + URL/org/project inputs + verify-connection button. Mirrors GitHubSection but with more inputs. The current code at line 120 uses the `--color-filter-chip-bg` toggle pattern — Chip swap eliminates it.

- [ ] **Step 16.1: Map to primitives**

- Auth method picker → 2 × `<Chip>`.
- All `<input>` fields → `<Input>`.
- Verify button → `<Button variant="secondary" size="sm">`.
- Status indicator → `<Pill>` + `<Dot>`.
- Add `data-settings-section="azure-devops"`.

- [ ] **Step 16.2: Run vitest + commit**

```bash
npm test -- --run src/components/settings/__tests__/AdoSection 2>&1 | tail -10
git add src/BorgDock.Tauri/src/components/settings/AdoSection.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/AdoSection.test.tsx
git commit -m "refactor(settings): AdoSection migrates to Chip + Input + Button + Pill

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Migrate `settings/NotificationSection.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/NotificationSection.tsx` (222 lines)

**Pattern:** Multiple toggle rows (5+ notification types) using the `--color-filter-chip-bg` toggle (line 165). Every row collapses to `<ToggleSwitch>`.

- [ ] **Step 17.1: Map to primitives**

- Each toggle row → `<ToggleSwitch>` with `aria-label={notificationTypeLabel}` and `data-notification-type={type}`.
- Any sound-test button → `<Button variant="ghost" size="sm">`.
- Test-notification trigger → `<Button variant="secondary" size="sm">`.
- Add `data-settings-section="notifications"`.

- [ ] **Step 17.2: Run vitest + commit**

```bash
npm test -- --run src/components/settings/__tests__/NotificationSection 2>&1 | tail -10
git add src/BorgDock.Tauri/src/components/settings/NotificationSection.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/NotificationSection.test.tsx
git commit -m "refactor(settings): NotificationSection rows migrate to _ToggleSwitch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Migrate `settings/SqlSection.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/SqlSection.tsx` (258 lines)

**Pattern:** Auth method picker, server/database/credentials inputs, test-connection button. The largest settings section. **Note**: PR #5 already migrated `components/sql/*` to primitives; this is the **settings** section that configures SQL connections, not the runner UI.

- [ ] **Step 18.1: Map to primitives**

- Auth method (Windows / SQL) → 2 × `<Chip>`.
- All `<input>` → `<Input>` (host, port, database, user, password — password input gets `type="password"` + a Show/Hide trailing IconButton).
- Test connection button → `<Button variant="secondary" size="sm">`.
- Status pill → `<Pill>` + `<Dot>`.
- Add `data-settings-section="sql-server"`.

- [ ] **Step 18.2: Run vitest + commit**

```bash
npm test -- --run src/components/settings/__tests__/SqlSection 2>&1 | tail -10
git add src/BorgDock.Tauri/src/components/settings/SqlSection.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/SqlSection.test.tsx
git commit -m "refactor(settings): SqlSection migrates connection form to primitives

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Migrate `settings/UpdateSection.tsx`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/UpdateSection.tsx` (96 lines)

**Pattern:** Auto-update toggle + manual check-for-updates button + a download progress bar. The current code uses `--color-filter-chip-bg` at lines 68 (progress track) and 85 (toggle off-state).

- [ ] **Step 19.1: Map to primitives**

- Auto-update toggle → `<ToggleSwitch>`.
- Check now button → `<Button variant="secondary" size="sm">`.
- Progress track → `<LinearProgress value={percent} tone="accent" />` from primitives. **Drop the inline `bg-[var(--color-filter-chip-bg)]` track style — `LinearProgress` paints its own track via `--color-progress-track-bg`.**
- "Up to date" / "Update available" / "Downloading…" status text → `<Pill tone="success" | "warning" | "neutral">`.
- Add `data-settings-section="updates"`.

- [ ] **Step 19.2: Run vitest + commit**

```bash
npm test -- --run src/components/settings/__tests__/UpdateSection 2>&1 | tail -10
git add src/BorgDock.Tauri/src/components/settings/UpdateSection.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/UpdateSection.test.tsx
git commit -m "refactor(settings): UpdateSection uses LinearProgress + ToggleSwitch + Pill

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Migrate `settings/SettingsFlyout.tsx` (the shell)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/SettingsFlyout.tsx` (195 lines)

`SettingsFlyout` is the right-edge flyout shell hosting all the migrated sections, plus the close button, the Maintenance section's "Prune Worktrees" / "Reset Onboarding" buttons, and the `WorktreePruneDialog` modal. The PR #0 e2e spec `settings.spec.ts:11-22` asserts on `Settings` heading, `Save` / `Cancel` buttons. **Preserve.**

- [ ] **Step 20.1: Map shell chrome to primitives**

- Outer overlay `<div className="fixed inset-0 z-40 ...">` → keep (positioning). Add `data-settings-overlay`.
- Flyout panel `<div role="dialog" ...>` → keep `role="dialog"` + `aria-modal` + `aria-label="Settings"`. Add `data-flyout="settings"` (the PR #0 spec aspirationally references this — landing it now also satisfies the spec's command-palette open-Settings flow).
- Header close `<button>` → `<IconButton size={26} icon={<span aria-hidden>&#10005;</span>} aria-label="Close settings" data-settings-close />`.
- The local `SectionCard` helper → replace its inner JSX with `<Card variant="default" padding="md">` retaining the `<h3>` title pattern.
- Maintenance buttons → `<Button variant="secondary" size="sm">`. Add `data-settings-action="prune-worktrees" | "reset-onboarding"` per button.
- Save / Cancel buttons (these likely live on a footer not yet in the file — check) → if the spec asserts on them but the current source has none, the labels come from elsewhere (settings store auto-saves on change, with a debounced timer, so the e2e spec's "Save"/"Cancel" buttons may already exist as a footer toolbar that the read above missed). Read the file fully via the `Read` tool first; if Save/Cancel don't exist, the e2e spec is currently red on those assertions and stays red after PR #6 (spec contract was aspirational). Document in the commit message.

- [ ] **Step 20.2: Confirm `WorktreePruneDialog` import path is unchanged**

The `import { WorktreePruneDialog } from '@/components/worktree/WorktreePruneDialog';` line stays as-is (PR #5 migrated that file).

- [ ] **Step 20.3: Drop all `--color-filter-chip-bg` references**

After migration, grep:

```bash
grep -rn "color-filter-chip" src/BorgDock.Tauri/src/components/settings/
# Expected: no output
```

If any survive, find and migrate them before this task's commit.

- [ ] **Step 20.4: Run the full settings test slice**

```bash
npm test -- --run src/components/settings 2>&1 | tail -15
```

Expected: 0 failures across the whole settings/ directory.

- [ ] **Step 20.5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/settings/SettingsFlyout.tsx \
        src/BorgDock.Tauri/src/components/settings/__tests__/SettingsFlyout.test.tsx
git commit -m "$(cat <<'EOF'
refactor(settings): SettingsFlyout shell migrates to Card + IconButton + Button

The flyout's section frames become Card primitives, the close button
becomes IconButton, and the Maintenance section's Prune/Reset actions
become Button primitives. Adds data-flyout="settings" so the spec's
command-palette → Settings flow contract has a hook to land against
in a future palette PR.

Confirms zero --color-filter-chip-bg / --color-filter-chip-fg consumers
remain in components/settings/ — Task 21 is now safe to delete the tokens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: Delete `--color-filter-chip-bg` / `--color-filter-chip-fg` tokens from `index.css`

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/index.css`

This is the spec §8 PR #6 row's "Delete the `--color-filter-chip-bg` / `--color-filter-chip-fg` tokens themselves from `index.css`" item. PR #5 removed the last out-of-settings JSX consumer (`WorktreePaletteApp`'s `.wt-group-count`); Tasks 11–20 above remove the in-settings consumers. **Now is the moment.**

- [ ] **Step 21.1: Verify zero non-`index.css` consumers**

```bash
cd ~/projects/borgdock-streamline-06
grep -rn "color-filter-chip" src/BorgDock.Tauri/src 2>&1 | grep -v "index.css"
# Expected: empty (no matches outside index.css)
```

If any match remains: stop, find the consumer, migrate it. Don't delete the tokens until the count is 0.

- [ ] **Step 21.2: Verify only the 5 expected `index.css` lines remain**

```bash
grep -n "color-filter-chip" src/BorgDock.Tauri/src/styles/index.css
# Expected:
# 54:  --color-filter-chip-bg: var(--color-filter-chip-bg);
# 55:  --color-filter-chip-fg: var(--color-filter-chip-fg);
# 317:  --color-filter-chip-bg: rgba(26, 23, 38, 0.04);
# 318:  --color-filter-chip-fg: #5a5670;
# 607:  --color-filter-chip-bg: rgba(138, 133, 160, 0.06);
# 608:  --color-filter-chip-fg: #8a85a0;
```

(Line numbers may have shifted slightly if PR #4/#5 follow-up commits touched index.css. Use the actual line numbers from the grep.)

There may also be a 7th hit at the old `worktree-palette.css`-ported `bd-wt-*` namespace — `index.css:1029` had `background: var(--color-filter-chip-bg);` per the streamline-05 grep. If that line is still present in the streamline-05 baseline (it is — it was kept as part of the `@layer components` port), it's a styling consumer and Task 21 needs to also migrate that selector to `var(--color-surface-hover)` since it's the @layer-components representation of the same affordance.

Run:

```bash
grep -n "color-filter-chip" src/BorgDock.Tauri/src/styles/index.css | grep -v ":\s*--color-filter-chip"
# Expected: lines that USE the token (not declare it)
```

For each "uses-the-token" line: replace `var(--color-filter-chip-bg)` with `var(--color-surface-hover)` and `var(--color-filter-chip-fg)` with `var(--color-text-tertiary)` (the closest semantic neighbors per the dark/light value pairs).

- [ ] **Step 21.3: Delete the 6 declarations**

Edit `src/BorgDock.Tauri/src/styles/index.css`:

- Remove lines 54–55 (the `@theme inline` re-exports).
- Remove lines 317–318 (the light theme declarations).
- Remove lines 607–608 (the dark theme declarations).

Use the `Edit` tool with `replace_all: false` and surrounding context unique to each pair so the diff is precise.

- [ ] **Step 21.4: Verify zero remaining references**

```bash
grep -rn "color-filter-chip" src/BorgDock.Tauri/src 2>&1
# Expected: empty
```

- [ ] **Step 21.5: Build sanity check**

```bash
cd src/BorgDock.Tauri
npx vite build 2>&1 | tail -20
```

Expected: clean build, no `[plugin:vite:css]` errors mentioning `--color-filter-chip-bg` or `--color-filter-chip-fg`.

- [ ] **Step 21.6: Run the full vitest suite**

```bash
npm test -- --run 2>&1 | tail -8
```

Expected: 0 failures, error count stays at 8.

- [ ] **Step 21.7: Commit**

```bash
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "$(cat <<'EOF'
chore(tokens): delete --color-filter-chip-bg / --color-filter-chip-fg

PR #5 removed the last out-of-settings JSX consumer; PR #6 Tasks 11–20
removed the in-settings consumers. The tokens themselves are now
unreferenced and deleted from @theme inline + light + dark blocks
(6 lines total).

Any @layer-components port that previously consumed the token now
points at --color-surface-hover / --color-text-tertiary instead, which
were already the dark-theme visual neighbors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: Final `style={{}}` sweep across `src/`

This is the spec §4.3 final sweep: every remaining `style={{}}` must be **(a)** removable (replaced with a Tailwind utility or primitive prop), **(b)** dynamic and inherently style-bound (kept with a `// style: <reason>` comment), or **(c)** dead code (deleted).

The PR #5 baseline had **186 occurrences across 47 files**. After Tasks 2–20 the count drops (NotificationBubble, InlineHint, the settings sections all eliminated chromatic inline styles). The sweep finishes the residue.

**Files:**
- Modify: every file in `src/BorgDock.Tauri/src/` that still has a `style={{` after Tasks 2–20.

- [ ] **Step 22.1: Re-scan and tally**

```bash
cd ~/projects/borgdock-streamline-06
grep -rn "style={{" src/BorgDock.Tauri/src 2>&1 | wc -l
# Record this number — call it N_post.
grep -rn "style={{" src/BorgDock.Tauri/src 2>&1 > /tmp/pr06-style-sweep.txt
```

Save `/tmp/pr06-style-sweep.txt` for review. Open it and classify each line:

- **(a) chromatic-and-replaceable**: e.g. `style={{ color: 'var(--color-text-primary)' }}` → replace with `className="text-[var(--color-text-primary)]"`. `style={{ background: '...' }}` → `className="bg-[...]"`.
- **(b) dynamic style-bound**: e.g. `style={{ width: `${value}%` }}`, `style={{ '--ring-size': `${size}px` }}`, `style={{ left: anchorX, top: anchorY }}`. Keep but **add a single-line `// style: <one-sentence-why>` comment immediately above**.
- **(c) dead**: `style={{ /* TODO */ }}`, `style={{}}` empty, or computed-but-unused. Delete.

- [ ] **Step 22.2: Apply (a) replacements**

For each (a) candidate, use the `Edit` tool to turn the inline style into Tailwind utilities. Test as you go (`npm test -- --run <slice>`).

- [ ] **Step 22.3: Apply (b) justification comments**

Example pattern:

```tsx
// style: ring radius is dynamic per Ring size prop
<svg style={{ '--ring-size': `${size}px` }} … />
```

```tsx
// style: floating badge position is computed from Tauri window-geometry IPC
<div style={{ left: anchor.x, top: anchor.y }} … />
```

```tsx
// style: progress fill width is raf-tweened — class can't express it
<div style={{ width: `${progress * 100}%` }} … />
```

The comment must be a **single line** above the JSX with the `style={{` (per spec §4.3). Place it immediately above the opening tag.

- [ ] **Step 22.4: Apply (c) deletions**

Delete the empty / unused style attribute outright. Often this also lets you drop a now-unused variable.

- [ ] **Step 22.5: Re-tally and confirm shrink**

```bash
grep -rn "style={{" src/BorgDock.Tauri/src 2>&1 | wc -l
# Record as N_final. Expected: N_final < N_post (some category-(a) shifted to utilities)
```

The acceptance criterion is **not** that N_final = 0 — it's that every remaining `style={{}}` has either no chromatic content (i.e., dynamic values for positioning, sizing, custom properties) or is preceded by a `// style: …` justification comment.

Verify the comment-rule:

```bash
grep -B1 "style={{" src/BorgDock.Tauri/src --include="*.tsx" -rn | \
  grep -E "^[^-]*style={{" -B1 | \
  awk 'BEGIN{prev=""} /style={{/{ if (prev !~ /\/\/ style:/) print FILENAME":"prev"\n"$0; prev=""; next} {prev=$0}'
```

(This shell snippet is approximate. The point: every `style={{` should be preceded by a `// style:` comment. If grep shows uncommented residues, comment them.)

A faster manual approach: run `grep -rn "style={{" src/BorgDock.Tauri/src --include="*.tsx"` and inspect each match by opening the file at the cited line; check the line above for `// style:`.

- [ ] **Step 22.6: Run vitest**

```bash
npm test -- --run 2>&1 | tail -8
```

Expected: 0 failures, 8 errors.

- [ ] **Step 22.7: Commit**

(The sweep may span many files. Stage them in one commit — it's a single conceptual change.)

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(style): final style={{}} sweep across src/

Per spec §4.3, every remaining style={{}} is now either (a) replaced
with a Tailwind utility, (b) preceded by a single-line "// style: …"
justification comment explaining why it stays inline (dynamic
positioning, custom property, raf-tweened width), or (c) removed
because it was dead.

Pre-sweep baseline: <N_baseline> occurrences (PR #5 measurement).
Post-sweep: <N_final> occurrences, all justified or non-chromatic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Replace `<N_baseline>` and `<N_final>` with the actual numbers recorded in Steps 22.1 and 22.5.)

---

### Task 23: Fix `--color-text-muted` contrast + drop `disableRules` from `whats-new.spec.ts`

The whats-new e2e spec `tests/e2e/whats-new.spec.ts:48-56` currently disables the `color-contrast` rule because `text-muted` (#8a85a0) on `surface-raised` fails WCAG 2.1 AA's 4.5:1 ratio. The comment in that file explicitly flags the systemic fix as PR #6's responsibility.

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/index.css` (light theme block + dark theme block)
- Modify: `src/BorgDock.Tauri/tests/e2e/whats-new.spec.ts`
- Create: `src/BorgDock.Tauri/src/styles/__tests__/contrast.test.ts` (regression guard, ~25 lines)

- [ ] **Step 23.1: Pick new `text-muted` values**

Current:
- Light: `--color-text-muted: #8a85a0` on `--color-surface-raised: #ffffff` → ratio ~3.7:1 (fails AA).
- Dark: `--color-text-muted: ?` on `--color-surface-raised: ?` (verify with grep).

```bash
grep -n "color-text-muted\|color-surface-raised" src/BorgDock.Tauri/src/styles/index.css
```

Pick replacement values that hit ≥4.5:1 against `--color-surface-raised`. Reasonable shifts:

- Light: `#8a85a0` → `#6a6580` (shifts the muted purple darker; keeps the same hue family).
- Dark: whatever the current dark `text-muted` is → ~10% lighter to clear the dark-surface contrast.

Use a contrast checker (or the `contrast.test.ts` you'll write next) to verify the chosen values pass.

- [ ] **Step 23.2: Write the regression test first (TDD)**

Create `src/BorgDock.Tauri/src/styles/__tests__/contrast.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

// Compute relative luminance per WCAG.
function relLum(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const l1 = relLum(a);
  const l2 = relLum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// These mirror the index.css values. Update both when the tokens change.
const LIGHT_TEXT_MUTED = '#6a6580';     // post-PR6
const LIGHT_SURFACE_RAISED = '#ffffff';
const DARK_TEXT_MUTED = '#a8a3c0';      // post-PR6 — adjust to actual chosen value
const DARK_SURFACE_RAISED = '#1a1726';  // adjust to actual

describe('text-muted contrast against surface-raised', () => {
  it('light theme: text-muted on surface-raised meets WCAG 2.1 AA (≥4.5:1)', () => {
    expect(contrastRatio(LIGHT_TEXT_MUTED, LIGHT_SURFACE_RAISED)).toBeGreaterThanOrEqual(4.5);
  });
  it('dark theme: text-muted on surface-raised meets WCAG 2.1 AA (≥4.5:1)', () => {
    expect(contrastRatio(DARK_TEXT_MUTED, DARK_SURFACE_RAISED)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 23.3: Run the test (it should fail at this point)**

```bash
npm test -- --run src/styles/__tests__/contrast.test.ts 2>&1 | tail -10
```

Expected: 2 failures (because the LIGHT_TEXT_MUTED / DARK_TEXT_MUTED constants in the test file are the desired post-PR6 values, but `index.css` still has the pre-PR6 values).

- [ ] **Step 23.4: Update `index.css`**

In the `:root` (light) block: change `--color-text-muted: #8a85a0` → `--color-text-muted: #6a6580` (or your chosen value). In the `.dark` block: nudge `--color-text-muted` similarly.

Verify the constants in `contrast.test.ts` match the new `index.css` values exactly (the test asserts those constants — both files must agree).

- [ ] **Step 23.5: Re-run the test (it should pass)**

```bash
npm test -- --run src/styles/__tests__/contrast.test.ts 2>&1 | tail -5
```

Expected: 2 tests pass.

- [ ] **Step 23.6: Drop the `disableRules` argument from `whats-new.spec.ts`**

Edit `src/BorgDock.Tauri/tests/e2e/whats-new.spec.ts:54-55`:

```ts
test('has no WCAG 2.1 AA violations', async ({ page }) => {
  await expectNoA11yViolations(page);
});
```

Remove the multi-line comment about `text-muted` color-contrast (it's now stale).

- [ ] **Step 23.7: Run the full vitest suite**

```bash
npm test -- --run 2>&1 | tail -8
```

Expected: 0 failures, errors=8, total grew by 2 (the two new contrast tests).

- [ ] **Step 23.8: Commit**

```bash
git add src/BorgDock.Tauri/src/styles/index.css \
        src/BorgDock.Tauri/src/styles/__tests__/contrast.test.ts \
        src/BorgDock.Tauri/tests/e2e/whats-new.spec.ts
git commit -m "$(cat <<'EOF'
fix(a11y): bump --color-text-muted to pass WCAG 2.1 AA

Light: #8a85a0 → #6a6580 against #ffffff surface-raised
Dark: similarly nudged for >=4.5:1 against dark surface-raised

Adds a contrast regression guard (src/styles/__tests__/contrast.test.ts)
so the WCAG ratio can't silently regress.

Drops the disableRules: ['color-contrast'] guard from
tests/e2e/whats-new.spec.ts — the spec file itself flagged this as
PR #6's systemic fix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Vitest baseline check + e2e regression diff

**Files:** none touched directly — diagnostic-only.

- [ ] **Step 24.1: Full vitest run**

```bash
cd ~/projects/borgdock-streamline-06/src/BorgDock.Tauri
npm test -- --run 2>&1 | tail -10
```

Expected:

- Tests: ≥2606 + (Task 1: 17 wrapper-style new) + (Task 2: 1 severity new) + (Task 4: 3 onboarding new) + (Task 11: 4 ToggleSwitch new) + (Task 23: 2 contrast new) = **≥2633** (+27 over the 2606 floor).
- Errors: 8 (same 8 onboarding-store errors, no new clusters).
- 0 failures.

If any failure → fix in the file that owns it before continuing. Don't move to Task 25 with red tests.

- [ ] **Step 24.2: e2e behavioral spec smoke (without the visual / clipTo gap)**

The `clipTo` infra gap stays out of scope. Run only the behavioral specs whose surfaces PR #6 touched:

```bash
npx playwright test tests/e2e/settings.spec.ts tests/e2e/setup-wizard.spec.ts tests/e2e/notifications.spec.ts tests/e2e/whats-new.spec.ts 2>&1 | tail -25
```

Expected: every assertion that passed before PR #6 still passes. Document any new flake or red status in the ledger commit message.

If `whats-new.spec.ts > 'has no WCAG 2.1 AA violations'` fails: Task 23's contrast values weren't enough — pick darker values, re-run.

- [ ] **Step 24.3: Build sanity check**

```bash
npx vite build 2>&1 | tail -10
```

Expected: clean build, zero CSS plugin errors.

- [ ] **Step 24.4: Capture the diff stats for the ledger commit**

```bash
git diff --stat feat/streamline-05-palettes..HEAD 2>&1 | tail -15
git log --oneline feat/streamline-05-palettes..HEAD
```

Save these for the spec ledger entry in Task 25.

---

### Task 25: Update spec ledger

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-shared-components-design.md` (Delivery Ledger row PR #6)

- [ ] **Step 25.1: Edit the PR #6 row**

In `docs/superpowers/specs/2026-04-24-shared-components-design.md`, find the Delivery Ledger table. Replace the PR #6 row:

```
| #6 | `feat/streamline-06-ancillary` | Planned | — | — | — |
```

with:

```
| #6 | `feat/streamline-06-ancillary` | In review | — | <date> | Ancillary surfaces migration: every consumer in `components/settings/**` (AdoSection, AppearanceSection, ClaudeApiSection, ClaudeSection, GitHubSection, HotkeyRecorder, NotificationSection, RepoSection, SettingsFlyout, SqlSection, UpdateSection), `components/wizard/**` (AuthStep, RepoStep, SetupWizard), `components/onboarding/**` (FeatureBadge, FirstRunOverlay, InlineHint), `components/notifications/**` (NotificationBubble, NotificationManager, NotificationOverlay), and `components/whats-new/**` (AlsoFixedList, HeroBanner, HighlightCard, ReleaseAccordion, WhatsNewApp) migrated onto PR #1 primitives (Avatar, Pill, Chip, Dot, Ring, Button, IconButton, Card, Input, LinearProgress, Kbd). New feature-local `_ToggleSwitch` lives next to settings sections; not a primitive. **Floating Badge** (NotificationBubble — 5 variants) rebuilt on Card frame + IconButton dismiss with `shadow-[var(--elevation-2)]` + severity-driven `--color-toast-{severity}-glow` utility. **Final §4.3 style sweep** lands: every surviving `style={{}}` is either a Tailwind utility (chromatic) or carries a single-line `// style: …` justification (dynamic). Pre-sweep baseline 186 occurrences across 47 files; post-sweep <N> occurrences, all justified. **Token deletion**: `--color-filter-chip-bg` / `--color-filter-chip-fg` removed from `index.css` (`@theme inline` + light + dark — 6 lines) after migrating every settings consumer; the @layer-components port repointed at `--color-surface-hover` / `--color-text-tertiary`. **Restored 13+ wrapper-style WorktreePruneDialog test permutations** PR #5 Task 13 dropped (empty/loading/path-truncation×2/plural/singular/refs-heads-stripping/multi-select-count/error/progress/disabled-during-removal + helper-function suites for statusLabel/statusClasses/truncatePath); kept PR #5's 2 direct-component dialog-shell tests. **Fixed `--color-text-muted` contrast** to pass WCAG 2.1 AA against `--color-surface-raised` (light: #8a85a0 → #6a6580; dark: nudged darker); added `src/styles/__tests__/contrast.test.ts` regression guard; dropped `disableRules: ['color-contrast']` from `tests/e2e/whats-new.spec.ts`. Test-contract `data-*` hooks added: `data-toast` (kept), `data-notification-severity`, `data-notification-overlay`, `data-feature-badge`/`-kind`, `data-onboarding-hint`/`-id`, `data-first-run-overlay`, `data-release-version`, `data-fixed-accordion`/`-open`, `data-highlight-kind`, `data-wizard-step`/`-action`/`-overlay`, `data-auth-method`/`-status`, `data-repo-row`/`-name`, `data-settings-section`/`-control`/`-action`/`-close`/`-overlay`, `data-flyout="settings"`, `data-toggle`/`-checked`, `data-hotkey-recorder`/`-recording`, `data-notification-type`. **<TOTAL_TESTS> vitest pass** (+<DELTA> vs PR #5 baseline 2593, 0 failures, 8 errors unchanged — same cross-test `onboarding-store` async-mock cluster as PR #5; not introduced or fixed by PR #6, scope §). `npx vite build` clean; zero `[plugin:vite:css]` errors. e2e behavioral specs (settings, setup-wizard, notifications, whats-new) green; `whats-new > a11y` now passes natively without rule disablement. Visual baselines remain pending the `clipTo` infra gap (out of scope). Worktree Changes feature (§6) deferred to PR #7. Opened as stacked PR against `feat/streamline-05-palettes` — <PR_URL>. |
```

Replace `<date>`, `<N>` (style sweep final count), `<TOTAL_TESTS>`, `<DELTA>`, and `<PR_URL>` with the actual values. `<PR_URL>` gets filled in Task 26.

- [ ] **Step 25.2: Commit (without PR URL — that's Task 26's fast-follow)**

```bash
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): mark PR #6 as in review

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: Push branch + open PR + fast-follow ledger commit

- [ ] **Step 26.1: Switch gh accounts**

Per CLAUDE.md, `borght-dev` is the personal account that owns the BorgDock repo:

```bash
gh auth switch --user borght-dev
gh auth status
# Expected: borght-dev as active user
```

- [ ] **Step 26.2: Push the branch**

```bash
cd ~/projects/borgdock-streamline-06
git push -u origin feat/streamline-06-ancillary
```

- [ ] **Step 26.3: Open the PR against `feat/streamline-05-palettes`**

```bash
gh pr create \
  --base feat/streamline-05-palettes \
  --head feat/streamline-06-ancillary \
  --title "feat(streamline): PR #6 ancillary surfaces — settings, wizard, notifications, whats-new, onboarding" \
  --body "$(cat <<'EOF'
## Summary

PR #6 in the streamlined-shared-components stack. Stacks on `feat/streamline-05-palettes`.

- Migrates every consumer in `components/settings/**`, `components/wizard/**`, `components/onboarding/**`, `components/notifications/**`, and `components/whats-new/**` onto the PR #1 primitives.
- Rebuilds the **Floating Badge** (NotificationBubble — 5 severity variants) on Card frame + IconButton dismiss with `shadow-[var(--elevation-2)]` + severity-driven status-glow.
- Lands the spec §4.3 final `style={{}}` sweep — every surviving inline style is either a Tailwind utility or carries a `// style: …` justification.
- Deletes the `--color-filter-chip-bg` / `--color-filter-chip-fg` tokens from `index.css` after migrating every settings consumer.
- Restores the 13+ wrapper-style `WorktreePruneDialog` test permutations PR #5 Task 13 dropped.
- Fixes `--color-text-muted` contrast to pass WCAG 2.1 AA against `--color-surface-raised`; adds a regression guard; drops the `disableRules: ['color-contrast']` from `tests/e2e/whats-new.spec.ts`.

## Test plan

- [x] `npm test -- --run` — vitest count ≥2620 (PR #5 baseline 2593 + ≥27 new), 0 failures, 8 errors (same `onboarding-store` async-mock cluster as PR #5).
- [x] `npx vite build` — clean, zero `[plugin:vite:css]` errors.
- [x] e2e behavioral specs (settings.spec.ts, setup-wizard.spec.ts, notifications.spec.ts, whats-new.spec.ts) — green.
- [ ] Visual baselines remain pending the `clipTo` infra gap — out of scope.
- [ ] Worktree Changes feature (§6) — PR #7.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL output.

- [ ] **Step 26.4: Switch back to enterprise gh account**

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status
# Expected: enterprise account as active
```

- [ ] **Step 26.5: Fast-follow ledger commit with PR URL**

Edit the spec ledger row from Task 25 to replace `<PR_URL>` with the actual URL. Then:

```bash
cd ~/projects/borgdock-streamline-06
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): add PR #6 URL to PR #6 ledger row

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin feat/streamline-06-ancillary
```

- [ ] **Step 26.6: Verify PR is up**

```bash
gh auth switch --user borght-dev
gh pr view <PR_NUMBER> --json url,state,baseRefName,headRefName
gh auth switch --user KvanderBorght_gomocha
```

Expected: state=OPEN, baseRefName=`feat/streamline-05-palettes`, headRefName=`feat/streamline-06-ancillary`.

---

## Self-review checklist (run after Task 26 lands)

- [ ] Spec §8 PR #6 row covers every requirement: settings/wizard/onboarding/notifications/whats-new migration ✓ (Tasks 4–20), Floating Badge with elevation-2 + status-glow ✓ (Task 2), final `style={{}}` sweep ✓ (Task 22), `--color-filter-chip-bg/fg` token deletion ✓ (Task 21), restored WorktreePruneDialog tests ✓ (Task 1).
- [ ] Spec §7.4 a11y unverified `text-muted` contrast addressed ✓ (Task 23).
- [ ] Test-contract `data-*` hooks added inline as each surface was migrated (PR #2/3/4/5 pattern preserved).
- [ ] Out-of-scope items (Worktree Changes feature, visual.spec.ts `clipTo` gap, generic command palette, `onboarding-store` async-mock fixes) are explicitly listed in the Scope notes and the ledger row.
- [ ] Vitest count strictly increases through every commit. No commit reduces the count.
- [ ] Every `style={{` in the final tree is either a Tailwind utility (no inline) or has a `// style: …` justification immediately above it.
- [ ] No `--color-filter-chip-bg` or `--color-filter-chip-fg` references survive anywhere in `src/`.
- [ ] gh account is back on `KvanderBorght_gomocha` after the PR open step.

If any check fails: fix it in a follow-up commit on the same branch and force-push. Don't merge until clean.
