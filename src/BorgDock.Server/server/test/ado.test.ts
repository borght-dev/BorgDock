import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inBacklogOrder, withSprintDates } from '../src/ado/client.ts';
import { item } from './fixtures.ts';

test('sprint items follow the ADO backlog order; items the backlog misses go last', () => {
  assert.deepEqual(inBacklogOrder([56908, 59783, 59335, 12, 59058], [59058, 56908, 59335, 59783]), [59058, 56908, 59335, 59783, 12]);
});

test('a finished sprint item counts from its closed date, else from its last state change; an open one has no finish', () => {
  const changed = { 'Microsoft.VSTS.Common.StateChangeDate': '2026-11-03T10:00:00Z' };
  const closed = { ...changed, 'Microsoft.VSTS.Common.ClosedDate': '2026-11-02T16:00:00Z' };
  const done = item({ id: 1, state: 'Done' });
  assert.equal(withSprintDates(done, closed).finishedAt, '2026-11-02T16:00:00Z');
  assert.equal(withSprintDates(done, changed).finishedAt, '2026-11-03T10:00:00Z');
  const review = withSprintDates(item({ id: 2, state: 'Code Review' }), closed);
  assert.equal(review.finishedAt, null, 'a closed date left over from an earlier Done does not count while the item is open');
  assert.equal(review.stateChangedAt, '2026-11-03T10:00:00Z');
  assert.equal(withSprintDates(item({ id: 3 }), {}).stateChangedAt, null);
});
