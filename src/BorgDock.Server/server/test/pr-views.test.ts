import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SavedPrView } from '../../shared/src/api.ts';
import { openDb } from '../src/db.ts';
import { PrViewsConflict, PrViewsStore } from '../src/borgdock/pr-views.ts';
import { UserError } from '../src/service.ts';

const AT = new Date('2026-11-22T10:00:00Z');
const view = (o: Partial<SavedPrView> = {}): SavedPrView => ({
  id: 'view-1', name: 'Shop, green', filter: 'all', query: 'repo:shop -checks:failing', display: { layout: 'table', groupBy: 'status', columns: ['checks'] }, ...o,
});
const freshDir = () => mkdtempSync(join(tmpdir(), 'bd-pr-views-'));

test('pr views: an empty list at revision 0, then one revision per write, kept across a reopen', () => {
  const dir = freshDir();
  const db = openDb(dir);
  const store = new PrViewsStore(db);
  assert.deepEqual(store.get(), { revision: 0, views: [], updatedAt: null });
  assert.deepEqual(store.put(0, [view()], AT), { revision: 1, views: [view()], updatedAt: AT.toISOString() });
  assert.equal(store.put(1, [view(), view({ id: 'view-2', name: 'Mine', filter: 'mine' })], AT).revision, 2);
  db.close();

  const reopened = new PrViewsStore(openDb(dir));
  const read = reopened.get();
  assert.equal(read.revision, 2);
  assert.deepEqual(read.views.map((v) => v.id), ['view-1', 'view-2']);
  assert.equal(reopened.put(2, [], AT).revision, 3);
});

test('pr views: a write over an old revision is a conflict that carries the current list and writes nothing', () => {
  const store = new PrViewsStore(openDb(freshDir()));
  store.put(0, [view()], AT);
  assert.throws(() => store.put(0, [], AT), (error: unknown) => {
    assert.ok(error instanceof PrViewsConflict);
    assert.deepEqual(error.current, { revision: 1, views: [view()], updatedAt: AT.toISOString() });
    return true;
  });
  assert.throws(() => store.put(5, [], AT), PrViewsConflict, 'a revision from the future conflicts too');
  assert.deepEqual(store.get().views, [view()]);
});

test('pr views: stored as sent, display fields nobody here knows and spaces around the name included', () => {
  const store = new PrViewsStore(openDb(freshDir()));
  const sent = view({ name: ' Shop ', display: { layout: 'board', futureField: { nested: [1, 2] } } });
  assert.deepEqual(store.put(0, [sent], AT).views, [sent]);
  assert.deepEqual(store.get().views, [sent]);
});

test('pr views: what is refused with a 400, and nothing is written', () => {
  const store = new PrViewsStore(openDb(freshDir()));
  const refused = (baseRevision: unknown, views: unknown, why: string) =>
    assert.throws(() => store.put(baseRevision, views, AT), (error: unknown) => error instanceof UserError && error.status === 400, why);
  refused(undefined, [], 'no base revision');
  refused('0', [], 'a base revision that is not a number');
  refused(0.5, [], 'a base revision that is not a whole number');
  refused(0, { views: [] }, 'views not a list');
  refused(0, Array.from({ length: 101 }, (_, i) => view({ id: `v${i}` })), 'more than 100 views');
  refused(0, ['view-1'], 'a view that is not an object');
  refused(0, [view({ id: '' })], 'an empty id');
  refused(0, [view({ id: 'x'.repeat(101) })], 'an id over 100 characters');
  refused(0, [view(), view()], 'the same id twice');
  refused(0, [view({ name: '   ' })], 'a blank name');
  refused(0, [view({ name: 'n'.repeat(81) })], 'a name over 80 characters');
  refused(0, [view({ filter: 'waiting' as never })], 'an unknown tab');
  refused(0, [view({ query: 'q'.repeat(2001) })], 'a query over 2000 characters');
  refused(0, [view({ display: [] as never })], 'a display that is a list');
  refused(0, [view({ display: null as never })], 'no display');
  refused(0, [view({ display: { note: 'é'.repeat(4100) } })], 'a display over 8 KB of UTF-8, though under 8192 characters');
  assert.equal(store.get().revision, 0);

  const limits = [
    view({ id: 'x'.repeat(100), name: 'n'.repeat(80), query: 'q'.repeat(2000), display: { note: 'a'.repeat(8000) } }),
    ...Array.from({ length: 99 }, (_, i) => view({ id: `v${i}` })),
  ];
  assert.equal(store.put(0, limits, AT).views.length, 100, 'everything at its limit is accepted');
});
