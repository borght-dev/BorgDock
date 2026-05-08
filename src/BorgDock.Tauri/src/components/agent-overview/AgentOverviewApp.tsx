import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAgentSessions } from '@/hooks/useAgentSessions';
import { useInspectorState } from '@/hooks/useInspectorState';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { isArchived, isSnoozed, pickDensity } from '@/services/agent-overview';
import { ActivityGrouped } from './ActivityGrouped';
import { AwaitingRail } from './AwaitingRail';
import { ContextGrouped } from './ContextGrouped';
import { IdleRail } from './IdleRail';
import { InspectorContext } from './InspectorContext';
import { InspectorPopover } from './inspector/InspectorPopover';
import { RepoGrouped } from './RepoGrouped';
import { Statusbar } from './Statusbar';
import { StatusGrouped } from './StatusGrouped';
import { type Grouping, Titlebar } from './Titlebar';
import { WorktreeFlat } from './WorktreeFlat';
import './agent-overview.css';

export function AgentOverviewApp() {
  // Reveal the (invisible-built) window once React has painted.
  const revealedRef = useRef(false);
  useEffect(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    requestAnimationFrame(() => {
      void invoke('window_ready').catch(() => {});
    });
  }, []);

  // Sync `.dark` class with the main window's theme. The synchronous bootstrap
  // in agent-overview.html applies the right class on open; this keeps it live
  // when the user toggles theme elsewhere or when the OS preference flips.
  useEffect(() => {
    const apply = (effective: 'light' | 'dark') => {
      document.documentElement.classList.toggle('dark', effective === 'dark');
    };
    const resolve = () => {
      const stored = (() => {
        try {
          return localStorage.getItem('borgdock-theme');
        } catch {
          return null;
        }
      })();
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'borgdock-theme') return;
      apply(resolve());
    };
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => apply(resolve());

    window.addEventListener('storage', onStorage);
    mq.addEventListener('change', onSystemChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      mq.removeEventListener('change', onSystemChange);
    };
  }, []);

  const sessions = useAgentSessions();
  const [grouping, setGrouping] = useState<Grouping>('repo');
  const [showArchived, setShowArchived] = useState(false);
  const viewportWidth = useViewportWidth();
  const nowMs = useNowTick(1_000);

  const awaiting = useMemo(
    () =>
      sessions
        .filter((s) => s.state === 'awaiting' && !isSnoozed(s, nowMs))
        .sort((a, b) => b.stateSinceMs - a.stateSinceMs),
    [sessions, nowMs],
  );
  const live = sessions.filter((s) => s.state !== 'idle' && s.state !== 'ended');
  const idleAll = sessions.filter((s) => s.state === 'idle' || s.state === 'ended');
  const archived = idleAll.filter(isArchived);
  const idleVisible = showArchived ? idleAll : idleAll.filter((s) => !isArchived(s));

  const groupedAgents = live.filter((s) => s.state !== 'awaiting');
  const oldestAwaitingMs = awaiting.length ? awaiting[0]!.stateSinceMs : null;

  const effectiveDensity = useMemo(
    () => pickDensity(groupedAgents.length, viewportWidth),
    [groupedAgents.length, viewportWidth],
  );

  const awaitingSessionIds = useMemo(() => awaiting.map((a) => a.sessionId), [awaiting]);
  const inspector = useInspectorState(awaitingSessionIds);
  useKeyboardShortcuts(inspector);

  return (
    <InspectorContext.Provider value={inspector}>
      <div
        data-app-ready="true"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-background)',
          color: 'var(--color-text-primary)',
        }}
      >
        <Titlebar
          oldestAwaitingMs={oldestAwaitingMs}
          totalAwaiting={awaiting.length}
          liveSessions={live.length}
          grouping={grouping}
          onGroupingChange={setGrouping}
        />
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '14px 18px 16px',
            background: 'var(--color-background)',
            minHeight: 0,
          }}
        >
          <AwaitingRail agents={awaiting} density={effectiveDensity} />
          {renderGrouping(grouping, groupedAgents, effectiveDensity)}
          <IdleRail agents={idleVisible} />
        </div>
        <Statusbar
          records={sessions}
          grouping={grouping}
          archivedCount={archived.length}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((v) => !v)}
        />
        {inspector.openSessionId && <InspectorPopover sessionId={inspector.openSessionId} />}
      </div>
    </InspectorContext.Provider>
  );
}

function renderGrouping(
  grouping: Grouping,
  agents: ReturnType<typeof useAgentSessions>,
  density: ReturnType<typeof pickDensity>,
) {
  switch (grouping) {
    case 'repo':
      return <RepoGrouped agents={agents} density={density} />;
    case 'status':
      return <StatusGrouped agents={agents} density={density} />;
    case 'worktree':
      return <WorktreeFlat agents={agents} density={density} />;
    case 'context':
      return <ContextGrouped agents={agents} density={density} />;
    case 'activity':
      return <ActivityGrouped agents={agents} density={density} />;
  }
}

function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
