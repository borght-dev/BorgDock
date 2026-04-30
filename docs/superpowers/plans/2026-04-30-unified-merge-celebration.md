# Unified Merge Celebration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify merge feedback so every successful merge — from sidebar context menu, flyout, PR detail panel, focus-mode undo flow, OR an external GitHub merge detected via polling — fires the same rich `severity: 'merged'` toast with a "Ta-daaaa" sound.

**Architecture:** A single `celebrateMerge(pr)` helper in `src/services/merge-celebration.ts` is the only call site for the merged toast. Every local merge handler awaits the mutation and calls the helper on success. A new `useExternalMergeCelebration` hook subscribes to `usePrStore` and fires the helper for PRs that transition open → closed-with-`mergedAt`-set between polls, gated by `notifications.onlyMyPRs`. A short-lived in-memory dedup map prevents the next poll from re-celebrating a PR you just merged locally.

**Tech Stack:** React 18, Zustand, vitest + @testing-library/react, Tauri 2, Biome lint, HTMLAudioElement for the sound.

**Spec:** [`docs/superpowers/specs/2026-04-30-unified-merge-celebration-design.md`](../specs/2026-04-30-unified-merge-celebration-design.md)

---

## File Structure

| File | Purpose |
|---|---|
| Create: `src/BorgDock.Tauri/src/services/merge-celebration.ts` | Single helper `celebrateMerge` + `playTada` + dedup map |
| Create: `src/BorgDock.Tauri/src/services/__tests__/merge-celebration.test.ts` | Helper unit tests |
| Create: `src/BorgDock.Tauri/src/hooks/useExternalMergeCelebration.ts` | Polling-driven detector |
| Create: `src/BorgDock.Tauri/src/hooks/__tests__/useExternalMergeCelebration.test.ts` | Detector tests |
| Modify: `src/BorgDock.Tauri/src/types/settings.ts` | Add `playMergeSound: boolean` to `NotificationSettings` |
| Modify: `src/BorgDock.Tauri/src/stores/settings-store.ts` | Default `playMergeSound: true` |
| Modify: `src/BorgDock.Tauri/src/components/settings/NotificationSection.tsx` | New "Play sound on merge" `<ToggleRow>` |
| Modify: `src/BorgDock.Tauri/src/hooks/usePrCardActions.ts` | Await mutations, call `celebrateMerge` on success |
| Modify: `src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx` | Replace `mergeSuccess` state + inline `MergeCelebration` with `celebrateMerge` call |
| Modify: `src/BorgDock.Tauri/src/components/focus/MergeToast.tsx` | Replace `severity: 'success'` notification with `celebrateMerge` call |
| Modify: `src/BorgDock.Tauri/src/App.tsx` | Mount `useExternalMergeCelebration()` |
| Modify: `src/BorgDock.Tauri/src/styles/index.css` | Remove unused `merge-*` keyframes |
| Modify: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/OverviewTab.test.tsx` | Replace inline-card assertion with notification-spy assertion |
| Modify: `src/BorgDock.Tauri/src/components/focus/__tests__/MergeToast.test.tsx` | Assert `severity: 'merged'` instead of `'success'` |
| Already present: `src/BorgDock.Tauri/public/sounds/tada.mp3` | Bundled sound file (no creation needed) |

---

## Conventions

- Run all commands from `src/BorgDock.Tauri/`. Working directory: `E:\PRDock\src\BorgDock.Tauri`.
- Tests: `npm run test -- <path>` for a single file, `npm run test` for full suite.
- Lint: `npm run lint`.
- Commit style: conventional commits with scope, e.g. `feat(merge-celebration): add helper`.
- Branch: implement on the current branch (`master`) since it's a feature additive change. Do NOT create a new branch unless the user requests one.

---

## Task 1: Add `playMergeSound` setting

**Files:**
- Modify: `src/BorgDock.Tauri/src/types/settings.ts`
- Modify: `src/BorgDock.Tauri/src/stores/settings-store.ts`
- Modify: `src/BorgDock.Tauri/src/components/settings/NotificationSection.tsx`
- Test: `src/BorgDock.Tauri/src/components/settings/__tests__/NotificationSection.test.tsx` (existing)

This task is just additive plumbing for the new setting. We do it first so the helper in Task 2 can read it from the store without further surgery.

- [ ] **Step 1: Add the field to `NotificationSettings`**

In `src/BorgDock.Tauri/src/types/settings.ts`, find the `NotificationSettings` interface (around line 52) and add `playMergeSound: boolean;` between `onlyMyPRs` and `reviewNudgeEnabled`:

```ts
export interface NotificationSettings {
  toastOnCheckStatusChange: boolean;
  toastOnNewPR: boolean;
  toastOnReviewUpdate: boolean;
  toastOnMergeable: boolean;
  onlyMyPRs: boolean;
  playMergeSound: boolean;
  reviewNudgeEnabled: boolean;
  reviewNudgeIntervalMinutes: number;
  reviewNudgeEscalation: boolean;
  deduplicationWindowSeconds: number;
}
```

- [ ] **Step 2: Default it to `true` in the settings store**

In `src/BorgDock.Tauri/src/stores/settings-store.ts`, find the `defaultSettings.notifications` block (around line 34) and add `playMergeSound: true,` between `onlyMyPRs` and `reviewNudgeEnabled`:

```ts
  notifications: {
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    onlyMyPRs: false,
    playMergeSound: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
  },
