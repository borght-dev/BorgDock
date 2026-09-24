import { describe, expect, it } from 'vitest';
import { FIXTURE_ME, listPr, workbenchPrs } from '@/components/pr/__fixtures__/pr-list-data';
import { groupWorkbenchPrs, isNeedsYou, NEEDS_YOU_GROUP_KEY } from '../pr-grouping';

const ME = FIXTURE_ME;

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

describe('groupWorkbenchPrs', () => {
  const prs = workbenchPrs(Date.parse('2026-09-25T12:00:00Z'));

  it('pins "Needs you" first and leaves its rows out of the groups below', () => {
    const groups = groupWorkbenchPrs(prs, 'repo', ME);
    expect(groups[0]).toMatchObject({
      key: NEEDS_YOU_GROUP_KEY,
      label: 'Needs you',
      pinned: true,
    });
    const needsYou = groups[0]!.prs.map((p) => p.pullRequest.number).sort((a, b) => a - b);
    // Mine with changes or comments: 471, 86. Reviews requested from me: 479, 88, 3668, 458.
    expect(needsYou).toEqual([86, 88, 458, 471, 479, 3668]);
    const rest = groups.slice(1).flatMap((g) => g.prs.map((p) => p.pullRequest.number));
    expect(rest).toHaveLength(prs.length - needsYou.length);
    for (const n of needsYou) expect(rest).not.toContain(n);
  });

  it('groups the rest by repository', () => {
    const groups = groupWorkbenchPrs(prs, 'repo', ME);
    expect(groups.slice(1).map((g) => g.label)).toEqual([
      'borght-dev/BorgDock',
      'borght-dev/site',
      'Gomocha-FSP/fsp-horizon',
    ]);
  });

  it('does not pin when asked not to (any filter but All)', () => {
    const groups = groupWorkbenchPrs(prs, 'repo', ME, [], false);
    expect(groups.some((g) => g.key === NEEDS_YOU_GROUP_KEY)).toBe(false);
    expect(groups.flatMap((g) => g.prs)).toHaveLength(prs.length);
  });

  it('skips an empty "Needs you" group', () => {
    const groups = groupWorkbenchPrs(prs, 'repo', 'nobody');
    expect(groups.some((g) => g.key === NEEDS_YOU_GROUP_KEY)).toBe(false);
  });
});
