import { FIXTURE_ME, type ListPrSpec, listPr } from '@/components/pr/__fixtures__/pr-list-data';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { factsOf, type PrFacts, type PrFactsContext } from '../facts';

export const ME = FIXTURE_ME;
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
/** The clock of every pr-list test. */
export const NOW = Date.parse('2026-11-11T12:00:00Z');

export const RED = { total: 4, fail: 1 };
export const RUNNING = { total: 4, run: 2 };

export interface PrSpec extends Partial<ListPrSpec> {
  /** Written over the generated `pullRequest`. */
  pullRequest?: Partial<PullRequest>;
}

/** A PR from `listPr` at `NOW`: #1 in `acme/shop`, mine unless `author` says otherwise. */
export function prFrom(spec: PrSpec = {}): PullRequestWithChecks {
  const { pullRequest, ...list } = spec;
  const pr = listPr({ number: 1, title: 'Change', repo: 'acme/shop', ...list }, NOW);
  return { ...pr, pullRequest: { ...pr.pullRequest, ...pullRequest } };
}

export function contextOf(overrides: Partial<PrFactsContext> = {}): PrFactsContext {
  return { username: ME, teams: [], now: NOW, staleAfterDays: 7, ciOf: () => null, ...overrides };
}

export function factsFrom(spec: PrSpec = {}, ctx: Partial<PrFactsContext> = {}): PrFacts {
  return factsOf(prFrom(spec), contextOf(ctx));
}

/** An ISO time `hours` before `NOW`. */
export function hoursAgo(hours: number): string {
  return new Date(NOW - hours * HOUR).toISOString();
}

export function numbers(facts: readonly PrFacts[]): number[] {
  return facts.map((f) => f.pr.pullRequest.number);
}
