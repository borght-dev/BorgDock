import { commands } from '@/generated/commands';
import {
  type ActionsJob,
  getActionsJob,
  getCheckRunOutput,
  getFailureAnnotations,
  getWorkflowRun,
  type WorkflowRun,
} from '@/services/github/actions';
import type { GitHubClient } from '@/services/github/client';
import { commandData } from '@/services/native-command';
import type { CiJob } from '@/types';
import { jobOccurrenceId, parseMatrix, statusOccurrenceId } from './identity';
import { normalizeText } from './normalize';
import type { CiOccurrence, JobLogEvidence, Signal } from './types';

/** One failed check to read evidence for. */
export interface CollectTarget {
  scope: string;
  owner: string;
  repo: string;
  source: 'pull_request' | 'default_branch';
  prNumber: number | null;
  /** The PR head when the failure was seen; the tested SHA comes from the job. */
  prHeadSha: string | null;
  job: CiJob;
  /** Evidence reads already made for this occurrence, for backoff. */
  attempts: number;
}

export interface CollectLimits {
  maxBytes: number;
  timeoutMs: number;
}

export interface Collected {
  occurrence: CiOccurrence;
  signals: Signal[];
  /** The Actions job, when there was one: callers backfill earlier attempts from it. */
  actionsJob: ActionsJob | null;
  /** Bytes of log read, for the usage counter. */
  logBytes: number;
}

const BACKOFF_MINUTES = [2, 10, 30, 120];

function retryAt(now: Date, attempts: number, retryAfterSecs: number | null): string {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)] ?? 120;
  const seconds = Math.max(retryAfterSecs ?? 0, minutes * 60);
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function emptySignal(kind: Signal['kind'], parser: string, message: string): Signal {
  return {
    kind,
    parser,
    testId: null,
    params: null,
    path: null,
    line: null,
    column: null,
    code: null,
    errorClass: null,
    expected: null,
    actual: null,
    message,
    excerpt: [],
    frames: [],
    repeats: 1,
  };
}

async function sanitize(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  return commandData(commands.ciSanitizeTexts(texts));
}

/**
 * Log signals first; an annotation joins only when the log didn't already
 * report the same message, so `##[error]` lines aren't counted twice.
 */
export function mergeSignals(
  fromLog: readonly Signal[],
  fromAnnotations: readonly Signal[],
): Signal[] {
  const seen = new Set(fromLog.map((s) => normalizeText(s.message)));
  return [...fromLog, ...fromAnnotations.filter((s) => !seen.has(normalizeText(s.message)))];
}

function baseOccurrence(target: CollectTarget, now: Date): CiOccurrence {
  const { job } = target;
  return {
    id:
      job.kind === 'status'
        ? statusOccurrenceId(target.scope, target.prHeadSha ?? '', job.name)
        : jobOccurrenceId(target.scope, job.id),
    scope: target.scope,
    source: target.source,
    prNumber: target.prNumber,
    prHeadSha: target.prHeadSha,
    testedSha: target.prHeadSha ?? '',
    headBranch: null,
    event: job.workflowEvent ?? null,
    workflowId: null,
    workflowPath: null,
    workflowName: job.workflowName ?? null,
    runId: job.runId ?? null,
    runAttempt: null,
    runNumber: job.runNumber ?? null,
    jobId: job.id > 0 ? job.id : null,
    jobName: job.name,
    matrix: parseMatrix(job.name).values,
    checkSuiteId: job.checkSuiteId ?? null,
    appSlug: job.appSlug ?? null,
    htmlUrl: null,
    conclusion: job.conclusion,
    failedStep: null,
    failedStepNumber: null,
    runnerName: null,
    runnerGroup: null,
    runnerLabels: [],
    startedAt: null,
    completedAt: job.completedAt ?? null,
    observedAt: now.toISOString(),
    evidenceState: 'pending',
    evidenceReason: null,
    bytesRead: null,
    totalBytes: null,
    truncated: false,
    evidenceAttempts: target.attempts,
    retryAt: null,
  };
}

/** An occurrence for a failure whose evidence hasn't been read yet. */
export function pendingOccurrence(target: CollectTarget, now = new Date()): CiOccurrence {
  return baseOccurrence(target, now);
}

function withLog(
  occurrence: CiOccurrence,
  evidence: JobLogEvidence,
  annotations: number,
  now: Date,
): CiOccurrence {
  const attempts = occurrence.evidenceAttempts + 1;
  if (evidence.state === 'ready') {
    return {
      ...occurrence,
      evidenceState: 'ready',
      evidenceReason: evidence.reason,
      bytesRead: evidence.bytesRead,
      totalBytes: evidence.totalBytes,
      truncated: evidence.truncated,
      evidenceAttempts: attempts,
      retryAt: null,
    };
  }
  if (evidence.state === 'unavailable') {
    return {
      ...occurrence,
      evidenceState: annotations > 0 ? 'limited' : 'unavailable',
      evidenceReason: evidence.reason,
      evidenceAttempts: attempts,
      retryAt: null,
    };
  }
  return {
    ...occurrence,
    evidenceState: 'failed',
    evidenceReason: evidence.reason,
    evidenceAttempts: attempts,
    retryAt: retryAt(now, occurrence.evidenceAttempts, evidence.retryAfterSecs),
  };
}

