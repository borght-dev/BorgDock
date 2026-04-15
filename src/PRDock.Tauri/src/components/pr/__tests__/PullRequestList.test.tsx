import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { PullRequestList } from '../PullRequestList';

afterEach(cleanup);

// Mock Tauri APIs (used transitively by PullRequestCard)
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

vi.mock('@/services/review-sla', () => ({
  formatReviewWaitTime: vi.fn(() => '<1h'),
  getReviewSlaTier: vi.fn(() => 'fresh'),
}));

vi.mock('@/services/work-item-linker', () => ({
  detectWorkItemIds: vi.fn(() => []),
}));

// Mock stores used by child components
vi.mock('@/stores/ui-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector({
      selectedPrNumber: null,
      selectPr: vi.fn(),
      togglePrExpanded: vi.fn(),
      expandedPrNumbers: new Set<number>(),
      expandedRepoGroups: new Set<string>(),
      toggleRepoGroup: vi.fn(),
      worktreeBranchMap: new Map(),
    });
  });
  return { useUiStore: fn };
});

vi.mock('@/stores/notification-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector({ show: vi.fn() });
  });
  return { useNotificationStore: fn };
});

vi.mock('@/stores/settings-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector({ settings: { repos: [] } });
  });
  return { useSettingsStore: fn };
});

vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn(),
    monitorPr: vi.fn(),
    resolveConflicts: vi.fn(),
  }),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => null),
}));

// Mock pr-store with configurable state
let mockStoreState: Record<string, unknown> = {};

vi.mock('@/stores/pr-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector(mockStoreState);
  });
  fn.getState = vi.fn(() => ({
    getReviewRequestedAt: vi.fn(),
  }));
  return { usePrStore: fn };
});

function makePr(number: number, repo = 'test/repo'): PullRequestWithChecks {
  const [owner, name] = repo.split('/');
  return {
    pullRequest: {
      number,
      title: `PR #${number}`,
      headRef: `feature/pr-${number}`,
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: `https://github.com/${repo}/pull/${number}`,
      body: '',
      repoOwner: owner!,
      repoName: name!,
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [],
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
  };
}

function setupStoreState(overrides: Partial<Record<string, unknown>> = {}) {
  const prs = (overrides.pullRequests ?? [makePr(1)]) as PullRequestWithChecks[];
  const closedPrs = (overrides.closedPullRequests ?? []) as PullRequestWithChecks[];

  mockStoreState = {
    isPolling: false,
    lastPollTime: new Date(),
    pullRequests: prs,
    closedPullRequests: closedPrs,
    filter: 'all',
    searchQuery: '',
    sortBy: 'updated',
    username: 'testuser',
    reviewRequestTimestamps: {},
    needsMyReview: overrides.needsMyReview ?? (() => []),
    groupedByRepo: () => {
      const groups = new Map<string, PullRequestWithChecks[]>();
      for (const pr of prs) {
        const key = `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}`;
        const existing = groups.get(key) || [];
        existing.push(pr);
        groups.set(key, existing);
      }
      return groups;
    },
    filteredPrs: () => prs,
    teamReviewLoad: () => [],
    ...overrides,
  };
}

describe('PullRequestList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStoreState();
  });

  it('shows skeleton cards during first load', () => {
    setupStoreState({
      pullRequests: [],
      filteredPrs: () => [],
      groupedByRepo: () => new Map(),
    });
    mockStoreState.isPolling = true;
    mockStoreState.lastPollTime = null;

    const { container } = render(<PullRequestList />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(4);
  });

  it('shows empty state when no PRs found', () => {
    setupStoreState({
      pullRequests: [],
      filteredPrs: () => [],
      groupedByRepo: () => new Map(),
    });
    render(<PullRequestList />);
    expect(screen.getByText('No pull requests found')).toBeInTheDocument();
  });

  it('renders PR cards grouped by repo', () => {
    setupStoreState({
      pullRequests: [makePr(1, 'owner/repoA'), makePr(2, 'owner/repoB')],
    });
    render(<PullRequestList />);
    expect(screen.getByText('PR #1')).toBeInTheDocument();
    expect(screen.getByText('PR #2')).toBeInTheDocument();
  });

  it('shows recently closed section when filter is not closed and there are closed PRs', () => {
    setupStoreState({
      filter: 'all',
      closedPullRequests: [makePr(99)],
    });
    render(<PullRequestList />);
    expect(screen.getByText('Recently Closed')).toBeInTheDocument();
  });

  it('hides recently closed section when filter is closed', () => {
    setupStoreState({
      filter: 'closed',
      closedPullRequests: [makePr(99)],
    });
    render(<PullRequestList />);
    expect(screen.queryByText('Recently Closed')).not.toBeInTheDocument();
  });

  it('shows "Needs Your Review" section when review queue has items in "all" filter', () => {
    const reviewPr = makePr(10);
    reviewPr.pullRequest.requestedReviewers = ['testuser'];
    setupStoreState({
      filter: 'all',
      needsMyReview: () => [reviewPr],
    });
    render(<PullRequestList />);
    expect(screen.getByText('Needs Your Review')).toBeInTheDocument();
  });

  it('hides "Needs Your Review" when filter is not "all"', () => {
    const reviewPr = makePr(10);
    reviewPr.pullRequest.requestedReviewers = ['testuser'];
    setupStoreState({
      filter: 'mine',
      needsMyReview: () => [reviewPr],
    });
    render(<PullRequestList />);
    expect(screen.queryByText('Needs Your Review')).not.toBeInTheDocument();
  });

  it('hides "Needs Your Review" when review queue is empty', () => {
    setupStoreState({
      filter: 'all',
      needsMyReview: () => [],
    });
    render(<PullRequestList />);
    expect(screen.queryByText('Needs Your Review')).not.toBeInTheDocument();
  });
});
