/**
 * How the Pull requests list shows its PRs: layout, grouping, order, columns
 * and a few switches. One object, so a saved view can keep it whole and the
 * Display menu can tell when it differs from the default.
 */

export type PrLayout = 'list' | 'table' | 'board';

export type PrGroupBy =
  | 'none'
  | 'status'
  | 'author'
  | 'repo'
  | 'review'
  | 'waiting'
  | 'workItem'
  | 'label'
  | 'base'
  | 'age'
  | 'size';

export type PrSortBy = 'priority' | 'updated' | 'created' | 'title' | 'size';

export type SortDir = 'asc' | 'desc';

/** Optional table columns; the title column is always there. */
export type PrColumn =
  | 'checks'
  | 'reviews'
  | 'next'
  | 'size'
  | 'updated'
  | 'created'
  | 'repo'
  | 'author'
  | 'number';

export interface PrDisplay {
  layout: PrLayout;
  groupBy: PrGroupBy;
  /** Groups inside each group; `none` for one level. Not used by the board. */
  subGroupBy: PrGroupBy;
  sortBy: PrSortBy;
  sortDir: SortDir;
  /** A "Your turn" group above the groups (filter All; not for Status, Author or no grouping). */
  pinYourTurn: boolean;
  /** Groups with nothing for you start collapsed. */
  collapseQuiet: boolean;
  /** Fixed groupings (status, review, waiting, age, size) keep their empty groups. */
  showEmptyGroups: boolean;
  /** Table columns, in table order. */
  columns: PrColumn[];
}

export const GROUP_OPTIONS: ReadonlyArray<{ value: PrGroupBy; label: string; hint?: string }> = [
  { value: 'status', label: 'Status', hint: 'Your turn, failing, waiting, ready, draft' },
  { value: 'author', label: 'Author' },
  { value: 'repo', label: 'Repository' },
  { value: 'review', label: 'Review state', hint: 'Awaiting you, changes requested, approved…' },
  { value: 'waiting', label: 'Waiting on', hint: 'Who acts next: you, the author, reviewers, CI' },
  { value: 'workItem', label: 'Work item', hint: 'By the AB# it names' },
  { value: 'label', label: 'Label' },
  { value: 'base', label: 'Base branch' },
  { value: 'age', label: 'Age', hint: 'Opened today, this week, this month, older' },
  { value: 'size', label: 'Size', hint: 'XS to XL by lines changed' },
  { value: 'none', label: 'No grouping' },
];

export const SORT_OPTIONS: ReadonlyArray<{
  value: PrSortBy;
  label: string;
  hint?: string;
  dir: SortDir;
}> = [
  {
    value: 'priority',
    label: 'Priority',
    hint: 'Your turn first, then ready, failing, waiting',
    dir: 'desc',
  },
  { value: 'updated', label: 'Last updated', dir: 'desc' },
  { value: 'created', label: 'Created', dir: 'desc' },
  { value: 'title', label: 'Title', dir: 'asc' },
  { value: 'size', label: 'Size', hint: 'Lines changed', dir: 'desc' },
];

export const LAYOUT_OPTIONS: ReadonlyArray<{ value: PrLayout; label: string }> = [
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
  { value: 'board', label: 'Board' },
];

export const COLUMN_OPTIONS: ReadonlyArray<{ value: PrColumn; label: string }> = [
  { value: 'checks', label: 'Checks' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'next', label: 'Next step' },
  { value: 'size', label: 'Size' },
  { value: 'updated', label: 'Updated' },
  { value: 'created', label: 'Created' },
  { value: 'repo', label: 'Repository' },
  { value: 'author', label: 'Author' },
  { value: 'number', label: 'Number' },
];

export const DEFAULT_COLUMNS: readonly PrColumn[] = [
  'checks',
  'reviews',
  'next',
  'size',
  'updated',
];

export const DEFAULT_DISPLAY: PrDisplay = {
  layout: 'table',
  groupBy: 'status',
  subGroupBy: 'none',
  sortBy: 'priority',
  sortDir: 'desc',
  pinYourTurn: true,
  collapseQuiet: false,
  showEmptyGroups: false,
  columns: [...DEFAULT_COLUMNS],
};

