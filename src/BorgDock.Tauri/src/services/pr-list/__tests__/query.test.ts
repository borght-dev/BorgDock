import { describe, expect, it } from 'vitest';
import type { PrFactsContext } from '../facts';
import {
  clearTerms,
  formatQuery,
  type MatchContext,
  matchesQuery,
  matchesTerm,
  parseQuery,
  removeTerm,
  setTerm,
  termText,
} from '../query';
import { factsFrom, hoursAgo, ME, NOW, type PrSpec, RED, RUNNING } from './helpers';

const MATCH: MatchContext = { username: ME, now: NOW };

function matches(query: string, spec: PrSpec = {}, ctx: Partial<PrFactsContext> = {}): boolean {
  return matchesQuery(factsFrom(spec, ctx), parseQuery(query), MATCH);
}

describe('parseQuery', () => {
  it('keeps a query without qualifiers as free text', () => {
    expect(parseQuery('results grid')).toEqual({ terms: [], text: 'results grid' });
    expect(parseQuery('')).toEqual({ terms: [], text: '' });
  });

  it('splits qualifiers from the free text, joining the text with single spaces', () => {
    expect(parseQuery('  results   author:me  grid is:failing ')).toEqual({
      terms: [
        { field: 'author', values: ['me'], negate: false },
        { field: 'is', values: ['failing'], negate: false },
      ],
      text: 'results grid',
    });
  });

  it('lower-cases fields and values', () => {
    expect(parseQuery('Author:Mira').terms).toEqual([
      { field: 'author', values: ['mira'], negate: false },
    ]);
  });

  it('reads commas as any of, dropping empty values', () => {
    expect(parseQuery('repo:web,api').terms[0]!.values).toEqual(['web', 'api']);
    expect(parseQuery('repo:web,,api,').terms[0]!.values).toEqual(['web', 'api']);
  });

  it('reads a leading minus as an exclusion', () => {
    expect(parseQuery('-label:wip').terms).toEqual([
      { field: 'label', values: ['wip'], negate: true },
    ]);
  });

  it('keeps spaces and commas inside quotes', () => {
    expect(parseQuery('label:"needs review",bug grid')).toEqual({
      terms: [{ field: 'label', values: ['needs review', 'bug'], negate: false }],
      text: 'grid',
    });
    expect(parseQuery('label:"a, b"').terms[0]!.values).toEqual(['a, b']);
  });

  it('keeps a word with an unknown field as free text', () => {
    expect(parseQuery('foo:bar -foo:baz https://example.com')).toEqual({
      terms: [],
      text: 'foo:bar -foo:baz https://example.com',
    });
  });

  it('keeps a qualifier without a value as free text', () => {
    expect(parseQuery('author: label:"" repo:,')).toEqual({
      terms: [],
      // Quotes only group words; free text drops them.
      text: 'author: label: repo:,',
    });
  });

  it('reads comparisons as values', () => {
    expect(parseQuery('age:>7d size:<100 updated:>=2w').terms.map((t) => t.values[0])).toEqual([
      '>7d',
      '<100',
      '>=2w',
    ]);
  });
});

describe('formatQuery', () => {
  it('writes the qualifiers first, then the free text', () => {
    expect(formatQuery(parseQuery('grid author:me fix -is:draft'))).toBe(
      'author:me -is:draft grid fix',
    );
  });

  it('quotes values with spaces or commas', () => {
    expect(termText({ field: 'label', values: ['needs review', 'a,b', 'bug'], negate: true })).toBe(
      '-label:"needs review","a,b",bug',
    );
  });

  it.each([
    'author:me is:failing repo:a,b -label:x age:>7d size:<100 ab:123 waiting:ci review:me',
    'label:"needs review",bug grid fix',
    'grid -author:dependabot "quoted words" foo:bar',
    'base:release:1.2 updated:<12h',
    '',
  ])('round-trips %j', (query) => {
    const parsed = parseQuery(query);
    const formatted = formatQuery(parsed);
    expect(parseQuery(formatted)).toEqual(parsed);
    expect(formatQuery(parseQuery(formatted))).toBe(formatted);
  });
});

