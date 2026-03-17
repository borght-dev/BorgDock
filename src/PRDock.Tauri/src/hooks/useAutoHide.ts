import { useEffect, useRef, useCallback } from 'react';
import type { AppSettings } from '@/types';
import { useUiStore } from '@/stores/ui-store';

const AUTO_HIDE_DELAY_MS = 3000;

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
        // Show badge
        (async () => {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('show_badge', { count: 0 });
          } catch { /* ignore */ }
        })();
      }
    }, AUTO_HIDE_DELAY_MS);
  }, [settings.ui.sidebarMode, clearTimer, setSidebarVisible]);

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

  return { startHideTimer, clearTimer };
}
