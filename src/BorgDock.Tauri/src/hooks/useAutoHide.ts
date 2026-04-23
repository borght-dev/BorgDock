import { useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@/services/logger';
import { useUiStore } from '@/stores/ui-store';
import type { AppSettings } from '@/types';

const log = createLogger('autoHide');
const AUTO_HIDE_DELAY_MS = 3000;
const FOCUS_LOST_DEBOUNCE_MS = 200;

async function hideSidebar() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    log.debug('invoke hide_sidebar');
    await invoke('hide_sidebar');
    log.debug('hide_sidebar done');
  } catch (err) {
    log.error('hideSidebar failed', err);
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
    log.debug('auto-hide timer scheduled', { delayMs: AUTO_HIDE_DELAY_MS });
    timerRef.current = setTimeout(() => {
      if (!isHoveredRef.current) {
        log.info('auto-hide timer fired — hiding sidebar');
        setSidebarVisible(false);
        hideSidebar();
      } else {
        log.debug('auto-hide timer fired but hovered — keeping sidebar');
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

  // Hide sidebar when window loses focus (click outside)
  // Skip when minimized so the taskbar icon can still restore the window.
  // Debounced so that transient focus loss during window drag doesn't hide.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let focusLostTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        const fn = await win.onFocusChanged(async ({ payload: focused }) => {
          log.debug('onFocusChanged', { focused });
          if (!focused) {
            // Debounce: wait briefly so a drag-induced focus blip is ignored
            focusLostTimer = setTimeout(async () => {
              focusLostTimer = null;

              // Re-check focus — the window may have regained it during the delay
              const stillUnfocused = !(await win.isFocused());
              if (!stillUnfocused) {
                log.debug('focus regained during debounce — keeping sidebar');
                return;
              }

              // Don't hide if the user minimized — let the taskbar icon restore it
              const minimized = await win.isMinimized();
              if (minimized) {
                log.debug('window minimized — skipping auto-hide');
                return;
              }

              // Don't hide during a window drag operation
              if (useUiStore.getState().isDragging) {
                log.debug('drag in progress — skipping auto-hide');
                return;
              }

              log.info('focus lost — hiding sidebar');
              setSidebarVisible(false);
              hideSidebar();
            }, FOCUS_LOST_DEBOUNCE_MS);
          } else {
            // Focus regained — cancel any pending hide
            if (focusLostTimer) {
              clearTimeout(focusLostTimer);
              focusLostTimer = null;
            }

            const isVisible = await win.isVisible();
            if (isVisible) {
              log.info('focus gained — showing sidebar');
              setSidebarVisible(true);
            } else {
              log.debug('focus gained but sidebar not visible — ignoring');
            }
          }
        });
        if (cancelled) {
          fn(); // cleanup immediately if already unmounted
          return;
        }
        unlisten = fn;
        log.debug('onFocusChanged listener registered');
      } catch (err) {
        log.warn('auto-hide focus handler setup failed (likely non-Tauri env)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
      if (focusLostTimer) clearTimeout(focusLostTimer);
    };
  }, [setSidebarVisible]);

  return { startHideTimer, clearTimer };
}
