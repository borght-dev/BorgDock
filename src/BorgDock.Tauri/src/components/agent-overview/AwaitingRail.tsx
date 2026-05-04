import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort, groupByRepo } from '@/services/agent-overview';
import { AgentCardLarge } from './AgentCardLarge';
import { AwaitingRailItem } from './AwaitingRailItem';
import { RepoMark } from './RepoMark';

interface AwaitingRailProps {
  agents: SessionRecord[];
  density: 'roomy' | 'standard' | 'wall';
}

const GRID_BY_DENSITY: Record<AwaitingRailProps['density'], { minmax: number; gap: number }> = {
  roomy: { minmax: 380, gap: 10 },
  standard: { minmax: 340, gap: 8 },
  wall: { minmax: 260, gap: 8 },
};

export function AwaitingRail({ agents, density }: AwaitingRailProps) {
  if (agents.length === 0) return null;
  const oldest = Math.max(...agents.map((a) => a.stateSinceMs));
  const grouped = groupByRepo(agents);
  const grid = GRID_BY_DENSITY[density];

  return (
    <section className="ag-alert-rail" style={{ marginBottom: 16, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--color-status-yellow)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', flexShrink: 0,
          }}
        >
          !
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-warning-badge-fg)' }}>
          {agents.length} session{agents.length === 1 ? '' : 's'} waiting on you
        </span>
        <span style={{ flex: 1 }} />
        <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-warning-badge-fg)' }}>
          oldest {fmtSinceShort(oldest)} ago
        </span>
      </div>
      {grouped.map(({ repo, agents: list }) => (
        <div key={repo} style={{ marginBottom: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
              paddingLeft: 2,
            }}
          >
            <RepoMark repo={repo} size={18} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-warning-badge-fg)' }}>
              {repo}
            </span>
            <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-warning-badge-fg)', opacity: 0.7 }}>
              {list.length}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${grid.minmax}px, 1fr))`,
              gap: grid.gap,
            }}
          >
            {density === 'roomy'
              ? list.map((a) => <AgentCardLarge key={a.sessionId} agent={a} />)
              : list.map((a) => <AwaitingRailItem key={a.sessionId} agent={a} />)}
          </div>
        </div>
      ))}
    </section>
  );
}
