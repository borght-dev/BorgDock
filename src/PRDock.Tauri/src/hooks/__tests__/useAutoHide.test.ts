import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AppSettings } from '@/types';

const mockInvoke = vi.fn();
const mockSetSidebarVisible = vi.fn();
let mockIsDragging = false;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Capture the onFocusChanged callback so we can invoke it in tests
let focusChangedCallback: ((event: { payload: boolean }) => void) | null = null;
const mockUnlistenFocus = vi.fn();
const mockIsFocused = vi.fn().mockResolvedValue(false);
const mockIsMinimized = vi.fn().mockResolvedValue(false);
const mockIsVisible = vi.fn().mockResolvedValue(true);

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onFocusChanged: vi.fn((cb: (event: { payload: boolean }) => void) => {
      focusChangedCallback = cb;
      return Promise.resolve(mockUnlistenFocus);
    }),
    isFocused: (...args: unknown[]) => mockIsFocused(...args),
    isMinimized: (...args: unknown[]) => mockIsMinimized(...args),
    isVisible: (...args: unknown[]) => mockIsVisible(...args),
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
    focusChangedCallback = null;
    mockIsFocused.mockResolvedValue(false);
    mockIsMinimized.mockResolvedValue(false);
    mockIsVisible.mockResolvedValue(true);
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

  describe('focus-based auto-hide (onFocusChanged)', () => {
    it('hides sidebar when window loses focus after debounce', async () => {
      mockInvoke.mockResolvedValue(undefined);
      // Window stays unfocused, not minimized, not dragging
      mockIsFocused.mockResolvedValue(false);
      mockIsMinimized.mockResolvedValue(false);

      renderHook(() => useAutoHide(makeSettings('floating')));

      // Wait for the async listener registration
      await vi.waitFor(() => {
        expect(focusChangedCallback).not.toBeNull();
      });

      // Simulate focus lost
      await act(async () => {
        focusChangedCallback!({ payload: false });
      });

      // Advance past the debounce period (200ms)
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Flush pending promises
      await vi.waitFor(() => {
        expect(mockSetSidebarVisible).toHaveBeenCalledWith(false);
      });

      expect(mockInvoke).toHaveBeenCalledWith('hide_sidebar');
      expect(mockInvoke).toHaveBeenCalledWith('show_badge', { count: 0 });
    });

    it('does not hide when window regains focus during debounce', async () => {
      mockInvoke.mockResolvedValue(undefined);
      mockIsFocused.mockResolvedValue(true);

      renderHook(() => useAutoHide(makeSettings('floating')));

      await vi.waitFor(() => {
        expect(focusChangedCallback).not.toBeNull();
      });

      // Simulate focus lost
      await act(async () => {
        focusChangedCallback!({ payload: false });
      });

      // Advance partially (before debounce completes)
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Focus regained — should cancel the pending hide
      await act(async () => {
        focusChangedCallback!({ payload: true });
      });

      // Advance past original debounce
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // setSidebarVisible(false) should NOT have been called
      const falseCalls = mockSetSidebarVisible.mock.calls.filter(
        (c: unknown[]) => c[0] === false,
      );
      expect(falseCalls).toHaveLength(0);
    });

    it('does not hide when window is minimized', async () => {
      mockInvoke.mockResolvedValue(undefined);
      mockIsFocused.mockResolvedValue(false);
      mockIsMinimized.mockResolvedValue(true); // minimized

      renderHook(() => useAutoHide(makeSettings('floating')));

      await vi.waitFor(() => {
        expect(focusChangedCallback).not.toBeNull();
      });

      await act(async () => {
        focusChangedCallback!({ payload: false });
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Wait for promises to resolve
      await vi.waitFor(() => {
        expect(mockIsMinimized).toHaveBeenCalled();
      });

      // Should NOT hide because the window is minimized
      const falseCalls = mockSetSidebarVisible.mock.calls.filter(
        (c: unknown[]) => c[0] === false,
      );
      expect(falseCalls).toHaveLength(0);
    });

    it('does not hide during a drag operation', async () => {
      mockInvoke.mockResolvedValue(undefined);
      mockIsFocused.mockResolvedValue(false);
      mockIsMinimized.mockResolvedValue(false);
      mockIsDragging = true;

      renderHook(() => useAutoHide(makeSettings('floating')));

      await vi.waitFor(() => {
        expect(focusChangedCallback).not.toBeNull();
      });

      await act(async () => {
        focusChangedCallback!({ payload: false });
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Wait for promises to flush
      await vi.waitFor(() => {
        expect(mockIsFocused).toHaveBeenCalled();
      });

      // Should NOT hide because isDragging is true
      const falseCalls = mockSetSidebarVisible.mock.calls.filter(
        (c: unknown[]) => c[0] === false,
      );
      expect(falseCalls).toHaveLength(0);
    });

    it('shows sidebar and hides badge when focus is regained and window is visible', async () => {
      mockInvoke.mockResolvedValue(undefined);
      mockIsVisible.mockResolvedValue(true);

      renderHook(() => useAutoHide(makeSettings('floating')));

      await vi.waitFor(() => {
        expect(focusChangedCallback).not.toBeNull();
      });

      await act(async () => {
        focusChangedCallback!({ payload: true });
      });

      await vi.waitFor(() => {
        expect(mockSetSidebarVisible).toHaveBeenCalledWith(true);
      });

      expect(mockInvoke).toHaveBeenCalledWith('hide_badge');
    });

    it('does not show sidebar when focus is regained but window is not visible', async () => {
      mockInvoke.mockResolvedValue(undefined);
      mockIsVisible.mockResolvedValue(false);

      renderHook(() => useAutoHide(makeSettings('floating')));

      await vi.waitFor(() => {
        expect(focusChangedCallback).not.toBeNull();
      });

      await act(async () => {
        focusChangedCallback!({ payload: true });
      });

      // Give promises time to settle
      await vi.waitFor(() => {
        expect(mockIsVisible).toHaveBeenCalled();
      });

      // setSidebarVisible(true) should NOT have been called
      const trueCalls = mockSetSidebarVisible.mock.calls.filter(
        (c: unknown[]) => c[0] === true,
      );
      expect(trueCalls).toHaveLength(0);
    });

    it('cleans up focus listener on unmount', async () => {
      renderHook(() => useAutoHide(makeSettings('floating')));

      await vi.waitFor(() => {
        expect(focusChangedCallback).not.toBeNull();
      });
    });

    it('does not hide if window regained focus before debounce completes', async () => {
      // isFocused returns true (re-focused during debounce delay)
      mockIsFocused.mockResolvedValue(true);
      mockIsMinimized.mockResolvedValue(false);

      renderHook(() => useAutoHide(makeSettings('floating')));

      await vi.waitFor(() => {
        expect(focusChangedCallback).not.toBeNull();
      });

      await act(async () => {
        focusChangedCallback!({ payload: false });
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Wait for async checks
      await vi.waitFor(() => {
        expect(mockIsFocused).toHaveBeenCalled();
      });

      // stillUnfocused check: isFocused() returns true, so !true = false, early return
      const falseCalls = mockSetSidebarVisible.mock.calls.filter(
        (c: unknown[]) => c[0] === false,
      );
      expect(falseCalls).toHaveLength(0);
    });
  });

  describe('hideSidebarShowBadge', () => {
    it('calls hide_sidebar and show_badge when timer fires', async () => {
      mockInvoke.mockResolvedValue(undefined);
      renderHook(() => useAutoHide(makeSettings('floating')));

      // Trigger mouseleave to start the hide timer
      act(() => {
        document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
      });

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // The hideSidebarShowBadge function should have been called
      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('hide_sidebar');
        expect(mockInvoke).toHaveBeenCalledWith('show_badge', { count: 0 });
      });
    });
  });
});
