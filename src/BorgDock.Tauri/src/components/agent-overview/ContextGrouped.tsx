import type { SessionRecord } from '@/services/agent-overview-types';
import { groupByContext, type ContextBucket, type Density } from '@/services/agent-overview';
import { AgentCard } from './AgentCard';
import { AgentTile } from './AgentTile';

interface ContextGroupedProps {
  agents: SessionRecord[];
  density: Density;
}

const BUCKET_LABEL: Record<ContextBucket, string> = {
  high: 'High context use (>85%)',
  mid: 'Mid context use (65–85%)',
  low: 'Low context use (≤65%)',
};

const BUCKET_TONE: Record<ContextBucket, { color: string; dot: string }> = {
  high: { color: 'var(--color-status-red)', dot: 'var(--color-status-red)' },
  mid: { color: 'var(--color-warning-badge-fg)', dot: 'var(--color-status-yellow)' },
  low: { color: 'var(--color-text-tertiary)', dot: 'var(--color-text-muted)' },
};

/** Bucket cards by token-context use. Highest-pressure sessions surface
 *  first so you can prune them before they hit the cap. */
export function ContextGrouped({ agents, density }: ContextGroupedProps) {
  if (agents.length === 0) return null;
  const grouped = groupByContext(agents);

  return (
    <>
      {grouped.map(({ bucket, agents: list }) => {
        const tone = BUCKET_TONE[bucket];
        return (
          <section key={bucket} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span
                className="bd-dot"
                style={{ width: 9, height: 9, background: tone.dot }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: tone.color }}>
                {BUCKET_LABEL[bucket]}
              </span>
              <span className="bd-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {list.length}
              </span>
              <span style={{ flex: 1, height: 1, background: 'var(--color-subtle-border)' }} />
            </div>
            {density === 'wall' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {list.map((a) => (
                  <AgentTile key={a.sessionId} agent={a} />
                ))}
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
