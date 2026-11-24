import type { PullRequestWithChecks } from '@/types';
import { branchKey } from './worktree-list-model';

/**
 * What the pull requests say about a worktree's branch. Shared by the prune
 * dialog and by the counts that offer it ("12 with a merged or closed PR").
 */
export type PruneStatus = 'open' | 'closed' | 'orphaned' | 'unknown';

/** Head branches of the open and the recently merged or closed pull requests, by `branchKey`. */
export interface PrBranches {
  open: ReadonlySet<string>;
  closed: ReadonlySet<string>;
}

function headKeys(pullRequests: readonly PullRequestWithChecks[]): Set<string> {
  return new Set(
    pullRequests.map(({ pullRequest: pr }) => branchKey(pr.repoOwner, pr.repoName, pr.headRef)),
  );
}

export function prBranches(
  open: readonly PullRequestWithChecks[],
  closed: readonly PullRequestWithChecks[],
): PrBranches {
  return { open: headKeys(open), closed: headKeys(closed) };
}

/**
 * Open wins over closed: a branch that was merged once and has a new pull
 * request is in use. `branches` is null where this window has no pull
 * request data, and nothing can be called closed or orphaned.
 */
export function pruneStatus(
  repo: { owner: string; name: string },
  branchName: string,
  branches: PrBranches | null,
): PruneStatus {
  if (!branches) return 'unknown';
  const key = branchKey(repo.owner, repo.name, branchName);
  if (branches.open.has(key)) return 'open';
  if (branches.closed.has(key)) return 'closed';
  return 'orphaned';
}
