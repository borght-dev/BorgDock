import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { AppSettings, PullRequestWithChecks } from '@/types';

const mockShow = vi.fn();
const mockBuildReviewNudgeNotification = vi.fn();
const mockGetReviewSlaTier = vi.fn();
const mockFormatReviewWaitTime = vi.fn();
const mockNeedsMyReview = vi.fn<() => PullRequestWithChecks[]>();
const mockGetReviewRequestedAt = vi.fn();

let mockPullRequests: PullRequestWithChecks[] = [];

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: {
    getState: () => ({ show: mockShow }),
  },
}));

vi.mock('@/stores/pr-store', () => ({
  usePrStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ pullRequests: mockPullRequests }),
    {
      getState: () => ({
        needsMyReview: mockNeedsMyReview,
        getReviewRequestedAt: mockGetReviewRequestedAt,
      }),
    },
  ),
}));

vi.mock('@/services/notification', () => ({
  buildReviewNudgeNotification: (...args: unknown[]) => mockBuildReviewNudgeNotification(...args),
}));

vi.mock('@/services/review-sla', () => ({
  getReviewSlaTier: (...args: unknown[]) => mockGetReviewSlaTier(...args),
  formatReviewWaitTime: (...args: unknown[]) => mockFormatReviewWaitTime(...args),
}));

import { useReviewNudges } from '../useReviewNudges';

function makePr(number: number): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      title: `PR #${number}`,
      headRef: 'feature',
      baseRef: 'main',
      authorLogin: 'other',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: `https://github.com/test/repo/pull/${number}`,
      body: '',
      repoOwner: 'test',
      repoName: 'repo',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: ['testuser'],
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
  };
}

