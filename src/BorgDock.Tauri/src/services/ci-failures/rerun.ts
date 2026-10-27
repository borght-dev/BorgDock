import { rerunFailedChecks } from '@/services/github/checks';
import { getClientForRepo } from '@/services/github/singleton';
import type { CheckRun, PullRequestWithChecks } from '@/types';
import { parseMatrix, parseScope } from './identity';
import type { CiGroupDetail } from './types';

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
 * The open PRs a group affects right now, from the latest poll: those whose
 * head still has a failed check with a job name the group's occurrences
 * carry.
 */
export function rerunTargets(
  detail: CiGroupDetail,
  prs: readonly PullRequestWithChecks[],
): RerunTarget[] {
  const parts = parseScope(detail.summary.scope);
  if (!parts) return [];
  const names = new Set(detail.occurrences.map((o) => parseMatrix(o.occurrence.jobName).base));
  const numbers = new Set(detail.summary.prNumbers);
  return prs.flatMap((pr) => {
    const p = pr.pullRequest;
    if (!numbers.has(p.number)) return [];
    if (p.repoOwner.toLowerCase() !== parts.owner || p.repoName.toLowerCase() !== parts.repo)
      return [];
    const checks: CheckRun[] = (pr.ciJobs ?? [])
      .filter(
        (job) =>
          job.kind !== 'status' &&
          FAILED.has(job.conclusion) &&
          names.has(parseMatrix(job.name).base),
      )
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
