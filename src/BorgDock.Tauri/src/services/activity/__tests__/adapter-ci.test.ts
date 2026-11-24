import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeJournal } from './fake-journal';

const mocks = vi.hoisted(() => ({ journal: null as unknown as FakeJournal }));

vi.mock('@/services/activity/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/activity/api')>();
  return {
    ...actual,
    openSource: (request: Parameters<FakeJournal['openSource']>[0]) =>
      mocks.journal.openSource(request),
    commit: (request: Parameters<FakeJournal['commit']>[0]) => mocks.journal.commit(request),
  };
});
vi.mock('@/services/github/login', () => ({ resolvedLogin: () => Promise.resolve('koen') }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => ({ account: '' }) }));

import { makePr } from '@/components/focus/__tests__/helpers';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { usePrStore } from '@/stores/pr-store';
import { ingestCiGroups } from '../adapters/ci';
import { ingestIdle, resetActivityIngest } from '../ingest';

const SCOPE = 'github.com||acme/app';
const CI_SOURCE = 'ci:github.com|koen|acme/app';

function group(overrides: Partial<CiGroupSummary> = {}): CiGroupSummary {
  return {
    id: 'g1',
    scope: SCOPE,
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
    prNumbers: [412],
    defaultBranchRuns: [],
    occurrenceCount: 2,
    runCount: 2,
    passedOnRetry: 0,
    catalogIds: [],
    failedSteps: [],
    workflowNames: [],
    maxTier: 'high',
    candidateCount: 0,
    claim: null,
    ...overrides,
  } as CiGroupSummary;
}

const context = { threshold: 3, ownerStale: () => false };

async function observeCi(groups: CiGroupSummary[], revision: number) {
  ingestCiGroups(groups, revision, [SCOPE], context);
  await vi.waitFor(() => expect(mocks.journal.commits.length).toBeGreaterThan(0));
  await ingestIdle(CI_SOURCE);
}

beforeEach(() => {
  mocks.journal = new FakeJournal();
  resetActivityIngest();
  usePrStore.setState({
    pullRequests: [
      makePr({ number: 412, authorLogin: 'koen', repoOwner: 'acme', repoName: 'app' }),
    ],
  });
});

describe('the CI failures adapter', () => {
  it('still reports a fix merged between two snapshots with a restart in between', async () => {
    await observeCi([group()], 10);
    resetActivityIngest();
    const before = mocks.journal.commits.length;
    ingestCiGroups(
      [group({ fixMergedAt: '2026-10-26T20:00:00.000Z', revision: 4 })],
      11,
      [SCOPE],
      context,
    );
    await vi.waitFor(() => expect(mocks.journal.commits.length).toBe(before + 1));
    expect(mocks.journal.categories()).toEqual(['ci.fix-merged']);
    expect([...mocks.journal.entries.values()][0]?.coverage).toBe('catch-up');
  });
});
