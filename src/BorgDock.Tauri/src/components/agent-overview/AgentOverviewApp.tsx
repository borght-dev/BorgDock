import { useMemo, useState } from 'react';
import { useAgentSessions } from '@/hooks/useAgentSessions';
import { pickDensity } from '@/services/agent-overview';
import { AwaitingRail } from './AwaitingRail';
import { IdleRail } from './IdleRail';
import { RepoGrouped } from './RepoGrouped';
import { StatusGrouped } from './StatusGrouped';
import { Statusbar } from './Statusbar';
import { Titlebar } from './Titlebar';

export function AgentOverviewApp() {
  const sessions = useAgentSessions();
  const [grouping, setGrouping] = useState<'repo' | 'status'>('repo');
  const [density, setDensity] = useState<'auto' | 'roomy' | 'standard' | 'wall'>('auto');

  const live = sessions.filter((s) => s.state !== 'idle' && s.state !== 'ended');
  const idle = sessions.filter((s) => s.state === 'idle' || s.state === 'ended');
  const awaiting = sessions.filter((s) => s.state === 'awaiting');

  // When the dashboard would otherwise be empty (no live sessions), promote
  // the idle sessions into the main grouped view so the user still sees
  // real cards and the grouping/density toggles affect what's rendered.
  // The compact IdleRail strip only makes sense as a footer to an active
  // dashboard.
  const promoteIdle = live.length === 0 && idle.length > 0;
  const groupedAgents = promoteIdle
    ? idle
    : live.filter((s) => s.state !== 'awaiting');
  const showIdleRail = !promoteIdle && idle.length > 0;

  const effectiveDensity = useMemo<'roomy' | 'standard' | 'wall'>(
    () => (density === 'auto' ? pickDensity(groupedAgents.length) : density),
    [density, groupedAgents.length],
  );

  const totalRepos = useMemo(() => new Set(sessions.map((s) => s.repo)).size, [sessions]);

  return (
    <div
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
        totalAwaiting={awaiting.length}
        totalSessions={sessions.length}
        totalRepos={totalRepos}
        grouping={grouping}
        onGroupingChange={setGrouping}
        density={density}
        onDensityChange={setDensity}
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
        {grouping === 'repo' ? (
          <RepoGrouped agents={groupedAgents} density={effectiveDensity} />
        ) : (
          <StatusGrouped agents={groupedAgents} density={effectiveDensity} />
        )}
        {showIdleRail && <IdleRail agents={idle} />}
      </div>
      <Statusbar
        records={sessions}
        grouping={grouping}
        effectiveDensity={effectiveDensity}
        densityIsAuto={density === 'auto'}
      />
    </div>
  );
}
