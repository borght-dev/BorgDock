import type { PrDisplay, PrGroupBy, PrSortBy, SortDir } from './display';
import {
  AGE_LABEL,
  AGE_ORDER,
  type PrFacts,
  type PrStatusBucket,
  REVIEW_LABEL,
  REVIEW_ORDER,
  SIZE_GROUP_LABEL,
  SIZE_ORDER,
  STATUS_BUCKET_HINT,
  STATUS_BUCKET_LABEL,
  STATUS_BUCKET_ORDER,
  WAITING_LABEL,
  WAITING_ORDER,
} from './facts';

/** Key of the pinned "Your turn" group above the other groups. */
export const YOUR_TURN_GROUP_KEY = 'your-turn';

export interface PrGroupStats {
  yourTurn: number;
  failing: number;
  waiting: number;
  ready: number;
  draft: number;
  additions: number;
  deletions: number;
}

export interface PrGroupNode {
  /** Stable identity: collapse state, React keys, FLIP. */
  key: string;
  kind: PrGroupBy;
  label: string;
  facts: PrFacts[];
  /** Author groups: who. */
  author?: { login: string; isMe: boolean };
  /** Status groups: which bucket (the heading's mark). */
  bucket?: PrStatusBucket;
  /** One line on what puts a PR in this group. */
  hint?: string;
  /** The pinned "Your turn" group. */
  pinned?: boolean;
  /** Nothing in it is your turn. */
  quiet: boolean;
  stats: PrGroupStats;
  /** Groups by the display's `subGroupBy` inside this one; empty for one level. */
  subgroups: PrGroupNode[];
}

export function summarize(facts: readonly PrFacts[]): PrGroupStats {
  const stats: PrGroupStats = {
    yourTurn: 0,
    failing: 0,
    waiting: 0,
    ready: 0,
    draft: 0,
    additions: 0,
    deletions: 0,
  };
  for (const f of facts) {
    stats[f.bucket]++;
    stats.additions += f.pr.pullRequest.additions ?? 0;
    stats.deletions += f.pr.pullRequest.deletions ?? 0;
  }
  return stats;
}

/** Groupings with a fixed set of groups, in a fixed order. */
const FIXED_ORDER: Partial<Record<PrGroupBy, readonly string[]>> = {
  status: STATUS_BUCKET_ORDER,
  review: REVIEW_ORDER,
  waiting: WAITING_ORDER,
  age: AGE_ORDER,
  size: SIZE_ORDER,
};

/** The value a PR is grouped under; '' is the "no value" group (no label, no work item). */
export function groupValueOf(f: PrFacts, by: PrGroupBy): string {
  const p = f.pr.pullRequest;
  switch (by) {
    case 'none':
      return 'all';
    case 'status':
      return f.bucket;
    case 'author':
      return p.authorLogin.toLowerCase();
    case 'repo':
      return `${p.repoOwner}/${p.repoName}`;
    case 'review':
      return f.review;
    case 'waiting':
      return f.next.waitingOn;
    case 'workItem':
      return f.workItems.length > 0 ? String(Math.min(...f.workItems)) : '';
    case 'label':
      return [...p.labels].sort((a, b) => a.localeCompare(b))[0] ?? '';
    case 'base':
      return p.baseRef ?? '';
    case 'age':
      return f.age;
    case 'size':
      return f.size;
  }
}

function labelOf(by: PrGroupBy, value: string, sample: PrFacts | undefined): string {
  switch (by) {
    case 'none':
      return 'All pull requests';
    case 'status':
      return STATUS_BUCKET_LABEL[value as PrStatusBucket];
    case 'author':
      return sample?.pr.pullRequest.authorLogin ?? value;
    case 'repo':
      return value;
    case 'review':
      return REVIEW_LABEL[value as keyof typeof REVIEW_LABEL];
    case 'waiting':
      return WAITING_LABEL[value as keyof typeof WAITING_LABEL];
    case 'workItem':
      return value ? `AB#${value}` : 'No work item';
    case 'label':
      return value || 'No label';
    case 'base':
      return value || 'Unknown base';
    case 'age':
      return AGE_LABEL[value as keyof typeof AGE_LABEL];
    case 'size':
      return SIZE_GROUP_LABEL[value as keyof typeof SIZE_GROUP_LABEL];
  }
}

