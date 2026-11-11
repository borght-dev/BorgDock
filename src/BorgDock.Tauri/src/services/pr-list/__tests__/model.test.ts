import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DISPLAY, type PrDisplay } from '../display';
import type { PrFacts } from '../facts';
import { YOUR_TURN_GROUP_KEY } from '../groups';
import {
  BUILT_IN_VIEWS,
  buildFacts,
  buildPrListModel,
  hidesFailing,
  inView,
  isPrViewKey,
  type PrListInput,
  type PrViewKey,
} from '../model';
import { parseQuery } from '../query';
import { factsFrom, ME, NOW, numbers, prFrom, RED } from './helpers';

const PRS = [
  prFrom({ number: 1, title: 'Fix the grid', repo: 'acme/shop', checks: RED, updatedHoursAgo: 1 }),
  prFrom({
    number: 2,
    title: 'Order list',
    repo: 'acme/api',
    author: 'mira',
    requestedReviewers: [ME],
    updatedHoursAgo: 2,
  }),
  prFrom({
    number: 3,
    title: 'Ship it',
    repo: 'acme/shop',
    reviewStatus: 'approved',
    updatedHoursAgo: 3,
  }),
  prFrom({
    number: 4,
    title: 'Flaky',
    repo: 'acme/api',
    author: 'jules',
    checks: RED,
    updatedHoursAgo: 4,
  }),
  prFrom({
    number: 5,
    title: 'Old idea',
    repo: 'acme/web',
    author: 'mira',
    updatedHoursAgo: 10 * 24,
  }),
  prFrom({ number: 6, title: 'Spike', repo: 'acme/web', isDraft: true, updatedHoursAgo: 5 }),
];

const FACTS = buildFacts({
  prs: PRS,
  username: ME,
  teams: [],
  now: NOW,
  staleAfterDays: 7,
  ciOf: () => null,
});

function model(overrides: Partial<PrListInput> = {}) {
  return buildPrListModel({
    facts: FACTS,
    username: ME,
    now: NOW,
    view: 'all',
    query: '',
    hideFailing: false,
    relatedKeys: null,
    display: DEFAULT_DISPLAY,
    ...overrides,
  });
}

const BY_REPO: PrDisplay = { ...DEFAULT_DISPLAY, groupBy: 'repo' };

describe('buildFacts', () => {
  it('derives the facts of every PR, in order', () => {
    expect(FACTS.map((f) => f.pr)).toEqual(PRS);
    expect(FACTS.map((f) => f.bucket)).toEqual([
      'yourTurn',
      'yourTurn',
      'ready',
      'failing',
      'waiting',
      'draft',
    ]);
    expect(FACTS[4]!.stale).toBe(true);
  });

  it('passes my teams and the CI failure store on', () => {
    const teamRequest = prFrom({ author: 'mira', pullRequest: { requestedTeams: ['platform'] } });
    const red = prFrom({ number: 2, checks: RED });
    const ciOf = vi.fn(() => ({ blocked: 2, outside: true }));
    const [team, shared] = buildFacts({
      prs: [teamRequest, red],
      username: ME,
      teams: ['platform'],
      now: NOW,
      staleAfterDays: 7,
      ciOf,
    });
    expect(team!.yourTurn).toBe(true);
    expect(shared).toMatchObject({ ci: { outside: true }, yourTurn: false });
  });
});

