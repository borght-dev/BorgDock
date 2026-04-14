import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PullRequest, PullRequestWithChecks } from '@/types';

// --- Mocks ---

const mockEmitTo = vi.fn().mockResolvedValue(undefined);
const mockListen = vi.fn().mockResolvedValue(vi.fn());
const mockInvoke = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
  emitTo: (...args: unknown[]) => mockEmitTo(...args),
  listen: (...args: unknown[]) => mockListen(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Store mocks — we control their state directly
const mockPrStoreState = {
  pullRequests: [] as PullRequestWithChecks[],
  username: 'testuser',
  lastPollTime: null as Date | null,
};

const mockSettingsStoreState = {
  settings: {
    ui: { theme: 'dark', globalHotkey: 'Ctrl+Win+Shift+G' },
  },
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

vi.mock('@/stores/ui-store', () => ({
  useUiStore: Object.assign(
    (selector: (s: typeof mockUiStoreState) => unknown) => selector(mockUiStoreState),
    { getState: () => mockUiStoreState },
  ),
}));

// useClaudeActions pulls a lot of unrelated modules in — stub it.
vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn().mockResolvedValue(undefined),
    monitorPr: vi.fn().mockResolvedValue(undefined),
  }),
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

function findFlyoutPayload(): Record<string, unknown> | undefined {
  const call = mockEmitTo.mock.calls.find(
    (c) => c[0] === 'flyout' && c[1] === 'flyout-update',
  );
  return call?.[2];
}

// --- Tests ---

