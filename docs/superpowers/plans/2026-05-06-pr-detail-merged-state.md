# PR detail merged-state visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After clicking Merge or Bypass Merge in the PR detail window, the panel immediately and unmistakably shows the PR is merged — header pill, hidden merge buttons, and a dedicated "Merged ✓" celebration card — without waiting for the existing 1.5 s server refresh.

**Architecture:** Bottom-up. Add a `merged` tone to the `Pill` primitive, then add the new pill to `PRDetailPanel`'s header, then add `optimisticallyMarkMerged` to `usePrStore`, then build the `MergedCard` component, then update `OverviewTab` to gate action buttons and render the card, finally wire the optimistic update into `pr-actions` so the merge call triggers an instant store mutation that flows through `PR_REFRESHED_EVENT` to the panel.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Tailwind, Tauri 2. Tests run from `src/BorgDock.Tauri/` via `npm run test`.

**Spec:** `docs/superpowers/specs/2026-05-06-pr-detail-merged-state-design.md`

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/components/shared/primitives/Pill.tsx` | modify | Add `'merged'` to `PillTone`. |
| `src/styles/index.css` | modify | Add `.bd-pill--merged` styling block. |
| `src/components/shared/primitives/__tests__/Pill.test.tsx` | modify | Add `'merged'` to the tone-class table. |
| `src/components/pr-detail/PRDetailPanel.tsx` | modify | Header pill row: render `Merged` / `Closed` pill, suppress open-only pills when terminal. |
| `src/components/pr-detail/__tests__/PRDetailPanel.test.tsx` | modify | Cover Merged / Closed pill rendering + open-pill suppression. |
| `src/stores/pr-store.ts` | modify | Add `optimisticallyMarkMerged(owner, repo, number)` method to `PrState`. |
| `src/stores/__tests__/pr-store.test.ts` | modify | Cover the new method: moves PR to closed, dispatches event, no-op on missing. |
| `src/components/pr-detail/MergedCard.tsx` | create | New ~50 LOC component with merged + closed-not-merged variants. |
| `src/components/pr-detail/__tests__/MergedCard.test.tsx` | create | Cover both variants (timestamp, branch refs, glyph). |
| `src/components/pr-detail/OverviewTab.tsx` | modify | Gate Merge/Bypass/Mark Draft/Resolve Conflicts on `state === 'open'`; render `MergedCard` at top when terminal. |
| `src/components/pr-detail/__tests__/OverviewTab.test.tsx` | modify | Cover button hiding + MergedCard rendering when state changes. |
| `src/services/pr-actions.ts` | modify | Call `optimisticallyMarkMerged` after merge / bypass success, before `celebrateMerge`. |
| `src/services/__tests__/pr-actions.test.ts` | modify | Cover the call ordering: optimistic call before celebrate, before timer-driven refresh. |

---

## Task 1: Add `merged` tone to the `Pill` primitive

**Files:**
- Modify: `src/components/shared/primitives/Pill.tsx`
- Modify: `src/styles/index.css` (around line 2445, after `.bd-pill--ghost`)
- Modify: `src/components/shared/primitives/__tests__/Pill.test.tsx`

- [ ] **Step 1: Extend the test table**

Open `src/components/shared/primitives/__tests__/Pill.test.tsx`. Find the existing tone array (lines 13-20):

```ts
['success', 'bd-pill--success'],
['warning', 'bd-pill--warning'],
['error', 'bd-pill--error'],
['neutral', 'bd-pill--neutral'],
['draft', 'bd-pill--draft'],
['ghost', 'bd-pill--ghost'],
```

Add a row for `merged`:

```ts
['merged', 'bd-pill--merged'],
```

- [ ] **Step 2: Run the test — should fail at the type level**

Run: `cd src/BorgDock.Tauri && npm run test -- src/components/shared/primitives/__tests__/Pill.test.tsx`
Expected: TypeScript error (`'merged'` is not assignable to type `PillTone`) OR runtime test failure if the type checker is lenient.

- [ ] **Step 3: Add the tone to `PillTone`**

In `src/components/shared/primitives/Pill.tsx` line 4:

```ts
export type PillTone = 'success' | 'warning' | 'error' | 'neutral' | 'draft' | 'ghost' | 'merged';
```

- [ ] **Step 4: Add the CSS rule**

In `src/styles/index.css`, after the `.bd-pill--ghost` block (currently line 2445-2450), insert:

```css
  .bd-pill--merged {
    background: var(--color-purple-soft);
    color: var(--color-purple);
    border-color: var(--color-purple-border);
  }
