import { describe, expect, it, vi } from 'vitest';
import {
  ageOf,
  factsOf,
  type NextStep,
  type PrFactsContext,
  type PrStatusBucket,
  pendingReviewers,
  type ReviewKey,
  type SizeBucket,
  sizeOf,
  splitTitle,
} from '../facts';
import {
  contextOf,
  DAY,
  factsFrom,
  HOUR,
  hoursAgo,
  ME,
  NOW,
  type PrSpec,
  prFrom,
  RED,
  RUNNING,
} from './helpers';

const SHARED_FAILURE: Partial<PrFactsContext> = {
  ciOf: () => ({ blocked: 3, outside: true }),
};

describe('factsOf', () => {
  it('names the PR by owner/repo#number and counts its changed lines', () => {
    const f = factsFrom({
      number: 42,
      repo: 'acme/shop',
      pullRequest: { additions: 7, deletions: 2 },
    });
    expect(f).toMatchObject({ key: 'acme/shop#42', mine: true, lines: 9, size: 'xs' });
  });

  it('reads the open and update times, and 0 for a time it cannot parse', () => {
    expect(
      factsFrom({ pullRequest: { createdAt: hoursAgo(3), updatedAt: hoursAgo(1) } }),
    ).toMatchObject({ createdAt: NOW - 3 * HOUR, updatedAt: NOW - HOUR });
    expect(factsFrom({ pullRequest: { createdAt: 'not a date', updatedAt: '' } })).toMatchObject({
      createdAt: 0,
      updatedAt: 0,
    });
  });

  describe('status bucket', () => {
    it.each<[string, PrSpec, PrStatusBucket]>([
      [
        'my draft with red checks and requested changes',
        { isDraft: true, checks: RED, reviewStatus: 'changesRequested' },
        'draft',
      ],
      [
        'an approved, green PR still waiting on my review',
        { author: 'mira', reviewStatus: 'approved', requestedReviewers: [ME] },
        'yourTurn',
      ],
      ['my PR with requested changes', { reviewStatus: 'changesRequested' }, 'yourTurn'],
      ['an approved, green PR', { author: 'mira', reviewStatus: 'approved' }, 'ready'],
      ["someone else's red PR", { author: 'mira', checks: RED }, 'failing'],
      ['a green PR without an approval', { author: 'mira' }, 'waiting'],
      [
        'an approved PR whose checks still run',
        { author: 'mira', reviewStatus: 'approved', checks: RUNNING },
        'waiting',
      ],
    ])('puts %s in %s', (_, spec, bucket) => {
      expect(factsFrom(spec).bucket).toBe(bucket);
    });

    it('ranks your turn above ready: a ready PR that waits on my review is mine to act on', () => {
      const f = factsFrom({ author: 'mira', reviewStatus: 'approved', requestedReviewers: [ME] });
      expect(f).toMatchObject({ ready: true, waitingOnMe: true, bucket: 'yourTurn' });
    });
  });

  describe('your turn', () => {
    it.each<[string, PrSpec]>([
      ['a review requested from me', { author: 'mira', requestedReviewers: [ME] }],
      ['my PR with red checks', { checks: RED }],
      ['my PR with conflicts', { mergeable: false }],
      ['my PR with requested changes', { reviewStatus: 'changesRequested' }],
      ['my PR with comments', { reviewStatus: 'commented' }],
    ])('is %s', (_, spec) => {
      expect(factsFrom(spec).yourTurn).toBe(true);
    });

    it('is a review requested from one of my teams', () => {
      const spec: PrSpec = { author: 'mira', pullRequest: { requestedTeams: ['platform'] } };
      expect(factsFrom(spec, { teams: ['platform'] })).toMatchObject({
        waitingOnMe: true,
        yourTurn: true,
      });
      expect(factsFrom(spec, { teams: ['design'] }).yourTurn).toBe(false);
    });

    it.each<[string, PrSpec]>([
      ['my approved, green PR', { reviewStatus: 'approved' }],
      ['my PR waiting on reviewers', { requestedReviewers: ['mira'] }],
      ['my draft with red checks', { isDraft: true, checks: RED }],
      ['my draft with comments', { isDraft: true, reviewStatus: 'commented' }],
      ["someone else's red PR", { author: 'mira', checks: RED }],
      [
        "someone else's PR with requested changes",
        { author: 'mira', reviewStatus: 'changesRequested' },
      ],
    ])('is not %s', (_, spec) => {
      expect(factsFrom(spec).yourTurn).toBe(false);
    });

    it("is never a draft, not even someone else's draft that asks for my review", () => {
      const f = factsFrom({ author: 'mira', isDraft: true, requestedReviewers: [ME] });
      expect(f).toMatchObject({ waitingOnMe: true, yourTurn: false, bucket: 'draft' });
    });

    it('is not my red PR when every failure is shared and not its doing', () => {
      const f = factsFrom({ checks: RED }, SHARED_FAILURE);
      expect(f).toMatchObject({
        failing: true,
        yourTurn: false,
        bucket: 'failing',
        ci: { blocked: 3, outside: true },
      });
      expect(f.next).toEqual({ label: 'Blocked by shared CI', waitingOn: 'ci', tone: 'block' });
    });

    it('is my red PR when a shared failure is still partly its own', () => {
      const f = factsFrom({ checks: RED }, { ciOf: () => ({ blocked: 2, outside: false }) });
      expect(f).toMatchObject({ yourTurn: true, bucket: 'yourTurn' });
      expect(f.next.label).toBe('Fix checks');
    });

    it('is my PR with comments even when its only failure is shared', () => {
      expect(factsFrom({ checks: RED, reviewStatus: 'commented' }, SHARED_FAILURE).yourTurn).toBe(
        true,
      );
    });
  });

  it('asks the CI failure store only about red PRs', () => {
    const ciOf = vi.fn(() => ({ blocked: 2, outside: false }));
    expect(factsFrom({ checks: RUNNING }, { ciOf }).ci).toBeNull();
    expect(ciOf).not.toHaveBeenCalled();

    const pr = prFrom({ checks: RED });
    expect(factsOf(pr, contextOf({ ciOf })).ci).toEqual({ blocked: 2, outside: false });
    expect(ciOf).toHaveBeenCalledWith(pr);
  });

  it('counts running checks only while none failed', () => {
    expect(factsFrom({ checks: { total: 6, fail: 1, run: 2 } })).toMatchObject({
      failing: true,
      running: false,
    });
    expect(factsFrom({ checks: RUNNING })).toMatchObject({ failing: false, running: true });
    expect(factsFrom({ checks: { total: 6 } })).toMatchObject({ failing: false, running: false });
  });

  it('has conflicts only when GitHub says the PR cannot merge', () => {
    expect(factsFrom({ mergeable: false }).conflicts).toBe(true);
    expect(factsFrom({ pullRequest: { mergeable: undefined } }).conflicts).toBe(false);
  });

  it.each<[ReviewKey, PrSpec]>([
    ['awaitingYou', { author: 'mira', reviewStatus: 'changesRequested', requestedReviewers: [ME] }],
    [
      'changes',
      { author: 'mira', reviewStatus: 'changesRequested', requestedReviewers: ['jules'] },
    ],
    ['commented', { author: 'mira', reviewStatus: 'commented' }],
    ['approved', { author: 'mira', reviewStatus: 'approved', requestedReviewers: ['jules'] }],
    ['awaitingOthers', { author: 'mira', reviewStatus: 'pending', requestedReviewers: ['jules'] }],
    ['awaitingOthers', { author: 'mira', pullRequest: { requestedTeams: ['platform'] } }],
    ['none', { author: 'mira', reviewStatus: 'pending' }],
  ])('reads the review as %s', (review, spec) => {
    expect(factsFrom(spec).review).toBe(review);
  });

  it('is stale once the last update is staleAfterDays old', () => {
    expect(factsFrom({ updatedHoursAgo: 7 * 24 }).stale).toBe(true);
    expect(factsFrom({ updatedHoursAgo: 7 * 24 - 1 }).stale).toBe(false);
    expect(factsFrom({ updatedHoursAgo: 3 * 24 }, { staleAfterDays: 3 }).stale).toBe(true);
  });

  it('buckets the age by when the PR was opened', () => {
    expect(factsFrom({ pullRequest: { createdAt: hoursAgo(23) } }).age).toBe('today');
    expect(factsFrom({ pullRequest: { createdAt: hoursAgo(3 * 24) } }).age).toBe('week');
    expect(factsFrom({ pullRequest: { createdAt: hoursAgo(20 * 24) } }).age).toBe('month');
    expect(factsFrom({ pullRequest: { createdAt: hoursAgo(40 * 24) } }).age).toBe('older');
  });

  it('collects the AB# work items of the title, branch and description once each', () => {
    const f = factsFrom({
      title: 'AB#12 Keep the scroll position',
      pullRequest: { headRef: 'fix/AB#34-scroll', body: 'Fixes AB#12 and ab#56.' },
    });
    expect(f.workItems).toEqual([12, 34, 56]);
  });
});