describe('views', () => {
  it.each<[PrViewKey, Partial<PrFacts>, boolean]>([
    ['all', {}, true],
    ['needsYou', { yourTurn: true }, true],
    ['needsYou', { yourTurn: false }, false],
    ['mine', { mine: true }, true],
    ['mine', { mine: false }, false],
    ['failing', { failing: true }, true],
    ['failing', { failing: false }, false],
    ['ready', { ready: true }, true],
    ['ready', { ready: false }, false],
    ['stale', { stale: true }, true],
    ['stale', { stale: false }, false],
  ])('%s with %j is %s', (view, change, expected) => {
    expect(inView({ ...factsFrom(), ...change }, view)).toBe(expected);
  });

  it('applies "Hide failing" to every view but Failing', () => {
    for (const { key } of BUILT_IN_VIEWS) {
      expect(hidesFailing(true, key)).toBe(key !== 'failing');
      expect(hidesFailing(false, key)).toBe(false);
    }
  });

  it('knows the built-in view keys', () => {
    expect(isPrViewKey('needsYou')).toBe(true);
    expect(isPrViewKey('stale')).toBe(true);
    expect(isPrViewKey('mineAndFailing')).toBe(false);
    expect(isPrViewKey(undefined)).toBe(false);
  });
});

describe('buildPrListModel', () => {
  it('lists every PR in priority order', () => {
    // Your turn (#2 waiting longest), ready, failing, waiting, draft.
    expect(numbers(model().rows)).toEqual([2, 1, 3, 4, 5, 6]);
  });

  it.each<[PrViewKey, number[]]>([
    ['needsYou', [2, 1]],
    ['mine', [1, 3, 6]],
    ['failing', [1, 4]],
    ['ready', [3]],
    ['stale', [5]],
  ])('narrows the rows to the %s view', (view, rows) => {
    expect(numbers(model({ view }).rows)).toEqual(rows);
  });

  it('narrows the rows to the query', () => {
    expect(numbers(model({ query: 'repo:api' }).rows)).toEqual([2, 4]);
    expect(numbers(model({ query: 'is:mine grid' }).rows)).toEqual([1]);
    expect(numbers(model({ view: 'mine', query: '-is:draft' }).rows)).toEqual([1, 3]);
  });

  describe('free text', () => {
    const facts = buildFacts({
      prs: [
        prFrom({
          number: 11,
          title: 'Fix login bug',
          author: 'alice',
          pullRequest: { headRef: 'fix/login' },
        }),
        prFrom({ number: 12, title: 'Add dashboard', author: 'bob', labels: ['enhancement'] }),
        prFrom({ number: 13, title: 'Update README', repo: 'acme/docs' }),
      ],
      username: ME,
      teams: [],
      now: NOW,
      staleAfterDays: 7,
      ciOf: () => null,
    });
    const found = (query: string) => numbers(model({ facts, query }).rows).sort();

    it.each<[string, string, number[]]>([
      ['title, ignoring case', 'LOGIN', [11]],
      ['author', 'bob', [12]],
      ['branch', 'fix/login', [11]],
      ['repository', 'acme/docs', [13]],
      ['label', 'enhancement', [12]],
      ['number', '13', [13]],
      ['nothing (an empty query)', '', [11, 12, 13]],
    ])('finds a PR by its %s', (_, query, rows) => {
      expect(found(query)).toEqual(rows);
    });

    it('needs the qualifiers and the free text to match together', () => {
      expect(found('author:alice login')).toEqual([11]);
      expect(found('author:bob login')).toEqual([]);
    });
  });

  it.each<[PrDisplay['sortBy'], PrDisplay['sortDir'], number[]]>([
    ['updated', 'desc', [1, 2, 3, 4, 6, 5]],
    ['updated', 'asc', [5, 6, 4, 3, 2, 1]],
    ['title', 'asc', [1, 4, 5, 2, 3, 6]],
  ])('orders the rows by the display: %s %s', (sortBy, sortDir, rows) => {
    const display: PrDisplay = { ...DEFAULT_DISPLAY, groupBy: 'none', sortBy, sortDir };
    const result = model({ display });
    expect(numbers(result.rows)).toEqual(rows);
    expect(result.groups.map((g) => numbers(g.facts))).toEqual([rows]);
  });

  it('hides red PRs under "Hide failing", but not in the Failing view', () => {
    expect(numbers(model({ hideFailing: true }).rows)).toEqual([2, 3, 5, 6]);
    expect(numbers(model({ hideFailing: true, view: 'failing' }).rows)).toEqual([1, 4]);
  });

  it('narrows the rows to the PRs of a related CI failure', () => {
    const relatedKeys = new Set(['acme/shop#1', 'acme/api#4']);
    expect(numbers(model({ relatedKeys }).rows)).toEqual([1, 4]);
  });

  it('returns the parsed query', () => {
    expect(model({ query: 'author:me grid' }).parsed).toEqual(parseQuery('author:me grid'));
  });

  it('passes the focus score on to the order', () => {
    const focusScore = (f: PrFacts) => (f.pr.pullRequest.number === 1 ? 50 : 0);
    expect(numbers(model({ focusScore }).rows)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  describe('groups', () => {
    it('groups the rows by the display', () => {
      expect(model().groups.map((g) => [g.key, numbers(g.facts)])).toEqual([
        ['status:yourTurn', [2, 1]],
        ['status:failing', [4]],
        ['status:waiting', [5]],
        ['status:ready', [3]],
        ['status:draft', [6]],
      ]);
    });

    it('pins "Your turn" in the All view of a grouping that asks for it', () => {
      const groups = model({ display: BY_REPO }).groups;
      expect(groups[0]!.key).toBe(YOUR_TURN_GROUP_KEY);
      expect(numbers(groups[0]!.facts)).toEqual([2, 1]);
    });

    it('pins nothing in another view or while narrowed to a related CI failure', () => {
      const pinned = (input: Partial<PrListInput>) =>
        model({ display: BY_REPO, ...input }).groups.some((g) => g.key === YOUR_TURN_GROUP_KEY);
      expect(pinned({ view: 'mine' })).toBe(false);
      expect(pinned({ relatedKeys: new Set(['acme/shop#1']) })).toBe(false);
      expect(pinned({ display: { ...BY_REPO, pinYourTurn: false } })).toBe(false);
    });

    it('nests sub-groups, except on the board', () => {
      const display: PrDisplay = { ...BY_REPO, subGroupBy: 'status' };
      expect(model({ display }).groups.some((g) => g.subgroups.length > 0)).toBe(true);
      const board = model({ display: { ...display, layout: 'board' } }).groups;
      expect(board.every((g) => g.subgroups.length === 0)).toBe(true);
    });
  });

  describe('counts', () => {
    const ALL_COUNTS = { all: 6, needsYou: 2, mine: 3, failing: 2, ready: 1, stale: 1 };

    it('counts each built-in view', () => {
      expect(model().counts).toEqual(ALL_COUNTS);
    });

    it('ignores the query and the selected view', () => {
      expect(model({ query: 'repo:web', view: 'ready' }).counts).toEqual(ALL_COUNTS);
    });

    it('leaves red PRs out under "Hide failing", but Failing keeps its own count', () => {
      expect(model({ hideFailing: true }).counts).toEqual({
        all: 4,
        needsYou: 1,
        mine: 2,
        failing: 2,
        ready: 1,
        stale: 1,
      });
    });

    it('counts each saved view with its own filter and query', () => {
      const savedViews = [
        { id: 'api', filter: 'all' as const, query: 'repo:api' },
        { id: 'mine', filter: 'mine' as const, query: '' },
        { id: 'red', filter: 'failing' as const, query: '' },
        { id: 'red-query', filter: 'all' as const, query: 'is:failing' },
      ];
      expect(model({ savedViews, query: 'repo:web', view: 'stale' }).savedCounts).toEqual({
        api: 2,
        mine: 3,
        red: 2,
        'red-query': 2,
      });
      expect(model({ savedViews, hideFailing: true }).savedCounts).toEqual({
        api: 1,
        mine: 2,
        red: 2,
        'red-query': 0,
      });
    });

    it('has no saved counts without saved views', () => {
      expect(model().savedCounts).toEqual({});
    });
  });
});
