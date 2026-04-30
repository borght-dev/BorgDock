import type { CSSProperties } from 'react';
import { STATE_DEFS } from '@/services/agent-overview';
import type { SessionState } from '@/services/agent-overview-types';

interface StateDotProps {
  state: SessionState;
  size?: number;
}

const dotClass: Record<SessionState, string> = {
  awaiting: 'bd-dot--yellow',
  working: 'bd-dot--violet',
  tool: 'bd-dot--violet',
  finished: 'bd-dot--green',
  idle: 'bd-dot--gray',
  ended: 'bd-dot--gray',
};

export function StateDot({ state, size = 8 }: StateDotProps) {
  const def = STATE_DEFS[state];
  const style: CSSProperties = {
    width: size,
    height: size,
    animation:
      state === 'awaiting'
        ? 'bd-pulse-halo 2s ease-out infinite'
        : state === 'working'
          ? 'bd-pulse-soft 1.6s ease-in-out infinite'
          : undefined,
    boxShadow: state === 'awaiting' ? '0 0 0 0 rgba(176,125,9,0.5)' : undefined,
  };
  return <span className={`bd-dot ${dotClass[state]}`} style={style} aria-label={def.label} />;
}
