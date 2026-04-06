import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PullRequest, PullRequestWithChecks } from '@/types';

// --- Mocks ---

const mockEmit = vi.fn().mockResolvedValue(undefined);
const mockListen = vi.fn().mockResolvedValue(vi.fn());
const mockInvoke = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
  listen: (...args: unknown[]) => mockListen(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Store mocks — we control their state directly
const mockPrStoreState = {
  pullRequests: [] as PullRequestWithChecks[],
  username: 'testuser',
};

const mockSettingsStoreState = {
  settings: {
    ui: { badgeStyle: 'GlassCapsule', theme: 'dark' },
  },
};

const mockNotificationStoreState = {
  activeNotification: null as unknown,
  notifications: [] as unknown[],
};

const mockSelectPr = vi.fn();
const mockSetSidebarVisible = vi.fn();
const mockUiStoreState = {
  selectPr: mockSelectPr,
  setSidebarVisible: mockSetSidebarVisible,
};

vi.mock('@/stores/pr-store', () => ({
  usePrStore: Object.assign(
    (selector: (s: typeof mockPrStoreState) => unknown) => selector(mockPrStoreState),
    { getState: () => mockPrStoreState },
  ),
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: Object.assign(
    (selector: (s: typeof mockSettingsStoreState) => unknown) =>
      selector(mockSettingsStoreState),
    { getState: () => mockSettingsStoreState },
  ),
}));

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: Object.assign(
    (selector: (s: typeof mockNotificationStoreState) => unknown) =>
      selector(mockNotificationStoreState),
    { getState: () => mockNotificationStoreState },
  ),
}));

vi.mock('@/stores/ui-store', () => ({
  useUiStore: Object.assign(
    (selector: (s: typeof mockUiStoreState) => unknown) => selector(mockUiStoreState),
    { getState: () => mockUiStoreState },
  ),
}));

import { useBadgeSync } from '../useBadgeSync';

// --- Helpers ---

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR',
    headRef: 'feature',
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

function makePrWithChecks(
  overrides: Partial<PullRequest> = {},
  status: 'red' | 'yellow' | 'green' | 'gray' = 'green',
  checksCount = 0,
  passedCount = 0,
): PullRequestWithChecks {
  return {
    pullRequest: makePr(overrides),
    checks: Array.from({ length: checksCount }, () => ({
      id: 1,
      name: 'build',
      status: 'completed',
      conclusion: status === 'green' ? 'success' : 'failure',
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:00:00Z',
      htmlUrl: '',
    })),
    overallStatus: status,
    failedCheckNames: status === 'red' ? ['build'] : [],
    pendingCheckNames: status === 'yellow' ? ['build'] : [],
    passedCount,
    skippedCount: 0,
  };
}

// --- Tests ---

