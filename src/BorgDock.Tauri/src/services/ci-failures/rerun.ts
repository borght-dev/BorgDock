import { rerunFailedChecks } from '@/services/github/checks';
import { GitHubApiError } from '@/services/github/client';
import { updatePullRequestBranch } from '@/services/github/mutations';
import { getClientForRepo } from '@/services/github/singleton';
import type { CheckRun, PullRequestWithChecks } from '@/types';
import { parseScope } from './identity';
import { outsideCauseOf } from './lens';
import type { CiGroupDetail, CiGroupSummary } from './types';

/** A PR still red with this group's failure, and the checks a rerun would retry. */
export interface RerunTarget {
  pr: PullRequestWithChecks;
  /** Failed checks of the PR's head that the group's occurrences name. */
  checks: CheckRun[];
  /** Workflow runs whose failed jobs get rerun: every failed job in each, not only these. */
  workflowRunIds: number[];
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

/**
 * The open PRs a group fails right now, from the latest poll: those whose
 * head has a failed job the group holds (`prJobIds`). The strip and the row
 * markers count the same PRs, so "Update 3 PRs" updates those three.
 */
export function rerunTargets(
  detail: CiGroupDetail,
  prs: readonly PullRequestWithChecks[],
): RerunTarget[] {
  const parts = parseScope(detail.summary.scope);
  if (!parts) return [];
  const jobs = new Set(detail.summary.prJobIds);
  return prs.flatMap((pr) => {
    const p = pr.pullRequest;
    if (p.repoOwner.toLowerCase() !== parts.owner || p.repoName.toLowerCase() !== parts.repo)
      return [];
    const checks: CheckRun[] = (pr.ciJobs ?? [])
      .filter((job) => job.kind !== 'status' && FAILED.has(job.conclusion) && jobs.has(job.id))
      .map((job) => ({
        id: job.id,
        name: job.name,
        status: 'completed',
        conclusion: job.conclusion,
        htmlUrl:
          job.kind === 'actions' && job.runId
            ? `https://github.com/${p.repoOwner}/${p.repoName}/actions/runs/${job.runId}/job/${job.id}`
            : '',
        checkSuiteId: job.checkSuiteId ?? 0,
      }));
    if (checks.length === 0) return [];
    const workflowRunIds = [
      ...new Set(
        (pr.ciJobs ?? [])
          .filter((job) => checks.some((c) => c.id === job.id) && job.runId)
          .map((job) => job.runId as number),
      ),
    ];
    return [{ pr, checks, workflowRunIds }];
  });
}

export interface RerunOutcome {
  prNumber: number;
  error: string | null;
}

/** Reruns each target in turn, never in parallel, and reports per PR. */
export async function rerunAffected(targets: readonly RerunTarget[]): Promise<RerunOutcome[]> {
  const outcomes: RerunOutcome[] = [];
  for (const target of targets) {
    const p = target.pr.pullRequest;
    const client = getClientForRepo(p.repoOwner, p.repoName);
    if (!client) {
      outcomes.push({ prNumber: p.number, error: 'No GitHub client for this repository' });
      continue;
    }
    try {
      await rerunFailedChecks(client, p.repoOwner, p.repoName, target.checks);
      outcomes.push({ prNumber: p.number, error: null });
    } catch (error) {
      outcomes.push({
        prNumber: p.number,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcomes;
}

export interface UpdateOutcome {
  prNumber: number;
  /** `updated`: the base branch was merged in and CI starts again; `rerun`: the branch had it already. */
  action: 'updated' | 'rerun' | null;
  error: string | null;
}

/** GitHub's answer when the branch already has every commit of its base. */
function isUpToDate(error: unknown): boolean {
  return (
    error instanceof GitHubApiError && error.status === 422 && /no new commits/i.test(error.message)
  );
}

/**
 * Brings each target up to date with its base branch so its CI runs with the
 * fix, one PR at a time. A branch that already has the base gets its failed
 * jobs rerun instead: its last run predates nothing.
 */
export async function updateAffected(targets: readonly RerunTarget[]): Promise<UpdateOutcome[]> {
  const outcomes: UpdateOutcome[] = [];
  for (const target of targets) {
    const p = target.pr.pullRequest;
    const client = getClientForRepo(p.repoOwner, p.repoName);
    if (!client) {
      outcomes.push({
        prNumber: p.number,
        action: null,
        error: 'No GitHub client for this repository',
      });
      continue;
    }
    try {
      await updatePullRequestBranch(client, p.repoOwner, p.repoName, p.number, p.headSha);
      outcomes.push({ prNumber: p.number, action: 'updated', error: null });
    } catch (error) {
      if (!isUpToDate(error)) {
        outcomes.push({
          prNumber: p.number,
          action: null,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      try {
        await rerunFailedChecks(client, p.repoOwner, p.repoName, target.checks);
        outcomes.push({ prNumber: p.number, action: 'rerun', error: null });
      } catch (rerunError) {
        outcomes.push({
          prNumber: p.number,
          action: null,
          error: rerunError instanceof Error ? rerunError.message : String(rerunError),
        });
      }
    }
  }
  return outcomes;
}

/**
 * What brings a group's PRs back: `update` their branches once a fix is on
 * the base branch (a linked fix merged, or the default branch passes again),
 * `rerun` when the cause was never the code (infrastructure, flaky). Null
 * while neither holds.
 */
export function healModeOf(
  group: CiGroupSummary,
  recovered: boolean,
  branch: string | null = null,
): 'update' | 'rerun' | null {
  if (group.status === 'resolved' || group.status === 'merged') return null;
  if (group.fixMergedAt || recovered) return 'update';
  const cause = outsideCauseOf(group, branch);
  return cause === 'infrastructure' || cause === 'flaky' ? 'rerun' : null;
}
