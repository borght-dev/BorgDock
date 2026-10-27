import type { PullRequestState } from '@/services/dispatch/types';
import type { GitHubClient } from './client';

/**
 * Pull requests read by number, for the ones BorgDock does not poll: merged
 * last month, in a repository that isn't configured. Results are kept, so a
 * merged pull request is read once and an open one every few minutes.
 */

export interface PullRequestTarget {
  owner: string;
  repo: string;
  number: number;
}

export interface LookedUpPullRequest {
  number: number;
  url: string;
  title: string;
  state: PullRequestState;
  isDraft: boolean;
  mergedAt: string | null;
  closedAt: string | null;
  headRefName: string | null;
  baseRefName: string | null;
  headSha: string | null;
  approved: boolean;
  /** `true` when GitHub says it can't merge cleanly. */
  conflicting: boolean;
  /** The head commit's combined checks: `null` when none ran or none were read. */
  checks: 'passed' | 'failed' | 'pending' | null;
  /** GitHub's node id of the repository: stays the same through a rename. */
  repositoryId: string;
  /** `owner/name` as GitHub answers it now; differs from what was asked after a rename. */
  nameWithOwner: string;
  authorLogin?: string | null;
  mergedBy?: string | null;
  /** The commit the merge made; delivery compares it with what deployed. */
  mergeCommitSha?: string | null;
}

export type LookupResult =
  | {
      status: 'found';
      pullRequest: LookedUpPullRequest;
      /** When GitHub last answered with it. */
      readAt: number;
      checkedAt: number;
      /** The last read failed: what is shown is as of `readAt`. */
      failing: string | null;
    }
  /** The repository answered without it; `confirmed` once that happened twice in a row. */
  | { status: 'missing'; checkedAt: number; confirmed: boolean }
  /** The repository can't be read with the account used: not configured, or no access. */
  | { status: 'no-access'; checkedAt: number; error: string }
  /** GitHub could not be asked: offline, rate limited. */
  | { status: 'error'; checkedAt: number; error: string };

const OPEN_FOR_MS = 5 * 60_000;
const CLOSED_FOR_MS = 60 * 60_000;
const MISSING_FOR_MS = 60 * 60_000;
const NO_ACCESS_FOR_MS = 10 * 60_000;
const ERROR_FOR_MS = 60_000;
const BATCH_SIZE = 50;

export function targetKey(target: PullRequestTarget): string {
  return `${target.owner}/${target.repo}#${target.number}`.toLowerCase();
}

/** Whether `result` is old enough to read again. */
export function isDue(result: LookupResult | undefined, now: number): boolean {
  if (!result) return true;
  const age = now - result.checkedAt;
  switch (result.status) {
    case 'found':
      if (result.failing) return age > ERROR_FOR_MS;
      if (result.pullRequest.state === 'merged') return false;
      return age > (result.pullRequest.state === 'open' ? OPEN_FOR_MS : CLOSED_FOR_MS);
    case 'missing':
      return age > (result.confirmed ? MISSING_FOR_MS : ERROR_FOR_MS);
    case 'no-access':
      return age > NO_ACCESS_FOR_MS;
    case 'error':
      return age > ERROR_FOR_MS;
  }
}

const FIELDS = `number url title state isDraft mergedAt closedAt headRefName baseRefName headRefOid
  reviewDecision mergeable author { login } mergedBy { login } mergeCommit { oid }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`;

interface GraphPullRequest {
  number: number;
  url: string;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  mergedAt: string | null;
  closedAt: string | null;
  headRefName: string | null;
  baseRefName: string | null;
  headRefOid: string | null;
  reviewDecision: string | null;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null;
  author?: { login: string } | null;
  mergedBy?: { login: string } | null;
  mergeCommit?: { oid: string } | null;
  commits?: { nodes?: { commit?: { statusCheckRollup?: { state?: string } | null } }[] };
}

const STATE: Record<GraphPullRequest['state'], PullRequestState> = {
  OPEN: 'open',
  CLOSED: 'closed',
  MERGED: 'merged',
};

function checksOf(pr: GraphPullRequest): LookedUpPullRequest['checks'] {
  const state = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  if (state === 'SUCCESS') return 'passed';
  if (state === 'FAILURE' || state === 'ERROR') return 'failed';
  if (state === 'PENDING' || state === 'EXPECTED') return 'pending';
  return null;
}

