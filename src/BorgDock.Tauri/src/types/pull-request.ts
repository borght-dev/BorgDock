export type ReviewStatus = 'none' | 'pending' | 'commented' | 'approved' | 'changesRequested';

export type OverallStatus = 'red' | 'yellow' | 'green' | 'gray';

export interface PullRequest {
  number: number;
  title: string;
  headRef: string;
  headSha?: string;
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
  /** Individual users still pending as requested reviewers (logins). */
  requestedReviewers: string[];
  /** Team slugs still pending as requested reviewers (e.g. `platform`). */
  requestedTeams?: string[];
  /** Latest review per reviewer, when the fetch path provides them. */
  latestReviews?: PrReview[];
}

export type PrReviewState = 'approved' | 'changesRequested' | 'commented' | 'dismissed' | 'pending';

export interface PrReview {
  authorLogin: string;
  state: PrReviewState;
  submittedAt?: string;
}

export interface PullRequestWithChecks {
  pullRequest: PullRequest;
  overallStatus: OverallStatus;
  failedCheckNames: string[];
  /** Check-suite ids parallel to failedCheckNames (suite-less entries dropped) — used for rerun actions. */
  failedCheckSuiteIds: number[];
  pendingCheckNames: string[];
  passedCount: number;
  skippedCount: number;
  totalCheckCount: number;
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
  sha?: string;
}
