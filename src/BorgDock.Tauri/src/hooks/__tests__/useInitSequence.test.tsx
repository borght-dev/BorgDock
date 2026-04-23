import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInitStore } from '@/stores/initStore';
import { usePrStore } from '@/stores/pr-store';
import type { AppSettings, PullRequest } from '@/types';
import { useInitSequence } from '../useInitSequence';

const mockGetGitHubToken = vi.fn();
const mockGetOpenPRs = vi.fn();
const mockInitClient = vi.fn();
const mockAggregatePrWithChecks = vi.fn();

vi.mock('@/services/github/auth', () => ({
  getGitHubToken: (...args: unknown[]) => mockGetGitHubToken(...args),
}));

vi.mock('@/services/github/pulls', () => ({
  getOpenPRs: (...args: unknown[]) => mockGetOpenPRs(...args),
}));

vi.mock('@/services/github/singleton', () => ({
  initClient: (...args: unknown[]) => mockInitClient(...args),
}));

vi.mock('@/services/github/aggregate', () => ({
  aggregatePrWithChecks: (...args: unknown[]) => mockAggregatePrWithChecks(...args),
}));

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

describe('useInitSequence', () => {
  const client = { markPollStart: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();

    useInitStore.setState({
      currentStep: null,
      completedSteps: {},
      error: null,
      isComplete: false,
      runToken: 0,
    });
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [],
      username: '',
      isPolling: false,
      lastPollTime: null,
      rateLimit: null,
    });

    mockGetGitHubToken.mockResolvedValue('ghp_test123');
    mockInitClient.mockReturnValue(client);
    mockGetOpenPRs.mockResolvedValue([makePr()]);
    mockAggregatePrWithChecks.mockImplementation((pr: PullRequest) => ({
      pullRequest: pr,
      checks: [],
      overallStatus: 'gray',
      failedCheckNames: [],
      pendingCheckNames: [],
      passedCount: 0,
      skippedCount: 0,
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ login: 'testuser' }),
      }),
    );
  });

  it('completes init after PR fetch and seeds PRs without waiting for CI checks', async () => {
    renderHook(() => useInitSequence(makeSettings(), false));

    await waitFor(() => {
      expect(useInitStore.getState().isComplete).toBe(true);
    });

    // Init path must not hydrate detail/reviews — that's left to the polling loop
    expect(mockGetOpenPRs).toHaveBeenCalledWith(client, 'test', 'repo', { hydrateDetails: false });
    expect(mockAggregatePrWithChecks).toHaveBeenCalledWith(
      expect.objectContaining({ number: 1 }),
      [],
    );
    expect(usePrStore.getState().pullRequests).toHaveLength(1);
    expect(useInitStore.getState().completedSteps['fetch-checks']).toBe(true);
  });

  it('surfaces an error on the fetch-prs step when the fetch hangs', async () => {
    vi.useFakeTimers();
    try {
      // Never resolves — simulates a hung GitHub request
      mockGetOpenPRs.mockReturnValue(new Promise(() => {}));

      renderHook(() => useInitSequence(makeSettings(), false));

      // Let the auth/discover steps run
      await vi.advanceTimersByTimeAsync(0);
      // Advance past the 20s fetch-prs timeout
      await vi.advanceTimersByTimeAsync(20_001);

      const state = useInitStore.getState();
      expect(state.error?.stepId).toBe('fetch-prs');
      expect(state.error?.message).toMatch(/timed out/i);
      expect(state.isComplete).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('completes immediately when there are no enabled repos', async () => {
    renderHook(() =>
      useInitSequence(
        makeSettings({
          repos: [
            {
              owner: 'test',
              name: 'repo',
              enabled: false,
              worktreeBasePath: '',
              worktreeSubfolder: '',
            },
          ],
        }),
        false,
      ),
    );

    await waitFor(() => {
      expect(useInitStore.getState().isComplete).toBe(true);
    });

    expect(mockGetOpenPRs).not.toHaveBeenCalled();
    expect(useInitStore.getState().completedSteps['fetch-checks']).toBe(true);
  });
});
