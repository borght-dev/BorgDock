/**
 * Daily notes: `Daily/YYYY-MM-DD.md`, made the first time something opens
 * today's note. A new daily note gets one "Since yesterday" block from the
 * Activity journal, written once, at creation; a note another machine
 * already made gets none.
 */
import { listEntries } from '@/services/activity/api';
import type { ActivityEntry } from '@/services/activity/types';
import { useNotesStore } from '@/stores/notes-store';
import { titleOf } from './parse';
import { dailyPath, dayKey, isDailyPath, TEMPLATES_FOLDER } from './paths';
import { fillTemplate, markerBlock } from './text-edits';

/** The digest lists at most this many events. */
const DIGEST_LIMIT = 30;
/** And looks back at most this far. */
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_TEMPLATE = `${TEMPLATES_FOLDER}/Daily.md`;

export function dailyTitle(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** When the digest starts: the start of the previous daily note's day, at most a week back. */
export function digestSince(paths: Iterable<string>, today: Date): Date {
  const todayKey = dayKey(today);
  const earlier = [...paths]
    .filter(isDailyPath)
    .map(titleOf)
    .filter((key) => key < todayKey)
    .sort();
  const floor = new Date(today.getTime() - LOOKBACK_MS);
  const previous = earlier.at(-1);
  if (!previous) return new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const [y, m, d] = previous.split('-').map(Number);
  const start = new Date(y!, m! - 1, d!);
  return start < floor ? floor : start;
}

/** An activity entry as a line, with a short ref where the entity has one so its chip draws. */
export function digestLine(entry: Pick<ActivityEntry, 'summary' | 'entity'>): string {
  const key = entry.entity.key;
  const pr = /^gh:([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(key);
  const item = /^ado:[^:]+:(\d+)$/.exec(key);
  const ref = pr ? `${pr[1]}/${pr[2]}#${pr[3]}` : item ? `AB#${item[1]}` : null;
  const summary = entry.summary.trim();
  return ref && !summary.includes(ref) ? `- ${ref} · ${summary}` : `- ${summary}`;
}

/** The events since `since`, newest first, from the Activity journal. */
export async function activitySince(since: Date): Promise<ActivityEntry[]> {
  const found: ActivityEntry[] = [];
  let before: { observedAt: string; id: string } | null = null;
  for (let page = 0; page < 5 && found.length < DIGEST_LIMIT; page++) {
    const result = await listEntries({
      filter: 'all',
      categories: [],
      sourceIds: [],
      entityKeys: [],
      includeDismissed: true,
      limit: 100,
      before,
    });
    for (const entry of result.entries) {
      if (new Date(entry.observedAt) < since) return found;
      if (entry.category !== 'activity.rollup') found.push(entry);
    }
    const last = result.entries.at(-1);
    if (!last || result.entries.length < 100) break;
    before = { observedAt: last.observedAt, id: last.id };
  }
  return found.slice(0, DIGEST_LIMIT);
}

export function sinceBlock(
  entries: readonly Pick<ActivityEntry, 'summary' | 'entity'>[],
  day: string,
) {
  if (!entries.length) return [];
  return ['## Since yesterday', ...markerBlock(`since ${day}`, entries.map(digestLine)), ''];
}

/** What a new daily note starts with. */
export async function dailyText(date: Date, entries: readonly ActivityEntry[]): Promise<string> {
  const state = useNotesStore.getState();
  const template = state.texts[DAILY_TEMPLATE];
  const title = dailyTitle(date);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const head = template
    ? fillTemplate(template, { date: dayKey(date), time, title })
        .trimEnd()
        .split(/\r?\n/)
    : [`# ${title}`, ''];
  return [...head, '', ...sinceBlock(entries, dayKey(date))].join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Today's daily note, made when it doesn't exist yet; its path. A failure
 * to read Activity leaves the digest out rather than the note.
 */
export async function ensureDailyNote(date = new Date()): Promise<string> {
  const path = dailyPath(date);
  const state = useNotesStore.getState();
  if (state.texts[path] !== undefined) return path;
  const since = digestSince(Object.keys(state.texts), date);
  const entries = await activitySince(since).catch(() => []);
  const text = await dailyText(date, entries);
  await state.update(path, (current) => (current === null ? text : null));
  return path;
}
