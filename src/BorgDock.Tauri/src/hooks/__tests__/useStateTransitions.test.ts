import { act, renderHook } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, PullRequest, PullRequestWithChecks } from '@/types';

// --- Mocks ---

const mockShow = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: Object.assign(() => ({}), { getState: () => ({ show: mockShow }) }),
}));

import { useStateTransitions } from '../useStateTransitions';

// --- Helpers ---

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 42,
    title: 'Test PR',
    headRef: 'feature',
    baseRef: 'main',
    authorLogin: 'alice',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-16T10:00:00Z',
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
  };
}

function makePrWithChecks(
  overrides: Partial<PullRequestWithChecks> & { pr?: Partial<PullRequest> } = {},
): PullRequestWithChecks {
  const { pr, ...rest } = overrides;
  return {
    pullRequest: makePr(pr),
    checks: [],
    overallStatus: 'gray',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    ...rest,
  };
}

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    setupComplete: true,
    gitHub: {
      authMethod: 'ghCli',
      pollIntervalSeconds: 60,
      username: 'alice',
      ...overrides.gitHub,
    },
    repos: [],
    ui: {
      sidebarEdge: 'right',
      sidebarMode: 'pinned',
      sidebarWidthPx: 800,
      theme: 'system',
      globalHotkey: '',
      flyoutHotkey: '',
      editorCommand: 'code',
      runAtStartup: false,
    },
    notifications: {
      toastOnCheckStatusChange: true,
      toastOnNewPR: true,
      toastOnReviewUpdate: true,
      toastOnMergeable: true,
      onlyMyPRs: false,
      playMergeSound: true,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 30,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
      ...overrides.notifications,
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: { model: 'claude-sonnet-4-20250514', maxTokens: 4096 },
    claudeReview: { botUsername: '' },
    updates: { autoCheckEnabled: true, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'pat' as const,
      authAutoDetected: true,
      pollIntervalSeconds: 60,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
    },
    sql: { connections: [] },
    repoPriority: {},
    ...overrides,
  };
}

function makeNotificationSettings(
  overrides: Partial<AppSettings['notifications']> = {},
): AppSettings['notifications'] {
  return {
    toastOnCheckStatusChange: true,
    toastOnNewPR: true,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    onlyMyPRs: false,
    playMergeSound: true,
    reviewNudgeEnabled: false,
    reviewNudgeIntervalMinutes: 30,
    reviewNudgeEscalation: false,
    deduplicationWindowSeconds: 60,
    ...overrides,
  };
}

// --- Tests ---

