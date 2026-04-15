import type { PullRequestWithChecks } from '@/types';

let _seq = 1;

export function makePr(
  overrides: Partial<PullRequestWithChecks['pullRequest']> = {},
): PullRequestWithChecks {
  const n = _seq++;
  return {
    pullRequest: {
      number: n,
      title: `PR title ${n}`,
      headRef: `feature-${n}`,
      headSha: `abc${n}def`,
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: 'https://example.com/avatar.png',
      state: 'open',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: `https://github.com/owner/repo/pull/${n}`,
      body: `Body of PR ${n}`,
      repoOwner: 'owner',
      repoName: 'repo',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [],
      ...overrides,
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
  };
}

export function resetSeq() {
  _seq = 1;
}
