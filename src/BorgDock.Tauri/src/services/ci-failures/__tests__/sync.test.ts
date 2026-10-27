import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  loadGroup: vi.fn(),
  knownOccurrences: vi.fn(),
  record: vi.fn(),
  loadScope: vi.fn(),
  usage: vi.fn(),
  countUsage: vi.fn(),
  branchWatch: vi.fn(),
  setBranchWatch: vi.fn(),
  retention: vi.fn(),
}));
vi.mock('@/services/ci-failures/store-api', () => store);
vi.mock('@/generated/commands', () => ({ commands: {} }));
vi.mock('@/services/github/actions', () => ({
  getRunAttemptJobs: vi.fn(async () => []),
  listBranchPushRuns: vi.fn(),
}));
vi.mock('@/services/github/repo', () => ({ getRepoDefaultBranch: vi.fn() }));

import type { CiRecordBatch } from '@/services/ci-failures/types';
import type { GitHubClient } from '@/services/github/client';
import type { CiJob, PullRequestWithChecks } from '@/types';
import { makeEvidence, makeSignal } from '../__fixtures__/evidence';
import { makeDetail } from '../__fixtures__/store';
import type { Collected, CollectTarget } from '../collect';
import { pendingOccurrence } from '../collect';
import { FINGERPRINT_VERSION } from '../fingerprint';
import { DEFAULT_CI_FAILURE_SETTINGS } from '../settings';
import { CiFailureSync, type RepoContext } from '../sync';

const client = {
  getRateLimit: () => ({ remaining: 4000, total: 5000, reset: null }),
} as unknown as GitHubClient;
const context: RepoContext = {
  owner: 'acme',
  repo: 'app',
  account: '',
  scope: 'github.com||acme/app',
  client,
};

function pr(number: number, ciJobs: CiJob[], headSha = `sha${number}`): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      repoOwner: 'acme',
      repoName: 'app',
      headSha,
      authorLogin: 'me',
      requestedReviewers: [],
    },
    ciJobs,
  } as unknown as PullRequestWithChecks;
}

const failed = (id: number, name = 'e2e', runId = 70): CiJob => ({
  id,
  kind: 'actions',
  name,
  runId,
  conclusion: 'failure',
});

function collected(target: CollectTarget, message = 'expected 200 to be 503'): Collected {
  return {
    occurrence: {
      ...pendingOccurrence(target),
      evidenceState: 'ready',
      evidenceAttempts: 1,
      failedStep: 'Run e2e',
      workflowPath: 'ci.yml',
    },
    signals: [makeSignal({ kind: 'test', parser: 'vitest', testId: 'checkout > pays', message })],
    actionsJob: null,
    logBytes: 1234,
  };
}

async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function batches(): CiRecordBatch[] {
  return store.record.mock.calls.map(([batch]) => batch as CiRecordBatch);
}

