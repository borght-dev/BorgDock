import { describe, expect, it } from 'vitest';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { summaryLine } from '../copy';
import { type AdoItemFacts, deriveAdo } from '../derive/ado';
import { type CiObservation, deriveCi } from '../derive/ci';
import { type DeliveryObservation, deriveDelivery } from '../derive/delivery';
import { deriveWorkstreams, type WorkstreamFacts } from '../derive/workstreams';
import { normalizeTime, SourceQueue } from '../sources';
import { context, seedContext } from './context';

// ── CI failures ──────────────────────────────────────────────

function group(overrides: Partial<CiGroupSummary> = {}): CiGroupSummary {
  return {
    id: 'g1',
    scope: 'github.com||acme/app',
    title: 'Login spec times out',
    classification: null,
    status: 'active',
    mergedInto: null,
    fixPr: null,
    fixMergedAt: null,
    trackingIssue: null,
    firstObservedAt: '2026-10-20T09:00:00.000Z',
    lastObservedAt: '2026-10-26T09:00:00.000Z',
    revision: 3,
    prNumbers: [412, 413],
    defaultBranchRuns: [],
    occurrenceCount: 4,
    runCount: 4,
    passedOnRetry: 0,
    catalogIds: [],
    failedSteps: ['test'],
    workflowNames: ['ci'],
    maxTier: 'high',
    candidateCount: 0,
    claim: null,
    ...overrides,
  } as CiGroupSummary;
}

function ciObserve(
  groups: CiGroupSummary[],
  overrides: Partial<CiObservation> = {},
): CiObservation {
  return {
    scope: 'github.com||acme/app',
    groups,
    threshold: 3,
    ownerStale: () => false,
    ownedByMe: () => false,
    myPrs: [412],
    myRedPrs: [412],
    ...overrides,
  };
}

const ciCtx = (overrides = {}) =>
  context({ sourceId: 'ci:github.com|koen|acme/app', ...overrides });

describe('deriveCi', () => {
  it('still reports a fix merged while BorgDock was closed', () => {
    const base = deriveCi(seedContext(), null, ciObserve([group()])).baseline;
    // A restart: the baseline came back from the store.
    const restored = JSON.parse(JSON.stringify(base));
    const fixed = group({ fixMergedAt: '2026-10-26T20:00:00.000Z', revision: 4 });
    const result = deriveCi(ciCtx({ coverage: 'catch-up' }), restored, ciObserve([fixed]));
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      category: 'ci.fix-merged',
      id: 'ci:github.com|koen|acme/app|g1:fix-merged:2026-10-26T20:00:00.000Z',
      sourceAt: '2026-10-26T20:00:00.000Z',
      needsYou: true,
      action: { kind: 'open-ci-group', scope: 'github.com||acme/app', groupId: 'g1' },
    });
    expect(deriveCi(ciCtx(), result.baseline, ciObserve([fixed])).entries).toEqual([]);
  });

  it('leaves out groups none of my PRs are in, unless shared work crossed the threshold', () => {
    const base = deriveCi(seedContext(), null, ciObserve([group({ prNumbers: [1] })])).baseline;
    const fixed = group({ prNumbers: [1], fixMergedAt: '2026-10-26T20:00:00.000Z' });
    expect(deriveCi(ciCtx(), base, ciObserve([fixed])).entries).toEqual([]);
  });

  it('reports a group resolved and seen again, and resolves what was open', () => {
    const fixedAt = '2026-10-26T20:00:00.000Z';
    const base = deriveCi(
      seedContext(),
      null,
      ciObserve([group({ fixMergedAt: fixedAt })]),
    ).baseline;
    const resolved = deriveCi(
      ciCtx(),
      base,
      ciObserve([group({ fixMergedAt: fixedAt, status: 'resolved', revision: 5 })]),
    );
    expect(resolved.entries.map((e) => e.category)).toEqual(['ci.resolved']);
    expect(resolved.resolutions[0]).toMatchObject({ entityKey: 'ci:g1', resolvedBy: 'resolved' });
    const back = deriveCi(
      ciCtx(),
      resolved.baseline,
      ciObserve([
        group({
          fixMergedAt: fixedAt,
          status: 'active',
          lastObservedAt: '2026-10-27T09:00:00.000Z',
          revision: 6,
        }),
      ]),
    );
    expect(back.entries.map((e) => e.category)).toEqual(['ci.seen-after-fix']);
  });

  it('stays quiet about a group that predates the seed but was never in the baseline', () => {
    const result = deriveCi(
      ciCtx(),
      { groups: [] },
      ciObserve([group({ fixMergedAt: '2026-10-26T20:00:00.000Z' })]),
    );
    expect(result.entries).toEqual([]);
  });
});