```

- [ ] **Step 5: Run Pill tests — should pass**

Run: `cd src/BorgDock.Tauri && npm run test -- src/components/shared/primitives/__tests__/Pill.test.tsx`
Expected: PASS, all 7 tone rows green.

- [ ] **Step 6: Commit**

```powershell
git add src/BorgDock.Tauri/src/components/shared/primitives/Pill.tsx src/BorgDock.Tauri/src/styles/index.css src/BorgDock.Tauri/src/components/shared/primitives/__tests__/Pill.test.tsx
git commit -m "pill: add merged tone (purple)"
```

---

## Task 2: Header pill — Merged / Closed in `PRDetailPanel`

**Files:**
- Modify: `src/components/pr-detail/PRDetailPanel.tsx` (lines 243-337)
- Modify: `src/components/pr-detail/__tests__/PRDetailPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `src/components/pr-detail/__tests__/PRDetailPanel.test.tsx` (inside the existing `describe('PrDetailPanel', ...)` block, before the closing `});`):

```ts
  describe('terminal state pills', () => {
    it('renders a Merged pill when mergedAt is set', () => {
      render(<PrDetailPanel pr={makePr({ pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z' } })} />);
      const pill = screen.getByText('Merged');
      expect(pill.classList.contains('bd-pill--merged')).toBe(true);
    });

    it('renders a Closed pill when state is closed and not merged', () => {
      render(<PrDetailPanel pr={makePr({ pullRequest: { ...makePr().pullRequest, state: 'closed', closedAt: '2026-05-06T12:00:00Z' } })} />);
      const pill = screen.getByText('Closed');
      expect(pill.classList.contains('bd-pill--neutral')).toBe(true);
    });

    it('suppresses the Mergeable pill in terminal state', () => {
      render(<PrDetailPanel pr={makePr({ pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z', mergeable: true } })} />);
      expect(screen.queryByText('Mergeable')).toBeNull();
    });

    it('suppresses the passed-count pill in terminal state', () => {
      const merged = makePr({
        pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z' },
        checks: [{ id: 1, name: 'ci', status: 'completed', conclusion: 'success' }] as never,
        passedCount: 1,
      });
      render(<PrDetailPanel pr={merged} />);
      expect(screen.queryByText(/passed/i)).toBeNull();
    });

    it('shows Mergeable pill when state is open', () => {
      render(<PrDetailPanel pr={makePr()} />);
      expect(screen.getByText('Mergeable')).toBeTruthy();
    });
  });
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd src/BorgDock.Tauri && npm run test -- src/components/pr-detail/__tests__/PRDetailPanel.test.tsx`
Expected: FAIL — "Unable to find element with text: Merged" / "Closed", and "Mergeable" still appears in terminal state.

- [ ] **Step 3: Implement the pill row changes**

In `src/components/pr-detail/PRDetailPanel.tsx`, locate the existing `const p = pr.pullRequest;` block around line 243 and add a derived `isTerminal` flag right after it:

```ts
  const p = pr.pullRequest;
  const isMerged = Boolean(p.mergedAt);
  const isTerminal = isMerged || p.state === 'closed';
  const score = computeMergeScore(pr);
```

Then replace the existing pill row (lines 324-337) — currently:

```tsx
            <div className="flex flex-wrap items-center gap-2 pr-20">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                #{p.number}
              </span>
              {p.mergeable === true && <Pill tone="success">Mergeable</Pill>}
              {p.mergeable === false && <Pill tone="error">Conflicts</Pill>}
              {totalChecks > 0 && (
                <Pill tone="success">
                  {passedCount} passed
                </Pill>
              )}
              {p.isDraft && <Pill tone="draft">Draft</Pill>}
              {reviewLabel && <Pill tone="neutral">{reviewLabel}</Pill>}
            </div>
```

…with:

```tsx
            <div className="flex flex-wrap items-center gap-2 pr-20">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                #{p.number}
              </span>
              {isMerged && <Pill tone="merged">Merged</Pill>}
              {!isMerged && p.state === 'closed' && <Pill tone="neutral">Closed</Pill>}
              {!isTerminal && p.mergeable === true && <Pill tone="success">Mergeable</Pill>}
              {!isTerminal && p.mergeable === false && <Pill tone="error">Conflicts</Pill>}
              {!isTerminal && totalChecks > 0 && (
                <Pill tone="success">
                  {passedCount} passed
                </Pill>
              )}
              {p.isDraft && <Pill tone="draft">Draft</Pill>}
              {!isTerminal && reviewLabel && <Pill tone="neutral">{reviewLabel}</Pill>}
            </div>
```

- [ ] **Step 4: Run tests — should pass**

Run: `cd src/BorgDock.Tauri && npm run test -- src/components/pr-detail/__tests__/PRDetailPanel.test.tsx`
Expected: PASS, all PRDetailPanel tests including the 5 new ones green.

- [ ] **Step 5: Commit**

```powershell
git add src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx src/BorgDock.Tauri/src/components/pr-detail/__tests__/PRDetailPanel.test.tsx
git commit -m "pr-detail: render Merged/Closed pill, suppress open-only pills in terminal state"
```

