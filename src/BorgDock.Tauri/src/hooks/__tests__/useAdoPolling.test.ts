import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, WorkItem } from '@/types';

// --- Mock ADO services ---

const mockGetCurrentUserDisplayName = vi.fn();
const mockGetQueryTree = vi.fn();
const mockExecuteQuery = vi.fn();

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn().mockImplementation((org: string, project: string, pat: string) => ({
    org,
    project,
    pat,
    isConfigured: true,
  })),
}));

vi.mock('@/services/ado/workitems', () => ({
  getCurrentUserDisplayName: (...args: unknown[]) => mockGetCurrentUserDisplayName(...args),
}));

vi.mock('@/services/ado/queries', () => ({
  getQueryTree: (...args: unknown[]) => mockGetQueryTree(...args),
  executeQuery: (...args: unknown[]) => mockExecuteQuery(...args),
}));

import { useWorkItemsStore } from '@/stores/work-items-store';
import { useAdoPolling } from '../useAdoPolling';

function makeSettings(overrides: Partial<AppSettings['azureDevOps']> = {}): AppSettings {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
    repos: [],
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
      organization: 'test-org',
      project: 'test-project',
      personalAccessToken: 'test-pat',
      authMethod: 'pat' as const,
      authAutoDetected: true,
      pollIntervalSeconds: 120,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      ...overrides,
    },
    sql: { connections: [] },
    repoPriority: {},
  };
}

