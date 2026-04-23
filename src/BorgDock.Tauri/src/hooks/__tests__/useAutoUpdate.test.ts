import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@/types';

const mockInvoke = vi.fn();
const mockListen = vi.fn();
const mockGetVersion = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => mockGetVersion(),
}));

// Use real zustand stores but reset them between tests
import { useUpdateStore } from '@/stores/update-store';

const mockNotificationShow = vi.fn();
vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: {
    getState: () => ({ show: mockNotificationShow }),
  },
}));

import { useAutoUpdate } from '../useAutoUpdate';

function makeSettings(
  overrides: Partial<{ autoCheckEnabled: boolean; autoDownload: boolean }> = {},
): AppSettings {
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
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 30,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: { model: 'claude-sonnet-4-20250514', maxTokens: 4096 },
    claudeReview: { botUsername: '' },
    updates: {
      autoCheckEnabled: overrides.autoCheckEnabled ?? true,
      autoDownload: overrides.autoDownload ?? false,
    },
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

describe('useAutoUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useUpdateStore.getState().reset();
    mockGetVersion.mockResolvedValue('1.0.0');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads current version on mount', async () => {
    renderHook(() => useAutoUpdate(makeSettings()));

    // Wait for the async import to resolve
    await vi.waitFor(() => {
      expect(useUpdateStore.getState().currentVersion).toBe('1.0.0');
    });
  });

  it('sets fallback version when getVersion fails', async () => {
    mockGetVersion.mockRejectedValue(new Error('not in tauri'));

    renderHook(() => useAutoUpdate(makeSettings()));

    await vi.waitFor(() => {
      expect(useUpdateStore.getState().currentVersion).toBe('0.1.0');
    });
  });

  it('returns checkForUpdate and downloadAndInstall functions', () => {
    const { result } = renderHook(() => useAutoUpdate(makeSettings()));
    expect(typeof result.current.checkForUpdate).toBe('function');
    expect(typeof result.current.downloadAndInstall).toBe('function');
  });

  it('checks for updates after initial delay when autoCheckEnabled', async () => {
    mockInvoke.mockResolvedValue(null);
    const settings = makeSettings({ autoCheckEnabled: true });

    renderHook(() => useAutoUpdate(settings));

    // Before delay, no check
    expect(mockInvoke).not.toHaveBeenCalledWith('check_for_update');

    // Advance past initial delay
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('check_for_update');
    });
  });

  it('does not check when autoCheckEnabled is false', async () => {
    const settings = makeSettings({ autoCheckEnabled: false });

    renderHook(() => useAutoUpdate(settings));

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    expect(mockInvoke).not.toHaveBeenCalledWith('check_for_update');
  });

  it('sets update available when update found', async () => {
    mockInvoke.mockResolvedValue({ version: '2.0.0', body: 'New features' });

    const { result } = renderHook(() => useAutoUpdate(makeSettings()));

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(useUpdateStore.getState().available).toBe(true);
    expect(useUpdateStore.getState().version).toBe('2.0.0');
    expect(mockNotificationShow).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('2.0.0') }),
    );
  });

  it('sets status text when no update available', async () => {
    mockInvoke.mockResolvedValue(null);

    const { result } = renderHook(() => useAutoUpdate(makeSettings()));

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(useUpdateStore.getState().statusText).toBe("You're on the latest version");
  });

  it('handles check failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInvoke.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useAutoUpdate(makeSettings()));

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(useUpdateStore.getState().statusText).toBe('Update check failed');
    expect(useUpdateStore.getState().checking).toBe(false);
    consoleSpy.mockRestore();
  });

  it('does not double-check when already checking', async () => {
    useUpdateStore.getState().setChecking(true);
    mockInvoke.mockResolvedValue(null);

    const { result } = renderHook(() => useAutoUpdate(makeSettings()));

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith('check_for_update');
  });

  it('does not check when downloading', async () => {
    useUpdateStore.getState().setDownloading(true);
    mockInvoke.mockResolvedValue(null);

    const { result } = renderHook(() => useAutoUpdate(makeSettings()));

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith('check_for_update');
  });

  it('auto-downloads when autoDownload is enabled and update available', async () => {
    mockInvoke
      .mockResolvedValueOnce({ version: '2.0.0', body: null }) // check_for_update
      .mockResolvedValueOnce(undefined); // download_and_install_update

    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValue(mockUnlisten);

    const settings = makeSettings({ autoDownload: true });
    const { result } = renderHook(() => useAutoUpdate(settings));

    await act(async () => {
      await result.current.checkForUpdate();
    });

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('download_and_install_update');
    });
  });

  it('downloadAndInstall tracks progress', async () => {
    let progressCallback: ((event: { payload: Record<string, unknown> }) => void) | null = null;
    const mockUnlisten = vi.fn();

    mockListen.mockImplementation((_event: string, cb: typeof progressCallback) => {
      progressCallback = cb;
      return Promise.resolve(mockUnlisten);
    });
    mockInvoke.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAutoUpdate(makeSettings()));

    const downloadPromise = act(async () => {
      await result.current.downloadAndInstall();
    });

    // Simulate progress events
    await vi.waitFor(() => {
      expect(progressCallback).not.toBeNull();
    });

    act(() => {
      progressCallback!({
        payload: { event: 'Progress', data: { contentLength: 1000, chunkLength: 500 } },
      });
    });

    expect(useUpdateStore.getState().progress).toBe(50);

    act(() => {
      progressCallback!({ payload: { event: 'Finished' } });
    });

    expect(useUpdateStore.getState().progress).toBe(100);
    expect(useUpdateStore.getState().downloading).toBe(false);

    await downloadPromise;
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it('handles download failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockListen.mockResolvedValue(vi.fn());
    mockInvoke.mockRejectedValue(new Error('download failed'));

    const { result } = renderHook(() => useAutoUpdate(makeSettings()));

    await act(async () => {
      await result.current.downloadAndInstall();
    });

    expect(useUpdateStore.getState().downloading).toBe(false);
    expect(useUpdateStore.getState().statusText).toBe('Download failed');
    consoleSpy.mockRestore();
  });

  it('clears interval on unmount', async () => {
    mockInvoke.mockResolvedValue(null);
    const settings = makeSettings({ autoCheckEnabled: true });

    const { unmount } = renderHook(() => useAutoUpdate(settings));

    unmount();

    // Advancing timers after unmount should not cause check
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    // check_for_update should not be called since we unmounted before the delay
    expect(mockInvoke).not.toHaveBeenCalledWith('check_for_update');
  });

  it('clears interval when autoCheckEnabled changes to false', async () => {
    mockInvoke.mockResolvedValue(null);

    const { rerender } = renderHook(({ settings }) => useAutoUpdate(settings), {
      initialProps: { settings: makeSettings({ autoCheckEnabled: true }) },
    });

    rerender({ settings: makeSettings({ autoCheckEnabled: false }) });

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    expect(mockInvoke).not.toHaveBeenCalledWith('check_for_update');
  });
});