interface GroupOptions {
  /** Keep the empty groups of a fixed grouping. */
  showEmpty: boolean;
  /** Prefix of the keys: the parent group's key for sub-groups. */
  parentKey?: string;
}

/**
 * Bucket `facts` (already filtered and sorted; the order inside each group
 * is kept) by `by`. Group order:
 * - fixed groupings (status, review, waiting, age, size): their own order;
 * - author: me first, then most PRs, then login;
 * - repository: repositories with my PRs first, then by name;
 * - work item, label, base branch: most PRs first, the "none" group last.
 */
export function groupFacts(
  facts: readonly PrFacts[],
  by: PrGroupBy,
  options: GroupOptions,
): PrGroupNode[] {
  const buckets = new Map<string, PrFacts[]>();
  for (const f of facts) {
    const value = groupValueOf(f, by);
    const list = buckets.get(value);
    if (list) list.push(f);
    else buckets.set(value, [f]);
  }

  let values: string[];
  const fixed = FIXED_ORDER[by];
  if (fixed) {
    values = fixed.filter((v) => options.showEmpty || buckets.has(v));
  } else if (by === 'author') {
    values = [...buckets.keys()].sort((a, b) => {
      const aMine = buckets.get(a)![0]!.mine ? 0 : 1;
      const bMine = buckets.get(b)![0]!.mine ? 0 : 1;
      return aMine - bMine || buckets.get(b)!.length - buckets.get(a)!.length || a.localeCompare(b);
    });
  } else if (by === 'repo') {
    values = [...buckets.keys()].sort((a, b) => {
      const aMine = buckets.get(a)!.some((f) => f.mine) ? 0 : 1;
      const bMine = buckets.get(b)!.some((f) => f.mine) ? 0 : 1;
      return aMine - bMine || a.localeCompare(b);
    });
  } else {
    values = [...buckets.keys()].sort((a, b) => {
      if ((a === '') !== (b === '')) return a === '' ? 1 : -1;
      return buckets.get(b)!.length - buckets.get(a)!.length || a.localeCompare(b);
    });
  }

  const prefix = options.parentKey ? `${options.parentKey}/` : '';
  return values.map((value) => {
    const items = buckets.get(value) ?? [];
    const sample = items[0];
    const stats = summarize(items);
    return {
      key: `${prefix}${by}:${value}`,
      kind: by,
      label: labelOf(by, value, sample),
      facts: items,
      ...(by === 'author' && sample
        ? { author: { login: sample.pr.pullRequest.authorLogin, isMe: sample.mine } }
        : {}),
      ...(by === 'status'
        ? {
            bucket: value as PrStatusBucket,
            hint: STATUS_BUCKET_HINT[value as PrStatusBucket],
          }
        : {}),
      quiet: stats.yourTurn === 0,
      stats,
      subgroups: [],
    };
  });
}

export interface BuildGroupsOptions {
  /** Put a "Your turn" group first (filter All, a grouping that does not already lead with it). */
  pin: boolean;
  /** The board ignores sub-groups. */
  subGroups: boolean;
}

/** Whether the pinned "Your turn" group applies to this display. */
export function pinsYourTurn(display: PrDisplay): boolean {
  return (
    display.pinYourTurn &&
    display.layout !== 'board' &&
    display.groupBy !== 'status' &&
    display.groupBy !== 'author' &&
    display.groupBy !== 'none'
  );
}