---

## Task 3: `optimisticallyMarkMerged` on `usePrStore`

**Files:**
- Modify: `src/stores/pr-store.ts`
- Modify: `src/stores/__tests__/pr-store.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/__tests__/pr-store.test.ts` (inside the outer `describe('pr-store', ...)` block, at the bottom before its closing `});`):

```ts
  describe('optimisticallyMarkMerged', () => {
    beforeEach(() => {
      usePrStore.setState({
        pullRequests: [makePr({ number: 7, repoOwner: 'o', repoName: 'r' })],
        closedPullRequests: [],
      });
    });

    it('moves the matching PR from open to closed and marks it merged', () => {
      const beforeIso = new Date().toISOString();
      usePrStore.getState().optimisticallyMarkMerged('o', 'r', 7);
      const state = usePrStore.getState();

      expect(state.pullRequests.some((p) => p.pullRequest.number === 7)).toBe(false);
      expect(state.closedPullRequests[0]?.pullRequest.number).toBe(7);
      expect(state.closedPullRequests[0]?.pullRequest.state).toBe('closed');
      expect(state.closedPullRequests[0]?.pullRequest.mergedAt).toBeTruthy();
      expect(
        new Date(state.closedPullRequests[0].pullRequest.mergedAt as string).getTime(),
      ).toBeGreaterThanOrEqual(new Date(beforeIso).getTime());
    });

    it('dispatches PR_REFRESHED_EVENT with the updated PR', () => {
      const handler = vi.fn();
      document.addEventListener(PR_REFRESHED_EVENT, handler);
      try {
        usePrStore.getState().optimisticallyMarkMerged('o', 'r', 7);
        expect(handler).toHaveBeenCalledTimes(1);
        const detail = (handler.mock.calls[0][0] as CustomEvent<PrRefreshedDetail>).detail;
        expect(detail.owner).toBe('o');
        expect(detail.repo).toBe('r');
        expect(detail.number).toBe(7);
        expect(detail.pr?.pullRequest.mergedAt).toBeTruthy();
      } finally {
        document.removeEventListener(PR_REFRESHED_EVENT, handler);
      }
    });

    it('is a no-op when the PR is not in the open list', () => {
      const handler = vi.fn();
      document.addEventListener(PR_REFRESHED_EVENT, handler);
      try {
        usePrStore.getState().optimisticallyMarkMerged('o', 'r', 999);
        expect(handler).not.toHaveBeenCalled();
        expect(usePrStore.getState().closedPullRequests).toHaveLength(0);
      } finally {
        document.removeEventListener(PR_REFRESHED_EVENT, handler);
      }
    });
  });
```

Then add `vi` and the new types to the existing imports at the top of the file:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverallStatus, PullRequestWithChecks, ReviewStatus } from '@/types';
import { PR_REFRESHED_EVENT, type PrRefreshedDetail, usePrStore } from '../pr-store';
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd src/BorgDock.Tauri && npm run test -- src/stores/__tests__/pr-store.test.ts`
Expected: FAIL — `optimisticallyMarkMerged is not a function`.

- [ ] **Step 3: Add the method to `PrState`**

In `src/stores/pr-store.ts`, add the method signature to the `PrState` interface immediately after the `refreshPr` declaration (around line 101):

```ts
  refreshPr: (
    owner: string,
    repo: string,
    number: number,
  ) => Promise<PullRequestWithChecks | null>;
  /** Synchronously mark a PR as merged in the local store and dispatch
   *  PR_REFRESHED_EVENT, without round-tripping through GitHub. Used by
   *  pr-actions to give the PR detail window an instant visual update
   *  after a successful merge / bypass-merge call. The eventual server
   *  refresh (scheduled by pr-actions) reconciles the optimistic state. */
  optimisticallyMarkMerged: (owner: string, repo: string, number: number) => void;
}
```

- [ ] **Step 4: Implement the method**

In `src/stores/pr-store.ts`, add the implementation immediately after the `refreshPr: async (owner, repo, number) => { ... },` block (around line 542):

```ts
  optimisticallyMarkMerged: (owner, repo, number) => {
    const matches = (p: PullRequestWithChecks) =>
      p.pullRequest.repoOwner === owner &&
      p.pullRequest.repoName === repo &&
      p.pullRequest.number === number;

    const state = get();
    const idx = state.pullRequests.findIndex(matches);
    if (idx < 0) return;

    const current = state.pullRequests[idx];
    const merged: PullRequestWithChecks = {
      ...current,
      pullRequest: {
        ...current.pullRequest,
        state: 'closed',
        mergedAt: new Date().toISOString(),
        mergeable: undefined,
      },
    };

    const pullRequests = state.pullRequests.filter((_, i) => i !== idx);
    const closedPullRequests = [merged, ...state.closedPullRequests.filter((p) => !matches(p))];
    const newCacheKey = makeCacheKey(pullRequests, state.username, state.reviewRequestTimestamps);

    set({
      pullRequests,
      closedPullRequests,
      _cacheKey: newCacheKey,
      _cachedPriorityScores: null,
      _cachedTeamReviewLoad: null,
      _cachedCounts: null,
      _cachedFilteredPrs: null,
      _cachedGroupedByRepo: null,
      _cachedNeedsMyReview: null,
      _cachedFocusPrs: null,
      _viewCacheKey: '',
    });

    if (typeof document !== 'undefined') {
      const detail: PrRefreshedDetail = { owner, repo, number, pr: merged };
      document.dispatchEvent(new CustomEvent<PrRefreshedDetail>(PR_REFRESHED_EVENT, { detail }));
    }
  },
