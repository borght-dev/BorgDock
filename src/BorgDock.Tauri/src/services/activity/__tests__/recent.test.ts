import { describe, expect, it } from 'vitest';
import {
  EARLIER_SHOWN,
  earlierToday,
  needsYouNow,
  sinceLabel,
  toneOf,
  whereAndWhen,
  whereOf,
} from '../recent';
import type { ActivityEntry } from '../types';

const NOW = new Date(2026, 10, 24, 11, 30);
const at = (hour: number, minute: number, day = 24) =>
  new Date(2026, 10, day, hour, minute).toISOString();
const NO_LINKS = { itemIds: [], prUrls: [], ciGroupIds: [] };

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'gh:github.com|koen|acme/storefront|#412:merged',
    schema: 1,
    sourceId: 'gh:github.com|koen|acme/storefront',
    entity: {
      kind: 'pr',
      key: 'gh:acme/storefront#412',
      title: 'Price table migration',
      url: 'https://github.com/Acme/Storefront/pull/412',
    },
    category: 'pr.merged',
    severity: 'success',
    needsYou: false,
    status: 'open',
    resolvedBy: null,
    sourceAt: at(10, 2),
    observedAt: at(10, 3),
    coverage: 'live',
    summary: '#412 Price table migration was merged',
    detail: null,
    action: null,
    links: NO_LINKS,
    read: 'unread',
    readReason: null,
    readAt: null,
    version: 1,
    ...overrides,
  };
}

const grew = (id: string, when: string, needsYou = false) =>
  entry({
    id,
    category: 'ci.group-grew',
    severity: 'warning',
    needsYou,
    summary: `${id} now fails on 3 PRs, and nobody owns it`,
    sourceAt: when,
    observedAt: when,
  });

describe('needsYouNow', () => {
  it('is what nobody read and whose fact has not ended', () => {
    const open = entry({ needsYou: true });
    expect(needsYouNow(open)).toBe(true);
    expect(needsYouNow({ ...open, read: 'read' })).toBe(false);
    expect(needsYouNow({ ...open, status: 'resolved' })).toBe(false);
    expect(needsYouNow({ ...open, needsYou: false })).toBe(false);
  });
});

describe('toneOf', () => {
  it('is red for what failed, the accent for a review request, amber for what waits', () => {
    expect(toneOf({ severity: 'error', category: 'pr.checks-failed' })).toBe('red');
    expect(toneOf({ severity: 'warning', category: 'pr.review-request' })).toBe('accent');
    expect(toneOf({ severity: 'warning', category: 'agent.question' })).toBe('amber');
    expect(toneOf({ severity: 'success', category: 'pr.merged' })).toBe('green');
    expect(toneOf({ severity: 'info', category: 'agent.report' })).toBe('gray');
  });
});

describe('whereOf', () => {
  it('names a pull request’s repository as GitHub spells it', () => {
    expect(whereOf(entry(), 'acme/storefront (koen)')).toBe('Acme/Storefront');
  });

  it('falls back to the repository of the source, then of the key', () => {
    const noUrl = entry({ entity: { ...entry().entity, url: null } });
    expect(whereOf(noUrl, null)).toBe('acme/storefront');
    expect(whereOf({ ...noUrl, sourceId: 'unknown' }, null)).toBe('acme/storefront');
  });

  it('names a thread with the machine it runs on', () => {
    const thread = entry({
      sourceId: 't3:mini',
      entity: { kind: 'thread', key: 't3:mini:thread:cart', title: 'Fix cart totals', url: null },
    });
    expect(whereOf(thread, 'Mac mini')).toBe('Fix cart totals · Mac mini');
    expect(whereOf(thread, null)).toBe('Fix cart totals');
  });

  it('names a work item by its number and a CI failure group by its repository', () => {
    const item = entry({
      sourceId: 'ado:acme/shop',
      entity: { kind: 'workitem', key: 'ado:acme/shop:4821', title: 'Migrate tables', url: null },
      links: { ...NO_LINKS, itemIds: [4821] },
    });
    expect(whereOf(item, 'acme/shop')).toBe('AB#4821');
    const ci = entry({
      sourceId: 'ci:github.com|koen|acme/storefront',
      entity: { kind: 'ci-group', key: 'ci:g1', title: 'Login spec times out', url: null },
    });
    expect(whereOf(ci, 'CI failures in acme/storefront')).toBe('acme/storefront');
  });

  it('adds how long ago', () => {
    const request = entry({ sourceAt: at(11, 16), observedAt: at(11, 17) });
    expect(whereAndWhen(request, null, NOW.getTime())).toBe('Acme/Storefront · 14 min ago');
  });
});

