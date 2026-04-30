import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort } from '@/services/agent-overview';
import { RepoMark } from './RepoMark';
import { StateDot } from './StateDot';

interface IdleRailProps {
  agents: SessionRecord[];
}

export function IdleRail({ agents }: IdleRailProps) {
  if (agents.length === 0) return null;
  return (
    <section style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span className="bd-dot bd-dot--gray" style={{ width: 8, height: 8 }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Idle
        </span>
        <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
          {agents.length}
        </span>
        <span style={{ flex: 1, height: 1, background: 'var(--color-subtle-border)' }} />
      </div>
      <div
        style={{
          background: 'var(--color-card-background)',
          border: '1px solid var(--color-subtle-border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {agents.map((a, i) => (
          <div
            key={a.sessionId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 12px',
              borderTop: i === 0 ? 'none' : '1px solid var(--color-subtle-border)',
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              opacity: 0.85,
            }}
          >
            <StateDot state={a.state} size={6} />
            <RepoMark repo={a.repo} size={14} />
            <span className="ag-pane">{a.label}</span>
            <span style={{ color: 'var(--color-text-faint)' }}>·</span>
            <span className="bd-mono" style={{ fontSize: 10 }}>
              {a.worktree === 'master' ? 'master' : a.worktree}
            </span>
            <span style={{ color: 'var(--color-text-faint)' }}>·</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.task ?? a.lastUserMsg ?? ''}
            </span>
            <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
              {fmtSinceShort(a.lastEventMs)} ago
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
