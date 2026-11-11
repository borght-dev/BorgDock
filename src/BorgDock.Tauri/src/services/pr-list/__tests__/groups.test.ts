import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY, type PrDisplay, type PrGroupBy } from '../display';
import {
  AGE_LABEL,
  AGE_ORDER,
  type PrFacts,
  REVIEW_LABEL,
  REVIEW_ORDER,
  SIZE_GROUP_LABEL,
  SIZE_ORDER,
  STATUS_BUCKET_HINT,
  STATUS_BUCKET_LABEL,
  STATUS_BUCKET_ORDER,
  WAITING_LABEL,
  WAITING_ORDER,
} from '../facts';
import {
  buildGroups,
  groupFacts,
  isGroupCollapsed,
  type PrGroupNode,
  pinsYourTurn,
  sortFacts,
  summarize,
  visibleFacts,
  YOUR_TURN_GROUP_KEY,
} from '../groups';
import { factsFrom, hoursAgo, ME, numbers, RED, RUNNING } from './helpers';

const ONE_LEVEL = { showEmpty: false };

function keys(groups: readonly PrGroupNode[]): string[] {
  return groups.map((g) => g.key);
}

describe('summarize', () => {
  it('counts the buckets and adds up the changed lines', () => {
    const stats = summarize([
      factsFrom({ number: 1, checks: RED, pullRequest: { additions: 10, deletions: 1 } }),
      factsFrom({
        number: 2,
        author: 'mira',
        checks: RED,
        pullRequest: { additions: 5, deletions: 2 },
      }),
      factsFrom({ number: 3, isDraft: true, pullRequest: { additions: 1, deletions: 0 } }),
    ]);
    expect(stats).toEqual({
      yourTurn: 1,
      failing: 1,
      waiting: 0,
      ready: 0,
      draft: 1,
      additions: 16,
      deletions: 3,
    });
  });
});