function makeSettings(overrides: Partial<{
  reviewNudgeEnabled: boolean;
  reviewNudgeIntervalMinutes: number;
  reviewNudgeEscalation: boolean;
  username: string;
}> = {}): AppSettings {
  return {
    setupComplete: true,
    gitHub: {
      authMethod: 'ghCli',
      pollIntervalSeconds: 60,
      username: overrides.username ?? 'testuser',
    },
    repos: [],
    ui: {
      sidebarEdge: 'right',
      sidebarMode: 'pinned',
      sidebarWidthPx: 800,
      theme: 'system',
      globalHotkey: '',
      editorCommand: 'code',
      runAtStartup: false,
      badgeStyle: 'GlassCapsule',
      indicatorStyle: 'SegmentRing',
    },
    notifications: {
      toastOnCheckStatusChange: true,
      toastOnNewPR: true,
      toastOnReviewUpdate: true,
      toastOnMergeable: true,
      onlyMyPRs: false,
      reviewNudgeEnabled: overrides.reviewNudgeEnabled ?? true,
      reviewNudgeIntervalMinutes: overrides.reviewNudgeIntervalMinutes ?? 30,
      reviewNudgeEscalation: overrides.reviewNudgeEscalation ?? false,
      deduplicationWindowSeconds: 60,
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: { model: 'claude-sonnet-4-20250514', maxTokens: 4096 },
    claudeReview: { botUsername: '' },
    updates: { autoCheckEnabled: true, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      pollIntervalSeconds: 60,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
    },
    sql: { connections: [] },
    repoPriority: {},
  };
}

describe('useReviewNudges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockPullRequests = [];
    mockNeedsMyReview.mockReturnValue([]);
    mockGetReviewRequestedAt.mockReturnValue(undefined);
    mockGetReviewSlaTier.mockReturnValue('fresh');
    mockFormatReviewWaitTime.mockReturnValue('30 minutes');
    mockBuildReviewNudgeNotification.mockReturnValue({
      title: 'Review nudge',
      message: 'Please review',
      severity: 'info',
      actions: [],
    });

    // Make document hidden so nudges fire
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
  });

  it('does not nudge on first poll (startup)', () => {
    const pr = makePr(1);
    mockPullRequests = [pr];
    mockNeedsMyReview.mockReturnValue([pr]);
    mockGetReviewRequestedAt.mockReturnValue('2024-01-01T00:00:00Z');

    renderHook(() => useReviewNudges(makeSettings()));

    expect(mockShow).not.toHaveBeenCalled();
  });

  it('nudges on second poll when review is pending', () => {
    const pr = makePr(1);
    mockNeedsMyReview.mockReturnValue([pr]);
    mockGetReviewRequestedAt.mockReturnValue('2024-01-01T00:00:00Z');

    mockPullRequests = [pr];
    const { rerender } = renderHook(
      ({ prs }) => {
        mockPullRequests = prs;
        return useReviewNudges(makeSettings());
      },
      { initialProps: { prs: [pr] } },
    );

    // First poll - should skip
    expect(mockShow).not.toHaveBeenCalled();

    // Second poll
    rerender({ prs: [pr, pr] }); // trigger re-render with different array ref

    expect(mockShow).toHaveBeenCalled();
  });

  it('does not nudge when reviewNudgeEnabled is false', () => {
    const pr = makePr(1);
    mockNeedsMyReview.mockReturnValue([pr]);
    mockGetReviewRequestedAt.mockReturnValue('2024-01-01T00:00:00Z');

    const settings = makeSettings({ reviewNudgeEnabled: false });
    mockPullRequests = [pr];

    const { rerender } = renderHook(
      ({ prs }) => {
        mockPullRequests = prs;
        return useReviewNudges(settings);
      },
      { initialProps: { prs: [pr] } },
    );

    // Second poll
    rerender({ prs: [pr, pr] });

    expect(mockShow).not.toHaveBeenCalled();
  });

  it('does not nudge when document is visible', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    const pr = makePr(1);
    mockNeedsMyReview.mockReturnValue([pr]);
    mockGetReviewRequestedAt.mockReturnValue('2024-01-01T00:00:00Z');

    mockPullRequests = [pr];
    const { rerender } = renderHook(
      ({ prs }) => {
        mockPullRequests = prs;
        return useReviewNudges(makeSettings());
      },
      { initialProps: { prs: [pr] } },
    );

    rerender({ prs: [pr, pr] });

    expect(mockShow).not.toHaveBeenCalled();
  });

  it('does not nudge when no username is configured', () => {
    const pr = makePr(1);
    mockNeedsMyReview.mockReturnValue([pr]);
    mockGetReviewRequestedAt.mockReturnValue('2024-01-01T00:00:00Z');

    const settings = makeSettings({ username: '' });
    mockPullRequests = [pr];

    const { rerender } = renderHook(
      ({ prs }) => {
        mockPullRequests = prs;
        return useReviewNudges(settings);
      },
      { initialProps: { prs: [pr] } },
    );

    rerender({ prs: [pr, pr] });

    expect(mockShow).not.toHaveBeenCalled();
  });

  it('does not nudge when review queue is empty', () => {
    mockNeedsMyReview.mockReturnValue([]);

    const pr = makePr(1);
    mockPullRequests = [pr];

    const { rerender } = renderHook(
      ({ prs }) => {
        mockPullRequests = prs;
        return useReviewNudges(makeSettings());
      },
      { initialProps: { prs: [pr] } },
    );

    rerender({ prs: [pr, pr] });

    expect(mockShow).not.toHaveBeenCalled();
  });

  it('skips PRs without a requestedAt timestamp', () => {
    const pr = makePr(1);
    mockNeedsMyReview.mockReturnValue([pr]);
    mockGetReviewRequestedAt.mockReturnValue(undefined);

    mockPullRequests = [pr];
    const { rerender } = renderHook(
      ({ prs }) => {
        mockPullRequests = prs;
        return useReviewNudges(makeSettings());
      },
      { initialProps: { prs: [pr] } },
    );

    rerender({ prs: [pr, pr] });

    expect(mockShow).not.toHaveBeenCalled();
  });

  it('respects nudge interval - does not re-nudge too soon', () => {
    const pr = makePr(1);
    mockNeedsMyReview.mockReturnValue([pr]);
    mockGetReviewRequestedAt.mockReturnValue('2024-01-01T00:00:00Z');

    mockPullRequests = [pr];
    const { rerender } = renderHook(
      ({ prs }) => {
        mockPullRequests = prs;
        return useReviewNudges(makeSettings({ reviewNudgeIntervalMinutes: 30 }));
      },
      { initialProps: { prs: [pr] } },
    );

    // Second poll - should nudge
    rerender({ prs: [pr, pr] });
    expect(mockShow).toHaveBeenCalledTimes(1);

    // Third poll immediately - should NOT re-nudge (within interval)
    rerender({ prs: [pr, pr, pr] });
    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it('sets up periodic check interval when enabled', () => {
    const settings = makeSettings({ reviewNudgeEnabled: true, reviewNudgeIntervalMinutes: 5 });
    renderHook(() => useReviewNudges(settings));

    // The interval should be min(5 * 60000, 300000) = 300000
    // Just verify the hook doesn't throw
    vi.advanceTimersByTime(300_000);
    // The periodic check calls checkNudges, but since it's the first poll it won't nudge
  });

  it('clears interval when disabled', () => {
    const { rerender } = renderHook(
      ({ settings }) => useReviewNudges(settings),
      { initialProps: { settings: makeSettings({ reviewNudgeEnabled: true }) } },
    );

    rerender({ settings: makeSettings({ reviewNudgeEnabled: false }) });

    // Should not throw after advancing timers
    vi.advanceTimersByTime(600_000);
  });

  it('does not nudge when pullRequests array is empty', () => {
    mockPullRequests = [];
    renderHook(() => useReviewNudges(makeSettings()));
    expect(mockShow).not.toHaveBeenCalled();
  });
});
