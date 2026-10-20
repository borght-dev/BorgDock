import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diskSpaceFixture } from '@/components/worktree/__fixtures__/disk-space';
import { DISK_POLL_MS } from '@/services/disk-space';
import { useDiskSpaceStore } from '@/stores/disk-space-store';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  send: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@/services/notification', () => ({ sendOsNotification: mocks.send }));

import { useDiskSpace } from '../useDiskSpace';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listen.mockResolvedValue(() => {});
  useDiskSpaceStore.setState({ hosts: [], cleanup: {} });
});

describe('background disk monitor', () => {
  it('warns without a Worktrees screen mounted and routes the cleanup action to its host', async () => {
    const hosts = diskSpaceFixture().map((h) => ({ ...h, id: `monitor-${h.id}` }));
    mocks.invoke.mockResolvedValue(hosts);
    const clean = vi.spyOn(useDiskSpaceStore.getState(), 'clean').mockResolvedValue(undefined);
    renderHook(() => useDiskSpace(true, true));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Disk nearly full on Mac mini',
        severity: 'error',
        actions: [{ label: 'Clean up in T3', action: 'clean-host-disk', url: 'monitor-mini' }],
      }),
    );
    const callback = mocks.listen.mock.calls[0]![1] as (event: unknown) => void;
    await act(async () => callback({ payload: { hostId: 'monitor-mini' } }));
    expect(clean).toHaveBeenCalledWith('monitor-mini');
    clean.mockRestore();
  });
  it('polls every minute, stops on unmount, and does not notify from the tool window', async () => {
    vi.useFakeTimers();
    try {
      mocks.invoke.mockResolvedValue(diskSpaceFixture());
      const { unmount } = renderHook(() => useDiskSpace(true, false));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mocks.invoke).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DISK_POLL_MS);
      });
      expect(mocks.invoke).toHaveBeenCalledTimes(2);
      expect(mocks.send).not.toHaveBeenCalled();
      unmount();
      await vi.advanceTimersByTimeAsync(DISK_POLL_MS);
      expect(mocks.invoke).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
