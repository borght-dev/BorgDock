export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
  htmlUrl: string;
  checkSuiteId: number;
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
