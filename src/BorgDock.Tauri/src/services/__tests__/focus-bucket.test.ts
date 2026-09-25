import { describe, expect, it } from 'vitest';
import {
  FIXTURE_ME,
  type ListPrSpec,
  listPr,
  workbenchPrs,
} from '@/components/pr/__fixtures__/pr-list-data';
import {
  bucketFor,
  countBuckets,
  type FocusBucket,
  type FocusBucketContext,
  focusKey,
  focusSetOf,
  isStaleFor,
  isStaleUpdate,
  mergedTodayKeys,
  staleAfterDaysOf,
  startOfTomorrow,
  whyFor,
} from '@/services/focus-bucket';
import { isNeedsYou } from '@/services/pr-grouping';
import type { PullRequestWithChecks, ReviewStatus } from '@/types';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function ctx(over: Partial<FocusBucketContext> = {}): FocusBucketContext {
  return { username: FIXTURE_ME, teams: [], now: NOW, staleAfterDays: 7, ...over };
}

function pr(spec: Partial<ListPrSpec> = {}): PullRequestWithChecks {
  return listPr({ number: 1, title: 'A change', repo: 'acme/app', ...spec }, NOW);
}

// ── the matrix: review state × check state × ownership × age ──────────────

type CheckState = 'green' | 'failing' | 'running';
type Owner = 'mine' | 'requested' | 'team' | 'other';

const CHECKS: Record<CheckState, ListPrSpec['checks']> = {
  green: { total: 10 },
  failing: { total: 10, fail: 2 },
  running: { total: 10, run: 3 },
};

function matrixPr(review: ReviewStatus, checks: CheckState, owner: Owner, days: number) {
  const base: Partial<ListPrSpec> = {
    reviewStatus: review,
    checks: CHECKS[checks],
    updatedHoursAgo: days * 24 + 1,
  };
  switch (owner) {
    case 'mine':
      return pr({ ...base, author: FIXTURE_ME });
    case 'requested':
      return pr({ ...base, author: 'mira', requestedReviewers: [FIXTURE_ME] });
    case 'team': {
      const p = pr({ ...base, author: 'mira' });
      p.pullRequest.requestedTeams = ['acme/web'];
      return p;
    }
    case 'other':
      return pr({ ...base, author: 'mira' });
  }
}

/** What the bucket must be, stated from the rules rather than the code. */
function expected(
  review: ReviewStatus,
  checks: CheckState,
  owner: Owner,
  days: number,
): FocusBucket {
  if (days >= 7) return 'stale';
  const waitingOnMe = owner === 'requested' || owner === 'team';
  const myAttention =
    owner === 'mine' &&
    (checks === 'failing' || review === 'changesRequested' || review === 'commented');
  if (waitingOnMe || myAttention) return 'you';
  if (review === 'approved' && checks === 'green') return 'ready';
  return 'wait';
}

const REVIEWS: ReviewStatus[] = ['none', 'pending', 'commented', 'approved', 'changesRequested'];
const CHECK_STATES: CheckState[] = ['green', 'failing', 'running'];
const OWNERS: Owner[] = ['mine', 'requested', 'team', 'other'];
const AGES = [0, 3, 7, 12];

