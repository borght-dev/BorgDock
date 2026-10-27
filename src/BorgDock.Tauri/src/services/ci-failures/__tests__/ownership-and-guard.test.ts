import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/ci-failures/store-api', () => ({ loadPr: vi.fn() }));

import type { AgentThread } from '@/services/dispatch/types';
import { makeClaim, makeDetail, makeGroup } from '../__fixtures__/store';
import { conflictOf } from '../launch-guard';
import { leaseUntil, ownerLabel, ownerStatusOf } from '../ownership';

const now = new Date('2026-10-26T12:00:00.000Z');

function thread(overrides: Partial<AgentThread>): AgentThread {
  return {
    id: 'mini:t1',
    hostId: 'mini',
    hostLabel: 'Mac mini',
    available: true,
    status: 'running',
    lastActivityAt: '2026-10-26T11:59:00.000Z',
    pullRequests: [],
    ...overrides,
  } as AgentThread;
}

describe('ownerStatusOf', () => {
  const t3 = makeClaim({
    ownerKind: 't3',
    ownerRef: 'mini:t1',
    hostId: 'mini',
    ownerLabel: 'CI: checkout',
  });

  it('reads a T3 owner from Dispatch first', () => {
    expect(ownerStatusOf(t3, { threads: [thread({})], sessions: [], now })).toMatchObject({
      label: 'running',
      stale: false,
      source: 'thread',
    });
    expect(
      ownerStatusOf(t3, { threads: [thread({ status: 'settled' })], sessions: [], now }),
    ).toMatchObject({ stale: true, finished: true });
    expect(
      ownerStatusOf(t3, { threads: [thread({ status: 'failed' })], sessions: [], now }),
    ).toMatchObject({ stale: true, finished: false });
    expect(
      ownerStatusOf(t3, { threads: [thread({ status: 'question' })], sessions: [], now }).stale,
    ).toBe(false);
  });

  it('turns stale only after the host has been offline a while', () => {
    const offline = (minutes: number) =>
      thread({
        available: false,
        lastActivityAt: new Date(now.getTime() - minutes * 60_000).toISOString(),
      });
    expect(ownerStatusOf(t3, { threads: [offline(5)], sessions: [], now }).stale).toBe(false);
    expect(ownerStatusOf(t3, { threads: [offline(45)], sessions: [], now }).stale).toBe(true);
  });

  it('falls back to the local session list, then to the lease', () => {
    const local = makeClaim({ ownerKind: 't3', ownerRef: 't2', hostId: 'local' });
    const session = {
      threadId: 't2',
      title: '',
      status: 'settled',
      updatedAt: '',
      pullRequestUrls: [],
    };
    expect(ownerStatusOf(local, { threads: [], sessions: [session], now }).finished).toBe(true);
    const lease = makeClaim({ leaseUntil: '2026-10-26T11:00:00.000Z' });
    expect(ownerStatusOf(lease, { threads: [], sessions: [], now })).toMatchObject({
      stale: true,
      source: 'lease',
    });
    expect(
      ownerStatusOf(makeClaim({ leaseUntil: leaseUntil(now, 24) }), {
        threads: [],
        sessions: [],
        now,
      }).stale,
    ).toBe(false);
  });

  it('flags a launch that died after claiming', () => {
    const pending = makeClaim({
      ownerKind: 't3',
      ownerRef: 'pending:x',
      claimedAt: '2026-10-26T11:00:00.000Z',
    });
    expect(ownerStatusOf(pending, { threads: [], sessions: [], now })).toMatchObject({
      label: 'launch never finished',
      stale: true,
    });
    expect(
      ownerStatusOf(makeClaim({ state: 'launch_failed' }), { threads: [], sessions: [], now })
        .stale,
    ).toBe(true);
  });

  it('labels owners', () => {
    expect(ownerLabel(makeClaim({ ownerKind: 't3', ownerLabel: 'CI: x' }))).toBe('T3 · CI: x');
    expect(ownerLabel(makeClaim({ ownerKind: 'terminal' }))).toBe('Terminal session');
    expect(ownerLabel(makeClaim())).toBe('You');
  });
});

describe('conflictOf', () => {
  const shared = makeGroup({ id: 'g1', prNumbers: [1, 2, 3] });
  const occurrence = makeDetail({ jobName: 'e2e' }, [{ groupId: 'g1' }]);

  it('stops a launch on a failure someone owns', () => {
    const claim = makeClaim();
    const conflict = conflictOf({ occurrences: [occurrence], groups: [{ ...shared, claim }] }, [
      'e2e',
    ]);
    expect(conflict).toEqual({ kind: 'owned', group: { ...shared, claim }, claim });
  });

  it('asks about a shared failure nobody owns', () => {
    expect(conflictOf({ occurrences: [occurrence], groups: [shared] }, [])?.kind).toBe('shared');
  });

  it('lets a launch on another check, a single-PR group or a low-tier match through', () => {
    expect(conflictOf({ occurrences: [occurrence], groups: [shared] }, ['lint'])).toBeNull();
    expect(
      conflictOf({ occurrences: [occurrence], groups: [makeGroup({ prNumbers: [1] })] }, []),
    ).toBeNull();
    const low = makeDetail({ jobName: 'e2e' }, [{ groupId: 'g1', tier: 'low' }]);
    expect(conflictOf({ occurrences: [low], groups: [shared] }, [])).toBeNull();
  });

  it('only counts what fails now: not a failure that passed later, not one of an older head', () => {
    const owned = { ...shared, claim: makeClaim() };
    const passed = {
      ...occurrence,
      outcome: {
        occurrenceId: occurrence.occurrence.id,
        kind: 'passed_on_retry',
        byJobId: 2,
        observedAt: '2026-10-26T10:05:00.000Z',
      },
    };
    expect(conflictOf({ occurrences: [passed], groups: [owned] }, [])).toBeNull();
    expect(conflictOf({ occurrences: [occurrence], groups: [owned] }, [], 'newer')).toBeNull();
    expect(conflictOf({ occurrences: [occurrence], groups: [owned] }, [], 'aaa')?.kind).toBe(
      'owned',
    );
  });

  it('ignores resolved groups and released claims', () => {
    expect(
      conflictOf({ occurrences: [occurrence], groups: [{ ...shared, status: 'resolved' }] }, []),
    ).toBeNull();
    const released = { ...shared, claim: makeClaim({ state: 'released' }) };
    expect(conflictOf({ occurrences: [occurrence], groups: [released] }, [])?.kind).toBe('shared');
  });
});
