import { Dot, Pill, type PillTone } from '@/components/shared/primitives';
import { THREAD_STATUS_LABEL, type ThreadStatus } from '@/services/dispatch/types';

const TONE: Record<ThreadStatus, PillTone> = {
  question: 'warning',
  plan: 'draft',
  approval: 'warning',
  'your-turn': 'neutral',
  failed: 'error',
  running: 'success',
  settled: 'ghost',
};

/** What a thread's agent is doing, as a pill. Running carries a pulsing dot. */
export function ThreadStatusPill({ status }: { status: ThreadStatus }) {
  return (
    <Pill
      tone={TONE[status]}
      icon={status === 'running' ? <Dot tone="green" pulse size={6} /> : undefined}
      data-thread-status={status}
    >
      {THREAD_STATUS_LABEL[status]}
    </Pill>
  );
}
