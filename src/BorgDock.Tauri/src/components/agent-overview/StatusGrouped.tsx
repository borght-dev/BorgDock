import type { SessionRecord, SessionState } from '@/services/agent-overview-types';
import { STATE_DEFS } from '@/services/agent-overview';
import { AgentCard } from './AgentCard';
import { AgentTile } from './AgentTile';
import { StateDot } from './StateDot';

interface StatusGroupedProps {
  agents: SessionRecord[];
  density: 'roomy' | 'standard' | 'wall';
}

const ORDER: SessionState[] = ['finished', 'working', 'tool'];

export function StatusGrouped({ agents, density }: StatusGroupedProps) {
  if (agents.length === 0) return null;
  const grouped = ORDER.map((s) => ({
    state: s,
    agents: agents.filter((a) => a.state === s),
  })).filter((g) => g.agents.length > 0);

  return (
    <>
      {grouped.map(({ state, agents: list }) => {
        const def = STATE_DEFS[state];
        return (
          <section key={state} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <StateDot state={state} size={9} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{def.label}</span>
              <span className="bd-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{list.length}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--color-subtle-border)' }} />
            </div>
            {density === 'wall' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {list.map((a) => <AgentTile key={a.sessionId} agent={a} />)}
              </div>
            ) : (
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
                {list.map((a) => (
                  <AgentCard
                    key={a.sessionId}
                    agent={a}
                    showRepo
                    density={density === 'roomy' ? 'comfortable' : 'compact'}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