/** Column widths in the table's grid; the title takes the rest. */
export const COLUMN_WIDTH: Record<PrColumn, string> = {
  checks: '184px',
  reviews: '148px',
  next: '156px',
  size: '96px',
  updated: '64px',
  created: '64px',
  repo: '120px',
  author: '120px',
  number: '60px',
};

/** The table's `grid-template-columns`: status mark, title, then each visible column. */
export function tableTemplate(columns: readonly PrColumn[]): string {
  return ['14px', 'minmax(220px, 1fr)', ...columns.map((c) => COLUMN_WIDTH[c])].join(' ');
}

/** Columns the table shows: the chosen ones, without the one the rows are grouped by. */
export function visibleColumns(display: PrDisplay): PrColumn[] {
  return display.columns.filter(
    (c) =>
      !(c === 'author' && display.groupBy === 'author') &&
      !(c === 'repo' && display.groupBy === 'repo'),
  );
}

export function defaultDirOf(sortBy: PrSortBy): SortDir {
  return SORT_OPTIONS.find((o) => o.value === sortBy)?.dir ?? 'desc';
}

const LAYOUTS = new Set<string>(LAYOUT_OPTIONS.map((o) => o.value));
const GROUPS = new Set<string>(GROUP_OPTIONS.map((o) => o.value));
const SORTS = new Set<string>(SORT_OPTIONS.map((o) => o.value));
const COLUMNS = new Set<string>(COLUMN_OPTIONS.map((o) => o.value));

function pick<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? (value as T) : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * A display read back from disk, with every missing or unknown field set to
 * the default (an older version wrote fewer fields; a newer one may write
 * values this version does not know).
 */
export function sanitizeDisplay(value: unknown, base: PrDisplay = DEFAULT_DISPLAY): PrDisplay {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const sortBy = pick<PrSortBy>(v.sortBy, SORTS, base.sortBy);
  const columns = Array.isArray(v.columns)
    ? [...new Set(v.columns.filter((c): c is PrColumn => typeof c === 'string' && COLUMNS.has(c)))]
    : [...base.columns];
  return {
    layout: pick<PrLayout>(v.layout, LAYOUTS, base.layout),
    groupBy: pick<PrGroupBy>(v.groupBy, GROUPS, base.groupBy),
    subGroupBy: pick<PrGroupBy>(v.subGroupBy, GROUPS, base.subGroupBy),
    sortBy,
    sortDir:
      v.sortDir === 'asc' || v.sortDir === 'desc'
        ? v.sortDir
        : sortBy === base.sortBy
          ? base.sortDir
          : defaultDirOf(sortBy),
    pinYourTurn: flag(v.pinYourTurn, base.pinYourTurn),
    collapseQuiet: flag(v.collapseQuiet, base.collapseQuiet),
    showEmptyGroups: flag(v.showEmptyGroups, base.showEmptyGroups),
    columns,
  };
}

export function sameDisplay(a: PrDisplay, b: PrDisplay): boolean {
  return (
    a.layout === b.layout &&
    a.groupBy === b.groupBy &&
    a.subGroupBy === b.subGroupBy &&
    a.sortBy === b.sortBy &&
    a.sortDir === b.sortDir &&
    a.pinYourTurn === b.pinYourTurn &&
    a.collapseQuiet === b.collapseQuiet &&
    a.showEmptyGroups === b.showEmptyGroups &&
    a.columns.length === b.columns.length &&
    a.columns.every((c, i) => b.columns[i] === c)
  );
}

export function groupLabelOf(groupBy: PrGroupBy): string {
  return GROUP_OPTIONS.find((o) => o.value === groupBy)?.label ?? 'Status';
}

export function sortLabelOf(sortBy: PrSortBy): string {
  return SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? 'Priority';
}

/** "Newest first", "A to Z", "Largest first", "Most urgent first" for the order's direction. */
export function directionLabel(sortBy: PrSortBy, dir: SortDir): string {
  switch (sortBy) {
    case 'title':
      return dir === 'asc' ? 'A to Z' : 'Z to A';
    case 'priority':
      return dir === 'desc' ? 'Most urgent first' : 'Least urgent first';
    case 'size':
      return dir === 'desc' ? 'Largest first' : 'Smallest first';
    default:
      return dir === 'desc' ? 'Newest first' : 'Oldest first';
  }
}