```

- [ ] **Step 3: Run typecheck to confirm nothing else breaks**

```
npm run lint
```

Expected: clean (no missing-property errors). If anything fails on `playMergeSound` missing, fix the offending fixture by adding `playMergeSound: true` (or `false` where the test wants it off).

- [ ] **Step 4: Add the toggle row to NotificationSection**

In `src/BorgDock.Tauri/src/components/settings/NotificationSection.tsx`, find the existing `ToggleRow` for `toastOnMergeable` (around line 101) and add a new `ToggleRow` immediately after it, BEFORE the `<div className="my-2 h-px bg-[var(--color-separator)]" />` divider that precedes "Only notify for my PRs":

```tsx
      <ToggleRow
        label="PR becomes mergeable"
        notificationType="toastOnMergeable"
        checked={notifications.toastOnMergeable}
        onChange={(v) => update({ toastOnMergeable: v })}
      />
      <ToggleRow
        label="Play sound on merge"
        notificationType="playMergeSound"
        checked={notifications.playMergeSound}
        onChange={(v) => update({ playMergeSound: v })}
      />

      <div className="my-2 h-px bg-[var(--color-separator)]" />
```

- [ ] **Step 5: Run the full test suite to surface fixture gaps**

```
npm run test
```

Expected: any test that constructs a `NotificationSettings` literal will fail with "Property 'playMergeSound' is missing." Fix each one by adding `playMergeSound: true` to the fixture. Common locations:
- `src/hooks/__tests__/useStateTransitions.test.ts` — `makeSettings` at line ~85
- `src/hooks/__tests__/useReviewNudges.test.ts` — similar `makeSettings`
- `src/components/settings/__tests__/NotificationSection.test.tsx`
- Any `__tests__` files Grep finds with `notifications:`

Search for fixtures: `grep -rln "toastOnMergeable" src/**/__tests__/` and add `playMergeSound: true` next to `toastOnMergeable` in each.

- [ ] **Step 6: Re-run tests to confirm green**

```
npm run test
```

Expected: PASS for all suites.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/types/settings.ts src/BorgDock.Tauri/src/stores/settings-store.ts src/BorgDock.Tauri/src/components/settings/NotificationSection.tsx src/BorgDock.Tauri/src/hooks/__tests__ src/BorgDock.Tauri/src/components/settings/__tests__
git commit -m "feat(settings): add playMergeSound notification toggle"
```

---

## Task 2: Build the `celebrateMerge` helper

**Files:**
- Create: `src/BorgDock.Tauri/src/services/merge-celebration.ts`
- Create: `src/BorgDock.Tauri/src/services/__tests__/merge-celebration.test.ts`

This is the single source of truth. Built test-first — no UI integration yet.

- [ ] **Step 1: Write the failing test file**

Create `src/BorgDock.Tauri/src/services/__tests__/merge-celebration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockShow = vi.fn();
const mockSettings = {
  notifications: {
    playMergeSound: true,
    onlyMyPRs: false,
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
  },
};

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: { getState: () => ({ show: mockShow }) },
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: { getState: () => ({ settings: mockSettings }) },
}));

const mockPlay = vi.fn().mockResolvedValue(undefined);
class MockAudio {
  src: string;
  volume = 1;
  currentTime = 0;
  constructor(src: string) {
    this.src = src;
  }
  play() {
    return mockPlay();
  }
}
beforeEach(() => {
  mockShow.mockClear();
  mockPlay.mockClear();
  mockSettings.notifications.playMergeSound = true;
  vi.stubGlobal('Audio', MockAudio);
  // Reset the module-level dedup state and audio cache between tests
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const samplePr = {
  number: 42,
  title: 'Add feature X',
  repoOwner: 'owner',
  repoName: 'repo',
  htmlUrl: 'https://github.com/owner/repo/pull/42',
};

describe('celebrateMerge', () => {
  it('fires a merged-severity notification with the correct shape', async () => {
    const { celebrateMerge } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '🎉 PR #42 merged!',
        message: 'Add feature X — owner/repo',
        severity: 'merged',
        launchUrl: 'https://github.com/owner/repo/pull/42',
        prNumber: 42,
        repoFullName: 'owner/repo',
        actions: [{ label: 'View on GitHub', url: 'https://github.com/owner/repo/pull/42' }],
      }),
    );
  });

  it('plays the tada sound when playMergeSound is true', async () => {
    const { celebrateMerge } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('does not play sound when playMergeSound is false', async () => {
    mockSettings.notifications.playMergeSound = false;
    const { celebrateMerge } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('swallows audio errors so a sound failure does not block the toast', async () => {
    mockPlay.mockRejectedValueOnce(new Error('autoplay blocked'));
    const { celebrateMerge } = await import('../merge-celebration');
    expect(() => celebrateMerge(samplePr)).not.toThrow();
    expect(mockShow).toHaveBeenCalledTimes(1);
  });
});

describe('wasRecentlyCelebrated dedup', () => {
  it('returns true within the dedup window after celebrating', async () => {
    const { celebrateMerge, wasRecentlyCelebrated } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(
      wasRecentlyCelebrated({ repoOwner: 'owner', repoName: 'repo', number: 42 }),
    ).toBe(true);
  });

  it('returns false for a different PR', async () => {
    const { celebrateMerge, wasRecentlyCelebrated } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    expect(
      wasRecentlyCelebrated({ repoOwner: 'owner', repoName: 'repo', number: 99 }),
    ).toBe(false);
  });

  it('expires after the dedup window', async () => {
    vi.useFakeTimers();
    const { celebrateMerge, wasRecentlyCelebrated } = await import('../merge-celebration');
    celebrateMerge(samplePr);
    vi.advanceTimersByTime(31_000);
    expect(
      wasRecentlyCelebrated({ repoOwner: 'owner', repoName: 'repo', number: 42 }),
    ).toBe(false);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```
