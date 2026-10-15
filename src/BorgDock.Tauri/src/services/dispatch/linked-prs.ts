import { getClientForRepo } from '@/services/github/singleton';
import type { RepoSettings } from '@/types';
import type { DispatchItem, KnownPullRequest, PullRequestState } from './types';

/**
 * The GitHub state of the pull requests ADO links on my items. BorgDock polls
 * only open pull requests and a few recently closed ones, so without this a
 * pull request merged last week is invisible and its item looks fine in Code
 * Review.
 *
 * ADO names a linked pull request's repository by an id of its own. Which
 * GitHub repository that is gets learned: fetch a few of its pull requests
 * from every configured repository, and the one whose pull requests name the
 * items that link them is it.
 */

/** A pull request as GitHub answers for it. */
export interface FetchedPullRequest {
  number: number;
  url: string;
  title: string;
  /** Only asked for while learning a repository. */
  body?: string | null;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  mergedAt: string | null;
  headRefName: string | null;
  reviewDecision: string | null;
}

/** Fetch these pull requests of `repository` (`owner/name`); unknown numbers are left out. */
export type FetchPullRequests = (
  repository: string,
  numbers: readonly number[],
  withBody: boolean,
) => Promise<FetchedPullRequest[]>;

/** An open pull request is read again after this long. */
const OPEN_FOR_MS = 5 * 60_000;
/** A repository id no configured repository matched is tried again after this long. */
const RETRY_UNMATCHED_MS = 60 * 60_000;
/** Pull requests read per candidate repository to learn which one an id is. */
const SAMPLE_SIZE = 12;
const BATCH_SIZE = 50;

const STATE: Record<FetchedPullRequest['state'], PullRequestState> = {
  OPEN: 'open',
  CLOSED: 'closed',
  MERGED: 'merged',
};

interface Cached {
  pullRequest: FetchedPullRequest;
  readAt: number;
}

const cache = new Map<string, Cached>();
/** Repository ids no candidate matched, and numbers GitHub did not know, with when that was. */
const unmatched = new Map<string, number>();
const missing = new Map<string, number>();

/** Forget what was read (tests). */
export function resetLinkedPullRequests(): void {
  cache.clear();
  unmatched.clear();
  missing.clear();
}

/** Repository id to pull request number to the ids of the items that link it. */
function linksByRepository(items: readonly DispatchItem[]): Map<string, Map<number, number[]>> {
  const found = new Map<string, Map<number, number[]>>();
  for (const item of items) {
    for (const { repositoryId, number } of item.linkedPullRequests) {
      const numbers = found.get(repositoryId) ?? new Map<number, number[]>();
      numbers.set(number, [...(numbers.get(number) ?? []), item.id]);
      found.set(repositoryId, numbers);
    }
  }
  return found;
}

function namesAny(pr: FetchedPullRequest, itemIds: readonly number[]): boolean {
  const text = `${pr.title}\n${pr.body ?? ''}\n${pr.headRefName ?? ''}`;
  return itemIds.some((id) => new RegExp(`\\b${id}\\b`).test(text));
}

/** The configured repository whose pull requests name the items that link them, if one does. */
async function learnRepository(
  links: Map<number, number[]>,
  candidates: readonly string[],
  fetch: FetchPullRequests,
): Promise<string | null> {
  const sample = [...links.keys()].sort((a, b) => b - a).slice(0, SAMPLE_SIZE);
  let best: { repository: string; score: number } | null = null;
  for (const repository of candidates) {
    const found = await fetch(repository, sample, true).catch(() => []);
    const score = found.filter((pr) => namesAny(pr, links.get(pr.number) ?? [])).length;
    if (score > 0 && (!best || score > best.score)) best = { repository, score };
  }
  return best?.repository ?? null;
}

function cacheKey(repository: string, number: number): string {
  return `${repository.toLowerCase()}#${number}`;
}

