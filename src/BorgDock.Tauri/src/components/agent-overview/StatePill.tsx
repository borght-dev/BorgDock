import { STATE_DEFS } from '@/services/agent-overview';
import type { SessionState } from '@/services/agent-overview-types';
import { StateDot } from './StateDot';

export function StatePill({ state }: { state: SessionState }) {
  const def = STATE_DEFS[state];
  return (
    <span className={`bd-pill bd-pill--${def.tone}`}>
      <StateDot state={state} size={6} />
      {def.label}
    </span>
  );
}
