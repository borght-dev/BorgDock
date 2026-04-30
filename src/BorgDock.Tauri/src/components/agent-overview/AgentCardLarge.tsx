import type { SessionRecord } from '@/services/agent-overview-types';
import { STATE_DEFS, fmtSince, tokenPct } from '@/services/agent-overview';
import { RepoMark } from './RepoMark';
import { StatePill } from './StatePill';
import { TokenBar } from './TokenBar';

interface AgentCardLargeProps {
  agent: SessionRecord;
}

export function AgentCardLarge({ agent }: AgentCardLargeProps) {
  const def = STATE_DEFS[agent.state];
  const pct = tokenPct(agent);

  return (
    <div className={`ag-card ag-card--${agent.state}`} style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <RepoMark repo={agent.repo} size={22} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="ag-pane">{agent.label}</span>
          <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            {agent.worktree === 'master' ? agent.branch : `${agent.worktree} · ${agent.branch}`}
          </span>
        </div>
        <span style={{ flex: 1 }} />
        <StatePill state={agent.state} />
      </div>

      {agent.lastUserMsg && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--color-text-primary)',
            lineHeight: 1.45,
            marginBottom: 8,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontWeight: 500,
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
            fontSize: 12,
            color: agent.state === 'awaiting' ? 'var(--color-warning-badge-fg)' : 'var(--color-text-secondary)',
            marginBottom: 10,
          }}
        >
          {`→ ${agent.task}`}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingTop: 10,
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
        <TokenBar pct={pct} width={64} />
      </div>

      {agent.state === 'tool' && (
        <div className="bd-ants" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />
      )}
    </div>
  );
}
