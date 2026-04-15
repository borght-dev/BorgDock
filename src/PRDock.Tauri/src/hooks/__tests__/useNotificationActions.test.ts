import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';

const mockInvoke = vi.fn();
const mockListen = vi.fn();
const mockMergePullRequest = vi.fn();
const mockSubmitReview = vi.fn();
const mockBypassMergePullRequest = vi.fn();
const mockPerformFixWithClaude = vi.fn();
const mockGetClient = vi.fn();
const mockRerunWorkflow = vi.fn();
const mockShow = vi.fn();

let mockPullRequests: PullRequestWithChecks[] = [];

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

vi.mock('@/services/github/mutations', () => ({
  mergePullRequest: (...args: unknown[]) => mockMergePullRequest(...args),
  submitReview: (...args: unknown[]) => mockSubmitReview(...args),
  bypassMergePullRequest: (...args: unknown[]) => mockBypassMergePullRequest(...args),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: () => mockGetClient(),
}));

vi.mock('@/services/claude-launcher', () => ({
  performFixWithClaude: (...args: unknown[]) => mockPerformFixWithClaude(...args),
}));

vi.mock('@/services/github/checks', () => ({
  rerunWorkflow: (...args: unknown[]) => mockRerunWorkflow(...args),
}));

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: {
    getState: () => ({ show: mockShow }),
  },
}));

vi.mock('@/stores/pr-store', () => ({
  usePrStore: {
    getState: () => ({ pullRequests: mockPullRequests }),
  },
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        repos: [],
        claudeCode: { defaultPostFixAction: 'none' },
      },
    }),
  },
}));

import { useNotificationActions } from '../useNotificationActions';

function makePr(number: number, overrides: Record<string, unknown> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      title: 'Test PR',
      headRef: 'feature',
      baseRef: 'main',
      authorLogin: 'testuser',
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
      requestedReviewers: [],
      ...overrides,
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
  };
}

