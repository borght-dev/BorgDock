import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort } from '@/services/agent-overview';
import { StateDot } from './StateDot';

interface AgentTileProps {
  agent: SessionRecord;
}

export function AgentTile({ agent }: AgentTileProps) {
  return (
    <div className={`ag-tile ${agent.state === 'awaiting' ? 'ag-tile--awaiting' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <StateDot state={agent.state} size={6} />
        <span
          className="ag-pane"
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {agent.label}
        </span>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)' }}>
          {fmtSinceShort(agent.stateSinceMs)}
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: agent.state === 'awaiting' ? 'var(--color-warning-badge-fg)' : 'var(--color-text-secondary)',
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
          fontWeight: agent.state === 'awaiting' ? 500 : 400,
        }}
      >
        {agent.task ?? ''}
      </div>
      {agent.state === 'tool' && (
        <div className="bd-ants" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />
      )}
    </div>
  );
}
