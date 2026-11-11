import { describe, expect, it } from 'vitest';
import { FIXTURE_ME, listPr } from '@/components/pr/__fixtures__/pr-list-data';
import type { ReviewStatus } from '@/types';
import { isFailing, isMyPr, isNeedsYou, isReady, isReviewing, isWaitingOnMe } from '../pr-grouping';

const ME = FIXTURE_ME;

describe('isMyPr', () => {
  it('compares the author with the signed-in user, ignoring case', () => {
    const pr = listPr({ number: 1, title: 'x', repo: 'a/b', author: 'Koen' });
    expect(isMyPr(pr, ME)).toBe(true);
    expect(isMyPr(pr, 'mira')).toBe(false);
  });

  it('is false without a signed-in user', () => {
    expect(isMyPr(listPr({ number: 1, title: 'x', repo: 'a/b', author: '' }), '')).toBe(false);
  });
});

describe('isFailing', () => {
  it('is true only for red checks', () => {
    expect(
      isFailing(listPr({ number: 1, title: 'x', repo: 'a/b', checks: { total: 2, fail: 1 } })),
    ).toBe(true);
    expect(
      isFailing(listPr({ number: 1, title: 'x', repo: 'a/b', checks: { total: 2, run: 1 } })),
    ).toBe(false);
    expect(isFailing(listPr({ number: 1, title: 'x', repo: 'a/b' }))).toBe(false);
  });
});

describe('isReady', () => {
  const approved = { number: 1, title: 'x', repo: 'a/b', reviewStatus: 'approved' as const };

  it('is true for an approved, green PR that can merge', () => {
    expect(isReady(listPr(approved))).toBe(true);
  });

  it('is true when GitHub has not worked out mergeability yet', () => {
    const pr = listPr(approved);
    pr.pullRequest.mergeable = undefined;
    expect(isReady(pr)).toBe(true);
  });

  it('is false for a draft, conflicts, running or red checks, or no approval', () => {
    expect(isReady(listPr({ ...approved, isDraft: true }))).toBe(false);
    expect(isReady(listPr({ ...approved, mergeable: false }))).toBe(false);
    expect(isReady(listPr({ ...approved, checks: { total: 2, run: 1 } }))).toBe(false);
    expect(isReady(listPr({ ...approved, checks: { total: 2, fail: 1 } }))).toBe(false);
    expect(isReady(listPr({ ...approved, reviewStatus: 'commented' }))).toBe(false);
  });

  it('is false when the checks could not be read', () => {
    expect(isReady({ ...listPr(approved), checksUnavailable: true })).toBe(false);
  });
});

describe('isReviewing', () => {
  it.each<[ReviewStatus, boolean]>([
    ['none', false],
    ['approved', false],
    ['pending', true],
    ['commented', true],
    ['changesRequested', true],
  ])('is %s → %s', (reviewStatus, expected) => {
    expect(isReviewing(listPr({ number: 1, title: 'x', repo: 'a/b', reviewStatus }))).toBe(
      expected,
    );
  });
});

describe('isWaitingOnMe', () => {
  const requested = {
    number: 1,
    title: 'x',
    repo: 'a/b',
    author: 'mira',
    requestedReviewers: ['Koen'],
  };

  it('is true while my review is requested, ignoring case', () => {
    expect(isWaitingOnMe(listPr(requested), ME)).toBe(true);
  });

  it('is false on my own PR and without a signed-in user', () => {
    expect(isWaitingOnMe(listPr({ ...requested, author: ME }), ME)).toBe(false);
    expect(isWaitingOnMe(listPr(requested), '')).toBe(false);
  });

  it('is false once I approved the head commit, true again after a new push', () => {
    const pr = listPr(requested);
    pr.pullRequest.latestReviews = [{ authorLogin: ME, state: 'approved', commitSha: 'sha1' }];
    expect(isWaitingOnMe(pr, ME)).toBe(false);
    pr.pullRequest.latestReviews = [{ authorLogin: ME, state: 'approved', commitSha: 'older' }];
    expect(isWaitingOnMe(pr, ME)).toBe(true);
    pr.pullRequest.latestReviews = [{ authorLogin: ME, state: 'approved' }];
    expect(isWaitingOnMe(pr, ME)).toBe(false);
  });

  it('counts a request to one of my teams', () => {
    const pr = listPr({ number: 1, title: 'x', repo: 'a/b', author: 'mira' });
    pr.pullRequest.requestedTeams = ['platform'];
    expect(isWaitingOnMe(pr, ME, ['platform'])).toBe(true);
    expect(isWaitingOnMe(pr, ME, ['design'])).toBe(false);
    expect(isWaitingOnMe(pr, ME)).toBe(false);
  });
});

describe('isNeedsYou', () => {
  it('is true for a review requested from me', () => {
    const pr = listPr({
      number: 1,
      title: 'x',
      repo: 'a/b',
      author: 'mira',
      requestedReviewers: [ME],
    });
    expect(isNeedsYou(pr, ME)).toBe(true);
  });

  it('is true for a review requested from one of my teams', () => {
    const pr = listPr({ number: 1, title: 'x', repo: 'a/b', author: 'mira' });
    pr.pullRequest.requestedTeams = ['platform'];
    expect(isNeedsYou(pr, ME, ['platform'])).toBe(true);
    expect(isNeedsYou(pr, ME, ['other'])).toBe(false);
  });

  it('is true for my failing PR and my PR with changes requested or comments', () => {
    const failing = listPr({ number: 1, title: 'x', repo: 'a/b', checks: { total: 4, fail: 1 } });
    const changes = listPr({
      number: 2,
      title: 'x',
      repo: 'a/b',
      reviewStatus: 'changesRequested',
    });
    const commented = listPr({ number: 3, title: 'x', repo: 'a/b', reviewStatus: 'commented' });
    expect(isNeedsYou(failing, ME)).toBe(true);
    expect(isNeedsYou(changes, ME)).toBe(true);
    expect(isNeedsYou(commented, ME)).toBe(true);
  });

  it("is false for my approved or waiting PR and for other people's PRs", () => {
    const approved = listPr({ number: 1, title: 'x', repo: 'a/b', reviewStatus: 'approved' });
    const waiting = listPr({ number: 2, title: 'x', repo: 'a/b', requestedReviewers: ['mira'] });
    const theirsFailing = listPr({
      number: 3,
      title: 'x',
      repo: 'a/b',
      author: 'mira',
      checks: { total: 4, fail: 2 },
    });
    expect(isNeedsYou(approved, ME)).toBe(false);
    expect(isNeedsYou(waiting, ME)).toBe(false);
    expect(isNeedsYou(theirsFailing, ME)).toBe(false);
  });

  it('is false without a signed-in user', () => {
    const pr = listPr({ number: 1, title: 'x', repo: 'a/b', checks: { total: 1, fail: 1 } });
    expect(isNeedsYou(pr, '')).toBe(false);
  });

  it('still counts a stale review request', () => {
    const pr = listPr({
      number: 1,
      title: 'x',
      repo: 'a/b',
      author: 'jules',
      requestedReviewers: [ME],
      updatedHoursAgo: 12 * 24,
    });
    expect(isNeedsYou(pr, ME)).toBe(true);
  });
});
