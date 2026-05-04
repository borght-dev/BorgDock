import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import type { InspectorState } from './useInspectorState';

const SNOOZE_MS = 5 * 60 * 1000;

function isInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(inspector: InspectorState): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isInputFocused()) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        inspector.cycleFocus(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'Escape') {
        if (inspector.pinnedSessionId) inspector.unpin();
        else inspector.closeAll();
        return;
      }

      if (!inspector.openSessionId) return;
      const id = inspector.openSessionId;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault(); inspector.togglePin(id); return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void invoke('focus_session_pane', { sessionId: id });
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void invoke('snooze_agent_session', { sessionId: id, durationMs: SNOOZE_MS });
        inspector.closeAll();
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        void invoke('mark_agent_session_seen', { sessionId: id });
        inspector.closeAll();
        return;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [inspector]);
}
