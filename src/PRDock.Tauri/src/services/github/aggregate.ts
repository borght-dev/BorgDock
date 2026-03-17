import type {
  PullRequest,
  PullRequestWithChecks,
  CheckRun,
  OverallStatus,
} from '@/types';

export function aggregatePrWithChecks(
  pr: PullRequest,
  checkRuns: CheckRun[]
): PullRequestWithChecks {
  const overallStatus = computeOverallStatus(checkRuns);

  const failedCheckNames = checkRuns
    .filter((c) => c.conclusion === 'failure' || c.conclusion === 'timed_out')
    .map((c) => c.name);

  const pendingCheckNames = checkRuns
    .filter((c) => c.status === 'in_progress' || c.status === 'queued')
    .map((c) => c.name);

  const passedCount = checkRuns.filter(
    (c) => c.conclusion === 'success'
  ).length;

  const skippedCount = checkRuns.filter(
    (c) => c.conclusion === 'skipped' || c.conclusion === 'neutral'
  ).length;

  return {
    pullRequest: pr,
    checks: checkRuns,
    overallStatus,
    failedCheckNames,
    pendingCheckNames,
    passedCount,
    skippedCount,
  };
}

export function computeOverallStatus(checks: CheckRun[]): OverallStatus {
  if (checks.length === 0) return 'gray';

  const hasFailure = checks.some(
    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out'
  );
  if (hasFailure) return 'red';

  const hasPending = checks.some(
    (c) => c.status === 'in_progress' || c.status === 'queued'
  );
  if (hasPending) return 'yellow';

  const allPassed = checks.every(
    (c) =>
      c.conclusion === 'success' ||
      c.conclusion === 'skipped' ||
      c.conclusion === 'neutral'
  );
  if (allPassed) return 'green';

  return 'gray';
}
