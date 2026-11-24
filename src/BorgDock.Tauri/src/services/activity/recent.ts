import { whenOf } from '@/components/activity/rows';
import { parseScope } from '@/services/github/scope';
import { formatAgo } from '@/utils/relative-time';
import { plural, timeOfDay } from './copy';
import type { ActivityEntry } from './types';

/**
 * What the Recent card behind the rail's bell shows: the entries that need
 * me now, and what else happened today. Pure; the card reads the journal.
 */

/** At most this many entries that need me are named. */
export const NEEDS_YOU_SHOWN = 5;
/** At most this many rows under "Earlier today". */
export const EARLIER_SHOWN = 6;
/** How much of the journal's newest end is read to find today's entries. */
export const TODAY_PAGE = 100;

export type RecentTone = 'red' | 'amber' | 'accent' | 'green' | 'gray';

type Timed = Pick<ActivityEntry, 'sourceAt' | 'observedAt'>;

/** The entry still needs me: nobody read it and its fact has not ended. */
export function needsYouNow(entry: Pick<ActivityEntry, 'read' | 'needsYou' | 'status'>): boolean {
  return entry.read === 'unread' && entry.needsYou && entry.status === 'open';
}

/** The dot of an entry that needs me: red fails, a review request is the accent, the rest waits. */
export function toneOf(entry: Pick<ActivityEntry, 'severity' | 'category'>): RecentTone {
  if (entry.severity === 'error') return 'red';
  if (entry.category === 'pr.review-request') return 'accent';
  if (entry.severity === 'warning') return 'amber';
  return entry.severity === 'success' ? 'green' : 'gray';
}

const PR_URL = /github\.com\/([^/]+\/[^/]+)\/pull\//i;
const PR_KEY = /^gh:([^#]+)#/;

function repositoryOf(entry: Pick<ActivityEntry, 'entity' | 'sourceId'>): string | null {
  const fromUrl = entry.entity.url?.match(PR_URL)?.[1];
  if (fromUrl) return fromUrl;
  const scope = parseScope(entry.sourceId.slice(entry.sourceId.indexOf(':') + 1));
  if (scope) return `${scope.owner}/${scope.repo}`;
  return entry.entity.key.match(PR_KEY)?.[1] ?? null;
}

/**
 * Where an entry happened, as the card's second line names it: the
 * repository of a pull request, a deploy or a CI failure; a thread with the
 * machine it runs on; a work item by its number.
 */
export function whereOf(
  entry: Pick<ActivityEntry, 'entity' | 'sourceId' | 'links'>,
  sourceLabel: string | null,
): string {
  switch (entry.entity.kind) {
    case 'thread':
      return [entry.entity.title, sourceLabel].filter(Boolean).join(' · ');
    case 'workitem': {
      const [itemId] = entry.links.itemIds;
      return itemId ? `AB#${itemId}` : entry.entity.title;
    }
    case 'pr':
    case 'deployment':
    case 'ci-group':
      return repositoryOf(entry) ?? sourceLabel ?? entry.entity.title;
    default:
      return sourceLabel ?? entry.entity.title;
  }
}

/** "acme/storefront · 14 min ago": where and how long ago. */
export function whereAndWhen(
  entry: Pick<ActivityEntry, 'entity' | 'sourceId' | 'links'> & Timed,
  sourceLabel: string | null,
  now: number,
): string {
  return [whereOf(entry, sourceLabel), formatAgo(whenOf(entry), now)].filter(Boolean).join(' · ');
}

function sameDay(iso: string, now: Date): boolean {
  return new Date(iso).toDateString() === now.toDateString();
}

/** "since 09:12": when I last looked; the weekday too when that was another day. */
export function sinceLabel(visitedAt: string | null, now: Date): string | null {
  if (!visitedAt) return null;
  const time = new Date(visitedAt);
  if (Number.isNaN(time.getTime())) return null;
  if (sameDay(visitedAt, now)) return `since ${timeOfDay(visitedAt)}`;
  return `since ${time.toLocaleDateString([], { weekday: 'short' })} ${timeOfDay(visitedAt)}`;
}

export interface EarlierRow {
  key: string;
  tone: RecentTone;
  summary: string;
  /** `14:02`, local time. */
  time: string;
  /** The entry to show in history; null for a line that counts several. */
  entryId: string | null;
}

/** A CI failure group that grew without one of my PRs in it: counted, never named. */
function isQuietGrowth(entry: Pick<ActivityEntry, 'category' | 'needsYou'>): boolean {
  return entry.category === 'ci.group-grew' && !entry.needsYou;
}

function belongsToEarlier(entry: ActivityEntry, now: Date): boolean {
  if (!sameDay(whenOf(entry), now) || entry.read === 'dismissed') return false;
  if (entry.category === 'activity.rollup' || needsYouNow(entry)) return false;
  // What needed me and ended is told by what ended it: the merge, the passing checks.
  return !(entry.needsYou && entry.status !== 'open');
}

/**
 * "Earlier today": the newest entries of today that need nothing, in the
 * order they happened, each with its time. CI failure groups that grew
 * without one of my PRs are one line with their count, at the last one's time.
 */
export function earlierToday(
  entries: readonly ActivityEntry[],
  now: Date,
  limit: number = EARLIER_SHOWN,
): EarlierRow[] {
  const today = entries
    .filter((entry) => belongsToEarlier(entry, now))
    .sort((a, b) => whenOf(b).localeCompare(whenOf(a)));
  const grew = today.filter(isQuietGrowth);
  const rows: EarlierRow[] = [];
  for (const entry of today) {
    if (isQuietGrowth(entry)) {
      if (entry !== grew[0]) continue;
      rows.push({
        key: 'ci-groups-grew',
        tone: 'gray',
        summary: `${plural(grew.length, 'CI failure group')} grew, none on your PRs`,
        time: timeOfDay(whenOf(entry)),
        entryId: grew.length === 1 ? entry.id : null,
      });
      continue;
    }
    rows.push({
      key: entry.id,
      tone: entry.needsYou ? toneOf(entry) : entry.severity === 'success' ? 'green' : 'gray',
      summary: entry.summary,
      time: timeOfDay(whenOf(entry)),
      entryId: entry.id,
    });
  }
  return rows.slice(0, limit).reverse();
}
