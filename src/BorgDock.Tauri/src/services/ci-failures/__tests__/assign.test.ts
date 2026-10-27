import { describe, expect, it } from 'vitest';
import { makeSignal } from '../__fixtures__/evidence';
import { assign, type IncomingSignal, type IndexedFingerprint } from '../assign';
import { type Fingerprint, fingerprintOf } from '../fingerprint';

const context = { failedStep: 'Run test', workflowPath: 'ci.yml' };

function fp(testId: string, message: string): Fingerprint {
  const result = fingerprintOf(
    makeSignal({ kind: 'test', parser: 'vitest', testId, message }),
    context,
  );
  if (!result) throw new Error('no fingerprint');
  return result;
}

function incoming(
  fingerprint: Fingerprint,
  occurrenceId: string,
  observedAt = '2026-10-26T10:00:00.000Z',
): IncomingSignal {
  return { occurrenceId, ordinal: 0, fingerprint, observedAt };
}

function ids() {
  let n = 0;
  return () => `g${++n}`;
}

describe('assign', () => {
  const pays = fp('checkout > pays', 'expected 200 to be 503');
  const paysOther = fp('checkout > pays', 'element #pay not found');
  const login = fp('auth > login', 'expected true to be false');

  it('gives each new fingerprint one group, shared by the whole batch', () => {
    const result = assign(
      [],
      [],
      [incoming(pays, 'a'), incoming(pays, 'b'), incoming(login, 'c')],
      ids(),
    );
    expect(result.newGroups.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(result.mappings.map((m) => [m.fingerprint, m.groupId])).toEqual([
      [pays.value, 'g1'],
      [login.value, 'g2'],
    ]);
    expect(result.newGroups[0]?.title).toBe('checkout > pays');
  });

  it('adds nothing for fingerprints the store already maps', () => {
    const index: IndexedFingerprint[] = [
      { fingerprint: pays.value, groupId: 'old', facets: pays.facets },
    ];
    const result = assign(index, [], [incoming(pays, 'a')], ids());
    expect(result).toEqual({ newGroups: [], mappings: [], candidates: [] });
  });

  it('puts a fingerprint back in the group a same-cause decision ties it to', () => {
    const index: IndexedFingerprint[] = [
      { fingerprint: login.value, groupId: 'auth', facets: login.facets },
    ];
    const result = assign(
      index,
      [{ fingerprintA: login.value, fingerprintB: pays.value }],
      [incoming(pays, 'a')],
      ids(),
    );
    expect(result.newGroups).toEqual([]);
    expect(result.mappings).toEqual([
      { fingerprint: pays.value, groupId: 'auth', facets: pays.facets },
    ]);
  });

  it('never groups low-tier fingerprints', () => {
    const generic = fingerprintOf(
      makeSignal({
        kind: 'generic',
        parser: 'generic',
        message: 'Process completed with exit code 1',
      }),
      context,
    );
    if (!generic) throw new Error('no fingerprint');
    expect(assign([], [], [incoming(generic, 'a')], ids()).mappings).toEqual([]);
  });

  it('links a new fingerprint to related groups as a candidate, ordered and once', () => {
    const index: IndexedFingerprint[] = [
      { fingerprint: pays.value, groupId: 'zz', facets: pays.facets },
    ];
    const result = assign(index, [], [incoming(paysOther, 'a'), incoming(paysOther, 'b')], ids());
    expect(result.candidates).toEqual([
      { groupA: 'g1', groupB: 'zz', reasons: ['Same test, different message'] },
    ]);
  });

  it('starts groups in observation order so titles and first sightings are stable', () => {
    const result = assign(
      [],
      [],
      [
        incoming(login, 'late', '2026-10-26T12:00:00.000Z'),
        incoming(pays, 'early', '2026-10-26T09:00:00.000Z'),
      ],
      ids(),
    );
    expect(result.newGroups.map((g) => [g.title, g.firstObservedAt])).toEqual([
      ['checkout > pays', '2026-10-26T09:00:00.000Z'],
      ['auth > login', '2026-10-26T12:00:00.000Z'],
    ]);
  });

  it('keeps a re-fingerprinted failure in the group most of its signals came from', () => {
    const result = assign(
      [],
      [],
      [
        { ...incoming(pays, 'a'), previousGroup: 'kept' },
        { ...incoming(pays, 'b'), previousGroup: 'kept' },
        { ...incoming(pays, 'c'), previousGroup: 'other' },
      ],
      ids(),
    );
    expect(result.newGroups).toEqual([]);
    expect(result.mappings.map((m) => m.groupId)).toEqual(['kept']);
  });
});