function toLookedUp(
  pr: GraphPullRequest,
  repositoryId: string,
  nameWithOwner: string,
): LookedUpPullRequest {
  return {
    number: pr.number,
    url: pr.url,
    title: pr.title,
    state: STATE[pr.state] ?? 'unknown',
    isDraft: pr.isDraft,
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    headSha: pr.headRefOid,
    approved: pr.reviewDecision === 'APPROVED',
    conflicting: pr.mergeable === 'CONFLICTING',
    checks: checksOf(pr),
    repositoryId,
    nameWithOwner,
    authorLogin: pr.author?.login ?? null,
    mergedBy: pr.mergedBy?.login ?? null,
    mergeCommitSha: pr.mergeCommit?.oid ?? null,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A GitHub error that says the repository can't be seen, rather than that GitHub can't be reached. */
function isAccessError(error: unknown): boolean {
  return /could not resolve to a repository|not found|forbidden|resource not accessible|401|403|404/i.test(
    errorText(error),
  );
}

export type ClientFor = (owner: string, repo: string) => GitHubClient | null;

/**
 * Read `targets`, one GraphQL query per repository and batch. `previous`
 * holds what was read before: a pull request that comes back null once
 * keeps its last result until it is null twice, so a hiccup doesn't call it
 * deleted.
 */
export async function lookUpPullRequests(
  targets: readonly PullRequestTarget[],
  clientFor: ClientFor,
  previous: ReadonlyMap<string, LookupResult>,
  now: number = Date.now(),
): Promise<Map<string, LookupResult>> {
  const results = new Map<string, LookupResult>();
  const byRepository = new Map<string, PullRequestTarget[]>();
  for (const target of targets) {
    const repository = `${target.owner}/${target.repo}`.toLowerCase();
    byRepository.set(repository, [...(byRepository.get(repository) ?? []), target]);
  }
  for (const group of byRepository.values()) {
    const { owner, repo } = group[0]!;
    const client = clientFor(owner, repo);
    if (!client) {
      for (const target of group) {
        results.set(targetKey(target), {
          status: 'error',
          checkedAt: now,
          error: 'GitHub is not set up.',
        });
      }
      continue;
    }
    for (let start = 0; start < group.length; start += BATCH_SIZE) {
      const batch = group.slice(start, start + BATCH_SIZE);
      const aliases = batch
        .map((t) => `p${t.number}: pullRequest(number: ${t.number}) { ${FIELDS} }`)
        .join('\n');
      try {
        const data = await client.graphql<{
          repository: ({ id: string; nameWithOwner: string } & Record<string, unknown>) | null;
        }>(
          `query WorkstreamPullRequests($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) { id nameWithOwner ${aliases} }
          }`,
          { owner, name: repo },
          { partial: true },
        );
        const repository = data.repository;
        for (const target of batch) {
          const key = targetKey(target);
          if (!repository) {
            results.set(key, {
              status: 'no-access',
              checkedAt: now,
              error: `${owner}/${repo} can't be read with this GitHub account.`,
            });
            continue;
          }
          const pr = repository[`p${target.number}`] as GraphPullRequest | null | undefined;
          if (pr) {
            results.set(key, {
              status: 'found',
              pullRequest: toLookedUp(pr, repository.id, repository.nameWithOwner),
              readAt: now,
              checkedAt: now,
              failing: null,
            });
            continue;
          }
          const before = previous.get(key);
          // Null once: keep what was known and look again soon; null twice: it's gone.
          const once = before?.status !== 'missing' || before.confirmed;
          if (before?.status === 'found') {
            results.set(key, { ...before, checkedAt: now, failing: 'GitHub did not return it.' });
          } else {
            results.set(key, { status: 'missing', checkedAt: now, confirmed: !once });
          }
        }
      } catch (error) {
        const status = isAccessError(error) ? 'no-access' : 'error';
        for (const target of batch) {
          const before = previous.get(targetKey(target));
          // An error never throws away what was read before.
          if (before?.status === 'found' && status === 'error') {
            results.set(targetKey(target), {
              ...before,
              checkedAt: now,
              failing: errorText(error),
            });
          } else {
            results.set(targetKey(target), { status, checkedAt: now, error: errorText(error) });
          }
        }
      }
    }
  }
  return results;
}
