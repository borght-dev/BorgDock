import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { type T3Session, useT3SessionStore } from '@/stores/t3-session-store';

export function useT3Sessions(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const sessions = await invoke<T3Session[]>('t3_list_sessions');
        if (!cancelled) useT3SessionStore.getState().setSessions(sessions);
      } catch {
        if (!cancelled) useT3SessionStore.getState().setSessions([]);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 15_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled]);
}