describe('groupFacts', () => {
  describe('fixed groupings', () => {
    const facts = [
      factsFrom({ number: 1, author: 'mira', isDraft: true }),
      factsFrom({ number: 2, author: 'mira' }),
      factsFrom({ number: 3, author: 'mira', reviewStatus: 'approved' }),
      factsFrom({ number: 4, author: 'mira', requestedReviewers: [ME] }),
    ];

    it('keep their own order and only the groups with PRs', () => {
      const groups = groupFacts(facts, 'status', ONE_LEVEL);
      expect(keys(groups)).toEqual([
        'status:yourTurn',
        'status:waiting',
        'status:ready',
        'status:draft',
      ]);
      expect(groups.map((g) => numbers(g.facts))).toEqual([[4], [2], [3], [1]]);
    });

    it('label status groups and give them their bucket and hint', () => {
      const [first] = groupFacts(facts, 'status', ONE_LEVEL);
      expect(first).toMatchObject({
        kind: 'status',
        label: STATUS_BUCKET_LABEL.yourTurn,
        bucket: 'yourTurn',
        hint: STATUS_BUCKET_HINT.yourTurn,
        subgroups: [],
      });
    });

    it.each<[PrGroupBy, readonly string[], Record<string, string>]>([
      ['status', STATUS_BUCKET_ORDER, STATUS_BUCKET_LABEL],
      ['review', REVIEW_ORDER, REVIEW_LABEL],
      ['waiting', WAITING_ORDER, WAITING_LABEL],
      ['age', AGE_ORDER, AGE_LABEL],
      ['size', SIZE_ORDER, SIZE_GROUP_LABEL],
    ])('%s keeps every group, empty ones too, with showEmpty', (by, order, labels) => {
      const groups = groupFacts([], by, { showEmpty: true });
      expect(keys(groups)).toEqual(order.map((value) => `${by}:${value}`));
      expect(groups.map((g) => g.label)).toEqual(order.map((value) => labels[value]));
      expect(groups.every((g) => g.facts.length === 0)).toBe(true);
      expect(groupFacts([], by, ONE_LEVEL)).toEqual([]);
    });
  });

  it('orders authors: me first, then most PRs, then login', () => {
    const facts = [
      factsFrom({ number: 1, author: 'Sasha' }),
      factsFrom({ number: 2, author: 'mira' }),
      factsFrom({ number: 3, author: 'jules' }),
      factsFrom({ number: 4, author: 'mira' }),
      factsFrom({ number: 5, author: ME }),
      factsFrom({ number: 6, author: 'jules' }),
    ];
    const groups = groupFacts(facts, 'author', ONE_LEVEL);
    expect(keys(groups)).toEqual(['author:koen', 'author:jules', 'author:mira', 'author:sasha']);
    expect(groups.map((g) => g.label)).toEqual(['koen', 'jules', 'mira', 'Sasha']);
    expect(groups[0]!.author).toEqual({ login: ME, isMe: true });
    expect(groups[3]!.author).toEqual({ login: 'Sasha', isMe: false });
  });

  it('orders repositories: those with my PRs first, then by name, not by size', () => {
    const facts = [
      factsFrom({ number: 1, repo: 'acme/web', author: 'mira' }),
      factsFrom({ number: 2, repo: 'acme/web', author: 'mira' }),
      factsFrom({ number: 3, repo: 'acme/web', author: 'mira' }),
      factsFrom({ number: 4, repo: 'acme/shop', author: 'mira' }),
      factsFrom({ number: 5, repo: 'acme/shop', author: ME }),
      factsFrom({ number: 6, repo: 'acme/billing', author: 'mira' }),
      factsFrom({ number: 7, repo: 'acme/api', author: ME }),
    ];
    const groups = groupFacts(facts, 'repo', ONE_LEVEL);
    expect(groups.map((g) => g.label)).toEqual([
      'acme/api',
      'acme/shop',
      'acme/billing',
      'acme/web',
    ]);
    expect(groups[1]!.key).toBe('repo:acme/shop');
  });

  it('orders labels by most PRs, puts a PR under its first label and "No label" last', () => {
    const facts = [
      factsFrom({ number: 1, labels: ['ui', 'bug'] }),
      factsFrom({ number: 2, labels: ['ui'] }),
      factsFrom({ number: 3, labels: ['ui'] }),
      factsFrom({ number: 4 }),
      factsFrom({ number: 5 }),
      factsFrom({ number: 6 }),
      factsFrom({ number: 7, labels: ['Zeta', 'alpha'] }),
      factsFrom({ number: 8, labels: ['zeta'] }),
    ];
    const groups = groupFacts(facts, 'label', ONE_LEVEL);
    expect(groups.map((g) => [g.label, numbers(g.facts)])).toEqual([
      ['ui', [2, 3]],
      ['alpha', [7]],
      ['bug', [1]],
      ['zeta', [8]],
      ['No label', [4, 5, 6]],
    ]);
    expect(groups[4]!.key).toBe('label:');
  });

  it('groups by the lowest AB# work item, "No work item" last', () => {
    const facts = [
      factsFrom({ number: 1, title: 'AB#200 Grid' }),
      factsFrom({ number: 2, title: 'AB#300 and AB#100' }),
      factsFrom({ number: 3, title: 'AB#100 Scroll' }),
      factsFrom({ number: 4, title: 'Docs' }),
      factsFrom({ number: 5, title: 'Typos' }),
      factsFrom({ number: 6, title: 'Lint' }),
    ];
    const groups = groupFacts(facts, 'workItem', ONE_LEVEL);
    expect(groups.map((g) => [g.key, g.label, numbers(g.facts)])).toEqual([
      ['workItem:100', 'AB#100', [2, 3]],
      ['workItem:200', 'AB#200', [1]],
      ['workItem:', 'No work item', [4, 5, 6]],
    ]);
  });

  it('groups by base branch, an unknown base last', () => {
    const facts = [
      factsFrom({ number: 1, pullRequest: { baseRef: '' } }),
      factsFrom({ number: 2, pullRequest: { baseRef: '' } }),
      factsFrom({ number: 3 }),
      factsFrom({ number: 4, pullRequest: { baseRef: 'release' } }),
    ];
    expect(groupFacts(facts, 'base', ONE_LEVEL).map((g) => g.label)).toEqual([
      'main',
      'release',
      'Unknown base',
    ]);
  });

  it('puts everything in one group without a grouping', () => {
    const facts = [factsFrom({ number: 1 }), factsFrom({ number: 2, author: 'mira' })];
    const groups = groupFacts(facts, 'none', ONE_LEVEL);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'none:all', label: 'All pull requests' });
    expect(numbers(groups[0]!.facts)).toEqual([1, 2]);
  });

  it('keeps the order of the PRs inside each group', () => {
    const facts = [
      factsFrom({ number: 9, author: 'mira' }),
      factsFrom({ number: 2, author: 'mira' }),
      factsFrom({ number: 5, author: 'mira' }),
    ];
    expect(numbers(groupFacts(facts, 'repo', ONE_LEVEL)[0]!.facts)).toEqual([9, 2, 5]);
  });

  it('marks a group quiet when nothing in it is your turn', () => {
    const groups = groupFacts(
      [
        factsFrom({ number: 1, repo: 'acme/shop', checks: RED }),
        factsFrom({ number: 2, repo: 'acme/web', author: 'mira' }),
      ],
      'repo',
      ONE_LEVEL,
    );
    expect(groups.map((g) => [g.key, g.quiet])).toEqual([
      ['repo:acme/shop', false],
      ['repo:acme/web', true],
    ]);
  });

  it('prefixes the keys with the parent key', () => {
    const groups = groupFacts([factsFrom({ author: 'mira' })], 'status', {
      showEmpty: false,
      parentKey: 'repo:acme/shop',
    });
    expect(keys(groups)).toEqual(['repo:acme/shop/status:waiting']);
  });
});

