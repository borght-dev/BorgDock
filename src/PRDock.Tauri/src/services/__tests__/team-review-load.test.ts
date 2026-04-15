import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeTeamReviewLoad } from '@/services/team-review-load';
import type { PullRequest, PullRequestWithChecks } from '@/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR',
    headRef: 'feature/test',
    baseRef: 'main',
    authorLogin: 'author',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    isDraft: false,
    htmlUrl: '',
    body: '',
    repoOwner: 'org',
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
  prOverrides: Partial<PullRequest> = {},
  overrides: Partial<Omit<PullRequestWithChecks, 'pullRequest'>> = {},
): PullRequestWithChecks {
  return {
    pullRequest: makePr(prOverrides),
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// computeTeamReviewLoad
// ---------------------------------------------------------------------------

describe('computeTeamReviewLoad', () => {
  it('returns empty array for no PRs', () => {
    expect(computeTeamReviewLoad([], {})).toEqual([]);
  });

  it('returns empty array when no PRs have requested reviewers', () => {
    const prs = [makePrWithChecks({ number: 1, requestedReviewers: [] })];
    expect(computeTeamReviewLoad(prs, {})).toEqual([]);
  });

  it('counts pending reviews per reviewer', () => {
    const prs = [
      makePrWithChecks({ number: 1, requestedReviewers: ['alice', 'bob'] }),
      makePrWithChecks({ number: 2, requestedReviewers: ['alice'] }),
    ];
    const result = computeTeamReviewLoad(prs, {});
    const alice = result.find((r) => r.login === 'alice');
    const bob = result.find((r) => r.login === 'bob');
    expect(alice!.pendingReviewCount).toBe(2);
    expect(bob!.pendingReviewCount).toBe(1);
  });

  it('normalizes reviewer logins to lowercase', () => {
    const prs = [
      makePrWithChecks({ number: 1, requestedReviewers: ['Alice'] }),
      makePrWithChecks({ number: 2, requestedReviewers: ['ALICE'] }),
    ];
    const result = computeTeamReviewLoad(prs, {});
    expect(result).toHaveLength(1);
    expect(result[0].login).toBe('alice');
    expect(result[0].pendingReviewCount).toBe(2);
  });

  it('counts stale reviews using SLA tier', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-03T00:00:00Z'));

    const prs = [
      makePrWithChecks({
        number: 1,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['alice'],
      }),
    ];
    const timestamps = {
      'org/repo#1:alice': '2025-06-01T00:00:00Z', // 48h ago = stale
    };
    const result = computeTeamReviewLoad(prs, timestamps);
    expect(result[0].stalePrCount).toBe(1);
  });

  it('does not count fresh reviews as stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T01:00:00Z'));

    const prs = [
      makePrWithChecks({
        number: 1,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['alice'],
      }),
    ];
    const timestamps = {
      'org/repo#1:alice': '2025-06-01T00:00:00Z', // 1h ago = fresh
    };
    const result = computeTeamReviewLoad(prs, timestamps);
    expect(result[0].stalePrCount).toBe(0);
  });

  it('does not count aging reviews as stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T10:00:00Z'));

    const prs = [
      makePrWithChecks({
        number: 1,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['alice'],
      }),
    ];
    const timestamps = {
      'org/repo#1:alice': '2025-06-01T00:00:00Z', // 10h ago = aging
    };
    const result = computeTeamReviewLoad(prs, timestamps);
    expect(result[0].stalePrCount).toBe(0);
  });

  it('computes avgWaitHours correctly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));

    const prs = [
      makePrWithChecks({
        number: 1,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['alice'],
      }),
      makePrWithChecks({
        number: 2,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['alice'],
      }),
    ];
    const timestamps = {
      'org/repo#1:alice': '2025-06-01T00:00:00Z', // 12h
      'org/repo#2:alice': '2025-06-01T06:00:00Z', // 6h
    };
    const result = computeTeamReviewLoad(prs, timestamps);
    // Total wait = 12h + 6h = 18h, avg = 18/2 = 9h
    expect(result[0].avgWaitHours).toBe(9);
  });

  it('avgWaitHours is 0 when no timestamps exist', () => {
    const prs = [makePrWithChecks({ number: 1, requestedReviewers: ['alice'] })];
    const result = computeTeamReviewLoad(prs, {});
    expect(result[0].avgWaitHours).toBe(0);
  });

  it('avgWaitHours averages across all pending including ones without timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T10:00:00Z'));

    const prs = [
      makePrWithChecks({
        number: 1,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['alice'],
      }),
      makePrWithChecks({
        number: 2,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['alice'],
      }),
    ];
    const timestamps = {
      'org/repo#1:alice': '2025-06-01T00:00:00Z', // 10h
      // No timestamp for PR #2
    };
    const result = computeTeamReviewLoad(prs, timestamps);
    // totalWaitMs = 10h only from PR#1, only 1 review has a timestamp
    // avg = 10h / 1 = 10h
    expect(result[0].avgWaitHours).toBe(10);
  });

  it('sorts results by pendingReviewCount descending', () => {
    const prs = [
      makePrWithChecks({ number: 1, requestedReviewers: ['bob'] }),
      makePrWithChecks({ number: 2, requestedReviewers: ['alice', 'bob'] }),
      makePrWithChecks({ number: 3, requestedReviewers: ['alice', 'bob'] }),
    ];
    const result = computeTeamReviewLoad(prs, {});
    expect(result[0].login).toBe('bob');
    expect(result[0].pendingReviewCount).toBe(3);
    expect(result[1].login).toBe('alice');
    expect(result[1].pendingReviewCount).toBe(2);
  });

  it('handles a reviewer on many PRs', () => {
    const prs = Array.from({ length: 10 }, (_, i) =>
      makePrWithChecks({ number: i + 1, requestedReviewers: ['alice'] }),
    );
    const result = computeTeamReviewLoad(prs, {});
    expect(result[0].login).toBe('alice');
    expect(result[0].pendingReviewCount).toBe(10);
  });

  it('handles multiple reviewers on same PR', () => {
    const prs = [
      makePrWithChecks({
        number: 1,
        requestedReviewers: ['alice', 'bob', 'charlie'],
      }),
    ];
    const result = computeTeamReviewLoad(prs, {});
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.pendingReviewCount === 1)).toBe(true);
  });
});