describe('sinceLabel', () => {
  it('is the time I last looked, with the weekday when that was another day', () => {
    const today = sinceLabel(at(9, 12), NOW);
    expect(today).toMatch(/^since \S*9[:.]12/);
    expect(sinceLabel(at(17, 40, 23), NOW)).toMatch(
      /^since \p{L}+\.? .*5[:.]40|^since \p{L}+\.? 17[:.]40/u,
    );
    expect(sinceLabel(null, NOW)).toBeNull();
    expect(sinceLabel('not a time', NOW)).toBeNull();
  });
});

describe('earlierToday', () => {
  it('lists today’s entries that need nothing, in the order they happened, with their time', () => {
    const merged = entry();
    const reached = entry({
      id: 'reached',
      category: 'deploy.reached',
      summary: '#412 reached staging',
      sourceAt: at(10, 20),
      observedAt: at(10, 20),
    });
    const rows = earlierToday([merged, reached], NOW);
    expect(rows.map((row) => row.summary)).toEqual([
      '#412 Price table migration was merged',
      '#412 reached staging',
    ]);
    expect(rows[0]).toMatchObject({ tone: 'green', entryId: merged.id });
    expect(rows[0]?.time).toMatch(/10[:.]02/);
  });

  it('leaves out yesterday, what still needs me, what was dismissed and roll-ups', () => {
    const rows = earlierToday(
      [
        entry({ id: 'yesterday', sourceAt: at(16, 0, 23), observedAt: at(16, 0, 23) }),
        entry({ id: 'needs', needsYou: true, category: 'pr.checks-failed', severity: 'error' }),
        entry({ id: 'dismissed', read: 'dismissed' }),
        entry({ id: 'rollup', category: 'activity.rollup' }),
        entry({ id: 'kept' }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.key)).toEqual(['kept']);
  });

  it('keeps what I read myself while it is open, and drops what ended', () => {
    const opened = entry({
      id: 'opened',
      needsYou: true,
      category: 'pr.checks-failed',
      severity: 'error',
      read: 'read',
      readReason: 'action',
    });
    const ended = entry({
      id: 'ended',
      needsYou: true,
      category: 'pr.checks-failed',
      severity: 'error',
      status: 'resolved',
      read: 'read',
      readReason: 'resolved',
    });
    const rows = earlierToday([opened, ended], NOW);
    expect(rows.map((row) => row.key)).toEqual(['opened']);
    expect(rows[0]?.tone).toBe('red');
  });

  it('counts CI failure groups that grew without my PRs in one line', () => {
    const rows = earlierToday(
      [
        grew('Checkout spec', at(11, 5)),
        grew('Price snapshot', at(11, 15)),
        entry(),
        grew('Mine', at(11, 20), true),
      ],
      NOW,
    );
    // The one with my PR still needs me, so it is not "earlier".
    expect(rows.map((row) => row.summary)).toEqual([
      '#412 Price table migration was merged',
      '2 CI failure groups grew, none on your PRs',
    ]);
    expect(rows[1]).toMatchObject({ tone: 'gray', entryId: null });
    expect(rows[1]?.time).toMatch(/11[:.]15/);
  });

  it('opens the one group when only one grew', () => {
    const one = grew('Checkout spec', at(11, 5));
    const [row] = earlierToday([one], NOW);
    expect(row).toMatchObject({
      summary: '1 CI failure group grew, none on your PRs',
      entryId: one.id,
    });
  });

  it('shows the newest few', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      entry({ id: `e${index}`, sourceAt: at(8, index), observedAt: at(8, index) }),
    );
    const rows = earlierToday(many, NOW);
    expect(rows).toHaveLength(EARLIER_SHOWN);
    expect(rows.at(-1)?.key).toBe('e19');
    expect(rows[0]?.key).toBe(`e${20 - EARLIER_SHOWN}`);
  });
});
