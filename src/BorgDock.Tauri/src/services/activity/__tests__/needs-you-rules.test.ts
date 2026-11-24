import { describe, expect, it } from 'vitest';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import type { AppSettings } from '@/types';
import { type AdoItemFacts, deriveAdo } from '../derive/ado';
import { type CiObservation, deriveCi } from '../derive/ci';
import { type DeliveryObservation, deriveDelivery } from '../derive/delivery';
import {
  deriveGitHub,
  type GitHubBaseline,
  type GitHubObservation,
  type PrFacts,
  type VerifiedPr,
} from '../derive/github';
import { channelsFor } from '../policy';
import { context, seedContext } from './context';

/**
 * The rules of 4.17.0: "needs you" lasts until the fact ends, a CI failure
 * group that grew needs me only with one of my PRs in it, and an Azure
 * DevOps assignment is a quiet entry.
 */

const SETTINGS = {
  notifications: { activity: { categories: {}, push: { enabled: true } } },
} as unknown as AppSettings;

// ── A CI failure group that grew ─────────────────────────────

/** Shared (failing on pull requests that have nothing in common), unowned and active. */
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
    lastObservedAt: '2026-10-27T09:40:00.000Z',
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
    myPrs: [],
    myRedPrs: [],
    ...overrides,
  };
}

const CI = 'ci:github.com|koen|acme/app';
const ciCtx = (overrides = {}) => context({ sourceId: CI, ...overrides });
const grown = (prNumbers: number[]) => group({ prNumbers, revision: 4 });

describe('a CI failure group that grew', () => {
  const below = () => deriveCi(seedContext(), null, ciObserve([group()])).baseline;

  it('is a quiet entry without one of my PRs in it: no popup, no push, nothing needed', () => {
    const result = deriveCi(ciCtx(), below(), ciObserve([grown([412, 413, 414])]));
    expect(result.entries).toHaveLength(1);
    const [entry] = result.entries;
    expect(entry).toMatchObject({ category: 'ci.group-grew', needsYou: false });
    expect(channelsFor(entry!, SETTINGS)).toEqual([]);
  });

  it('needs me and pops up when one of my PRs is in it', () => {
    const result = deriveCi(
      ciCtx(),
      below(),
      ciObserve([grown([412, 413, 414])], { myPrs: [413] }),
    );
    const [entry] = result.entries;
    expect(entry).toMatchObject({ category: 'ci.group-grew', needsYou: true });
    expect(channelsFor(entry!, SETTINGS)).toEqual(['popup', 'push']);
  });

  it('counts once a day per group, however often it crosses the threshold', () => {
    const mine = { myPrs: [413] };
    const first = deriveCi(ciCtx(), below(), ciObserve([grown([412, 413, 414])], mine));
    expect(first.entries[0]?.id).toBe(`${CI}|g1:group-grew:3:2026-10-27`);
    // The same observation again adds nothing.
    expect(
      deriveCi(ciCtx(), first.baseline, ciObserve([grown([412, 413, 414])], mine)).entries,
    ).toEqual([]);
    // Below the threshold and over it again the same day: the same entry.
    const shrunk = deriveCi(ciCtx(), first.baseline, ciObserve([grown([412, 413])], mine));
    const again = deriveCi(
      ciCtx({ now: '2026-10-27T16:00:00.000Z' }),
      shrunk.baseline,
      ciObserve([grown([412, 413, 415])], mine),
    );
    expect(again.entries.map((entry) => entry.id)).toEqual([first.entries[0]?.id]);
    // The next day it is a new entry, and the earlier one is superseded.
    const nextDay = deriveCi(
      ciCtx({ now: '2026-10-28T08:00:00.000Z' }),
      shrunk.baseline,
      ciObserve([grown([412, 413, 415])], mine),
    );
    expect(nextDay.entries[0]?.id).toBe(`${CI}|g1:group-grew:3:2026-10-28`);
    expect(nextDay.resolutions).toContainEqual({
      ids: [],
      entityKey: 'ci:g1',
      categories: ['ci.group-grew'],
      status: 'superseded',
      resolvedBy: `${CI}|g1:group-grew:3:2026-10-28`,
    });
  });

  it('stops needing me when my PR leaves the group, and says so once', () => {
    const mine = deriveCi(ciCtx(), below(), ciObserve([grown([412, 413, 414])], { myPrs: [413] }));
    expect(mine.resolutions.filter((r) => r.status === 'resolved')).toEqual([]);
    const left = deriveCi(
      ciCtx(),
      mine.baseline,
      ciObserve([grown([412, 414, 415])], { myPrs: [413] }),
    );
    expect(left.resolutions).toEqual([
      {
        ids: [],
        entityKey: 'ci:g1',
        categories: ['ci.group-grew'],
        status: 'resolved',
        resolvedBy: 'no longer on your PRs',
      },
    ]);
    const after = deriveCi(
      ciCtx(),
      left.baseline,
      ciObserve([grown([412, 414, 415])], { myPrs: [413] }),
    );
    expect(after.resolutions).toEqual([]);
  });

  it('stops needing me when the group is gone from the store', () => {
    const mine = deriveCi(ciCtx(), below(), ciObserve([grown([412, 413, 414])], { myPrs: [413] }));
    const gone = deriveCi(ciCtx(), mine.baseline, ciObserve([], { myPrs: [413] }));
    expect(gone.resolutions).toContainEqual(
      expect.objectContaining({ entityKey: 'ci:g1', resolvedBy: 'no longer on your PRs' }),
    );
  });
});