describe('next step', () => {
  it.each<[string, PrSpec, Partial<PrFactsContext>, NextStep]>([
    [
      'my draft, before conflicts and red checks',
      { isDraft: true, mergeable: false, checks: RED },
      {},
      { label: 'Finish the draft', waitingOn: 'you', tone: 'you' },
    ],
    [
      "someone else's draft, before my review",
      { author: 'mira', isDraft: true, requestedReviewers: [ME] },
      {},
      { label: 'Draft · mira', waitingOn: 'author', tone: 'them' },
    ],
    [
      'my conflicts, before red checks',
      { mergeable: false, checks: RED },
      {},
      { label: 'Resolve conflicts', waitingOn: 'you', tone: 'you' },
    ],
    [
      "my review, before someone else's conflicts",
      { author: 'mira', mergeable: false, requestedReviewers: [ME] },
      {},
      { label: 'Your review', waitingOn: 'you', tone: 'you' },
    ],
    [
      "someone else's conflicts, when my review is not asked",
      { author: 'mira', mergeable: false },
      {},
      { label: 'Conflicts · mira', waitingOn: 'author', tone: 'block' },
    ],
    [
      'my review, before red checks',
      { author: 'mira', requestedReviewers: [ME], checks: RED },
      {},
      { label: 'Your review', waitingOn: 'you', tone: 'you' },
    ],
    [
      'my red checks, before requested changes',
      { checks: RED, reviewStatus: 'changesRequested' },
      {},
      { label: 'Fix checks', waitingOn: 'you', tone: 'you' },
    ],
    [
      "someone else's red checks",
      { author: 'mira', checks: RED, reviewStatus: 'changesRequested' },
      {},
      { label: 'Fix checks · mira', waitingOn: 'author', tone: 'block' },
    ],
    [
      'requested changes on my PR, before running checks',
      { reviewStatus: 'changesRequested', checks: RUNNING },
      {},
      { label: 'Address changes', waitingOn: 'you', tone: 'you' },
    ],
    [
      "requested changes on someone else's PR",
      { author: 'mira', reviewStatus: 'changesRequested' },
      {},
      { label: 'Address changes · mira', waitingOn: 'author', tone: 'them' },
    ],
    [
      'comments on my PR, before a shared failure',
      { reviewStatus: 'commented', checks: RED },
      SHARED_FAILURE,
      { label: 'Reply to comments', waitingOn: 'you', tone: 'you' },
    ],
    [
      'a shared failure that is not the PR’s doing',
      { author: 'mira', reviewStatus: 'approved', checks: RED },
      SHARED_FAILURE,
      { label: 'Blocked by shared CI', waitingOn: 'ci', tone: 'block' },
    ],
    [
      'checks still running',
      { author: 'mira', reviewStatus: 'approved', checks: RUNNING },
      {},
      { label: 'Checks running', waitingOn: 'ci', tone: 'wait' },
    ],
    [
      'my PR ready to merge',
      { reviewStatus: 'approved' },
      {},
      { label: 'Merge', waitingOn: 'you', tone: 'go' },
    ],
    [
      "someone else's PR ready to merge",
      { author: 'mira', reviewStatus: 'approved' },
      {},
      { label: 'Merge · mira', waitingOn: 'author', tone: 'go' },
    ],
    [
      'pending reviewers other than me, people then teams',
      {
        author: 'jules',
        reviewStatus: 'pending',
        requestedReviewers: ['mira', 'Koen'],
        pullRequest: {
          requestedTeams: ['platform'],
          latestReviews: [{ authorLogin: ME, state: 'approved', commitSha: 'sha1' }],
        },
      },
      {},
      { label: 'Review · mira, @platform', waitingOn: 'reviewers', tone: 'them' },
    ],
    [
      'an approval without checks to read',
      { author: 'mira', reviewStatus: 'approved', checks: { total: 0 } },
      {},
      { label: 'Checks unknown', waitingOn: 'ci', tone: 'wait' },
    ],
    [
      "comments on someone else's PR",
      { author: 'mira', reviewStatus: 'commented' },
      {},
      { label: 'Reply · mira', waitingOn: 'author', tone: 'them' },
    ],
    [
      'my PR without reviewers',
      {},
      {},
      { label: 'Request a review', waitingOn: 'you', tone: 'you' },
    ],
    [
      "someone else's PR without reviewers",
      { author: 'mira' },
      {},
      { label: 'Needs a reviewer', waitingOn: 'reviewers', tone: 'them' },
    ],
  ])('is %s', (_, spec, ctx, next) => {
    expect(factsFrom(spec, ctx).next).toEqual(next);
  });
});

