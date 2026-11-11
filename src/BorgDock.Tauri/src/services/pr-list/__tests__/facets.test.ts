import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY } from '../display';
import {
  chipText,
  FACET_FIELDS,
  facetValues,
  fieldLabel,
  hasTerms,
  isViewEdited,
  newViewId,
  type SavedPrView,
  sanitizeSavedViews,
} from '../facets';
import { REVIEW_LABEL, STATUS_BUCKET_LABEL } from '../facts';
import type { MatchContext, QueryField } from '../query';
import { factsFrom, ME, NOW } from './helpers';

const MATCH: MatchContext = { username: ME, now: NOW };

const FACTS = [
  factsFrom({
    number: 1,
    title: 'AB#12 Fix the grid',
    repo: 'acme/shop',
    labels: ['Bug'],
    requestedReviewers: ['mira'],
    pullRequest: { requestedTeams: ['platform'] },
  }),
  factsFrom({
    number: 2,
    title: 'AB#12 and AB#34',
    repo: 'acme/shop',
    author: 'mira',
    labels: ['bug', 'ui'],
    requestedReviewers: [ME],
  }),
  factsFrom({
    number: 3,
    title: 'Order list',
    repo: 'other/shop',
    author: 'mira',
    pullRequest: { baseRef: 'release' },
  }),
  factsFrom({ number: 4, title: 'Docs', repo: 'acme/api', author: 'jules', labels: ['UI'] }),
];

describe('fieldLabel', () => {
  it('names each filter field, Updated included', () => {
    expect(fieldLabel('repo')).toBe('Repository');
    expect(fieldLabel('ab')).toBe('Work item');
    expect(fieldLabel('updated')).toBe('Updated');
  });

  it('offers every query field but Updated in the filter menu', () => {
    expect(FACET_FIELDS.map((f) => f.field)).not.toContain('updated');
    expect(new Set(FACET_FIELDS.map((f) => f.field)).size).toBe(FACET_FIELDS.length);
  });
});

describe('facetValues', () => {
  describe('fixed fields', () => {
    it('offer every value with its count, the ones no PR has too', () => {
      expect(facetValues('review', FACTS, MATCH)).toEqual([
        { value: 'me', label: REVIEW_LABEL.awaitingYou, count: 1 },
        { value: 'changes', label: REVIEW_LABEL.changes, count: 0 },
        { value: 'commented', label: REVIEW_LABEL.commented, count: 0 },
        { value: 'others', label: REVIEW_LABEL.awaitingOthers, count: 1 },
        { value: 'approved', label: REVIEW_LABEL.approved, count: 0 },
        { value: 'none', label: REVIEW_LABEL.none, count: 2 },
      ]);
    });

    it('store the status in lower case, as typing it would', () => {
      expect(facetValues('status', FACTS, MATCH)).toEqual([
        { value: 'yourturn', label: STATUS_BUCKET_LABEL.yourTurn, count: 1 },
        { value: 'failing', label: STATUS_BUCKET_LABEL.failing, count: 0 },
        { value: 'waiting', label: STATUS_BUCKET_LABEL.waiting, count: 3 },
        { value: 'ready', label: STATUS_BUCKET_LABEL.ready, count: 0 },
        { value: 'draft', label: STATUS_BUCKET_LABEL.draft, count: 0 },
      ]);
    });

    it.each<QueryField>([
      'review',
      'waiting',
      'status',
      'age',
      'size',
    ])('put every PR under exactly one %s value', (field) => {
      const total = facetValues(field, FACTS, MATCH).reduce((sum, v) => sum + v.count, 0);
      expect(total).toBe(FACTS.length);
    });

    it.each<QueryField>(['checks', 'is'])('offer %s values the query understands', (field) => {
      const values = facetValues(field, FACTS, MATCH);
      expect(values.length).toBeGreaterThan(0);
      expect(values.every((v) => v.value === v.value.toLowerCase())).toBe(true);
    });
  });

  it('lists authors by count, me marked as you', () => {
    expect(facetValues('author', FACTS, MATCH)).toEqual([
      { value: 'mira', label: 'mira', count: 2 },
      { value: 'jules', label: 'jules', count: 1 },
      { value: 'koen', label: 'koen (you)', count: 1 },
    ]);
  });

  it('names a repository by its name alone unless two owners share it', () => {
    expect(facetValues('repo', FACTS, MATCH)).toEqual([
      { value: 'acme/shop', label: 'acme/shop', count: 2 },
      { value: 'api', label: 'api', count: 1 },
      { value: 'other/shop', label: 'other/shop', count: 1 },
    ]);
  });

  it('merges labels that differ in case, keeping the first spelling', () => {
    expect(facetValues('label', FACTS, MATCH)).toEqual([
      { value: 'bug', label: 'Bug', count: 2 },
      { value: 'ui', label: 'ui', count: 2 },
    ]);
  });

  it('lists requested people and teams', () => {
    expect(facetValues('reviewer', FACTS, MATCH)).toEqual([
      { value: 'koen', label: 'koen', count: 1 },
      { value: 'mira', label: 'mira', count: 1 },
      { value: 'platform', label: 'platform', count: 1 },
    ]);
  });

  it('lists base branches and work items', () => {
    expect(facetValues('base', FACTS, MATCH)).toEqual([
      { value: 'main', label: 'main', count: 3 },
      { value: 'release', label: 'release', count: 1 },
    ]);
    expect(facetValues('ab', FACTS, MATCH)).toEqual([
      { value: '12', label: 'AB#12', count: 2 },
      { value: '34', label: 'AB#34', count: 1 },
    ]);
  });

  it('offers nothing for a free field no PR has a value for', () => {
    expect(facetValues('label', [factsFrom()], MATCH)).toEqual([]);
    expect(facetValues('updated', FACTS, MATCH)).toEqual([]);
  });
});