/** The list's groups: an optional pinned "Your turn" group, then `display.groupBy`, each with its sub-groups. */
export function buildGroups(
  facts: readonly PrFacts[],
  display: PrDisplay,
  options: BuildGroupsOptions,
): PrGroupNode[] {
  const pinned = options.pin ? facts.filter((f) => f.yourTurn) : [];
  const rest = pinned.length > 0 ? facts.filter((f) => !f.yourTurn) : facts;
  const groups = groupFacts(rest, display.groupBy, { showEmpty: display.showEmptyGroups });
  const all: PrGroupNode[] =
    pinned.length > 0
      ? [
          {
            key: YOUR_TURN_GROUP_KEY,
            kind: display.groupBy,
            label: 'Your turn',
            facts: pinned,
            pinned: true,
            hint: STATUS_BUCKET_HINT.yourTurn,
            quiet: false,
            stats: summarize(pinned),
            subgroups: [],
          },
          ...groups,
        ]
      : groups;
  const sub = display.subGroupBy;
  if (!options.subGroups || sub === 'none' || sub === display.groupBy) return all;
  return all.map((group) => ({
    ...group,
    subgroups: groupFacts(group.facts, sub, { showEmpty: false, parentKey: group.key }),
  }));
}

/** A group is folded when the user folded it, or it is quiet under "collapse quiet groups" and was not opened. */
export function isGroupCollapsed(
  group: Pick<PrGroupNode, 'key' | 'quiet'>,
  collapsed: ReadonlySet<string>,
  expanded: ReadonlySet<string>,
  collapseQuiet: boolean,
): boolean {
  if (collapsed.has(group.key)) return true;
  return collapseQuiet && group.quiet && !expanded.has(group.key);
}

/** The PRs in screen order, skipping folded groups: what j / k walk through. */
export function visibleFacts(
  groups: readonly PrGroupNode[],
  isCollapsed: (group: PrGroupNode) => boolean,
): PrFacts[] {
  const out: PrFacts[] = [];
  for (const group of groups) {
    if (isCollapsed(group)) continue;
    if (group.subgroups.length === 0) {
      out.push(...group.facts);
      continue;
    }
    for (const sub of group.subgroups) if (!isCollapsed(sub)) out.push(...sub.facts);
  }
  return out;
}

const BUCKET_RANK: Record<PrStatusBucket, number> = {
  yourTurn: 4,
  ready: 3,
  failing: 2,
  waiting: 1,
  draft: 0,
};

function sortValue(f: PrFacts, sortBy: PrSortBy, focusScore: (f: PrFacts) => number): number {
  switch (sortBy) {
    case 'priority':
      return BUCKET_RANK[f.bucket] * 1000 + Math.min(999, focusScore(f));
    case 'updated':
      return f.updatedAt;
    case 'created':
      return f.createdAt;
    case 'size':
      return f.lines;
    case 'title':
      return 0;
  }
}

/**
 * `facts` in the chosen order. Ties: under Priority the PR waiting longest
 * (oldest) first, else the higher number first, so the order never jumps
 * between polls.
 */
export function sortFacts(
  facts: readonly PrFacts[],
  sortBy: PrSortBy,
  dir: SortDir,
  focusScore: (f: PrFacts) => number = () => 0,
): PrFacts[] {
  const sign = dir === 'asc' ? 1 : -1;
  const values = new Map(facts.map((f) => [f.key, sortValue(f, sortBy, focusScore)]));
  return [...facts].sort((a, b) => {
    if (sortBy === 'title') {
      const byTitle = a.pr.pullRequest.title.localeCompare(b.pr.pullRequest.title, undefined, {
        sensitivity: 'base',
      });
      if (byTitle !== 0) return byTitle * sign;
    } else {
      const diff = values.get(a.key)! - values.get(b.key)!;
      if (diff !== 0) return diff * sign;
      if (sortBy === 'priority' && a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    }
    return b.pr.pullRequest.number - a.pr.pullRequest.number;
  });
}