describe('pendingReviewers', () => {
  it('lists people first, then teams with an @', () => {
    const pr = prFrom({
      requestedReviewers: ['mira', 'jules'],
      pullRequest: { requestedTeams: ['platform'] },
    });
    expect(pendingReviewers(pr)).toEqual(['mira', 'jules', '@platform']);
    expect(pendingReviewers(prFrom())).toEqual([]);
  });
});

describe('sizeOf', () => {
  it.each<[number, SizeBucket]>([
    [0, 'xs'],
    [9, 'xs'],
    [10, 's'],
    [99, 's'],
    [100, 'm'],
    [499, 'm'],
    [500, 'l'],
    [999, 'l'],
    [1000, 'xl'],
    [25_000, 'xl'],
  ])('puts %i lines in %s', (lines, size) => {
    expect(sizeOf(lines)).toBe(size);
  });
});

describe('ageOf', () => {
  it.each([
    [0, 'today'],
    [DAY - 1, 'today'],
    [DAY, 'week'],
    [7 * DAY - 1, 'week'],
    [7 * DAY, 'month'],
    [30 * DAY - 1, 'month'],
    [30 * DAY, 'older'],
  ])('puts a PR opened %i ms ago in %s', (age, bucket) => {
    expect(ageOf(NOW - age, NOW)).toBe(bucket);
  });
});

describe('splitTitle', () => {
  it.each([
    [
      'fix(grids): virtualize the results',
      { scope: 'fix(grids):', subject: 'virtualize the results', workItems: [] },
    ],
    ['feat!: drop the old API', { scope: 'feat!:', subject: 'drop the old API', workItems: [] }],
    [
      'fix(grid): AB#123 keep the scroll position',
      { scope: 'fix(grid):', subject: 'keep the scroll position', workItems: [123] },
    ],
    ['AB#12345: Fix the grid', { scope: '', subject: 'Fix the grid', workItems: [12345] }],
    [
      'Keep the scroll position (AB#77)',
      { scope: '', subject: 'Keep the scroll position', workItems: [77] },
    ],
    ['Order list AB#1 and ab#2', { scope: '', subject: 'Order list and', workItems: [1, 2] }],
    ['AB#5 AB#6', { scope: '', subject: 'AB#5 AB#6', workItems: [5, 6] }],
    ['fix: AB#9', { scope: '', subject: 'fix:', workItems: [9] }],
    ['Keep the scroll position', { scope: '', subject: 'Keep the scroll position', workItems: [] }],
  ])('splits %j', (title, parts) => {
    expect(splitTitle(title)).toEqual(parts);
  });
});