function makeWorkItem(id: number, title: string = 'Work Item'): WorkItem {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/org/project/_apis/wit/workitems/${id}`,
    fields: {
      'System.Title': title,
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
    },
    relations: [],
    htmlUrl: '',
  };
}

describe('useAdoPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset work items store
    useWorkItemsStore.setState({
      queryTree: [],
      selectedQueryId: null,
      favoriteQueryIds: [],
      workItems: [],
      trackedWorkItemIds: new Set(),
      workingOnWorkItemIds: new Set(),
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      currentUserDisplayName: '',
      isLoading: false,
    });

    // Default mock behaviors
    mockGetCurrentUserDisplayName.mockResolvedValue('Test User');
    mockGetQueryTree.mockResolvedValue([]);
    mockExecuteQuery.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns refreshNow function', () => {
    const { result } = renderHook(() => useAdoPolling(makeSettings()));
    expect(typeof result.current.refreshNow).toBe('function');
  });

  it('does nothing when ADO is not configured (no org)', () => {
    const settings = makeSettings({ organization: '', personalAccessToken: 'pat' });

    renderHook(() => useAdoPolling(settings));

    expect(mockGetCurrentUserDisplayName).not.toHaveBeenCalled();
    expect(mockGetQueryTree).not.toHaveBeenCalled();
  });

  it('does nothing when ADO is not configured (no PAT)', () => {
    const settings = makeSettings({ organization: 'org', personalAccessToken: undefined });

    renderHook(() => useAdoPolling(settings));

    expect(mockGetCurrentUserDisplayName).not.toHaveBeenCalled();
  });

  it('resolves current user display name on mount', async () => {
    mockGetCurrentUserDisplayName.mockResolvedValue('John Doe');

    renderHook(() => useAdoPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(mockGetCurrentUserDisplayName).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      expect(useWorkItemsStore.getState().currentUserDisplayName).toBe('John Doe');
    });
  });

  it('handles user display name failure gracefully', async () => {
    mockGetCurrentUserDisplayName.mockRejectedValue(new Error('auth error'));

    renderHook(() => useAdoPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(mockGetCurrentUserDisplayName).toHaveBeenCalled();
    });

    // Should not crash, name stays empty
    expect(useWorkItemsStore.getState().currentUserDisplayName).toBe('');
  });

  it('loads query tree on mount', async () => {
    const queries = [
      {
        id: 'q1',
        name: 'My Bugs',
        path: 'Shared Queries/My Bugs',
        isFolder: false,
        children: [],
      },
    ];
    mockGetQueryTree.mockResolvedValue(queries);

    renderHook(() => useAdoPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(mockGetQueryTree).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      const tree = useWorkItemsStore.getState().queryTree;
      expect(tree).toHaveLength(1);
    });
  });

  it('handles query tree fetch failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetQueryTree.mockRejectedValue(new Error('query tree error'));

    renderHook(() => useAdoPolling(makeSettings()));

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load ADO query tree:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('restores favorite query IDs from settings', async () => {
    mockGetQueryTree.mockResolvedValue([]);
    const settings = makeSettings({ favoriteQueryIds: ['q1', 'q2'] });

    renderHook(() => useAdoPolling(settings));

    await vi.waitFor(() => {
      const favs = useWorkItemsStore.getState().favoriteQueryIds;
      expect(favs).toContain('q1');
      expect(favs).toContain('q2');
    });
  });

  it('restores tracked work item IDs from settings', async () => {
    const settings = makeSettings({ trackedWorkItemIds: [101, 202] });

    renderHook(() => useAdoPolling(settings));

    await vi.waitFor(() => {
      const tracked = useWorkItemsStore.getState().trackedWorkItemIds;
      expect(tracked.has(101)).toBe(true);
      expect(tracked.has(202)).toBe(true);
    });
  });

  it('restores workingOn work item IDs from settings', async () => {
    const settings = makeSettings({ workingOnWorkItemIds: [301, 402] });

    renderHook(() => useAdoPolling(settings));

    await vi.waitFor(() => {
      const workingOn = useWorkItemsStore.getState().workingOnWorkItemIds;
      expect(workingOn.has(301)).toBe(true);
      expect(workingOn.has(402)).toBe(true);
    });
  });

  it('restores worktree paths from settings', async () => {
    const settings = makeSettings({
      workItemWorktreePaths: { 100: '/path/to/worktree', 200: '/another/path' },
    });

    renderHook(() => useAdoPolling(settings));

    await vi.waitFor(() => {
      const paths = useWorkItemsStore.getState().workItemWorktreePaths;
      expect(paths[100]).toBe('/path/to/worktree');
      expect(paths[200]).toBe('/another/path');
    });
  });

  it('restores recent work item IDs from settings', async () => {
    const settings = makeSettings({ recentWorkItemIds: [10, 20, 30] });

    renderHook(() => useAdoPolling(settings));

    await vi.waitFor(() => {
      const recent = useWorkItemsStore.getState().recentWorkItemIds;
      expect(recent).toEqual([10, 20, 30]);
    });
  });

  it('auto-selects last selected query from settings', async () => {
    const settings = makeSettings({ lastSelectedQueryId: 'q-saved' });

    renderHook(() => useAdoPolling(settings));

    await vi.waitFor(() => {
      expect(useWorkItemsStore.getState().selectedQueryId).toBe('q-saved');
    });
  });

  it('executes query when selectedQueryId changes', async () => {
    const items = [makeWorkItem(1, 'Bug 1'), makeWorkItem(2, 'Bug 2')];
    mockExecuteQuery.mockResolvedValue(items);

    renderHook(() => useAdoPolling(makeSettings()));

    // Simulate selecting a query
    act(() => {
      useWorkItemsStore.getState().selectQuery('q-new');
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalledWith(expect.anything(), 'q-new');
    });

    await vi.waitFor(() => {
      expect(useWorkItemsStore.getState().workItems).toEqual(items);
    });
  });

  it('sets isLoading during query execution', async () => {
    let resolveQuery: (v: WorkItem[]) => void;
    mockExecuteQuery.mockImplementation(
      () =>
        new Promise<WorkItem[]>((resolve) => {
          resolveQuery = resolve;
        }),
    );

    renderHook(() => useAdoPolling(makeSettings()));

    act(() => {
      useWorkItemsStore.getState().selectQuery('q-loading');
    });

    await vi.waitFor(() => {
      expect(useWorkItemsStore.getState().isLoading).toBe(true);
    });

    await act(async () => {
      resolveQuery!([makeWorkItem(1)]);
    });

    await vi.waitFor(() => {
      expect(useWorkItemsStore.getState().isLoading).toBe(false);
    });
  });

  it('handles query execution failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExecuteQuery.mockRejectedValue(new Error('query failed'));

    renderHook(() => useAdoPolling(makeSettings()));

    act(() => {
      useWorkItemsStore.getState().selectQuery('q-fail');
    });

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to execute ADO query:', expect.any(Error));
    });

    await vi.waitFor(() => {
      expect(useWorkItemsStore.getState().isLoading).toBe(false);
    });

    consoleSpy.mockRestore();
  });

  it('polls at configured interval', async () => {
    const settings = makeSettings({ pollIntervalSeconds: 10 });
    mockExecuteQuery.mockResolvedValue([]);

    renderHook(() => useAdoPolling(settings));

    // Select a query so polling has something to execute
    act(() => {
      useWorkItemsStore.getState().selectQuery('q-poll');
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalled();
    });

    const callsBeforeInterval = mockExecuteQuery.mock.calls.length;

    // Advance by poll interval (10 seconds)
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery.mock.calls.length).toBeGreaterThan(callsBeforeInterval);
    });
  });

  it('uses default 120 second interval when not specified', async () => {
    const settings = makeSettings({ pollIntervalSeconds: 0 });
    mockExecuteQuery.mockResolvedValue([]);

    renderHook(() => useAdoPolling(settings));

    act(() => {
      useWorkItemsStore.getState().selectQuery('q-default');
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalled();
    });

    const callsAfterInit = mockExecuteQuery.mock.calls.length;

    // Advance 60 seconds — should NOT trigger (default is 120s)
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    // No new calls
    expect(mockExecuteQuery.mock.calls.length).toBe(callsAfterInit);

    // Advance to 120 seconds total
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery.mock.calls.length).toBeGreaterThan(callsAfterInit);
    });
  });

  it('clears interval on unmount', async () => {
    mockExecuteQuery.mockResolvedValue([]);

    const { unmount } = renderHook(() => useAdoPolling(makeSettings()));

    act(() => {
      useWorkItemsStore.getState().selectQuery('q-unmount');
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalled();
    });

    const callsAtUnmount = mockExecuteQuery.mock.calls.length;
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(300_000);
    });

    expect(mockExecuteQuery.mock.calls.length).toBe(callsAtUnmount);
  });

  it('does not poll when no query is selected', async () => {
    mockExecuteQuery.mockResolvedValue([]);

    renderHook(() => useAdoPolling(makeSettings({ pollIntervalSeconds: 10 })));

    // Don't select any query

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // executeQuery should not be called since no query is selected
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it('handles polling error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExecuteQuery.mockRejectedValue(new Error('poll error'));

    renderHook(() => useAdoPolling(makeSettings({ pollIntervalSeconds: 10 })));

    act(() => {
      useWorkItemsStore.getState().selectQuery('q-err');
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalled();
    });

    // Advance to next poll
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('ADO polling error:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('refreshNow executes query and sets loading state', async () => {
    const items = [makeWorkItem(1, 'Refreshed Item')];
    mockExecuteQuery.mockResolvedValue(items);

    const { result } = renderHook(() => useAdoPolling(makeSettings()));

    // Select a query first
    act(() => {
      useWorkItemsStore.getState().selectQuery('q-refresh');
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalled();
    });

    // Manual refresh
    await act(async () => {
      await result.current.refreshNow();
    });

    expect(useWorkItemsStore.getState().isLoading).toBe(false);
    expect(useWorkItemsStore.getState().workItems).toEqual(items);
  });

  it('refreshNow does nothing when no query selected', async () => {
    const { result } = renderHook(() => useAdoPolling(makeSettings()));

    await act(async () => {
      await result.current.refreshNow();
    });

    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it('refreshNow handles errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExecuteQuery.mockRejectedValue(new Error('refresh error'));

    const { result } = renderHook(() => useAdoPolling(makeSettings()));

    act(() => {
      useWorkItemsStore.getState().selectQuery('q-fail');
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalled();
    });

    mockExecuteQuery.mockRejectedValue(new Error('refresh error'));

    await act(async () => {
      await result.current.refreshNow();
    });

    expect(useWorkItemsStore.getState().isLoading).toBe(false);

    consoleSpy.mockRestore();
  });

  it('unsubscribes from store on unmount', async () => {
    const { unmount } = renderHook(() => useAdoPolling(makeSettings()));

    unmount();

    // Changing selectedQueryId after unmount should not trigger a query
    act(() => {
      useWorkItemsStore.getState().selectQuery('q-after-unmount');
    });

    // Advance timers to flush any pending async work
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it('maps query tree with favorite flags', async () => {
    const queries = [
      {
        id: 'q1',
        name: 'Bugs',
        path: 'Shared/Bugs',
        isFolder: false,
        children: [
          {
            id: 'q1-child',
            name: 'Active Bugs',
            path: 'Shared/Bugs/Active',
            isFolder: false,
            children: [],
          },
        ],
      },
    ];
    mockGetQueryTree.mockResolvedValue(queries);

    const settings = makeSettings({ favoriteQueryIds: ['q1-child'] });

    renderHook(() => useAdoPolling(settings));

    await vi.waitFor(() => {
      const tree = useWorkItemsStore.getState().queryTree;
      expect(tree).toHaveLength(1);
    });
  });

  it('does not re-select query if same ID', async () => {
    mockExecuteQuery.mockResolvedValue([]);

    renderHook(() => useAdoPolling(makeSettings()));

    act(() => {
      useWorkItemsStore.getState().selectQuery('q1');
    });

    await vi.waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
    });

    // Trigger subscription again with same ID — should not re-execute
    act(() => {
      useWorkItemsStore.getState().selectQuery('q1');
    });

    // Advance timers to flush any pending work
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
  });
});