describe('pinsYourTurn', () => {
  it.each<[Partial<PrDisplay>, boolean]>([
    [{ groupBy: 'repo' }, true],
    [{ groupBy: 'review' }, true],
    [{ groupBy: 'waiting' }, true],
    [{ groupBy: 'workItem' }, true],
    [{ groupBy: 'label' }, true],
    [{ groupBy: 'base' }, true],
    [{ groupBy: 'age' }, true],
    [{ groupBy: 'size' }, true],
    [{ groupBy: 'status' }, false],
    [{ groupBy: 'author' }, false],
    [{ groupBy: 'none' }, false],
    [{ groupBy: 'repo', pinYourTurn: false }, false],
    [{ groupBy: 'repo', layout: 'board' }, false],
    [{ groupBy: 'repo', layout: 'list' }, true],
  ])('is %j → %s', (change, expected) => {
    expect(pinsYourTurn({ ...DEFAULT_DISPLAY, ...change })).toBe(expected);
  });
});

describe('buildGroups', () => {
  const requestedFromMe = factsFrom({
    number: 1,
    repo: 'acme/web',
    author: 'mira',
    requestedReviewers: [ME],
  });
  const myChanges = factsFrom({ number: 2, repo: 'acme/shop', reviewStatus: 'changesRequested' });
  const waiting = factsFrom({ number: 3, repo: 'acme/web', author: 'mira' });
  const ready = factsFrom({
    number: 4,
    repo: 'acme/shop',
    author: 'mira',
    reviewStatus: 'approved',
  });
  const failing = factsFrom({ number: 5, repo: 'acme/api', author: 'jules', checks: RED });
  const facts = [requestedFromMe, myChanges, waiting, ready, failing];
  const byRepo: PrDisplay = { ...DEFAULT_DISPLAY, groupBy: 'repo' };
  const WITH_SUBGROUPS = { pin: true, subGroups: true };

  it('pins a "Your turn" group first and leaves its PRs out of the groups below', () => {
    const groups = buildGroups(facts, byRepo, { pin: true, subGroups: false });
    expect(groups[0]).toMatchObject({
      key: YOUR_TURN_GROUP_KEY,
      kind: 'repo',
      label: 'Your turn',
      pinned: true,
      hint: STATUS_BUCKET_HINT.yourTurn,
      quiet: false,
      stats: { yourTurn: 2 },
    });
    expect(numbers(groups[0]!.facts)).toEqual([1, 2]);
    expect(groups.slice(1).map((g) => [g.key, numbers(g.facts)])).toEqual([
      ['repo:acme/api', [5]],
      ['repo:acme/shop', [4]],
      ['repo:acme/web', [3]],
    ]);
  });

  it('pins nothing when nothing is your turn', () => {
    const groups = buildGroups([waiting, ready, failing], byRepo, { pin: true, subGroups: false });
    expect(keys(groups)).not.toContain(YOUR_TURN_GROUP_KEY);
    expect(groups.flatMap((g) => numbers(g.facts)).sort()).toEqual([3, 4, 5]);
  });

  it('keeps every PR in its own group when not pinning', () => {
    const groups = buildGroups(facts, byRepo, { pin: false, subGroups: false });
    expect(groups.map((g) => [g.key, numbers(g.facts)])).toEqual([
      ['repo:acme/shop', [2, 4]],
      ['repo:acme/api', [5]],
      ['repo:acme/web', [1, 3]],
    ]);
  });

  it('keeps the empty groups of a fixed grouping when the display asks for them', () => {
    const display: PrDisplay = { ...DEFAULT_DISPLAY, groupBy: 'size', showEmptyGroups: true };
    expect(buildGroups(facts, display, { pin: false, subGroups: false })).toHaveLength(5);
    expect(
      buildGroups(facts, { ...display, showEmptyGroups: false }, { pin: false, subGroups: false }),
    ).toHaveLength(1);
  });

  it('nests sub-groups under every group, keyed by the parent key', () => {
    const groups = buildGroups(facts, { ...byRepo, subGroupBy: 'status' }, WITH_SUBGROUPS);
    expect(groups.map((g) => keys(g.subgroups))).toEqual([
      [`${YOUR_TURN_GROUP_KEY}/status:yourTurn`],
      ['repo:acme/api/status:failing'],
      ['repo:acme/shop/status:ready'],
      ['repo:acme/web/status:waiting'],
    ]);
  });

  it('never shows empty sub-groups', () => {
    const display: PrDisplay = {
      ...DEFAULT_DISPLAY,
      groupBy: 'repo',
      subGroupBy: 'status',
      showEmptyGroups: true,
    };
    const groups = buildGroups(facts, display, { pin: false, subGroups: true });
    expect(groups.find((g) => g.key === 'repo:acme/shop')!.subgroups.map((s) => s.label)).toEqual([
      STATUS_BUCKET_LABEL.yourTurn,
      STATUS_BUCKET_LABEL.ready,
    ]);
  });

  it.each<[string, Partial<PrDisplay>, boolean]>([
    ['the board', { subGroupBy: 'status' }, false],
    ['no sub-grouping', { subGroupBy: 'none' }, true],
    ['a sub-grouping equal to the grouping', { subGroupBy: 'repo' }, true],
  ])('has no sub-groups for %s', (_, change, subGroups) => {
    const groups = buildGroups(facts, { ...byRepo, ...change }, { pin: true, subGroups });
    expect(groups.every((g) => g.subgroups.length === 0)).toBe(true);
  });
});

