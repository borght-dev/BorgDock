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

  const effectiveDensity = useMemo<'roomy' | 'standard' | 'wall'>(
    () => (density === 'auto' ? pickDensity(live.length) : density),
    [density, live.length],
  );

  const totalRepos = useMemo(() => new Set(sessions.map((s) => s.repo)).size, [sessions]);
  const nonAwaiting = live.filter((s) => s.state !== 'awaiting');

  return (
    <div className="bd-window" style={{ width: '100vw', height: '100vh' }}>
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
        className="bd-scroll"
        style={{ flex: 1, overflow: 'auto', padding: '14px 18px 16px', background: 'var(--color-background)' }}
      >
        <AwaitingRail agents={awaiting} density={effectiveDensity} />
        {grouping === 'repo' ? (
          <RepoGrouped agents={nonAwaiting} density={effectiveDensity} />
        ) : (
          <StatusGrouped agents={nonAwaiting} density={effectiveDensity} />
        )}
        {idle.length > 0 && <IdleRail agents={idle} />}
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
