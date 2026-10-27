import type { DispatchHost } from '@/services/dispatch/hosts';
import { rawId } from '@/services/dispatch/hosts';
import { type AgentThread, NEEDS_YOU } from '@/services/dispatch/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { deriveT3, type T3ThreadFacts } from '../derive/t3';
import { ingest, markSourceFailed, retireSourcesExcept } from '../ingest';
import { sourceId } from '../sources';

/** The items Dispatch linked each thread to, by scoped thread id. */
function linkedItems(): Map<string, number[]> {
  const linked = new Map<string, number[]>();
  for (const overview of useDispatchStore.getState().overview?.items ?? []) {
    for (const thread of overview.threads) {
      linked.set(thread.id, [...(linked.get(thread.id) ?? []), overview.item.id]);
    }
  }
  return linked;
}

function factsOf(host: DispatchHost, thread: AgentThread, items: number[]): T3ThreadFacts | null {
  const run = thread.run;
  if (!run) return null;
  const waiting = NEEDS_YOU.includes(thread.status);
  return {
    rawId: rawId(host.id, thread.id),
    title: thread.title,
    slot: thread.slot,
    createdAt: thread.createdAt,
    runId: run.id,
    runCompletedAt: run.completedAt,
    runStatus: run.status,
    stopRequested: run.stopRequested,
    lastError: run.lastError,
    lastErrorClass: run.lastErrorClass,
    pendingRequest: run.pendingRequest,
    hasPlan: run.hasPlan,
    limitRecovery: run.limitRecovery,
    lastVisitedAt: run.lastVisitedAt,
    subagent: !!thread.subagentOf,
    itemIds: items,
    prUrls: thread.pullRequests.map((pr) => pr.url),
    detail:
      waiting && (thread.questions.length > 0 || thread.lastAgentMessage)
        ? {
            questionRequestId: thread.questionRequestId,
            questions: thread.questions,
            lastAgentMessage: thread.lastAgentMessage,
          }
        : null,
  };
}

/** The threads as the T3 derivation reads them; subagents included, it skips them. */
export function t3Facts(
  host: DispatchHost,
  threads: readonly AgentThread[],
  items: ReadonlyMap<string, number[]> = new Map(),
): T3ThreadFacts[] {
  return threads.flatMap((thread) => {
    const fact = factsOf(host, thread, items.get(thread.id) ?? []);
    return fact ? [fact] : [];
  });
}

export function t3Source(host: DispatchHost, environmentId: string) {
  return {
    sourceId: sourceId.t3(host.id),
    kind: 't3' as const,
    label: host.label,
    configKey: environmentId,
  };
}

/**
 * One host's shell, as Dispatch accepted it. A host is ingested once its
 * install id is known: an address that now points at another T3 starts a
 * new baseline instead of comparing against the old one.
 */
export function ingestT3Host(
  host: DispatchHost,
  environmentId: string | null,
  sequence: number | null,
  threads: readonly AgentThread[],
): void {
  if (!environmentId || sequence === null) return;
  const facts = t3Facts(host, threads, linkedItems());
  const seenInT3 = useSettingsStore.getState().settings.notifications.activity?.seenInT3 !== false;
  void ingest(t3Source(host, environmentId), { sequence }, deriveT3, {
    hostId: host.id,
    hostLabel: host.label,
    threads: facts,
    complete: true,
    seenInT3,
  });
}

export function t3HostFailed(host: DispatchHost): void {
  markSourceFailed(sourceId.t3(host.id));
}

/** Hosts removed from settings keep their entries, with actions disabled, until cleared. */
export function retireT3HostsExcept(hostIds: readonly string[]): Promise<void> {
  return retireSourcesExcept('t3', hostIds.map(sourceId.t3));
}
