import type { CheckRun } from './check-run';

export type ReviewStatus =
  | 'none'
  | 'pending'
  | 'commented'
  | 'approved'
  | 'changesRequested';

export type OverallStatus = 'red' | 'yellow' | 'green' | 'gray';

export interface PullRequest {
  number: number;
  title: string;
  headRef: string;
  baseRef: string;
  authorLogin: string;
  authorAvatarUrl: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  mergeable?: boolean;
  htmlUrl: string;
  body: string;
  repoOwner: string;
  repoName: string;
  reviewStatus: ReviewStatus;
  commentCount: number;
  labels: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  mergedAt?: string;
  closedAt?: string;
}

export interface PullRequestWithChecks {
  pullRequest: PullRequest;
  checks: CheckRun[];
  overallStatus: OverallStatus;
  failedCheckNames: string[];
  pendingCheckNames: string[];
  passedCount: number;
  skippedCount: number;
}

export interface PullRequestCommit {
  sha: string;
  message: string;
  authorLogin: string;
  authorAvatarUrl: string;
  date: string;
}

export interface PullRequestFileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previousFilename?: string;
}