describe('chipText', () => {
  it.each([
    [{ field: 'author', values: ['mira'], negate: false }, ['Author', 'is', 'mira']],
    [
      { field: 'author', values: ['mira', 'jules'], negate: false },
      ['Author', 'is any of', 'mira, jules'],
    ],
    [{ field: 'label', values: ['wip'], negate: true }, ['Label', 'is not', 'wip']],
    [
      { field: 'repo', values: ['web', 'api'], negate: true },
      ['Repository', 'is none of', 'web, api'],
    ],
    [
      { field: 'review', values: ['me'], negate: false },
      ['Review state', 'is', 'Awaiting your review'],
    ],
    [
      { field: 'status', values: ['yourturn', 'ready'], negate: false },
      ['Status', 'is any of', 'Your turn, Ready to merge'],
    ],
    [{ field: 'checks', values: ['shared'], negate: false }, ['Checks', 'is', 'Shared failure']],
    [{ field: 'ab', values: ['12'], negate: false }, ['Work item', 'is', 'AB#12']],
    [{ field: 'updated', values: ['>7d'], negate: false }, ['Updated', 'is', '>7d']],
  ] as const)('words %j', (term, [field, op, values]) => {
    expect(chipText({ ...term, values: [...term.values] })).toEqual({ field, op, values });
  });
});

describe('sanitizeSavedViews', () => {
  const valid: SavedPrView = {
    id: 'view-1',
    name: 'Shop reviews',
    filter: 'needsYou',
    query: 'repo:shop',
    display: { ...DEFAULT_DISPLAY, groupBy: 'author' },
  };

  it('reads anything but a list as no views', () => {
    expect(sanitizeSavedViews(undefined)).toEqual([]);
    expect(sanitizeSavedViews({ views: [valid] })).toEqual([]);
  });

  it('keeps a valid view whole', () => {
    expect(sanitizeSavedViews([valid])).toEqual([valid]);
  });

  it('drops entries without an id or a name, and repeated ids', () => {
    expect(
      sanitizeSavedViews([
        null,
        'view-1',
        { ...valid, id: 7 },
        { ...valid, id: 'view-2', name: '   ' },
        { ...valid, id: 'view-3', name: undefined },
        valid,
        { ...valid, name: 'Second with the same id' },
      ]),
    ).toEqual([valid]);
  });

  it('trims the name and repairs the filter, query and display', () => {
    expect(
      sanitizeSavedViews([
        { id: 'view-9', name: '  Mine  ', filter: 'bogus', query: 42, display: 'table' },
      ]),
    ).toEqual([{ id: 'view-9', name: 'Mine', filter: 'all', query: '', display: DEFAULT_DISPLAY }]);
  });
});

describe('isViewEdited', () => {
  const view: SavedPrView = {
    id: 'view-1',
    name: 'Shop',
    filter: 'all',
    query: 'repo:shop grid',
    display: DEFAULT_DISPLAY,
  };
  const current = { filter: view.filter, query: view.query, display: { ...DEFAULT_DISPLAY } };

  it('is false while the list matches the view, whitespace aside', () => {
    expect(isViewEdited(view, current)).toBe(false);
    expect(isViewEdited(view, { ...current, query: '  repo:shop   grid ' })).toBe(false);
  });

  it('is true once the filter, the query or the display differs', () => {
    expect(isViewEdited(view, { ...current, filter: 'mine' })).toBe(true);
    expect(isViewEdited(view, { ...current, query: 'repo:shop' })).toBe(true);
    expect(
      isViewEdited(view, { ...current, display: { ...DEFAULT_DISPLAY, layout: 'list' } }),
    ).toBe(true);
  });
});

describe('hasTerms', () => {
  it('is true only for a query with a qualifier', () => {
    expect(hasTerms('author:me grid')).toBe(true);
    expect(hasTerms('-label:wip')).toBe(true);
    expect(hasTerms('grid foo:bar')).toBe(false);
    expect(hasTerms('')).toBe(false);
  });
});

describe('newViewId', () => {
  it('makes a fresh view id each time', () => {
    const a = newViewId();
    const b = newViewId();
    expect(a).toMatch(/^view-[a-z0-9]+-[a-z0-9]*$/);
    expect(a).not.toBe(b);
  });
});
