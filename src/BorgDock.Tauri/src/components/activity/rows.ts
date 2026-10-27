import type { ActivityEntry } from '@/services/activity/types';

export type ActivityListRow =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'entry';
      key: string;
      entry: ActivityEntry;
      /** `<day>|<entity key>`: the fold this row heads or sits in. */
      group: string;
      /** On the head row: how many more of the same entity that day are folded under it. */
      folded: number;
      /** A row shown inside an open fold. */
      child: boolean;
    };

/** When it happened: the source's time where it has one. */
export function whenOf(entry: Pick<ActivityEntry, 'sourceAt' | 'observedAt'>): string {
  return entry.sourceAt ?? entry.observedAt;
}

function dayKey(iso: string): string {
  const time = new Date(iso);
  return `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()}`;
}

/** The `<day>|<entity key>` fold an entry is drawn in. */
export function foldOf(entry: Pick<ActivityEntry, 'sourceAt' | 'observedAt' | 'entity'>): string {
  return `${dayKey(whenOf(entry))}|${entry.entity.key}`;
}

export function dayLabel(iso: string, now: Date): string {
  const time = new Date(iso);
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  const key = dayKey(iso);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return time.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(time.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/**
 * The list as drawn: a heading per day, and per day one row per entity,
 * the newest first, with the entity's other updates that day folded under
 * it ("3 updates") until the fold is opened.
 */
export function buildRows(
  entries: readonly ActivityEntry[],
  openGroups: ReadonlySet<string>,
  now: Date,
): ActivityListRow[] {
  const rows: ActivityListRow[] = [];
  const byDay = new Map<string, Map<string, ActivityEntry[]>>();
  const dayOrder: string[] = [];
  for (const entry of entries) {
    const day = dayKey(whenOf(entry));
    let entities = byDay.get(day);
    if (!entities) {
      entities = new Map();
      byDay.set(day, entities);
      dayOrder.push(day);
    }
    const key = entry.entity.key;
    entities.set(key, [...(entities.get(key) ?? []), entry]);
  }
  for (const day of dayOrder) {
    const entities = byDay.get(day)!;
    const first = [...entities.values()][0]![0]!;
    rows.push({ kind: 'day', key: `day:${day}`, label: dayLabel(whenOf(first), now) });
    for (const [entity, group] of entities) {
      const sorted = [...group].sort((a, b) => whenOf(b).localeCompare(whenOf(a)));
      const fold = `${day}|${entity}`;
      const [head, ...rest] = sorted;
      rows.push({
        kind: 'entry',
        key: head!.id,
        entry: head!,
        group: fold,
        folded: rest.length,
        child: false,
      });
      if (openGroups.has(fold)) {
        for (const entry of rest) {
          rows.push({ kind: 'entry', key: entry.id, entry, group: fold, folded: 0, child: true });
        }
      }
    }
  }
  return rows;
}

/** The entry rows in drawn order, for J/K. */
export function entryRows(rows: readonly ActivityListRow[]) {
  return rows.filter(
    (row): row is Extract<ActivityListRow, { kind: 'entry' }> => row.kind === 'entry',
  );
}