// ── Workstreams ──────────────────────────────────────────────

function document(attention: WorkstreamFacts['attention']): WorkstreamFacts {
  return { id: 'ws1', title: 'Checkout rewrite', createdAt: '2026-10-01T00:00:00.000Z', attention };
}
const ready = { id: 'ready', tone: 'ok' as const, reason: 'Every outcome is verified' };
const stalled = { id: 'stalled', tone: 'warn' as const, reason: 'Nothing moved for 3 days' };
const wsCtx = (overrides = {}) => context({ sourceId: 'workstreams:local', ...overrides });

describe('deriveWorkstreams', () => {
  it('gives one entry per episode of an attention that flaps, not one per assessment', () => {
    let baseline = deriveWorkstreams(seedContext(), null, { documents: [document([])] }).baseline;
    const ids: string[] = [];
    for (const attention of [[ready], [ready], [], [ready], [ready]]) {
      const result = deriveWorkstreams(wsCtx(), baseline, { documents: [document(attention)] });
      ids.push(...result.entries.map((e) => e.id));
      baseline = result.baseline;
    }
    expect(ids).toEqual(['workstreams:local|ws1:ready#1', 'workstreams:local|ws1:ready#2']);
  });

  it('resolves an entry when its attention stops holding, and skips other attention', () => {
    const base = deriveWorkstreams(seedContext(), null, { documents: [document([])] }).baseline;
    const held = deriveWorkstreams(wsCtx(), base, { documents: [document([ready, stalled])] });
    expect(held.entries.map((e) => e.category)).toEqual(['workstream.ready']);
    expect(held.entries[0]?.needsYou).toBe(false);
    const done = deriveWorkstreams(wsCtx(), held.baseline, { documents: [document([stalled])] });
    expect(done.resolutions).toEqual([
      expect.objectContaining({ ids: ['workstreams:local|ws1:ready#1'], resolvedBy: 'completed' }),
    ]);
  });

  it('reports a document changed on another machine', () => {
    const base = deriveWorkstreams(seedContext(), null, { documents: [document([])] }).baseline;
    const conflict = { id: 'conflict', tone: 'bad' as const, reason: 'Both machines changed it' };
    const result = deriveWorkstreams(wsCtx(), base, { documents: [document([conflict])] });
    expect(result.entries[0]).toMatchObject({
      category: 'workstream.conflict',
      needsYou: true,
      severity: 'warning',
    });
  });

  it('keeps what held for a document that vanished', () => {
    const base = deriveWorkstreams(seedContext(), null, {
      documents: [document([ready])],
    }).baseline;
    const gone = deriveWorkstreams(wsCtx(), base, { documents: [] });
    expect(gone.resolutions).toEqual([]);
    expect(gone.baseline.holding.ws1).toEqual({ ready: 1 });
  });
});

// ── Azure DevOps ─────────────────────────────────────────────

function item(overrides: Partial<AdoItemFacts> = {}): AdoItemFacts {
  return {
    id: 42,
    title: 'Login fails on Safari',
    url: 'https://dev.azure.com/o/p/_workitems/edit/42',
    rev: 5,
    state: 'Committed',
    states: ['New', 'Approved', 'Committed', 'Plan Review', 'Code Review', 'Done'],
    assignedToMe: true,
    changedBy: 'Ann',
    changedByMe: false,
    changedAt: '2026-10-27T09:00:00.000Z',
    newestComment: null,
    ...overrides,
  };
}
const adoObserve = (items: AdoItemFacts[]) => ({ organization: 'o', project: 'p', items });
const adoCtx = (overrides = {}) => context({ sourceId: 'ado:o/p', ...overrides });

