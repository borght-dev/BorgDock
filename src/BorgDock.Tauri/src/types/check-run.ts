export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
  htmlUrl: string;
  checkSuiteId: number;
  /**
   * Name of the GitHub Actions workflow that ran this check (its check
   * suite's workflow run), when the fetch looked it up. The check-runs API
   * names a run by its job alone.
   */
  workflowName?: string;
  workflowEvent?: string;
}

/**
 * A completed check the poll saw on a PR's head commit, kept so related CI
 * failures can notice new failures and passing retries without another
 * request.
 */
export interface CiJob {
  /** The job id for GitHub Actions, the check run id for other apps, 0 for commit statuses. */
  id: number;
  kind: 'actions' | 'check' | 'status';
  name: string;
  workflowName?: string;
  workflowEvent?: string;
  /** The workflow run of an Actions job. */
  runId?: number;
  runNumber?: number;
  checkSuiteId?: number;
  appSlug?: string;
  conclusion: string;
  completedAt?: string;
  /** What a commit status says about itself. */
  description?: string;
}

export interface CheckSuite {
  id: number;
  status: string;
  conclusion?: string;
  headSha: string;
  checkRuns: CheckRun[];
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
  runId: number;
  htmlUrl: string;
}
