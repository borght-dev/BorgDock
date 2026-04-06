import { describe, expect, it, vi, afterEach } from 'vitest';
import { computePriorityScores, sortByPriority } from '@/services/priority-scoring';
import type { PullRequestWithChecks, PullRequest } from '@/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR',
    headRef: 'feature/test',
    baseRef: 'main',
    authorLogin: 'testuser',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
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
    mergeable: true,
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
// computePriorityScores
// ---------------------------------------------------------------------------

describe('computePriorityScores', () => {
  it('excludes drafts from other authors', () => {
    const prs = [
      makePrWithChecks({ authorLogin: 'other', isDraft: true, number: 1 }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    expect(scores.size).toBe(0);
  });

  it('includes own drafts', () => {
    const prs = [
      makePrWithChecks({ authorLogin: 'me', isDraft: true, number: 1 }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    expect(scores.has(1)).toBe(true);
  });

  it('gives 45 points for readyToMerge when own PR is green, approved, not draft, mergeable', () => {
    const prs = [
      makePrWithChecks(
        {
          authorLogin: 'Me',
          number: 10,
          reviewStatus: 'approved',
          isDraft: false,
          mergeable: true,
        },
        { overallStatus: 'green' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'readyToMerge')).toBeDefined();
    expect(score.factors.find((f) => f.type === 'readyToMerge')!.points).toBe(45);
  });

  it('does not give readyToMerge when PR is draft', () => {
    const prs = [
      makePrWithChecks(
        { authorLogin: 'me', number: 10, reviewStatus: 'approved', isDraft: true },
        { overallStatus: 'green' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'readyToMerge')).toBeUndefined();
  });

  it('does not give readyToMerge when not approved', () => {
    const prs = [
      makePrWithChecks(
        { authorLogin: 'me', number: 10, reviewStatus: 'pending' },
        { overallStatus: 'green' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'readyToMerge')).toBeUndefined();
  });

  it('does not give readyToMerge when mergeable is false', () => {
    const prs = [
      makePrWithChecks(
        { authorLogin: 'me', number: 10, reviewStatus: 'approved', mergeable: false },
        { overallStatus: 'green' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'readyToMerge')).toBeUndefined();
  });

  it('gives myPrRedChecks (20 pts) when own PR has red checks', () => {
    const prs = [
      makePrWithChecks(
        { authorLogin: 'me', number: 10 },
        { overallStatus: 'red' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    const factor = score.factors.find((f) => f.type === 'myPrRedChecks');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(20);
  });

  it('gives myPrChangesRequested (15 pts) for own PR with changes requested', () => {
    const prs = [
      makePrWithChecks({ authorLogin: 'me', number: 10, reviewStatus: 'changesRequested' }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    const factor = score.factors.find((f) => f.type === 'myPrChangesRequested');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(15);
  });

  it('gives myPrStale (10 pts) for own stale PR with red checks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-03T00:00:00Z'));

    const prs = [
      makePrWithChecks(
        { authorLogin: 'me', number: 10, updatedAt: '2025-06-01T00:00:00Z' },
        { overallStatus: 'red' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'myPrStale')).toBeDefined();
  });

  it('gives myPrStale for own stale PR with changesRequested', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-03T00:00:00Z'));

    const prs = [
      makePrWithChecks(
        {
          authorLogin: 'me',
          number: 10,
          updatedAt: '2025-06-01T00:00:00Z',
          reviewStatus: 'changesRequested',
        },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'myPrStale')).toBeDefined();
  });

  it('does not give myPrStale when updated recently', () => {
    const prs = [
      makePrWithChecks(
        { authorLogin: 'me', number: 10, reviewStatus: 'changesRequested' },
        { overallStatus: 'red' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'myPrStale')).toBeUndefined();
  });

  it('gives reviewRequested (15 pts) when user is a requested reviewer', () => {
    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        requestedReviewers: ['Me'],
      }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    const factor = score.factors.find((f) => f.type === 'reviewRequested');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(15);
  });

  it('adds reviewAging (7 pts) when SLA tier is aging', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T06:00:00Z'));

    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['me'],
      }),
    ];
    const timestamps = { 'org/repo#10:me': '2025-06-01T00:00:00Z' }; // 6h ago = aging
    const scores = computePriorityScores(prs, 'me', timestamps);
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'reviewAging')).toBeDefined();
  });

  it('adds reviewStale (8 pts) when SLA tier is stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-02T06:00:00Z'));

    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['me'],
      }),
    ];
    const timestamps = { 'org/repo#10:me': '2025-06-01T00:00:00Z' }; // 30h ago = stale
    const scores = computePriorityScores(prs, 'me', timestamps);
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'reviewStale')).toBeDefined();
    expect(score.factors.find((f) => f.type === 'reviewStale')!.points).toBe(8);
  });

  it('does not add reviewAging/Stale when no timestamp', () => {
    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        requestedReviewers: ['me'],
      }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'reviewAging')).toBeUndefined();
    expect(score.factors.find((f) => f.type === 'reviewStale')).toBeUndefined();
  });

  it('does not give reviewRequested when username is empty', () => {
    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        requestedReviewers: ['someone'],
      }),
    ];
    const scores = computePriorityScores(prs, '', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'reviewRequested')).toBeUndefined();
  });

  it('gives staleness points for PRs not updated in > 24h', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-03T00:00:00Z'));

    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        updatedAt: '2025-06-01T00:00:00Z', // 48h ago
      }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    const factor = score.factors.find((f) => f.type === 'staleness');
    expect(factor).toBeDefined();
    // (48 - 24) / 24 + 2 = 3, min(10, 3) = 3
    expect(factor!.points).toBe(3);
  });

  it('caps staleness points at 10', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-07-01T00:00:00Z'));

    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        updatedAt: '2025-06-01T00:00:00Z', // 30 days ago
      }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    const factor = score.factors.find((f) => f.type === 'staleness');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(10);
  });

  it('does not give staleness when updated recently', () => {
    const prs = [
      makePrWithChecks({ authorLogin: 'other', number: 10 }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'staleness')).toBeUndefined();
  });

  it('gives othersRedChecks (5 pts) for others PR with red status', () => {
    const prs = [
      makePrWithChecks(
        { authorLogin: 'other', number: 10 },
        { overallStatus: 'red' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    const factor = score.factors.find((f) => f.type === 'othersRedChecks');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(5);
  });

  it('does not give othersRedChecks for own PR', () => {
    const prs = [
      makePrWithChecks(
        { authorLogin: 'me', number: 10 },
        { overallStatus: 'red' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.factors.find((f) => f.type === 'othersRedChecks')).toBeUndefined();
  });

  // ---- Repo weight multiplier ----

  it('applies 1.2x multiplier for high-priority repos', () => {
    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        repoOwner: 'org',
        repoName: 'important',
        requestedReviewers: ['me'],
      }),
    ];
    const repoPriority = { 'org/important': 'high' as const };
    const scores = computePriorityScores(prs, 'me', {}, undefined, repoPriority);
    const score = scores.get(10)!;
    // Base = 15 (reviewRequested), * 1.2 = 18
    expect(score.total).toBe(18);
  });

  it('applies 0.5x multiplier for low-priority repos', () => {
    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        repoOwner: 'org',
        repoName: 'unimportant',
        requestedReviewers: ['me'],
      }),
    ];
    const repoPriority = { 'org/unimportant': 'low' as const };
    const scores = computePriorityScores(prs, 'me', {}, undefined, repoPriority);
    const score = scores.get(10)!;
    // Base = 15 * 0.5 = 7.5, round = 8
    expect(score.total).toBe(8);
  });

  it('applies 0.7x multiplier when contributor weight < 0.1 (no manual override)', () => {
    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['me'],
      }),
    ];
    const contributorWeights = new Map([['org/repo', 0.05]]);
    const scores = computePriorityScores(prs, 'me', {}, contributorWeights, {});
    const score = scores.get(10)!;
    // Base = 15 * 0.7 = 10.5, round = 11
    expect(score.total).toBe(11);
  });

  it('uses 1.0 multiplier when contributor weight >= 0.1', () => {
    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['me'],
      }),
    ];
    const contributorWeights = new Map([['org/repo', 0.5]]);
    const scores = computePriorityScores(prs, 'me', {}, contributorWeights, {});
    const score = scores.get(10)!;
    expect(score.total).toBe(15);
  });

  it('manual priority overrides contributor weight', () => {
    const prs = [
      makePrWithChecks({
        authorLogin: 'other',
        number: 10,
        repoOwner: 'org',
        repoName: 'repo',
        requestedReviewers: ['me'],
      }),
    ];
    const contributorWeights = new Map([['org/repo', 0.01]]);
    const repoPriority = { 'org/repo': 'high' as const };
    const scores = computePriorityScores(prs, 'me', {}, contributorWeights, repoPriority);
    const score = scores.get(10)!;
    // Manual high = 1.2, not 0.7 from contributor weight
    expect(score.total).toBe(18);
  });

  it('builds primaryReason from sorted factor labels', () => {
    const prs = [
      makePrWithChecks(
        { authorLogin: 'other', number: 10, requestedReviewers: ['me'] },
        { overallStatus: 'red' },
      ),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    // reviewRequested(15) > othersRedChecks(5)
    expect(score.primaryReason).toBe('Review requested \u00b7 Build failing');
  });

  it('returns "Open PR" as primaryReason when no factors', () => {
    const prs = [
      makePrWithChecks({ authorLogin: 'other', number: 10 }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    const score = scores.get(10)!;
    expect(score.primaryReason).toBe('Open PR');
    expect(score.total).toBe(0);
  });

  it('username comparison is case-insensitive', () => {
    const prs = [
      makePrWithChecks(
        { authorLogin: 'MyUser', number: 10, reviewStatus: 'approved' },
        { overallStatus: 'green' },
      ),
    ];
    const scores = computePriorityScores(prs, 'myuser', {});
    expect(scores.get(10)!.factors.find((f) => f.type === 'readyToMerge')).toBeDefined();
  });

  it('handles multiple PRs in a single call', () => {
    const prs = [
      makePrWithChecks({ authorLogin: 'me', number: 1 }),
      makePrWithChecks({ authorLogin: 'other', number: 2 }),
      makePrWithChecks({ authorLogin: 'other', number: 3, isDraft: true }),
    ];
    const scores = computePriorityScores(prs, 'me', {});
    expect(scores.has(1)).toBe(true);
    expect(scores.has(2)).toBe(true);
    expect(scores.has(3)).toBe(false); // excluded: other's draft
  });

  it('handles empty PR list', () => {
    const scores = computePriorityScores([], 'me', {});
    expect(scores.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sortByPriority
// ---------------------------------------------------------------------------

describe('sortByPriority', () => {
  it('sorts PRs descending by score', () => {
    const pr1 = makePrWithChecks({ number: 1, authorLogin: 'other' });
    const pr2 = makePrWithChecks({
      number: 2,
      authorLogin: 'other',
      requestedReviewers: ['me'],
    });

    const scores = computePriorityScores([pr1, pr2], 'me', {});
    const sorted = sortByPriority([pr1, pr2], scores);
    expect(sorted[0].pullRequest.number).toBe(2); // higher score (reviewRequested)
    expect(sorted[1].pullRequest.number).toBe(1);
  });

  it('tie-breaks by oldest updatedAt first', () => {
    const pr1 = makePrWithChecks({
      number: 1,
      authorLogin: 'other',
      updatedAt: '2025-06-02T00:00:00Z',
    });
    const pr2 = makePrWithChecks({
      number: 2,
      authorLogin: 'other',
      updatedAt: '2025-06-01T00:00:00Z',
    });

    const scores = computePriorityScores([pr1, pr2], 'me', {});
    const sorted = sortByPriority([pr1, pr2], scores);
    // Both have score 0, pr2 is older so comes first
    expect(sorted[0].pullRequest.number).toBe(2);
  });

  it('tie-breaks by smaller PR size when updatedAt is same', () => {
    const pr1 = makePrWithChecks({
      number: 1,
      authorLogin: 'other',
      updatedAt: '2025-06-01T00:00:00Z',
      additions: 100,
      deletions: 50,
    });
    const pr2 = makePrWithChecks({
      number: 2,
      authorLogin: 'other',
      updatedAt: '2025-06-01T00:00:00Z',
      additions: 5,
      deletions: 3,
    });

    const scores = computePriorityScores([pr1, pr2], 'me', {});
    const sorted = sortByPriority([pr1, pr2], scores);
    // Same score and updatedAt, pr2 is smaller
    expect(sorted[0].pullRequest.number).toBe(2);
  });

  it('filters out PRs without scores', () => {
    const pr1 = makePrWithChecks({ number: 1, authorLogin: 'other' });
    const pr2 = makePrWithChecks({ number: 2, authorLogin: 'other', isDraft: true });

    const scores = computePriorityScores([pr1, pr2], 'me', {}); // pr2 excluded (other's draft)
    const sorted = sortByPriority([pr1, pr2], scores);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].pullRequest.number).toBe(1);
  });

  it('returns empty array for empty input', () => {
    const sorted = sortByPriority([], new Map());
    expect(sorted).toEqual([]);
  });

  it('does not mutate original array', () => {
    const pr1 = makePrWithChecks({ number: 1, authorLogin: 'other' });
    const pr2 = makePrWithChecks({ number: 2, authorLogin: 'other' });
    const original = [pr1, pr2];

    const scores = computePriorityScores(original, 'me', {});
    sortByPriority(original, scores);
    expect(original[0].pullRequest.number).toBe(1); // unchanged
  });
});