async function collectActions(
  client: GitHubClient,
  target: CollectTarget,
  limits: CollectLimits,
  now: Date,
): Promise<Collected> {
  const { owner, repo, job } = target;
  const actionsJob = await getActionsJob(client, owner, repo, job.id);
  const run: WorkflowRun | null = await getWorkflowRun(client, owner, repo, actionsJob.runId).catch(
    () => null,
  );
  const annotations = await getFailureAnnotations(client, owner, repo, job.id).catch(() => []);
  const annotationText = await sanitize(annotations.flatMap((a) => [a.message, a.title ?? '']));
  const annotationSignals = annotations.map((a, i) => {
    const title = annotationText[i * 2 + 1];
    return {
      ...emptySignal('annotation', 'check-annotation', annotationText[i * 2] ?? ''),
      path: a.path,
      line: a.line,
      excerpt: title ? [title] : [],
    };
  });
  const evidence = await client.readJobLog(owner, repo, job.id, {
    ...(actionsJob.failedStep ? { failedStep: actionsJob.failedStep.name } : {}),
    maxBytes: limits.maxBytes,
    timeoutMs: limits.timeoutMs,
  });
  const occurrence: CiOccurrence = {
    ...baseOccurrence(target, now),
    testedSha: actionsJob.headSha,
    headBranch: actionsJob.headBranch,
    event: run?.event ?? target.job.workflowEvent ?? null,
    workflowId: run?.workflowId ?? null,
    workflowPath: run?.path ?? null,
    workflowName: actionsJob.workflowName ?? run?.name ?? target.job.workflowName ?? null,
    runId: actionsJob.runId,
    runAttempt: actionsJob.runAttempt,
    runNumber: run?.runNumber ?? target.job.runNumber ?? null,
    jobName: actionsJob.name,
    matrix: parseMatrix(actionsJob.name).values,
    htmlUrl: actionsJob.htmlUrl,
    conclusion: actionsJob.conclusion ?? target.job.conclusion,
    failedStep: actionsJob.failedStep?.name ?? null,
    failedStepNumber: actionsJob.failedStep?.number ?? null,
    runnerName: actionsJob.runnerName,
    runnerGroup: actionsJob.runnerGroup,
    runnerLabels: actionsJob.labels,
    startedAt: actionsJob.startedAt,
    completedAt: actionsJob.completedAt ?? target.job.completedAt ?? null,
  };
  return {
    occurrence: withLog(occurrence, evidence, annotationSignals.length, now),
    signals: mergeSignals(evidence.signals, annotationSignals),
    actionsJob,
    logBytes: evidence.bytesRead,
  };
}

async function collectCheck(
  client: GitHubClient,
  target: CollectTarget,
  now: Date,
): Promise<Collected> {
  const { owner, repo, job } = target;
  const output = await getCheckRunOutput(client, owner, repo, job.id);
  const annotations = await getFailureAnnotations(client, owner, repo, job.id).catch(() => []);
  const raw = [
    output.title ?? '',
    [output.summary, output.text].filter(Boolean).join('\n'),
    ...annotations.map((a) => a.message),
  ];
  const [title = '', body = '', ...annotationText] = await sanitize(raw);
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);
  const signals: Signal[] = [];
  if (title || lines.length > 0) {
    signals.push({
      ...emptySignal('check-output', 'check-output', title || lines[0] || ''),
      excerpt: lines,
    });
  }
  annotations.forEach((a, i) => {
    signals.push({
      ...emptySignal('annotation', 'check-annotation', annotationText[i] ?? ''),
      path: a.path,
      line: a.line,
    });
  });
  return {
    occurrence: {
      ...baseOccurrence(target, now),
      testedSha: output.headSha || target.prHeadSha || '',
      htmlUrl: output.htmlUrl,
      appSlug: output.appSlug ?? target.job.appSlug ?? null,
      completedAt: output.completedAt ?? target.job.completedAt ?? null,
      evidenceState: signals.length > 0 ? 'ready' : 'unavailable',
      evidenceReason: signals.length > 0 ? null : 'The check reported no details',
      evidenceAttempts: target.attempts + 1,
    },
    signals,
    actionsJob: null,
    logBytes: 0,
  };
}

async function collectStatus(target: CollectTarget, now: Date): Promise<Collected> {
  const [description = ''] = await sanitize([target.job.description ?? '']);
  return {
    occurrence: {
      ...baseOccurrence(target, now),
      evidenceState: 'limited',
      evidenceReason: 'Commit statuses only carry a description',
      evidenceAttempts: target.attempts + 1,
    },
    signals: description ? [emptySignal('check-output', 'check-output', description)] : [],
    actionsJob: null,
    logBytes: 0,
  };
}

/**
 * Reads the evidence for one failed check: for a GitHub Actions job its
 * metadata, workflow run, failure annotations and the tail of its log; for
 * another app's check its output and annotations; for a commit status its
 * description. Everything is sanitized before it is returned.
 */
export async function collectEvidence(
  client: GitHubClient,
  target: CollectTarget,
  limits: CollectLimits,
  now = new Date(),
): Promise<Collected> {
  switch (target.job.kind) {
    case 'actions':
      return collectActions(client, target, limits, now);
    case 'check':
      return collectCheck(client, target, now);
    default:
      return collectStatus(target, now);
  }
}

/** When a failed read should be tried again, for occurrences the API itself refused. */
export function failedOccurrence(
  occurrence: CiOccurrence,
  reason: string,
  now = new Date(),
): CiOccurrence {
  return {
    ...occurrence,
    evidenceState: 'failed',
    evidenceReason: reason,
    evidenceAttempts: occurrence.evidenceAttempts + 1,
    retryAt: retryAt(now, occurrence.evidenceAttempts, null),
  };
}
