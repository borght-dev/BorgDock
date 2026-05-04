import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@/services/logger';

const log = createLogger('agent-overview:dismiss');

interface DismissButtonProps {
  sessionId: string;
  /** Show only on parent hover. Set to false to make it always visible. */
  hoverOnly?: boolean;
}

/**
 * Hover-revealed ✕ button on awaiting/finished cards. Calls the
 * `dismiss_agent_session` Tauri command which moves the session to Ended.
 * If Claude later emits real activity, the session reactivates automatically.
 */
export function DismissButton({ sessionId, hoverOnly = true }: DismissButtonProps) {
  const handle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await invoke('dismiss_agent_session', { sessionId });
    } catch (err) {
      log.error('dismiss failed', err, { sessionId });
    }
  };
  return (
    <button
      type="button"
      data-testid="dismiss-button"
      data-session-id={sessionId}
      title="Dismiss — mark this session as no longer needing your attention"
      onClick={handle}
      className={hoverOnly ? 'ag-dismiss-btn ag-dismiss-btn--hover' : 'ag-dismiss-btn'}
      aria-label="Dismiss session"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M2 2l6 6M8 2l-6 6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
