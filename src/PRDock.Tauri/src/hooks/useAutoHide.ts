import { useEffect, useRef, useCallback } from 'react';
import type { AppSettings } from '@/types';
import { useUiStore } from '@/stores/ui-store';

const AUTO_HIDE_DELAY_MS = 3000;

async function hideSidebarShowBadge() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('hide_sidebar');
    await invoke('show_badge', { count: 0 });
  } catch { /* ignore */ }
}

export function useAutoHide(settings: AppSettings) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(false);
  const setSidebarVisible = useUiStore((s) => s.setSidebarVisible);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    if (settings.ui.sidebarMode !== 'floating') return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (!isHoveredRef.current) {
        setSidebarVisible(false);
        hideSidebarShowBadge();
      }
    }, AUTO_HIDE_DELAY_MS);
  }, [settings.ui.sidebarMode, clearTimer, setSidebarVisible]);

  // Auto-hide on mouse leave (floating mode only)
  useEffect(() => {
    if (settings.ui.sidebarMode !== 'floating') return;

    const handleMouseEnter = () => {
      isHoveredRef.current = true;
      clearTimer();
    };

    const handleMouseLeave = () => {
      isHoveredRef.current = false;
      startHideTimer();
    };

    document.documentElement.addEventListener('mouseenter', handleMouseEnter);
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      clearTimer();
      document.documentElement.removeEventListener('mouseenter', handleMouseEnter);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [settings.ui.sidebarMode, clearTimer, startHideTimer]);

  // Hide sidebar + show badge when window loses focus (click outside)
  // Skip when minimized so the taskbar icon can still restore the window.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        unlisten = await win.onFocusChanged(async ({ payload: focused }) => {
          if (!focused) {
            // Don't hide if the user minimized — let the taskbar icon restore it
            const minimized = await win.isMinimized();
            if (minimized) return;

            // Don't hide during a window drag operation
            const { useUiStore } = await import('@/stores/ui-store');
            if (useUiStore.getState().isDragging) return;

            setSidebarVisible(false);
            hideSidebarShowBadge();
          } else {
            // Sidebar regained focus (e.g. taskbar click) — hide badge
            setSidebarVisible(true);
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              await invoke('hide_badge');
            } catch { /* ignore */ }
          }
        });
      } catch { /* ignore in non-Tauri env */ }
    })();

    return () => unlisten?.();
  }, [setSidebarVisible]);

  return { startHideTimer, clearTimer };
}