```

- [ ] **Step 5: Run tests — should pass**

Run: `cd src/BorgDock.Tauri && npm run test -- src/stores/__tests__/pr-store.test.ts`
Expected: PASS, all 3 new optimisticallyMarkMerged tests green plus existing tests.

- [ ] **Step 6: Commit**

```powershell
git add src/BorgDock.Tauri/src/stores/pr-store.ts src/BorgDock.Tauri/src/stores/__tests__/pr-store.test.ts
git commit -m "pr-store: add optimisticallyMarkMerged for instant post-merge UI updates"
```

---

## Task 4: New `MergedCard` component

**Files:**
- Create: `src/components/pr-detail/MergedCard.tsx`
- Create: `src/components/pr-detail/__tests__/MergedCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/pr-detail/__tests__/MergedCard.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PullRequest } from '@/types';
import { MergedCard } from '../MergedCard';

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 42,
    title: 'T',
    headRef: 'feature-x',
    baseRef: 'main',
    authorLogin: 'dev',
    authorAvatarUrl: '',
    state: 'closed',
    createdAt: '2026-05-06T10:00:00Z',
    updatedAt: '2026-05-06T12:00:00Z',
    isDraft: false,
    htmlUrl: '',
    body: '',
    repoOwner: 'o',
    repoName: 'r',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commitCount: 0,
    requestedReviewers: [],
    ...overrides,
  };
}

describe('MergedCard', () => {
  afterEach(() => cleanup());

  it('renders the merged variant with branch refs and timestamp', () => {
    const pr = makePr({
      mergedAt: new Date().toISOString(),
      headRef: 'sqlite-wal',
      baseRef: 'main',
    });
    render(<MergedCard pr={pr} />);
    expect(screen.getByText('Merged')).toBeTruthy();
    expect(screen.getByText('sqlite-wal')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText(/just now|^\d+m$|^\d+h$|^\d+d$/)).toBeTruthy();
  });

  it('renders the closed-not-merged variant', () => {
    const pr = makePr({
      mergedAt: undefined,
      closedAt: new Date().toISOString(),
      headRef: 'wip-feature',
    });
    render(<MergedCard pr={pr} />);
    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.getByText('wip-feature')).toBeTruthy();
    expect(screen.queryByText('Merged')).toBeNull();
  });

  it('uses a purple left rail for merged', () => {
    const pr = makePr({ mergedAt: new Date().toISOString() });
    const { container } = render(<MergedCard pr={pr} />);
    const card = container.querySelector('[data-merged-card]');
    expect(card?.getAttribute('data-variant')).toBe('merged');
  });

  it('uses a neutral left rail for closed', () => {
    const pr = makePr({ mergedAt: undefined, closedAt: new Date().toISOString() });
    const { container } = render(<MergedCard pr={pr} />);
    const card = container.querySelector('[data-merged-card]');
    expect(card?.getAttribute('data-variant')).toBe('closed');
  });
});
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd src/BorgDock.Tauri && npm run test -- src/components/pr-detail/__tests__/MergedCard.test.tsx`
Expected: FAIL — module `../MergedCard` not found.

- [ ] **Step 3: Implement the component**

Create `src/components/pr-detail/MergedCard.tsx`:

```tsx
import type { PullRequest } from '@/types';

interface MergedCardProps {
  pr: PullRequest;
}

function formatAge(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const CheckGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m4 10 4 4 8-8" />
  </svg>
);

const XGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 5 10 10M15 5 5 15" />
  </svg>
);

