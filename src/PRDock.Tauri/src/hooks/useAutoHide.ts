import { useCallback, useEffect, useRef } from 'react';
import { useUiStore } from '@/stores/ui-store';
import type { AppSettings } from '@/types';

const AUTO_HIDE_DELAY_MS = 3000;
const FOCUS_LOST_DEBOUNCE_MS = 200;

async function hideSidebarShowBadge() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('hide_sidebar');
    await invoke('show_badge', { count: 0 });
  } catch {
    /* ignore */
  }
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
  // Debounced so that transient focus loss during window drag doesn't hide.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let focusLostTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        unlisten = await win.onFocusChanged(async ({ payload: focused }) => {
          if (!focused) {
            // Debounce: wait briefly so a drag-induced focus blip is ignored
            focusLostTimer = setTimeout(async () => {
              focusLostTimer = null;

              // Re-check focus — the window may have regained it during the delay
              const stillUnfocused = !(await win.isFocused());
              if (!stillUnfocused) return;

              // Don't hide if the user minimized — let the taskbar icon restore it
              const minimized = await win.isMinimized();
              if (minimized) return;

              // Don't hide during a window drag operation
              if (useUiStore.getState().isDragging) return;

              setSidebarVisible(false);
              hideSidebarShowBadge();
            }, FOCUS_LOST_DEBOUNCE_MS);
          } else {
            // Focus regained — cancel any pending hide
            if (focusLostTimer) {
              clearTimeout(focusLostTimer);
              focusLostTimer = null;
            }

            // Only hide badge if the sidebar window is actually visible.
            // Without this check, a spurious focus event on the hidden
            // main window would hide the badge while the sidebar stays
            // invisible — leaving the user with nothing on screen.
            const isVisible = await win.isVisible();
            if (isVisible) {
              setSidebarVisible(true);
              try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('hide_badge');
              } catch {
                /* ignore */
              }
            }
          }
        });
      } catch {
        /* ignore in non-Tauri env */
      }
    })();

    return () => {
      unlisten?.();
      if (focusLostTimer) clearTimeout(focusLostTimer);
    };
  }, [setSidebarVisible]);

  return { startHideTimer, clearTimer };
}
