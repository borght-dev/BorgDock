import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorktreeSnapshot } from '@/types/worktree';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), unlisten: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));

import { useWorktreeSnapshot } from '../useWorktreeSnapshot';

function snapshotOf(...branches: string[]): WorktreeSnapshot {
  return [
    {
      repo: { owner: 'acme', name: 'shop', basePath: '/work/shop' },
      entries: branches.map((branchName, i) => ({
        path: `/work/shop/.worktrees/worktree${i + 1}`,
        branchName,
        isMainWorktree: false,
      })),
      fetchedAt: 0,
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listen.mockResolvedValue(mocks.unlisten);
});

describe('useWorktreeSnapshot', () => {
  it('reads the cache once for every reader in the window, then follows its broadcasts', async () => {
    mocks.invoke.mockResolvedValue(snapshotOf('feature/1'));
    const first = renderHook(() => useWorktreeSnapshot());
    const second = renderHook(() => useWorktreeSnapshot());
    expect(first.result.current).toEqual([]);

    await waitFor(() => expect(first.result.current).toEqual(snapshotOf('feature/1')));
    expect(second.result.current).toBe(first.result.current);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith('worktree_cache_get_all');

    const broadcast = mocks.listen.mock.calls[0]![1] as (event: unknown) => void;
    expect(mocks.listen.mock.calls[0]![0]).toBe('worktrees-updated');
    act(() => broadcast({ payload: snapshotOf('feature/1', 'feature/2') }));
    expect(second.result.current[0]?.entries).toHaveLength(2);

    first.unmount();
    expect(mocks.unlisten).not.toHaveBeenCalled();
    second.unmount();
    await waitFor(() => expect(mocks.unlisten).toHaveBeenCalledTimes(1));
  });

  it('starts empty again after the last reader left, and stays empty without the command', async () => {
    mocks.invoke.mockRejectedValue(new Error('command not found'));
    const { result } = renderHook(() => useWorktreeSnapshot());
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual([]);
  });
});