describe('useNotificationActions', () => {
  let capturedListener: ((event: { payload: Record<string, unknown> }) => void) | null = null;
  let mockUnlisten: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedListener = null;
    mockUnlisten = vi.fn();
    mockPullRequests = [];

    mockListen.mockImplementation((_event: string, callback: typeof capturedListener) => {
      capturedListener = callback;
      return Promise.resolve(mockUnlisten);
    });
  });

  it('sets up a listener for notification-action events', async () => {
    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('notification-action', expect.any(Function));
    });
  });

  it('calls unlisten on unmount', async () => {
    const { unmount } = renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalled();
    });

    unmount();

    // Allow the microtask to complete
    await vi.waitFor(() => {
      expect(mockUnlisten).toHaveBeenCalled();
    });
  });

  it('handles "open" action by invoking open_pr_detail_window', async () => {
    mockInvoke.mockResolvedValue(undefined);

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({ payload: { action: 'open', owner: 'test', repo: 'repo', number: 42 } });

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('open_pr_detail_window', {
        owner: 'test',
        repo: 'repo',
        number: 42,
      });
    });
  });

  it('handles "merge" action', async () => {
    const client = { token: 'test' };
    mockGetClient.mockReturnValue(client);
    mockMergePullRequest.mockResolvedValue(undefined);

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({ payload: { action: 'merge', owner: 'test', repo: 'repo', number: 1 } });

    await vi.waitFor(() => {
      expect(mockMergePullRequest).toHaveBeenCalledWith(client, 'test', 'repo', 1, 'squash');
    });

    await vi.waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('merged successfully') }),
      );
    });
  });

  it('shows error when merge fails', async () => {
    mockGetClient.mockReturnValue({ token: 'test' });
    mockMergePullRequest.mockRejectedValue(new Error('merge conflict'));

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({ payload: { action: 'merge', owner: 'test', repo: 'repo', number: 1 } });

    await vi.waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Failed to merge'),
          severity: 'error',
        }),
      );
    });
  });

  it('shows error when client not initialized for merge', async () => {
    mockGetClient.mockReturnValue(null);

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({ payload: { action: 'merge', owner: 'test', repo: 'repo', number: 1 } });

    await vi.waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('not initialized'),
          severity: 'error',
        }),
      );
    });
  });

  it('handles "approve" action', async () => {
    const client = { token: 'test' };
    mockGetClient.mockReturnValue(client);
    mockSubmitReview.mockResolvedValue(undefined);

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({ payload: { action: 'approve', owner: 'test', repo: 'repo', number: 1 } });

    await vi.waitFor(() => {
      expect(mockSubmitReview).toHaveBeenCalledWith(client, 'test', 'repo', 1, 'APPROVE');
    });

    await vi.waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('approved'),
          severity: 'success',
        }),
      );
    });
  });

  it('handles "bypass" action', async () => {
    mockBypassMergePullRequest.mockResolvedValue(undefined);

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({ payload: { action: 'bypass', owner: 'test', repo: 'repo', number: 1 } });

    await vi.waitFor(() => {
      expect(mockBypassMergePullRequest).toHaveBeenCalledWith('test', 'repo', 1);
    });

    await vi.waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('bypass-merged') }),
      );
    });
  });

  it('handles "fix-with-claude" action', async () => {
    const pr = makePr(42);
    mockPullRequests = [pr];
    mockPerformFixWithClaude.mockResolvedValue(undefined);

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({
      payload: { action: 'fix-with-claude', owner: 'test', repo: 'repo', number: 42 },
    });

    await vi.waitFor(() => {
      expect(mockPerformFixWithClaude).toHaveBeenCalledWith(
        'test',
        'repo',
        42,
        'feature',
        expect.anything(),
      );
    });

    await vi.waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('Claude is fixing') }),
      );
    });
  });

  it('uses fallback branch when PR not found for fix-with-claude', async () => {
    mockPullRequests = [];
    mockPerformFixWithClaude.mockResolvedValue(undefined);

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({
      payload: { action: 'fix-with-claude', owner: 'test', repo: 'repo', number: 99 },
    });

    await vi.waitFor(() => {
      expect(mockPerformFixWithClaude).toHaveBeenCalledWith(
        'test',
        'repo',
        99,
        'pr-99',
        expect.anything(),
      );
    });
  });

  it('handles "rerun" action', async () => {
    const pr = makePr(1);
    pr.checks = [
      {
        id: 100,
        name: 'build',
        status: 'completed',
        conclusion: 'failure',
        htmlUrl: '',
        checkSuiteId: 200,
      },
    ];
    mockPullRequests = [pr];
    const client = { token: 'test' };
    mockGetClient.mockReturnValue(client);
    mockRerunWorkflow.mockResolvedValue(undefined);

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({ payload: { action: 'rerun', owner: 'test', repo: 'repo', number: 1 } });

    await vi.waitFor(() => {
      expect(mockRerunWorkflow).toHaveBeenCalledWith(client, 'test', 'repo', 200);
    });

    await vi.waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('Re-running checks') }),
      );
    });
  });

  it('shows error when PR not found for rerun', async () => {
    mockPullRequests = [];

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({ payload: { action: 'rerun', owner: 'test', repo: 'repo', number: 999 } });

    await vi.waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('not found'), severity: 'error' }),
      );
    });
  });

  it('shows error when no failed checks to rerun', async () => {
    const pr = makePr(1);
    pr.checks = [
      {
        id: 100,
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        htmlUrl: '',
        checkSuiteId: 200,
      },
    ];
    mockPullRequests = [pr];

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({ payload: { action: 'rerun', owner: 'test', repo: 'repo', number: 1 } });

    await vi.waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('No failed checks'),
          severity: 'error',
        }),
      );
    });
  });

  it('ignores unknown actions', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    capturedListener!({
      payload: { action: 'unknown-action', owner: 'test', repo: 'repo', number: 1 },
    });

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith('Unknown notification action:', 'unknown-action');
    });

    warnSpy.mockRestore();
  });

  it('ignores payload with missing fields', async () => {
    renderHook(() => useNotificationActions());

    await vi.waitFor(() => {
      expect(capturedListener).not.toBeNull();
    });

    // Missing owner/repo/number
    capturedListener!({ payload: { action: 'open', owner: '', repo: '', number: 0 } });

    // Should not call invoke since fields are falsy
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
