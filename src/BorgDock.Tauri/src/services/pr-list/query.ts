import { matchesSearch } from '@/services/pr-search';
import type { PrFacts } from './facts';

/**
 * The search box's query: free text plus `field:value` qualifiers, the same
 * shape as GitHub's search (`author:vera is:failing repo:shop-web`). The
 * filter chips are a view of the qualifiers; adding or removing a chip
 * rewrites the query, so the query string is the only filter state and a
 * saved view stores just that string.
 *
 * - Values separated by commas match any of them: `repo:web,api`.
 * - A leading minus excludes: `-author:dependabot`.
 * - Quotes keep spaces: `label:"needs review"`.
 * - `me` stands for the signed-in user in `author:` and `reviewer:`.
 * - `age:`, `updated:` take `<` / `>` and a duration (`>7d`, `<12h`, `>=2w`);
 *   `size:` takes changed lines (`<100`) or a bucket (`xs` … `xl`).
 * - A word with an unknown field stays free text.
 */

export type QueryField =
  | 'is'
  | 'status'
  | 'author'
  | 'review'
  | 'reviewer'
  | 'checks'
  | 'waiting'
  | 'repo'
  | 'label'
  | 'base'
  | 'ab'
  | 'age'
  | 'updated'
  | 'size';

export const QUERY_FIELDS: readonly QueryField[] = [
  'is',
  'status',
  'author',
  'review',
  'reviewer',
  'checks',
  'waiting',
  'repo',
  'label',
  'base',
  'ab',
  'age',
  'updated',
  'size',
];

export interface QueryTerm {
  field: QueryField;
  /** Lower-cased values; any of them matches. */
  values: string[];
  negate: boolean;
}

export interface ParsedQuery {
  terms: QueryTerm[];
  /** Everything that is not a qualifier, joined by single spaces. */
  text: string;
}

export interface MatchContext {
  username: string;
  /** Clock for `age:` and `updated:`. */
  now: number;
}

const FIELD_SET = new Set<string>(QUERY_FIELDS);

/** Split on whitespace outside double quotes. */
function tokens(query: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of query) {
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (!quoted && /\s/.test(ch)) {
      if (current) out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

function splitValues(raw: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of raw) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      if (current.trim()) values.push(current.trim().toLowerCase());
      current = '';
    } else current += ch;
  }
  if (current.trim()) values.push(current.trim().toLowerCase());
  return values;
}

const TERM_PATTERN = /^(-?)([a-z]+):(.+)$/i;

