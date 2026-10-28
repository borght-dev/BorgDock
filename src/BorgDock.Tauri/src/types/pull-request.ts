import type { CiJob } from './check-run';

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
  autoMergeEnabled?: boolean;
  htmlUrl: string;
  body: string;
  repoOwner: string;
  repoName: string;
  reviewStatus: ReviewStatus;
  commentCount: number;
  labels: string[];
  /** GitHub's colour per label name, hex without `#`, when the fetch path provides it. */
  labelColors?: Record<string, string>;
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  mergedAt?: string;
  closedAt?: string;
  /** The commit a merge made, when the read carried it. */
  mergeCommitSha?: string;
  /** Individual users still pending as requested reviewers (logins). */
  requestedReviewers: string[];
  /** Team slugs still pending as requested reviewers (e.g. `platform`). */
  requestedTeams?: string[];
  /** Latest review per reviewer, when the fetch path provides them. */
  latestReviews?: PrReview[];
}

export type PrReviewState = 'approved' | 'changesRequested' | 'commented' | 'dismissed' | 'pending';

export interface PrReview {
  /** GitHub's `databaseId` for the review, when the read carried it (GraphQL). */
  id?: number;
  authorLogin: string;
  commitSha?: string;
  state: PrReviewState;
  submittedAt?: string;
}

/** A deployment of a PR's head commit and its latest status. */
export interface HeadDeployment {
  id: number;
  environment: string;
  createdAt: string;
  status: {
    /** GitHub's node id: GraphQL gives deployment statuses no number. */
    id: string;
    /** success, failure, error, inactive, in_progress, queued, pending, waiting. */
    state: string;
    createdAt: string;
    logUrl: string | null;
    environmentUrl: string | null;
  } | null;
}

export interface PullRequestWithChecks {
  pullRequest: PullRequest;
  checksUnavailable?: boolean;
  overallStatus: OverallStatus;
  failedCheckNames: string[];
  /** Check-suite ids parallel to failedCheckNames (suite-less entries dropped) — used for rerun actions. */
  failedCheckSuiteIds: number[];
  /** Completed checks of the head commit; absent when the source didn't carry them. */
  ciJobs?: CiJob[];
  /** Deployments of the head commit (the GraphQL poll only). */
  headDeployments?: HeadDeployment[];
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
