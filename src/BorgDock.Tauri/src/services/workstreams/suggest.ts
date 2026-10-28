import { rawId } from '@/services/dispatch/hosts';
import type { ItemOverview } from '@/services/dispatch/types';
import type { HostStatus } from '@/stores/dispatch-store';
import type { Assessment } from './attention';
import { prRefFromUrl, refKey, shortIdentity } from './identity';
import type { RefKey, SourceRef, WorkstreamDocument } from './types';

/**
 * Records that probably belong to a workstream, from what BorgDock knows
 * already: an epic's children, the threads and pull requests Dispatch links
 * to a member item, the pull requests a member thread opened. They are only
 * offered; nothing joins until you add it.
 */

export interface MemberSuggestion {
  /** The key of the suggested record: dismissing it is remembered by this. */
  id: RefKey;
  ref: SourceRef;
  label: string;
  why: string;
}

export interface SuggestContext {
  items: ReadonlyMap<number, ItemOverview>;
  hosts: readonly HostStatus[];
}

const MAX_SUGGESTIONS = 20;

export function suggestMembers(
  document: WorkstreamDocument,
  assessment: Pick<Assessment, 'members'>,
  context: SuggestContext,
): MemberSuggestion[] {
  const taken = new Set([...document.members.map((m) => m.key), ...document.dismissedSuggestions]);
  const found = new Map<RefKey, MemberSuggestion>();
  const offer = (ref: SourceRef, label: string, why: string) => {
    const key = refKey(ref);
    if (taken.has(key) || found.has(key)) return;
    found.set(key, { id: key, ref, label, why });
  };

  for (const resolved of assessment.members.values()) {
    if (resolved.member.role === 'superseded') continue;
    const ref = resolved.member.ref;
    if (ref.kind === 'ado-item' && resolved.item) {
      const item = resolved.item.item;
      const name = `AB#${item.id}`;
      const itemRef = (id: number): SourceRef => ({ ...ref, id });
      const titleOf = (id: number) => context.items.get(id)?.item.title ?? `AB#${id}`;
      for (const child of item.childIds ?? [])
        offer(itemRef(child), titleOf(child), `Child of ${name}`);
      if (item.parentId !== null)
        offer(itemRef(item.parentId), titleOf(item.parentId), `Parent of ${name}`);
      for (const thread of resolved.item.threads) {
        const environmentId = context.hosts.find((h) => h.id === thread.hostId)?.environmentId;
        if (!environmentId) continue;
        offer(
          {
            kind: 't3-thread',
            environmentId,
            threadId: rawId(thread.hostId, thread.id),
            hostId: thread.hostId,
          },
          thread.title,
          `Dispatch links it to ${name}`,
        );
      }
      for (const pr of resolved.item.pullRequests) {
        if (pr.shared) continue;
        const prRef = prRefFromUrl(pr.url);
        if (prRef) offer(prRef, pr.title || shortIdentity(prRef), `Pull request of ${name}`);
      }
    }
    if (ref.kind === 't3-thread' && resolved.thread) {
      for (const pr of resolved.thread.pullRequests) {
        const prRef = prRefFromUrl(pr.url);
        if (prRef)
          offer(
            prRef,
            pr.title || shortIdentity(prRef),
            `Opened by the agent in ${resolved.thread.place}`,
          );
      }
    }
  }
  return [...found.values()].slice(0, MAX_SUGGESTIONS);
}
