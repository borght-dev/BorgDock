import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort, timeSinceTier, tokenPct } from '@/services/agent-overview';
import { useInspector } from './InspectorContext';
import { DismissButton } from './DismissButton';
import { RepoMark } from './RepoMark';
import { StateDot } from './StateDot';
import { StatePill } from './StatePill';
import { TokenBar } from './TokenBar';

interface AgentCardProps {
  agent: SessionRecord;
  density?: 'comfortable' | 'compact';
  showRepo?: boolean;
}

const TIME_HIDE_THRESHOLD_MS = 5_000;

export function AgentCard({ agent, density = 'comfortable', showRepo = false }: AgentCardProps) {
  const inspector = useInspector();
  const compact = density === 'compact';
  const pct = tokenPct(agent);
  const showTime = agent.stateSinceMs >= TIME_HIDE_THRESHOLD_MS;
  const tier = timeSinceTier(agent.stateSinceMs);
  const hero = agent.task ?? agent.lastAssistantMsg;
  const focused = inspector.focusedSessionId === agent.sessionId;
  const seen = agent.seenAtMs !== null;

  return (
    <div
      data-session-id={agent.sessionId}
      className={[
        'ag-card',
        `ag-card--${agent.state}`,
        focused && 'ag-card--focus-ring',
        seen && 'ag-card--seen',
      ].filter(Boolean).join(' ')}
      style={{ padding: compact ? '10px 12px' : '12px 14px' }}
      onMouseEnter={() => inspector.onCardEnter(agent.sessionId)}
      onMouseLeave={() => inspector.onCardLeave(agent.sessionId)}
      onClick={() => inspector.onCardClick(agent.sessionId)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 6 : 8 }}>
        <StateDot state={agent.state} size={8} />
        {showRepo && <RepoMark repo={agent.repo} size={16} />}
        <span className="ag-pane">{agent.label}</span>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>·</span>
        <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {agent.worktree === 'master' ? agent.branch : `${agent.worktree} · ${truncate(agent.branch, 28)}`}
        </span>
        <span style={{ flex: 1 }} />
        {showTime && (
          <span
            className={`ag-time--${tier} bd-mono`}
            style={{ fontSize: 10 }}
            data-testid="agent-card-time"
          >
            {fmtSinceShort(agent.stateSinceMs)}
          </span>
        )}
        <DismissButton sessionId={agent.sessionId} />
      </div>

      {hero && (
        <div
          data-testid="agent-card-hero"
          className={`ag-hero${compact ? ' ag-hero--compact' : ''}${agent.state === 'awaiting' ? ' ag-hero--awaiting' : ''}`}
        >
          {hero}
        </div>
      )}

      {agent.lastUserMsg && (
        <div data-testid="agent-card-breadcrumb" className="ag-breadcrumb" style={{ marginBottom: compact ? 6 : 8 }}>
          re: {agent.lastUserMsg}
        </div>
      )}

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingTop: compact ? 6 : 8,
          borderTop: '1px solid var(--color-subtle-border)',
          fontSize: 10, color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-code)', letterSpacing: '0.02em',
        }}
      >
        <StatePill state={agent.state} />
        <span style={{ flex: 1 }} />
        <TokenBar pct={pct} width={48} />
        {showTime && (
          <span className={`ag-time--${tier}`} style={{ fontSize: 10 }}>
            {fmtSinceShort(agent.stateSinceMs)}
          </span>
        )}
      </div>

      {agent.state === 'tool' && <div className="bd-ants--left" />}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
