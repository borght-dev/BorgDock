import type { SessionRecord } from '@/services/agent-overview-types';
import { STATE_DEFS, fmtSince, tokenPct } from '@/services/agent-overview';
import { HoverPopover } from '@/components/shared/primitives';
import { AssistantMarkdown } from './AssistantMarkdown';
import { DismissButton } from './DismissButton';
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
        <DismissButton sessionId={agent.sessionId} />
      </div>

      {agent.lastUserMsg && (
        <div
          data-testid="agent-card-user-reply"
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.4,
            marginBottom: 6,
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
          triggerStyle={{ display: 'block', marginBottom: 8 }}
        >
          <div
            data-testid="agent-card-assistant-preview"
            style={{
              fontSize: 13,
              color: 'var(--color-text-primary)',
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 4,
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
