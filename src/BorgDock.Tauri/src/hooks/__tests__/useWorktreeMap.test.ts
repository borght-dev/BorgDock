import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@/types';
import type { WorktreeCacheRepo, WorktreeEntry, WorktreeSnapshot } from '@/types/worktree';

const mockInvoke = vi.fn();
const mockListen = vi.fn();
const mockUnlisten = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

import { useUiStore } from '@/stores/ui-store';

// The full ui-store imports tauri plugin-store but we import it directly so
// tests still see the real in-memory store. Keeping the import here for the
// side-effect of registering the store.
void useUiStore;

import { buildWorktreeBranchMap, useWorktreeMap, worktreeMapsEqual } from '../useWorktreeMap';

function makeSettings(repos: AppSettings['repos'] = []): AppSettings {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
    repos,
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
  };
}

function wt(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    path: '/repo/.worktrees/slot1',
    branchName: 'feature-branch',
    isMainWorktree: false,
    ...overrides,
  };
}

function repoSnap(basePath: string, entries: WorktreeEntry[], error?: string): WorktreeCacheRepo {
  return { repo: { owner: 'o', name: 'r', basePath }, entries, fetchedAt: 1, error };
}

const oneRepo = () =>
  makeSettings([
    { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
  ]);

/** Capture the `worktrees-updated` handler so tests can push snapshots. */
let updatedHandler: ((event: { payload: WorktreeSnapshot }) => void) | null = null;

describe('useWorktreeMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatedHandler = null;
    mockListen.mockImplementation((_name: string, cb: typeof updatedHandler) => {
      updatedHandler = cb;
      return Promise.resolve(mockUnlisten);
    });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'worktree_cache_get_all') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
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
    expect(useUiStore.getState().worktreeBranchMap.size).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('reads the cache snapshot on mount and builds the branch map', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'worktree_cache_get_all') {
        return Promise.resolve([
          repoSnap('/repo', [
            wt({ path: '/repo', branchName: 'main', isMainWorktree: true }),
            wt({ path: '/repo/.worktrees/slot1', branchName: 'feature-a' }),
            wt({ path: '/repo/.worktrees/slot2', branchName: 'Feature-B' }),
            wt({ path: '/repo/.worktrees/slot3', branchName: '' }),
          ]),
        ]);
      }
      return Promise.resolve(undefined);
    });

    renderHook(() => useWorktreeMap(oneRepo()));

    await vi.waitFor(() => {
      const map = useUiStore.getState().worktreeBranchMap;
      expect(map.size).toBe(2);
    });
    const map = useUiStore.getState().worktreeBranchMap;
    expect(map.get('feature-a')).toEqual({
      slotName: 'slot1',
      branchName: 'feature-a',
      fullPath: '/repo/.worktrees/slot1',
    });
    // key lowercased, branchName preserved; main + empty-branch skipped
    expect(map.get('feature-b')?.branchName).toBe('Feature-B');
    expect(map.has('main')).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith('worktree_cache_get_all');
    expect(mockInvoke).toHaveBeenCalledWith('worktree_cache_refresh');
    expect(mockInvoke).not.toHaveBeenCalledWith('list_worktrees', expect.anything());
  });

  it('ignores snapshot repos that are not in the enabled settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'worktree_cache_get_all') {
        return Promise.resolve([
          repoSnap('/repo', [wt({ branchName: 'mine' })]),
          repoSnap('/other', [wt({ path: '/other/.worktrees/x', branchName: 'theirs' })]),
        ]);
      }
      return Promise.resolve(undefined);
    });

    renderHook(() => useWorktreeMap(oneRepo()));

    await vi.waitFor(() => {
      expect(useUiStore.getState().worktreeBranchMap.has('mine')).toBe(true);
    });
    expect(useUiStore.getState().worktreeBranchMap.has('theirs')).toBe(false);
  });

  it('subscribes to worktrees-updated and rebuilds the map from the event payload', async () => {
    renderHook(() => useWorktreeMap(oneRepo()));

    await vi.waitFor(() =>
      expect(mockListen).toHaveBeenCalledWith('worktrees-updated', expect.any(Function)),
    );

    act(() => {
      updatedHandler?.({
        payload: [
          repoSnap('/repo', [wt({ path: '/repo/.worktrees/slot9', branchName: 'pushed' })]),
        ],
      });
    });

    expect(useUiStore.getState().worktreeBranchMap.get('pushed')?.slotName).toBe('slot9');
  });

  it('does not write the store when the derived map is unchanged', async () => {
    const snapshot = [repoSnap('/repo', [wt({ branchName: 'feature-a' })])];
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === 'worktree_cache_get_all' ? snapshot : undefined),
    );

    renderHook(() => useWorktreeMap(oneRepo()));
    await vi.waitFor(() => {
      expect(useUiStore.getState().worktreeBranchMap.has('feature-a')).toBe(true);
    });
    const before = useUiStore.getState().worktreeBranchMap;

    act(() => {
      updatedHandler?.({ payload: snapshot });
    });

    // Same keys + same values → same Map instance (no re-render trigger).
    expect(useUiStore.getState().worktreeBranchMap).toBe(before);

    act(() => {
      updatedHandler?.({
        payload: [
          repoSnap('/repo', [wt({ path: '/repo/.worktrees/slot2', branchName: 'feature-a' })]),
        ],
      });
    });
    expect(useUiStore.getState().worktreeBranchMap).not.toBe(before);
    expect(useUiStore.getState().worktreeBranchMap.get('feature-a')?.slotName).toBe('slot2');
  });

  it('never installs a polling timer', () => {
    vi.useFakeTimers();
    renderHook(() => useWorktreeMap(oneRepo()));
    const calls = mockInvoke.mock.calls.length;
    vi.advanceTimersByTime(10 * 60_000);
    expect(mockInvoke.mock.calls.length).toBe(calls);
  });

  it('unlistens on unmount and ignores late snapshots', async () => {
    let resolveGetAll: (v: WorktreeSnapshot) => void = () => {};
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'worktree_cache_get_all') {
        return new Promise<WorktreeSnapshot>((resolve) => {
          resolveGetAll = resolve;
        });
      }
      return Promise.resolve(undefined);
    });

    const { unmount } = renderHook(() => useWorktreeMap(oneRepo()));
    await vi.waitFor(() => expect(mockListen).toHaveBeenCalled());
    unmount();
    await act(async () => {
      resolveGetAll([repoSnap('/repo', [wt({ branchName: 'late' })])]);
    });

    expect(useUiStore.getState().worktreeBranchMap.has('late')).toBe(false);
    await vi.waitFor(() => expect(mockUnlisten).toHaveBeenCalled());
  });

  it('does not re-subscribe when the repos array identity changes but base paths do not', async () => {
    const { rerender } = renderHook(({ s }) => useWorktreeMap(s), {
      initialProps: { s: oneRepo() },
    });
    await vi.waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));

    rerender({ s: oneRepo() }); // new array, same base path
    expect(mockListen).toHaveBeenCalledTimes(1);

    rerender({
      s: makeSettings([
        { owner: 'o', name: 'r', enabled: true, worktreeBasePath: '/repo', worktreeSubfolder: '' },
        {
          owner: 'o2',
          name: 'r2',
          enabled: true,
          worktreeBasePath: '/repo2',
          worktreeSubfolder: '',
        },
      ]),
    });
    await vi.waitFor(() => expect(mockListen).toHaveBeenCalledTimes(2));
  });

  it('handles backslash paths (Windows)', async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === 'worktree_cache_get_all'
          ? [
              repoSnap('C:\\repos\\project', [
                wt({ path: 'C:\\repos\\project\\.worktrees\\slot1', branchName: 'win-branch' }),
              ]),
            ]
          : undefined,
      ),
    );

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
      expect(useUiStore.getState().worktreeBranchMap.get('win-branch')?.slotName).toBe('slot1');
    });
  });
});