describe('deriveAdo', () => {
  const base = () => deriveAdo(seedContext(), null, adoObserve([item()])).baseline;

  it('adds nothing for my own changes', () => {
    const mine = item({ rev: 6, state: 'Code Review', changedByMe: true });
    expect(deriveAdo(adoCtx(), base(), adoObserve([mine])).entries).toEqual([]);
  });

  it('adds one entry for someone else moving my item, needing me when it went backwards', () => {
    const forward = deriveAdo(
      adoCtx(),
      base(),
      adoObserve([item({ rev: 6, state: 'Code Review' })]),
    );
    expect(forward.entries).toHaveLength(1);
    expect(forward.entries[0]).toMatchObject({
      category: 'ado.state',
      needsYou: false,
      id: 'ado:o/p|item:42:rev:6:state',
    });
    const back = deriveAdo(adoCtx(), base(), adoObserve([item({ rev: 6, state: 'Approved' })]));
    expect(back.entries[0]?.needsYou).toBe(true);
  });

  it('adds one entry for someone else’s comment, and a report for a signed one', () => {
    const comment = {
      id: 900,
      author: 'Ann',
      signedBy: null,
      byMe: false,
      at: '2026-10-27T09:00:00Z',
      text: 'Can you check?',
    };
    const commented = deriveAdo(
      adoCtx(),
      base(),
      adoObserve([item({ rev: 6, newestComment: comment })]),
    );
    expect(commented.entries).toHaveLength(1);
    expect(commented.entries[0]).toMatchObject({
      category: 'ado.comment',
      needsYou: true,
      id: 'ado:o/p|ado-comment:900',
    });
    const vera = { ...comment, id: 901, author: 'Koen', signedBy: 'Vera · plan', byMe: false };
    const report = deriveAdo(
      adoCtx(),
      commented.baseline,
      adoObserve([item({ rev: 7, newestComment: vera })]),
    );
    expect(report.entries[0]).toMatchObject({ category: 'agent.report', needsYou: false });
    const mine = { ...comment, id: 902, author: 'Koen', byMe: true };
    const replied = deriveAdo(
      adoCtx(),
      commented.baseline,
      adoObserve([item({ rev: 7, newestComment: mine })]),
    );
    expect(replied.entries).toEqual([]);
    expect(replied.resolutions).toEqual([
      expect.objectContaining({ categories: ['ado.comment'], resolvedBy: 'replied' }),
    ]);
  });

  it('reports an item someone else assigned to me', () => {
    const result = deriveAdo(adoCtx(), base(), adoObserve([item(), item({ id: 43, rev: 2 })]));
    expect(result.entries.map((e) => e.id)).toEqual(['ado:o/p|item:43:rev:2:assigned']);
    const old = item({ id: 44, changedAt: '2026-01-01T00:00:00.000Z' });
    expect(deriveAdo(adoCtx(), base(), adoObserve([item(), old])).entries).toEqual([]);
  });

  it('adds nothing when an item leaves the query', () => {
    const result = deriveAdo(adoCtx(), base(), adoObserve([]));
    expect(result.entries).toEqual([]);
    expect(result.baseline.items['42']?.missingSince).toBeDefined();
  });
});

// ── Delivery ─────────────────────────────────────────────────

function delivery(overrides: Partial<DeliveryObservation> = {}): DeliveryObservation {
  return { owner: 'acme', repo: 'app', heads: [], inclusions: [], ...overrides };
}
const status = (id: number, state: string) => ({
  id,
  state,
  createdAt: '2026-10-27T09:30:00Z',
  logUrl: `https://github.com/acme/app/actions/runs/${id}`,
  environmentUrl: null,
});
const deployCtx = (overrides = {}) =>
  context({ sourceId: 'deploy:github.com|koen|acme/app', ...overrides });
const inclusion = (statusId: number, state: string, environment = 'acc') => ({
  prNumber: 412,
  prTitle: 'Faster login',
  prUrl: 'https://github.com/acme/app/pull/412',
  deploymentId: statusId * 10,
  environment,
  deploymentCreatedAt: '2026-10-27T09:00:00.000Z',
  status: status(statusId, state),
  included: true,
});