describe('CiFailureSync', () => {
  let settings = { ...DEFAULT_CI_FAILURE_SETTINGS };
  const collect = vi.fn(async (_client: GitHubClient, target: CollectTarget) => collected(target));
  const make = () =>
    new CiFailureSync(
      () => [context],
      () => settings,
      () => 'me',
      {
        collect: collect as never,
        now: () => new Date('2026-10-26T12:00:00.000Z'),
      },
    );

  beforeEach(() => {
    settings = { ...DEFAULT_CI_FAILURE_SETTINGS };
    for (const fn of Object.values(store)) fn.mockReset();
    store.knownOccurrences.mockResolvedValue([]);
    store.record.mockResolvedValue(1);
    store.loadScope.mockResolvedValue({ index: [], links: [], groups: [] });
    store.usage.mockResolvedValue({ reads: 0, logBytes: 0, skipped: 0 });
    store.countUsage.mockResolvedValue(undefined);
    collect.mockClear();
  });

  it('records a new failure as pending, reads its evidence once, and groups it', async () => {
    const sync = make();
    await sync.observe([pr(1, [failed(7)])]);
    await settle();
    const [pending, recorded] = batches();
    expect(pending?.occurrences.map((o) => [o.id, o.evidenceState])).toEqual([
      ['github.com||acme/app#job:7', 'pending'],
    ]);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(recorded?.signals).toHaveLength(1);
    expect(recorded?.newGroups).toHaveLength(1);
    expect(recorded?.mappings[0]?.groupId).toBe(recorded?.newGroups[0]?.id);
    expect(store.countUsage).toHaveBeenCalledWith('2026-10-26', '', 1, 1234, 0);

    await sync.observe([pr(1, [failed(7)])]);
    await settle();
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('puts the same failure on another PR in the same group', async () => {
    const sync = make();
    await sync.observe([pr(1, [failed(7)]), pr(2, [failed(8, 'e2e', 80)])]);
    await settle();
    const recorded = batches().filter((b) => b.signals.length > 0);
    expect(recorded).toHaveLength(2);
    const groups = recorded.flatMap((b) => b.newGroups);
    expect(groups).toHaveLength(1);
    expect(recorded[1]?.mappings).toEqual([]);
  });

  it('notes a passing retry in the same run, and a pass after a push', async () => {
    store.knownOccurrences.mockResolvedValue([
      {
        id: 'github.com||acme/app#job:7',
        evidenceState: 'ready',
        evidenceAttempts: 1,
        retryAt: null,
        conclusion: 'failure',
        prNumber: 1,
        runId: 70,
        jobName: 'e2e',
        testedSha: 'sha1',
        observedAt: '',
        outcome: null,
      },
      {
        id: 'github.com||acme/app#job:5',
        evidenceState: 'ready',
        evidenceAttempts: 1,
        retryAt: null,
        conclusion: 'failure',
        prNumber: 2,
        runId: 50,
        jobName: 'build (18.x)',
        testedSha: 'old',
        observedAt: '',
        outcome: null,
      },
    ]);
    const sync = make();
    await sync.observe([
      pr(1, [{ id: 9, kind: 'actions', name: 'e2e', runId: 70, conclusion: 'success' }]),
      pr(
        2,
        [{ id: 10, kind: 'actions', name: 'build (18.x)', runId: 60, conclusion: 'success' }],
        'new',
      ),
    ]);
    await settle();
    expect(batches()[0]?.outcomes.map((o) => [o.occurrenceId, o.kind])).toEqual([
      ['github.com||acme/app#job:7', 'passed_on_retry'],
      ['github.com||acme/app#job:5', 'passed_after_push'],
    ]);
  });

  it('keeps the tested commit after a failed read, so a pass on that commit is no push', async () => {
    collect.mockRejectedValueOnce(new Error('socket hang up'));
    const sync = make();
    await sync.observe([pr(1, [failed(7)])]);
    await settle();
    await sync.observe([
      pr(1, [{ id: 9, kind: 'actions', name: 'e2e', runId: 71, conclusion: 'success' }]),
    ]);
    await settle();
    expect(batches().flatMap((b) => b.outcomes)).toEqual([]);
  });

  it('matches a pass by the full job name, matrix values included', async () => {
    store.knownOccurrences.mockResolvedValue([
      {
        id: 'github.com||acme/app#job:7',
        evidenceState: 'ready',
        evidenceAttempts: 1,
        retryAt: null,
        conclusion: 'failure',
        prNumber: 1,
        runId: 70,
        jobName: 'test (windows)',
        testedSha: 'sha1',
        observedAt: '',
        outcome: null,
      },
    ]);
    const sync = make();
    await sync.observe([
      pr(1, [{ id: 8, kind: 'actions', name: 'test (linux)', runId: 70, conclusion: 'success' }]),
    ]);
    await settle();
    expect(batches().flatMap((b) => b.outcomes)).toEqual([]);
  });

  it('reads failed reads again during polling once their retry time passed', async () => {
    const known = (job: number, prNumber: number | null, retryAt: string) => ({
      id: `github.com||acme/app#job:${job}`,
      evidenceState: 'failed',
      evidenceAttempts: 1,
      retryAt,
      conclusion: 'failure',
      prNumber,
      runId: 70,
      jobName: 'e2e',
      testedSha: 'sha1',
      observedAt: '',
      outcome: null,
    });
    store.knownOccurrences.mockResolvedValue([
      known(7, 1, '2026-10-26T13:00:00.000Z'),
      known(8, null, '2026-10-26T13:00:00.000Z'),
    ]);
    await make().observe([pr(1, [failed(7)])]);
    await settle();
    expect(collect).not.toHaveBeenCalled();

    // A PR job and a default-branch job the branch watch has already moved past.
    store.knownOccurrences.mockResolvedValue([
      known(7, 1, '2026-10-26T11:00:00.000Z'),
      known(8, null, '2026-10-26T11:00:00.000Z'),
    ]);
    await make().observe([pr(1, [failed(7)])]);
    await settle();
    expect(collect.mock.calls.map(([, target]) => [target.job.id, target.attempts])).toEqual([
      [7, 1],
      [8, 1],
    ]);
  });

  it('reads on when the rate limit snapshot is from a window that already reset', async () => {
    const stale = {
      getRateLimit: () => ({
        remaining: 10,
        total: 5000,
        reset: new Date('2026-10-26T11:00:00.000Z'),
      }),
    } as unknown as GitHubClient;
    const sync = new CiFailureSync(
      () => [{ ...context, client: stale }],
      () => settings,
      () => 'me',
      { collect: collect as never, now: () => new Date('2026-10-26T12:00:00.000Z') },
    );
    await sync.observe([pr(1, [failed(7)])]);
    await settle();
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('stops at the daily limit and counts what it skipped', async () => {
    settings = { ...settings, dailyEvidenceLimit: 2 };
    store.usage.mockResolvedValue({ reads: 2, logBytes: 0, skipped: 0 });
    const sync = make();
    await sync.observe([pr(1, [failed(7)])]);
    await settle();
    expect(collect).not.toHaveBeenCalled();
    expect(store.countUsage).toHaveBeenCalledWith('2026-10-26', '', 0, 0, 1);
  });

  it('records nothing after stop, even for reads already under way', async () => {
    let release: () => void = () => {};
    collect.mockImplementationOnce(
      (_c, target) =>
        new Promise<Collected>((resolve) => {
          release = () => resolve(collected(target));
        }),
    );
    const sync = make();
    await sync.observe([pr(1, [failed(7)])]);
    await settle();
    sync.stop();
    release();
    await settle();
    expect(batches().filter((b) => b.signals.length > 0)).toEqual([]);
  });

  it('collects nothing while collection is off', async () => {
    settings = { ...settings, enabled: false };
    await make().observe([pr(1, [failed(7)])]);
    await settle();
    expect(store.record).not.toHaveBeenCalled();
  });

  it('marks a 404 job unavailable instead of retrying it', async () => {
    const { GitHubApiError } = await import('@/services/github/client');
    collect.mockRejectedValueOnce(new GitHubApiError('Not Found', 404));
    await make().observe([pr(1, [failed(7)])]);
    await settle();
    const recorded = batches()[1]?.occurrences[0];
    expect([recorded?.evidenceState, recorded?.retryAt]).toEqual(['unavailable', null]);
    // Blank, so the store keeps the tested commit an earlier read found.
    expect(recorded?.testedSha).toBe('');
    expect(makeEvidence().state).toBe('ready');
  });

  it('re-fingerprints stored signals after a rules change and keeps their group', async () => {
    const old = makeDetail(
      { id: 'github.com||acme/app#job:5', scope: context.scope, jobName: 'e2e', runId: 50 },
      [{ groupId: 'owned-group', fingerprintVersion: 1, fingerprint: 'old:fp' }],
    );
    store.loadScope.mockResolvedValueOnce({
      index: [
        {
          scope: context.scope,
          version: 1,
          fingerprint: 'old:fp',
          groupId: 'owned-group',
          facets: {},
          firstSeenAt: '',
        },
      ],
      links: [],
      groups: [],
    });
    store.loadGroup.mockResolvedValueOnce({
      summary: {},
      occurrences: [old],
      candidates: [],
      decisions: [],
      claimEvents: [],
    });
    await make().upgradeFingerprints();
    const [batch] = batches();
    expect(batch?.replaceSignalsFor).toEqual(['github.com||acme/app#job:5']);
    expect(batch?.signals[0]?.fingerprintVersion).toBe(FINGERPRINT_VERSION);
    expect(batch?.newGroups).toEqual([]);
    expect(batch?.mappings.map((m) => [m.version, m.groupId])).toEqual([
      [FINGERPRINT_VERSION, 'owned-group'],
    ]);
  });

  it('leaves current fingerprints alone', async () => {
    store.loadScope.mockResolvedValueOnce({
      index: [
        {
          scope: context.scope,
          version: FINGERPRINT_VERSION,
          fingerprint: 'fp',
          groupId: 'g',
          facets: {},
          firstSeenAt: '',
        },
      ],
      links: [],
      groups: [],
    });
    await make().upgradeFingerprints();
    expect(store.loadGroup).not.toHaveBeenCalled();
    expect(store.record).not.toHaveBeenCalled();
  });
});
