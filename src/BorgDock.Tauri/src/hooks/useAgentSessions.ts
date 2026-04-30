import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import type { SessionDelta, SessionRecord } from '@/services/agent-overview-types';

export function useAgentSessions(): SessionRecord[] {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    (async () => {
      try {
        const initial = await invoke<SessionRecord[]>('list_agent_sessions');
        if (!cancelled) setSessions(initial);
      } catch (e) {
        console.error('list_agent_sessions failed', e);
      }
      try {
        const fn = await listen<SessionDelta>('agent-sessions-changed', (event) => {
          setSessions((prev) => applyDelta(prev, event.payload));
        });
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      } catch (e) {
        console.error('agent-sessions-changed listener failed', e);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return sessions;
}

function applyDelta(prev: SessionRecord[], delta: SessionDelta): SessionRecord[] {
  if (delta.kind === 'upsert') {
    const i = prev.findIndex((p) => p.sessionId === delta.session.sessionId);
    if (i === -1) return [...prev, delta.session];
    const next = [...prev];
    next[i] = delta.session;
    return next;
  }
  return prev.filter((p) => p.sessionId !== delta.sessionId);
}