describe('setTerm', () => {
  it('adds a new term after the others, ahead of the free text', () => {
    expect(setTerm('author:me grid', 'repo', ['Shop'])).toBe('author:me repo:shop grid');
  });

  it('replaces the values of the first term on the field in place', () => {
    expect(setTerm('author:me repo:a is:draft', 'repo', ['b', 'c'])).toBe(
      'author:me repo:b,c is:draft',
    );
  });

  it('drops later terms on the same field', () => {
    expect(setTerm('repo:a author:me -repo:b', 'repo', ['c'])).toBe('repo:c author:me');
  });

  it('takes the new sign', () => {
    expect(setTerm('-label:wip', 'label', ['wip'])).toBe('label:wip');
    expect(setTerm('label:wip grid', 'label', ['wip'], true)).toBe('-label:wip grid');
  });

  it('removes every term on the field when given no values', () => {
    expect(setTerm('repo:a author:me -repo:b grid', 'repo', [])).toBe('author:me grid');
  });

  it('leaves the query alone when there is nothing to set or remove', () => {
    expect(setTerm('author:me grid', 'repo', [])).toBe('author:me grid');
  });

  it('quotes a value with a space', () => {
    expect(setTerm('', 'label', ['Needs review'])).toBe('label:"needs review"');
  });
});

describe('removeTerm and clearTerms', () => {
  it('removes the term at an index of the parsed terms', () => {
    expect(removeTerm('author:me grid repo:a -is:draft', 1)).toBe('author:me -is:draft grid');
    expect(removeTerm('author:me grid', 5)).toBe('author:me grid');
  });

  it('keeps only the free text', () => {
    expect(clearTerms('author:me grid -repo:a fix')).toBe('grid fix');
    expect(clearTerms('is:failing')).toBe('');
  });
});