describe('bucketFor', () => {
  const cases = REVIEWS.flatMap((review) =>
    CHECK_STATES.flatMap((checks) =>
      OWNERS.flatMap((owner) => AGES.map((days) => [review, checks, owner, days] as const)),
    ),
  );

  it.each(cases)('%s review, %s checks, %s PR, %i days old', (review, checks, owner, days) => {
    const p = matrixPr(review, checks, owner, days);
    expect(bucketFor(p, ctx({ teams: ['acme/web'] }))).toBe(expected(review, checks, owner, days));
  });

  it('agrees with the Pull requests list "Needs you" rule on every fresh PR', () => {
    for (const [review, checks, owner] of cases.filter(([, , , days]) => days < 7)) {
      const p = matrixPr(review, checks, owner, 0);
      const c = ctx({ teams: ['acme/web'] });
      expect(bucketFor(p, c) === 'you').toBe(isNeedsYou(p, FIXTURE_ME, c.teams));
    }
  });

  it('puts a draft or a conflicting approved PR in Waiting, not Ready', () => {
    expect(bucketFor(pr({ author: 'mira', reviewStatus: 'approved', isDraft: true }), ctx())).toBe(
      'wait',
    );
    expect(
      bucketFor(pr({ author: 'mira', reviewStatus: 'approved', mergeable: false }), ctx()),
    ).toBe('wait');
  });

  it('follows the stale threshold setting', () => {
    const p = pr({ author: 'mira', updatedHoursAgo: 4 * 24 });
    expect(bucketFor(p, ctx({ staleAfterDays: 7 }))).toBe('wait');
    expect(bucketFor(p, ctx({ staleAfterDays: 3 }))).toBe('stale');
    expect(isStaleFor(p, ctx({ staleAfterDays: 4 }))).toBe(true);
  });

  it('never calls a closed PR stale', () => {
    const merged = pr({ updatedHoursAgo: 30 * 24, mergedHoursAgo: 30 * 24 });
    expect(isStaleFor(merged, ctx())).toBe(false);
  });

  it('moves a snoozed review to Waiting until the snooze runs out', () => {
    const p = pr({ author: 'mira', requestedReviewers: [FIXTURE_ME] });
    const key = focusKey(p);
    expect(bucketFor(p, ctx({ snoozedUntil: { [key]: NOW + HOUR } }))).toBe('wait');
    expect(bucketFor(p, ctx({ snoozedUntil: { [key]: NOW - 1 } }))).toBe('you');
    expect(bucketFor(p, ctx({ snoozedUntil: { 'other/repo#1': NOW + HOUR } }))).toBe('you');
  });

  it('keeps a snoozed review in Waiting even when the PR is approved and green', () => {
    const p = pr({
      author: 'mira',
      requestedReviewers: [FIXTURE_ME],
      reviewStatus: 'approved',
      checks: { total: 10 },
    });
    expect(bucketFor(p, ctx())).toBe('you');
    expect(bucketFor(p, ctx({ snoozedUntil: { [focusKey(p)]: NOW + HOUR } }))).toBe('wait');
    expect(whyFor(p, ctx({ snoozedUntil: { [focusKey(p)]: NOW + HOUR } }))).toBe(
      'Snoozed until tomorrow.',
    );
  });

  it('never puts anything in Needs you without a signed-in user', () => {
    const p = pr({ author: 'mira', requestedReviewers: [FIXTURE_ME] });
    expect(bucketFor(p, ctx({ username: '' }))).toBe('wait');
  });
});

describe('whyFor', () => {
  it('says why a PR needs me', () => {
    expect(whyFor(pr({ checks: { total: 10, fail: 2 } }), ctx())).toBe(
      'Your PR, 2 checks failing.',
    );
    expect(whyFor(pr({ checks: { total: 10, fail: 1 } }), ctx())).toBe('Your PR, 1 check failing.');
    expect(whyFor(pr({ reviewStatus: 'changesRequested' }), ctx())).toBe(
      'Changes requested on your PR.',
    );
    expect(whyFor(pr({ reviewStatus: 'commented' }), ctx())).toBe('Comments on your PR to answer.');
  });

  it('names who asked for my review and when', () => {
    const p = pr({ author: 'mira', requestedReviewers: [FIXTURE_ME], updatedHoursAgo: 1 });
    expect(whyFor(p, ctx())).toBe('mira asked for your review 1 h ago.');
    const requestedAt = new Date(NOW - 5 * HOUR).toISOString();
    expect(whyFor(p, ctx({ reviewRequestedAt: () => requestedAt }))).toBe(
      'mira asked for your review 5 h ago.',
    );
    const team = pr({ author: 'mira', updatedHoursAgo: 26 });
    team.pullRequest.requestedTeams = ['acme/web'];
    expect(whyFor(team, ctx({ teams: ['acme/web'] }))).toBe(
      'mira asked the web team for a review yesterday.',
    );
  });

  it('says a ready PR is approved and green', () => {
    const p = pr({ author: 'mira', reviewStatus: 'approved', checks: { total: 80, skip: 4 } });
    expect(whyFor(p, ctx())).toBe('Approved and all 76 checks passed.');
  });

  it('says how long a stale PR has been quiet', () => {
    expect(whyFor(pr({ updatedHoursAgo: 12 * 24 + 3 }), ctx())).toBe('No update in 12 days.');
  });

  it('says who has the ball on a waiting PR', () => {
    expect(whyFor(pr({ author: 'renovate', isDraft: true }), ctx())).toBe(
      'Draft, renovate is still working on it.',
    );
    expect(whyFor(pr({ isDraft: true }), ctx())).toBe('Draft, you are still working on it.');
    expect(whyFor(pr({ author: 'jules', mergeable: false }), ctx())).toBe(
      "jules's PR has merge conflicts.",
    );
    expect(whyFor(pr({ author: 'jules', checks: { total: 12, run: 5 } }), ctx())).toBe(
      'Checks running, 7 of 12 done.',
    );
    expect(whyFor(pr({ author: 'mira', checks: { total: 80, fail: 1 } }), ctx())).toBe(
      "mira's PR, 1 check failing.",
    );
    expect(whyFor(pr({ requestedReviewers: ['mira'] }), ctx())).toBe('Your PR, waiting on mira.');
    expect(whyFor(pr({ requestedReviewers: ['mira', 'jules', 'sasha'] }), ctx())).toBe(
      'Your PR, waiting on mira and 2 others.',
    );
    expect(whyFor(pr(), ctx())).toBe('Your PR, waiting for a reviewer.');
    expect(whyFor(pr({ author: 'renovate' }), ctx())).toBe("renovate's PR, not assigned to you.");
  });

  it('says a snoozed review is snoozed', () => {
    const p = pr({ author: 'mira', requestedReviewers: [FIXTURE_ME] });
    expect(whyFor(p, ctx({ snoozedUntil: { [focusKey(p)]: NOW + HOUR } }))).toBe(
      'Snoozed until tomorrow.',
    );
  });

  it('explains every column of the 18-PR fixture', () => {
    const prs = workbenchPrs(NOW);
    const c = ctx();
    const byNumber = new Map(prs.map((p) => [p.pullRequest.number, p]));
    const why = (n: number) => whyFor(byNumber.get(n)!, c);
    expect(why(471)).toBe('Your PR, 2 checks failing.');
    expect(why(479)).toBe('mira asked for your review 5 h ago.');
    expect(why(86)).toBe('Comments on your PR to answer.');
    expect(why(482)).toBe('Approved and all 80 checks passed.');
    expect(why(478)).toBe('Your PR, waiting on mira.');
    expect(why(462)).toBe('No update in 9 days.');
  });
});

