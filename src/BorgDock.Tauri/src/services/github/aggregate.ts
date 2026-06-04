import type { CheckRun, OverallStatus, PullRequest, PullRequestWithChecks } from '@/types';

export function aggregatePrWithChecks(
  pr: PullRequest,
  checkRuns: CheckRun[],
): PullRequestWithChecks {
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
    overallStatus,
    failedCheckNames,
    failedCheckSuiteIds,
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
