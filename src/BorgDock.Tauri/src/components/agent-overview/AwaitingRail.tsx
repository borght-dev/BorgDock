import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort } from '@/services/agent-overview';
import { AgentCardLarge } from './AgentCardLarge';
import { AwaitingRailItem } from './AwaitingRailItem';

interface AwaitingRailProps {
  agents: SessionRecord[];
  density: 'roomy' | 'standard' | 'wall';
}

export function AwaitingRail({ agents, density }: AwaitingRailProps) {
  if (agents.length === 0) return null;
  const oldest = Math.max(...agents.map((a) => a.stateSinceMs));

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
      {density === 'roomy' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 10 }}>
          {agents.map((a) => <AgentCardLarge key={a.sessionId} agent={a} />)}
        </div>
      ) : density === 'wall' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {agents.map((a) => <AwaitingRailItem key={a.sessionId} agent={a} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
          {agents.map((a) => <AwaitingRailItem key={a.sessionId} agent={a} />)}
        </div>
      )}
    </section>
  );
}
