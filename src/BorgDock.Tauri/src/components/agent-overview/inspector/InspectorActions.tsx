import { invoke } from '@tauri-apps/api/core';
import type { SessionRecord } from '@/services/agent-overview-types';
import { sendOsNotification } from '@/services/notification';
import { useInspector } from '../InspectorContext';

const SNOOZE_MS = 5 * 60 * 1000;

export function InspectorActions({ session }: { session: SessionRecord }) {
  const inspector = useInspector();

  async function focus() {
    try {
      const ok = await invoke<boolean>('focus_session_pane', { sessionId: session.sessionId });
      if (!ok) {
        void sendOsNotification({
          title: 'No terminal window',
          body: "Couldn't find a terminal window for this session.",
          severity: 'info',
        }).catch(() => {});
      }
    } catch (e) {
      void sendOsNotification({
        title: 'Focus pane failed',
        body: String(e),
        severity: 'warning',
      }).catch(() => {});
    }
  }

  async function snooze() {
    await invoke('snooze_agent_session', { sessionId: session.sessionId, durationMs: SNOOZE_MS });
    inspector.closeAll();
  }

  async function markSeen() {
    await invoke('mark_agent_session_seen', { sessionId: session.sessionId });
    inspector.closeAll();
  }

  return (
    <footer className="inspector-actions">
      <button type="button" onClick={focus}>Focus pane <kbd>F</kbd></button>
      <button type="button" onClick={snooze}>Snooze 5m <kbd>S</kbd></button>
      <button type="button" onClick={markSeen}>Mark seen <kbd>M</kbd></button>
    </footer>
  );
}