describe('deriveDelivery', () => {
  const base = () => deriveDelivery(seedContext(), null, delivery()).baseline;

  it('reports terminal deployments of my PR heads only', () => {
    const head = (id: number, state: string) => ({
      prNumber: 412,
      prTitle: 'Faster login',
      prUrl: 'https://github.com/acme/app/pull/412',
      deploymentId: id * 10,
      environment: 'staging-1',
      createdAt: '2026-10-27T09:00:00.000Z',
      status: status(id, state),
    });
    const result = deriveDelivery(
      deployCtx(),
      base(),
      delivery({ heads: [head(1, 'in_progress'), head(2, 'failure')] }),
    );
    expect(result.entries.map((e) => e.id)).toEqual([
      'deploy:github.com|koen|acme/app|deployment-status:2',
    ]);
    expect(result.entries[0]).toMatchObject({ category: 'deploy.pr', needsYou: true });
    const fixed = deriveDelivery(
      deployCtx(),
      result.baseline,
      delivery({ heads: [head(3, 'success')] }),
    );
    expect(fixed.resolutions[0]?.ids).toEqual([
      'deploy:github.com|koen|acme/app|deployment-status:2',
    ]);
  });

  it('reports a merged PR reaching an environment once, resolving an earlier failure', () => {
    const failed = deriveDelivery(
      deployCtx(),
      base(),
      delivery({ inclusions: [inclusion(5, 'failure')] }),
    );
    expect(failed.entries[0]).toMatchObject({ category: 'deploy.failed', needsYou: true });
    const reached = deriveDelivery(
      deployCtx(),
      failed.baseline,
      delivery({ inclusions: [inclusion(6, 'success')] }),
    );
    expect(reached.entries[0]).toMatchObject({
      category: 'deploy.reached',
      id: 'deploy:github.com|koen|acme/app|reached:acme/app#412:acc',
      summary: '#412 reached acc',
    });
    expect(reached.resolutions[0]?.ids).toEqual([
      'deploy:github.com|koen|acme/app|deployment-status:5:#412',
    ]);
    const again = deriveDelivery(
      deployCtx(),
      reached.baseline,
      delivery({ inclusions: [inclusion(7, 'success')] }),
    );
    expect(again.entries).toEqual([]);
  });

  it('ignores deployments that were not carrying my PR or predate the seed', () => {
    const outside = { ...inclusion(8, 'success'), included: false };
    const old = {
      ...inclusion(9, 'success', 'prod'),
      deploymentCreatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(
      deriveDelivery(deployCtx(), base(), delivery({ inclusions: [outside, old] })).entries,
    ).toEqual([]);
  });
});

// ── Shared pieces ────────────────────────────────────────────

describe('normalizeTime', () => {
  it('turns every form into the same text so it orders by time', () => {
    expect(normalizeTime('2026-10-27T10:00:00Z')).toBe('2026-10-27T10:00:00.000Z');
    expect(normalizeTime('nonsense')).toBeNull();
    expect(normalizeTime(null)).toBeNull();
  });
});

describe('summaryLine', () => {
  it('puts what needs me first and folds the rest', () => {
    expect(
      summaryLine({
        'agent.turn': 5,
        'agent.question': 2,
        'agent.failed': 1,
        'deploy.reached': 1,
        'pr.review': 3,
      }),
    ).toBe('Since you last checked: 2 questions, 1 failure, 5 turns finished, 3 reviews, 1 more');
    expect(summaryLine({})).toBeNull();
  });
});

describe('SourceQueue', () => {
  it('runs one observation per source and replaces a waiting one with a newer one', async () => {
    const queue = new SourceQueue();
    const ran: string[] = [];
    let release!: () => void;
    const first = queue.run('a', async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      ran.push('first');
    });
    const second = queue.run('a', async () => {
      ran.push('second');
    });
    const third = queue.run('a', async () => {
      ran.push('third');
    });
    const other = queue.run('b', async () => {
      ran.push('other');
    });
    await other;
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(await third).toBe(true);
    expect(ran).toEqual(['other', 'first', 'third']);
  });
});