npm run test -- src/services/__tests__/merge-celebration.test.ts
```

Expected: FAIL with "Cannot find module '../merge-celebration'."

- [ ] **Step 3: Implement the helper**

Create `src/BorgDock.Tauri/src/services/merge-celebration.ts`:

```ts
import { useNotificationStore } from '@/stores/notification-store';
import { useSettingsStore } from '@/stores/settings-store';

export interface CelebratablePr {
  number: number;
  title: string;
  repoOwner: string;
  repoName: string;
  htmlUrl: string;
}

const DEDUP_WINDOW_MS = 30_000;

// Map: "owner/repo#number" -> expiry epoch ms.
// Lazy-evicts on read; no setTimeout-driven cleanup needed.
const recentlyCelebrated = new Map<string, number>();

function key(pr: { repoOwner: string; repoName: string; number: number }): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
}

export function wasRecentlyCelebrated(pr: {
  repoOwner: string;
  repoName: string;
  number: number;
}): boolean {
  const k = key(pr);
  const expiry = recentlyCelebrated.get(k);
  if (expiry === undefined) return false;
  if (Date.now() >= expiry) {
    recentlyCelebrated.delete(k);
    return false;
  }
  return true;
}

export function markCelebrated(pr: {
  repoOwner: string;
  repoName: string;
  number: number;
}): void {
  recentlyCelebrated.set(key(pr), Date.now() + DEDUP_WINDOW_MS);
}

let audioEl: HTMLAudioElement | null = null;

function playTada(): void {
  try {
    if (!audioEl) {
      audioEl = new Audio('/sounds/tada.mp3');
      audioEl.volume = 0.6;
    }
    audioEl.currentTime = 0;
    void audioEl.play().catch(() => {
      // Autoplay rejected or audio decode failed — ignore.
    });
  } catch {
    // Audio constructor unavailable / blocked — ignore.
  }
}