export function MergedCard({ pr }: MergedCardProps) {
  const isMerged = Boolean(pr.mergedAt);
  const variant = isMerged ? 'merged' : 'closed';
  const title = isMerged ? 'Merged' : 'Closed';
  const railColor = isMerged ? 'var(--color-purple)' : 'var(--color-text-ghost)';
  const tintColor = isMerged ? 'var(--color-purple-soft)' : 'var(--color-surface-raised)';
  const fgColor = isMerged ? 'var(--color-purple)' : 'var(--color-text-secondary)';
  const timestampIso = isMerged ? pr.mergedAt : pr.closedAt;
  const age = timestampIso ? formatAge(timestampIso) : '';
  const timestampLabel = isMerged
    ? age === 'just now' ? 'Merged just now' : `Merged ${age} ago`
    : age === 'just now' ? 'Closed just now' : `Closed ${age} ago`;

  return (
    <div
      data-merged-card
      data-variant={variant}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 8,
        background: tintColor,
        borderLeft: `3px solid ${railColor}`,
        border: `1px solid var(--color-subtle-border)`,
        borderLeftWidth: 3,
        borderLeftColor: railColor,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: railColor,
          color: 'white',
          flexShrink: 0,
        }}
      >
        {isMerged ? <CheckGlyph /> : <XGlyph />}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: fgColor, lineHeight: 1.2 }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontFamily: 'var(--font-code)' }}>{pr.headRef}</span>
          {isMerged && (
            <>
              <span aria-hidden>→</span>
              <span style={{ fontFamily: 'var(--font-code)' }}>{pr.baseRef}</span>
            </>
          )}
          <span aria-hidden style={{ color: 'var(--color-text-faint)' }}>·</span>
          <span>{timestampLabel}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `cd src/BorgDock.Tauri && npm run test -- src/components/pr-detail/__tests__/MergedCard.test.tsx`
Expected: PASS, all 4 MergedCard tests green.

- [ ] **Step 5: Commit**

```powershell
git add src/BorgDock.Tauri/src/components/pr-detail/MergedCard.tsx src/BorgDock.Tauri/src/components/pr-detail/__tests__/MergedCard.test.tsx
git commit -m "pr-detail: add MergedCard component for in-panel merge/close celebration"
```

---

## Task 5: Gate action buttons + render `MergedCard` in `OverviewTab`

**Files:**
- Modify: `src/components/pr-detail/OverviewTab.tsx` (lines 275-377)
- Modify: `src/components/pr-detail/__tests__/OverviewTab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/pr-detail/__tests__/OverviewTab.test.tsx` (inside the existing `describe('OverviewTab', ...)` block — find a logical spot near the existing button tests):

```ts
  describe('terminal state UI', () => {
    it('hides Merge / Bypass Merge / Mark Draft / Close PR when state is closed', () => {
      const merged = makePr({
        pullRequest: {
          ...makePr().pullRequest,
          state: 'closed',
          mergedAt: '2026-05-06T12:00:00Z',
        },
      });
      render(<OverviewTab pr={merged} />);
      expect(screen.queryByText('Merge')).toBeNull();
      expect(screen.queryByText('Bypass Merge')).toBeNull();
      expect(screen.queryByText('Mark Draft')).toBeNull();
      expect(screen.queryByText('Mark Ready')).toBeNull();
      expect(screen.queryByText('Close PR')).toBeNull();
    });

    it('still shows Open in Browser, Copy Branch, Checkout when closed', () => {
      const merged = makePr({
        pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z' },
      });
      render(<OverviewTab pr={merged} />);
      expect(screen.getByText('Open in Browser')).toBeTruthy();
      expect(screen.getByText('Copy Branch')).toBeTruthy();
      expect(screen.getByText('Checkout')).toBeTruthy();
    });

    it('renders MergedCard above the action row when merged', () => {
      const merged = makePr({
        pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z' },
      });
      const { container } = render(<OverviewTab pr={merged} />);
      const card = container.querySelector('[data-merged-card]');
      expect(card).toBeTruthy();
      expect(card?.getAttribute('data-variant')).toBe('merged');
    });

    it('renders MergedCard with closed variant when state is closed and not merged', () => {
      const closed = makePr({
        pullRequest: { ...makePr().pullRequest, state: 'closed', closedAt: '2026-05-06T12:00:00Z' },
      });
      const { container } = render(<OverviewTab pr={closed} />);
      const card = container.querySelector('[data-merged-card]');
      expect(card?.getAttribute('data-variant')).toBe('closed');
    });

    it('does not render MergedCard for open PRs', () => {
      const { container } = render(<OverviewTab pr={makePr()} />);
      expect(container.querySelector('[data-merged-card]')).toBeNull();
    });
  });
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd src/BorgDock.Tauri && npm run test -- src/components/pr-detail/__tests__/OverviewTab.test.tsx`
Expected: FAIL — Merge/Bypass Merge buttons still found, `[data-merged-card]` query returns null.

- [ ] **Step 3: Add the import and derived state in `OverviewTab.tsx`**

In `src/components/pr-detail/OverviewTab.tsx`, add the import near the other `./` imports (around line 23):

```ts
import { MergedCard } from './MergedCard';
```

Then locate `const p = pr.pullRequest;` (line 140) and add the derived flag right after the existing state setup (around line 144, just before `const { resolveConflicts } = useClaudeActions();`):