function due(key: string, now: number): boolean {
  const cached = cache.get(key);
  if (cached) return cached.pullRequest.state === 'OPEN' && now - cached.readAt > OPEN_FOR_MS;
  return now - (missing.get(key) ?? -Infinity) > RETRY_UNMATCHED_MS;
}

function toKnown(pr: FetchedPullRequest, itemIds: number[]): KnownPullRequest {
  return {
    number: pr.number,
    url: pr.url,
    state: STATE[pr.state],
    title: pr.title,
    isDraft: pr.isDraft,
    branch: pr.headRefName,
    workItemIds: itemIds,
    checks: null,
    approved: pr.reviewDecision === 'APPROVED',
    mergedAt: pr.mergedAt,
  };
}

export interface LinkedLookup {
  pullRequests: KnownPullRequest[];
  /** Repository id to `owner/name`, with what was learned this time. */
  repositories: Record<string, string>;
}

/**
 * The state of every pull request linked on `items` whose repository is known
 * or can be learned among `candidates`. Merged and closed pull requests are
 * read once; open ones again after a few minutes.
 */
export async function lookUpLinkedPullRequests(
  items: readonly DispatchItem[],
  candidates: readonly string[],
  known: Readonly<Record<string, string>>,
  fetch: FetchPullRequests,
  now: number = Date.now(),
): Promise<LinkedLookup> {
  const repositories = { ...known };
  const pullRequests: KnownPullRequest[] = [];
  for (const [repositoryId, links] of linksByRepository(items)) {
    if (!repositories[repositoryId]) {
      if (now - (unmatched.get(repositoryId) ?? -Infinity) < RETRY_UNMATCHED_MS) continue;
      const learned = await learnRepository(links, candidates, fetch);
      if (!learned) {
        unmatched.set(repositoryId, now);
        continue;
      }
      repositories[repositoryId] = learned;
    }
    const repository = repositories[repositoryId]!;
    const toRead = [...links.keys()].filter((n) => due(cacheKey(repository, n), now));
    for (let start = 0; start < toRead.length; start += BATCH_SIZE) {
      const batch = toRead.slice(start, start + BATCH_SIZE);
      const found = await fetch(repository, batch, false).catch(() => null);
      if (!found) continue;
      for (const pr of found) {
        cache.set(cacheKey(repository, pr.number), { pullRequest: pr, readAt: now });
      }
      for (const number of batch) {
        if (!found.some((pr) => pr.number === number))
          missing.set(cacheKey(repository, number), now);
      }
    }
    for (const [number, itemIds] of links) {
      const cached = cache.get(cacheKey(repository, number));
      if (cached) pullRequests.push(toKnown(cached.pullRequest, itemIds));
    }
  }
  return { pullRequests, repositories };
}

/** The repositories BorgDock follows, as `owner/name`. */
export function candidateRepositories(repos: readonly RepoSettings[]): string[] {
  return repos
    .filter((repo) => repo.enabled && /^[\w.-]+$/.test(repo.owner) && /^[\w.-]+$/.test(repo.name))
    .map((repo) => `${repo.owner}/${repo.name}`);
}

const FIELDS = 'number url title state isDraft mergedAt headRefName reviewDecision';

/** Reads pull requests by number with one GraphQL query per batch. */
export const fetchFromGitHub: FetchPullRequests = async (repository, numbers, withBody) => {
  const [owner, name] = repository.split('/') as [string, string];
  const client = getClientForRepo(owner, name);
  if (!client || numbers.length === 0) return [];
  const fields = withBody ? `${FIELDS} body` : FIELDS;
  const aliases = numbers.map((n) => `p${n}: pullRequest(number: ${n}) { ${fields} }`).join('\n');
  const data = await client.graphql<{
    repository: Record<string, FetchedPullRequest | null> | null;
  }>(
    `query LinkedPullRequests($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) { ${aliases} }
    }`,
    { owner, name },
    { partial: true },
  );
  return Object.values(data.repository ?? {}).filter((pr): pr is FetchedPullRequest => !!pr);
};
