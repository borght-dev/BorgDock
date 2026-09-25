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

export interface ParsedError {
  filePath: string;
  lineNumber?: number;
  columnNumber?: number;
  message: string;
  errorCode: string;
  category: string;
  isIntroducedByPr: boolean;
}
