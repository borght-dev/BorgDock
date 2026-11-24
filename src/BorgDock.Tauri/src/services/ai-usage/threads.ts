import { ordinalOf } from '@/services/activity/derive/t3';
import { isRemote } from '@/services/dispatch/hosts';
import type { AgentThread } from '@/services/dispatch/types';
import type { AiAccount } from './types';

/** Run states in which the agent is working or about to. */
const WORKING = new Set(['preparing', 'queued', 'starting', 'running', 'waiting']);

/** The thread's newest run stopped on a usage limit and nothing ran after it. */
function stoppedOnLimit(thread: AgentThread): boolean {
  const run = thread.run;
  const limit = run?.limitRecovery;
  if (!run || !limit) return false;
  if (run.status !== null && WORKING.has(run.status)) return false;
  const ordinal = ordinalOf(run.id);
  const limitOrdinal = ordinalOf(limit.runId);
  return !(ordinal !== null && limitOrdinal !== null && ordinal > limitOrdinal);
}

/**
 * The open threads on this machine's T3 that stopped on `account`'s limit.
 * T3 runs a thread through a provider instance, and the account knows which
 * instances sign in from its folder. Another machine's instances sign in
 * from that machine's folders, so its threads are never counted.
 */
export function threadsStoppedOn(
  account: AiAccount,
  threads: readonly AgentThread[],
): AgentThread[] {
  if (account.t3Instances.length === 0) return [];
  return threads.filter(
    (thread) =>
      thread.open &&
      !isRemote({ id: thread.hostId }) &&
      thread.modelInstance !== null &&
      account.t3Instances.includes(thread.modelInstance) &&
      stoppedOnLimit(thread),
  );
}
