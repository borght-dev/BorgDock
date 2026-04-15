import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, PullRequest } from '@/types';

// --- Mock all external dependencies ---

const mockGetGitHubToken = vi.fn();
const mockGetOpenPRs = vi.fn();
const mockGetClosedPRs = vi.fn();
const mockGetCheckRunsForRef = vi.fn();
const mockAggregatePrWithChecks = vi.fn();
const mockInitClient = vi.fn();
const mockGetClient = vi.fn();

vi.mock('@/services/github/auth', () => ({
  getGitHubToken: (...args: unknown[]) => mockGetGitHubToken(...args),
}));

vi.mock('@/services/github/pulls', () => ({
  getOpenPRs: (...args: unknown[]) => mockGetOpenPRs(...args),
  getClosedPRs: (...args: unknown[]) => mockGetClosedPRs(...args),
}));

vi.mock('@/services/github/checks', () => ({
  getCheckRunsForRef: (...args: unknown[]) => mockGetCheckRunsForRef(...args),
}));

vi.mock('@/services/github/aggregate', () => ({
  aggregatePrWithChecks: (...args: unknown[]) => mockAggregatePrWithChecks(...args),
}));

// We need a real-ish PollingManager to test interval/start/stop behavior.
// But we mock the GitHub client singleton.
const mockClientInstance = {
  markPollStart: vi.fn(),
  hadFreshData: true,
  isRateLimitLow: false,
  getRateLimit: vi.fn().mockReturnValue({ remaining: 5000, total: 5000, reset: new Date() }),
  getEtagEntries: vi.fn().mockReturnValue([]),
};

vi.mock('@/services/github/singleton', () => ({
  initClient: (...args: unknown[]) => {
    mockInitClient(...args);
    return mockClientInstance;
  },
  getClient: () => mockGetClient(),
}));

vi.mock('@/services/cache', () => ({
  saveCachedPRs: vi.fn().mockResolvedValue(undefined),
  saveCachedEtags: vi.fn().mockResolvedValue(undefined),
}));

// Mock global fetch for username detection
const mockFetchFn = vi.fn();

import { usePrStore } from '@/stores/pr-store';
import { useGitHubPolling } from '../useGitHubPolling';

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    setupComplete: true,
    gitHub: {
      authMethod: 'pat',
      personalAccessToken: 'ghp_test123',
      pollIntervalSeconds: 60,
      username: '',
    },
    repos: [
      { owner: 'test', name: 'repo', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
    ],
    ui: {
      sidebarEdge: 'right',
      sidebarMode: 'pinned',
      sidebarWidthPx: 800,
      theme: 'system',
      globalHotkey: '',
      editorCommand: 'code',
      runAtStartup: false,
      badgeEnabled: true,
      badgeStyle: 'GlassCapsule',
      indicatorStyle: 'SegmentRing',
    },
    notifications: {
      toastOnCheckStatusChange: true,
      toastOnNewPR: true,
      toastOnReviewUpdate: true,
      toastOnMergeable: true,
      onlyMyPRs: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 30,
      reviewNudgeEscalation: false,
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
    ...overrides,
  };
}

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR',
    headRef: 'feature-branch',
    baseRef: 'main',
    authorLogin: 'testuser',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    isDraft: false,
    htmlUrl: 'https://github.com/test/repo/pull/1',
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
    requestedReviewers: [],
    ...overrides,
  };
}

