import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AppSettings } from '@/types';

const mockInvoke = vi.fn();
const mockSetSidebarVisible = vi.fn();
let mockIsDragging = false;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onFocusChanged: vi.fn().mockResolvedValue(vi.fn()),
    isFocused: vi.fn().mockResolvedValue(false),
    isMinimized: vi.fn().mockResolvedValue(false),
    isVisible: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('@/stores/ui-store', () => ({
  useUiStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ setSidebarVisible: mockSetSidebarVisible }),
    {
      getState: () => ({ isDragging: mockIsDragging }),
    },
  ),
}));

import { useAutoHide } from '../useAutoHide';

function makeSettings(sidebarMode: 'pinned' | 'floating' = 'floating'): AppSettings {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
    repos: [],
    ui: {
      sidebarEdge: 'right',
      sidebarMode,
      sidebarWidthPx: 800,
      theme: 'system',
      globalHotkey: '',
      editorCommand: 'code',
      runAtStartup: false,
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
      organization: '',
      project: '',
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

describe('useAutoHide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockIsDragging = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns startHideTimer and clearTimer functions', () => {
    const { result } = renderHook(() => useAutoHide(makeSettings()));
    expect(typeof result.current.startHideTimer).toBe('function');
    expect(typeof result.current.clearTimer).toBe('function');
  });

  it('does not set up mouse listeners in pinned mode', () => {
    const addSpy = vi.spyOn(document.documentElement, 'addEventListener');
    renderHook(() => useAutoHide(makeSettings('pinned')));
    expect(addSpy).not.toHaveBeenCalledWith('mouseenter', expect.any(Function));
    expect(addSpy).not.toHaveBeenCalledWith('mouseleave', expect.any(Function));
    addSpy.mockRestore();
  });

  it('sets up mouse listeners in floating mode', () => {
    const addSpy = vi.spyOn(document.documentElement, 'addEventListener');
    renderHook(() => useAutoHide(makeSettings('floating')));
    expect(addSpy).toHaveBeenCalledWith('mouseenter', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
    addSpy.mockRestore();
  });

  it('removes mouse listeners on unmount', () => {
    const removeSpy = vi.spyOn(document.documentElement, 'removeEventListener');
    const { unmount } = renderHook(() => useAutoHide(makeSettings('floating')));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('mouseenter', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('hides sidebar after mouse leave delay in floating mode', async () => {
    mockInvoke.mockResolvedValue(undefined);
    renderHook(() => useAutoHide(makeSettings('floating')));

    // Simulate mouseleave
    act(() => {
      document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    });

    // Before delay
    expect(mockSetSidebarVisible).not.toHaveBeenCalled();

    // After 3 second delay
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockSetSidebarVisible).toHaveBeenCalledWith(false);
  });

  it('cancels hide timer when mouse enters', () => {
    renderHook(() => useAutoHide(makeSettings('floating')));

    // Start hide
    act(() => {
      document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    });

    // Mouse enters before timeout
    act(() => {
      vi.advanceTimersByTime(1000);
      document.documentElement.dispatchEvent(new MouseEvent('mouseenter'));
    });

    // Advance past original timeout
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockSetSidebarVisible).not.toHaveBeenCalled();
  });

  it('startHideTimer does nothing in pinned mode', () => {
    const { result } = renderHook(() => useAutoHide(makeSettings('pinned')));

    act(() => {
      result.current.startHideTimer();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockSetSidebarVisible).not.toHaveBeenCalled();
  });

  it('startHideTimer hides sidebar after delay in floating mode', () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoHide(makeSettings('floating')));

    act(() => {
      result.current.startHideTimer();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockSetSidebarVisible).toHaveBeenCalledWith(false);
  });

  it('clearTimer prevents pending hide', () => {
    const { result } = renderHook(() => useAutoHide(makeSettings('floating')));

    act(() => {
      result.current.startHideTimer();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
      result.current.clearTimer();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockSetSidebarVisible).not.toHaveBeenCalled();
  });

  it('does not hide when mouse is hovering', () => {
    renderHook(() => useAutoHide(makeSettings('floating')));

    // Enter first
    act(() => {
      document.documentElement.dispatchEvent(new MouseEvent('mouseenter'));
    });

    // Then start hide timer manually (should be blocked by hover state)
    // The hook uses isHoveredRef internally, so calling startHideTimer
    // directly would still check it

    // Leave then enter before timeout
    act(() => {
      document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
      document.documentElement.dispatchEvent(new MouseEvent('mouseenter'));
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockSetSidebarVisible).not.toHaveBeenCalled();
  });
});
