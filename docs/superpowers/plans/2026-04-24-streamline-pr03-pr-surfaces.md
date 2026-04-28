# Streamline PR #3 — PR Surfaces: Main Window + Flyout + Focus + Work Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every consumer in `components/pr/*`, `components/flyout/*`, `components/focus/*`, and `components/work-items/*` onto the PR #1 primitives, introduce a unified `PRCard` with `density: "compact" | "normal"` so the flyout's `PRRow` becomes a thin wrapper around `<PRCard density="compact" />`, rebuild the `QuickReview` overlay on primitives, and delete any newly orphaned legacy CSS so spec §8 PR #3 is fully landed with no carry-over.

**Architecture:** Build one new domain component — `components/pr/PRCard.tsx` — that takes a `density: "compact" | "normal"` prop. Compact renders a single-line grid (matches the design's flyout `PRRow` layout); normal renders a two-line column with the readiness `Ring` (matches the design's main-window `PRCard`). `PullRequestCard` becomes a thin renderer around `<PRCard density="normal" />` plus its existing action-bar / context-menu / confirm-dialog logic. `flyout/PRRow.tsx` becomes a thin wrapper around `<PRCard density="compact" />`. Every chrome adornment inside those surfaces — status dot, gradient avatar, status/branch/draft/merged/conflict pills, filter chips, readiness score ring, action buttons — is replaced with the matching primitive (`Dot`, `Avatar`, `Pill`, `Chip`, `Ring`, `Button`, `IconButton`, `Card`). The `QuickReviewOverlay` is rebuilt pixel-equivalent on `Card`, `Pill`, `Button`, `IconButton`, and a primitive-backed textarea wrapper. Work item surfaces (`WorkItemCard`, `WorkItemFilterBar`, `WorkItemDetailPanel`, `QueryBrowser`) adopt the same primitives. Test-contract `data-*` hooks expected by the existing Playwright specs (`data-pr-row`, `data-focus-item`, `data-overlay`, `data-pr-title`, `data-quick-review-summary`, `data-toast`, `data-pill-tone`, `data-active`, `data-pr-number`, `data-priority-reason`) are added inline as each surface is migrated.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 `@theme`, Vitest + Testing Library (jsdom) for unit tests, Playwright (`webview-mac` / `webview-win` projects) for behavioral + visual + a11y regression. Primitives at `src/BorgDock.Tauri/src/components/shared/primitives/` (PR #1). Chrome composed components at `src/BorgDock.Tauri/src/components/shared/chrome/` (PR #2). Work happens in worktree `~/projects/borgdock-streamline-03` on branch `feat/streamline-03-pr-surfaces`, stacked on `feat/streamline-02-chrome`.

---

## Scope notes — what this PR does and does NOT touch

**In scope (per spec §8 PR #3 row + the dispatch instructions):**

- All files under `src/BorgDock.Tauri/src/components/pr/**`.
- All files under `src/BorgDock.Tauri/src/components/flyout/**`.
- All files under `src/BorgDock.Tauri/src/components/focus/**` (including the `QuickReviewOverlay` rebuild).
- All files under `src/BorgDock.Tauri/src/components/work-items/**`.
- `src/BorgDock.Tauri/src/styles/index.css` — only to delete classes that are demonstrably orphaned by the migrations above.
- `docs/superpowers/specs/2026-04-24-shared-components-design.md` — Delivery Ledger row for PR #3.

**Out of scope (deferred to later PRs in the stack):**

- `components/layout/FilterBar.tsx` (the main PR-list filter bar) — `components/layout/**` is **not** in the spec §8 PR #3 row. Its `--color-filter-chip-bg/fg` token references stay intact so we don't break the PR list filters. PR #4 (PR detail) or a later PR can migrate it.
- `components/layout/Header.tsx`, `layout/StatusBar.tsx` — already migrated in PR #2.
- `components/pr-detail/**` and `components/review/**` — PR #4.
- `components/settings/**`, `components/wizard/**`, `components/onboarding/**`, `components/notifications/**`, `components/whats-new/**` — PR #6.
- `components/shared/primitives/**` — locked by PR #1; never edited here.
- `--color-filter-chip-bg` and `--color-filter-chip-fg` design tokens — still consumed by `components/settings/**` and `components/layout/FilterBar.tsx` (out of scope). Keep them in `index.css`.

**The "delete .pr-card*, .filter-chip*, .pr-row* CSS" line in spec §8 maps to a verify-then-delete step:** a fresh grep over `src/styles/index.css` confirms there are no class selectors with those prefixes in the codebase today (only the `--color-filter-chip-*` tokens, which are out of scope). Task 9 makes the verification explicit so the spec line is honored.

---

## Prerequisites

- [ ] **Prereq 1: Confirm worktree, branch, base commit**

Run from `~/projects/borgdock-streamline-03`:

```bash
pwd
# Expected: /Users/koenvdb/projects/borgdock-streamline-03

git branch --show-current
# Expected: feat/streamline-03-pr-surfaces

git log --oneline -1
# Expected: 000ced86 test(e2e): unblock remaining SQL + whats-new specs (PR #2 only)
# (or a newer commit if PR #2 was rebased while you were away)
```

If `git log` shows a different head, run `git log feat/streamline-02-chrome..HEAD --oneline` — output must be empty (this branch was just created off chrome, no extra commits).

- [ ] **Prereq 2: Confirm `feat/streamline-02-chrome` still exists on origin**

```bash
git fetch origin
git rev-parse --verify origin/feat/streamline-02-chrome
# Expected: a SHA (any 40-char hex). Failure means PR #2 was renamed or merged.
```

If `origin/feat/streamline-02-chrome` is gone but `master` has advanced, abort and follow the dispatch instructions: rebase this branch onto `master`, update the planned PR base in Task 11 from `feat/streamline-02-chrome` to `master`, and note the change in the plan's commit message.

- [ ] **Prereq 3: Install dependencies in this worktree**

This is a freshly created worktree — `node_modules/` does not exist:

```bash
cd src/BorgDock.Tauri
npm install
```

Expected: install completes without errors. The `web-tree-sitter` postinstall step may print a warning about wasm — that is normal.

- [ ] **Prereq 4: Confirm baseline vitest suite carries cleanly into the worktree**

```bash
cd src/BorgDock.Tauri
npm test -- --run
```

Expected: ~2517 tests pass (the dispatch instruction's calibrated baseline). If the count differs by more than ±5 from the baseline, **stop and diagnose** before touching any UI code. A drift means PR #2's tests aren't carrying clean and a fix at PR #2 is needed first.

- [ ] **Prereq 5: Confirm primitives + chrome tests are green specifically**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/shared/primitives src/components/shared/chrome
```

Expected: all primitive and chrome tests pass. These are the inputs to PR #3 — if any are red, escalate to the PR #1/#2 owner; do not edit primitives to "fix" them locally.

---

## File Structure

**Create:**

- `src/BorgDock.Tauri/src/components/pr/PRCard.tsx` — unified PR card. Pure presentational, no store or invoke; takes a `pr` prop, an optional `score`, an `onClick`, and `density`.
- `src/BorgDock.Tauri/src/components/pr/__tests__/PRCard.test.tsx` — unit tests covering both densities, status tones, review pill mapping, draft pill, own/them avatar tone, click handling, and the new `data-pr-row` / `data-pr-number` / `data-active` attributes.

**Modify:**

- `src/BorgDock.Tauri/src/components/pr/PullRequestCard.tsx` — render `<PRCard density="normal" pr={...} score={mergeScore} ... />` at the top, then the existing context-menu / confirm-dialog / hover action-bar overlay logic on top. Replace inline gradient avatar with `<Avatar />` (consumed by PRCard internally). Replace `MergeScoreBadge` with `<Ring />` (via PRCard).
- `src/BorgDock.Tauri/src/components/pr/__tests__/PullRequestCard.test.tsx` — keep behavioral assertions (click selects, context menu opens, action buttons click, confirm dialogs render) intact; update DOM selectors that now resolve to primitive classes.
- `src/BorgDock.Tauri/src/components/pr/ActionButton.tsx` — render `<Button variant=... size="sm" />` from primitives; keep the `variant` prop name but map it to the primitive's `variant`.
- `src/BorgDock.Tauri/src/components/pr/LabelBadge.tsx` — render `<Pill tone="neutral">{label}</Pill>` (drop the `--color-filter-chip-*` reference; Pill uses its own tokens).
- `src/BorgDock.Tauri/src/components/pr/MergeScoreBadge.tsx` — render `<Ring value={score} size={32} label />` from primitives. Keep file at same path so existing imports (Reviews tab in PR #4) don't break.
- `src/BorgDock.Tauri/src/components/pr/StatusIndicator.tsx` — render `<Dot tone={...} pulse={status === 'yellow'} />`. Keep the spinner fallback for `yellow` if the design's reduced-motion path needs it; unit test covers both.
- `src/BorgDock.Tauri/src/components/pr/PullRequestList.tsx` — replace the inline `SkeletonCard` border/bg with `<Card padding="sm">` wrapper.
- `src/BorgDock.Tauri/src/components/pr/RepoGroup.tsx` — replace the inline `--color-filter-chip-bg` PR-count pill with `<Pill tone="neutral">`.
- `src/BorgDock.Tauri/src/components/pr/__tests__/{ActionButton,LabelBadge,MergeScoreBadge,StatusIndicator,RepoGroup}.test.tsx` (only the ones that exist: `LabelBadge`, `MergeScoreBadge`, `StatusIndicator`, `RepoGroup`) — adjust selectors.
- `src/BorgDock.Tauri/src/components/flyout/FlyoutGlance.tsx` — header `IconButton`s → primitive `IconButton`; `StatDot` → `<Dot tone={...} pulse={pulse} />`; review badge → `<Pill tone={...} data-pill-tone={tone}>`; row avatar → `<Avatar />`; row container → `<PRRow />` (which wraps PRCard density="compact"). Add `data-pr-row`, `data-pr-number`, `data-active` to each row container.
- `src/BorgDock.Tauri/src/components/flyout/PRRow.tsx` (new file inside flyout) — exactly: `<PRCard density="compact" pr={...} onClick={...} active={...} data-pr-number={pr.number} />`. The previous inline `PrRow` sub-component inside `FlyoutGlance.tsx` is removed.
- `src/BorgDock.Tauri/src/components/flyout/FlyoutToast.tsx` — pill-shaped wrapper → `<Pill tone={...}>` if shape matches; otherwise `<Card padding="sm" variant="default">`. Add `data-toast` attribute. Verify the slide-in keyframe still hits the existing `motion.spec.ts` matrix assertion.
- `src/BorgDock.Tauri/src/components/flyout/FlyoutInitializing.tsx` — wrap in `<Card padding="md">`.
- `src/BorgDock.Tauri/src/components/flyout/__tests__/{flyout-mode,FlyoutToast}.test.tsx` — update selectors (already exist).
- `src/BorgDock.Tauri/src/components/focus/FocusList.tsx` — add `data-focus-item` to each list-row wrapper.
- `src/BorgDock.Tauri/src/components/focus/PriorityReasonLabel.tsx` — render `<Pill tone="neutral" data-priority-reason>`.
- `src/BorgDock.Tauri/src/components/focus/FocusEmptyState.tsx` — wrap in `<Card padding="lg">`.
- `src/BorgDock.Tauri/src/components/focus/MergeToast.tsx` — `<Pill tone="success">` for the toast body; `data-toast` attribute.
- `src/BorgDock.Tauri/src/components/focus/QuickReviewOverlay.tsx` — full rebuild on primitives. The overlay outer `<div>` keeps `role="dialog"` + `aria-modal="true"` + `aria-label="Quick Review"`, gains `data-overlay="quick-review"`. Header bar uses `<IconButton icon={CloseIcon} tooltip="Close" />`. Action bar uses `<Button variant="ghost" size="md">` for Back/Skip/Comment/Request, `<Button variant="primary" size="md">` for Approve, with the danger button using `variant="danger"` for Request Changes. Comment textarea wrapped in a primitive-styled container (the textarea itself stays — `Input` doesn't cover multiline; document this).
- `src/BorgDock.Tauri/src/components/focus/QuickReviewCard.tsx` — title block stays; branch flow uses two `<Pill tone="neutral">` instead of inline rounded `<span>`s; labels list uses `<Pill tone="neutral">`; add `data-pr-title` to the title element so the focus.spec.ts `[data-pr-title]` query works.
- `src/BorgDock.Tauri/src/components/focus/QuickReviewSummary.tsx` — outer `<div>` gains `data-quick-review-summary`; PR list rows use `<Card padding="sm">`; "Done" button → `<Button variant="primary" size="md">`.
- `src/BorgDock.Tauri/src/components/focus/__tests__/*.test.tsx` — update selectors. Existing tests for QuickReviewOverlay, QuickReviewCard, QuickReviewSummary, FocusList must keep their behavioral assertions.
- `src/BorgDock.Tauri/src/components/work-items/WorkItemCard.tsx` — outer `<div>` → `<Card variant={item.isWorkingOn ? 'own' : 'default'} interactive padding="sm">`. Type-letter avatar → `<Avatar initials={typeLetter} tone={stateTone} size="md">`. State badge → `<Pill tone={stateTone}>`. Tracking buttons → `<IconButton icon={...} active={item.isTracked} tooltip="...">`.
- `src/BorgDock.Tauri/src/components/work-items/WorkItemFilterBar.tsx` — tracking-pill row → three `<Chip active={...} count={...}>` calls; refresh button → `<IconButton icon={RefreshIcon} tooltip="Refresh">`; query selector button keeps its custom layout but inner pieces use primitives.
- `src/BorgDock.Tauri/src/components/work-items/WorkItemList.tsx` — skeletons + loading + empty states wrap in `<Card padding="md">` so they match the design's empty-state card.
- `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.tsx` and `WorkItemDetailPanel.tsx` — buttons → `<Button>`; field rows → `<Card>`; pills → `<Pill>`; replace the manual disabled-button styling with `<Button disabled>`.
- `src/BorgDock.Tauri/src/components/work-items/QueryBrowser.tsx` — query rows → `<Card interactive padding="sm">`; "Load" button → `<Button variant="primary" size="md">`.
- `src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.tsx` — empty/error states wrap in `<Card>`.
- `src/BorgDock.Tauri/src/components/work-items/__tests__/*.test.tsx` — update selectors.
- `src/BorgDock.Tauri/src/styles/index.css` — verify `.pr-card*`, `.pr-row*`, `.filter-chip*` selectors do not exist (Task 9). Delete any class definitions that grep proves are no longer referenced after migration.
- `docs/superpowers/specs/2026-04-24-shared-components-design.md` — Delivery Ledger row for PR #3 → "In review" (Task 10).

**Leave alone:**

- `src/BorgDock.Tauri/src/components/shared/primitives/**` (locked by PR #1).
- `src/BorgDock.Tauri/src/components/shared/chrome/**` (locked by PR #2).
- `src/BorgDock.Tauri/src/components/shared/{ConfirmDialog,ErrorBoundary,WindowTitleBar,SettingsButton}.tsx` — out of scope (settings stays for PR #6, others were finalized in PR #2).
- `src/BorgDock.Tauri/src/components/layout/{FilterBar,Header,StatusBar}.tsx` — out of scope.
- `src/BorgDock.Tauri/src/components/pr-detail/**`, `review/**`, `settings/**`, `wizard/**`, `notifications/**`, `whats-new/**`, `palette*/**`, `sql/**`, `file-*/**`, `worktree*/**` — out of scope.

---

## Task 1 — `PRCard` unified domain component

**Files:**

- Create: `src/BorgDock.Tauri/src/components/pr/PRCard.tsx`
- Create: `src/BorgDock.Tauri/src/components/pr/__tests__/PRCard.test.tsx`

`PRCard` is a presentational component. It does not subscribe to any zustand store and does not call `invoke`. It takes everything it renders as props. This makes both densities testable in isolation and lets `PullRequestCard` (main list) and `PRRow` (flyout) pass slightly different data shapes.

**Props contract:**

```ts
import type { ReactNode } from 'react';
import type { OverallStatus } from '@/types';

export type PRCardDensity = 'compact' | 'normal';

export interface PRCardData {
  number: number;
  title: string;
  repoOwner: string;
  repoName: string;
  authorLogin: string;
  isMine: boolean;
  status: OverallStatus;            // 'red' | 'yellow' | 'green' | 'gray'
  statusLabel: string;              // e.g. "2 failing", "in progress", "all passing"
  reviewState: 'approved' | 'changes' | 'commented' | 'pending' | 'none';
  isDraft: boolean;
  isMerged: boolean;
  isClosed: boolean;
  hasConflict: boolean;
  // Optional richer data — only rendered in `density="normal"`:
  branch?: string;
  baseBranch?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  commitCount?: number;
  labels?: string[];
  worktreeSlot?: string;            // when checked out
}

export interface PRCardProps {
  pr: PRCardData;
  /** Visual density. compact = single-line grid (flyout). normal = column with score Ring. */
  density: PRCardDensity;
  /** Readiness score 0..100. Only rendered in density="normal". */
  score?: number;
  /** Click handler — wires to selectPr / openPrDetail / etc. at call site. */
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Right-click handler. */
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Keyboard-nav focus marker (sets data-active="true"). */
  active?: boolean;
  /** Keyboard-selected marker (visual ring) — different from active. */
  isFocused?: boolean;
  /** Optional trailing slot for action buttons / score / etc. (normal density only). */
  trailing?: ReactNode;
}
```

`density="compact"` renders a single-line `display: grid; grid-template-columns: 24px 1fr auto;` row matching the design's `PRRow` layout: avatar (sm) → title + meta line → optional review pill. `density="normal"` renders a column matching the design's main-window `PRCard`: avatar (md) + title row + meta row, then a stats row, optional labels row, optional worktree pill row. The trailing readiness `Ring` lives in a top-right slot when `density === 'normal'` and `score` is provided.

Both densities expose:

- `data-pr-row=""` on the outer container.
- `data-pr-number={pr.number}` on the outer container.
- `data-active={active ? "true" : "false"}` on the outer container (only emitted when `active` is provided).
- `data-pill-tone={reviewTone}` on the review-state pill when one renders, where `reviewTone ∈ "approved" | "changes" | "commented" | "draft"` — this is what the flyout spec asserts.

The avatar uses `Avatar` with `tone={pr.isMine ? 'own' : 'them'}`. The status indicator uses `Dot` (or the spinning glyph for `status === 'yellow'`). The review-state pill uses `Pill`. The draft / conflict / merged / closed / in-progress pills use `Pill`. The score ring uses `Ring`. The expanded labels row uses `Pill tone="neutral"`. Every styling token references one of these primitives — no inline `style={{ color: 'var(...)' }}` should remain inside `PRCard.tsx`.

- [ ] **Step 1.1: Write the failing test file**

Write `src/BorgDock.Tauri/src/components/pr/__tests__/PRCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PRCard, type PRCardData } from '../PRCard';

const basePr: PRCardData = {
  number: 715,
  title: 'AB#54258 Portal. Quote: resolve list price on add',
  repoOwner: 'Gomocha-FSP',
  repoName: 'FSP',
  authorLogin: 'sschmidt',
  isMine: false,
  status: 'yellow',
  statusLabel: 'in progress',
  reviewState: 'none',
  isDraft: false,
  isMerged: false,
  isClosed: false,
  hasConflict: false,
};

describe('PRCard', () => {
  it('renders title, repo, and #number in compact density', () => {
    render(<PRCard pr={basePr} density="compact" />);
    expect(screen.getByText(basePr.title)).toBeInTheDocument();
    expect(screen.getByText(/Gomocha-FSP\/FSP/)).toBeInTheDocument();
    expect(screen.getByText('#715')).toBeInTheDocument();
  });

  it('renders the readiness Ring in normal density when score is provided', () => {
    const { container } = render(
      <PRCard pr={basePr} density="normal" score={72} />,
    );
    expect(container.querySelector('.bd-ring')).toBeInTheDocument();
    expect(container.textContent).toContain('72');
  });

  it('does not render Ring in compact density even when score is provided', () => {
    const { container } = render(
      <PRCard pr={basePr} density="compact" score={72} />,
    );
    expect(container.querySelector('.bd-ring')).not.toBeInTheDocument();
  });

  it('emits data-pr-row + data-pr-number for the flyout selector contract', () => {
    const { container } = render(<PRCard pr={basePr} density="compact" />);
    const row = container.querySelector('[data-pr-row]');
    expect(row).toBeInTheDocument();
    expect(row?.getAttribute('data-pr-number')).toBe('715');
  });

  it('emits data-active="true" when active prop is set', () => {
    const { container } = render(
      <PRCard pr={basePr} density="compact" active />,
    );
    expect(
      container.querySelector('[data-pr-row][data-active="true"]'),
    ).toBeInTheDocument();
  });

  it('renders the approved review pill with data-pill-tone="approved"', () => {
    const { container } = render(
      <PRCard pr={{ ...basePr, reviewState: 'approved' }} density="compact" />,
    );
    const pill = container.querySelector('[data-pill-tone="approved"]');
    expect(pill).toBeInTheDocument();
    expect(pill?.textContent?.toLowerCase()).toContain('approved');
  });

  it('renders the changes-requested review pill with data-pill-tone="changes"', () => {
    const { container } = render(
      <PRCard
        pr={{ ...basePr, reviewState: 'changes' }}
        density="compact"
      />,
    );
    expect(
      container.querySelector('[data-pill-tone="changes"]'),
    ).toBeInTheDocument();
  });

  it('renders the draft pill when isDraft is true', () => {
    render(<PRCard pr={{ ...basePr, isDraft: true }} density="normal" />);
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  it('renders the conflicts pill when hasConflict is true', () => {
    render(
      <PRCard pr={{ ...basePr, hasConflict: true }} density="normal" />,
    );
    expect(screen.getByText(/conflicts/i)).toBeInTheDocument();
  });

  it('renders the merged pill when isMerged is true', () => {
    render(<PRCard pr={{ ...basePr, isMerged: true }} density="normal" />);
    expect(screen.getByText(/merged/i)).toBeInTheDocument();
  });

  it('uses Avatar tone "own" when isMine is true', () => {
    const { container } = render(
      <PRCard pr={{ ...basePr, isMine: true }} density="compact" />,
    );
    expect(container.querySelector('.bd-avatar--own')).toBeInTheDocument();
  });

  it('uses Avatar tone "them" when isMine is false', () => {
    const { container } = render(<PRCard pr={basePr} density="compact" />);
    expect(container.querySelector('.bd-avatar--them')).toBeInTheDocument();
  });

  it('fires onClick when the row is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <PRCard pr={basePr} density="compact" onClick={onClick} />,
    );
    fireEvent.click(container.querySelector('[data-pr-row]')!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders branch + diff stats only in normal density', () => {
    const enriched: PRCardData = {
      ...basePr,
      branch: 'features/54258-list-price-on-add',
      baseBranch: 'releases/R5.2',
      additions: 135,
      deletions: 10,
      changedFiles: 1,
      commitCount: 3,
    };
    const { rerender, container } = render(
      <PRCard pr={enriched} density="normal" />,
    );
    expect(screen.getByText(/features\/54258/)).toBeInTheDocument();
    expect(screen.getByText(/\+135/)).toBeInTheDocument();
    expect(screen.getByText(/[\u2212-]10/)).toBeInTheDocument();
    rerender(<PRCard pr={enriched} density="compact" />);
    expect(container.querySelector('[data-pr-row]')?.textContent).not.toContain('+135');
  });

  it('renders labels row in normal density when labels are present', () => {
    render(
      <PRCard
        pr={{ ...basePr, labels: ['AB#54258', 'AB#54482'] }}
        density="normal"
      />,
    );
    expect(screen.getByText('AB#54258')).toBeInTheDocument();
    expect(screen.getByText('AB#54482')).toBeInTheDocument();
  });

  it('renders trailing slot in normal density', () => {
    render(
      <PRCard
        pr={basePr}
        density="normal"
        trailing={<span data-testid="custom-trailing">x</span>}
      />,
    );
    expect(screen.getByTestId('custom-trailing')).toBeInTheDocument();
  });
});
```

- [ ] **Step 1.2: Run the test — confirm it fails because `PRCard` does not exist**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/pr/__tests__/PRCard.test.tsx
```

Expected: FAIL with `Cannot find module '../PRCard'`.

- [ ] **Step 1.3: Implement `PRCard.tsx`**

Write `src/BorgDock.Tauri/src/components/pr/PRCard.tsx`:

```tsx
import clsx from 'clsx';
import type { MouseEvent, ReactNode } from 'react';
import {
  Avatar,
  Card,
  Dot,
  Pill,
  Ring,
  type PillTone,
} from '@/components/shared/primitives';
import type { OverallStatus } from '@/types';

export type PRCardDensity = 'compact' | 'normal';

export interface PRCardData {
  number: number;
  title: string;
  repoOwner: string;
  repoName: string;
  authorLogin: string;
  isMine: boolean;
  status: OverallStatus;
  statusLabel: string;
  reviewState: 'approved' | 'changes' | 'commented' | 'pending' | 'none';
  isDraft: boolean;
  isMerged: boolean;
  isClosed: boolean;
  hasConflict: boolean;
  branch?: string;
  baseBranch?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  commitCount?: number;
  labels?: string[];
  worktreeSlot?: string;
}

export interface PRCardProps {
  pr: PRCardData;
  density: PRCardDensity;
  score?: number;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void;
  active?: boolean;
  isFocused?: boolean;
  trailing?: ReactNode;
}

const REVIEW_PILL: Record<
  PRCardData['reviewState'],
  { tone: PillTone; label: string; toneAttr: string } | null
> = {
  approved: { tone: 'success', label: 'approved', toneAttr: 'approved' },
  changes: { tone: 'error', label: 'changes', toneAttr: 'changes' },
  commented: { tone: 'draft', label: 'commented', toneAttr: 'commented' },
  pending: { tone: 'warning', label: 'review needed', toneAttr: 'pending' },
  none: null,
};

function avatarInitials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

function statusDotTone(status: OverallStatus): 'red' | 'yellow' | 'green' | 'gray' {
  return status;
}

export function PRCard({
  pr,
  density,
  score,
  onClick,
  onContextMenu,
  active,
  isFocused,
  trailing,
}: PRCardProps) {
  const review = REVIEW_PILL[pr.reviewState];
  const isCompact = density === 'compact';

  const containerCommon: React.HTMLAttributes<HTMLDivElement> = {
    onClick,
    onContextMenu,
    'data-pr-row': '',
    'data-pr-number': pr.number,
    ...(active !== undefined ? { 'data-active': active ? 'true' : 'false' } : {}),
    role: onClick ? 'button' : undefined,
    tabIndex: onClick ? 0 : undefined,
  } as React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>;

  if (isCompact) {
    return (
      <div
        {...containerCommon}
        className={clsx(
          'bd-pr-row',
          'grid items-center gap-2.5 px-3 py-2',
          'cursor-pointer transition-colors hover:bg-[var(--color-surface-hover)]',
          active && 'bg-[var(--color-surface-hover)]',
        )}
        style={{ gridTemplateColumns: '24px 1fr auto' }}
      >
        <Avatar
          initials={avatarInitials(pr.authorLogin)}
          tone={pr.isMine ? 'own' : 'them'}
          size="sm"
        />
        <div className="min-w-0">
          <div
            className="truncate text-[12px] font-medium"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {pr.title}
          </div>
          <div
            className="mt-0.5 flex items-center gap-1.5 text-[11px]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <span className="font-mono">
              {pr.repoOwner}/{pr.repoName}
            </span>
            <span aria-hidden>·</span>
            <span className="font-mono">#{pr.number}</span>
            <span aria-hidden>·</span>
            <Dot tone={statusDotTone(pr.status)} pulse={pr.status === 'yellow'} />
            <span>{pr.statusLabel}</span>
          </div>
        </div>
        {review && (
          <Pill tone={review.tone} data-pill-tone={review.toneAttr}>
            {review.label}
          </Pill>
        )}
      </div>
    );
  }

  return (
    <Card
      variant={pr.isMine ? 'own' : 'default'}
      padding="md"
      interactive
      {...containerCommon}
      className={clsx(
        'bd-pr-card',
        isFocused && 'ring-2 ring-[var(--color-accent)] ring-offset-1',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar
          initials={avatarInitials(pr.authorLogin)}
          tone={pr.isMine ? 'own' : 'them'}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate text-[13px] font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {pr.title}
            </span>
            {review && (
              <Pill tone={review.tone} data-pill-tone={review.toneAttr}>
                {review.label}
              </Pill>
            )}
          </div>
          <div
            className="mt-1 flex flex-wrap items-center gap-2 text-[11px]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <span className="font-mono">
              {pr.repoOwner}/{pr.repoName}
            </span>
            <span aria-hidden>·</span>
            <span className="font-mono">#{pr.number}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Dot tone={statusDotTone(pr.status)} pulse={pr.status === 'yellow'} />
              <span>{pr.statusLabel}</span>
            </span>
            {pr.isDraft && <Pill tone="draft">draft</Pill>}
            {pr.hasConflict && <Pill tone="error">conflicts</Pill>}
            {pr.isMerged && <Pill tone="success">merged</Pill>}
            {pr.isClosed && !pr.isMerged && <Pill tone="neutral">closed</Pill>}
          </div>
          {(pr.branch || pr.additions !== undefined) && (
            <div
              className="mt-2 flex flex-wrap items-center gap-2 text-[11px]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {pr.branch && <span className="font-mono">{pr.branch}</span>}
              {pr.baseBranch && (
                <>
                  <span aria-hidden>→</span>
                  <span className="font-mono">{pr.baseBranch}</span>
                </>
              )}
              {pr.additions !== undefined && pr.additions > 0 && (
                <span style={{ color: 'var(--color-status-green)' }}>
                  +{pr.additions.toLocaleString()}
                </span>
              )}
              {pr.deletions !== undefined && pr.deletions > 0 && (
                <span style={{ color: 'var(--color-status-red)' }}>
                  {'\u2212'}
                  {pr.deletions.toLocaleString()}
                </span>
              )}
              {pr.commitCount !== undefined && pr.commitCount > 0 && (
                <span>{pr.commitCount}c</span>
              )}
              {pr.changedFiles !== undefined && pr.changedFiles > 0 && (
                <span>{pr.changedFiles} files</span>
              )}
            </div>
          )}
          {pr.labels && pr.labels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {pr.labels.map((l) => (
                <Pill key={l} tone="neutral">
                  {l}
                </Pill>
              ))}
            </div>
          )}
          {pr.worktreeSlot && (
            <div className="mt-1.5">
              <Pill tone="ghost">{pr.worktreeSlot}</Pill>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="font-mono text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            #{pr.number}
          </span>
          {score !== undefined && <Ring value={score} size={32} label />}
          {trailing}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 1.4: Run the tests**

```bash
cd src/BorgDock.Tauri
npm test -- --run src/components/pr/__tests__/PRCard.test.tsx
```

Expected: all 16 tests pass. If any fail, read the error, fix the implementation (do NOT fix the test), re-run.

- [ ] **Step 1.5: Run the full primitive + new PRCard suite to confirm no regression**

```bash
npm test -- --run src/components/shared/primitives src/components/pr/__tests__/PRCard.test.tsx
```

Expected: all green.

- [ ] **Step 1.6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr/PRCard.tsx \
        src/BorgDock.Tauri/src/components/pr/__tests__/PRCard.test.tsx
git commit -m "feat(pr): add unified PRCard with density='compact'|'normal'"
```

---

## Task 2 — Migrate `pr/*` consumers onto primitives + PRCard

This task swaps every adornment in the PR list onto primitives and turns `PullRequestCard` into a thin renderer around `<PRCard density="normal" />` plus the existing context-menu / confirm-dialog / hover action-bar overlay logic.

**Files (modify):**

- `src/BorgDock.Tauri/src/components/pr/PullRequestCard.tsx`
- `src/BorgDock.Tauri/src/components/pr/ActionButton.tsx`
- `src/BorgDock.Tauri/src/components/pr/LabelBadge.tsx`
- `src/BorgDock.Tauri/src/components/pr/MergeScoreBadge.tsx`
- `src/BorgDock.Tauri/src/components/pr/StatusIndicator.tsx`
- `src/BorgDock.Tauri/src/components/pr/PullRequestList.tsx`
- `src/BorgDock.Tauri/src/components/pr/RepoGroup.tsx`
- Their `__tests__/` counterparts (the existing test files keep their behavioral assertions; only DOM selectors that change need updating).

### 2.1 — `ActionButton` → `Button`

`ActionButton` is a small wrapper around `<button>` used in PR card hover row. Map its `variant` ("default" | "accent" | "danger" | "purple" | "draft" | "success") to the primitive `Button`'s `variant` ("ghost" | "primary" | "danger") plus optional inline color overrides for the colors the primitive doesn't cover natively (`purple`, `draft`, `success`).

- [ ] **Step 2.1.1: Update `ActionButton.tsx` to render primitive `Button`**

Read the current file first if needed; the rewrite renders `<Button variant=... size="sm" leading={icon}>{label}</Button>` with a `clsx` mapping for the legacy variant names. Preserve the existing `onClick`/`title` props. The label/icon/onClick API stays identical so its callers in `PullRequestCard.tsx` need no changes.

- [ ] **Step 2.1.2: Run ActionButton-related tests**

```bash
npm test -- --run src/components/pr/__tests__/PullRequestCard.test.tsx
```

`ActionButton` itself has no dedicated test file; the assertions live inside `PullRequestCard.test.tsx`. Expected: all PullRequestCard tests still pass.

- [ ] **Step 2.1.3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr/ActionButton.tsx
git commit -m "refactor(pr): ActionButton renders primitive Button"
```

### 2.2 — `LabelBadge` → `Pill tone="neutral"`

- [ ] **Step 2.2.1: Update `LabelBadge.tsx`**

Rewrite to:

```tsx
import { Pill } from '@/components/shared/primitives';

interface LabelBadgeProps {
  label: string;
}

export function LabelBadge({ label }: LabelBadgeProps) {
  return <Pill tone="neutral">{label}</Pill>;
}
```

- [ ] **Step 2.2.2: Update `LabelBadge.test.tsx` selectors**

The existing test asserts a specific class chain. Rewrite the assertion to query by text and confirm the rendered `<span>` carries the `bd-pill` class:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabelBadge } from '../LabelBadge';

describe('LabelBadge', () => {
  it('renders the label text inside a Pill', () => {
    const { container } = render(<LabelBadge label="bug" />);
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(container.querySelector('.bd-pill')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2.3: Run tests + commit**

```bash
npm test -- --run src/components/pr/__tests__/LabelBadge.test.tsx
git add src/BorgDock.Tauri/src/components/pr/LabelBadge.tsx \
        src/BorgDock.Tauri/src/components/pr/__tests__/LabelBadge.test.tsx
git commit -m "refactor(pr): LabelBadge renders Pill primitive"
```

### 2.3 — `MergeScoreBadge` → `Ring`

- [ ] **Step 2.3.1: Update `MergeScoreBadge.tsx`**

```tsx
import { Ring } from '@/components/shared/primitives';

interface MergeScoreBadgeProps {
  score: number;
}

export function MergeScoreBadge({ score }: MergeScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  return <Ring value={clamped} size={32} label aria-label={`Merge score: ${clamped}%`} />;
}
```

- [ ] **Step 2.3.2: Update `MergeScoreBadge.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MergeScoreBadge } from '../MergeScoreBadge';

describe('MergeScoreBadge', () => {
  it('renders the score value inside a Ring', () => {
    const { container } = render(<MergeScoreBadge score={72} />);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(container.querySelector('.bd-ring')).toBeInTheDocument();
  });

  it('clamps values above 100 to 100', () => {
    render(<MergeScoreBadge score={150} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('clamps values below 0 to 0', () => {
    render(<MergeScoreBadge score={-5} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('exposes accessible label with score value', () => {
    const { container } = render(<MergeScoreBadge score={50} />);
    const ring = container.querySelector('[aria-label="Merge score: 50%"]');
    expect(ring).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.3.3: Run + commit**

```bash
npm test -- --run src/components/pr/__tests__/MergeScoreBadge.test.tsx
git add src/BorgDock.Tauri/src/components/pr/MergeScoreBadge.tsx \
        src/BorgDock.Tauri/src/components/pr/__tests__/MergeScoreBadge.test.tsx
git commit -m "refactor(pr): MergeScoreBadge renders Ring primitive"
```

### 2.4 — `StatusIndicator` → `Dot`

- [ ] **Step 2.4.1: Update `StatusIndicator.tsx`**

```tsx
import { Dot } from '@/components/shared/primitives';
import type { OverallStatus } from '@/types';

interface StatusIndicatorProps {
  status: OverallStatus;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  return (
    <Dot
      tone={status}
      pulse={status === 'yellow'}
      size={10}
      aria-label={`Status: ${status}`}
    />
  );
}
```

The animated SVG spinner the previous implementation used for `yellow` is replaced by `Dot pulse` — the existing motion.spec.ts asserts on `bd-pulse-dot` keyframes which `Dot` already exposes.

- [ ] **Step 2.4.2: Update `StatusIndicator.test.tsx`**

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusIndicator } from '../StatusIndicator';

describe('StatusIndicator', () => {
  it.each(['red', 'yellow', 'green', 'gray'] as const)(
    'renders Dot with tone=%s',
    (status) => {
      const { container } = render(<StatusIndicator status={status} />);
      expect(container.querySelector(`.bd-dot--${status}`)).toBeInTheDocument();
    },
  );

  it('marks yellow as pulsing', () => {
    const { container } = render(<StatusIndicator status="yellow" />);
    const dot = container.querySelector('.bd-dot--yellow') as HTMLElement;
    expect(dot.style.animation).toContain('bd-pulse-dot');
  });

  it('exposes accessible label', () => {
    const { container } = render(<StatusIndicator status="red" />);
    expect(container.querySelector('[aria-label="Status: red"]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.4.3: Run + commit**

```bash
npm test -- --run src/components/pr/__tests__/StatusIndicator.test.tsx
git add src/BorgDock.Tauri/src/components/pr/StatusIndicator.tsx \
        src/BorgDock.Tauri/src/components/pr/__tests__/StatusIndicator.test.tsx
git commit -m "refactor(pr): StatusIndicator renders Dot primitive"
```

### 2.5 — `RepoGroup` filter-chip → `Pill`

- [ ] **Step 2.5.1: Read `RepoGroup.tsx` to find the `--color-filter-chip-bg` use site (line 103 area), replace with `<Pill tone="neutral">`.**

The block currently looks like:

```tsx
<span style={{
  background: 'var(--color-filter-chip-bg)',
  ...
}}>{count}</span>
```

Replace with:

```tsx
<Pill tone="neutral">{count}</Pill>
```

Preserve any surrounding layout (flex gap etc).

- [ ] **Step 2.5.2: Run RepoGroup tests + commit**

```bash
npm test -- --run src/components/pr/__tests__/RepoGroup.test.tsx
git add src/BorgDock.Tauri/src/components/pr/RepoGroup.tsx
git commit -m "refactor(pr): RepoGroup count badge uses Pill primitive"
```

### 2.6 — `PullRequestList` skeleton → `Card`

- [ ] **Step 2.6.1: Update the inline `SkeletonCard` to wrap in `<Card padding="sm">`**

Rewrite:

```tsx
import { Card } from '@/components/shared/primitives';

function SkeletonCard() {
  return (
    <Card padding="sm">
      <div className="flex items-start gap-2.5 animate-pulse">
        <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[var(--color-surface-raised)]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-[var(--color-surface-raised)]" />
          <div className="h-2.5 w-1/2 rounded bg-[var(--color-surface-raised)]" />
          <div className="h-2 w-1/3 rounded bg-[var(--color-surface-raised)]" />
        </div>
      </div>
    </Card>
  );
}
```

The `PullRequestList.test.tsx` only asserts the skeleton renders (or doesn't), not its exact tree structure. Selector adjustments are unlikely.

- [ ] **Step 2.6.2: Run tests + commit**

```bash
npm test -- --run src/components/pr/__tests__/PullRequestList.test.tsx
git add src/BorgDock.Tauri/src/components/pr/PullRequestList.tsx
git commit -m "refactor(pr): PullRequestList skeleton wraps in Card primitive"
```

### 2.7 — `PullRequestCard` → thin renderer around `<PRCard density="normal" />`

This is the biggest single refactor in Task 2. The existing `PullRequestCard.tsx` (419 lines) does:

1. Subscribe to several zustand stores (`usePrStore`, `useUiStore`).
2. Compute derived state (`mergeScore`, `workItemIds`, `isMyPr`, `worktreeMatch`, `canMerge`, `isExpanded`).
3. Render the card body — currently inline.
4. Render a hover action-bar overlay (`ActionButton` × N).
5. Render the inline expansion panel (`<ExpandedContent />`).
6. Render the context menu (`<PrContextMenu />`).
7. Render three `<ConfirmDialog />` instances (close / bypass / draft).

The migration: keep (1)–(2), replace (3) with `<PRCard density="normal" pr={mappedData} score={mergeScore} onClick={...} onContextMenu={...} isFocused={isFocused} trailing={<HoverActionBar ... />}>`, and keep (5)–(7) outside `PRCard` since they're feature-local concerns. The `<ExpandedContent />` panel renders below the card when `isExpanded` (it's currently nested inside the action button — hoist it to a sibling).

- [ ] **Step 2.7.1: Map the existing data to the `PRCardData` shape**

Add a small adapter inside `PullRequestCard.tsx`:

```tsx
function mapToPRCardData(
  prw: PullRequestWithChecks,
  isMyPr: boolean,
  failedCount: number,
  pendingCount: number,
  passedCount: number,
  totalCount: number,
  worktreeSlot?: string,
): PRCardData {
  const pr = prw.pullRequest;
  const statusLabel =
    failedCount > 0
      ? `${failedCount} failing`
      : pendingCount > 0
        ? 'in progress'
        : `${passedCount}/${totalCount} passing`;
  const reviewState =
    pr.reviewStatus === 'approved'
      ? 'approved'
      : pr.reviewStatus === 'changesRequested'
        ? 'changes'
        : pr.reviewStatus === 'commented'
          ? 'commented'
          : pr.reviewStatus === 'pending'
            ? 'pending'
            : 'none';
  return {
    number: pr.number,
    title: pr.title,
    repoOwner: pr.repoOwner,
    repoName: pr.repoName,
    authorLogin: pr.authorLogin,
    isMine: isMyPr,
    status: prw.overallStatus,
    statusLabel,
    reviewState,
    isDraft: pr.isDraft,
    isMerged: !!pr.mergedAt,
    isClosed: !!pr.closedAt,
    hasConflict: pr.mergeable === false,
    branch: pr.headRef,
    baseBranch: pr.baseRef,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changedFiles ?? 0,
    commitCount: pr.commitCount ?? 0,
    labels: pr.labels,
    worktreeSlot,
  };
}
```

- [ ] **Step 2.7.2: Replace the body of `PullRequestCard` with `<PRCard ... trailing={<HoverActionBar />}>`**

The hover action bar (the `<div className="opacity-0 group-hover:opacity-100">...</div>` block in the current file) extracts into a small inline `HoverActionBar` component that renders the existing `<ActionButton />` set. Pass `trailing={<HoverActionBar actions={actions} pr={prw} ... />}` to `<PRCard density="normal" .../>`.

The expansion panel (`<ExpandedContent />`) and context menu / confirm dialogs render as siblings below `<PRCard>`:

```tsx
return (
  <>
    <PRCard
      density="normal"
      pr={mapToPRCardData(prWithChecks, isMyPr, ...)}
      score={mergeScore}
      onClick={() => selectPr(pr.number)}
      onContextMenu={actions.handleContextMenu}
      active={isFocused}
      isFocused={isSelected}
      trailing={<HoverActionBar actions={actions} prWithChecks={prWithChecks} ... />}
    />
    {isExpanded && <ExpandedContent prWithChecks={prWithChecks} />}
    {actions.contextMenu && <PrContextMenu ... />}
    <ConfirmDialog ... />  {/* close */}
    <ConfirmDialog ... />  {/* bypass */}
    <ConfirmDialog ... />  {/* draft */}
  </>
);
```

The `data-pr-card` attribute that `useKeyboardNav.ts:152` queries for stays — add it as a passthrough on `PRCard`'s outer container by extending its props with `data-pr-card?: ""`. Or, simpler: in `PullRequestCard.tsx`, wrap `<PRCard>` in a `<div data-pr-card>` (the keyboard-nav code only needs the attribute, not the click target). Pick whichever doesn't break `useKeyboardNav` — verify by running the keyboard-nav e2e spec at the end of Task 2.

- [ ] **Step 2.7.3: Update `PullRequestCard.test.tsx`**

The existing test file is 600+ lines and asserts many things via `[data-pr-card]` and text queries. Most should still pass (text content didn't change). Adjust assertions that relied on the old inline avatar/badge classes — replace with primitive class queries (`.bd-avatar--own`, `.bd-pill`, `.bd-ring`, etc).

If any test asserts on the exact string `bg-[var(--color-card-background)]` or similar Tailwind class chain inside the card body, update to assert primitive presence instead (`container.querySelector('.bd-card')`).

- [ ] **Step 2.7.4: Run tests**

```bash
npm test -- --run src/components/pr/__tests__/PullRequestCard.test.tsx
```

Expected: all tests pass. Failures usually come from two places: (a) class-chain assertions, (b) the avatar rendering changed from inline `<span>` to `<Avatar>` (now `.bd-avatar`).

- [ ] **Step 2.7.5: Run all `pr/` tests + a sweep of focus tests (FocusList composes PullRequestCard)**

```bash
npm test -- --run src/components/pr src/components/focus
```

Expected: every test green.

- [ ] **Step 2.7.6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr/PullRequestCard.tsx \
        src/BorgDock.Tauri/src/components/pr/__tests__/PullRequestCard.test.tsx
git commit -m "refactor(pr): PullRequestCard renders PRCard density='normal' + hover action bar"
```

---

## Task 3 — Migrate `flyout/*` onto primitives + PRRow wrapper

`FlyoutGlance` currently inlines its own `IconButton`, `StatDot`, `PrRow`, `ReviewBadge`, `StatusIcon`, `CommentIcon` helper components. Replace each with the primitive equivalent. Move `PrRow` to its own file (`flyout/PRRow.tsx`) as a thin wrapper around `<PRCard density="compact" />`.

**Files (modify):**

- `src/BorgDock.Tauri/src/components/flyout/FlyoutGlance.tsx`
- `src/BorgDock.Tauri/src/components/flyout/FlyoutToast.tsx`
- `src/BorgDock.Tauri/src/components/flyout/FlyoutInitializing.tsx`
- `src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutToast.test.tsx`
- `src/BorgDock.Tauri/src/components/flyout/__tests__/flyout-mode.test.ts`

**Files (create):**

- `src/BorgDock.Tauri/src/components/flyout/PRRow.tsx`
- `src/BorgDock.Tauri/src/components/flyout/__tests__/PRRow.test.tsx`
- `src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutGlance.test.tsx` (currently absent — add minimal coverage as part of this migration since the e2e flyout.spec.ts depends on its DOM contract)

### 3.1 — `flyout/PRRow.tsx` thin wrapper

- [ ] **Step 3.1.1: Write the failing test**

```tsx
// src/BorgDock.Tauri/src/components/flyout/__tests__/PRRow.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PRRow } from '../PRRow';
import type { FlyoutPr } from '../FlyoutGlance';

const sample: FlyoutPr = {
  number: 715,
  title: 'AB#54258 list price on add',
  repoOwner: 'Gomocha-FSP',
  repoName: 'FSP',
  authorLogin: 'sschmidt',
  authorAvatarUrl: '',
  overallStatus: 'yellow',
  reviewStatus: 'none',
  failedCount: 0,
  failedCheckNames: [],
  pendingCount: 2,
  passedCount: 3,
  totalChecks: 5,
  commentCount: 0,
  isMine: false,
};

describe('PRRow', () => {
  it('renders PRCard in compact density', () => {
    const { container } = render(<PRRow pr={sample} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-row]')).toBeInTheDocument();
    expect(container.querySelector('.bd-ring')).not.toBeInTheDocument();
  });

  it('emits data-pr-number for keyboard-nav contract', () => {
    const { container } = render(<PRRow pr={sample} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-number="715"]')).toBeInTheDocument();
  });

  it('calls onClick when row is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(<PRRow pr={sample} onClick={onClick} />);
    fireEvent.click(container.querySelector('[data-pr-row]')!);
    expect(onClick).toHaveBeenCalledWith(sample);
  });

  it('renders the approved review pill with data-pill-tone="approved"', () => {
    const { container } = render(
      <PRRow pr={{ ...sample, reviewStatus: 'approved' }} onClick={vi.fn()} />,
    );
    expect(
      container.querySelector('[data-pill-tone="approved"]'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.1.2: Run test — confirm failure**

```bash
npm test -- --run src/components/flyout/__tests__/PRRow.test.tsx
```

Expected: FAIL on `Cannot find module '../PRRow'`.

- [ ] **Step 3.1.3: Implement `flyout/PRRow.tsx`**

```tsx
import { PRCard, type PRCardData } from '@/components/pr/PRCard';
import type { FlyoutPr } from './FlyoutGlance';

interface PRRowProps {
  pr: FlyoutPr;
  active?: boolean;
  onClick: (pr: FlyoutPr) => void;
}

function mapFlyoutPr(pr: FlyoutPr): PRCardData {
  const statusLabel =
    pr.failedCount > 0
      ? `${pr.failedCount} failing`
      : pr.pendingCount > 0
        ? `${pr.pendingCount} running`
        : `${pr.passedCount} passed`;
  const reviewState =
    pr.reviewStatus === 'approved'
      ? 'approved'
      : pr.reviewStatus === 'changesRequested'
        ? 'changes'
        : pr.reviewStatus === 'commented'
          ? 'commented'
          : pr.reviewStatus === 'pending'
            ? 'pending'
            : 'none';
  return {
    number: pr.number,
    title: pr.title,
    repoOwner: pr.repoOwner,
    repoName: pr.repoName,
    authorLogin: pr.authorLogin,
    isMine: pr.isMine,
    status: pr.overallStatus,
    statusLabel,
    reviewState,
    isDraft: false,
    isMerged: false,
    isClosed: false,
    hasConflict: false,
  };
}

export function PRRow({ pr, active, onClick }: PRRowProps) {
  return (
    <PRCard
      pr={mapFlyoutPr(pr)}
      density="compact"
      active={active}
      onClick={() => onClick(pr)}
    />
  );
}
```

- [ ] **Step 3.1.4: Run test, expect pass, commit**

```bash
npm test -- --run src/components/flyout/__tests__/PRRow.test.tsx
git add src/BorgDock.Tauri/src/components/flyout/PRRow.tsx \
        src/BorgDock.Tauri/src/components/flyout/__tests__/PRRow.test.tsx
git commit -m "feat(flyout): PRRow thin wrapper over PRCard density='compact'"
```

### 3.2 — `FlyoutGlance` migration

Replace inline `IconButton` / `StatDot` / `PrRow` / `ReviewBadge` / `StatusIcon` helpers with primitives. The two header buttons (Open sidebar / Settings) become primitive `IconButton`s. The three `StatDot` calls in the summary strip become `<Dot tone={...} pulse={pulse}>` followed by inline count + label spans. The list of `PrRow` calls becomes the new `PRRow` component imported from `./PRRow`. Active-row tracking (`j` / `k` keyboard nav) sets `data-active="true"` on the matching row by passing `active={index === activeIndex}` to `<PRRow>`.

- [ ] **Step 3.2.1: Add minimal `FlyoutGlance.test.tsx`**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlyoutGlance, type FlyoutData } from '../FlyoutGlance';

const data: FlyoutData = {
  pullRequests: [
    {
      number: 715,
      title: 'AB#54258 list price on add',
      repoOwner: 'Gomocha-FSP',
      repoName: 'FSP',
      authorLogin: 'sschmidt',
      authorAvatarUrl: '',
      overallStatus: 'yellow',
      reviewStatus: 'none',
      failedCount: 0,
      failedCheckNames: [],
      pendingCount: 2,
      passedCount: 3,
      totalChecks: 5,
      commentCount: 0,
      isMine: false,
    },
    {
      number: 714,
      title: 'AB#54252 quote grid refresh',
      repoOwner: 'Gomocha-FSP',
      repoName: 'FSP',
      authorLogin: 'sschmidt',
      authorAvatarUrl: '',
      overallStatus: 'red',
      reviewStatus: 'approved',
      failedCount: 2,
      failedCheckNames: ['ci/e2e', 'ci/deploy-check'],
      pendingCount: 0,
      passedCount: 7,
      totalChecks: 9,
      commentCount: 2,
      isMine: false,
    },
  ],
  failingCount: 1,
  pendingCount: 1,
  passingCount: 1,
  totalCount: 2,
  username: 'me',
  theme: 'dark',
  lastSyncAgo: 'just now',
  hotkey: 'Ctrl+Win+Shift+G',
};

describe('FlyoutGlance', () => {
  it('renders one PRRow per pullRequests entry with data-pr-row', () => {
    const { container } = render(<FlyoutGlance data={data} onClose={vi.fn()} />);
    const rows = container.querySelectorAll('[data-pr-row]');
    expect(rows).toHaveLength(2);
  });

  it('renders the approved review pill on the second row', () => {
    const { container } = render(<FlyoutGlance data={data} onClose={vi.fn()} />);
    expect(
      container.querySelector('[data-pr-number="714"] [data-pill-tone="approved"]'),
    ).toBeInTheDocument();
  });

  it('shows the count of open PRs in the header subtitle', () => {
    render(<FlyoutGlance data={data} onClose={vi.fn()} />);
    expect(screen.getByText(/2 open pull requests/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.2.2: Rewrite `FlyoutGlance.tsx`**

Key changes:

- Remove inline `IconButton`, `StatDot`, `PrRow`, `ReviewBadge`, `StatusIcon`, `CommentIcon`, `PanelRightOpenIcon`, `SettingsIcon` helpers (keep the SVG-only icons inline since they're not buttons; only the wrapper components migrate).
- Header buttons: `<IconButton icon={<PanelRightIcon />} tooltip="Open sidebar" onClick={...} />` and `<IconButton icon={<SettingsIcon />} tooltip="Settings" onClick={...} />`.
- Stat strip: each entry becomes `<Dot tone={tone} pulse={pulse}><span>...</span></Dot>` siblings — use `Dot` for the colored dot and inline spans for the count + label.
- PR list: `data.pullRequests.map((pr) => <PRRow key={...} pr={pr} active={i === activeIndex} onClick={handleClickPr} />)`.
- Optionally lift the `j`/`k` activeIndex state into a small hook in FlyoutGlance — the existing flyout.spec.ts asserts `[data-active="true"]` flips index on `j` press; the wrapping div listens for keydown and updates state.

- [ ] **Step 3.2.3: Run flyout tests**

```bash
npm test -- --run src/components/flyout
```

Expected: all flyout tests pass.

- [ ] **Step 3.2.4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/flyout/FlyoutGlance.tsx \
        src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutGlance.test.tsx
git commit -m "refactor(flyout): FlyoutGlance uses primitives + PRRow"
```

### 3.3 — `FlyoutToast` migration + `data-toast` attr

`FlyoutToast` is a slide-in banner. The motion.spec.ts asserts a `[data-toast]` element exists and its computed `transform` settles at `matrix(1, 0, 0, 1, ~0, ~0)`.

- [ ] **Step 3.3.1: Add `data-toast=""` to the toast outer container; replace inline pill chip with `<Pill tone={...}>`**

The toast's outer slide-in `<div>` gets `data-toast=""`. The severity pill inside becomes `<Pill tone={severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : severity === 'success' ? 'success' : 'neutral'}>`.

Keep the existing CSS keyframe animation — the motion test only inspects `transform`, not the keyframe name.

- [ ] **Step 3.3.2: Update `FlyoutToast.test.tsx`**

The existing test asserts on the rendered title text; add an assertion that `data-toast` exists:

```tsx
it('renders the toast container with data-toast', () => {
  const { container } = render(<FlyoutToast {...props} />);
  expect(container.querySelector('[data-toast]')).toBeInTheDocument();
});
```

- [ ] **Step 3.3.3: Run + commit**

```bash
npm test -- --run src/components/flyout
git add src/BorgDock.Tauri/src/components/flyout/FlyoutToast.tsx \
        src/BorgDock.Tauri/src/components/flyout/__tests__/FlyoutToast.test.tsx
git commit -m "refactor(flyout): FlyoutToast uses Pill + adds data-toast"
```

### 3.4 — `FlyoutInitializing` migration

- [ ] **Step 3.4.1: Wrap the body in `<Card padding="md">` and replace any inline rounded card chrome.**

This file is small. Read it, identify the outer `<div>` with the rounded border, replace with `<Card>`.

- [ ] **Step 3.4.2: Run + commit**

```bash
npm test -- --run src/components/flyout
git add src/BorgDock.Tauri/src/components/flyout/FlyoutInitializing.tsx
git commit -m "refactor(flyout): FlyoutInitializing wraps in Card primitive"
```

---

## Task 4 — Migrate `focus/*` list surfaces (excluding QuickReview)

QuickReview is its own task (Task 5) because it's the highest-risk surface in the PR. This task covers `FocusList`, `FocusEmptyState`, `PriorityReasonLabel`, and `MergeToast`.

**Files (modify):**

- `src/BorgDock.Tauri/src/components/focus/FocusList.tsx`
- `src/BorgDock.Tauri/src/components/focus/FocusEmptyState.tsx`
- `src/BorgDock.Tauri/src/components/focus/PriorityReasonLabel.tsx`
- `src/BorgDock.Tauri/src/components/focus/MergeToast.tsx`
- Their `__tests__/` files.

### 4.1 — `PriorityReasonLabel` → `Pill` + `data-priority-reason`

- [ ] **Step 4.1.1: Read current `PriorityReasonLabel.tsx`** (it renders a small badge with priority factors). Convert to:

```tsx
import { Pill } from '@/components/shared/primitives';
import type { PriorityFactor } from '@/services/priority-scoring';

interface PriorityReasonLabelProps {
  factors: PriorityFactor[];
}

export function PriorityReasonLabel({ factors }: PriorityReasonLabelProps) {
  if (factors.length === 0) return null;
  const top = factors[0]!; // factors are pre-sorted by weight descending
  return (
    <Pill tone="neutral" data-priority-reason={top.kind}>
      {top.label}
    </Pill>
  );
}
```

(Match the actual `PriorityFactor` shape — read the type from `services/priority-scoring`. Adjust `kind` / `label` accessors to whatever the actual type uses.)

- [ ] **Step 4.1.2: Update `PriorityReasonLabel.test.tsx`** to assert the `[data-priority-reason]` attribute renders.

- [ ] **Step 4.1.3: Run + commit**

```bash
npm test -- --run src/components/focus/__tests__/PriorityReasonLabel.test.tsx
git add src/BorgDock.Tauri/src/components/focus/PriorityReasonLabel.tsx \
        src/BorgDock.Tauri/src/components/focus/__tests__/PriorityReasonLabel.test.tsx
git commit -m "refactor(focus): PriorityReasonLabel uses Pill + data-priority-reason"
```

### 4.2 — `FocusList` → add `data-focus-item` to each row wrapper

- [ ] **Step 4.2.1: Update the `focusPrs.map(...)` block**

The existing wrapper `<div key={...} className="animate-[fadeSlideIn_0.2s_ease-out]">` gains `data-focus-item=""`:

```tsx
{focusPrs.map((pr) => {
  const score = priorityScores.get(pr.pullRequest.number);
  return (
    <div
      key={pr.pullRequest.number}
      data-focus-item=""
      className="animate-[fadeSlideIn_0.2s_ease-out]"
    >
      <PullRequestCard
        prWithChecks={pr}
        isFocused={selectedPrNumber === pr.pullRequest.number}
        focusMode
        priorityFactors={score?.factors}
      />
    </div>
  );
})}
```

`PullRequestCard` already renders `PRCard` from Task 2, so the Focus list inherits the primitive migration transitively.

- [ ] **Step 4.2.2: Update `FocusList.test.tsx` to assert `[data-focus-item]` count == focus PR count**

- [ ] **Step 4.2.3: Run + commit**

```bash
npm test -- --run src/components/focus/__tests__/FocusList.test.tsx
git add src/BorgDock.Tauri/src/components/focus/FocusList.tsx \
        src/BorgDock.Tauri/src/components/focus/__tests__/FocusList.test.tsx
git commit -m "refactor(focus): FocusList adds data-focus-item to row wrapper"
```

### 4.3 — `FocusEmptyState` → wrap in `<Card>`

- [ ] **Step 4.3.1: Replace the outer rounded `<div>` with `<Card padding="lg">`.**

- [ ] **Step 4.3.2: Run existing `FocusEmptyState.test.tsx` + commit**

```bash
npm test -- --run src/components/focus/__tests__/FocusEmptyState.test.tsx
git add src/BorgDock.Tauri/src/components/focus/FocusEmptyState.tsx
git commit -m "refactor(focus): FocusEmptyState wraps in Card primitive"
```

### 4.4 — `MergeToast` → `Pill` + `data-toast`

- [ ] **Step 4.4.1: Replace inline status badge with `<Pill tone="success">` and add `data-toast=""` to the outer container.**

- [ ] **Step 4.4.2: Update `MergeToast.test.tsx` if assertions referenced old class chain.**

- [ ] **Step 4.4.3: Run + commit**

```bash
npm test -- --run src/components/focus/__tests__/MergeToast.test.tsx
git add src/BorgDock.Tauri/src/components/focus/MergeToast.tsx \
        src/BorgDock.Tauri/src/components/focus/__tests__/MergeToast.test.tsx
git commit -m "refactor(focus): MergeToast uses Pill + data-toast"
```

---

## Task 5 — Rebuild `QuickReviewOverlay` on primitives

**Highest-risk surface in this PR.** The overlay has its own keyboard-shortcut contract (A approve, C comment, X request changes, S/→ skip, ← back, Esc close), its own slide-in / slide-out motion, and is wrapped in `FocusTrap`. The existing `focus.spec.ts` "Quick Review opens, cycles, closes" and "summary shows counts" tests must keep passing. Visual baseline for the overlay should start matching the design.

**Files (modify):**

- `src/BorgDock.Tauri/src/components/focus/QuickReviewOverlay.tsx`
- `src/BorgDock.Tauri/src/components/focus/QuickReviewCard.tsx`
- `src/BorgDock.Tauri/src/components/focus/QuickReviewSummary.tsx`
- Their `__tests__/` files.

### 5.1 — `QuickReviewOverlay` rebuild

- [ ] **Step 5.1.1: Add data-attrs and migrate buttons**

Required changes (no behavior change beyond styling):

- Outer panel `<div>` gains `data-overlay="quick-review"`.
- Header close button → `<IconButton icon={<CloseIcon />} tooltip="Close" onClick={endSession} />`.
- Action bar buttons → primitive `<Button>`:
  - Back: `<Button variant="ghost" size="md">← Back</Button>`
  - Skip: `<Button variant="ghost" size="md">Skip →</Button>`
  - Comment (C): `<Button variant="secondary" size="md" leading={...}>Comment (C)</Button>` — the primitive `Button` only knows "primary" / "ghost" / "danger"; for "secondary" use `variant="ghost"` with the existing border color carried via `className`.
  - Request Changes (X): `<Button variant="danger" size="md">Request Changes (X)</Button>`.
  - Approve (A): `<Button variant="primary" size="md">Approve (A)</Button>`.
- Comment textarea: stays a `<textarea>` (the `Input` primitive is single-line). Wrap in a primitive-styled `<div className="bd-input-shell">` if such a class exists; otherwise leave existing styling — document with a one-line comment that `Input` is single-line and a future textarea primitive (out of scope) would consolidate.
- Submit comment / cancel buttons in the comment-mode flow → primitive `<Button>` (primary + ghost respectively).
- Error banner retry / skip → primitive `<Button variant="ghost" size="sm">`.

- [ ] **Step 5.1.2: Update `QuickReviewOverlay.test.tsx`**

Existing tests cover keyboard handling, button presence, error banner. Update assertions that target old class chains. New assertions:

```tsx
it('renders data-overlay="quick-review" on the dialog panel', () => {
  // ...render with state='reviewing', queue=[mockPR]
  expect(container.querySelector('[data-overlay="quick-review"]')).toBeInTheDocument();
});
```

- [ ] **Step 5.1.3: Run + commit**

```bash
npm test -- --run src/components/focus/__tests__/QuickReviewOverlay.test.tsx
git add src/BorgDock.Tauri/src/components/focus/QuickReviewOverlay.tsx \
        src/BorgDock.Tauri/src/components/focus/__tests__/QuickReviewOverlay.test.tsx
git commit -m "refactor(focus): QuickReviewOverlay rebuilt on primitives + data-overlay attr"
```

### 5.2 — `QuickReviewCard` migration + `data-pr-title`

- [ ] **Step 5.2.1: Update `QuickReviewCard.tsx`**

- Title element `<div className="text-sm font-semibold ...">{p.title}</div>` gains `data-pr-title=""`.
- Branch flow `<span className="rounded bg-[var(...)] ..."> ... </span>` × 2 → `<Pill tone="neutral">` × 2.
- Labels block: `<span ...>{l}</span>` → `<Pill tone="neutral">{l}</Pill>`.
- Body markdown container wraps in `<Card padding="sm">`.

- [ ] **Step 5.2.2: Update `QuickReviewCard.test.tsx`**

Add assertion for `[data-pr-title]`. Replace any class-chain assertion with text/role-based query.

- [ ] **Step 5.2.3: Run + commit**

```bash
npm test -- --run src/components/focus/__tests__/QuickReviewCard.test.tsx
git add src/BorgDock.Tauri/src/components/focus/QuickReviewCard.tsx \
        src/BorgDock.Tauri/src/components/focus/__tests__/QuickReviewCard.test.tsx
git commit -m "refactor(focus): QuickReviewCard uses Pill + Card + data-pr-title"
```

### 5.3 — `QuickReviewSummary` migration + `data-quick-review-summary`

- [ ] **Step 5.3.1: Update `QuickReviewSummary.tsx`**

- Outer `<div className="space-y-4">` gains `data-quick-review-summary=""`.
- Each PR list row wraps in `<Card padding="sm">`.
- "Done" button → `<Button variant="primary" size="md" className="w-full">Done</Button>`.

- [ ] **Step 5.3.2: Update `QuickReviewSummary.test.tsx`**

Add `[data-quick-review-summary]` selector check.

- [ ] **Step 5.3.3: Run + commit**

```bash
npm test -- --run src/components/focus/__tests__/QuickReviewSummary.test.tsx
git add src/BorgDock.Tauri/src/components/focus/QuickReviewSummary.tsx \
        src/BorgDock.Tauri/src/components/focus/__tests__/QuickReviewSummary.test.tsx
git commit -m "refactor(focus): QuickReviewSummary uses Card + Button + data-quick-review-summary"
```

---

## Task 6 — Migrate `work-items/*` onto primitives

**Files (modify):**

- `src/BorgDock.Tauri/src/components/work-items/WorkItemCard.tsx`
- `src/BorgDock.Tauri/src/components/work-items/WorkItemFilterBar.tsx`
- `src/BorgDock.Tauri/src/components/work-items/WorkItemList.tsx`
- `src/BorgDock.Tauri/src/components/work-items/QueryBrowser.tsx`
- `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.tsx`
- `src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel.tsx`
- `src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.tsx`
- Their `__tests__/` files.

### 6.1 — `WorkItemCard` migration

- [ ] **Step 6.1.1: Replace outer container**

```tsx
<Card
  variant={item.isWorkingOn ? 'own' : 'default'}
  padding="sm"
  interactive
  onClick={() => onSelect(item.id)}
  onContextMenu={handleContextMenu}
  className={clsx(
    item.isTracked && 'border-[var(--color-tracked-border)] bg-[var(--color-tracked-soft)]',
    item.isSelected && 'ring-2 ring-[var(--color-accent)]',
  )}
>
```

(`Card`'s `variant="own"` only paints the my-PR stripe; other states keep their state-coloured background via `className` overrides.)

- [ ] **Step 6.1.2: Replace type-letter avatar**

```tsx
<Avatar initials={typeLetter} tone={tracking ? 'own' : 'them'} size="md" />
```

- [ ] **Step 6.1.3: Replace state badge with `<Pill>`**

```tsx
<Pill tone={pillTone(item.state)}>{item.state}</Pill>
```

Add a tiny helper `pillTone(state: string): PillTone` that maps Active → `warning`, Resolved → `success`, etc.

- [ ] **Step 6.1.4: Replace tracking buttons with `<IconButton>`**

```tsx
<IconButton
  icon={<EyeIcon filled={item.isTracked} />}
  active={item.isTracked}
  tooltip={item.isTracked ? 'Stop tracking' : 'Track this item'}
  onClick={(e) => { e.stopPropagation(); onToggleTracked(item.id); }}
  size={22}
/>
```

- [ ] **Step 6.1.5: Update `WorkItemCard.test.tsx` selectors**

- [ ] **Step 6.1.6: Run + commit**

```bash
npm test -- --run src/components/work-items/__tests__/WorkItemCard.test.tsx
git add src/BorgDock.Tauri/src/components/work-items/WorkItemCard.tsx \
        src/BorgDock.Tauri/src/components/work-items/__tests__/WorkItemCard.test.tsx
git commit -m "refactor(work-items): WorkItemCard uses Card + Avatar + Pill + IconButton"
```

### 6.2 — `WorkItemFilterBar` migration

- [ ] **Step 6.2.1: Replace tracking-pill row with three `<Chip>` calls**

```tsx
<Chip
  active={trackingFilter === 'all'}
  onClick={() => onTrackingFilterChange('all')}
>
  All
</Chip>
<Chip
  active={trackingFilter === 'tracked'}
  count={trackedCount > 0 ? trackedCount : undefined}
  onClick={() => onTrackingFilterChange('tracked')}
>
  Tracked
</Chip>
<Chip
  active={trackingFilter === 'workingOn'}
  count={workingOnCount > 0 ? workingOnCount : undefined}
  onClick={() => onTrackingFilterChange('workingOn')}
>
  Working
</Chip>
```

The `--color-filter-chip-bg/fg` token references inside the file go away (Chip uses its own `bd-pill--ghost`/`bd-pill--neutral` tokens).

- [ ] **Step 6.2.2: Replace refresh button with `<IconButton>`**

- [ ] **Step 6.2.3: Update `WorkItemFilterBar.test.tsx` selectors**

- [ ] **Step 6.2.4: Run + commit**

```bash
npm test -- --run src/components/work-items/__tests__/WorkItemFilterBar.test.tsx
git add src/BorgDock.Tauri/src/components/work-items/WorkItemFilterBar.tsx \
        src/BorgDock.Tauri/src/components/work-items/__tests__/WorkItemFilterBar.test.tsx
git commit -m "refactor(work-items): WorkItemFilterBar uses Chip + IconButton"
```

### 6.3 — `WorkItemList` empty / loading states

- [ ] **Step 6.3.1: Wrap empty / loading states in `<Card padding="md">` for visual consistency.**

- [ ] **Step 6.3.2: Run + commit**

```bash
npm test -- --run src/components/work-items/__tests__/WorkItemList.test.tsx
git add src/BorgDock.Tauri/src/components/work-items/WorkItemList.tsx
git commit -m "refactor(work-items): WorkItemList empty/loading states wrap in Card"
```

### 6.4 — `QueryBrowser` migration

- [ ] **Step 6.4.1: Migrate query rows + buttons**

- Query rows → `<Card interactive padding="sm" onClick={...}>`.
- "Load Query" button → `<Button variant="primary" size="md">`.
- Filter chips inside QueryBrowser (line 207 area) → `<Chip>`.
- The search input → `<Input leading={<SearchIcon />} placeholder="Search queries...">`.

- [ ] **Step 6.4.2: Update `QueryBrowser.test.tsx`**

- [ ] **Step 6.4.3: Run + commit**

```bash
npm test -- --run src/components/work-items/__tests__/QueryBrowser.test.tsx
git add src/BorgDock.Tauri/src/components/work-items/QueryBrowser.tsx \
        src/BorgDock.Tauri/src/components/work-items/__tests__/QueryBrowser.test.tsx
git commit -m "refactor(work-items): QueryBrowser uses Card + Button + Chip + Input"
```

### 6.5 — `WorkItemDetailPanel` + `WorkItemDetailApp` migration

These two render the work-item detail surface (poppable sub-window). They share a lot of structure.

- [ ] **Step 6.5.1: Replace field rows + buttons + pills with primitives**

Specifically:

- Section headings keep their `<h3>` element.
- Field rows wrap in `<Card padding="sm">` for the editable rows.
- Save / Cancel buttons → `<Button variant="primary" size="md">` and `<Button variant="ghost" size="md">`.
- Disabled states use `<Button disabled>` instead of manual `cursor-not-allowed` Tailwind.
- State pill at the top → `<Pill tone={...}>`.
- The lines that reference `--color-filter-chip-bg/fg` (lines 491, 526) become disabled-state on `<Button>` or a `<Pill tone="neutral">` for read-only fields.

- [ ] **Step 6.5.2: Update `WorkItemDetailPanel.test.tsx` and `WorkItemDetailApp.test.tsx`**

- [ ] **Step 6.5.3: Run + commit**

```bash
npm test -- --run src/components/work-items/__tests__/WorkItemDetailPanel.test.tsx src/components/work-items/__tests__/WorkItemDetailApp.test.tsx
git add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel.tsx \
        src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.tsx \
        src/BorgDock.Tauri/src/components/work-items/__tests__/WorkItemDetailPanel.test.tsx \
        src/BorgDock.Tauri/src/components/work-items/__tests__/WorkItemDetailApp.test.tsx
git commit -m "refactor(work-items): WorkItemDetailPanel + App use primitives"
```

### 6.6 — `WorkItemsSection` migration

- [ ] **Step 6.6.1: Wrap unconfigured / error states in `<Card>`. Verify "Configure Azure DevOps in Settings to see work items" text remains exact (work-items.spec.ts asserts on this string).**

- [ ] **Step 6.6.2: Run + commit**

```bash
npm test -- --run src/components/work-items/__tests__/WorkItemsSection.test.tsx
git add src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.tsx
git commit -m "refactor(work-items): WorkItemsSection unconfigured state wraps in Card"
```

---

## Task 7 — Verify motion + behavioral e2e contracts

After Tasks 1–6, every required `data-*` attribute is in place. Confirm by running the affected Playwright specs.

- [ ] **Step 7.1: Run the focus + flyout + work-items + pr-list + motion behavioral specs**

```bash
cd src/BorgDock.Tauri
npm run test:e2e -- --project=webview-mac \
  tests/e2e/focus.spec.ts \
  tests/e2e/flyout.spec.ts \
  tests/e2e/work-items.spec.ts \
  tests/e2e/pr-list.spec.ts \
  tests/e2e/motion.spec.ts
```

Expected: every test in those five specs passes. The motion test for the section-tab underline already conditionally skips on `[data-section-tabs]` visibility — PR #2 added the attribute so the test should now run and pass.

If any spec fails, read the failure carefully. The most common failure modes:

- `[data-pr-row]` count mismatch in flyout → fixture drift; check `seedDesignFixturesIfAvailable` actually loaded.
- `[data-pill-tone="approved"]` not found → `PRCard` failed to map `reviewStatus` correctly. Re-check the mapping in `mapToPRCardData` / `mapFlyoutPr`.
- `data-active="true"` doesn't move on `j` press → flyout's local activeIndex state isn't wired through to `<PRRow active>`.
- `[data-overlay="quick-review"]` missing → `QuickReviewOverlay`'s panel `<div>` didn't get the attribute.
- Motion `transform: matrix(0.97...)` not detected → the primitive `Button` already implements the `:active` scale; this should work without changes. If it fails, check the test's selector `page.locator('button').first()` — primitive `<button>` element must be tagged with the `bd-btn` class (already true in PR #1).

- [ ] **Step 7.2: Run the visual.spec.ts for the four migrated surfaces**

```bash
npm run test:e2e -- --project=webview-mac \
  tests/e2e/visual.spec.ts \
  --grep="focus|flyout|pr-list|work-items"
```

Expected: visual baselines start matching. If diffs are within the 4% default `maxDiffPixelRatio`, tests pass. If a specific surface still diffs > 4%, inspect the diff PNG in `tests/e2e/test-results/` — common causes:

- Fonts antialiased differently between WebView2 and the prototype's Chromium → expected; if pixel ratio is < 8% add a per-surface tolerance entry to `visual-tolerances.ts` with a code comment justifying it.
- Layout off because primitives use `bd-*` classes the prototype doesn't have → not expected; if it happens, the primitive's CSS in PR #1 needs auditing (escalate, do not patch CSS in this PR).

- [ ] **Step 7.3: Commit any tolerance adjustments**

If tolerances changed, commit them as a single dedicated commit with each entry justified:

```bash
git add src/BorgDock.Tauri/tests/e2e/visual-tolerances.ts
git commit -m "test(visual): add per-surface tolerances for PR #3 surfaces"
```

If no adjustments needed, skip the commit.

---

## Task 8 — Run the full test suite

- [ ] **Step 8.1: Full vitest pass**

```bash
cd src/BorgDock.Tauri
npm test -- --run
```

Expected: ~2517 tests + the new tests added in Tasks 1–6 all green. The exact count will be higher than 2517; confirm there are no failures and no unexpected drops.

- [ ] **Step 8.2: Full Playwright pass on webview-mac**

```bash
npm run test:e2e -- --project=webview-mac
```

Expected: every spec passes. If a spec fails outside the PR #3 scope, check whether PR #2 left it failing (compare against `git log feat/streamline-02-chrome` for known-pending tests). Pre-existing failures aren't blocking — file as a follow-up note.

- [ ] **Step 8.3: Full Playwright pass on webview-win (skip if not on Windows)**

If the worktree is on macOS, skip this step and document it in the PR description (the CI workflow will run it on the Windows runner).

---

## Task 9 — Sweep `index.css` for orphaned classes

The spec §8 PR #3 row says: "Delete the now-unused `.pr-card*`, `.filter-chip*`, `.pr-row*` CSS classes from `src/styles/index.css`."

- [ ] **Step 9.1: Grep for class selectors with those prefixes**

```bash
cd src/BorgDock.Tauri
grep -nE "^\s*\.(pr-card|pr-row|filter-chip)" src/styles/index.css
```

Expected: no output. (Verified at plan-write time: zero matches; the only `filter-chip` occurrences are `--color-filter-chip-*` custom properties consumed by surfaces outside PR #3 scope.)

If the grep returns matches, those classes are unused (since PR #3 now owns every PR/flyout/focus/work-items consumer); delete the matching CSS blocks.

- [ ] **Step 9.2: Grep app code for `pr-card` / `pr-row` className references that may have leaked through migration**

```bash
grep -rnE "className=[\"\`'][^\"\`']*(pr-card|pr-row|filter-chip)" src/
```

Expected: no matches in `src/components/{pr,flyout,focus,work-items}/`. Any matches in `src/components/{layout,settings,...}/` are out of scope. Any match inside the four migrated dirs is a migration bug — fix.

- [ ] **Step 9.3: Commit any deletions**

```bash
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "chore(styles): drop pr-card/pr-row/filter-chip class selectors orphaned by PR #3"
```

If nothing to delete, skip this commit.

---

## Task 10 — Update spec Delivery Ledger

- [ ] **Step 10.1: Edit `docs/superpowers/specs/2026-04-24-shared-components-design.md`**

Update the Delivery Ledger table row for PR #3:

```markdown
| #3 | `feat/streamline-03-pr-surfaces` | In review | — | — | — |
```

becomes

```markdown
| #3 | `feat/streamline-03-pr-surfaces` | In review | — | 2026-04-25 | PR opened against `feat/streamline-02-chrome` |
```

(Use the actual PR-open date from `date +%F`. Adjust the "stacks on" base if Prereq 2 forced a rebase to master.)

- [ ] **Step 10.2: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): mark PR #3 as in review"
```

---

## Task 11 — Open the PR

The user's `gh` is on the enterprise account by default (`KvanderBorght_gomocha`). Switch to `borght-dev` for the personal repo, open the PR, then switch back. CLAUDE.md `# GITHUB CLI ACCOUNTS` documents the rule.

- [ ] **Step 11.1: Push the branch**

```bash
cd /Users/koenvdb/projects/borgdock-streamline-03
git push -u origin feat/streamline-03-pr-surfaces
```

If the push prompts for credentials, that's the EMU enterprise account refusing — `git push` in this repo uses `gh` credentials transparently. The push to `borght-dev/BorgDock` only works when `gh` is set to `borght-dev`. Run `gh auth switch --user borght-dev` first if needed.

- [ ] **Step 11.2: Switch gh account, open PR, switch back**

```bash
gh auth switch --user borght-dev

gh pr create \
  --repo borght-dev/BorgDock \
  --base feat/streamline-02-chrome \
  --head feat/streamline-03-pr-surfaces \
  --title "Streamline PR #3 — PR surfaces: main window + flyout + Focus + Work Items" \
  --body "$(cat <<'EOF'
## Summary
- Adds unified `PRCard` with `density: "compact" | "normal"` prop. The flyout's `PRRow` is now a thin wrapper over `<PRCard density="compact" />` (spec §8 PR #3).
- Migrates every consumer in `components/pr/*`, `components/flyout/*`, `components/focus/*`, `components/work-items/*` onto the PR #1 primitives (`Avatar`, `Pill`, `Chip`, `Dot`, `Ring`, `Button`, `IconButton`, `Card`, `Input`, `LinearProgress`).
- Rebuilds the QuickReview overlay (`focus/QuickReviewOverlay.tsx`, `QuickReviewCard.tsx`, `QuickReviewSummary.tsx`) on primitives. Behavior + keyboard contract preserved.
- Adds the test-contract `data-*` hooks the `focus.spec.ts`, `flyout.spec.ts`, and `motion.spec.ts` suites assert on (`data-pr-row`, `data-pr-number`, `data-pill-tone`, `data-active`, `data-focus-item`, `data-priority-reason`, `data-overlay`, `data-pr-title`, `data-quick-review-summary`, `data-toast`).
- Verifies `.pr-card*`, `.pr-row*`, `.filter-chip*` class selectors are absent from `src/styles/index.css` (the spec §8 deletion line is a no-op verification — those tokens are out of scope for PR #3).

Stacks on PR #2 (`feat/streamline-02-chrome`).

## Test plan
- [x] `npm test -- --run` (vitest, full suite — ~2517+ tests green)
- [x] `npm run test:e2e -- --project=webview-mac tests/e2e/{focus,flyout,work-items,pr-list,motion}.spec.ts`
- [x] `npm run test:e2e -- --project=webview-mac tests/e2e/visual.spec.ts --grep="focus|flyout|pr-list|work-items"` (visual baselines flipping green for the four migrated surfaces)
- [ ] CI runs `webview-win` project (post-merge automatic)

## Spec coverage (PR #3 row, §8)
- [x] Unified `PRCard` with `density` prop; `PRRow` thin wrapper.
- [x] Migrate `components/pr/*`, `components/flyout/*`, `components/focus/*`, `components/work-items/*` to primitives.
- [x] QuickReview rebuilt on primitives.
- [x] `.pr-card*`, `.filter-chip*`, `.pr-row*` deletion verified (zero matches; nothing to delete).
- [x] Header section switcher / Tabs primitive — already wired in PR #2, untouched.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

gh auth switch --user KvanderBorght_gomocha
```

Expected: PR URL printed by `gh pr create`. Capture it for the user.

- [ ] **Step 11.3: Final verification**

```bash
gh auth status
# Expected: Active account: KvanderBorght_gomocha (the enterprise default)
```

Confirm the active account is back on the enterprise default. If it's still `borght-dev`, switch back manually.

---

## Self-Review (engineer's checklist after writing the plan)

- **Spec coverage:** PR #3 row §8 has five bullets — unified PRCard/PRRow ✓ (Task 1, 2, 3); migrate four component dirs to primitives ✓ (Tasks 2–6); QuickReview rebuild ✓ (Task 5); legacy CSS deletion ✓ (Task 9, verified empty); section-switcher/Tabs left alone ✓ (out of scope, called out).
- **Behavioral contracts:** `focus.spec.ts`, `flyout.spec.ts`, `motion.spec.ts`, `work-items.spec.ts`, `pr-list.spec.ts` all named in Task 7 with the data-attrs they need.
- **Visual baselines:** Task 7.2 covers the visual diff check; tolerance entries documented as the only escape hatch.
- **No placeholders:** every code block contains the actual code; no "// TODO" or "implement later".
- **Frequent commits:** every step ends in `git commit -m`; smallest commit unit is one component migration; biggest is `PullRequestCard` (warranted given its scope).
- **TDD:** tasks creating new components (Task 1 PRCard, Task 3.1 PRRow) write the failing test first, then implement, then re-run.
- **Reversibility:** every step is an Edit / Write under the worktree; nothing is destructive.

---

## Risks / known unknowns

1. **`PRCard` compact layout vs design's `PRRow` baseline.** The design canvas defines `PRCard density="compact"` as a column layout AND a separate `PRRow` as a single-line grid. The spec says "PRRow becomes a thin wrapper over `<PRCard density="compact" />` — same shape for both surfaces". I've interpreted this as: PRCard's `compact` density is the single-line grid (so the flyout's visual baseline matches). PRCard's `normal` density is the column-with-Ring layout. The design's `PRCard.compact` (column) shape has no callsite in the design, so making `compact` mean "row" is safe.
2. **`useKeyboardNav` selector.** It queries `[data-pr-card]`. The migration must keep that attribute reachable on the PR-list rows. The plan handles it by adding `data-pr-card=""` to the wrapping container in `PullRequestCard.tsx`. Verify by running the keyboard-nav e2e spec at the end of Task 2.
3. **Action button color variants outside primitive's vocabulary.** `purple` / `draft` / `success` aren't `Button` variants. The plan keeps them as `variant="ghost"` with className overrides. This may cause a visual diff against the design — accept it (documented), or push the color tokens up to a future `Button` variant in PR #4. The decision in this PR is to ship and absorb a small visual tolerance.
4. **`Input` primitive is single-line; QuickReview's textarea stays as a `<textarea>`.** Documented inline. A future textarea primitive belongs in a separate PR — not this one.
5. **`--color-filter-chip-bg/fg` tokens not deleted.** Still consumed by `components/layout/FilterBar.tsx` and `components/settings/**` (out of scope). Deletion belongs in PR #4 / PR #6 when those consumers migrate.