describe('useBadgeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrStoreState.pullRequests = [];
    mockPrStoreState.username = 'testuser';
    mockSettingsStoreState.settings.ui.badgeStyle = 'GlassCapsule';
    mockSettingsStoreState.settings.ui.theme = 'dark';
    mockNotificationStoreState.activeNotification = null;
    mockNotificationStoreState.notifications = [];
    mockListen.mockResolvedValue(vi.fn());
  });

  // NOTE: The listener useEffects (badge-request-data, expand-sidebar,
  // open-pr-detail) use concurrent dynamic `await import()` calls that
  // are affected by a vitest ESM module mock caching issue — only the
  // first concurrent dynamic import resolves to the mock. We therefore
  // test the core payload-building logic thoroughly via the first
  // useEffect (badge-update emission) which works correctly.

  describe('badge-update emission', () => {
    it('emits badge-update on mount with empty PR list', async () => {
      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockEmit).toHaveBeenCalledWith(
          'badge-update',
          expect.objectContaining({
            totalPrCount: 0,
            failingCount: 0,
            pendingCount: 0,
            notificationCount: 0,
            myPrs: [],
            teamPrs: [],
            badgeStyle: 'GlassCapsule',
            theme: 'dark',
          }),
        );
      });
    });

    it('emits badge-update with correct counts for mixed PRs', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, authorLogin: 'testuser' }, 'green'),
        makePrWithChecks({ number: 2, authorLogin: 'testuser' }, 'red'),
        makePrWithChecks({ number: 3, authorLogin: 'other' }, 'yellow'),
        makePrWithChecks({ number: 4, authorLogin: 'other' }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockEmit).toHaveBeenCalledWith(
          'badge-update',
          expect.objectContaining({
            totalPrCount: 4,
            failingCount: 1,
            pendingCount: 1,
            myPrs: expect.arrayContaining([
              expect.objectContaining({ number: 1 }),
              expect.objectContaining({ number: 2 }),
            ]),
            teamPrs: expect.arrayContaining([
              expect.objectContaining({ number: 3 }),
              expect.objectContaining({ number: 4 }),
            ]),
          }),
        );
      });
    });

    it('separates my PRs from team PRs case-insensitively', async () => {
      mockPrStoreState.username = 'testuser';
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, authorLogin: 'TestUser' }, 'green'),
        makePrWithChecks({ number: 2, authorLogin: 'TESTUSER' }, 'green'),
        makePrWithChecks({ number: 3, authorLogin: 'other' }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        expect(call).toBeDefined();
        const payload = call![1];
        expect(payload.myPrs).toHaveLength(2);
        expect(payload.teamPrs).toHaveLength(1);
      });
    });

    it('treats all PRs as team when username is empty', async () => {
      mockPrStoreState.username = '';
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, authorLogin: 'someone' }, 'green'),
        makePrWithChecks({ number: 2, authorLogin: 'other' }, 'red'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        expect(call).toBeDefined();
        const payload = call![1];
        expect(payload.myPrs).toHaveLength(0);
        expect(payload.teamPrs).toHaveLength(2);
      });
    });

    it('includes badgeStyle and theme in payload', async () => {
      mockSettingsStoreState.settings.ui.badgeStyle = 'MinimalNotch';
      mockSettingsStoreState.settings.ui.theme = 'light';

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockEmit).toHaveBeenCalledWith(
          'badge-update',
          expect.objectContaining({
            badgeStyle: 'MinimalNotch',
            theme: 'light',
          }),
        );
      });
    });

    it('includes notification count from queued + active', async () => {
      mockNotificationStoreState.activeNotification = { title: 'active' };
      mockNotificationStoreState.notifications = [{ title: 'queued1' }, { title: 'queued2' }];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockEmit).toHaveBeenCalledWith(
          'badge-update',
          expect.objectContaining({
            notificationCount: 3, // 2 queued + 1 active
          }),
        );
      });
    });

    it('notification count is 0 when no notifications', async () => {
      mockNotificationStoreState.activeNotification = null;
      mockNotificationStoreState.notifications = [];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockEmit).toHaveBeenCalledWith(
          'badge-update',
          expect.objectContaining({ notificationCount: 0 }),
        );
      });
    });
  });

  describe('badge PR item formatting', () => {
    it('includes checksText as passed/total when checks exist', async () => {
      mockPrStoreState.pullRequests = [makePrWithChecks({ number: 1 }, 'green', 3, 2)];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        expect(call).toBeDefined();
        const payload = call![1];
        const allPrs = [...payload.myPrs, ...payload.teamPrs];
        expect(allPrs[0].checksText).toBe('2/3');
      });
    });

    it('sets checksText to undefined when no checks', async () => {
      mockPrStoreState.pullRequests = [makePrWithChecks({ number: 1 }, 'green', 0, 0)];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        expect(call).toBeDefined();
        const payload = call![1];
        const allPrs = [...payload.myPrs, ...payload.teamPrs];
        expect(allPrs[0].checksText).toBeUndefined();
      });
    });

    it('sets isInProgress true for yellow status', async () => {
      mockPrStoreState.pullRequests = [makePrWithChecks({ number: 1 }, 'yellow')];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        expect(allPrs[0].isInProgress).toBe(true);
      });
    });

    it('sets isInProgress false for non-yellow status', async () => {
      mockPrStoreState.pullRequests = [makePrWithChecks({ number: 1 }, 'green')];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        expect(allPrs[0].isInProgress).toBe(false);
      });
    });

    it('maps statusColor correctly for all status values', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, authorLogin: 'a' }, 'red'),
        makePrWithChecks({ number: 2, authorLogin: 'b' }, 'yellow'),
        makePrWithChecks({ number: 3, authorLogin: 'c' }, 'green'),
        makePrWithChecks({ number: 4, authorLogin: 'd' }, 'gray'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        const colorsByNumber = new Map(
          allPrs.map((p: { number: number; statusColor: string }) => [p.number, p.statusColor]),
        );
        expect(colorsByNumber.get(1)).toBe('red');
        expect(colorsByNumber.get(2)).toBe('yellow');
        expect(colorsByNumber.get(3)).toBe('green');
        expect(colorsByNumber.get(4)).toBe('green'); // gray maps to green
      });
    });

    it('includes repoOwner and repoName in badge items', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, repoOwner: 'myorg', repoName: 'myrepo' }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        expect(allPrs[0].repoOwner).toBe('myorg');
        expect(allPrs[0].repoName).toBe('myrepo');
      });
    });

    it('formats timeAgo as "just now" for < 60 seconds', async () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, updatedAt: '2024-06-15T11:59:30Z' }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        expect(allPrs[0].timeAgo).toBe('just now');
      });
    });

    it('formats timeAgo as minutes', async () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, updatedAt: '2024-06-15T11:45:00Z' }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        expect(allPrs[0].timeAgo).toBe('15m ago');
      });
    });

    it('formats timeAgo as hours', async () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, updatedAt: '2024-06-15T09:00:00Z' }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        expect(allPrs[0].timeAgo).toBe('3h ago');
      });
    });

    it('formats timeAgo as days', async () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, updatedAt: '2024-06-13T12:00:00Z' }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        expect(allPrs[0].timeAgo).toBe('2d ago');
      });
    });

    it('includes PR title in badge items', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, title: 'Fix critical bug' }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        expect(allPrs[0].title).toBe('Fix critical bug');
      });
    });

    it('includes PR number in badge items', async () => {
      mockPrStoreState.pullRequests = [makePrWithChecks({ number: 99 }, 'green')];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockEmit.mock.calls.find((c) => c[0] === 'badge-update');
        const allPrs = [...call![1].myPrs, ...call![1].teamPrs];
        expect(allPrs[0].number).toBe(99);
      });
    });
  });

  describe('error handling', () => {
    it('does not throw when emit fails', () => {
      mockEmit.mockRejectedValueOnce(new Error('emit failed'));
      expect(() => renderHook(() => useBadgeSync())).not.toThrow();
    });

    it('does not throw when listen fails', () => {
      mockListen.mockRejectedValue(new Error('listen failed'));
      expect(() => renderHook(() => useBadgeSync())).not.toThrow();
    });
  });
});
