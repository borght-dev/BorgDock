import type { SessionRecord } from '@/services/agent-overview-types';
import { STATE_DEFS, fmtSince, tokenPct } from '@/services/agent-overview';
import { RepoMark } from './RepoMark';
import { StatePill } from './StatePill';
import { TokenBar } from './TokenBar';

interface AgentCardProps {
  agent: SessionRecord;
  density?: 'comfortable' | 'compact';
  showRepo?: boolean;
}

export function AgentCard({ agent, density = 'comfortable', showRepo = false }: AgentCardProps) {
  const def = STATE_DEFS[agent.state];
  const compact = density === 'compact';
  const pct = tokenPct(agent);

  return (
    <div className={`ag-card ag-card--${agent.state}`} style={{ padding: compact ? '10px 12px' : '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 6 : 8 }}>
        {showRepo && <RepoMark repo={agent.repo} size={18} />}
        <span className="ag-pane">{agent.label}</span>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>·</span>
        <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {agent.worktree === 'master' ? agent.branch : `${agent.worktree} · ${truncate(agent.branch, 28)}`}
        </span>
        <span style={{ flex: 1 }} />
        <StatePill state={agent.state} />
      </div>

      {agent.lastUserMsg && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.45,
            marginBottom: 6,
            display: '-webkit-box',
            WebkitLineClamp: compact ? 1 : 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ color: 'var(--color-text-faint)' }}>{'" '}</span>
          {agent.lastUserMsg}
          <span style={{ color: 'var(--color-text-faint)' }}>{' "'}</span>
        </div>
      )}

      {agent.task && (
        <div
          style={{
            fontSize: 11,
            color: agent.state === 'awaiting' ? 'var(--color-warning-badge-fg)' : 'var(--color-text-tertiary)',
            marginBottom: compact ? 8 : 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.task}</span>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingTop: compact ? 6 : 8,
          borderTop: '1px solid var(--color-subtle-border)',
          fontSize: 10,
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-code)',
          letterSpacing: '0.02em',
        }}
      >
        <span>
          {def.short.toLowerCase()} · {fmtSince(agent.stateSinceMs)}
        </span>
        <span style={{ flex: 1 }} />
        <TokenBar pct={pct} width={48} />
      </div>

      {agent.state === 'tool' && (
        <div className="bd-ants" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />
      )}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