export function parseQuery(query: string): ParsedQuery {
  const terms: QueryTerm[] = [];
  const text: string[] = [];
  for (const token of tokens(query)) {
    const match = TERM_PATTERN.exec(token);
    const field = match?.[2]?.toLowerCase();
    if (match && field && FIELD_SET.has(field)) {
      const values = splitValues(match[3]!);
      if (values.length > 0) {
        terms.push({ field: field as QueryField, values, negate: match[1] === '-' });
        continue;
      }
    }
    text.push(token.replace(/"/g, ''));
  }
  return { terms, text: text.join(' ') };
}

function quote(value: string): string {
  return /[\s,"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
}

export function termText(term: QueryTerm): string {
  return `${term.negate ? '-' : ''}${term.field}:${term.values.map(quote).join(',')}`;
}

export function formatQuery(parsed: ParsedQuery): string {
  return [...parsed.terms.map(termText), parsed.text].filter(Boolean).join(' ');
}

/**
 * The query with `field`'s term replaced: the first term on that field takes
 * the new values and sign in place, later ones on the same field go. No
 * values removes the term.
 */
export function setTerm(
  query: string,
  field: QueryField,
  values: readonly string[],
  negate = false,
): string {
  const parsed = parseQuery(query);
  const next: QueryTerm = { field, values: values.map((v) => v.toLowerCase()), negate };
  const index = parsed.terms.findIndex((t) => t.field === field);
  const kept = parsed.terms.filter((t, i) => t.field !== field || i === index);
  const terms =
    index < 0
      ? values.length > 0
        ? [...kept, next]
        : kept
      : kept.flatMap((t) => (t.field !== field ? [t] : values.length > 0 ? [next] : []));
  return formatQuery({ terms, text: parsed.text });
}

/** The query without the term at `index` of `parseQuery(query).terms`. */
export function removeTerm(query: string, index: number): string {
  const parsed = parseQuery(query);
  return formatQuery({ terms: parsed.terms.filter((_, i) => i !== index), text: parsed.text });
}

/** The query with only its free text: every qualifier gone. */
export function clearTerms(query: string): string {
  return parseQuery(query).text;
}

const UNIT_MS: Record<string, number> = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

interface Comparison {
  op: '<' | '<=' | '>' | '>=' | '=';
  amount: number;
}

const COMPARISON_PATTERN = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)([mhdw])?$/;

/** `>7d` → { op: '>', amount: 7 days in ms }; `unitless` multiplies a bare number (days for ages). */
function comparison(value: string, unitless: number): Comparison | null {
  const match = COMPARISON_PATTERN.exec(value);
  if (!match) return null;
  const unit = match[3] ? UNIT_MS[match[3]]! : unitless;
  return { op: (match[1] as Comparison['op']) ?? '=', amount: Number(match[2]) * unit };
}

function compare(actual: number, c: Comparison): boolean {
  switch (c.op) {
    case '<':
      return actual < c.amount;
    case '<=':
      return actual <= c.amount;
    case '>':
      return actual > c.amount;
    case '>=':
      return actual >= c.amount;
    case '=':
      return actual === c.amount;
  }
}

function isValue(f: PrFacts, value: string): boolean {
  switch (value) {
    case 'yourturn':
    case 'turn':
    case 'needsyou':
      return f.yourTurn;
    case 'mine':
      return f.mine;
    case 'failing':
    case 'red':
      return f.failing;
    case 'running':
    case 'pending':
      return f.running;
    case 'passing':
    case 'green':
      return !f.failing && !f.running && f.pr.overallStatus === 'green';
    case 'ready':
      return f.ready;
    case 'draft':
      return f.draft;
    case 'conflicts':
    case 'conflict':
      return f.conflicts;
    case 'stale':
      return f.stale;
    case 'shared':
      return f.ci !== null;
    case 'automerge':
      return !!f.pr.pullRequest.autoMergeEnabled;
    case 'open':
      return true;
    default:
      return false;
  }
}

function checksValue(f: PrFacts, value: string): boolean {
  switch (value) {
    case 'failing':
      return f.failing;
    case 'running':
      return f.running;
    case 'passing':
      return !f.failing && !f.running && f.pr.totalCheckCount > 0;
    case 'none':
      return f.pr.totalCheckCount === 0;
    case 'shared':
      return f.ci !== null;
    default:
      return false;
  }
}

const REVIEW_ALIASES: Record<string, PrFacts['review'][]> = {
  me: ['awaitingYou'],
  you: ['awaitingYou'],
  approved: ['approved'],
  changes: ['changes'],
  commented: ['commented'],
  pending: ['awaitingOthers', 'awaitingYou'],
  others: ['awaitingOthers'],
  none: ['none'],
};

const STATUS_ALIASES: Record<string, PrFacts['bucket']> = {
  yourturn: 'yourTurn',
  turn: 'yourTurn',
  failing: 'failing',
  waiting: 'waiting',
  ready: 'ready',
  draft: 'draft',
};

const WAITING_ALIASES: Record<string, PrFacts['next']['waitingOn']> = {
  you: 'you',
  me: 'you',
  author: 'author',
  reviewer: 'reviewers',
  reviewers: 'reviewers',
  ci: 'ci',
};

function login(value: string, ctx: MatchContext): string {
  return value === 'me' || value === '@me' ? ctx.username.toLowerCase() : value.replace(/^@/, '');
}

function matchesValue(f: PrFacts, field: QueryField, value: string, ctx: MatchContext): boolean {
  const p = f.pr.pullRequest;
  switch (field) {
    case 'is':
      return isValue(f, value);
    case 'status':
      return STATUS_ALIASES[value] === f.bucket;
    case 'author':
      return p.authorLogin.toLowerCase() === login(value, ctx);
    case 'review':
      return (REVIEW_ALIASES[value] ?? []).includes(f.review);
    case 'reviewer': {
      if (value === 'me' || value === '@me') return f.waitingOnMe;
      const who = value.replace(/^@/, '');
      return (
        p.requestedReviewers.some((r) => r.toLowerCase() === who) ||
        (p.requestedTeams ?? []).some((t) => t.toLowerCase() === who)
      );
    }
    case 'checks':
      return checksValue(f, value);
    case 'waiting':
      return WAITING_ALIASES[value] === f.next.waitingOn;
    case 'repo':
      return (
        p.repoName.toLowerCase() === value || `${p.repoOwner}/${p.repoName}`.toLowerCase() === value
      );
    case 'label':
      return p.labels.some((l) => l.toLowerCase() === value);
    case 'base':
      return (p.baseRef ?? '').toLowerCase() === value;
    case 'ab':
      return f.workItems.includes(Number(value.replace(/^ab#?/, '')));
    case 'age': {
      if (value === f.age) return true;
      const c = comparison(value, UNIT_MS.d!);
      return c !== null && compare(ctx.now - f.createdAt, c);
    }
    case 'updated': {
      const c = comparison(value, UNIT_MS.d!);
      return c !== null && compare(ctx.now - f.updatedAt, c);
    }
    case 'size': {
      if (value === f.size) return true;
      const c = comparison(value, 1);
      return c !== null && compare(f.lines, c);
    }
  }
}

export function matchesTerm(f: PrFacts, term: QueryTerm, ctx: MatchContext): boolean {
  const hit = term.values.some((value) => matchesValue(f, term.field, value, ctx));
  return term.negate ? !hit : hit;
}

/** Every qualifier matches (AND), and the free text matches as one phrase. */
export function matchesQuery(f: PrFacts, parsed: ParsedQuery, ctx: MatchContext): boolean {
  return (
    parsed.terms.every((term) => matchesTerm(f, term, ctx)) && matchesSearch(f.pr, parsed.text)
  );
}
