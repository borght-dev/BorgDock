import type { PullRequestWithChecks } from '@/types';
import type { PrDisplay } from './display';
import { factsOf, type PrCiFacts, type PrFacts, type PrFactsContext } from './facts';
import { buildGroups, type PrGroupNode, pinsYourTurn, sortFacts } from './groups';
import { matchesQuery, type ParsedQuery, parseQuery } from './query';

/**
 * The Pull requests list as data: every open PR's facts, the rows the view
 * tab, the query and "Hide failing" leave, in the chosen order, grouped.
 * The list, its keyboard navigation and the board all read this one result,
 * so what j / k walk through is what is on screen.
 */

/** The built-in views (tabs). Saved views add their own after these. */
export type PrViewKey = 'all' | 'needsYou' | 'mine' | 'failing' | 'ready' | 'stale';

export const BUILT_IN_VIEWS: ReadonlyArray<{ key: PrViewKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'needsYou', label: 'Your turn' },
  { key: 'mine', label: 'Mine' },
  { key: 'failing', label: 'Failing' },
  { key: 'ready', label: 'Ready to merge' },
  { key: 'stale', label: 'Stale' },
];

export function isPrViewKey(value: unknown): value is PrViewKey {
  return BUILT_IN_VIEWS.some((v) => v.key === value);
}

export function inView(f: PrFacts, view: PrViewKey): boolean {
  switch (view) {
    case 'all':
      return true;
    case 'needsYou':
      return f.yourTurn;
    case 'mine':
      return f.mine;
    case 'failing':
      return f.failing;
    case 'ready':
      return f.ready;
    case 'stale':
      return f.stale;
  }
}

/** "Hide failing" applies to every view but Failing. */
export function hidesFailing(hideFailing: boolean, view: PrViewKey): boolean {
  return hideFailing && view !== 'failing';
}

export interface PrFactsInput {
  prs: readonly PullRequestWithChecks[];
  username: string;
  teams: readonly string[];
  now: number;
  staleAfterDays: number;
  ciOf: (pr: PullRequestWithChecks) => PrCiFacts | null;
}

export function buildFacts(input: PrFactsInput): PrFacts[] {
  const ctx: PrFactsContext = {
    username: input.username,
    teams: input.teams,
    now: input.now,
    staleAfterDays: input.staleAfterDays,
    ciOf: input.ciOf,
  };
  return input.prs.map((pr) => factsOf(pr, ctx));
}

/** A saved view, as far as counting it goes. */
export interface CountedView {
  id: string;
  filter: PrViewKey;
  query: string;
}

export interface PrListInput {
  facts: readonly PrFacts[];
  username: string;
  now: number;
  view: PrViewKey;
  query: string;
  hideFailing: boolean;
  /** A related CI failure narrows the list to its PRs (`owner/repo#number`). */
  relatedKeys: ReadonlySet<string> | null;
  display: PrDisplay;
  /** Focus's priority score of a PR, for the Priority order's ties within a bucket. */
  focusScore?: (f: PrFacts) => number;
  savedViews?: readonly CountedView[];
}

export interface PrListModel {
  /** Filtered and sorted. */
  rows: PrFacts[];
  groups: PrGroupNode[];
  parsed: ParsedQuery;
  /** Each built-in view's count, ignoring the query (under "Hide failing", but Failing). */
  counts: Record<PrViewKey, number>;
  /** Each saved view's count with its own filter and query. */
  savedCounts: Record<string, number>;
}

function filterFacts(
  facts: readonly PrFacts[],
  view: PrViewKey,
  parsed: ParsedQuery,
  hideFailing: boolean,
  ctx: { username: string; now: number },
  relatedKeys: ReadonlySet<string> | null = null,
): PrFacts[] {
  const hide = hidesFailing(hideFailing, view);
  return facts.filter(
    (f) =>
      inView(f, view) &&
      !(hide && f.failing) &&
      (!relatedKeys || relatedKeys.has(f.key)) &&
      matchesQuery(f, parsed, ctx),
  );
}

export function buildPrListModel(input: PrListInput): PrListModel {
  const ctx = { username: input.username, now: input.now };
  const parsed = parseQuery(input.query);
  const filtered = filterFacts(
    input.facts,
    input.view,
    parsed,
    input.hideFailing,
    ctx,
    input.relatedKeys,
  );
  const rows = sortFacts(filtered, input.display.sortBy, input.display.sortDir, input.focusScore);
  const groups = buildGroups(rows, input.display, {
    pin: pinsYourTurn(input.display) && input.view === 'all' && !input.relatedKeys,
    subGroups: input.display.layout !== 'board',
  });

  const visible = input.hideFailing ? input.facts.filter((f) => !f.failing) : input.facts;
  const counts = {} as Record<PrViewKey, number>;
  for (const key of ['all', 'needsYou', 'mine', 'ready', 'stale'] as const) {
    counts[key] = visible.filter((f) => inView(f, key)).length;
  }
  counts.failing = input.facts.filter((f) => f.failing).length;

  const savedCounts: Record<string, number> = {};
  for (const view of input.savedViews ?? []) {
    savedCounts[view.id] = filterFacts(
      input.facts,
      view.filter,
      parseQuery(view.query),
      input.hideFailing,
      ctx,
    ).length;
  }

  return { rows, groups, parsed, counts, savedCounts };
}
