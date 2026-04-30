import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorktreeChangeCounts } from '../use-worktree-change-counts';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

afterEach(() => {
  invokeMock.mockReset();
});

describe('useWorktreeChangeCounts', () => {
  it('fans out one git_changed_files call per visible root on mount', async () => {
    invokeMock.mockResolvedValue({
      local: [{ path: 'a', status: 'M', additions: 2, deletions: 1 }],
      vsBase: [],
      baseRef: 'main',
      inRepo: true,
    });
    const { result } = renderHook(() =>
      useWorktreeChangeCounts(['/a', '/b'], 0),
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenCalledWith('git_changed_files', { root: '/a' });
    expect(invokeMock).toHaveBeenCalledWith('git_changed_files', { root: '/b' });
    await waitFor(() => {
      expect(result.current.counts.get('/a')).toEqual({ count: 1, addTotal: 2, delTotal: 1 });
    });
  });

  it('refreshes only the active root when refresh(path) is called', async () => {
    invokeMock.mockResolvedValue({ local: [], vsBase: [], baseRef: 'main', inRepo: true });
    const { result } = renderHook(() => useWorktreeChangeCounts(['/a', '/b'], 0));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    invokeMock.mockClear();
    act(() => result.current.refreshOne('/a'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith('git_changed_files', { root: '/a' });
  });

  it('skips non-git repos silently (no badge)', async () => {
    invokeMock.mockResolvedValue({ local: [], vsBase: [], baseRef: '', inRepo: false });
    const { result } = renderHook(() => useWorktreeChangeCounts(['/x'], 0));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.counts.has('/x')).toBe(false));
  });

  it('re-sweeps when refreshTick changes', async () => {
    invokeMock.mockResolvedValue({ local: [], vsBase: [], baseRef: 'main', inRepo: true });
    const { rerender } = renderHook(
      ({ tick }: { tick: number }) => useWorktreeChangeCounts(['/a'], tick),
      { initialProps: { tick: 0 } },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    invokeMock.mockClear();
    rerender({ tick: 1 });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
  });
});
