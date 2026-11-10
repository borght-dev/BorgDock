import { describe, expect, it } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { authorCandidates, planAuthorRun, runFit } from '../author-run';
import type { E2eRead } from '../e2e/load';
import type { E2eVerdict } from '../e2e/report';

function pr(
  number: number,
  overrides: Partial<PullRequestWithChecks['pullRequest']> = {},
  checks: Partial<PullRequestWithChecks> = {},
): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      title: `PR ${number}`,
      headRef: `feature/${number}`,
      headSha: `sha-${number}`,
      baseRef: 'main',
      authorLogin: 'robin',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: `2026-11-0${number}T10:00:00Z`,
      updatedAt: `2026-11-0${number}T10:00:00Z`,
      isDraft: false,
      mergeable: true,
      htmlUrl: `https://github.com/acme/shop/pull/${number}`,
      body: '',
      repoOwner: 'acme',
      repoName: 'shop',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 1,
      deletions: 1,
      changedFiles: 1,
      commitCount: 1,
      requestedReviewers: [],
      ...overrides,
    },
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 3,
    skippedCount: 0,
    totalCheckCount: 3,
    ...checks,
  };
}

const E2E = 'Deploy & Test / E2E Shard 1/4';
const ADVISORY = 'E2E reproducer advisory';
const outsideVerdict: E2eVerdict = {
  kind: 'outside',
  shared: false,
  tests: [],
  report: {
    commentId: 1,
    url: '',
    createdAt: '',
    failed: [],
    complete: true,
    smokeFailed: false,
    runNumber: 15274,
    runId: null,
  },
};
/** The report clears the shard it reports on. */
const outside: E2eRead = { verdict: outsideVerdict, covers: new Set([E2E]) };

describe('authorCandidates', () => {
  it("lists the author's open PRs oldest first, without drafts or ones I approved at their head", () => {
    const prs = [
      pr(3),
      pr(1),
      pr(2, { isDraft: true }),
      pr(4, { authorLogin: 'sam' }),
      pr(5, { latestReviews: [{ authorLogin: 'me', state: 'approved', commitSha: 'sha-5' }] }),
      pr(6, { latestReviews: [{ authorLogin: 'me', state: 'approved', commitSha: 'older' }] }),
    ];
    expect(authorCandidates(prs, 'Robin', 'me').map((p) => p.pullRequest.number)).toEqual([
      1, 3, 6,
    ]);
  });

  it('never runs over my own PRs', () => {
    expect(authorCandidates([pr(1, { authorLogin: 'me' })], 'me', 'me')).toEqual([]);
  });
});

describe('runFit', () => {
  const noEvidence = { e2e: null, outsideCause: null };

  it('holds a PR with conflicts or a failing check of its own', () => {
    expect(runFit(pr(1, { mergeable: false }), noEvidence)).toMatchObject({ reason: 'conflicts' });
    expect(
      runFit(pr(1, {}, { failedCheckNames: ['Build & Test API', E2E] }), {
        e2e: outside,
        outsideCause: null,
      }),
    ).toMatchObject({ kind: 'held', reason: 'failing', why: 'Build & Test API fails' });
  });

  it('merges a green or running PR the usual way', () => {
    expect(runFit(pr(1), noEvidence)).toEqual({ kind: 'ready', bypass: null });
  });

  it('merges past E2E failures the report clears, and waits while it is read', () => {
    const red = pr(1, {}, { failedCheckNames: [E2E], overallStatus: 'red' });
    expect(runFit(red, { e2e: outside, outsideCause: null })).toMatchObject({
      kind: 'ready',
      bypass: expect.stringContaining('none in specs this PR touches'),
    });
    expect(runFit(red, { e2e: undefined, outsideCause: null })).toEqual({ kind: 'checking' });
    expect(
      runFit(red, {
        e2e: { ...outside, verdict: { ...outsideVerdict, kind: 'introduced' } },
        outsideCause: null,
      }),
    ).toMatchObject({ kind: 'held', reason: 'e2e' });
  });

  it("holds a failing check the report doesn't cover, though its name says E2E", () => {
    const red = pr(1, {}, { failedCheckNames: [E2E, ADVISORY], overallStatus: 'red' });
    expect(runFit(red, { e2e: outside, outsideCause: null })).toEqual({
      kind: 'held',
      reason: 'failing',
      why: 'E2E reproducer advisory fails',
    });
    // While the report is read, an E2E-looking check might still be covered.
    expect(runFit(red, { e2e: undefined, outsideCause: null })).toEqual({ kind: 'checking' });
  });

  it('merges past related failures that also fail on the base branch', () => {
    const red = pr(1, {}, { failedCheckNames: ['Lint'], overallStatus: 'red' });
    expect(runFit(red, { e2e: null, outsideCause: 'base-branch' })).toEqual({
      kind: 'ready',
      bypass: "Not this PR's failure: also fails on main",
    });
  });
});

describe('planAuthorRun', () => {
  it('holds changes requested even when checks pass or failures are unrelated', () => {
    const blocked = pr(1, { reviewStatus: 'changesRequested' });
    expect(runFit(blocked, { e2e: null, outsideCause: 'base-branch' })).toEqual({
      kind: 'held',
      reason: 'changesRequested',
      why: 'Changes requested',
    });
    expect(
      planAuthorRun([blocked], (p) => runFit(p, { e2e: null, outsideCause: null })).queue,
    ).toEqual([]);
  });

  it('keeps the order and splits ready, held and still checking', () => {
    const plan = planAuthorRun([pr(1), pr(2, { mergeable: false }), pr(3)], (p) =>
      p.pullRequest.number === 3
        ? { kind: 'checking' }
        : runFit(p, { e2e: null, outsideCause: null }),
    );
    expect(plan.queue.map((p) => p.pullRequest.number)).toEqual([1]);
    expect(plan.held.map((h) => h.pr.pullRequest.number)).toEqual([2]);
    expect(plan.checking.map((p) => p.pullRequest.number)).toEqual([3]);
  });
});