describe('useGitHubPolling', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset store state
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [],
      username: '',
      isPolling: false,
      lastPollTime: null,
      rateLimit: null,
    });

    // Default mock behaviors
    mockGetGitHubToken.mockResolvedValue('ghp_test123');
    mockGetClient.mockReturnValue(mockClientInstance);
    mockGetOpenPRs.mockResolvedValue([]);
    mockGetClosedPRs.mockResolvedValue([]);
    mockGetCheckRunsForRef.mockResolvedValue([]);
    mockAggregatePrWithChecks.mockImplementation((pr: PullRequest, checks: unknown[]) => ({
      pullRequest: pr,
      checks,
      overallStatus: 'green',
      failedCheckNames: [],
      pendingCheckNames: [],
      passedCount: 0,
      skippedCount: 0,
    }));
    mockClientInstance.hadFreshData = true;
    mockClientInstance.isRateLimitLow = false;
    mockClientInstance.getRateLimit.mockReturnValue({
      remaining: 5000,
      total: 5000,
      reset: new Date(),
    });

    // Mock global fetch for username detection
    originalFetch = globalThis.fetch;
    mockFetchFn.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ login: 'testuser' }),
    });
    globalThis.fetch = mockFetchFn;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('initializes the GitHub client on mount', () => {
    renderHook(() => useGitHubPolling(makeSettings()));

    expect(mockInitClient).toHaveBeenCalledWith(expect.any(Function));
  });

  it('detects username via /user API', async () => {
    renderHook(() => useGitHubPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({ 'User-Agent': 'PRDock' }),
        }),
      );
    });

    await vi.waitFor(() => {
      expect(usePrStore.getState().username).toBe('testuser');
    });
  });

  it('handles username detection failure gracefully', async () => {
    mockFetchFn.mockRejectedValue(new Error('network error'));

    // Should not throw
    renderHook(() => useGitHubPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalled();
    });

    // Username remains empty
    expect(usePrStore.getState().username).toBe('');
  });

  it('handles non-ok response for username detection', async () => {
    mockFetchFn.mockResolvedValue({ ok: false });

    renderHook(() => useGitHubPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalled();
    });

    expect(usePrStore.getState().username).toBe('');
  });

  it('sets polling state to true on mount', () => {
    renderHook(() => useGitHubPolling(makeSettings()));

    expect(usePrStore.getState().isPolling).toBe(true);
  });

  it('returns pollNow function', () => {
    const { result } = renderHook(() => useGitHubPolling(makeSettings()));

    expect(typeof result.current.pollNow).toBe('function');
  });

  it('starts polling and fetches open PRs', async () => {
    const pr = makePr();
    mockGetOpenPRs.mockResolvedValue([pr]);

    renderHook(() => useGitHubPolling(makeSettings()));

    // The PollingManager calls pollFn after scheduleNext(0) which is a 0ms timeout
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockGetOpenPRs).toHaveBeenCalledWith(mockClientInstance, 'test', 'repo');
    });
  });

  it('fetches check runs for each PR', async () => {
    const pr = makePr({ headRef: 'my-branch' });
    mockGetOpenPRs.mockResolvedValue([pr]);
    mockGetCheckRunsForRef.mockResolvedValue([{ id: 1, name: 'build', status: 'completed' }]);

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockGetCheckRunsForRef).toHaveBeenCalledWith(
        mockClientInstance,
        'test',
        'repo',
        'my-branch',
      );
    });
  });

  it('aggregates PR with checks results', async () => {
    const pr = makePr();
    const checks = [{ id: 1, name: 'build' }];
    mockGetOpenPRs.mockResolvedValue([pr]);
    mockGetCheckRunsForRef.mockResolvedValue(checks);

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockAggregatePrWithChecks).toHaveBeenCalledWith(pr, checks);
    });
  });

  it('updates PR store with results when data is fresh', async () => {
    const pr = makePr();
    mockGetOpenPRs.mockResolvedValue([pr]);
    mockClientInstance.hadFreshData = true;

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(usePrStore.getState().pullRequests).toHaveLength(1);
    });
  });

  it('still updates PR store even when data is not fresh (304 — onResult always fires)', async () => {
    const pr = makePr();
    mockGetOpenPRs.mockResolvedValue([pr]);
    mockClientInstance.hadFreshData = false;

    usePrStore.getState().setPullRequests([]);

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockGetOpenPRs).toHaveBeenCalled();
    });

    // onResult always fires regardless of hadFreshData — the ETag cache
    // in the client ensures the data is the same, so updating is a no-op.
    await vi.waitFor(() => {
      expect(usePrStore.getState().pullRequests).toHaveLength(1);
    });
  });

  it('sets rate limit in store after successful poll', async () => {
    mockGetOpenPRs.mockResolvedValue([]);
    mockClientInstance.getRateLimit.mockReturnValue({
      remaining: 4500,
      total: 5000,
      reset: new Date('2024-01-01T01:00:00Z'),
    });

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      const rl = usePrStore.getState().rateLimit;
      expect(rl).toBeDefined();
      expect(rl!.remaining).toBe(4500);
      expect(rl!.limit).toBe(5000);
    });
  });

  it('skips rate limit update when remaining is negative', async () => {
    mockGetOpenPRs.mockResolvedValue([]);
    mockClientInstance.getRateLimit.mockReturnValue({
      remaining: -1,
      total: -1,
      reset: null,
    });

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockGetOpenPRs).toHaveBeenCalled();
    });

    expect(usePrStore.getState().rateLimit).toBeNull();
  });

  it('handles getCheckRunsForRef failure gracefully', async () => {
    const pr = makePr();
    mockGetOpenPRs.mockResolvedValue([pr]);
    mockGetCheckRunsForRef.mockRejectedValue(new Error('check fetch failed'));

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      // Should aggregate with empty checks on failure
      expect(mockAggregatePrWithChecks).toHaveBeenCalledWith(pr, []);
    });
  });

  it('skips repos that are not enabled', async () => {
    const settings = makeSettings({
      repos: [
        {
          owner: 'test',
          name: 'repo1',
          enabled: true,
          worktreeBasePath: '',
          worktreeSubfolder: '',
        },
        {
          owner: 'test',
          name: 'repo2',
          enabled: false,
          worktreeBasePath: '',
          worktreeSubfolder: '',
        },
      ],
    });

    mockGetOpenPRs.mockResolvedValue([]);

    renderHook(() => useGitHubPolling(settings));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockGetOpenPRs).toHaveBeenCalledWith(mockClientInstance, 'test', 'repo1');
      expect(mockGetOpenPRs).not.toHaveBeenCalledWith(mockClientInstance, 'test', 'repo2');
    });
  });

  it('returns empty when no repos are enabled', async () => {
    const settings = makeSettings({
      repos: [
        {
          owner: 'test',
          name: 'repo',
          enabled: false,
          worktreeBasePath: '',
          worktreeSubfolder: '',
        },
      ],
    });

    renderHook(() => useGitHubPolling(settings));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockGetClient).toHaveBeenCalled();
    });

    expect(mockGetOpenPRs).not.toHaveBeenCalled();
  });

  it('handles getOpenPRs failure for a repo gracefully', async () => {
    mockGetOpenPRs.mockRejectedValue(new Error('API error'));

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    // The poll cycle should complete despite the error (structured logger
    // captures it; the error doesn't propagate to the caller).
    await vi.waitFor(() => {
      expect(mockGetOpenPRs).toHaveBeenCalled();
    });
  });

  it('fetches closed PRs on mount', async () => {
    mockGetClosedPRs.mockResolvedValue([makePr({ state: 'closed' })]);

    renderHook(() => useGitHubPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(mockGetClosedPRs).toHaveBeenCalledWith(mockClientInstance, 'test', 'repo');
    });

    await vi.waitFor(() => {
      expect(usePrStore.getState().closedPullRequests).toHaveLength(1);
    });
  });

  it('handles closed PR fetch failure gracefully', async () => {
    mockGetClosedPRs.mockRejectedValue(new Error('closed fetch error'));

    // Should not throw
    renderHook(() => useGitHubPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(mockGetClosedPRs).toHaveBeenCalled();
    });

    // Closed PRs remain empty
    expect(usePrStore.getState().closedPullRequests).toHaveLength(0);
  });

  it('stops polling on unmount', async () => {
    mockGetOpenPRs.mockResolvedValue([]);

    const { unmount } = renderHook(() => useGitHubPolling(makeSettings()));

    unmount();

    const callCountAfterUnmount = mockGetOpenPRs.mock.calls.length;

    // Advance timers significantly — should not trigger more polls
    await act(async () => {
      vi.advanceTimersByTime(300_000);
    });

    expect(mockGetOpenPRs.mock.calls.length).toBe(callCountAfterUnmount);
  });

  it('pollNow triggers an immediate poll', async () => {
    mockGetOpenPRs.mockResolvedValue([]);

    const { result } = renderHook(() => useGitHubPolling(makeSettings()));

    // Wait for initial poll setup
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockGetOpenPRs).toHaveBeenCalled();
    });

    const initialCallCount = mockGetOpenPRs.mock.calls.length;

    await act(async () => {
      await result.current.pollNow();
    });

    expect(mockGetOpenPRs.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('pollNow sets polling state', async () => {
    mockGetOpenPRs.mockResolvedValue([]);

    const { result } = renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockGetOpenPRs).toHaveBeenCalled();
    });

    // pollNow should set isPolling to true
    let pollingDuringCall = false;
    const origSetPollingState = usePrStore.getState().setPollingState;
    const spy = vi.spyOn(usePrStore.getState(), 'setPollingState');

    await act(async () => {
      const promise = result.current.pollNow();
      // After calling pollNow, store should show polling=true
      pollingDuringCall = usePrStore.getState().isPolling;
      await promise;
    });

    expect(pollingDuringCall).toBe(true);
    spy.mockRestore();
  });

  it('re-creates polling when PAT changes', () => {
    const settings1 = makeSettings();
    const settings2 = makeSettings({
      gitHub: {
        authMethod: 'pat',
        personalAccessToken: 'ghp_new_token',
        pollIntervalSeconds: 60,
        username: '',
      },
    });

    const { rerender } = renderHook(
      ({ settings }: { settings: AppSettings }) => useGitHubPolling(settings),
      { initialProps: { settings: settings1 } },
    );

    expect(mockInitClient).toHaveBeenCalledTimes(1);

    rerender({ settings: settings2 });

    expect(mockInitClient).toHaveBeenCalledTimes(2);
  });

  it('re-creates polling when poll interval changes', () => {
    const settings1 = makeSettings();
    const settings2 = makeSettings({
      gitHub: {
        authMethod: 'pat',
        personalAccessToken: 'ghp_test123',
        pollIntervalSeconds: 120,
        username: '',
      },
    });

    const { rerender } = renderHook(
      ({ settings }: { settings: AppSettings }) => useGitHubPolling(settings),
      { initialProps: { settings: settings1 } },
    );

    expect(mockInitClient).toHaveBeenCalledTimes(1);

    rerender({ settings: settings2 });

    expect(mockInitClient).toHaveBeenCalledTimes(2);
  });

  it('handles poll error and sets polling state to false', async () => {
    mockGetClient.mockReturnValue(null);

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    // The error is logged via structured logger (not console.error).
    // Verify polling state is set to false after the error.
    await vi.waitFor(() => {
      expect(usePrStore.getState().isPolling).toBe(false);
    });
  });

  it('staggers requests between repos with 500ms delay', async () => {
    const settings = makeSettings({
      repos: [
        { owner: 'o1', name: 'r1', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
        { owner: 'o2', name: 'r2', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
      ],
    });

    mockGetOpenPRs.mockResolvedValue([]);

    renderHook(() => useGitHubPolling(settings));

    // Start initial poll
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockGetOpenPRs).toHaveBeenCalledWith(mockClientInstance, 'o1', 'r1');
    });

    // Second repo is called after 500ms stagger
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await vi.waitFor(() => {
      expect(mockGetOpenPRs).toHaveBeenCalledWith(mockClientInstance, 'o2', 'r2');
    });
  });

  it('marks poll start on client before fetching', async () => {
    mockGetOpenPRs.mockResolvedValue([]);

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockClientInstance.markPollStart).toHaveBeenCalled();
    });
  });
});
