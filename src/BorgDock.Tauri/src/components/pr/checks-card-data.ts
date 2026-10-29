import type { CiOccurrenceDetail, CiPrFailures, Signal } from '@/services/ci-failures/types';
import type { CiJob, PullRequestWithChecks } from '@/types';
import { formatDuration } from '@/utils/relative-time';

/**
 * What the checks hover card shows for a PR's head commit: the failing
 * checks with why they failed, then the running, passed and skipped ones.
 * Names come from the poll (`ciJobs`, the failed and pending names); the
 * reasons from the CI failure store's signals for each failed job. Pure.
 */

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
const PASSED = new Set(['success']);
const SKIPPED = new Set(['skipped', 'neutral', 'cancelled']);

/** Where the reason of a failed check stands. */
export type ReasonState =
  /** Signals read: `first` is the failure to show. */
  | 'ready'
  /** The job's log is being read (or about to be). */
  | 'reading'
  /** The log can't be read or held nothing recognisable. */
  | 'unavailable'
  /** Related CI failures are off, so no log was read. */
  | 'off';

export interface FailingCheck {
  key: string;
  name: string;
  /** The job id for an Actions job; 0 for other checks. */
  jobId: number;
  workflow: string | null;
  duration: string;
  step: string | null;
  /** The test runner's totals ("3 failed, 412 passed"). */
  totals: string | null;
  reason: ReasonState;
  /** Why the log can't be read, when it says. */
  reasonText: string | null;
  first: Signal | null;
  /** The other failures, named briefly. */
  more: string[];
  /** Ids of the CI failure groups this check's failures belong to. */
  groupIds: string[];
  /** The job's page on GitHub. */
  url: string | null;
}

export interface ChecksCardData {
  counts: { fail: number; run: number; ok: number; skip: number };
  failing: FailingCheck[];
  running: string[];
  passed: string[];
  skipped: string[];
  /** When the newest completed check finished. */
  finishedAt: string | null;
}

const MORE_LENGTH = 60;

function clipped(text: string): string {
  const line = text.split('\n')[0]!.trim();
  return line.length > MORE_LENGTH ? `${line.slice(0, MORE_LENGTH - 1)}…` : line;
}

/** A failure in a few words: its test, else where it is, else what it says. */
export function signalName(signal: Signal): string {
  if (signal.testId) return clipped(signal.testId);
  if (signal.path) return `${signal.path}${signal.line ? `:${signal.line}` : ''}`;
  return clipped(signal.message);
}

/** The occurrence recorded for a failed job: by job id, or by name on the head commit. */
function occurrenceOf(
  job: Pick<CiJob, 'id' | 'name'>,
  failures: CiPrFailures | null,
  headSha: string,
): CiOccurrenceDetail | undefined {
  const occurrences = failures?.occurrences ?? [];
  if (job.id > 0) return occurrences.find((o) => o.occurrence.jobId === job.id);
  return occurrences.find(
    (o) => o.occurrence.jobName === job.name && (!headSha || o.occurrence.testedSha === headSha),
  );
}

function reasonOf(detail: CiOccurrenceDetail | undefined, collecting: boolean): ReasonState {
  if (!collecting) return 'off';
  if (!detail) return 'reading';
  const state = detail.occurrence.evidenceState;
  if (state === 'pending') return 'reading';
  if (state === 'failed' || state === 'unavailable') return 'unavailable';
  return 'ready';
}

/** An Actions job's page, from its run; null for other checks. */
function jobUrl(job: Pick<CiJob, 'id' | 'runId'>, pr: PullRequestWithChecks): string | null {
  if (!job.runId || job.id <= 0) return null;
  const { repoOwner, repoName } = pr.pullRequest;
  return `https://github.com/${repoOwner}/${repoName}/actions/runs/${job.runId}/job/${job.id}`;
}

function failingCheck(
  job: Pick<CiJob, 'id' | 'name' | 'workflowName' | 'runId'>,
  pr: PullRequestWithChecks,
  failures: CiPrFailures | null,
  collecting: boolean,
): FailingCheck {
  const headSha = pr.pullRequest.headSha ?? '';
  const detail = occurrenceOf(job, failures, headSha);
  const rows = detail?.signals ?? [];
  const failuresFound = rows.filter((row) => row.signal.kind !== 'summary');
  const totals = rows.find((row) => row.signal.kind === 'summary')?.signal.message ?? null;
  const reason = reasonOf(detail, collecting);
  const first = failuresFound[0]?.signal ?? null;
  const occurrence = detail?.occurrence;
  return {
    key: job.id > 0 ? String(job.id) : `name:${job.name}`,
    name: job.name,
    jobId: job.id,
    workflow: job.workflowName ?? occurrence?.workflowName ?? null,
    duration: formatDuration(occurrence?.startedAt, occurrence?.completedAt),
    step: occurrence?.failedStep ?? null,
    totals,
    reason: reason === 'ready' && !first ? 'unavailable' : reason,
    reasonText: occurrence?.evidenceReason ?? null,
    first,
    more: failuresFound.slice(1).map((row) => signalName(row.signal)),
    groupIds: [...new Set(rows.map((row) => row.groupId).filter((id): id is string => !!id))],
    url: occurrence?.htmlUrl ?? jobUrl(job, pr),
  };
}

export function checksCardData(
  pr: PullRequestWithChecks,
  failures: CiPrFailures | null,
  collecting: boolean,
): ChecksCardData {
  const jobs = pr.ciJobs ?? [];
  const failedJobs = jobs.filter((job) => FAILED.has(job.conclusion));
  // A failed check the completed jobs don't carry (a source without them) is named only.
  const unlisted = pr.failedCheckNames
    .filter((name) => !failedJobs.some((job) => job.name === name))
    .map((name) => ({ id: 0, name }));
  return {
    counts: {
      fail: pr.failedCheckNames.length,
      run: pr.pendingCheckNames.length,
      ok: pr.passedCount,
      skip: pr.skippedCount,
    },
    failing: [...failedJobs, ...unlisted].map((job) => failingCheck(job, pr, failures, collecting)),
    running: pr.pendingCheckNames,
    passed: jobs.filter((job) => PASSED.has(job.conclusion)).map((job) => job.name),
    skipped: jobs.filter((job) => SKIPPED.has(job.conclusion)).map((job) => job.name),
    finishedAt:
      jobs
        .map((job) => job.completedAt ?? '')
        .sort()
        .at(-1) || null,
  };
}
