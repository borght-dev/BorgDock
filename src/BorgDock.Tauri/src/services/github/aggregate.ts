import type { CheckRun, CiJob, OverallStatus, PullRequest, PullRequestWithChecks } from '@/types';
import { workflowRunIdOf } from './check-runs';

/**
 * The completed checks among REST check runs, as `CiJob`s. Commit statuses
 * arrive with negative ids from `getCheckSummaryForRef`; runs without an id
 * (polling lites) are left out.
 */
export function ciJobsOf(checks: readonly CheckRun[]): CiJob[] {
  return checks.flatMap((check): CiJob[] => {
    if (check.id === 0 || check.status !== 'completed' || !check.conclusion) return [];
    const runId = workflowRunIdOf(check);
    return [
      {
        id: check.id < 0 ? 0 : check.id,
        kind: check.id < 0 ? 'status' : runId !== null ? 'actions' : 'check',
        name: check.name,
        ...(check.workflowName ? { workflowName: check.workflowName } : {}),
        ...(check.workflowEvent ? { workflowEvent: check.workflowEvent } : {}),
        ...(runId !== null ? { runId } : {}),
        ...(check.checkSuiteId > 0 ? { checkSuiteId: check.checkSuiteId } : {}),
        conclusion: check.conclusion,
        ...(check.completedAt ? { completedAt: check.completedAt } : {}),
      },
    ];
  });
}

export function aggregatePrWithChecks(
  pr: PullRequest,
  checks: CheckRun[] | undefined,
  ciJobs: CiJob[] | undefined = checks ? ciJobsOf(checks) : undefined,
): PullRequestWithChecks {
  const checkRuns = checks ?? [];
  const overallStatus = computeOverallStatus(checkRuns);

  const failedRuns = checkRuns.filter(
    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out',
  );
  const failedCheckNames = failedRuns.map((c) => c.name);
  const failedCheckSuiteIds = failedRuns
    .map((c) => c.checkSuiteId)
    .filter((id): id is number => typeof id === 'number' && id > 0);

  const pendingCheckNames = checkRuns
    .filter((c) => c.status === 'in_progress' || c.status === 'queued')
    .map((c) => c.name);

  const passedCount = checkRuns.filter((c) => c.conclusion === 'success').length;

  const skippedCount = checkRuns.filter(
    (c) => c.conclusion === 'skipped' || c.conclusion === 'neutral',
  ).length;

  return {
    pullRequest: pr,
    ...(checks === undefined ? { checksUnavailable: true } : {}),
    overallStatus,
    failedCheckNames,
    failedCheckSuiteIds,
    ...(ciJobs && ciJobs.length > 0 ? { ciJobs } : {}),
    pendingCheckNames,
    passedCount,
    skippedCount,
    totalCheckCount: checkRuns.length,
  };
}

export function computeOverallStatus(checks: CheckRun[]): OverallStatus {
  if (checks.length === 0) return 'gray';

  const hasFailure = checks.some((c) => c.conclusion === 'failure' || c.conclusion === 'timed_out');
  if (hasFailure) return 'red';

  const hasPending = checks.some((c) => c.status === 'in_progress' || c.status === 'queued');
  if (hasPending) return 'yellow';

  const allPassed = checks.every(
    (c) =>
      c.conclusion === 'success' ||
      c.conclusion === 'skipped' ||
      c.conclusion === 'neutral' ||
      c.conclusion === 'cancelled',
  );
  if (allPassed) return 'green';

  return 'gray';
}
