import { beforeEach, describe, expect, it } from 'vitest';
import type { OverallStatus, PullRequestWithChecks, ReviewStatus } from '@/types';
import { usePrStore } from '../pr-store';

function makePr(overrides: {
  number?: number;
  title?: string;
  authorLogin?: string;
  repoOwner?: string;
  repoName?: string;
  headRef?: string;
  overallStatus?: OverallStatus;
  isDraft?: boolean;
  mergeable?: boolean;
  reviewStatus?: ReviewStatus;
  updatedAt?: string;
  createdAt?: string;
  labels?: string[];
  state?: string;
}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: overrides.number ?? 1,
      title: overrides.title ?? 'Test PR',
      headRef: overrides.headRef ?? 'feature/test',
      baseRef: 'main',
      authorLogin: overrides.authorLogin ?? 'testuser',
      authorAvatarUrl: '',
      state: overrides.state ?? 'open',
      createdAt: overrides.createdAt ?? '2025-01-01T00:00:00Z',
      updatedAt: overrides.updatedAt ?? '2025-01-02T00:00:00Z',
      isDraft: overrides.isDraft ?? false,
      mergeable: overrides.mergeable,
      htmlUrl: '',
      body: '',
      repoOwner: overrides.repoOwner ?? 'owner',
      repoName: overrides.repoName ?? 'repo',
      reviewStatus: overrides.reviewStatus ?? 'none',
      commentCount: 0,
      labels: overrides.labels ?? [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
    },
    checks: [],
    overallStatus: overrides.overallStatus ?? 'green',
    failedCheckNames: overrides.overallStatus === 'red' ? ['ci'] : [],
    pendingCheckNames: overrides.overallStatus === 'yellow' ? ['ci'] : [],
    passedCount: overrides.overallStatus === 'green' ? 1 : 0,
    skippedCount: 0,
  };
}

