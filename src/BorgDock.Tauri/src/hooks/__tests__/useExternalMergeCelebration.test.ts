import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';

const mockCelebrate = vi.fn();
const mockWasRecent = vi.fn().mockReturnValue(false);

vi.mock('@/services/merge-celebration', () => ({
  celebrateMerge: (...args: unknown[]) => mockCelebrate(...args),
  wasRecentlyCelebrated: (...args: unknown[]) => mockWasRecent(...args),
}));

const mockSettings = {
  notifications: {
    onlyMyPRs: false,
    playMergeSound: true,
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
  },
};
const mockGitHub = { username: 'alice' };

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({ settings: { notifications: mockSettings.notifications, gitHub: mockGitHub } }),
  },
}));

import { usePrStore } from '@/stores/pr-store';
import { useExternalMergeCelebration } from '../useExternalMergeCelebration';

function makePr(overrides: Partial<PullRequest> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 42,
      title: 'A PR',
      headRef: 'feat',
      baseRef: 'main',
      authorLogin: 'alice',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
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
    },
    checks: [],
    overallStatus: 'gray',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
  };
}

beforeEach(() => {
  mockCelebrate.mockClear();
  mockWasRecent.mockClear().mockReturnValue(false);
  mockSettings.notifications.onlyMyPRs = false;
  mockGitHub.username = 'alice';
  // Reset pr-store to a clean state.
  usePrStore.setState({ pullRequests: [], closedPullRequests: [] });
});

afterEach(() => {
  usePrStore.setState({ pullRequests: [], closedPullRequests: [] });
});

describe('useExternalMergeCelebration', () => {
  it('does not celebrate on cold start even if closed list contains merged PRs', () => {
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' })],
    });
    renderHook(() => useExternalMergeCelebration());
    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('celebrates when an open PR transitions to merged in the closed list', () => {
    const open = makePr();
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' }),
        ],
      });
    });

    expect(mockCelebrate).toHaveBeenCalledTimes(1);
    expect(mockCelebrate).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo' }),
    );
  });

  it('does not celebrate when an open PR transitions to closed without merge', () => {
    const open = makePr();
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', closedAt: '2026-04-30T10:00:00Z' }),
        ],
      });
    });

    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('skips celebration when wasRecentlyCelebrated returns true (local dedup)', () => {
    const open = makePr();
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    mockWasRecent.mockReturnValue(true);
    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' }),
        ],
      });
    });

    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('respects onlyMyPRs=true (skips PRs not authored by current user)', () => {
    mockSettings.notifications.onlyMyPRs = true;
    const open = makePr({ authorLogin: 'bob' });
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z', authorLogin: 'bob' }),
        ],
      });
    });

    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('respects onlyMyPRs=true (fires for PRs authored by current user)', () => {
    mockSettings.notifications.onlyMyPRs = true;
    const open = makePr({ authorLogin: 'alice' });
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z', authorLogin: 'alice' }),
        ],
      });
    });

    expect(mockCelebrate).toHaveBeenCalledTimes(1);
  });

  it('does not double-fire across multiple poll cycles for the same PR', () => {
    const open = makePr();
    usePrStore.setState({ pullRequests: [open], closedPullRequests: [] });
    renderHook(() => useExternalMergeCelebration());

    const merged = makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' });
    act(() => {
      usePrStore.setState({ pullRequests: [], closedPullRequests: [merged] });
    });
    // Simulate next poll — same closed list, same content.
    act(() => {
      usePrStore.setState({ pullRequests: [], closedPullRequests: [merged] });
    });

    expect(mockCelebrate).toHaveBeenCalledTimes(1);
  });
});