describe('countBuckets', () => {
  it('splits the 18-PR fixture into the four columns', () => {
    const counts = countBuckets(workbenchPrs(NOW), ctx());
    expect(counts).toEqual({ all: 18, you: 5, wait: 5, ready: 2, stale: 6 });
  });
});

describe('focusSetOf', () => {
  it('appends PRs that need me but scored nothing, once', () => {
    const scored = pr({ number: 1, author: 'mira', requestedReviewers: [FIXTURE_ME] });
    const unscored = pr({ number: 2, reviewStatus: 'commented' });
    const other = pr({ number: 3, author: 'mira' });
    const set = focusSetOf([scored], [scored, unscored, other], FIXTURE_ME);
    expect(set.map((p) => p.pullRequest.number)).toEqual([1, 2]);
  });
});

describe('dates', () => {
  it('snoozes until the next local midnight', () => {
    const until = new Date(startOfTomorrow(NOW));
    expect(until.getHours()).toBe(0);
    expect(until.getMinutes()).toBe(0);
    expect(until.getTime()).toBeGreaterThan(NOW);
    expect(until.getTime() - NOW).toBeLessThanOrEqual(24 * HOUR);
  });

  it('counts PRs merged since local midnight', () => {
    const midnight = new Date(NOW);
    midnight.setHours(0, 0, 0, 0);
    const hoursSinceMidnight = (NOW - midnight.getTime()) / HOUR;
    const today = pr({ number: 7, mergedHoursAgo: hoursSinceMidnight / 2 });
    const yesterday = pr({ number: 8, mergedHoursAgo: hoursSinceMidnight + 1 });
    const closed = pr({ number: 9, closedHoursAgo: 1 });
    const theirs = pr({ number: 10, author: 'mira', mergedHoursAgo: hoursSinceMidnight / 2 });
    expect(mergedTodayKeys([today, yesterday, closed, theirs], NOW, FIXTURE_ME)).toEqual([
      focusKey(today),
    ]);
  });

  it('falls back to 7 days for a missing or bad stale setting', () => {
    expect(staleAfterDaysOf(undefined)).toBe(7);
    expect(staleAfterDaysOf(0)).toBe(7);
    expect(staleAfterDaysOf(Number.NaN)).toBe(7);
    expect(staleAfterDaysOf(10)).toBe(10);
    expect(staleAfterDaysOf(500)).toBe(90);
  });

  it('shares one stale rule between the buckets and the rows', () => {
    const updatedAt = new Date(NOW - 7 * 24 * HOUR).toISOString();
    expect(isStaleUpdate({ open: true, updatedAt }, 7, NOW)).toBe(true);
    expect(isStaleUpdate({ open: true, updatedAt }, 8, NOW)).toBe(false);
    expect(isStaleUpdate({ open: false, updatedAt }, 7, NOW)).toBe(false);
    expect(isStaleUpdate({ open: true }, 7, NOW)).toBe(false);
  });
});