describe('useStateTransitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns a processTransitions function', () => {
    const { result } = renderHook(() => useStateTransitions(makeSettings()));
    expect(typeof result.current.processTransitions).toBe('function');
  });

  it('does not fire notifications on first poll (no previous data)', () => {
    const { result } = renderHook(() => useStateTransitions(makeSettings()));

    const newPrs = [makePrWithChecks({ overallStatus: 'red', failedCheckNames: ['build'] })];

    act(() => {
      result.current.processTransitions(newPrs);
    });

    expect(mockShow).not.toHaveBeenCalled();
  });

  it('fires notification when check fails (green -> red)', () => {
    const { result } = renderHook(() => useStateTransitions(makeSettings()));

    const oldPrs = [makePrWithChecks({ overallStatus: 'green' })];
    const newPrs = [makePrWithChecks({ overallStatus: 'red', failedCheckNames: ['build'] })];

    act(() => {
      result.current.processTransitions(oldPrs);
    });

    act(() => {
      result.current.processTransitions(newPrs);
    });

    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Check failed'),
        severity: 'error',
      }),
    );
  });

  it('fires notification when all checks pass (red -> green)', () => {
    const { result } = renderHook(() => useStateTransitions(makeSettings()));

    const oldPrs = [makePrWithChecks({ overallStatus: 'red', failedCheckNames: ['build'] })];
    const newPrs = [makePrWithChecks({ overallStatus: 'green' })];

    act(() => {
      result.current.processTransitions(oldPrs);
    });

    act(() => {
      result.current.processTransitions(newPrs);
    });

    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'All checks passed',
        severity: 'success',
      }),
    );
  });

  it('fires notification when review changes are requested', () => {
    const { result } = renderHook(() => useStateTransitions(makeSettings()));

    const oldPrs = [makePrWithChecks({ pr: { reviewStatus: 'approved' } })];
    const newPrs = [makePrWithChecks({ pr: { reviewStatus: 'changesRequested' } })];

    act(() => {
      result.current.processTransitions(oldPrs);
    });

    act(() => {
      result.current.processTransitions(newPrs);
    });

    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Changes requested',
        severity: 'warning',
      }),
    );
  });

  it('fires notification when PR is merged', () => {
    const { result } = renderHook(() => useStateTransitions(makeSettings()));

    const oldPrs = [makePrWithChecks()];
    const newPrs = [makePrWithChecks({ pr: { mergedAt: '2025-01-17T10:00:00Z' } })];

    act(() => {
      result.current.processTransitions(oldPrs);
    });

    act(() => {
      result.current.processTransitions(newPrs);
    });

    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'merged',
      }),
    );
  });

  it('fires notification when PR becomes mergeable', () => {
    const { result } = renderHook(() => useStateTransitions(makeSettings()));

    const oldPrs = [
      makePrWithChecks({
        overallStatus: 'red',
        pr: { reviewStatus: 'none' },
      }),
    ];
    const newPrs = [
      makePrWithChecks({
        overallStatus: 'green',
        pr: { reviewStatus: 'approved', isDraft: false, mergeable: true },
      }),
    ];

    act(() => {
      result.current.processTransitions(oldPrs);
    });

    act(() => {
      result.current.processTransitions(newPrs);
    });

    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'PR ready to merge',
        severity: 'success',
      }),
    );
  });

  it('fires notification when review is requested for current user', () => {
    const settings = makeSettings({
      gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: 'alice' },
    });
    const { result } = renderHook(() => useStateTransitions(settings));

    const oldPrs = [makePrWithChecks({ pr: { requestedReviewers: [] } })];
    const newPrs = [makePrWithChecks({ pr: { requestedReviewers: ['alice'] } })];

    act(() => {
      result.current.processTransitions(oldPrs);
    });

    act(() => {
      result.current.processTransitions(newPrs);
    });

    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Review requested'),
      }),
    );
  });

  describe('notification filtering', () => {
    it('skips check status notifications when toastOnCheckStatusChange is false', () => {
      const settings = makeSettings({
        notifications: makeNotificationSettings({ toastOnCheckStatusChange: false }),
      });
      const { result } = renderHook(() => useStateTransitions(settings));

      const oldPrs = [makePrWithChecks({ overallStatus: 'green' })];
      const newPrs = [makePrWithChecks({ overallStatus: 'red', failedCheckNames: ['build'] })];

      act(() => {
        result.current.processTransitions(oldPrs);
      });
      act(() => {
        result.current.processTransitions(newPrs);
      });

      expect(mockShow).not.toHaveBeenCalled();
    });

    it('skips allChecksPassed notifications when toastOnCheckStatusChange is false', () => {
      const settings = makeSettings({
        notifications: makeNotificationSettings({ toastOnCheckStatusChange: false }),
      });
      const { result } = renderHook(() => useStateTransitions(settings));

      const oldPrs = [makePrWithChecks({ overallStatus: 'red', failedCheckNames: ['build'] })];
      const newPrs = [makePrWithChecks({ overallStatus: 'green' })];

      act(() => {
        result.current.processTransitions(oldPrs);
      });
      act(() => {
        result.current.processTransitions(newPrs);
      });

      expect(mockShow).not.toHaveBeenCalled();
    });

    it('skips review notifications when toastOnReviewUpdate is false', () => {
      const settings = makeSettings({
        notifications: makeNotificationSettings({ toastOnReviewUpdate: false }),
      });
      const { result } = renderHook(() => useStateTransitions(settings));

      const oldPrs = [makePrWithChecks({ pr: { reviewStatus: 'approved' } })];
      const newPrs = [makePrWithChecks({ pr: { reviewStatus: 'changesRequested' } })];

      act(() => {
        result.current.processTransitions(oldPrs);
      });
      act(() => {
        result.current.processTransitions(newPrs);
      });

      expect(mockShow).not.toHaveBeenCalled();
    });

    it('skips reviewRequested notifications when toastOnReviewUpdate is false', () => {
      const settings = makeSettings({
        gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: 'alice' },
        notifications: makeNotificationSettings({ toastOnReviewUpdate: false }),
      });
      const { result } = renderHook(() => useStateTransitions(settings));

      const oldPrs = [makePrWithChecks({ pr: { requestedReviewers: [] } })];
      const newPrs = [makePrWithChecks({ pr: { requestedReviewers: ['alice'] } })];

      act(() => {
        result.current.processTransitions(oldPrs);
      });
      act(() => {
        result.current.processTransitions(newPrs);
      });

      expect(mockShow).not.toHaveBeenCalled();
    });

    it('skips mergeable notifications when toastOnMergeable is false', () => {
      const settings = makeSettings({
        notifications: makeNotificationSettings({ toastOnMergeable: false }),
      });
      const { result } = renderHook(() => useStateTransitions(settings));

      const oldPrs = [
        makePrWithChecks({
          overallStatus: 'red',
          pr: { reviewStatus: 'none' },
        }),
      ];
      const newPrs = [
        makePrWithChecks({
          overallStatus: 'green',
          pr: { reviewStatus: 'approved', isDraft: false, mergeable: true },
        }),
      ];

      act(() => {
        result.current.processTransitions(oldPrs);
      });
      act(() => {
        result.current.processTransitions(newPrs);
      });

      // allChecksPassed will still fire, but becameMergeable should not
      const mergeableCalls = mockShow.mock.calls.filter(
        (c: unknown[]) => (c[0] as { title: string }).title === 'PR ready to merge',
      );
      expect(mergeableCalls).toHaveLength(0);
    });

    it('filters to only my PRs when onlyMyPRs is enabled', () => {
      const settings = makeSettings({
        gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: 'alice' },
        notifications: makeNotificationSettings({ onlyMyPRs: true }),
      });
      const { result } = renderHook(() => useStateTransitions(settings));

      // Other user's PR fails
      const oldPrs = [
        makePrWithChecks({
          overallStatus: 'green',
          pr: { authorLogin: 'bob', number: 10 },
        }),
      ];
      const newPrs = [
        makePrWithChecks({
          overallStatus: 'red',
          failedCheckNames: ['build'],
          pr: { authorLogin: 'bob', number: 10 },
        }),
      ];

      act(() => {
        result.current.processTransitions(oldPrs);
      });
      act(() => {
        result.current.processTransitions(newPrs);
      });

      // Should NOT fire because it's bob's PR, not alice's
      expect(mockShow).not.toHaveBeenCalled();
    });

    it('allows my own PRs when onlyMyPRs is enabled', () => {
      const settings = makeSettings({
        gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: 'alice' },
        notifications: makeNotificationSettings({ onlyMyPRs: true }),
      });
      const { result } = renderHook(() => useStateTransitions(settings));

      const oldPrs = [
        makePrWithChecks({
          overallStatus: 'green',
          pr: { authorLogin: 'alice', number: 10 },
        }),
      ];
      const newPrs = [
        makePrWithChecks({
          overallStatus: 'red',
          failedCheckNames: ['build'],
          pr: { authorLogin: 'alice', number: 10 },
        }),
      ];

      act(() => {
        result.current.processTransitions(oldPrs);
      });
      act(() => {
        result.current.processTransitions(newPrs);
      });

      expect(mockShow).toHaveBeenCalled();
    });
  });

  describe('deduplication', () => {
    it('deduplicates identical transitions within the window', () => {
      const settings = makeSettings({
        notifications: makeNotificationSettings({ deduplicationWindowSeconds: 60 }),
      });
      const { result } = renderHook(() => useStateTransitions(settings));

      // Use two different PRs so we can trigger the same type of transition
      // without the intermediate state causing a different transition type
      const greenPr1 = makePrWithChecks({ overallStatus: 'green', pr: { number: 1 } });
      const redPr1 = makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['build'],
        pr: { number: 1 },
      });

      // First poll: set baseline as green
      act(() => {
        result.current.processTransitions([greenPr1]);
      });

      // Second poll: green -> red (fires checkFailed)
      act(() => {
        result.current.processTransitions([redPr1]);
      });

      expect(mockShow).toHaveBeenCalledTimes(1);

      // Third poll: PR stays red (no transition, nothing to dedup)
      // To trigger the SAME transition again within dedup window,
      // the underlying detectStateTransitions would need not-red -> red.
      // But since previousPrsRef is now redPr1, sending redPr1 again won't trigger.
      // The dedup logic prevents the SAME key from firing within the window.
      // Let's verify by simulating: not-red -> red for same PR again quickly
      act(() => {
        result.current.processTransitions([greenPr1]);
      });
      // This is now a red->green transition (allChecksPassed), separate type
      // The allChecksPassed triggers, but checkFailed:owner/repo#1 is deduped
      mockShow.mockClear();

      act(() => {
        result.current.processTransitions([redPr1]);
      });

      // The checkFailed for PR#1 should be deduplicated (same key within window)
      const checkFailedCalls = mockShow.mock.calls.filter((c: unknown[]) =>
        (c[0] as { title: string }).title.includes('Check failed'),
      );
      expect(checkFailedCalls).toHaveLength(0);
    });

    it('allows same transition after deduplication window expires', () => {
      const settings = makeSettings({
        notifications: makeNotificationSettings({ deduplicationWindowSeconds: 60 }),
      });
      const { result } = renderHook(() => useStateTransitions(settings));

      const greenPr = makePrWithChecks({ overallStatus: 'green', pr: { number: 1 } });
      const redPr = makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['build'],
        pr: { number: 1 },
      });

      // First cycle: green -> red
      act(() => {
        result.current.processTransitions([greenPr]);
      });
      act(() => {
        result.current.processTransitions([redPr]);
      });

      const firstCheckFailedCalls = mockShow.mock.calls.filter((c: unknown[]) =>
        (c[0] as { title: string }).title.includes('Check failed'),
      );
      expect(firstCheckFailedCalls).toHaveLength(1);

      // Advance past the dedup window (60s)
      vi.advanceTimersByTime(61_000);

      // Reset to green, then back to red
      act(() => {
        result.current.processTransitions([greenPr]);
      });
      mockShow.mockClear();
      act(() => {
        result.current.processTransitions([redPr]);
      });

      // Should fire again since the window expired
      const secondCheckFailedCalls = mockShow.mock.calls.filter((c: unknown[]) =>
        (c[0] as { title: string }).title.includes('Check failed'),
      );
      expect(secondCheckFailedCalls).toHaveLength(1);
    });
  });

  describe('multiple transitions', () => {
    it('handles multiple transitions in a single poll', () => {
      const { result } = renderHook(() => useStateTransitions(makeSettings()));

      const oldPrs = [
        makePrWithChecks({
          pr: { number: 1, reviewStatus: 'none' },
          overallStatus: 'green',
        }),
        makePrWithChecks({
          pr: { number: 2 },
          overallStatus: 'green',
        }),
      ];
      const newPrs = [
        makePrWithChecks({
          pr: { number: 1, reviewStatus: 'changesRequested' },
          overallStatus: 'green',
        }),
        makePrWithChecks({
          pr: { number: 2 },
          overallStatus: 'red',
          failedCheckNames: ['test'],
        }),
      ];

      act(() => {
        result.current.processTransitions(oldPrs);
      });
      act(() => {
        result.current.processTransitions(newPrs);
      });

      // Should have at least 2 notifications
      expect(mockShow.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
