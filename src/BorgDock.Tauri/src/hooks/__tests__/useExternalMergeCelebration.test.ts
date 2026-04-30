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
    // PR is already merged at app start — present in closed list, NOT in open list.
    const alreadyMerged = makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' });
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [alreadyMerged],
    });
    renderHook(() => useExternalMergeCelebration());
    // Hook seeds prevOpenIds from pullRequests (empty). The merged PR is in the
    // closed list but was never seen as open this session.

    // A subsequent poll arrives — same closed list, with a NEW object reference so
    // the reference-equality short-circuit doesn't hide the loop's behavior.
    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' }),
        ],
      });
    });

    // The PR was never in prevOpenIds, so the cold-start guard correctly suppresses
    // celebration even after a tick.
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

    // First poll cycle: PR appears in closed list with mergedAt — celebration fires.
    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' }),
        ],
      });
    });
    expect(mockCelebrate).toHaveBeenCalledTimes(1);

    // Second poll cycle: same PR still in closed list, BUT a NEW object reference
    // (so the hook's reference-equality short-circuit lets the loop run).
    // celebrateMerge() in the real flow would have called markCelebrated, so simulate
    // that by flipping the wasRecentlyCelebrated mock to true. The hook should then
    // skip the duplicate.
    mockWasRecent.mockReturnValue(true);
    act(() => {
      usePrStore.setState({
        pullRequests: [],
        closedPullRequests: [
          makePr({ state: 'closed', mergedAt: '2026-04-30T10:00:00Z' }),
        ],
      });
    });

    expect(mockCelebrate).toHaveBeenCalledTimes(1);
  });
});