describe('pr-store', () => {
  beforeEach(() => {
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [],
      filter: 'all',
      searchQuery: '',
      sortBy: 'updated',
      username: 'me',
      isPolling: false,
      lastPollTime: null,
      rateLimit: null,
    });
  });

  describe('filtering', () => {
    const prs: PullRequestWithChecks[] = [
      makePr({ number: 1, authorLogin: 'me', overallStatus: 'green', reviewStatus: 'approved' }),
      makePr({ number: 2, authorLogin: 'other', overallStatus: 'red' }),
      makePr({ number: 3, authorLogin: 'other', overallStatus: 'green', reviewStatus: 'approved' }),
      makePr({ number: 4, authorLogin: 'other', overallStatus: 'yellow', reviewStatus: 'pending' }),
    ];

    beforeEach(() => {
      usePrStore.getState().setPullRequests(prs);
      usePrStore.getState().setUsername('me');
    });

    it('shows all PRs with "all" filter', () => {
      usePrStore.getState().setFilter('all');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(4);
    });

    it('filters by "mine"', () => {
      usePrStore.getState().setFilter('mine');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
      expect(result[0]!.pullRequest.authorLogin).toBe('me');
    });

    it('filters by "failing"', () => {
      usePrStore.getState().setFilter('failing');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
      expect(result[0]!.overallStatus).toBe('red');
    });

    it('filters by "ready" (green + approved + not draft + mergeable)', () => {
      usePrStore.getState().setFilter('ready');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(2);
      result.forEach((pr) => {
        expect(pr.overallStatus).toBe('green');
        expect(pr.pullRequest.reviewStatus).toBe('approved');
      });
    });

    it('excludes drafts from "ready"', () => {
      usePrStore
        .getState()
        .setPullRequests([
          makePr({ number: 10, overallStatus: 'green', reviewStatus: 'approved', isDraft: true }),
        ]);
      usePrStore.getState().setFilter('ready');
      expect(usePrStore.getState().filteredPrs()).toHaveLength(0);
    });

    it('excludes unmergeable PRs from "ready"', () => {
      usePrStore.getState().setPullRequests([
        makePr({
          number: 10,
          overallStatus: 'green',
          reviewStatus: 'approved',
          mergeable: false,
        }),
      ]);
      usePrStore.getState().setFilter('ready');
      expect(usePrStore.getState().filteredPrs()).toHaveLength(0);
    });

    it('filters by "reviewing"', () => {
      usePrStore.getState().setFilter('reviewing');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
      expect(result[0]!.pullRequest.reviewStatus).toBe('pending');
    });

    it('filters by "closed"', () => {
      const closedPrs = [makePr({ number: 99, state: 'closed' })];
      usePrStore.getState().setClosedPullRequests(closedPrs);
      usePrStore.getState().setFilter('closed');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
      expect(result[0]!.pullRequest.number).toBe(99);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      usePrStore.getState().setPullRequests([
        makePr({ number: 1, title: 'Fix login bug', authorLogin: 'alice', headRef: 'fix/login' }),
        makePr({
          number: 2,
          title: 'Add dashboard',
          authorLogin: 'bob',
          headRef: 'add/dashboard',
          labels: ['enhancement'],
        }),
        makePr({
          number: 3,
          title: 'Update README',
          repoOwner: 'acme',
          repoName: 'docs',
          headRef: 'docs/readme',
        }),
      ]);
    });

    it('searches by title (case-insensitive)', () => {
      usePrStore.getState().setSearchQuery('LOGIN');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
      expect(result[0]!.pullRequest.number).toBe(1);
    });

    it('searches by author', () => {
      usePrStore.getState().setSearchQuery('bob');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
      expect(result[0]!.pullRequest.number).toBe(2);
    });

    it('searches by branch name', () => {
      usePrStore.getState().setSearchQuery('fix/login');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
    });

    it('searches by repo name', () => {
      usePrStore.getState().setSearchQuery('acme/docs');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
      expect(result[0]!.pullRequest.number).toBe(3);
    });

    it('searches by label', () => {
      usePrStore.getState().setSearchQuery('enhancement');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
      expect(result[0]!.pullRequest.number).toBe(2);
    });

    it('searches by PR number', () => {
      usePrStore.getState().setSearchQuery('3');
      const result = usePrStore.getState().filteredPrs();
      expect(result).toHaveLength(1);
      expect(result[0]!.pullRequest.number).toBe(3);
    });

    it('returns all when search query is empty', () => {
      usePrStore.getState().setSearchQuery('');
      expect(usePrStore.getState().filteredPrs()).toHaveLength(3);
    });
  });

  describe('sorting', () => {
    const prs = [
      makePr({
        number: 1,
        title: 'Zebra',
        updatedAt: '2025-01-01T00:00:00Z',
        createdAt: '2025-01-03T00:00:00Z',
      }),
      makePr({
        number: 2,
        title: 'Alpha',
        updatedAt: '2025-01-03T00:00:00Z',
        createdAt: '2025-01-01T00:00:00Z',
      }),
      makePr({
        number: 3,
        title: 'Middle',
        updatedAt: '2025-01-02T00:00:00Z',
        createdAt: '2025-01-02T00:00:00Z',
      }),
    ];

    beforeEach(() => {
      usePrStore.getState().setPullRequests(prs);
      usePrStore.getState().setUsername('');
    });

    it('sorts by updated date descending (default)', () => {
      usePrStore.getState().setSortBy('updated');
      const result = usePrStore.getState().filteredPrs();
      expect(result.map((p) => p.pullRequest.number)).toEqual([2, 3, 1]);
    });

    it('sorts by created date descending', () => {
      usePrStore.getState().setSortBy('created');
      const result = usePrStore.getState().filteredPrs();
      expect(result.map((p) => p.pullRequest.number)).toEqual([1, 3, 2]);
    });

    it('sorts by title alphabetically', () => {
      usePrStore.getState().setSortBy('title');
      const result = usePrStore.getState().filteredPrs();
      expect(result.map((p) => p.pullRequest.title)).toEqual(['Alpha', 'Middle', 'Zebra']);
    });

    it('sorts user PRs first', () => {
      usePrStore.getState().setUsername('testuser');
      usePrStore
        .getState()
        .setPullRequests([
          makePr({ number: 1, authorLogin: 'other', updatedAt: '2025-01-03T00:00:00Z' }),
          makePr({ number: 2, authorLogin: 'testuser', updatedAt: '2025-01-01T00:00:00Z' }),
        ]);
      const result = usePrStore.getState().filteredPrs();
      expect(result[0]!.pullRequest.number).toBe(2);
    });

    it('sorts drafts after non-drafts', () => {
      usePrStore
        .getState()
        .setPullRequests([
          makePr({ number: 1, isDraft: true, updatedAt: '2025-01-03T00:00:00Z' }),
          makePr({ number: 2, isDraft: false, updatedAt: '2025-01-01T00:00:00Z' }),
        ]);
      const result = usePrStore.getState().filteredPrs();
      expect(result[0]!.pullRequest.number).toBe(2);
    });
  });

  describe('grouping', () => {
    it('groups PRs by owner/repo', () => {
      usePrStore
        .getState()
        .setPullRequests([
          makePr({ number: 1, repoOwner: 'acme', repoName: 'api' }),
          makePr({ number: 2, repoOwner: 'acme', repoName: 'web' }),
          makePr({ number: 3, repoOwner: 'acme', repoName: 'api' }),
        ]);
      const groups = usePrStore.getState().groupedByRepo();
      expect(groups.size).toBe(2);
      expect(groups.get('acme/api')).toHaveLength(2);
      expect(groups.get('acme/web')).toHaveLength(1);
    });

    it('sorts groups with user PRs first', () => {
      usePrStore.getState().setUsername('me');
      usePrStore
        .getState()
        .setPullRequests([
          makePr({ number: 1, repoOwner: 'a', repoName: 'first', authorLogin: 'other' }),
          makePr({ number: 2, repoOwner: 'z', repoName: 'last', authorLogin: 'me' }),
        ]);
      const groups = usePrStore.getState().groupedByRepo();
      const keys = [...groups.keys()];
      expect(keys[0]).toBe('z/last');
      expect(keys[1]).toBe('a/first');
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
});