describe('isGroupCollapsed', () => {
  const quiet = { key: 'repo:acme/web', quiet: true };
  const busy = { key: 'repo:acme/shop', quiet: false };
  const none = new Set<string>();

  it('folds a group the user folded, quiet or not', () => {
    expect(isGroupCollapsed(busy, new Set([busy.key]), none, false)).toBe(true);
    expect(isGroupCollapsed(quiet, new Set([quiet.key]), new Set([quiet.key]), true)).toBe(true);
  });

  it('folds a quiet group under "collapse quiet groups" until it is opened', () => {
    expect(isGroupCollapsed(quiet, none, none, true)).toBe(true);
    expect(isGroupCollapsed(quiet, none, new Set([quiet.key]), true)).toBe(false);
  });

  it('leaves quiet groups open without "collapse quiet groups", and busy groups always', () => {
    expect(isGroupCollapsed(quiet, none, none, false)).toBe(false);
    expect(isGroupCollapsed(busy, none, none, true)).toBe(false);
  });
});

describe('visibleFacts', () => {
  const facts = [
    factsFrom({ number: 1, repo: 'acme/shop', author: 'mira', reviewStatus: 'approved' }),
    factsFrom({ number: 2, repo: 'acme/shop', author: 'mira' }),
    factsFrom({ number: 3, repo: 'acme/shop', author: 'mira', checks: RUNNING }),
    factsFrom({ number: 4, repo: 'acme/web', author: 'mira' }),
  ];
  const byRepo: PrDisplay = { ...DEFAULT_DISPLAY, groupBy: 'repo', subGroupBy: 'status' };

  it('walks every PR in screen order when nothing is folded', () => {
    const groups = buildGroups(facts, byRepo, { pin: false, subGroups: true });
    expect(numbers(visibleFacts(groups, () => false))).toEqual([2, 3, 1, 4]);
  });

  it('skips folded groups and folded sub-groups', () => {
    const groups = buildGroups(facts, byRepo, { pin: false, subGroups: true });
    const folded = new Set(['repo:acme/shop/status:waiting', 'repo:acme/web']);
    expect(numbers(visibleFacts(groups, (g) => folded.has(g.key)))).toEqual([1]);
  });

  it('walks the PRs of a group without sub-groups', () => {
    const groups = buildGroups(
      facts,
      { ...byRepo, subGroupBy: 'none' },
      {
        pin: false,
        subGroups: true,
      },
    );
    expect(numbers(visibleFacts(groups, (g) => g.key === 'repo:acme/web'))).toEqual([1, 2, 3]);
  });
});

