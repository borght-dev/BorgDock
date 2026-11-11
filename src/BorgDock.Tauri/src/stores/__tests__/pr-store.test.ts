import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverallStatus, PullRequestWithChecks, ReviewStatus } from '@/types';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';
import {
  PR_HIDE_FAILING_STORE_KEY,
  PR_REFRESHED_EVENT,
  type PrRefreshedDetail,
  usePrStore,
} from '../pr-store';

vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn().mockResolvedValue(undefined),
  readFromTauriStore: vi.fn().mockResolvedValue(undefined),
}));

function makePr(overrides: {
  number?: number;
  authorLogin?: string;
  repoOwner?: string;
  repoName?: string;
  overallStatus?: OverallStatus;
  reviewStatus?: ReviewStatus;
}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: overrides.number ?? 1,
      title: 'Test PR',
      headRef: 'feature/test',
      baseRef: 'main',
      authorLogin: overrides.authorLogin ?? 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      isDraft: false,
      htmlUrl: '',
      body: '',
      repoOwner: overrides.repoOwner ?? 'owner',
      repoName: overrides.repoName ?? 'repo',
      reviewStatus: overrides.reviewStatus ?? 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [],
    },
    overallStatus: overrides.overallStatus ?? 'green',
    failedCheckNames: overrides.overallStatus === 'red' ? ['ci'] : [],
    failedCheckSuiteIds: overrides.overallStatus === 'red' ? [1] : [],
    pendingCheckNames: overrides.overallStatus === 'yellow' ? ['ci'] : [],
    passedCount: overrides.overallStatus === 'green' ? 1 : 0,
    skippedCount: 0,
    totalCheckCount: (overrides.overallStatus ?? 'green') === 'gray' ? 0 : 1,
  };
}

describe('pr-store', () => {
  beforeEach(() => {
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [],
      filter: 'all',
      searchQuery: '',
      relatedFailure: null,
      hideFailing: false,
      username: 'me',
      isPolling: false,
      lastPollTime: null,
      rateLimit: null,
    });
  });

  it('keeps the empty review list stable before a username is loaded', () => {
    usePrStore.getState().setUsername('');
    const first = usePrStore.getState().needsMyReview();
    expect(first).toEqual([]);
    expect(usePrStore.getState().needsMyReview()).toBe(first);
  });

  describe('hide failing', () => {
    const prs: PullRequestWithChecks[] = [
      makePr({ number: 1, authorLogin: 'me', overallStatus: 'green', reviewStatus: 'approved' }),
      makePr({ number: 2, authorLogin: 'me', overallStatus: 'red' }),
      makePr({ number: 3, authorLogin: 'other', overallStatus: 'red' }),
      makePr({ number: 4, authorLogin: 'other', overallStatus: 'yellow' }),
    ];

    beforeEach(() => {
      vi.mocked(persistToTauriStore).mockClear();
      usePrStore.getState().setPullRequests(prs);
      usePrStore.getState().setUsername('me');
    });

    it('counts what each segment would show, and keeps the Failing count', () => {
      expect(usePrStore.getState().counts().all).toBe(4);
      usePrStore.getState().setHideFailing(true);
      const counts = usePrStore.getState().counts();
      expect(counts.all).toBe(2);
      expect(counts.mine).toBe(1);
      expect(counts.failing).toBe(2);
    });

    it('counts every PR again when turned off', () => {
      usePrStore.getState().setHideFailing(true);
      expect(usePrStore.getState().counts().all).toBe(2);
      usePrStore.getState().setHideFailing(false);
      expect(usePrStore.getState().counts().all).toBe(4);
    });

    it('remembers the choice across launches', async () => {
      usePrStore.getState().setHideFailing(true);
      expect(persistToTauriStore).toHaveBeenCalledWith(
        'ui-state.json',
        PR_HIDE_FAILING_STORE_KEY,
        true,
      );

      usePrStore.setState({ hideFailing: false });
      vi.mocked(readFromTauriStore).mockResolvedValueOnce(true);
      await usePrStore.getState().restoreHideFailing();
      expect(readFromTauriStore).toHaveBeenCalledWith('ui-state.json', PR_HIDE_FAILING_STORE_KEY);
      expect(usePrStore.getState().hideFailing).toBe(true);
      expect(usePrStore.getState().counts().all).toBe(2);
    });

    it('keeps the current choice when nothing was stored', async () => {
      usePrStore.setState({ hideFailing: true });
      vi.mocked(readFromTauriStore).mockResolvedValueOnce(undefined);
      await usePrStore.getState().restoreHideFailing();
      expect(usePrStore.getState().hideFailing).toBe(true);
    });
  });

  describe('counts', () => {
    it('returns correct counts per filter', () => {
      usePrStore.getState().setUsername('me');
      usePrStore.getState().setPullRequests([
        makePr({
          number: 1,
          authorLogin: 'me',
          overallStatus: 'green',
          reviewStatus: 'approved',
        }),
        makePr({ number: 2, authorLogin: 'other', overallStatus: 'red' }),
        makePr({
          number: 3,
          authorLogin: 'other',
          overallStatus: 'yellow',
          reviewStatus: 'pending',
        }),
      ]);
      usePrStore.getState().setClosedPullRequests([makePr({ number: 99 })]);
      const counts = usePrStore.getState().counts();
      expect(counts.all).toBe(3);
      expect(counts.mine).toBe(1);
      expect(counts.failing).toBe(1);
      expect(counts.ready).toBe(1);
      expect(counts.reviewing).toBe(1);
      expect(counts.closed).toBe(1);
    });
  });

  describe('actions', () => {
    it('sets polling state', () => {
      const now = new Date();
      usePrStore.getState().setPollingState(true, now);
      expect(usePrStore.getState().isPolling).toBe(true);
      expect(usePrStore.getState().lastPollTime).toEqual(now);
    });

    it('sets rate limit', () => {
      const rl = { remaining: 50, limit: 100, resetAt: new Date() };
      usePrStore.getState().setRateLimit(rl);
      expect(usePrStore.getState().rateLimit).toEqual(rl);
    });

    it('clears rate limit', () => {
      usePrStore.getState().setRateLimit({ remaining: 50, limit: 100, resetAt: new Date() });
      usePrStore.getState().setRateLimit(null);
      expect(usePrStore.getState().rateLimit).toBeNull();
    });
  });

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
        new Date(state.closedPullRequests[0]!.pullRequest.mergedAt as string).getTime(),
      ).toBeGreaterThanOrEqual(new Date(beforeIso).getTime());
    });

    it('dispatches PR_REFRESHED_EVENT with the updated PR', () => {
      const handler = vi.fn();
      document.addEventListener(PR_REFRESHED_EVENT, handler);
      try {
        usePrStore.getState().optimisticallyMarkMerged('o', 'r', 7);
        expect(handler).toHaveBeenCalledTimes(1);
        const detail = (handler.mock.calls[0]![0] as CustomEvent<PrRefreshedDetail>).detail;
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
});