export function celebrateMerge(pr: CelebratablePr): void {
  markCelebrated(pr);

  useNotificationStore.getState().show({
    title: `🎉 PR #${pr.number} merged!`,
    message: `${pr.title} — ${pr.repoOwner}/${pr.repoName}`,
    severity: 'merged',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [{ label: 'View on GitHub', url: pr.htmlUrl }],
  });

  if (useSettingsStore.getState().settings.notifications.playMergeSound) {
    playTada();
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npm run test -- src/services/__tests__/merge-celebration.test.ts
```

Expected: PASS for all cases in the file. If "expires after the dedup window" fails because `vi.useFakeTimers()` doesn't advance `Date.now()` by default, configure it with `vi.useFakeTimers({ now: Date.now() })` and use `vi.setSystemTime(Date.now() + 31_000)` instead of `advanceTimersByTime`. Update the test if needed.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/services/merge-celebration.ts src/BorgDock.Tauri/src/services/__tests__/merge-celebration.test.ts
git commit -m "feat(merge-celebration): add unified celebrateMerge helper with dedup and sound"
```

---

## Task 3: Wire `usePrCardActions` (sidebar / flyout context menu)

**Files:**
- Modify: `src/BorgDock.Tauri/src/hooks/usePrCardActions.ts`
- Test: `src/BorgDock.Tauri/src/components/pr/__tests__/PrCardContainer.test.tsx` (existing, covers the hook indirectly)

The current handlers chain `.catch()` only — convert them to await so we can fire `celebrateMerge` on success.

- [ ] **Step 1: Read the current `handleMerge` and `executeBypassMerge`**

```
src/BorgDock.Tauri/src/hooks/usePrCardActions.ts:147-169
```

Confirm the structure matches what's in the spec. Both functions currently fire-and-forget and only handle errors.

- [ ] **Step 2: Add the import at the top of the file**

In `src/BorgDock.Tauri/src/hooks/usePrCardActions.ts`, add to the imports near the top:

```ts
import { celebrateMerge } from '@/services/merge-celebration';
```

- [ ] **Step 3: Convert `handleMerge` to await + celebrate**

Replace lines 147-157 (the `handleMerge` callback):

```ts
  const handleMerge = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const client = getClient();
      if (!client) return;
      mergePullRequest(client, pr.repoOwner, pr.repoName, pr.number)
        .then(() => {
          celebrateMerge({
            number: pr.number,
            title: pr.title,
            repoOwner: pr.repoOwner,
            repoName: pr.repoName,
            htmlUrl: pr.htmlUrl,
          });
        })
        .catch((err) => showError('Merge failed', err));
    },
    [pr.repoOwner, pr.repoName, pr.number, pr.title, pr.htmlUrl, showError],
  );
```

- [ ] **Step 4: Convert `executeBypassMerge` to await + celebrate**

Replace lines 164-169:

```ts
  const executeBypassMerge = useCallback(() => {
    bypassMergePullRequest(pr.repoOwner, pr.repoName, pr.number)
      .then(() => {
        celebrateMerge({
          number: pr.number,
          title: pr.title,
          repoOwner: pr.repoOwner,
          repoName: pr.repoName,
          htmlUrl: pr.htmlUrl,
        });
      })
      .catch((err) => showError('Bypass merge failed', err));
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number, pr.title, pr.htmlUrl, showError]);
```

- [ ] **Step 5: Add a test for handleMerge celebration**

Open `src/BorgDock.Tauri/src/components/pr/__tests__/PrCardContainer.test.tsx`. Find an existing test that exercises `handleMerge` (search for `handleMerge` or `mergePullRequest` in the file). If none exists, add a new test. Mock `@/services/merge-celebration` at the top of the file:

```ts
const mockCelebrate = vi.fn();
vi.mock('@/services/merge-celebration', () => ({
  celebrateMerge: (...args: unknown[]) => mockCelebrate(...args),
}));
```

Then add tests after the existing describe block:

```ts
describe('merge celebration wiring', () => {
  beforeEach(() => {
    mockCelebrate.mockClear();
  });

  it('fires celebrateMerge after handleMerge resolves', async () => {
    // Arrange a ready PR, render the container, click the merge action.
    // Use the same setup as existing tests in this file — mirror their fixture.
    // After firing the merge, await a microtask flush, then assert:
    await Promise.resolve(); // let the .then() chain run
    expect(mockCelebrate).toHaveBeenCalledWith(
      expect.objectContaining({ number: expect.any(Number), repoOwner: expect.any(String) }),
    );
  });

  it('does not fire celebrateMerge when merge rejects', async () => {
    const { mergePullRequest } = await import('@/services/github/mutations');
    vi.mocked(mergePullRequest).mockRejectedValueOnce(new Error('boom'));
    // Re-render with the rejecting mock, click merge, await microtasks.
    await Promise.resolve();
    expect(mockCelebrate).not.toHaveBeenCalled();
  });
});
```

NOTE: The exact arrange/act lines depend on the existing test setup in `PrCardContainer.test.tsx`. Read the file first; copy the closest existing pattern (likely uses `render(<PrCardContainer pr={...} />)` and clicks via `fireEvent` or context menu). If the existing tests don't fire merge actions at all, add a new direct test on `usePrCardActions` instead via `renderHook`:

```ts
import { renderHook, act } from '@testing-library/react';
import { usePrCardActions } from '@/hooks/usePrCardActions';
// ...mocks as in MergeToast.test.tsx...

it('fires celebrateMerge after handleMerge resolves', async () => {
  const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
  await act(async () => {
    result.current.handleMerge({ stopPropagation: () => {} } as React.MouseEvent);
    await Promise.resolve();
  });
  expect(mockCelebrate).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 6: Run the test**

```
npm run test -- src/components/pr/__tests__/PrCardContainer.test.tsx
```

Or if you used `renderHook` in a new file: `npm run test -- src/hooks/__tests__/usePrCardActions.test.ts`.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/hooks/usePrCardActions.ts src/BorgDock.Tauri/src/components/pr/__tests__/PrCardContainer.test.tsx
git commit -m "feat(pr-card): celebrate merges from sidebar/flyout context menu"
```

---

## Task 4: Wire `OverviewTab` (PR detail panel)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx`
- Modify: `src/BorgDock.Tauri/src/components/pr-detail/__tests__/OverviewTab.test.tsx`

Replace the inline `MergeCelebration` card with a call to the shared helper.

- [ ] **Step 1: Update the failing test first**

In `src/BorgDock.Tauri/src/components/pr-detail/__tests__/OverviewTab.test.tsx`, find the test at line 305 ("renders merge celebration after successful merge"). Add a celebration mock at the top of the file (with the other `vi.mock` calls):

```ts
const mockCelebrate = vi.fn();
vi.mock('@/services/merge-celebration', () => ({
  celebrateMerge: (...args: unknown[]) => mockCelebrate(...args),
}));
```

In the test's `beforeEach`, clear the mock:

```ts
  beforeEach(() => {
    vi.clearAllMocks();
    mockCelebrate.mockClear();
    // ...rest of existing beforeEach...
  });
```

Then replace the existing test body (line 305-324) with:

```ts
  it('calls celebrateMerge after successful merge', async () => {
    const { mergePullRequest } = await import('@/services/github/mutations');
    vi.mocked(mergePullRequest).mockResolvedValue(undefined);

    const pr = makePr({
      overallStatus: 'green',
      pullRequest: {
        ...makePr().pullRequest,
        isDraft: false,
        mergeable: true,
        reviewStatus: 'approved',
      },
    });
    render(<OverviewTab pr={pr} />);
    fireEvent.click(screen.getByText('Merge'));

    await vi.waitFor(() => {
      expect(mockCelebrate).toHaveBeenCalledWith(
        expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo' }),
      );
    });
  });

  it('does not render the inline MergeCelebration card', async () => {
    const { mergePullRequest } = await import('@/services/github/mutations');
    vi.mocked(mergePullRequest).mockResolvedValue(undefined);

    const pr = makePr({
      overallStatus: 'green',
      pullRequest: {
        ...makePr().pullRequest,
        isDraft: false,
        mergeable: true,
        reviewStatus: 'approved',
      },
    });
    const { container } = render(<OverviewTab pr={pr} />);
    fireEvent.click(screen.getByText('Merge'));

    await vi.waitFor(() => {
      expect(mockCelebrate).toHaveBeenCalled();
    });
    expect(container.querySelector('[data-merge-celebration]')).toBeNull();
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```
npm run test -- src/components/pr-detail/__tests__/OverviewTab.test.tsx
```

Expected: the new "does not render the inline MergeCelebration card" test passes vacuously OR fails because the card IS still rendered. The "calls celebrateMerge" test fails because `celebrateMerge` is never called by the component yet.

- [ ] **Step 3: Update `OverviewTab.tsx` imports**

Add to the imports (near the top of `src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx`):

```ts
import { celebrateMerge } from '@/services/merge-celebration';
```

- [ ] **Step 4: Remove `mergeSuccess` state**

Delete line 180:

```ts
  const [mergeSuccess, setMergeSuccess] = useState(false);
```

- [ ] **Step 5: Replace `setMergeSuccess(true)` with `celebrateMerge(...)` in `handleMerge`**

Find `handleMerge` (around line 251). Replace:

```ts
      await mergePullRequest(client, p.repoOwner, p.repoName, p.number, 'squash');
      setActionStatus('');
      setMergeSuccess(true);
      scheduleTerminalRefresh();
```

with:

```ts
      await mergePullRequest(client, p.repoOwner, p.repoName, p.number, 'squash');
      setActionStatus('');
      celebrateMerge({
        number: p.number,
        title: p.title,
        repoOwner: p.repoOwner,
        repoName: p.repoName,
        htmlUrl: p.htmlUrl,
      });
      scheduleTerminalRefresh();
```

- [ ] **Step 6: Same change in `handleBypassExecute`**

Find `handleBypassExecute` (around line 268). Replace:

```ts
      await bypassMergePullRequest(p.repoOwner, p.repoName, p.number);
      setActionStatus('');
      setMergeSuccess(true);
      scheduleTerminalRefresh();
```

with:

```ts
      await bypassMergePullRequest(p.repoOwner, p.repoName, p.number);
      setActionStatus('');
      celebrateMerge({
        number: p.number,
        title: p.title,
        repoOwner: p.repoOwner,
        repoName: p.repoName,
        htmlUrl: p.htmlUrl,
      });
      scheduleTerminalRefresh();
```

- [ ] **Step 7: Simplify the `actionStatus` guard**

Find line 541 (`{actionStatus && !mergeSuccess && (`). Change to:

```tsx
      {actionStatus && (
```

- [ ] **Step 8: Delete the inline celebration render**

Find line 563-564:

```tsx
      {/* Merge celebration */}
      {mergeSuccess && <MergeCelebration prNumber={p.number} title={p.title} />}
```

Delete both lines (the comment and the conditional render).

- [ ] **Step 9: Delete the `MergeCelebration` component**

Find lines 601-632 (the entire `function MergeCelebration({ prNumber, title }: ...) { ... }` block). Delete the whole function.

- [ ] **Step 10: Run lint to surface unused imports**

```
npm run lint
```

Expected: clean. If `Card` is now unused (it was used by `MergeCelebration`), check whether other code in `OverviewTab.tsx` still imports it. Remove `Card` from `import { Button, Card } from '@/components/shared/primitives';` if so — Grep `Card` in the file to confirm.

- [ ] **Step 11: Run the OverviewTab tests**

```
npm run test -- src/components/pr-detail/__tests__/OverviewTab.test.tsx
```

Expected: PASS. Both new tests should be green.

- [ ] **Step 12: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx src/BorgDock.Tauri/src/components/pr-detail/__tests__/OverviewTab.test.tsx
git commit -m "refactor(pr-detail): use celebrateMerge helper, remove inline MergeCelebration"
```

---

## Task 5: Wire `MergeToast` (focus-mode undo flow)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/focus/MergeToast.tsx`
- Modify: `src/BorgDock.Tauri/src/components/focus/__tests__/MergeToast.test.tsx`

The deferred-merge "undo" path currently fires a generic success toast. Promote it to the merged celebration.

- [ ] **Step 1: Update the failing test first**

In `src/BorgDock.Tauri/src/components/focus/__tests__/MergeToast.test.tsx`, add a celebration mock alongside the existing mocks:

```ts
const mockCelebrate = vi.fn();
vi.mock('@/services/merge-celebration', () => ({
  celebrateMerge: (...args: unknown[]) => mockCelebrate(...args),
}));
```

In `beforeEach`, clear it:

```ts
    mockCelebrate.mockClear();
```

Replace the existing "shows success notification after merge" test (line 136-150) with:

```ts
  it('celebrates after successful merge', async () => {
    render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 42);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockCelebrate).toHaveBeenCalledWith(
      expect.objectContaining({
        number: 42,
        repoOwner: 'owner',
        repoName: 'repo',
      }),
    );
    // The legacy success-severity toast is no longer fired.
    expect(mockNotificationShow).not.toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
  });
```

The "shows error notification when merge fails" test stays unchanged — error path still uses the notification store.

- [ ] **Step 2: Run the test to confirm failure**

```
npm run test -- src/components/focus/__tests__/MergeToast.test.tsx
```

Expected: FAIL — `mockCelebrate` not called yet.

- [ ] **Step 3: Update `MergeToast.tsx` imports**

In `src/BorgDock.Tauri/src/components/focus/MergeToast.tsx`, add:

```ts
import { celebrateMerge } from '@/services/merge-celebration';
```

- [ ] **Step 4: Replace the success-toast block**

Find `executeMerge` (line 22-45). Replace the success branch:

```ts
    try {
      await mergePullRequest(client, req.owner, req.repo, req.prNumber, 'squash');
      useNotificationStore.getState().show({
        title: `PR #${req.prNumber} merged!`,
        message: `${req.owner}/${req.repo}`,
        severity: 'success',
        actions: [],
      });
    } catch (err) {
```

with:

```ts
    try {
      await mergePullRequest(client, req.owner, req.repo, req.prNumber, 'squash');
      celebrateMerge({
        number: req.prNumber,
        title: `PR #${req.prNumber}`,
        repoOwner: req.owner,
        repoName: req.repo,
        htmlUrl: `https://github.com/${req.owner}/${req.repo}/pull/${req.prNumber}`,
      });
    } catch (err) {
```

NOTE: `MergeRequest` only carries owner/repo/number — no `title` or `htmlUrl`. We synthesize the URL from the well-known GitHub URL pattern and use `PR #N` as the title. The next poll will replace this view-only PR with the real one in the closed list.

- [ ] **Step 5: Run the test**

```
npm run test -- src/components/focus/__tests__/MergeToast.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/focus/MergeToast.tsx src/BorgDock.Tauri/src/components/focus/__tests__/MergeToast.test.tsx
git commit -m "refactor(merge-toast): use celebrateMerge for focus-mode undo flow"
```

---

## Task 6: Detect external merges via polling

**Files:**
- Create: `src/BorgDock.Tauri/src/hooks/useExternalMergeCelebration.ts`
- Create: `src/BorgDock.Tauri/src/hooks/__tests__/useExternalMergeCelebration.test.ts`
- Modify: `src/BorgDock.Tauri/src/App.tsx`

This is the heaviest task. Built test-first.

- [ ] **Step 1: Write the failing test file**

Create `src/BorgDock.Tauri/src/hooks/__tests__/useExternalMergeCelebration.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';

const mockCelebrate = vi.fn();
const mockWasRecent = vi.fn().mockReturnValue(false);

vi.mock('@/services/merge-celebration', () => ({
  celebrateMerge: (...args: unknown[]) => mockCelebrate(...args),
  wasRecentlyCelebrated: (...args: unknown[]) => mockWasRecent(...args),
}));

const mockSettings = {
  notifications: {
    onlyMyPRs: false,
    playMergeSound: true,
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
  },
};
const mockGitHub = { username: 'alice' };

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({ settings: { notifications: mockSettings.notifications, gitHub: mockGitHub } }),
  },
}));

import { usePrStore } from '@/stores/pr-store';
import { useExternalMergeCelebration } from '../useExternalMergeCelebration';

function makePr(overrides: Partial<PullRequest> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 42,
      title: 'A PR',
      headRef: 'feat',
      baseRef: 'main',
      authorLogin: 'alice',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: 'https://github.com/owner/repo/pull/42',
      body: '',
      repoOwner: 'owner',
      repoName: 'repo',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commitCount: 1,
      requestedReviewers: [],
      ...overrides,
    },
    checks: [],
    overallStatus: 'gray',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
  };
}

beforeEach(() => {
  mockCelebrate.mockClear();
  mockWasRecent.mockClear().mockReturnValue(false);
  mockSettings.notifications.onlyMyPRs = false;
  mockGitHub.username = 'alice';
  // Reset pr-store to a clean state.
  usePrStore.setState({ pullRequests: [], closedPullRequests: [] });
});

afterEach(() => {
  usePrStore.setState({ pullRequests: [], closedPullRequests: [] });
});

describe('useExternalMergeCelebration', () => {
  it('does not celebrate on cold start even if closed list contains merged PRs', () => {
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' })],
    });
    renderHook(() => useExternalMergeCelebration());
    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('celebrates when an open PR transitions to merged in the closed list', () => {
    const open = makePr();
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' }),
        ],
      });
    });

    expect(mockCelebrate).toHaveBeenCalledTimes(1);
    expect(mockCelebrate).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo' }),
    );
  });

  it('does not celebrate when an open PR transitions to closed without merge', () => {
    const open = makePr();
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', closedAt: '2026-04-30T10:00:00Z' }),
        ],
      });
    });

    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('skips celebration when wasRecentlyCelebrated returns true (local dedup)', () => {
    const open = makePr();
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    mockWasRecent.mockReturnValue(true);
    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' }),
        ],
      });
    });

    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('respects onlyMyPRs=true (skips PRs not authored by current user)', () => {
    mockSettings.notifications.onlyMyPRs = true;
    const open = makePr({ authorLogin: 'bob' });
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z', authorLogin: 'bob' }),
        ],
      });
    });

    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('respects onlyMyPRs=true (fires for PRs authored by current user)', () => {
    mockSettings.notifications.onlyMyPRs = true;
    const open = makePr({ authorLogin: 'alice' });
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z', authorLogin: 'alice' }),
        ],
      });
    });

    expect(mockCelebrate).toHaveBeenCalledTimes(1);
  });

  it('does not double-fire across multiple poll cycles for the same PR', () => {
    const open = makePr();
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    const merged = makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' });
    act(() => {
      usePrStore.setState({ pullRequests: [], closedPullRequests: [merged] });
    });
    // Simulate next poll — same closed list, same content.
    act(() => {
      usePrStore.setState({ pullRequests: [], closedPullRequests: [merged] });
    });

    expect(mockCelebrate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

```
npm run test -- src/hooks/__tests__/useExternalMergeCelebration.test.ts
```

Expected: FAIL with "Cannot find module '../useExternalMergeCelebration'."

- [ ] **Step 3: Implement the hook**

Create `src/BorgDock.Tauri/src/hooks/useExternalMergeCelebration.ts`:

```ts
import { useEffect, useRef } from 'react';
import { celebrateMerge, wasRecentlyCelebrated } from '@/services/merge-celebration';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';

function key(pr: { repoOwner: string; repoName: string; number: number }): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
}

function openIds(prs: PullRequestWithChecks[]): Set<string> {
  const s = new Set<string>();
  for (const p of prs) s.add(key(p.pullRequest));
  return s;
}

/**
 * Watches the PR store for open→merged transitions and fires `celebrateMerge`
 * for each. Mounted once at the app root next to `useGitHubPolling`.
 */
export function useExternalMergeCelebration(): void {
  const prevOpenIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // Seed prevOpenIds from the current snapshot — never celebrate PRs that
    // were already merged before the app started watching.
    if (prevOpenIdsRef.current === null) {
      prevOpenIdsRef.current = openIds(usePrStore.getState().pullRequests);
    }

    const unsubscribe = usePrStore.subscribe((state, prevState) => {
      if (
        state.pullRequests === prevState.pullRequests &&
        state.closedPullRequests === prevState.closedPullRequests
      ) {
        return;
      }
      const prevOpen = prevOpenIdsRef.current ?? new Set<string>();

      const settings = useSettingsStore.getState().settings;
      const onlyMine = settings.notifications.onlyMyPRs;
      const username = settings.gitHub.username.toLowerCase();

      for (const p of state.closedPullRequests) {
        const pr = p.pullRequest;
        if (!pr.mergedAt) continue;
        const k = key(pr);
        if (!prevOpen.has(k)) continue;
        if (wasRecentlyCelebrated(pr)) continue;
        if (onlyMine && pr.authorLogin.toLowerCase() !== username) continue;

        celebrateMerge({
          number: pr.number,
          title: pr.title,
          repoOwner: pr.repoOwner,
          repoName: pr.repoName,
          htmlUrl: pr.htmlUrl,
        });
      }

      prevOpenIdsRef.current = openIds(state.pullRequests);
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
```

NOTE on the cold-start guard: the seed in the `useEffect` body runs ONCE per mount. The `subscribe` callback receives both `state` and `prevState`; we use `prevOpenIdsRef` (not `prevState.pullRequests`) because we want the seed to come from the snapshot at mount time, not from "whatever the store happened to be one tick ago." This way the very first store change after mount is correctly compared against the mount-time snapshot.

- [ ] **Step 4: Run the tests**

```
npm run test -- src/hooks/__tests__/useExternalMergeCelebration.test.ts
```

Expected: PASS for all seven cases. If "celebrates when an open PR transitions to merged" fails because the hook seeds AFTER the first `setState`, debug by logging `prevOpenIdsRef.current` in the subscribe callback. The seed must complete in the `useEffect` body before any `setState` triggers the subscriber.

- [ ] **Step 5: Mount the hook in `App.tsx`**

In `src/BorgDock.Tauri/src/App.tsx`, add to the imports:

```ts
import { useExternalMergeCelebration } from '@/hooks/useExternalMergeCelebration';
```

Find the line `const { pollNow } = useGitHubPolling(settings, pollingEnabled);` (around line 126) and add immediately after it:

```ts
  useExternalMergeCelebration();
```

- [ ] **Step 6: Run the App.tsx tests to make sure nothing regresses**

```
npm run test -- src/__tests__/App.test.tsx
```

Expected: PASS. If tests fail because `useExternalMergeCelebration` accesses the store the App test doesn't initialize, mock it at the top of `App.test.tsx`:

```ts
vi.mock('@/hooks/useExternalMergeCelebration', () => ({
  useExternalMergeCelebration: () => {},
}));
```

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/hooks/useExternalMergeCelebration.ts src/BorgDock.Tauri/src/hooks/__tests__/useExternalMergeCelebration.test.ts src/BorgDock.Tauri/src/App.tsx src/BorgDock.Tauri/src/__tests__/App.test.tsx
git commit -m "feat(external-merge): celebrate PRs merged on GitHub between polls"
```

---

## Task 7: Remove unused merge-card CSS keyframes

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/index.css`

The inline `MergeCelebration` card was the only consumer of these keyframes. With Task 4 deleting the card, they can go.

- [ ] **Step 1: Confirm the keyframes are unused**

Search for each keyframe name across `src/`:

```
grep -rn "merge-pop-in\|merge-icon-bounce\|merge-draw-check\|merge-text-in\|merge-bg-shift" src/ --include="*.tsx" --include="*.ts"
```

Expected: zero matches in `.tsx`/`.ts` files (matches in `index.css` itself are fine).

- [ ] **Step 2: Delete the keyframe blocks**

In `src/BorgDock.Tauri/src/styles/index.css`, find and delete the five `@keyframes` blocks:

- `@keyframes merge-pop-in` (around line 1426)
- `@keyframes merge-icon-bounce` (around line 1437)
- `@keyframes merge-draw-check` (around line 1451)
- `@keyframes merge-text-in` (around line 1457)
- `@keyframes merge-bg-shift` (around line 1468)

Also delete the section header comment immediately before them if it now sits above an empty section:

```css
/* ════════════════════════════════════════════════════════
   Keyframes kept (consumed via Tailwind animate-[...] utilities).
   ════════════════════════════════════════════════════════ */
```

If `fadeSlideIn` and any other keyframes from the same comment group remain in use, leave the header in place.

- [ ] **Step 3: Run the build to confirm CSS is still valid**

```
npm run build
```

Expected: build succeeds. If it fails on a dangling Tailwind utility like `animate-[merge-bg-shift_...]`, search for the offender and remove the inline class — that means a stray reference survived.

- [ ] **Step 4: Run the full test suite**

```
npm run test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "chore(styles): remove unused merge-celebration keyframes"
```

---

## Task 8: Manual verification

**Files:** none (smoke test).

This is the only step where you exercise the running app. Required because some failure modes (autoplay rejection, audio file not bundled, CSP issue) only show up at runtime.

- [ ] **Step 1: Start dev mode**

```
npm run tauri dev
```

Wait for the BorgDock window to appear with at least one tracked repo's PRs visible.

- [ ] **Step 2: Open a PR you're allowed to bypass-merge**

Find a PR in your sidebar (use a test/throwaway PR if possible). Right-click → "Bypass merge (admin)" → confirm in the dialog.

Expected: within ~1s you see the rich merged toast (🎉 / pulsing glow / 🚀 Merged label) AND hear the "Ta-daaaa" sound.

- [ ] **Step 3: Verify dedup**

Wait for the next poll cycle (~30-60s). The toast should NOT re-fire — the local action already celebrated, and `wasRecentlyCelebrated` should suppress the polling-driven detection.

- [ ] **Step 4: Verify external detection**

Open a different PR in the GitHub web UI and merge it there. Within one poll cycle, the toast should fire in BorgDock (assuming `Only notify for my PRs` is off, or the PR is yours).

- [ ] **Step 5: Verify the sound toggle**

Open Settings → Notifications. Toggle "Play sound on merge" off. Repeat step 2 with a different PR. Expected: toast fires, sound does NOT.

- [ ] **Step 6: Verify CSP / asset loading**

Open the devtools console (right-click → Inspect in dev mode). Look for any errors mentioning `tada.mp3`, `Audio`, or CSP violations on `media-src`. Expected: no errors. If you see a CSP violation on `media-src`, add `media-src 'self'` to the `csp` string in `src-tauri/tauri.conf.json` and rebuild — but it should not be needed because `default-src 'self'` covers it.

- [ ] **Step 7: Note any UI issues found**

If the toast looks wrong (size, color, animation), open `src/components/notifications/NotificationBubble.tsx` — the `'merged'` config there controls the visual treatment. Don't change it as part of this plan unless it's broken; the design was approved as-is.

- [ ] **Step 8: No commit needed for manual verification.**

If you found bugs in steps 1-6, fix them in the relevant task above and commit. Otherwise this task ends here.

---

## Self-Review Checklist (run after the plan above is fully implemented)

- [ ] All five local merge code paths in the spec map to a task that fires `celebrateMerge`:
  - `OverviewTab.handleMerge` → Task 4
  - `OverviewTab.handleBypassExecute` → Task 4
  - `usePrCardActions.handleMerge` → Task 3
  - `usePrCardActions.executeBypassMerge` → Task 3
  - `MergeToast.executeMerge` → Task 5
- [ ] External-merge detection task exists (Task 6) and covers all spec test cases.
- [ ] `notifications.onlyMyPRs` is read in Task 6, not in Task 3/4/5 (local actions always celebrate).
- [ ] `playMergeSound` setting is added (Task 1) and consumed in Task 2.
- [ ] Sound file path matches `public/sounds/tada.mp3` — confirmed by `ls` before this plan was written.
- [ ] Inline `MergeCelebration` card deletion is in Task 4 and CSS cleanup in Task 7.
- [ ] No task references types or functions defined nowhere — `CelebratablePr`, `celebrateMerge`, `markCelebrated`, `wasRecentlyCelebrated` are all defined in Task 2 and consumed by Tasks 3-6.
- [ ] No "TBD" / "implement later" / "appropriate handling" placeholders.
