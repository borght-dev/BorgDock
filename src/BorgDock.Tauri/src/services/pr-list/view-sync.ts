import { sanitizeSavedView } from './facets';

/**
 * Saved views shared with BorgDock for iPhone's server, which keeps one list
 * and only compares and sets. The merge and the decisions are pure and the
 * same on both clients. Spec: `docs/superpowers/specs/2026-11-22-ios-pr-list.md`,
 * "Saved view sync".
 */

/** A saved view as the server keeps it. A local `SavedPrView` is one too. */
export interface SharedView {
  id: string;
  name: string;
  filter: string;
  query: string;
  display: unknown;
}

/** The list as the server last answered: its revision and its views as sent. */
export interface ViewsBase {
  revision: number;
  views: SharedView[];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Views compare by their JSON as this version reads them, so a view taken
 * from the server and kept here (name trimmed, display repaired) is the same
 * view and never counts as edited here.
 */
export function sameView(a: SharedView, b: SharedView): boolean {
  return canonicalJson(sanitizeSavedView(a)) === canonicalJson(sanitizeSavedView(b));
}

export function sameViews(a: readonly SharedView[], b: readonly SharedView[]): boolean {
  return a.length === b.length && a.every((view, i) => b[i] !== undefined && sameView(view, b[i]));
}

/**
 * Three-way merge of the views changed here (`mine`) and on the server
 * (`theirs`) since both were `base`:
 *
 * 1. Start from `theirs` in its order.
 * 2. A view in `mine` and not in `base` was added here: append it (unless `theirs` has that id, then rule 4).
 * 3. A view in `base` and not in `mine` was deleted here: drop it.
 * 4. A view in `mine` that differs from its `base` copy was edited here: it replaces `theirs`' copy, or comes
 *    back at the end if `theirs` deleted it.
 * 5. Everything else is `theirs`.
 */
export function mergeViews<T extends SharedView>(
  base: readonly T[],
  mine: readonly T[],
  theirs: readonly T[],
): T[] {
  const baseById = new Map(base.map((view) => [view.id, view]));
  const mineById = new Map(mine.map((view) => [view.id, view]));
  const changedHere = (view: T) => {
    const before = baseById.get(view.id);
    return before === undefined || !sameView(before, view);
  };

  const merged: T[] = [];
  const placed = new Set<string>();
  for (const view of theirs) {
    placed.add(view.id);
    const own = mineById.get(view.id);
    if (!own) {
      if (!baseById.has(view.id)) merged.push(view);
      continue;
    }
    merged.push(changedHere(own) ? own : view);
  }
  for (const view of mine) {
    if (!placed.has(view.id) && changedHere(view)) merged.push(view);
  }
  return merged;
}

export type PullPlan =
  /** Take `theirs` as the list here and as the new base. */
  | { kind: 'adopt' }
  /** Write the merge over `theirs`' revision. */
  | { kind: 'put'; views: SharedView[]; over: number };

/**
 * What to do with the server's list (a pull, or the `current` of a 409).
 * Nothing changed here since the base: take theirs. Changed: merge and write
 * over theirs' revision, unless the merge is theirs already. Without a base
 * (just linked) every view here counts as added, so neither side loses one.
 */
export function planPull(
  base: ViewsBase | null,
  mine: readonly SharedView[],
  theirs: ViewsBase,
): PullPlan {
  const before = base?.views ?? [];
  if (sameViews(before, mine)) return { kind: 'adopt' };
  const views = mergeViews(before, mine, theirs.views);
  return sameViews(views, theirs.views)
    ? { kind: 'adopt' }
    : { kind: 'put', views, over: theirs.revision };
}

/**
 * What a push writes after a change here: the base with this side's changes,
 * over the base's revision; null when nothing changed since the base. Views
 * not changed here go out as the server sent them, fields this version
 * doesn't read included.
 */
export function planPush(
  base: ViewsBase,
  mine: readonly SharedView[],
): { views: SharedView[]; over: number } | null {
  if (sameViews(base.views, mine)) return null;
  return { views: mergeViews(base.views, mine, base.views), over: base.revision };
}

/**
 * The list here once the server answered `answer` to what was sent when the
 * list here was `sent`: the answer, with the changes made here meanwhile on top.
 */
export function listAfterAnswer<T extends SharedView>(
  sent: readonly T[],
  now: readonly T[],
  answer: readonly T[],
): T[] {
  return sameViews(sent, now) ? [...answer] : mergeViews(sent, now, answer);
}

/** A base read back from disk; null when it isn't one. */
export function sanitizeViewsBase(value: unknown): ViewsBase | null {
  if (!value || typeof value !== 'object') return null;
  const { revision, views } = value as Record<string, unknown>;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || !Array.isArray(views))
    return null;
  const shared = views.filter(
    (view): view is SharedView =>
      !!view &&
      typeof view === 'object' &&
      typeof (view as SharedView).id === 'string' &&
      typeof (view as SharedView).name === 'string',
  );
  return { revision, views: shared };
}
