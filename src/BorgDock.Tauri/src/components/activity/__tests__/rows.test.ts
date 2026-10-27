import { describe, expect, it } from 'vitest';
import {
  checksEntry,
  FIXTURE_ENTRIES,
  FIXTURE_NOW,
  reviewEntry,
} from '@/services/activity/__fixtures__/entries';
import { buildRows, entryRows } from '../rows';

describe('buildRows', () => {
  it('groups by day and folds one entity’s updates of a day under its newest', () => {
    const rows = buildRows(FIXTURE_ENTRIES, new Set(), FIXTURE_NOW);
    expect(rows.filter((row) => row.kind === 'day').map((row) => row.label)).toEqual([
      'Today',
      'Yesterday',
    ]);
    const review = entryRows(rows).find((row) => row.entry.id === reviewEntry.id);
    expect(review?.folded).toBe(1);
    expect(entryRows(rows).some((row) => row.entry.id === checksEntry.id)).toBe(false);
  });

  it('shows the folded updates once the fold is open', () => {
    const closed = buildRows(FIXTURE_ENTRIES, new Set(), FIXTURE_NOW);
    const group = entryRows(closed).find((row) => row.entry.id === reviewEntry.id)!.group;
    const open = entryRows(buildRows(FIXTURE_ENTRIES, new Set([group]), FIXTURE_NOW));
    const child = open.find((row) => row.entry.id === checksEntry.id);
    expect(child?.child).toBe(true);
    expect(open.indexOf(child!)).toBe(open.findIndex((row) => row.entry.id === reviewEntry.id) + 1);
  });
});
