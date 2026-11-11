import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY,
  defaultDirOf,
  directionLabel,
  groupLabelOf,
  type PrDisplay,
  type PrSortBy,
  type SortDir,
  sameDisplay,
  sanitizeDisplay,
  sortLabelOf,
  tableTemplate,
  visibleColumns,
} from '../display';

const CUSTOM: PrDisplay = {
  layout: 'board',
  groupBy: 'repo',
  subGroupBy: 'status',
  sortBy: 'title',
  sortDir: 'desc',
  pinYourTurn: false,
  collapseQuiet: true,
  showEmptyGroups: true,
  columns: ['author', 'checks'],
};

describe('tableTemplate', () => {
  it('puts the status mark and the title before each column', () => {
    expect(tableTemplate([])).toBe('14px minmax(220px, 1fr)');
    expect(tableTemplate(['checks', 'size', 'number'])).toBe(
      '14px minmax(220px, 1fr) 184px 96px 60px',
    );
  });
});

describe('visibleColumns', () => {
  const columns: PrDisplay['columns'] = ['checks', 'repo', 'author', 'updated'];

  it('shows every chosen column, in order', () => {
    expect(visibleColumns({ ...DEFAULT_DISPLAY, groupBy: 'status', columns })).toEqual(columns);
  });

  it('leaves out the column the rows are grouped by', () => {
    expect(visibleColumns({ ...DEFAULT_DISPLAY, groupBy: 'author', columns })).toEqual([
      'checks',
      'repo',
      'updated',
    ]);
    expect(visibleColumns({ ...DEFAULT_DISPLAY, groupBy: 'repo', columns })).toEqual([
      'checks',
      'author',
      'updated',
    ]);
  });
});

describe('defaultDirOf', () => {
  it.each<[PrSortBy, SortDir]>([
    ['priority', 'desc'],
    ['updated', 'desc'],
    ['created', 'desc'],
    ['title', 'asc'],
    ['size', 'desc'],
  ])('sorts %s %s by default', (sortBy, dir) => {
    expect(defaultDirOf(sortBy)).toBe(dir);
  });

  it('falls back to descending for an unknown order', () => {
    expect(defaultDirOf('bogus' as PrSortBy)).toBe('desc');
  });
});

describe('directionLabel', () => {
  it.each<[PrSortBy, SortDir, string]>([
    ['title', 'asc', 'A to Z'],
    ['title', 'desc', 'Z to A'],
    ['priority', 'desc', 'Most urgent first'],
    ['priority', 'asc', 'Least urgent first'],
    ['size', 'desc', 'Largest first'],
    ['size', 'asc', 'Smallest first'],
    ['updated', 'desc', 'Newest first'],
    ['updated', 'asc', 'Oldest first'],
    ['created', 'desc', 'Newest first'],
    ['created', 'asc', 'Oldest first'],
  ])('reads %s %s as %s', (sortBy, dir, label) => {
    expect(directionLabel(sortBy, dir)).toBe(label);
  });
});

describe('labels', () => {
  it('names a grouping and an order, with a fallback for unknown ones', () => {
    expect(groupLabelOf('repo')).toBe('Repository');
    expect(groupLabelOf('none')).toBe('No grouping');
    expect(groupLabelOf('bogus' as PrDisplay['groupBy'])).toBe('Status');
    expect(sortLabelOf('updated')).toBe('Last updated');
    expect(sortLabelOf('bogus' as PrSortBy)).toBe('Priority');
  });
});

describe('sanitizeDisplay', () => {
  it.each([undefined, null, 'table', 42, true])('reads %j as the default', (value) => {
    const display = sanitizeDisplay(value);
    expect(display).toEqual(DEFAULT_DISPLAY);
    expect(display.columns).not.toBe(DEFAULT_DISPLAY.columns);
  });

  it('keeps a valid display whole', () => {
    expect(sanitizeDisplay(CUSTOM)).toEqual(CUSTOM);
  });

  it('sets each missing or unknown field to the default', () => {
    expect(
      sanitizeDisplay({
        layout: 'kanban',
        groupBy: 'colour',
        subGroupBy: 7,
        sortBy: 'stars',
        sortDir: 'sideways',
        pinYourTurn: 'yes',
        collapseQuiet: null,
        showEmptyGroups: 1,
        columns: 'checks',
      }),
    ).toEqual(DEFAULT_DISPLAY);
  });

  it('reads what an older version wrote, filling the rest', () => {
    expect(sanitizeDisplay({ layout: 'list', groupBy: 'author' })).toEqual({
      ...DEFAULT_DISPLAY,
      layout: 'list',
      groupBy: 'author',
    });
  });

  it('drops unknown and repeated columns and keeps the order', () => {
    expect(
      sanitizeDisplay({ columns: ['size', 'stars', 'checks', 3, 'size', null] }).columns,
    ).toEqual(['size', 'checks']);
  });

  it('keeps a table with every optional column hidden', () => {
    expect(sanitizeDisplay({ columns: [] }).columns).toEqual([]);
  });

  it("gives a missing or unknown direction the order's own direction", () => {
    expect(sanitizeDisplay({ sortBy: 'title' }).sortDir).toBe('asc');
    expect(sanitizeDisplay({ sortBy: 'title', sortDir: 'up' }).sortDir).toBe('asc');
    expect(sanitizeDisplay({ sortBy: 'updated' }).sortDir).toBe('desc');
    expect(sanitizeDisplay({ sortBy: 'title', sortDir: 'desc' }).sortDir).toBe('desc');
  });

  it('fills from the given base instead of the default, its direction included', () => {
    expect(sanitizeDisplay({ layout: 'list' }, CUSTOM)).toEqual({ ...CUSTOM, layout: 'list' });
  });

  it("gives an order that differs from the base's its own direction", () => {
    const base: PrDisplay = { ...CUSTOM, sortBy: 'updated', sortDir: 'asc' };
    expect(sanitizeDisplay({ sortBy: 'size' }, base).sortDir).toBe('desc');
  });
});

describe('sameDisplay', () => {
  it('is true for equal copies', () => {
    expect(sameDisplay(DEFAULT_DISPLAY, sanitizeDisplay(undefined))).toBe(true);
    expect(sameDisplay(CUSTOM, { ...CUSTOM, columns: [...CUSTOM.columns] })).toBe(true);
  });

  it.each<[string, Partial<PrDisplay>]>([
    ['layout', { layout: 'list' }],
    ['groupBy', { groupBy: 'author' }],
    ['subGroupBy', { subGroupBy: 'repo' }],
    ['sortBy', { sortBy: 'updated' }],
    ['sortDir', { sortDir: 'asc' }],
    ['pinYourTurn', { pinYourTurn: false }],
    ['collapseQuiet', { collapseQuiet: true }],
    ['showEmptyGroups', { showEmptyGroups: true }],
    ['columns', { columns: ['checks'] }],
    ['column order', { columns: ['reviews', 'checks', 'next', 'size', 'updated'] }],
  ])('is false when %s differs', (_, change) => {
    expect(sameDisplay(DEFAULT_DISPLAY, { ...DEFAULT_DISPLAY, ...change })).toBe(false);
  });
});
