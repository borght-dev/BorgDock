import type {
  CiClaim,
  CiGroupSummary,
  CiOccurrence,
  CiOccurrenceDetail,
  CiSignalRow,
} from '@/services/ci-failures/types';
import { makeSignal } from './evidence';

/** A group summary with nothing in it, for tests and stories. */
export function makeGroup(overrides: Partial<CiGroupSummary> = {}): CiGroupSummary {
  return {
    id: 'g1',
    scope: 'github.com||acme/app',
    title: 'checkout > pays with card',
    classification: null,
    status: 'active',
    mergedInto: null,
    fixPr: null,
    fixMergedAt: null,
    trackingIssue: null,
    firstObservedAt: '2026-10-26T08:00:00.000Z',
    lastObservedAt: '2026-10-26T10:00:00.000Z',
    revision: 1,
    prNumbers: [],
    defaultBranchRuns: [],
    occurrenceCount: 1,
    runCount: 1,
    passedOnRetry: 0,
    catalogIds: [],
    failedSteps: [],
    workflowNames: [],
    maxTier: 'high',
    candidateCount: 0,
    prJobIds: [],
    claim: null,
    ...overrides,
  };
}

export function makeClaim(overrides: Partial<CiClaim> = {}): CiClaim {
  return {
    id: 'c1',
    groupId: 'g1',
    ownerKind: 'me',
    ownerRef: 'me',
    ownerLabel: null,
    hostId: null,
    claimedAt: '2026-10-26T09:00:00.000Z',
    leaseUntil: null,
    state: 'active',
    note: null,
    revision: 1,
    updatedAt: '2026-10-26T09:00:00.000Z',
    ...overrides,
  };
}

export function makeOccurrence(overrides: Partial<CiOccurrence> = {}): CiOccurrence {
  return {
    id: 'github.com||acme/app#job:1',
    scope: 'github.com||acme/app',
    source: 'pull_request',
    prNumber: 1,
    prHeadSha: 'aaa',
    testedSha: 'aaa',
    headBranch: 'feat/x',
    event: 'pull_request',
    workflowId: 3,
    workflowPath: '.github/workflows/ci.yml',
    workflowName: 'CI',
    runId: 100,
    runAttempt: 1,
    runNumber: 12,
    jobId: 1,
    jobName: 'e2e',
    matrix: [],
    checkSuiteId: 9,
    appSlug: 'github-actions',
    htmlUrl: 'https://github.com/acme/app/actions/runs/100/job/1',
    conclusion: 'failure',
    failedStep: 'Run e2e',
    failedStepNumber: 4,
    runnerName: null,
    runnerGroup: null,
    runnerLabels: [],
    startedAt: null,
    completedAt: '2026-10-26T10:00:00.000Z',
    observedAt: '2026-10-26T10:01:00.000Z',
    evidenceState: 'ready',
    evidenceReason: null,
    bytesRead: 100,
    totalBytes: 100,
    truncated: false,
    evidenceAttempts: 1,
    retryAt: null,
    ...overrides,
  };
}

export function makeSignalRow(overrides: Partial<CiSignalRow> = {}): CiSignalRow {
  return {
    occurrenceId: 'github.com||acme/app#job:1',
    ordinal: 0,
    signal: makeSignal({
      kind: 'test',
      parser: 'playwright',
      testId: 'checkout › pays',
      message: 'Expected 200',
    }),
    fingerprintVersion: 101,
    fingerprint: 'test:playwright:checkout › pays||abc',
    tier: 'high',
    groupId: 'g1',
    ...overrides,
  };
}

export function makeDetail(
  occurrence: Partial<CiOccurrence> = {},
  signals: Partial<CiSignalRow>[] = [{}],
): CiOccurrenceDetail {
  const occ = makeOccurrence(occurrence);
  return {
    occurrence: occ,
    signals: signals.map((s, ordinal) => makeSignalRow({ occurrenceId: occ.id, ordinal, ...s })),
    outcome: null,
  };
}