```ts
  const isOpen = p.state === 'open';
```

- [ ] **Step 4: Wrap action buttons in `isOpen` gate and render `MergedCard`**

Replace the action button row (lines 275-377) — the entire section starting at the comment `{/* Action buttons — primary action on the left ... */}` and ending at the `</div>` that closes that flex row.

Currently:

```tsx
  return (
    <div className="px-6 py-5 space-y-5">
      {/* Action buttons — primary action on the left, danger pair pushed right.
          Resolve Conflicts (purple-soft) and Bypass Merge (dashed danger) keep className
          overrides because Button's variant vocabulary doesn't cover those bespoke treatments. */}
      <div className="flex flex-wrap items-center gap-2">
        {isReady ? (
          <Button ... >Merge</Button>
        ) : (
          <Button ... disabled>Merge</Button>
        )}
        <Button ... >Open in Browser</Button>
        <Button ... >Copy Branch</Button>
        <Button ... >Checkout</Button>
        <Button ... >{p.isDraft ? 'Mark Ready' : 'Mark Draft'}</Button>
        {p.mergeable === false && (<Button ... >Resolve Conflicts</Button>)}
        <div className="ml-auto flex items-center gap-2">
          <Button ... >Bypass Merge</Button>
          {p.state === 'open' && (<Button ... >Close PR</Button>)}
        </div>
      </div>
```

Replace with (note: `MergedCard` rendered first when terminal, then the gated action row):

```tsx
  return (
    <div className="px-6 py-5 space-y-5">
      {!isOpen && <MergedCard pr={p} />}

      {/* Action buttons — primary action on the left, danger pair pushed right.
          Resolve Conflicts (purple-soft) and Bypass Merge (dashed danger) keep className
          overrides because Button's variant vocabulary doesn't cover those bespoke treatments. */}
      <div className="flex flex-wrap items-center gap-2">
        {isOpen && (
          isReady ? (
            <Button
              variant="primary"
              size="sm"
              leading={<MergeIcon />}
              onClick={handleMerge}
              data-overview-action="merge"
            >
              Merge
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              leading={<MergeIcon />}
              onClick={handleMerge}
              disabled
              data-overview-action="merge"
            >
              Merge
            </Button>
          )
        )}
        <Button
          variant="secondary"
          size="sm"
          leading={<ExternalIcon />}
          onClick={() => handleOpenInBrowser(p.htmlUrl)}
          data-overview-action="browser"
        >
          Open in Browser
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leading={<CopyIcon />}
          onClick={() => handleCopyBranch(p.headRef)}
          data-overview-action="copy"
        >
          Copy Branch
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leading={<BranchIcon />}
          onClick={handleCheckout}
          aria-expanded={checkoutOpen}
          data-overview-action="checkout"
          className={clsx(
            checkoutOpen &&
              'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-purple-border)]',
          )}
        >
          Checkout
        </Button>
        {isOpen && (
          <Button
            variant="ghost"
            size="sm"
            leading={<EditIcon />}
            onClick={handleToggleDraft}
            data-overview-action="draft"
          >
            {p.isDraft ? 'Mark Ready' : 'Mark Draft'}
          </Button>
        )}
        {isOpen && p.mergeable === false && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResolveConflicts}
            data-overview-action="resolve"
            className="border border-[var(--color-purple-border)] bg-[var(--color-purple-soft)] text-[var(--color-purple)]"
          >
            {'✦'} Resolve Conflicts
          </Button>
        )}
        {isOpen && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={handleBypassConfirm}
              data-overview-action="bypass"
              className="border-2 border-dashed bg-transparent"
            >
              Bypass Merge
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleCloseConfirm}
              data-overview-action="close"
              className="bg-transparent"
            >
              Close PR
            </Button>
          </div>
        )}
      </div>
```

(The rest of the component — `MergeReadinessChecklist`, AI Summary, work items, action status, checkout panel, dialogs, description — stays unchanged below this row.)

- [ ] **Step 5: Run tests — should pass**