describe('matching', () => {
  const requestedFromMe: PrSpec = { author: 'mira', requestedReviewers: [ME] };

  it.each<[string, PrSpec, boolean, Partial<PrFactsContext>?]>([
    ['is:yourturn', requestedFromMe, true],
    ['is:turn', requestedFromMe, true],
    ['is:needsyou', requestedFromMe, true],
    ['is:yourTurn', { author: 'mira' }, false],
    ['is:mine', {}, true],
    ['is:mine', { author: 'mira' }, false],
    ['is:failing', { checks: RED }, true],
    ['is:red', { checks: RED }, true],
    ['is:failing', { checks: RUNNING }, false],
    ['is:running', { checks: RUNNING }, true],
    ['is:pending', { checks: RUNNING }, true],
    ['is:passing', {}, true],
    ['is:green', { checks: RUNNING }, false],
    ['is:passing', { checks: RED }, false],
    ['is:ready', { reviewStatus: 'approved' }, true],
    ['is:ready', {}, false],
    ['is:draft', { isDraft: true }, true],
    ['is:conflicts', { mergeable: false }, true],
    ['is:conflict', { mergeable: false }, true],
    ['is:stale', { updatedHoursAgo: 8 * 24 }, true],
    ['is:stale', {}, false],
    ['is:shared', { checks: RED }, true, { ciOf: () => ({ blocked: 2, outside: true }) }],
    ['is:shared', { checks: RED }, false],
    ['is:automerge', { pullRequest: { autoMergeEnabled: true } }, true],
    ['is:automerge', {}, false],
    ['is:open', { isDraft: true, checks: RED }, true],
    ['is:whatever', {}, false],
  ])('%s on %j is %s', (query, spec, expected, ctx) => {
    expect(matches(query, spec, ctx)).toBe(expected);
  });

  it.each<[string, PrSpec, boolean]>([
    ['status:yourturn', requestedFromMe, true],
    ['status:turn', { checks: RED }, true],
    ['status:failing', { author: 'mira', checks: RED }, true],
    ['status:waiting', { author: 'mira' }, true],
    ['status:ready', { author: 'mira', reviewStatus: 'approved' }, true],
    ['status:draft', { isDraft: true }, true],
    ['status:ready', { author: 'mira' }, false],
    ['status:bogus', { author: 'mira' }, false],
  ])('%s on %j is %s', (query, spec, expected) => {
    expect(matches(query, spec)).toBe(expected);
  });

  describe('author', () => {
    it('takes me and @me for the signed-in user', () => {
      expect(matches('author:me')).toBe(true);
      expect(matches('author:@me')).toBe(true);
      expect(matches('author:me', { author: 'mira' })).toBe(false);
    });

    it('matches a login case-insensitively, with or without @', () => {
      expect(matches('author:Mira', { author: 'mira' })).toBe(true);
      expect(matches('author:@mira', { author: 'Mira' })).toBe(true);
    });

    it('matches any of several logins, and none of them when negated', () => {
      expect(matches('author:mira,jules', { author: 'jules' })).toBe(true);
      expect(matches('author:mira,jules', { author: 'sasha' })).toBe(false);
      expect(matches('-author:mira,jules', { author: 'sasha' })).toBe(true);
      expect(matches('-author:mira,jules', { author: 'jules' })).toBe(false);
    });
  });

  it.each<[string, PrSpec, boolean]>([
    ['review:me', requestedFromMe, true],
    ['review:you', requestedFromMe, true],
    ['review:pending', requestedFromMe, true],
    ['review:pending', { author: 'mira', requestedReviewers: ['jules'] }, true],
    ['review:others', { author: 'mira', requestedReviewers: ['jules'] }, true],
    ['review:others', requestedFromMe, false],
    ['review:approved', { reviewStatus: 'approved' }, true],
    ['review:changes', { reviewStatus: 'changesRequested' }, true],
    ['review:commented', { reviewStatus: 'commented' }, true],
    ['review:none', {}, true],
    ['review:none', { reviewStatus: 'approved' }, false],
  ])('%s on %j is %s', (query, spec, expected) => {
    expect(matches(query, spec)).toBe(expected);
  });

  describe('reviewer', () => {
    it('reads me as a review that waits on me, through a team too', () => {
      expect(matches('reviewer:me', requestedFromMe)).toBe(true);
      expect(matches('reviewer:@me', requestedFromMe)).toBe(true);
      const teamRequest: PrSpec = { author: 'mira', pullRequest: { requestedTeams: ['platform'] } };
      expect(matches('reviewer:me', teamRequest, { teams: ['platform'] })).toBe(true);
      expect(matches('reviewer:me', teamRequest)).toBe(false);
    });

    it('matches a requested person or team by name', () => {
      const spec: PrSpec = {
        author: 'mira',
        requestedReviewers: ['Jules'],
        pullRequest: { requestedTeams: ['Platform'] },
      };
      expect(matches('reviewer:jules', spec)).toBe(true);
      expect(matches('reviewer:@platform', spec)).toBe(true);
      expect(matches('reviewer:sasha', spec)).toBe(false);
    });
  });

  it.each<[string, PrSpec, boolean, Partial<PrFactsContext>?]>([
    ['checks:failing', { checks: RED }, true],
    ['checks:running', { checks: RUNNING }, true],
    ['checks:passing', {}, true],
    ['checks:passing', { checks: { total: 0 } }, false],
    ['checks:none', { checks: { total: 0 } }, true],
    ['checks:none', {}, false],
    ['checks:shared', { checks: RED }, true, { ciOf: () => ({ blocked: 2, outside: false }) }],
    ['checks:shared', { checks: RED }, false],
    ['checks:bogus', {}, false],
  ])('%s on %j is %s', (query, spec, expected, ctx) => {
    expect(matches(query, spec, ctx)).toBe(expected);
  });

  it.each<[string, PrSpec, boolean]>([
    ['waiting:me', requestedFromMe, true],
    ['waiting:you', requestedFromMe, true],
    ['waiting:author', { author: 'mira', checks: RED }, true],
    ['waiting:reviewer', { author: 'mira', requestedReviewers: ['jules'] }, true],
    ['waiting:reviewers', { author: 'mira', requestedReviewers: ['jules'] }, true],
    ['waiting:ci', { author: 'mira', checks: RUNNING }, true],
    ['waiting:ci', requestedFromMe, false],
  ])('%s on %j is %s', (query, spec, expected) => {
    expect(matches(query, spec)).toBe(expected);
  });

  it('matches a repository by name or owner/name, case-insensitively', () => {
    expect(matches('repo:shop')).toBe(true);
    expect(matches('repo:acme/shop')).toBe(true);
    expect(matches('repo:ACME/Shop')).toBe(true);
    expect(matches('repo:api')).toBe(false);
    expect(matches('repo:api,shop')).toBe(true);
  });

  it('matches labels and the base branch case-insensitively', () => {
    const spec: PrSpec = { labels: ['Needs Review'], pullRequest: { baseRef: 'Release/1.2' } };
    expect(matches('label:"needs review"', spec)).toBe(true);
    expect(matches('label:bug', spec)).toBe(false);
    expect(matches('-label:bug', spec)).toBe(true);
    expect(matches('base:release/1.2', spec)).toBe(true);
    expect(matches('base:main', spec)).toBe(false);
  });

  it('matches a work item with or without its AB# prefix', () => {
    const spec: PrSpec = { title: 'Keep the scroll position AB#123' };
    expect(matches('ab:123', spec)).toBe(true);
    expect(matches('ab:AB#123', spec)).toBe(true);
    expect(matches('ab:ab123', spec)).toBe(true);
    expect(matches('ab:124', spec)).toBe(false);
  });

  describe('age, updated and size', () => {
    const tenDaysOld: PrSpec = { pullRequest: { createdAt: hoursAgo(10 * 24) } };

    it.each<[string, boolean]>([
      ['age:>7d', true],
      ['age:<7d', false],
      ['age:>=1w', true],
      ['age:<240h', false],
      ['age:<=240h', true],
      ['age:>9', true],
      ['age:>11', false],
      ['age:month', true],
      ['age:week', false],
      ['age:soon', false],
    ])('%s on a PR opened ten days ago is %s', (query, expected) => {
      expect(matches(query, tenDaysOld)).toBe(expected);
    });

    it.each<[string, boolean]>([
      ['updated:<6h', true],
      ['updated:>6h', false],
      ['updated:<1', true],
      ['updated:>=300m', true],
      ['updated:>300m', false],
      ['updated:recently', false],
    ])('%s on a PR updated five hours ago is %s', (query, expected) => {
      expect(matches(query, { updatedHoursAgo: 5 })).toBe(expected);
    });

    it.each<[string, boolean]>([
      ['size:m', true],
      ['size:s', false],
      ['size:<100', false],
      ['size:>100', true],
      ['size:<=150', true],
      ['size:<150', false],
      ['size:150', true],
      ['size:=150', true],
      ['size:huge', false],
    ])('%s on a 150-line PR is %s', (query, expected) => {
      expect(matches(query, { pullRequest: { additions: 120, deletions: 30 } })).toBe(expected);
    });
  });

  it('matches a term without parsing a query first', () => {
    const f = factsFrom({ author: 'mira' });
    expect(
      matchesTerm(f, { field: 'author', values: ['jules', 'mira'], negate: false }, MATCH),
    ).toBe(true);
    expect(matchesTerm(f, { field: 'author', values: ['mira'], negate: true }, MATCH)).toBe(false);
  });

  describe('matchesQuery', () => {
    const spec: PrSpec = {
      number: 471,
      title: 'Virtualize the results grid',
      author: 'mira',
      checks: RED,
    };

    it('matches everything with an empty query', () => {
      expect(matches('', spec)).toBe(true);
    });

    it('needs every qualifier to match', () => {
      expect(matches('author:mira is:failing', spec)).toBe(true);
      expect(matches('author:mira is:draft', spec)).toBe(false);
    });

    it('matches the free text as one phrase', () => {
      expect(matches('results grid', spec)).toBe(true);
      expect(matches('grid results', spec)).toBe(false);
      expect(matches('author:mira results', spec)).toBe(true);
      expect(matches('471', spec)).toBe(true);
    });

    it('searches for a word with an unknown field as typed', () => {
      expect(matches('foo:bar', { title: 'Parse foo:bar pairs' })).toBe(true);
      expect(matches('foo:bar', spec)).toBe(false);
    });
  });
});