describe('buildWorktreeBranchMap / worktreeMapsEqual', () => {
  it('builds only from requested base paths and skips main + branchless', () => {
    const map = buildWorktreeBranchMap(
      [
        repoSnap('/a', [
          wt({ path: '/a', branchName: 'main', isMainWorktree: true }),
          wt({ path: '/a/.worktrees/w1', branchName: 'X' }),
          wt({ path: '/a/.worktrees/w2', branchName: '' }),
        ]),
        repoSnap('/b', [wt({ path: '/b/.worktrees/w1', branchName: 'Y' })]),
      ],
      new Set(['/a']),
    );
    expect([...map.keys()]).toEqual(['x']);
  });

  it('compares by keys and mapping fields', () => {
    const a = new Map([['x', { slotName: 'w1', branchName: 'X', fullPath: '/a/w1' }]]);
    const b = new Map([['x', { slotName: 'w1', branchName: 'X', fullPath: '/a/w1' }]]);
    const c = new Map([['x', { slotName: 'w2', branchName: 'X', fullPath: '/a/w2' }]]);
    expect(worktreeMapsEqual(a, b)).toBe(true);
    expect(worktreeMapsEqual(a, c)).toBe(false);
    expect(worktreeMapsEqual(a, new Map())).toBe(false);
  });
});
