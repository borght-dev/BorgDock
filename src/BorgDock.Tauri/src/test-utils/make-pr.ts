import type { OverallStatus, PullRequestWithChecks, ReviewStatus } from '@/types';

interface MakePrOverrides {
  overallStatus?: OverallStatus;
  authorLogin?: string;
  reviewStatus?: ReviewStatus;
  requestedReviewers?: string[];
}

export function makePr(number: number, overrides: MakePrOverrides = {}): PullRequestWithChecks {
  const {
    overallStatus = 'green',
    authorLogin = 'user',
    reviewStatus = 'none',
    requestedReviewers = [],
  } = overrides;

  return {
    pullRequest: {
      number,
      title: `PR #${number}`,
      headRef: 'feature',
      baseRef: 'main',
      authorLogin,
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: '',
      body: '',
      repoOwner: 'owner',
      repoName: 'repo',
      reviewStatus,
      commentCount: 0,
      labels: [],
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commitCount: 1,
      requestedReviewers,
    },
    checks: [],
    overallStatus,
    failedCheckNames: overallStatus === 'red' ? ['build'] : [],
    pendingCheckNames: [],
    passedCount: overallStatus === 'green' ? 1 : 0,
    skippedCount: 0,
  };
}