describe('sortFacts', () => {
  const yourTurn = factsFrom({ number: 10, author: 'mira', requestedReviewers: [ME] });
  const ready = factsFrom({ number: 11, author: 'mira', reviewStatus: 'approved' });
  const failing = factsFrom({ number: 12, author: 'mira', checks: RED });
  const waiting = factsFrom({ number: 13, author: 'mira' });
  const draft = factsFrom({ number: 14, author: 'mira', isDraft: true });

  it('puts your turn first, then ready, failing, waiting and drafts under Priority', () => {
    const shuffled = [draft, waiting, failing, ready, yourTurn];
    expect(numbers(sortFacts(shuffled, 'priority', 'desc'))).toEqual([10, 11, 12, 13, 14]);
    expect(numbers(sortFacts(shuffled, 'priority', 'asc'))).toEqual([14, 13, 12, 11, 10]);
  });

  it('breaks ties inside a bucket by focus score, which never lifts a PR out of its bucket', () => {
    const calm = factsFrom({ number: 20, author: 'mira' });
    const urgent = factsFrom({ number: 21, author: 'mira' });
    const scores: Record<number, number> = { 20: 10, 21: 5000 };
    const score = (f: PrFacts) => scores[f.pr.pullRequest.number] ?? 0;
    expect(numbers(sortFacts([calm, urgent, failing], 'priority', 'desc', score))).toEqual([
      12, 21, 20,
    ]);
  });

  it('puts the PR waiting longest first on a Priority tie, in either direction', () => {
    const older = factsFrom({
      number: 30,
      author: 'mira',
      pullRequest: { createdAt: hoursAgo(50) },
    });
    const newer = factsFrom({
      number: 31,
      author: 'mira',
      pullRequest: { createdAt: hoursAgo(10) },
    });
    expect(numbers(sortFacts([newer, older], 'priority', 'desc'))).toEqual([30, 31]);
    expect(numbers(sortFacts([newer, older], 'priority', 'asc'))).toEqual([30, 31]);
  });

  it('puts the higher number first on a full tie, in either direction', () => {
    const at = hoursAgo(10);
    const low = factsFrom({ number: 40, author: 'mira', pullRequest: { createdAt: at } });
    const high = factsFrom({ number: 41, author: 'mira', pullRequest: { createdAt: at } });
    expect(numbers(sortFacts([low, high], 'priority', 'desc'))).toEqual([41, 40]);
    expect(numbers(sortFacts([low, high], 'priority', 'asc'))).toEqual([41, 40]);
  });

  it('sorts by last update, newest first by default, ties by number', () => {
    const facts = [
      factsFrom({ number: 50, updatedHoursAgo: 1 }),
      factsFrom({ number: 51, updatedHoursAgo: 5 }),
      factsFrom({ number: 52, updatedHoursAgo: 1 }),
    ];
    expect(numbers(sortFacts(facts, 'updated', 'desc'))).toEqual([52, 50, 51]);
    expect(numbers(sortFacts(facts, 'updated', 'asc'))).toEqual([51, 52, 50]);
  });

  it('sorts by when the PR was opened', () => {
    const facts = [
      factsFrom({ number: 60, pullRequest: { createdAt: hoursAgo(5) } }),
      factsFrom({ number: 61, pullRequest: { createdAt: hoursAgo(1) } }),
      factsFrom({ number: 62, pullRequest: { createdAt: hoursAgo(9) } }),
    ];
    expect(numbers(sortFacts(facts, 'created', 'desc'))).toEqual([61, 60, 62]);
    expect(numbers(sortFacts(facts, 'created', 'asc'))).toEqual([62, 60, 61]);
  });

  it('sorts by lines changed', () => {
    const facts = [
      factsFrom({ number: 70, pullRequest: { additions: 5, deletions: 5 } }),
      factsFrom({ number: 71, pullRequest: { additions: 500, deletions: 0 } }),
      factsFrom({ number: 72, pullRequest: { additions: 40, deletions: 60 } }),
    ];
    expect(numbers(sortFacts(facts, 'size', 'desc'))).toEqual([71, 72, 70]);
    expect(numbers(sortFacts(facts, 'size', 'asc'))).toEqual([70, 72, 71]);
  });

  it('sorts titles case-insensitively, ties by number', () => {
    const facts = [
      factsFrom({ number: 80, title: 'beta' }),
      factsFrom({ number: 81, title: 'Alpha' }),
      factsFrom({ number: 82, title: 'alpha' }),
    ];
    expect(numbers(sortFacts(facts, 'title', 'asc'))).toEqual([82, 81, 80]);
    expect(numbers(sortFacts(facts, 'title', 'desc'))).toEqual([80, 82, 81]);
  });

  it('leaves its input alone', () => {
    const input = [waiting, yourTurn];
    sortFacts(input, 'priority', 'desc');
    expect(numbers(input)).toEqual([13, 10]);
  });
});
