import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, PullRequest, PullRequestWithChecks } from '@/types';

// --- Mock all external dependencies ---

const mockGetGitHubToken = vi.fn();
const mockPollOpenPrsAggregate = vi.fn();
const mockGetClosedPRs = vi.fn();
const mockAggregatePrWithChecks = vi.fn();
const mockInitClient = vi.fn();
const mockGetClient = vi.fn();

vi.mock('@/services/github/auth', () => ({
  getGitHubToken: (...args: unknown[]) => mockGetGitHubToken(...args),
}));

vi.mock('@/services/github/polling', () => ({
  pollOpenPrsAggregate: (...args: unknown[]) => mockPollOpenPrsAggregate(...args),
}));

vi.mock('@/services/github/pulls', () => ({
  getClosedPRs: (...args: unknown[]) => mockGetClosedPRs(...args),
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
      theme: 'system',
      globalHotkey: '',
      flyoutHotkey: '',
      editorCommand: 'code',
      runAtStartup: false,
      quickReviewHotkey: '',
      startMinimizedToTray: false,
      restoreLastSelection: true,
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
      channels: { tray: true, system: true, sound: true, emailDigest: false },
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      prSummaryEnabled: true,
      diffExplanationsEnabled: true,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    },
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
      linkMatchBy: 'branch',
      showWorkItemStateOnPrCard: true,
      updatePrStatusWhenWiDone: false,
    },
    sql: { connections: [], readOnlyByDefault: true, confirmDestructiveWithoutWhere: true },
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

/** Fully-aggregated shape, as pollOpenPrsAggregate returns it. */
function makePrw(overrides: Partial<PullRequest> = {}): PullRequestWithChecks {
  return {
    pullRequest: makePr(overrides),
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
    totalCheckCount: 1,
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
    mockPollOpenPrsAggregate.mockResolvedValue([]);
    mockGetClosedPRs.mockResolvedValue([]);
    mockAggregatePrWithChecks.mockImplementation((pr: PullRequest, checks: unknown[]) => ({
      pullRequest: pr,
      checks,
      overallStatus: 'green',
      failedCheckNames: [],
      failedCheckSuiteIds: [],
      pendingCheckNames: [],
      passedCount: 0,
      skippedCount: 0,
      totalCheckCount: checks.length,
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

  describe('enabled gate', () => {
    it('does not initialize client or start polling when disabled', async () => {
      renderHook(() => useGitHubPolling(makeSettings(), false));

      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });

      expect(mockInitClient).not.toHaveBeenCalled();
      expect(mockPollOpenPrsAggregate).not.toHaveBeenCalled();
      expect(mockFetchFn).not.toHaveBeenCalled();
      expect(usePrStore.getState().isPolling).toBe(false);
    });

    it('starts polling immediately when enabled flips from false to true', async () => {
      mockPollOpenPrsAggregate.mockResolvedValue([makePrw()]);

      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) => useGitHubPolling(makeSettings(), enabled),
        { initialProps: { enabled: false } },
      );

      expect(mockInitClient).not.toHaveBeenCalled();

      rerender({ enabled: true });

      // First poll fires on the next tick (PollingManager scheduleNext(0)).
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      await vi.waitFor(() => {
        expect(mockInitClient).toHaveBeenCalledTimes(1);
        expect(mockPollOpenPrsAggregate).toHaveBeenCalledWith(mockClientInstance, 'test', 'repo');
      });
    });
  });

  it('detects username via /user API', async () => {
    renderHook(() => useGitHubPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({ 'User-Agent': 'BorgDock' }),
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

  it('starts polling and fetches open PRs via one aggregate call per repo', async () => {
    mockPollOpenPrsAggregate.mockResolvedValue([makePrw()]);

    renderHook(() => useGitHubPolling(makeSettings()));

    // The PollingManager calls pollFn after scheduleNext(0) which is a 0ms timeout
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockPollOpenPrsAggregate).toHaveBeenCalledWith(mockClientInstance, 'test', 'repo');
    });
  });

  it('updates PR store with results when data is fresh', async () => {
    mockPollOpenPrsAggregate.mockResolvedValue([makePrw()]);
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
    mockPollOpenPrsAggregate.mockResolvedValue([makePrw()]);
    mockClientInstance.hadFreshData = false;

    usePrStore.getState().setPullRequests([]);

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockPollOpenPrsAggregate).toHaveBeenCalled();
    });

    // onResult always fires regardless of hadFreshData — the ETag cache
    // in the client ensures the data is the same, so updating is a no-op.
    await vi.waitFor(() => {
      expect(usePrStore.getState().pullRequests).toHaveLength(1);
    });
  });

  it('sets rate limit in store after successful poll', async () => {
    mockPollOpenPrsAggregate.mockResolvedValue([]);
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
    mockPollOpenPrsAggregate.mockResolvedValue([]);
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
      expect(mockPollOpenPrsAggregate).toHaveBeenCalled();
    });

    expect(usePrStore.getState().rateLimit).toBeNull();
  });

  it('keeps last-known PRs for a repo when its poll fails', async () => {
    // Seed the store as if the previous cycle had succeeded.
    const prior = makePrw({ number: 7, title: 'Survivor' });
    usePrStore.setState({ pullRequests: [prior] });

    mockPollOpenPrsAggregate.mockRejectedValue(new Error('graphql boom'));

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockPollOpenPrsAggregate).toHaveBeenCalled();
    });

    // The failed repo's PRs survive the cycle instead of vanishing (which
    // would fire spurious "new PR" notifications when they reappear).
    await vi.waitFor(() => {
      const prs = usePrStore.getState().pullRequests;
      expect(prs).toHaveLength(1);
      expect(prs[0]).toBe(prior);
    });
  });

  it("does not resurrect another repo's PRs when one repo fails", async () => {
    const settings = makeSettings({
      repos: [
        { owner: 'o1', name: 'r1', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
        { owner: 'o2', name: 'r2', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
      ],
    });

    const r1Prior = makePrw({ number: 1, repoOwner: 'o1', repoName: 'r1' });
    const r2Prior = makePrw({ number: 2, repoOwner: 'o2', repoName: 'r2' });
    usePrStore.setState({ pullRequests: [r1Prior, r2Prior] });

    const r2Fresh = makePrw({ number: 2, repoOwner: 'o2', repoName: 'r2', title: 'fresh' });
    mockPollOpenPrsAggregate.mockImplementation((_c: unknown, owner: string) => {
      if (owner === 'o1') return Promise.reject(new Error('boom'));
      return Promise.resolve([r2Fresh]);
    });

    renderHook(() => useGitHubPolling(settings));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    // Second repo runs after the 500ms stagger.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await vi.waitFor(() => {
      const prs = usePrStore.getState().pullRequests;
      expect(prs).toHaveLength(2);
      expect(prs).toContain(r1Prior); // failed repo: last-known entry kept
      expect(prs).toContain(r2Fresh); // healthy repo: fresh result used
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

    mockPollOpenPrsAggregate.mockResolvedValue([]);

    renderHook(() => useGitHubPolling(settings));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockPollOpenPrsAggregate).toHaveBeenCalledWith(mockClientInstance, 'test', 'repo1');
      expect(mockPollOpenPrsAggregate).not.toHaveBeenCalledWith(
        mockClientInstance,
        'test',
        'repo2',
      );
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

    expect(mockPollOpenPrsAggregate).not.toHaveBeenCalled();
  });

  it('completes the poll cycle when a repo fetch fails', async () => {
    mockPollOpenPrsAggregate.mockRejectedValue(new Error('API error'));

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    // The poll cycle should complete despite the error (structured logger
    // captures it; the error doesn't propagate to the caller).
    await vi.waitFor(() => {
      expect(mockPollOpenPrsAggregate).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      expect(usePrStore.getState().lastPollTime).not.toBeNull();
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
    mockPollOpenPrsAggregate.mockResolvedValue([]);

    const { unmount } = renderHook(() => useGitHubPolling(makeSettings()));

    unmount();

    const callCountAfterUnmount = mockPollOpenPrsAggregate.mock.calls.length;

    // Advance timers significantly — should not trigger more polls
    await act(async () => {
      vi.advanceTimersByTime(300_000);
    });

    expect(mockPollOpenPrsAggregate.mock.calls.length).toBe(callCountAfterUnmount);
  });

  it('pollNow triggers an immediate poll', async () => {
    mockPollOpenPrsAggregate.mockResolvedValue([]);

    const { result } = renderHook(() => useGitHubPolling(makeSettings()));

    // Wait for initial poll setup
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockPollOpenPrsAggregate).toHaveBeenCalled();
    });

    const initialCallCount = mockPollOpenPrsAggregate.mock.calls.length;

    await act(async () => {
      await result.current.pollNow();
    });

    expect(mockPollOpenPrsAggregate.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('pollNow sets polling state', async () => {
    mockPollOpenPrsAggregate.mockResolvedValue([]);

    const { result } = renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockPollOpenPrsAggregate).toHaveBeenCalled();
    });

    // pollNow should set isPolling to true
    let pollingDuringCall = false;
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

    mockPollOpenPrsAggregate.mockResolvedValue([]);

    renderHook(() => useGitHubPolling(settings));

    // Start initial poll
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockPollOpenPrsAggregate).toHaveBeenCalledWith(mockClientInstance, 'o1', 'r1');
    });

    // Second repo is called after 500ms stagger
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await vi.waitFor(() => {
      expect(mockPollOpenPrsAggregate).toHaveBeenCalledWith(mockClientInstance, 'o2', 'r2');
    });
  });

  it('marks poll start on client before fetching', async () => {
    mockPollOpenPrsAggregate.mockResolvedValue([]);

    renderHook(() => useGitHubPolling(makeSettings()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await vi.waitFor(() => {
      expect(mockClientInstance.markPollStart).toHaveBeenCalled();
    });
  });
});