Run: `cd src/BorgDock.Tauri && npm run test -- src/components/pr-detail/__tests__/OverviewTab.test.tsx`
Expected: PASS, including the 5 new terminal-state tests, plus existing tests (which all use `state: 'open'` — verify they're unaffected).

- [ ] **Step 6: Commit**

```powershell
git add src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx src/BorgDock.Tauri/src/components/pr-detail/__tests__/OverviewTab.test.tsx
git commit -m "pr-detail: gate merge/bypass/draft buttons on open state, render MergedCard when terminal"
```

---

## Task 6: Wire `optimisticallyMarkMerged` into `pr-actions`

**Files:**
- Modify: `src/services/pr-actions.ts` (lines 99-123)
- Modify: `src/services/__tests__/pr-actions.test.ts`

- [ ] **Step 1: Extend the test mock for `usePrStore` to expose `optimisticallyMarkMerged`**

In `src/services/__tests__/pr-actions.test.ts`, modify the existing mock (around line 49-51) to include the new method:

```ts
const mockOptimisticallyMarkMerged = vi.fn();
vi.mock('@/stores/pr-store', () => ({
  usePrStore: { getState: () => ({
    refreshPr: mockRefreshPr,
    optimisticallyMarkMerged: mockOptimisticallyMarkMerged,
  }) },
}));
```

Add `mockOptimisticallyMarkMerged` to the `beforeEach` reset block (around line 78-91):

```ts
  mockOptimisticallyMarkMerged.mockReset();
```

- [ ] **Step 2: Write failing tests for the optimistic call ordering**

In the same file, replace the existing `mergePr` test at line 98-111:

```ts
  it('merges, celebrates, and schedules a deferred refresh', async () => {
    expect(await mergePr(samplePr)).toBe(true);
    expect(mockMergePullRequest).toHaveBeenCalledWith(
      expect.anything(),
      'owner',
      'repo',
      42,
      undefined,
    );
    expect(mockCelebrate).toHaveBeenCalledWith(samplePr);
    expect(mockRefreshPr).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(mockRefreshPr).toHaveBeenCalledWith('owner', 'repo', 42);
  });
```

…with this expanded version:

```ts
  it('merges, optimistic-marks, celebrates, and schedules a deferred refresh', async () => {
    expect(await mergePr(samplePr)).toBe(true);
    expect(mockMergePullRequest).toHaveBeenCalledWith(
      expect.anything(),
      'owner',
      'repo',
      42,
      undefined,
    );
    expect(mockOptimisticallyMarkMerged).toHaveBeenCalledWith('owner', 'repo', 42);
    expect(mockCelebrate).toHaveBeenCalledWith(samplePr);

    // Ordering: optimistic call happens before celebrate
    const optimisticOrder = mockOptimisticallyMarkMerged.mock.invocationCallOrder[0];
    const celebrateOrder = mockCelebrate.mock.invocationCallOrder[0];
    expect(optimisticOrder).toBeLessThan(celebrateOrder);

    expect(mockRefreshPr).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(mockRefreshPr).toHaveBeenCalledWith('owner', 'repo', 42);
  });

  it('does NOT call optimisticallyMarkMerged when the merge call fails', async () => {
    mockMergePullRequest.mockRejectedValueOnce(new Error('405'));
    expect(await mergePr(samplePr)).toBe(false);
    expect(mockOptimisticallyMarkMerged).not.toHaveBeenCalled();
  });
```

Also extend the existing `bypassMergePr` test at line 142-150:

```ts
describe('bypassMergePr', () => {
  it('optimistic-marks, celebrates, and schedules a refresh on success', async () => {
    expect(await bypassMergePr(samplePr)).toBe(true);
    expect(mockBypassMergePullRequest).toHaveBeenCalledWith('owner', 'repo', 42);
    expect(mockOptimisticallyMarkMerged).toHaveBeenCalledWith('owner', 'repo', 42);
    expect(mockCelebrate).toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(mockRefreshPr).toHaveBeenCalled();
  });

  it('does NOT call optimisticallyMarkMerged when bypass fails', async () => {
    mockBypassMergePullRequest.mockRejectedValueOnce(new Error('forbidden'));
    expect(await bypassMergePr(samplePr)).toBe(false);
    expect(mockOptimisticallyMarkMerged).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests — should fail**

Run: `cd src/BorgDock.Tauri && npm run test -- src/services/__tests__/pr-actions.test.ts`
Expected: FAIL — `mockOptimisticallyMarkMerged` not called.

- [ ] **Step 4: Wire the optimistic call into `mergePr`**

In `src/services/pr-actions.ts`, modify `mergePr` (lines 99-111). Currently:

```ts
export async function mergePr(pr: PrRef, opts?: MergePrOpts): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await mergePullRequest(client, pr.repoOwner, pr.repoName, pr.number, opts?.method);
    celebrateMerge(pr);
    scheduleTerminalRefresh(pr.repoOwner, pr.repoName, pr.number);
    return true;
  } catch (err) {
    reportError('Merge failed', err, opts);
    return false;
  }
}
```

Replace with:

```ts
export async function mergePr(pr: PrRef, opts?: MergePrOpts): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await mergePullRequest(client, pr.repoOwner, pr.repoName, pr.number, opts?.method);
    usePrStore.getState().optimisticallyMarkMerged(pr.repoOwner, pr.repoName, pr.number);
    celebrateMerge(pr);
    scheduleTerminalRefresh(pr.repoOwner, pr.repoName, pr.number);
    return true;
  } catch (err) {
    reportError('Merge failed', err, opts);
    return false;
  }
}
```

- [ ] **Step 5: Wire the optimistic call into `bypassMergePr`**

In the same file, modify `bypassMergePr` (lines 113-123):

```ts
export async function bypassMergePr(pr: PrRef, opts?: ActionOpts): Promise<boolean> {
  try {
    await bypassMergePullRequest(pr.repoOwner, pr.repoName, pr.number);
    usePrStore.getState().optimisticallyMarkMerged(pr.repoOwner, pr.repoName, pr.number);
    celebrateMerge(pr);
    scheduleTerminalRefresh(pr.repoOwner, pr.repoName, pr.number);
    return true;
  } catch (err) {
    reportError('Bypass merge failed', err, opts);
    return false;
  }
}
```

- [ ] **Step 6: Run tests — should pass**

Run: `cd src/BorgDock.Tauri && npm run test -- src/services/__tests__/pr-actions.test.ts`
Expected: PASS, all merge / bypass-merge tests including the new ordering and failure-path assertions.

- [ ] **Step 7: Commit**

```powershell
git add src/BorgDock.Tauri/src/services/pr-actions.ts src/BorgDock.Tauri/src/services/__tests__/pr-actions.test.ts
git commit -m "pr-actions: optimistic store update before celebration, for instant post-merge UI"
```

---

## Task 7: Full test suite + build sanity check

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full Vitest suite**

Run: `cd src/BorgDock.Tauri && npm run test`
Expected: PASS, no regressions from Tasks 1-6.

If any pre-existing test fails, inspect — terminal-state pill suppression in PRDetailPanel could affect other tests that check for the `Mergeable`, `<n> passed`, or `<reviewLabel>` pills. None should, given the existing tests build PRs with `state: 'open'` by default — but verify.

- [ ] **Step 2: Run lint + typecheck**

Run: `cd src/BorgDock.Tauri && npm run lint && npm run build`
Expected: PASS. The `build` runs `tsc -b && vite build` so it catches type errors across the project.

If `tsc` complains about `MergedCard.tsx` styles object types, it's likely the `borderLeft` + `border` combination — fix by using `borderTop`/`borderRight`/`borderBottom` explicitly or by extracting the styles to a single object literal with no shorthand collisions.

- [ ] **Step 3: Manual smoke test in dev**

Run: `cd src/BorgDock.Tauri && npm run tauri dev`

In the Tauri window:
1. Open a PR detail window for any open PR (sidebar → click a PR → Pop out, or click the pop-out icon).
2. If you have a real mergeable PR, click **Merge**. If not, click **Bypass Merge** and confirm.
3. Verify:
   - The header pill row immediately switches: `Mergeable` / `<n> passed` / `<review>` pills disappear, **`Merged`** pill appears (purple).
   - The **Merged ✓** card appears at the top of the Overview tab body, showing `<headRef> → main · Merged just now`.
   - The Merge / Bypass Merge / Mark Draft / Close PR / Resolve Conflicts buttons disappear.
   - Open in Browser, Copy Branch, Checkout remain.
   - All of (a)-(c) happen on the same frame as the click — no perceptible delay.
   - ~1.5 s later the panel does not flicker (the deferred refresh writes the same state).

If you don't have a safe PR to merge against, smoke-test the Closed variant by manually calling `optimisticallyMarkMerged` on a no-longer-existing PR, OR by running through the Storybook story for `OverviewTab` if one exists, OR by writing a one-off devtools snippet that calls `usePrStore.getState().optimisticallyMarkMerged(...)`.

- [ ] **Step 4: Verify the closed-not-merged case doesn't regress**

If you have a PR you can safely close (without merging), open its detail window, click **Close PR**, confirm. Verify:
   - Header `Closed` pill appears (neutral).
   - `MergedCard` shows the closed variant (`✕` glyph, "Closed").
   - Merge / Bypass Merge buttons are gone.

(This path uses the existing `closePr` flow + 1.5 s refresh — there's no optimistic update for it, so it'll feel ~1.5 s slower than the merge path. That's intended, per the spec's out-of-scope note.)

- [ ] **Step 5: Final commit (only if you fixed anything in steps 1-4)**

If everything passed cleanly, no commit needed. If you fixed something during smoke testing:

```powershell
git add <files>
git commit -m "pr-detail: smoke-test fixes for merged-state visibility"
```

---

## Done

After all 7 tasks complete:
- The PR detail window shows merged state visibly and instantly after Merge or Bypass Merge.
- The action button row collapses to non-destructive options (Open in Browser, Copy Branch, Checkout).
- A `MergedCard` celebrates the merge in-panel (in addition to the existing OS toast from `celebrateMerge`).
- The 1.5 s deferred refresh still runs as server-truth confirmation; the user just doesn't notice it.
- Sidebar `PrCard` and focus-mode `MergeToast` get the same store update for free (they read from `usePrStore`).
