import type { T3Thread } from '../t3/source.ts';

// "AB#59463" in titles, messages and PR titles; "fix/59463-…" or "fix/AB59463-…" in branches.
const AB_REFERENCE = /\bAB#?(\d{4,6})\b/gi;
const ID_IN_BRANCH = /(?:^|\/)(?:AB)?(\d{5,6})(?=[-_]|$)/i;
const BARE_ID = /\b(\d{5})\b/g;

/** A thread that names more than this many items is an overview or triage thread, not work on one of them. */
export const MAX_ITEMS_PER_THREAD = 3;

export function referencedItemIds(thread: T3Thread, myItemIds: Set<number>, itemsByPullRequest: Map<number, number[]>): Set<number> {
  const ids = new Set<number>();
  for (const text of [thread.title, thread.firstUserMessage, ...thread.pullRequests.map((p) => p.title)]) {
    for (const m of text.matchAll(AB_REFERENCE)) ids.add(Number(m[1]));
  }
  for (const branch of [thread.branch, ...thread.pullRequests.map((p) => p.headBranch)]) {
    const m = branch ? ID_IN_BRANCH.exec(branch) : null;
    if (m) ids.add(Number(m[1]));
  }
  // "Please pick up 59541": a bare number only counts when it is one of my items.
  for (const text of [thread.title, thread.firstUserMessage]) {
    for (const m of text.matchAll(BARE_ID)) if (myItemIds.has(Number(m[1]))) ids.add(Number(m[1]));
  }
  for (const pr of thread.pullRequests) for (const id of itemsByPullRequest.get(pr.number) ?? []) ids.add(id);
  return ids;
}

export type Links = {
  threadsByItem: Map<number, T3Thread[]>;
  /** Open threads that point at no item at all. */
  unlinked: T3Thread[];
  /** Threads per item, including items that aren't mine; used to tell busy worktrees apart. */
  itemOfThread: Map<string, number | null>;
};

/**
 * Manual links win: a thread linked by hand belongs to that item only, and a thread unlinked by hand
 * (item null) belongs to nothing and is not offered as unlinked either.
 */
export function linkThreads(
  myItems: { id: number; linkedPullRequests: number[] }[],
  threads: T3Thread[],
  manualLinks: Map<string, number | null>,
): Links {
  const myItemIds = new Set(myItems.map((i) => i.id));
  const itemsByPullRequest = new Map<number, number[]>();
  for (const item of myItems) for (const n of item.linkedPullRequests) itemsByPullRequest.set(n, [...(itemsByPullRequest.get(n) ?? []), item.id]);

  const threadsByItem = new Map<number, T3Thread[]>(myItems.map((i) => [i.id, []]));
  const itemOfThread = new Map<string, number | null>();
  const unlinked: T3Thread[] = [];

  for (const thread of threads) {
    if (manualLinks.has(thread.id)) {
      const itemId = manualLinks.get(thread.id)!;
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
    itemOfThread.set(thread.id, mine[0] ?? [...ids][0]);
    for (const id of mine) threadsByItem.get(id)!.push(thread);
  }

  for (const list of threadsByItem.values()) list.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  return { threadsByItem, unlinked, itemOfThread };
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'horizon', 'fix', 'add', 'make', 'update']);
const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));

/** Best guess for an unlinked thread, by words shared between titles. */
export function guessItem(thread: T3Thread, items: { id: number; title: string }[]): number | null {
  const threadWords = words(`${thread.title} ${thread.branch ?? ''}`);
  let best: { id: number; score: number } | null = null;
  for (const item of items) {
    const itemWords = words(item.title);
    const shared = [...threadWords].filter((w) => itemWords.has(w)).length;
    const score = shared / Math.max(1, Math.min(threadWords.size, itemWords.size));
    if (shared >= 2 && score >= 0.4 && (!best || score > best.score)) best = { id: item.id, score };
  }
  return best?.id ?? null;
}
