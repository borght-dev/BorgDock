import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrStore } from '@/stores/pr-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { PullRequestWithChecks, WorkItem } from '@/types';
import { installTestSeed } from '../test-seed';

// Inline minimal fixtures: the legacy `tests/e2e/fixtures/design-fixtures.ts`
// was deleted alongside the visual-diff Playwright tree. The test-seed contract
// only needs valid `PullRequestWithChecks` / `WorkItem` shapes — we don't need
// the full design canvas dataset to verify the hook installs and writes to
// stores correctly.
const DESIGN_PRS: PullRequestWithChecks[] = [
  {
    pullRequest: {
      number: 708,
      title: 'Test PR 708',
      headRef: 'feat/a',
      baseRef: 'master',
      authorLogin: 'alice',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      isDraft: false,
      htmlUrl: 'https://example.com/pr/708',
      body: '',
      repoOwner: 'acme',
      repoName: 'borgdock',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      commitCount: 1,
      requestedReviewers: [],
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    totalCheckCount: 0,
  },
  {
    pullRequest: {
      number: 710,
      title: 'Test PR 710',
      headRef: 'feat/b',
      baseRef: 'master',
      authorLogin: 'bob',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-01-03T00:00:00Z',
      updatedAt: '2026-01-04T00:00:00Z',
      isDraft: false,
      htmlUrl: 'https://example.com/pr/710',
      body: '',
      repoOwner: 'acme',
      repoName: 'borgdock',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 2,
      deletions: 0,
      changedFiles: 1,
      commitCount: 1,
      requestedReviewers: [],
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    totalCheckCount: 0,
  },
];

const DESIGN_WORK_ITEMS: WorkItem[] = [
  {
    id: 1,
    rev: 1,
    url: 'https://example.com/wi/1',
    fields: { 'System.Title': 'Test Work Item' },
    relations: [],
    htmlUrl: 'https://example.com/wi/1',
  },
];

const { mockSendOs } = vi.hoisted(() => ({
  mockSendOs: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/notification', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/notification')>('@/services/notification');
  return { ...actual, sendOsNotification: mockSendOs };
});

/**
 * Test-seed hook contract:
 *
 * - `installTestSeed({ isDev: true })` attaches `window.__borgdock_test_seed`
 *   and `window.__borgdock_test_toast`.
 * - `installTestSeed({ isDev: false })` attaches nothing.
 * - The seed pushes fixtures directly into the real Zustand stores so
 *   Playwright can exercise the production rendering pipeline without IPC.
 *
 * Assertions use the stores' real field names — `pullRequests` (not `prs`)
 * on the pr-store, `workItems` on the work-items-store, and `__borgdock_test_toast`
 * routes through the OS-level `sendOsNotification` (mocked here).
 */

describe('installTestSeed', () => {
  beforeEach(() => {
    // Reset pr-store data slice + derived cache flags used by selectors.
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [],
      filter: 'all',
      searchQuery: '',
      sortBy: 'updated',
      username: '',
      isPolling: false,
      lastPollTime: null,
      rateLimit: null,
      reviewRequestTimestamps: {},
      _cacheKey: '',
      _cachedPriorityScores: null,
      _cachedTeamReviewLoad: null,
      _cachedCounts: null,
      _viewCacheKey: '',
      _cachedFilteredPrs: null,
      _cachedGroupedByRepo: null,
      _cachedNeedsMyReview: null,
      _cachedFocusPrs: null,
    });

    // Reset work-items-store to an empty slice.
    useWorkItemsStore.setState({
      workItems: [],
    });

    // Reset the notification mock so toast assertions aren't polluted.
    mockSendOs.mockClear();

    // Clean up any hooks attached by a previous test.
    delete (window as { __borgdock_test_seed?: unknown }).__borgdock_test_seed;
    delete (window as { __borgdock_test_toast?: unknown }).__borgdock_test_toast;
  });

  it('attaches a global function when called in dev', () => {
    installTestSeed({ isDev: true });
    expect(typeof window.__borgdock_test_seed).toBe('function');
  });

  it('does nothing in non-dev', () => {
    installTestSeed({ isDev: false });
    expect(window.__borgdock_test_seed).toBeUndefined();
    expect(window.__borgdock_test_toast).toBeUndefined();
  });

  it('seeds PRs into the pr-store', () => {
    installTestSeed({ isDev: true });
    window.__borgdock_test_seed?.({ prs: DESIGN_PRS });

    const state = usePrStore.getState();
    expect(state.pullRequests).toHaveLength(DESIGN_PRS.length);
    expect(state.pullRequests[0]!.pullRequest.number).toBe(DESIGN_PRS[0]!.pullRequest.number);
  });

  it('seeds work items into the work-items-store', () => {
    installTestSeed({ isDev: true });
    window.__borgdock_test_seed?.({ workItems: DESIGN_WORK_ITEMS });

    const state = useWorkItemsStore.getState();
    expect(state.workItems).toHaveLength(DESIGN_WORK_ITEMS.length);
    expect(state.workItems[0]!.id).toBe(DESIGN_WORK_ITEMS[0]!.id);
  });

  it('accepts partial payloads without touching unrelated stores', () => {
    installTestSeed({ isDev: true });
    window.__borgdock_test_seed?.({ prs: DESIGN_PRS.slice(0, 2) });

    expect(usePrStore.getState().pullRequests).toHaveLength(2);
    expect(useWorkItemsStore.getState().workItems).toHaveLength(0);
  });

  it('exposes __borgdock_test_toast in dev', () => {
    installTestSeed({ isDev: true });
    expect(typeof window.__borgdock_test_toast).toBe('function');

    window.__borgdock_test_toast?.({
      kind: 'success',
      title: 'Saved',
      message: 'Settings updated',
    });

    expect(mockSendOs).toHaveBeenCalledTimes(1);
    expect(mockSendOs).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Saved',
        body: 'Settings updated',
        severity: 'success',
      }),
    );
  });
});
