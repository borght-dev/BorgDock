import { abReferences } from '@/services/work-item-linker';
import type { AgentThread, LinkedPullRequest } from './types';

/** "AB59463" without the hash, as branch names and agents write it. */
const AB_WITHOUT_HASH = /\bAB(\d{3,7})\b/gi;
/** "fix/59463-…" or "fix/AB59463-…". */
const ID_IN_BRANCH = /(?:^|\/)(?:AB#?)?(\d{3,7})(?=[-_]|$)/i;
const BARE_NUMBER = /\b(\d{3,7})\b/g;

/** A number this long is unlikely to be anything but a work item id. */
const UNAMBIGUOUS_DIGITS = 5;

/** A thread that names more than this many items is an overview or triage thread, not work on one of them. */
export const MAX_ITEMS_PER_THREAD = 3;

/** What linking needs to know of an item. */
export interface LinkableItem {
  id: number;
  linkedPullRequests: readonly LinkedPullRequest[];
  parentId: number | null;
}

/**
 * The work items a thread is about by its own words: `AB#123` in its title,
 * first message and pull request titles, an id in its branch names, and the
 * items its pull requests are linked to. A short or bare number only counts
 * when it is one of `knownIds` ("pick up 59541", "release/2026-10").
 */
function ownReferences(
  thread: AgentThread,
  knownIds: ReadonlySet<number>,
  itemsByPullRequest: ReadonlyMap<number, number[]>,
): Set<number> {
  const ids = new Set<number>();
  const addLoose = (digits: string) => {
    const id = Number(digits);
    if (digits.length >= UNAMBIGUOUS_DIGITS || knownIds.has(id)) ids.add(id);
  };

  const texts = [thread.title, thread.firstUserMessage, ...thread.pullRequests.map((p) => p.title)];
  for (const text of texts) {
    for (const id of abReferences(text)) ids.add(id);
    for (const match of text.matchAll(AB_WITHOUT_HASH)) addLoose(match[1]!);
  }
  for (const branch of [thread.branch, ...thread.pullRequests.map((p) => p.headBranch)]) {
    const match = branch ? ID_IN_BRANCH.exec(branch) : null;
    if (match) addLoose(match[1]!);
  }
  for (const text of [thread.title, thread.firstUserMessage]) {
    for (const match of text.matchAll(BARE_NUMBER)) {
      if (knownIds.has(Number(match[1]))) ids.add(Number(match[1]));
    }
  }
  for (const pr of thread.pullRequests) {
    for (const id of itemsByPullRequest.get(pr.number) ?? []) ids.add(id);
  }
  return ids;
}

/** How many separate things `ids` are: an item and its parent's other children count as one. */
function topics(ids: ReadonlySet<number>, topicOf: (id: number) => number): number {
  return new Set([...ids].map(topicOf)).size;
}

/**
 * The work items a thread refers to: what it names itself, plus what its
 * conversation names (`AB#123` anywhere, a bare number only when it is one of
 * my items). A long thread names far more than it works on; when the whole
 * conversation names too many, what the thread names itself still counts.
 * `topicOf` folds the PBIs of one epic into one topic: a thread on an epic
 * works on all of them.
 */
export function referencedItemIds(
  thread: AgentThread,
  myItemIds: ReadonlySet<number>,
  itemsByPullRequest: ReadonlyMap<number, number[]>,
  knownIds: ReadonlySet<number> = myItemIds,
  topicOf: (id: number) => number = (id) => id,
): Set<number> {
  const own = ownReferences(thread, knownIds, itemsByPullRequest);
  const all = new Set(own);
  for (const id of thread.conversationReferences?.explicitIds ?? []) all.add(id);
  for (const id of thread.conversationReferences?.mentionedIds ?? []) {
    if (myItemIds.has(id)) all.add(id);
  }
  if (topics(all, topicOf) <= MAX_ITEMS_PER_THREAD) return all;
  return own.size > 0 && topics(own, topicOf) <= MAX_ITEMS_PER_THREAD ? own : all;
}

export interface ThreadLinks {
  threadsByItem: Map<number, AgentThread[]>;
  /** Open threads that point at no item at all. */
  unlinked: AgentThread[];
  /** The item of every thread, including items that aren't mine; tells busy slots from free ones. */
  itemOfThread: Map<string, number | null>;
}

/**
 * Links threads to my items. A link made by hand wins: that thread belongs to
 * that item only, and a thread unlinked by hand (item `null`) belongs to
 * nothing and is not offered as unlinked either.
 *
 * A subagent's items belong to the thread it works for: its task names the
 * item, the root thread is the one that runs and waits. A thread about an
 * item's parent (the epic of a PBI) works on the item too.
 */
export function linkThreads(
  myItems: readonly LinkableItem[],
  threads: readonly AgentThread[],
  manualLinks: ReadonlyMap<string, number | null>,
): ThreadLinks {
  const myItemIds = new Set(myItems.map((i) => i.id));
  const itemsByPullRequest = new Map<number, number[]>();
  const childrenOf = new Map<number, number[]>();
  for (const item of myItems) {
    for (const { number } of item.linkedPullRequests) {
      const linked = itemsByPullRequest.get(number) ?? [];
      if (!linked.includes(item.id)) itemsByPullRequest.set(number, [...linked, item.id]);
    }
    if (item.parentId !== null) {
      childrenOf.set(item.parentId, [...(childrenOf.get(item.parentId) ?? []), item.id]);
    }
  }
  const knownIds = new Set([...myItemIds, ...childrenOf.keys()]);
  const parentOf = new Map(myItems.map((item) => [item.id, item.parentId]));
  const topicOf = (id: number) => parentOf.get(id) ?? id;
  const referenced = (thread: AgentThread) =>
    referencedItemIds(thread, myItemIds, itemsByPullRequest, knownIds, topicOf);
  const tooMany = (ids: ReadonlySet<number>) => topics(ids, topicOf) > MAX_ITEMS_PER_THREAD;

  const roots = threads.filter((thread) => !thread.subagentOf);
  const rootIds = new Set(roots.map((thread) => thread.id));
  const fromSubagents = new Map<string, Set<number>>();
  for (const subagent of threads) {
    if (!subagent.subagentOf || !rootIds.has(subagent.subagentOf)) continue;
    const named = referenced(subagent);
    if (tooMany(named)) continue;
    const ids = fromSubagents.get(subagent.subagentOf) ?? new Set<number>();
    for (const id of named) ids.add(id);
    fromSubagents.set(subagent.subagentOf, ids);
  }

  const threadsByItem = new Map<number, AgentThread[]>(myItems.map((i) => [i.id, []]));
  const itemOfThread = new Map<string, number | null>();
  const unlinked: AgentThread[] = [];

  for (const thread of roots) {
    if (manualLinks.has(thread.id)) {
      const itemId = manualLinks.get(thread.id) ?? null;
      itemOfThread.set(thread.id, itemId);
      if (itemId !== null) threadsByItem.get(itemId)?.push(thread);
      continue;
    }
    const named = referenced(thread);
    const overview = tooMany(named);
    const ids = new Set([...(overview ? [] : named), ...(fromSubagents.get(thread.id) ?? [])]);
    for (const id of [...ids]) {
      for (const child of childrenOf.get(id) ?? []) ids.add(child);
    }
    if (ids.size === 0) {
      itemOfThread.set(thread.id, null);
      if (thread.open && !overview) unlinked.push(thread);
      continue;
    }
    const mine = [...ids].filter((id) => myItemIds.has(id));
    itemOfThread.set(thread.id, mine[0] ?? [...ids][0] ?? null);
    for (const id of mine) threadsByItem.get(id)?.push(thread);
  }

  for (const list of threadsByItem.values()) {
    list.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }
  return { threadsByItem, unlinked, itemOfThread };
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'that',
  'this',
  'fix',
  'add',
  'make',
  'update',
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

/** Best guess for an unlinked thread: the item whose title shares the most words with it. */
export function guessItem(
  thread: Pick<AgentThread, 'title' | 'branch'>,
  items: readonly { id: number; title: string }[],
): number | null {
  const threadWords = significantWords(`${thread.title} ${thread.branch ?? ''}`);
  let best: { id: number; score: number } | null = null;
  for (const item of items) {
    const itemWords = significantWords(item.title);
    const shared = [...threadWords].filter((word) => itemWords.has(word)).length;
    const score = shared / Math.max(1, Math.min(threadWords.size, itemWords.size));
    if (shared >= 2 && score >= 0.4 && (!best || score > best.score)) best = { id: item.id, score };
  }
  return best?.id ?? null;
}
