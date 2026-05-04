import type { SessionRecord } from '@/services/agent-overview-types';
import { sortByActivity, type Density } from '@/services/agent-overview';
import { AgentCard } from './AgentCard';
import { AgentTile } from './AgentTile';

interface ActivityGroupedProps {
  agents: SessionRecord[];
  density: Density;
}

/** Single sorted list, most recently active first. No headers — the order
 *  itself is the structure. Repo badge inline on each card so you can still
 *  tell where a session lives. */
export function ActivityGrouped({ agents, density }: ActivityGroupedProps) {
  if (agents.length === 0) return null;
  const sorted = sortByActivity(agents);

  if (density === 'wall') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {sorted.map((a) => (
          <AgentTile key={a.sessionId} agent={a} />
        ))}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns:
          density === 'roomy'
            ? 'repeat(auto-fill, minmax(380px, 1fr))'
            : 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 10,
      }}
    >
      {sorted.map((a) => (
        <AgentCard
          key={a.sessionId}
          agent={a}
          showRepo
          density={density === 'roomy' ? 'comfortable' : 'compact'}
        />
      ))}
    </div>
  );
}
