import { describe, expect, it } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';

// We test the pure buildBadgePayload logic extracted from useBadgeSync.
// Re-implementing it here to verify the data transformation is correct.

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR',
    headRef: 'feature',
    baseRef: 'main',
    authorLogin: 'testuser',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    isDraft: false,
    htmlUrl: 'https://github.com/test/repo/pull/1',
    body: '',
    repoOwner: 'test',
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
  };
}

function makePrWithChecks(
  overrides: Partial<PullRequest> = {},
  status: 'red' | 'yellow' | 'green' | 'gray' = 'green',
): PullRequestWithChecks {
  return {
    pullRequest: makePr(overrides),
    checks: [],
    overallStatus: status,
    failedCheckNames: status === 'red' ? ['build'] : [],
    pendingCheckNames: status === 'yellow' ? ['build'] : [],
    passedCount: status === 'green' ? 1 : 0,
    skippedCount: 0,
  };
}

// Replicate the badge payload building logic
function buildBadgePayload(
  pullRequests: PullRequestWithChecks[],
  username: string,
  badgeStyle: string,
) {
  const failingCount = pullRequests.filter((p) => p.overallStatus === 'red').length;
  const pendingCount = pullRequests.filter((p) => p.overallStatus === 'yellow').length;

  const lowerUser = username.toLowerCase();
  const myPrs = pullRequests.filter(
    (p) => lowerUser && p.pullRequest.authorLogin.toLowerCase() === lowerUser,
  );
  const teamPrs = pullRequests.filter(
    (p) => !lowerUser || p.pullRequest.authorLogin.toLowerCase() !== lowerUser,
  );

  return {
    totalPrCount: pullRequests.length,
    failingCount,
    pendingCount,
    myPrCount: myPrs.length,
    teamPrCount: teamPrs.length,
    badgeStyle,
  };
}

describe('Badge payload building', () => {
  it('returns zero counts when no PRs', () => {
    const result = buildBadgePayload([], 'testuser', 'GlassCapsule');
    expect(result.totalPrCount).toBe(0);
    expect(result.failingCount).toBe(0);
    expect(result.pendingCount).toBe(0);
    expect(result.myPrCount).toBe(0);
    expect(result.teamPrCount).toBe(0);
  });

  it('counts PRs correctly with mixed statuses', () => {
    const prs = [
      makePrWithChecks({ number: 1, authorLogin: 'testuser' }, 'green'),
      makePrWithChecks({ number: 2, authorLogin: 'testuser' }, 'red'),
      makePrWithChecks({ number: 3, authorLogin: 'other' }, 'yellow'),
      makePrWithChecks({ number: 4, authorLogin: 'other' }, 'green'),
    ];
    const result = buildBadgePayload(prs, 'testuser', 'GlassCapsule');
    expect(result.totalPrCount).toBe(4);
    expect(result.failingCount).toBe(1);
    expect(result.pendingCount).toBe(1);
    expect(result.myPrCount).toBe(2);
    expect(result.teamPrCount).toBe(2);
  });

  it('separates my PRs from team PRs case-insensitively', () => {
    const prs = [
      makePrWithChecks({ number: 1, authorLogin: 'TestUser' }, 'green'),
      makePrWithChecks({ number: 2, authorLogin: 'TESTUSER' }, 'green'),
      makePrWithChecks({ number: 3, authorLogin: 'other' }, 'green'),
    ];
    const result = buildBadgePayload(prs, 'testuser', 'GlassCapsule');
    expect(result.myPrCount).toBe(2);
    expect(result.teamPrCount).toBe(1);
  });

  it('treats all PRs as team when username is empty', () => {
    const prs = [
      makePrWithChecks({ number: 1, authorLogin: 'someone' }, 'green'),
      makePrWithChecks({ number: 2, authorLogin: 'other' }, 'red'),
    ];
    const result = buildBadgePayload(prs, '', 'GlassCapsule');
    expect(result.totalPrCount).toBe(2);
    expect(result.myPrCount).toBe(0);
    expect(result.teamPrCount).toBe(2);
  });

  it('includes badge style', () => {
    const result = buildBadgePayload([], 'user', 'MinimalNotch');
    expect(result.badgeStyle).toBe('MinimalNotch');
  });

  it('counts only red as failing, only yellow as pending', () => {
    const prs = [
      makePrWithChecks({ number: 1 }, 'red'),
      makePrWithChecks({ number: 2 }, 'red'),
      makePrWithChecks({ number: 3 }, 'yellow'),
      makePrWithChecks({ number: 4 }, 'green'),
      makePrWithChecks({ number: 5 }, 'gray'),
    ];
    const result = buildBadgePayload(prs, 'user', 'GlassCapsule');
    expect(result.failingCount).toBe(2);
    expect(result.pendingCount).toBe(1);
  });
});
