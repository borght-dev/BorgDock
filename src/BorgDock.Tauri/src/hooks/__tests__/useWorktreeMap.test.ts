import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@/types';
import type { WorktreeInfo } from '@/types/worktree';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { useUiStore } from '@/stores/ui-store';

// The full ui-store imports tauri plugin-store but we import it directly so
// tests still see the real in-memory store. Keeping the import here for the
// side-effect of registering the store.
void useUiStore;

import { useWorktreeMap } from '../useWorktreeMap';

function makeSettings(repos: AppSettings['repos'] = []): AppSettings {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
    repos,
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
  };
}

function makeWorktreeInfo(overrides: Partial<WorktreeInfo> = {}): WorktreeInfo {
  return {
    path: '/repo/.worktrees/slot1',
    branchName: 'feature-branch',
    isMainWorktree: false,
    status: 'clean',
    uncommittedCount: 0,
    ahead: 0,
    behind: 0,
    commitSha: 'abc123',
    ...overrides,
  };
}

describe('useWorktreeMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset the worktree map in the store
    useUiStore.getState().setWorktreeBranchMap(new Map());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets empty map when no repos are enabled with worktreeBasePath', () => {
    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: false, worktreeBasePath: '/path', worktreeSubfolder: '' },
    ]);

    renderHook(() => useWorktreeMap(settings));

    const map = useUiStore.getState().worktreeBranchMap;
    expect(map.size).toBe(0);
  });

  it('sets empty map when repos have no worktreeBasePath', () => {
    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
    ]);

    renderHook(() => useWorktreeMap(settings));

    const map = useUiStore.getState().worktreeBranchMap;
    expect(map.size).toBe(0);
  });

  it('fetches worktrees and sets the branch map', async () => {
    mockInvoke.mockResolvedValue([
      makeWorktreeInfo({ path: '/repo/.worktrees/slot1', branchName: 'feature-a' }),
      makeWorktreeInfo({ path: '/repo/.worktrees/slot2', branchName: 'feature-b' }),
    ]);

    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
    ]);

    renderHook(() => useWorktreeMap(settings));

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('list_worktrees', { basePath: '/repo' });
    });

    await vi.waitFor(() => {
      const map = useUiStore.getState().worktreeBranchMap;
      expect(map.size).toBe(2);
      expect(map.get('feature-a')).toEqual({
        slotName: 'slot1',
        branchName: 'feature-a',
        fullPath: '/repo/.worktrees/slot1',
      });
      expect(map.get('feature-b')).toEqual({
        slotName: 'slot2',
        branchName: 'feature-b',
        fullPath: '/repo/.worktrees/slot2',
      });
    });
  });

  it('skips main worktrees', async () => {
    mockInvoke.mockResolvedValue([
      makeWorktreeInfo({ path: '/repo', branchName: 'main', isMainWorktree: true }),
      makeWorktreeInfo({
        path: '/repo/.worktrees/slot1',
        branchName: 'feature-a',
        isMainWorktree: false,
      }),
    ]);

    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
    ]);

    renderHook(() => useWorktreeMap(settings));

    await vi.waitFor(() => {
      const map = useUiStore.getState().worktreeBranchMap;
      expect(map.size).toBe(1);
      expect(map.has('main')).toBe(false);
      expect(map.has('feature-a')).toBe(true);
    });
  });

  it('skips worktrees without branchName', async () => {
    mockInvoke.mockResolvedValue([
      makeWorktreeInfo({ path: '/repo/.worktrees/slot1', branchName: '' }),
      makeWorktreeInfo({ path: '/repo/.worktrees/slot2', branchName: 'feature-a' }),
    ]);

    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
    ]);

    renderHook(() => useWorktreeMap(settings));

    await vi.waitFor(() => {
      const map = useUiStore.getState().worktreeBranchMap;
      expect(map.size).toBe(1);
      expect(map.has('feature-a')).toBe(true);
    });
  });

  it('lowercases the branch name key in the map', async () => {
    mockInvoke.mockResolvedValue([
      makeWorktreeInfo({ path: '/repo/.worktrees/slot1', branchName: 'Feature-Branch' }),
    ]);

    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
    ]);

    renderHook(() => useWorktreeMap(settings));

    await vi.waitFor(() => {
      const map = useUiStore.getState().worktreeBranchMap;
      expect(map.has('feature-branch')).toBe(true);
      expect(map.get('feature-branch')!.branchName).toBe('Feature-Branch');
    });
  });

  it('handles invoke errors gracefully per repo', async () => {
    mockInvoke.mockRejectedValue(new Error('disk error'));

    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
    ]);

    renderHook(() => useWorktreeMap(settings));

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });

    // Should still set an empty map, not crash
    await vi.waitFor(() => {
      const map = useUiStore.getState().worktreeBranchMap;
      expect(map.size).toBe(0);
    });
  });

  it('polls every 30 seconds', async () => {
    mockInvoke.mockResolvedValue([
      makeWorktreeInfo({ path: '/repo/.worktrees/slot1', branchName: 'feature-a' }),
    ]);

    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
    ]);

    renderHook(() => useWorktreeMap(settings));

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    // Advance 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    // Advance another 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(3);
    });
  });

  it('cleans up interval on unmount', async () => {
    mockInvoke.mockResolvedValue([]);

    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
    ]);

    const { unmount } = renderHook(() => useWorktreeMap(settings));

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    // Should not have been called again after unmount
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('does not update map after cancelled (unmount)', async () => {
    let resolveInvoke: (v: WorktreeInfo[]) => void;
    mockInvoke.mockImplementation(
      () =>
        new Promise<WorktreeInfo[]>((resolve) => {
          resolveInvoke = resolve;
        }),
    );

    const settings = makeSettings([
      { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
    ]);

    const { unmount } = renderHook(() => useWorktreeMap(settings));

    // Unmount before invoke resolves
    unmount();

    // Now resolve — should be a no-op because cancelled=true
    await act(async () => {
      resolveInvoke!([
        makeWorktreeInfo({ path: '/repo/.worktrees/slot1', branchName: 'late-branch' }),
      ]);
    });

    // Map should remain empty (the cancelled check prevents updating)
    const map = useUiStore.getState().worktreeBranchMap;
    expect(map.has('late-branch')).toBe(false);
  });

  it('handles multiple repos with worktreeBasePath', async () => {
    mockInvoke
      .mockResolvedValueOnce([
        makeWorktreeInfo({ path: '/repo1/.worktrees/s1', branchName: 'branch-a' }),
      ])
      .mockResolvedValueOnce([
        makeWorktreeInfo({ path: '/repo2/.worktrees/s2', branchName: 'branch-b' }),
      ]);

    const settings = makeSettings([
      { owner: 'o1', name: 'r1', enabled: true, worktreeBasePath: '/repo1', worktreeSubfolder: '' },
      { owner: 'o2', name: 'r2', enabled: true, worktreeBasePath: '/repo2', worktreeSubfolder: '' },
    ]);

    renderHook(() => useWorktreeMap(settings));

    await vi.waitFor(() => {
      const map = useUiStore.getState().worktreeBranchMap;
      expect(map.size).toBe(2);
      expect(map.has('branch-a')).toBe(true);
      expect(map.has('branch-b')).toBe(true);
    });
  });

  it('handles backslash paths (Windows)', async () => {
    mockInvoke.mockResolvedValue([
      makeWorktreeInfo({ path: 'C:\\repos\\project\\.worktrees\\slot1', branchName: 'win-branch' }),
    ]);

    const settings = makeSettings([
      {
        owner: 'o',
        name: 'r',
        enabled: true,
        worktreeBasePath: 'C:\\repos\\project',
        worktreeSubfolder: '',
      },
    ]);

    renderHook(() => useWorktreeMap(settings));

    await vi.waitFor(() => {
      const map = useUiStore.getState().worktreeBranchMap;
      expect(map.get('win-branch')!.slotName).toBe('slot1');
    });
  });
});
