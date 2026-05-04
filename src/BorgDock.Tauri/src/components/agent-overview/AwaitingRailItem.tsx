import type { SessionRecord } from '@/services/agent-overview-types';
import { fmtSinceShort } from '@/services/agent-overview';
import { HoverPopover } from '@/components/shared/primitives';
import { AssistantMarkdown } from './AssistantMarkdown';
import { DismissButton } from './DismissButton';
import { RepoMark } from './RepoMark';

interface AwaitingRailItemProps {
  agent: SessionRecord;
}

export function AwaitingRailItem({ agent }: AwaitingRailItemProps) {
  return (
    <div
      className="ag-rail-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-warning-badge-border)',
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      <span className="ag-alert-ring" style={{ width: 8, height: 8 }}>
        <span
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: '50%',
            border: '1.5px solid var(--color-status-yellow)',
            opacity: 0.45,
            animation: 'bd-breathe 2s ease-in-out infinite',
          }}
        />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
          <RepoMark repo={agent.repo} size={14} />
          <span className="ag-pane">{agent.label}</span>
          <span style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>·</span>
          <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            {agent.worktree === 'master' ? 'master' : agent.worktree}
          </span>
          <span style={{ flex: 1 }} />
          <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-warning-badge-fg)', fontWeight: 600 }}>
            waiting {fmtSinceShort(agent.stateSinceMs)}
          </span>
          <DismissButton sessionId={agent.sessionId} />
        </div>
        {agent.lastAssistantMsg && agent.lastUserMsg && (
          <div
            data-testid="awaiting-item-user-reply"
            style={{
              fontSize: 10,
              color: 'var(--color-text-tertiary)',
              marginBottom: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ color: 'var(--color-text-faint)' }}>you: </span>
            {agent.lastUserMsg}
          </div>
        )}
        {agent.lastAssistantMsg ? (
          <HoverPopover
            content={<AssistantMarkdown text={agent.lastAssistantMsg} />}
            triggerStyle={{ display: 'block' }}
          >
            <div
              data-testid="awaiting-item-assistant-preview"
              style={{
                fontSize: 12,
                color: 'var(--color-text-primary)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.4,
                cursor: 'help',
              }}
            >
              {agent.lastAssistantMsg}
            </div>
          </HoverPopover>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: 500,
            }}
          >
            {agent.task ?? agent.lastUserMsg ?? ''}
          </div>
        )}
      </div>
    </div>
  );
}
