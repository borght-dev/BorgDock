import type { SessionRecord } from '@/services/agent-overview-types';
import { STATE_DEFS, fmtSince, tokenPct } from '@/services/agent-overview';
import { HoverPopover } from '@/components/shared/primitives';
import { AssistantMarkdown } from './AssistantMarkdown';
import { DismissButton } from './DismissButton';
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
        <DismissButton sessionId={agent.sessionId} />
      </div>

      {agent.lastUserMsg && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.4,
            marginBottom: 4,
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ color: 'var(--color-text-faint)' }}>you: </span>
          {agent.lastUserMsg}
        </div>
      )}

      {agent.lastAssistantMsg && (
        <HoverPopover
          content={<AssistantMarkdown text={agent.lastAssistantMsg} />}
          triggerStyle={{ display: 'block', marginBottom: 6 }}
        >
          <div
            data-testid="agent-card-assistant-preview"
            style={{
              fontSize: 12,
              color: 'var(--color-text-primary)',
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: compact ? 2 : 3,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'pre-wrap',
              cursor: 'help',
            }}
          >
            {agent.lastAssistantMsg}
          </div>
        </HoverPopover>
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
          <span style={{ flexShrink: 0, color: 'var(--color-text-faint)' }}>→</span>
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
