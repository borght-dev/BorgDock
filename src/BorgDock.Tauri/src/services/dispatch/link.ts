import { abReferences } from '@/services/work-item-linker';
import type { AgentThread } from './types';

/** "AB59463" without the hash, as branch names and agents write it. */
const AB_WITHOUT_HASH = /\bAB(\d{3,7})\b/gi;
/** "fix/59463-…" or "fix/AB59463-…". */
const ID_IN_BRANCH = /(?:^|\/)(?:AB#?)?(\d{3,7})(?=[-_]|$)/i;
const BARE_NUMBER = /\b(\d{3,7})\b/g;

/** A number this long is unlikely to be anything but a work item id. */
const UNAMBIGUOUS_DIGITS = 5;

/** A thread that names more than this many items is an overview or triage thread, not work on one of them. */
export const MAX_ITEMS_PER_THREAD = 3;

/**
 * The work items a thread refers to: `AB#123` across its conversation, title and
 * pull request titles, an id in its branch names, and the items its pull
 * requests are linked to. A short or bare number only counts when it is one
 * of my items ("pick up 59541", "release/2026-10").
 */
export function referencedItemIds(
  thread: AgentThread,
  myItemIds: ReadonlySet<number>,
  itemsByPullRequest: ReadonlyMap<number, number[]>,
): Set<number> {
  const ids = new Set<number>();
  for (const id of thread.conversationReferences?.explicitIds ?? []) ids.add(id);
  for (const id of thread.conversationReferences?.mentionedIds ?? []) {
    if (myItemIds.has(id)) ids.add(id);
  }
  const addLoose = (digits: string) => {
    const id = Number(digits);
    if (digits.length >= UNAMBIGUOUS_DIGITS || myItemIds.has(id)) ids.add(id);
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
      if (myItemIds.has(Number(match[1]))) ids.add(Number(match[1]));
    }
  }
  for (const pr of thread.pullRequests) {
    for (const id of itemsByPullRequest.get(pr.number) ?? []) ids.add(id);
  }
  return ids;
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
 */
export function linkThreads(
  myItems: readonly { id: number; linkedPullRequests: number[] }[],
  threads: readonly AgentThread[],
  manualLinks: ReadonlyMap<string, number | null>,
): ThreadLinks {
  const myItemIds = new Set(myItems.map((i) => i.id));
  const itemsByPullRequest = new Map<number, number[]>();
  for (const item of myItems) {
    for (const number of item.linkedPullRequests) {
      itemsByPullRequest.set(number, [...(itemsByPullRequest.get(number) ?? []), item.id]);
    }
  }

  const threadsByItem = new Map<number, AgentThread[]>(myItems.map((i) => [i.id, []]));
  const itemOfThread = new Map<string, number | null>();
  const unlinked: AgentThread[] = [];

  for (const thread of threads) {
    if (manualLinks.has(thread.id)) {
      const itemId = manualLinks.get(thread.id) ?? null;
      itemOfThread.set(thread.id, itemId);
      if (itemId !== null) threadsByItem.get(itemId)?.push(thread);
      continue;
    }
    const ids = referencedItemIds(thread, myItemIds, itemsByPullRequest);
    if (ids.size === 0) {
      itemOfThread.set(thread.id, null);
      if (thread.open) unlinked.push(thread);
      continue;
    }
    if (ids.size > MAX_ITEMS_PER_THREAD) {
      itemOfThread.set(thread.id, null);
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
