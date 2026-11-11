import { type PrDisplay, sameDisplay, sanitizeDisplay } from './display';
import {
  AGE_LABEL,
  AGE_ORDER,
  type PrFacts,
  REVIEW_LABEL,
  SIZE_GROUP_LABEL,
  SIZE_ORDER,
  STATUS_BUCKET_LABEL,
  STATUS_BUCKET_ORDER,
  WAITING_LABEL,
  WAITING_ORDER,
} from './facts';
import { isPrViewKey, type PrViewKey } from './model';
import {
  type MatchContext,
  matchesTerm,
  parseQuery,
  type QueryField,
  type QueryTerm,
} from './query';

/**
 * The filter menu's fields and values, with how many PRs each value
 * matches, and the chips' wording. Values are what the query stores
 * (lower case), so picking one writes the same token typing it would.
 */

export const FACET_FIELDS: ReadonlyArray<{ field: QueryField; label: string; hint?: string }> = [
  { field: 'repo', label: 'Repository' },
  { field: 'author', label: 'Author' },
  { field: 'reviewer', label: 'Requested reviewer' },
  { field: 'review', label: 'Review state' },
  { field: 'checks', label: 'Checks' },
  { field: 'waiting', label: 'Waiting on' },
  { field: 'status', label: 'Status' },
  { field: 'label', label: 'Label' },
  { field: 'base', label: 'Base branch' },
  { field: 'ab', label: 'Work item' },
  { field: 'age', label: 'Age' },
  { field: 'size', label: 'Size' },
  { field: 'is', label: 'State', hint: 'draft, conflicts, stale' },
];

export function fieldLabel(field: QueryField): string {
  if (field === 'updated') return 'Updated';
  return FACET_FIELDS.find((f) => f.field === field)?.label ?? field;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

const FIXED_VALUES: Partial<Record<QueryField, ReadonlyArray<[string, string]>>> = {
  review: [
    ['me', REVIEW_LABEL.awaitingYou],
    ['changes', REVIEW_LABEL.changes],
    ['commented', REVIEW_LABEL.commented],
    ['others', REVIEW_LABEL.awaitingOthers],
    ['approved', REVIEW_LABEL.approved],
    ['none', REVIEW_LABEL.none],
  ],
  checks: [
    ['failing', 'Failing'],
    ['shared', 'Shared failure'],
    ['running', 'Running'],
    ['passing', 'Passing'],
    ['none', 'No checks'],
  ],
  waiting: WAITING_ORDER.map((w) => [w, WAITING_LABEL[w]] as [string, string]),
  status: STATUS_BUCKET_ORDER.map(
    (b) => [b.toLowerCase(), STATUS_BUCKET_LABEL[b]] as [string, string],
  ),
  age: AGE_ORDER.map((a) => [a, AGE_LABEL[a]] as [string, string]),
  size: SIZE_ORDER.map((s) => [s, SIZE_GROUP_LABEL[s]] as [string, string]),
  is: [
    ['draft', 'Draft'],
    ['conflicts', 'Has conflicts'],
    ['stale', 'Stale'],
    ['automerge', 'Auto-merge on'],
    ['mine', 'Mine'],
  ],
};

/** The values a PR offers for a free field: its repository, author, labels… */
function valuesOf(f: PrFacts, field: QueryField, repoKey: (f: PrFacts) => string): string[] {
  const p = f.pr.pullRequest;
  switch (field) {
    case 'repo':
      return [repoKey(f)];
    case 'author':
      return [p.authorLogin];
    case 'reviewer':
      return [...p.requestedReviewers, ...(p.requestedTeams ?? [])];
    case 'label':
      return p.labels;
    case 'base':
      return p.baseRef ? [p.baseRef] : [];
    case 'ab':
      return f.workItems.map(String);
    default:
      return [];
  }
}

/**
 * The values to offer for `field` with their counts in `facts`: a fixed
 * list for the fields that have one, else every value the PRs carry, most
 * common first. Values with no PR are left out of the free lists only.
 */
export function facetValues(
  field: QueryField,
  facts: readonly PrFacts[],
  ctx: MatchContext,
): FacetValue[] {
  const count = (value: string) =>
    facts.filter((f) => matchesTerm(f, { field, values: [value], negate: false }, ctx)).length;
  const fixed = FIXED_VALUES[field];
  if (fixed) return fixed.map(([value, label]) => ({ value, label, count: count(value) }));

  // A repository is named by its name alone unless two owners share it.
  const owners = new Map<string, Set<string>>();
  for (const f of facts) {
    const p = f.pr.pullRequest;
    const name = p.repoName.toLowerCase();
    owners.set(name, (owners.get(name) ?? new Set()).add(p.repoOwner.toLowerCase()));
  }
  const repoKey = (f: PrFacts) => {
    const p = f.pr.pullRequest;
    return (owners.get(p.repoName.toLowerCase())?.size ?? 0) > 1
      ? `${p.repoOwner}/${p.repoName}`
      : p.repoName;
  };

  const labels = new Map<string, string>();
  for (const f of facts) {
    for (const v of valuesOf(f, field, repoKey)) {
      const key = v.toLowerCase();
      if (!labels.has(key)) labels.set(key, v);
    }
  }
  const me = ctx.username.toLowerCase();
  return [...labels]
    .map(([value, label]) => ({
      value,
      label:
        field === 'ab'
          ? `AB#${label}`
          : field === 'author' && value === me
            ? `${label} (you)`
            : label,
      count: count(value),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** "Author", "is any of", "vera, maria" for a chip. */
export function chipText(term: QueryTerm): { field: string; op: string; values: string } {
  const fixed = FIXED_VALUES[term.field];
  const name = (v: string) =>
    fixed?.find(([value]) => value === v)?.[1] ?? (term.field === 'ab' ? `AB#${v}` : v);
  const many = term.values.length > 1;
  return {
    field: fieldLabel(term.field),
    op: term.negate ? (many ? 'is none of' : 'is not') : many ? 'is any of' : 'is',
    values: term.values.map(name).join(', '),
  };
}

// ── saved views ────────────────────────────────────────────────────────────

/** A named view: a tab that remembers the base filter, the query and the display. */
export interface SavedPrView {
  id: string;
  name: string;
  filter: PrViewKey;
  query: string;
  display: PrDisplay;
}

export function newViewId(): string {
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Saved views read back from disk; malformed entries are dropped. */
export function sanitizeSavedViews(value: unknown): SavedPrView[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const views: SavedPrView[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const v = raw as Record<string, unknown>;
    if (typeof v.id !== 'string' || seen.has(v.id)) continue;
    if (typeof v.name !== 'string' || v.name.trim() === '') continue;
    seen.add(v.id);
    views.push({
      id: v.id,
      name: v.name.trim(),
      filter: isPrViewKey(v.filter) ? v.filter : 'all',
      query: typeof v.query === 'string' ? v.query : '',
      display: sanitizeDisplay(v.display),
    });
  }
  return views;
}

/** The list differs from what the view saved. */
export function isViewEdited(
  view: SavedPrView,
  current: { filter: PrViewKey; query: string; display: PrDisplay },
): boolean {
  const normalize = (q: string) => q.trim().replace(/\s+/g, ' ');
  return (
    view.filter !== current.filter ||
    normalize(view.query) !== normalize(current.query) ||
    !sameDisplay(view.display, current.display)
  );
}

/** Whether the query holds any qualifier (the chip row shows only then). */
export function hasTerms(query: string): boolean {
  return parseQuery(query).terms.length > 0;
}
