import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inBacklogOrder } from '../src/ado/client.ts';

test('sprint items follow the ADO backlog order; items the backlog misses go last', () => {
  assert.deepEqual(inBacklogOrder([56908, 59783, 59335, 12, 59058], [59058, 56908, 59335, 59783]), [59058, 56908, 59335, 59783, 12]);
});
