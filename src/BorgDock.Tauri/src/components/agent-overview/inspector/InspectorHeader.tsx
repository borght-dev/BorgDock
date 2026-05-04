import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort, timeSinceTier } from '@/services/agent-overview';
import { useInspector } from '../InspectorContext';
import { StateDot } from '../StateDot';
import { StatePill } from '../StatePill';

export function InspectorHeader({ session }: { session: SessionRecord }) {
  const inspector = useInspector();
  const tier = timeSinceTier(session.stateSinceMs);
  const pinned = inspector.pinnedSessionId === session.sessionId;

  return (
    <div className="inspector-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StateDot state={session.state} size={8} />
        <span className="ag-pane">{session.label}</span>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>·</span>
        <span className="bd-mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {session.branch}
        </span>
        <span style={{ flex: 1 }} />
        <StatePill state={session.state} />
        <button
          type="button"
          aria-label="Pin"
          aria-pressed={pinned}
          title="Pin (P)"
          onClick={() => inspector.togglePin(session.sessionId)}
          className={`inspector-pin${pinned ? ' inspector-pin--active' : ''}`}
        >
          📌
        </button>
      </div>
      <div className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-faint)', marginTop: 4 }}>
        {session.cwd}
      </div>
      <div style={{ marginTop: 4, fontSize: 11 }}>
        <span className={`ag-time--${tier}`}>{fmtSinceShort(session.stateSinceMs)}</span>
      </div>
    </div>
  );
}