describe('useBadgeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrStoreState.pullRequests = [];
    mockPrStoreState.username = 'testuser';
    mockPrStoreState.lastPollTime = null;
    mockSettingsStoreState.settings.ui.theme = 'dark';
    mockSettingsStoreState.settings.ui.globalHotkey = 'Ctrl+Win+Shift+G';
    mockListen.mockResolvedValue(vi.fn());
    mockInvoke.mockResolvedValue(undefined);
  });

  describe('tray icon + flyout payload', () => {
    it('updates tray icon with the PR count', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1 }, 'green'),
        makePrWithChecks({ number: 2 }, 'red'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('update_tray_icon', {
          count: 2,
          worstState: 'failing',
        });
      });
    });

    it('derives worstState=idle for an empty list', async () => {
      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('update_tray_icon', {
          count: 0,
          worstState: 'idle',
        });
      });
    });

    it('derives worstState=pending when only yellow PRs exist', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1 }, 'yellow'),
        makePrWithChecks({ number: 2 }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('update_tray_icon', {
          count: 2,
          worstState: 'pending',
        });
      });
    });

    it('derives worstState=passing when only green PRs exist', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1 }, 'green'),
        makePrWithChecks({ number: 2 }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('update_tray_icon', {
          count: 2,
          worstState: 'passing',
        });
      });
    });

    it('updates the tray tooltip with counts', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1 }, 'red'),
        makePrWithChecks({ number: 2 }, 'yellow'),
        makePrWithChecks({ number: 3 }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('update_tray_tooltip', {
          tooltip: 'PRDock — 3 open PRs · 1 failing · 1 pending',
        });
      });
    });

    it('caches the flyout payload via cache_flyout_data', async () => {
      mockPrStoreState.pullRequests = [makePrWithChecks({ number: 1 }, 'green')];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const call = mockInvoke.mock.calls.find((c) => c[0] === 'cache_flyout_data');
        expect(call).toBeDefined();
        const payload = JSON.parse(call![1]!.payload as string);
        expect(payload.totalCount).toBe(1);
      });
    });

    it('emits flyout-update to the flyout window', async () => {
      mockPrStoreState.pullRequests = [makePrWithChecks({ number: 1 }, 'green')];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const payload = findFlyoutPayload();
        expect(payload).toBeDefined();
        expect((payload as { totalCount: number }).totalCount).toBe(1);
      });
    });

    it('clamps the tray icon count at 255', async () => {
      mockPrStoreState.pullRequests = Array.from({ length: 300 }, (_, i) =>
        makePrWithChecks({ number: i + 1 }, 'green'),
      );

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('update_tray_icon', {
          count: 255,
          worstState: 'passing',
        });
      });
    });
  });

  describe('flyout PR item formatting', () => {
    it('sends per-PR fields in the flyout payload', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks(
          { number: 99, title: 'Fix critical bug', repoOwner: 'myorg', repoName: 'myrepo' },
          'red',
          3,
          1,
        ),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const payload = findFlyoutPayload() as
          | { pullRequests: Array<Record<string, unknown>> }
          | undefined;
        expect(payload).toBeDefined();
        const pr = payload!.pullRequests[0]!;
        expect(pr.number).toBe(99);
        expect(pr.title).toBe('Fix critical bug');
        expect(pr.repoOwner).toBe('myorg');
        expect(pr.repoName).toBe('myrepo');
        expect(pr.overallStatus).toBe('red');
        expect(pr.totalChecks).toBe(3);
        expect(pr.passedCount).toBe(1);
      });
    });

    it('marks PRs by current user as isMine=true (case-insensitive)', async () => {
      mockPrStoreState.username = 'testuser';
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, authorLogin: 'TestUser' }, 'green'),
        makePrWithChecks({ number: 2, authorLogin: 'other' }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const payload = findFlyoutPayload() as
          | { pullRequests: Array<{ number: number; isMine: boolean }> }
          | undefined;
        expect(payload).toBeDefined();
        const map = new Map(payload!.pullRequests.map((p) => [p.number, p.isMine]));
        expect(map.get(1)).toBe(true);
        expect(map.get(2)).toBe(false);
      });
    });

    it('marks every PR as isMine=false when username is empty', async () => {
      mockPrStoreState.username = '';
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1, authorLogin: 'someone' }, 'green'),
        makePrWithChecks({ number: 2, authorLogin: 'other' }, 'red'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const payload = findFlyoutPayload() as
          | { pullRequests: Array<{ isMine: boolean }> }
          | undefined;
        expect(payload).toBeDefined();
        expect(payload!.pullRequests.every((p) => p.isMine === false)).toBe(true);
      });
    });

    it('includes failing / pending / passing aggregate counts', async () => {
      mockPrStoreState.pullRequests = [
        makePrWithChecks({ number: 1 }, 'red'),
        makePrWithChecks({ number: 2 }, 'red'),
        makePrWithChecks({ number: 3 }, 'yellow'),
        makePrWithChecks({ number: 4 }, 'green'),
      ];

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const payload = findFlyoutPayload() as
          | { failingCount: number; pendingCount: number; passingCount: number; totalCount: number }
          | undefined;
        expect(payload).toBeDefined();
        expect(payload!.failingCount).toBe(2);
        expect(payload!.pendingCount).toBe(1);
        expect(payload!.passingCount).toBe(1);
        expect(payload!.totalCount).toBe(4);
      });
    });

    it('includes theme and hotkey in the payload', async () => {
      mockSettingsStoreState.settings.ui.theme = 'light';
      mockSettingsStoreState.settings.ui.globalHotkey = 'Alt+Space';

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const payload = findFlyoutPayload() as
          | { theme: string; hotkey: string }
          | undefined;
        expect(payload).toBeDefined();
        expect(payload!.theme).toBe('light');
        expect(payload!.hotkey).toBe('Alt+Space');
      });
    });

    it('falls back to a default hotkey when none is configured', async () => {
      mockSettingsStoreState.settings.ui.globalHotkey = '';

      renderHook(() => useBadgeSync());

      await vi.waitFor(() => {
        const payload = findFlyoutPayload() as { hotkey: string } | undefined;
        expect(payload).toBeDefined();
        expect(payload!.hotkey).toBe('Ctrl+Win+Shift+G');
      });
    });
  });

  describe('error handling', () => {
    it('does not throw when emitTo fails', () => {
      mockEmitTo.mockRejectedValueOnce(new Error('emit failed'));
      expect(() => renderHook(() => useBadgeSync())).not.toThrow();
    });

    it('does not throw when listen fails', () => {
      mockListen.mockRejectedValue(new Error('listen failed'));
      expect(() => renderHook(() => useBadgeSync())).not.toThrow();
    });

    it('does not throw when invoke fails', () => {
      mockInvoke.mockRejectedValue(new Error('invoke failed'));
      expect(() => renderHook(() => useBadgeSync())).not.toThrow();
    });
  });
});
