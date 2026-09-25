import type { CheckRun } from '@/types';

/**
 * Pure facts about check runs, shared by the REST fetch, the rerun service,
 * the Checks tab and the first-failure excerpt. No I/O here.
 */

const ACTIONS_JOB_RE = /\/actions\/runs\/(\d+)\/job\/\d+/;

/**
 * The GitHub Actions workflow run a check run belongs to, from its job URL
 * (`…/actions/runs/<run id>/job/<job id>`). Null for checks that other apps
 * report (their URLs have no workflow run).
 */
export function workflowRunIdOf(run: Pick<CheckRun, 'htmlUrl'>): number | null {
  const match = ACTIONS_JOB_RE.exec(run.htmlUrl ?? '');
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** A GitHub Actions job's check run (its id is the job id). */
export function isActionsJob(run: Pick<CheckRun, 'htmlUrl'>): boolean {
  return workflowRunIdOf(run) !== null;
}

/** Failed the way the PR aggregate counts it (`failedCheckNames`), plus startup failures. */
export function isFailedRun(run: CheckRun): boolean {
  return (
    run.conclusion === 'failure' ||
    run.conclusion === 'timed_out' ||
    run.conclusion === 'startup_failure'
  );
}

export interface RerunPlan {
  /** GitHub Actions workflow runs whose failed jobs are rerun. */
  workflowRunIds: number[];
  /** Check suites of other apps, rerequested as a whole. */
  checkSuiteIds: number[];
}

/**
 * What rerunning `failed` takes: each GitHub Actions workflow run once
 * (`rerun-failed-jobs`), and each other app's check suite once
 * (`rerequest`). Runs with neither are left out.
 */
export function planRerun(failed: CheckRun[]): RerunPlan {
  const workflowRunIds = new Set<number>();
  const checkSuiteIds = new Set<number>();
  for (const run of failed) {
    const workflowRunId = workflowRunIdOf(run);
    if (workflowRunId !== null) workflowRunIds.add(workflowRunId);
    else if (run.checkSuiteId > 0) checkSuiteIds.add(run.checkSuiteId);
  }
  return { workflowRunIds: [...workflowRunIds], checkSuiteIds: [...checkSuiteIds] };
}