// ── Azure DevOps ─────────────────────────────────────────────

function item(overrides: Partial<AdoItemFacts> = {}): AdoItemFacts {
  return {
    id: 42,
    title: 'Login fails on Safari',
    url: 'https://dev.azure.com/acme/shop/_workitems/edit/42',
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
const adoObserve = (items: AdoItemFacts[]) => ({ organization: 'acme', project: 'shop', items });
const ADO = 'ado:acme/shop';
const adoCtx = (overrides = {}) => context({ sourceId: ADO, ...overrides });
const comment = (id: number, overrides = {}) => ({
  id,
  author: 'Ann',
  signedBy: null,
  byMe: false,
  at: '2026-10-27T09:00:00Z',
  text: 'Can you check?',
  ...overrides,
});

describe('Azure DevOps entries', () => {
  const base = () => deriveAdo(seedContext(), null, adoObserve([item()])).baseline;

  it('records an assignment quietly: Dispatch lists the item', () => {
    const result = deriveAdo(adoCtx(), base(), adoObserve([item(), item({ id: 43, rev: 2 })]));
    const [entry] = result.entries;
    expect(entry).toMatchObject({ category: 'ado.assigned', needsYou: false });
    expect(channelsFor(entry!, SETTINGS)).toEqual([]);
  });

  it('keeps only the newest move of an item open, and ends it when I move the item', () => {
    const back = deriveAdo(adoCtx(), base(), adoObserve([item({ rev: 6, state: 'Approved' })]));
    expect(back.entries[0]).toMatchObject({ category: 'ado.state', needsYou: true });
    expect(back.resolutions).toContainEqual({
      ids: [],
      entityKey: 'ado:acme/shop:42',
      categories: ['ado.state'],
      status: 'superseded',
      resolvedBy: `${ADO}|item:42:rev:6:state`,
    });
    const mine = deriveAdo(
      adoCtx(),
      back.baseline,
      adoObserve([item({ rev: 7, state: 'Committed', changedByMe: true })]),
    );
    expect(mine.entries).toEqual([]);
    expect(mine.resolutions).toEqual([
      expect.objectContaining({ categories: ['ado.state'], resolvedBy: 'you moved it' }),
    ]);
  });

  it('keeps only the newest comment on an item open', () => {
    const first = deriveAdo(
      adoCtx(),
      base(),
      adoObserve([item({ rev: 6, newestComment: comment(900) })]),
    );
    const second = deriveAdo(
      adoCtx(),
      first.baseline,
      adoObserve([item({ rev: 7, newestComment: comment(901) })]),
    );
    expect(second.entries.map((entry) => entry.id)).toEqual([`${ADO}|ado-comment:901`]);
    expect(second.resolutions).toEqual([
      expect.objectContaining({
        entityKey: 'ado:acme/shop:42',
        categories: ['ado.comment'],
        status: 'superseded',
        resolvedBy: `${ADO}|ado-comment:901`,
      }),
    ]);
  });

  it('ends what an item left open when it leaves my list, once', () => {
    const gone = deriveAdo(adoCtx(), base(), adoObserve([]));
    expect(gone.entries).toEqual([]);
    expect(gone.resolutions).toEqual([
      {
        ids: [],
        entityKey: 'ado:acme/shop:42',
        categories: ['ado.assigned', 'ado.state', 'ado.comment'],
        status: 'resolved',
        resolvedBy: 'no longer on your list',
      },
    ]);
    expect(deriveAdo(adoCtx(), gone.baseline, adoObserve([])).resolutions).toEqual([]);
  });

  it('ends them too when the item is listed but no longer mine', () => {
    const result = deriveAdo(adoCtx(), base(), adoObserve([item({ rev: 6, assignedToMe: false })]));
    expect(result.resolutions).toEqual([
      expect.objectContaining({ entityKey: 'ado:acme/shop:42', resolvedBy: 'no longer yours' }),
    ]);
  });
});

// ── Pull requests ────────────────────────────────────────────

const GH = 'gh:github.com|koen|acme/app';

function pr(overrides: Partial<PrFacts> = {}): PrFacts {
  return {
    number: 412,
    title: 'Faster login',
    url: 'https://github.com/acme/app/pull/412',
    author: 'koen',
    createdAt: '2026-10-20T09:00:00.000Z',
    headSha: 'aaa',
    isDraft: false,
    mergeable: true,
    ready: false,
    reviews: [],
    requestedMe: false,
    requestedAt: null,
    claudeKey: null,
    checks: { known: true, overall: 'yellow', failing: [] },
    ...overrides,
  };
}

function ghObserve(prs: PrFacts[], overrides: Partial<GitHubObservation> = {}): GitHubObservation {
  return {
    owner: 'acme',
    repo: 'app',
    login: 'koen',
    path: 'graphql',
    prs,
    verified: [],
    findings: [],
    ...overrides,
  };
}

const ghCtx = (overrides = {}) => context({ sourceId: GH, ...overrides });
const ghSeeded = (prs: PrFacts[]): GitHubBaseline =>
  deriveGitHub(seedContext({ sourceId: GH }), null, ghObserve(prs)).baseline;

function verified(state: VerifiedPr['state'], author: string): VerifiedPr {
  return {
    number: 412,
    title: 'Faster login',
    url: 'https://github.com/acme/app/pull/412',
    author,
    state,
    mergedAt: state === 'merged' ? '2026-10-27T09:45:00Z' : null,
    mergedBy: state === 'merged' ? 'ann' : null,
    closedAt: '2026-10-27T09:45:00Z',
  };
}

describe('pull request entries', () => {
  it('ends a review request when someone else’s pull request merges or closes', () => {
    const theirs = pr({ author: 'ann', requestedMe: true, requestedAt: '2026-10-27T09:00:00Z' });
    const asked = deriveGitHub(ghCtx(), ghSeeded([pr({ author: 'ann' })]), ghObserve([theirs]));
    expect(asked.entries[0]).toMatchObject({ category: 'pr.review-request', needsYou: true });
    for (const state of ['merged', 'closed'] as const) {
      const ended = deriveGitHub(
        ghCtx(),
        asked.baseline,
        ghObserve([], { verified: [verified(state, 'ann')] }),
      );
      // Their merge is news that needs nothing from me, their close is none: the request is over either way.
      expect(ended.entries.map((entry) => [entry.category, entry.needsYou])).toEqual(
        state === 'merged' ? [['pr.merged-other', false]] : [],
      );
      expect(ended.resolutions).toEqual([
        expect.objectContaining({
          entityKey: 'gh:acme/app#412',
          status: 'resolved',
          resolvedBy: state,
        }),
      ]);
      expect(ended.resolutions[0]?.categories).toContain('pr.review-request');
    }
  });

  it('says a pull request ended once, not on every read after', () => {
    const base = ghSeeded([pr({ author: 'ann', requestedMe: true })]);
    const ended = deriveGitHub(
      ghCtx(),
      base,
      ghObserve([], { verified: [verified('merged', 'ann')] }),
    );
    const again = deriveGitHub(
      ghCtx(),
      ended.baseline,
      ghObserve([], { verified: [verified('merged', 'ann')] }),
    );
    expect(again.resolutions).toEqual([]);
  });

  it('ends the findings and the failing checks of my own pull request when it merges', () => {
    const merged = deriveGitHub(
      ghCtx(),
      ghSeeded([pr()]),
      ghObserve([], { verified: [verified('merged', 'koen')] }),
    );
    expect(merged.entries.map((entry) => entry.category)).toEqual(['pr.merged']);
    expect(merged.resolutions[0]?.categories).toEqual(
      expect.arrayContaining(['pr.findings', 'pr.checks-failed', 'pr.conflict', 'pr.review']),
    );
  });

  it('keeps only the newest Claude review of a pull request open', () => {
    const base = ghSeeded([pr({ claudeKey: 'r1' })]);
    const result = deriveGitHub(
      ghCtx(),
      base,
      ghObserve([pr({ claudeKey: 'r2' })], {
        findings: [
          {
            number: 412,
            key: 'r2',
            at: '2026-10-27T09:20:00Z',
            items: [{ severity: 'critical', title: 'SQL injection' }],
          },
        ],
      }),
    );
    expect(result.entries[0]).toMatchObject({ category: 'pr.findings', needsYou: true });
    expect(result.resolutions).toEqual([
      {
        ids: [],
        entityKey: 'gh:acme/app#412',
        categories: ['pr.findings'],
        status: 'superseded',
        resolvedBy: `${GH}|#412:findings:r2`,
      },
    ]);
  });
});

// ── Deploys of a pull request's head ─────────────────────────

const DEPLOY = 'deploy:github.com|koen|acme/app';
const deployCtx = (overrides = {}) => context({ sourceId: DEPLOY, ...overrides });

function delivery(overrides: Partial<DeliveryObservation> = {}): DeliveryObservation {
  return { owner: 'acme', repo: 'app', heads: [], inclusions: [], ...overrides };
}

const head = (statusId: number, state: string) => ({
  prNumber: 412,
  prTitle: 'Faster login',
  prUrl: 'https://github.com/acme/app/pull/412',
  deploymentId: statusId * 10,
  environment: 'staging-1',
  createdAt: '2026-10-27T09:00:00.000Z',
  status: {
    id: String(statusId),
    state,
    createdAt: '2026-10-27T09:30:00Z',
    logUrl: null,
    environmentUrl: null,
  },
});

describe('a failed deploy of a pull request head', () => {
  const base = () => deriveDelivery(seedContext(), null, delivery()).baseline;
  const failedOnce = () =>
    deriveDelivery(deployCtx(), base(), delivery({ heads: [head(2, 'failure')] }));

  it('needs me only while its pull request is open', () => {
    const failed = failedOnce();
    expect(failed.entries[0]).toMatchObject({ category: 'deploy.pr', needsYou: true });
    const stillOpen = deriveDelivery(deployCtx(), failed.baseline, delivery({ myOpenPrs: [412] }));
    expect(stillOpen.resolutions).toEqual([]);
    const closed = deriveDelivery(deployCtx(), failed.baseline, delivery({ myOpenPrs: [] }));
    expect(closed.resolutions).toEqual([
      {
        ids: [`${DEPLOY}|deployment-status:2`],
        entityKey: null,
        categories: [],
        status: 'resolved',
        resolvedBy: 'no longer open',
      },
    ]);
    expect(
      deriveDelivery(deployCtx(), closed.baseline, delivery({ myOpenPrs: [] })).resolutions,
    ).toEqual([]);
  });

  it('says nothing about open pull requests when the read did not list them', () => {
    const failed = failedOnce();
    expect(deriveDelivery(deployCtx(), failed.baseline, delivery()).resolutions).toEqual([]);
  });

  it('is superseded by the next failure of the same pull request and environment', () => {
    const failed = failedOnce();
    const again = deriveDelivery(
      deployCtx(),
      failed.baseline,
      delivery({ heads: [head(3, 'failure')], myOpenPrs: [412] }),
    );
    expect(again.entries.map((entry) => entry.id)).toEqual([`${DEPLOY}|deployment-status:3`]);
    expect(again.resolutions).toEqual([
      expect.objectContaining({
        ids: [`${DEPLOY}|deployment-status:2`],
        status: 'superseded',
        resolvedBy: `${DEPLOY}|deployment-status:3`,
      }),
    ]);
    expect(again.baseline.failed['head:412:staging-1']).toEqual(['deployment-status:3']);
  });
});
