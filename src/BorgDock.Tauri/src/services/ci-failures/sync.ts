import { getRunAttemptJobs, listBranchPushRuns } from '@/services/github/actions';
import { GitHubApiError, type GitHubClient } from '@/services/github/client';
import { getRepoDefaultBranch } from '@/services/github/repo';
import { createLogger } from '@/services/logger';
import type { CiFailureSettings, CiJob, PullRequestWithChecks } from '@/types';
import {
  assign,
  type CandidateLink,
  type IncomingSignal,
  type IndexedFingerprint,
  type LinkDecision,
} from './assign';
import {
  type Collected,
  type CollectLimits,
  type CollectTarget,
  collectEvidence,
  pendingOccurrence,
} from './collect';
import { candidateReasons, type Facets, FINGERPRINT_VERSION, fingerprintOf } from './fingerprint';
import { GITHUB_HOST, sameAccount, scopeOf } from './identity';
import * as store from './store-api';
import type {
  CiBranchWatch,
  CiDecision,
  CiFingerprintRow,
  CiKnownOccurrence,
  CiOccurrence,
  CiOutcome,
  CiRecordBatch,
  CiSignalRow,
  Signal,
} from './types';

const log = createLogger('ci-failures');

/** Conclusions that make a check an occurrence. */
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
/** Evidence reads in flight per account; logs hold a request slot for the whole body. */
const READS_PER_ACCOUNT = 2;
/** Failed reads are retried this often at most. */
const MAX_EVIDENCE_ATTEMPTS = 5;
/** Default-branch runs older than this are history, not news. */
const DEFAULT_BRANCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/** Pause evidence reads when less than this share of the REST quota is left. */
const RATE_FLOOR = 0.1;

export interface RepoContext {
  owner: string;
  repo: string;
  account: string;
  scope: string;
  client: GitHubClient;
}

/** Your PRs first, then PRs that wait on your review, then everyone else, then the default branch. */
export type Priority = 0 | 1 | 2 | 3;

interface QueueItem {
  target: CollectTarget;
  context: RepoContext;
  priority: Priority;
  /** Newest failures first inside a priority band. */
  completedAt: string;
}

export interface CiSyncDeps {
  collect: typeof collectEvidence;
  now: () => Date;
}

const defaultDeps: CiSyncDeps = { collect: collectEvidence, now: () => new Date() };

function jobIdOf(occurrenceId: string): number | null {
  const match = /#job:(\d+)$/.exec(occurrenceId);
  return match ? Number(match[1]) : null;
}

/** Still waiting for its evidence: never read, or a failed read whose retry time passed. */
function isDue(entry: CiKnownOccurrence, now: string): boolean {
  return (
    entry.evidenceState === 'pending' ||
    (entry.evidenceState === 'failed' &&
      entry.evidenceAttempts < MAX_EVIDENCE_ATTEMPTS &&
      (entry.retryAt ?? '') <= now)
  );
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Turns accepted poll results into recorded occurrences, reads their evidence
 * within the per-account budget, fingerprints and groups it, and watches the
 * default branch. One instance per runtime generation; `stop` drops all work
 * still queued and every reply that arrives after it.
 */
export class CiFailureSync {
  private stopped = false;
  private readonly known = new Map<string, Map<string, CiKnownOccurrence>>();
  private readonly snapshots = new Map<
    string,
    { index: IndexedFingerprint[]; links: LinkDecision[] }
  >();
  private readonly queue: QueueItem[] = [];
  private readonly queued = new Set<string>();
  private readonly inFlight = new Map<string, number>();
  private readonly usage = new Map<string, { day: string; reads: number; skipped: Set<string> }>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private pausedUntil = 0;
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly contexts: () => RepoContext[],
    private readonly settings: () => CiFailureSettings,
    private readonly username: () => string,
    private readonly deps: CiSyncDeps = defaultDeps,
  ) {}

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    clearTimeout(this.resumeTimer);
  }

  /** Work still waiting for a read slot or the daily limit, for the Settings usage line. */
  get pending(): number {
    return this.queue.length;
  }

  /** Runs `task` after every earlier task for the same scope, so assignments see each other's groups. */
  private serialized<T>(scope: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(scope) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.locks.set(
      scope,
      next.catch(() => undefined),
    );
    return next;
  }

  private async knownFor(scope: string): Promise<Map<string, CiKnownOccurrence>> {
    const cached = this.known.get(scope);
    if (cached) return cached;
    const since = new Date(
      this.deps.now().getTime() - this.settings().retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const rows = await store.knownOccurrences(scope, since);
    const map = new Map(rows.map((row) => [row.id, row]));
    this.known.set(scope, map);
    return map;
  }

  private remember(occurrence: CiOccurrence): void {
    const known = this.known.get(occurrence.scope);
    if (!known) return;
    const previous = known.get(occurrence.id);
    known.set(occurrence.id, {
      id: occurrence.id,
      evidenceState: occurrence.evidenceState,
      evidenceAttempts: occurrence.evidenceAttempts,
      retryAt: occurrence.retryAt,
      conclusion: occurrence.conclusion,
      prNumber: occurrence.prNumber,
      runId: occurrence.runId,
      jobName: occurrence.jobName,
      // Like the store: a failed read's blank tested commit keeps the known one.
      testedSha: occurrence.testedSha || previous?.testedSha || '',
      observedAt: previous?.observedAt ?? occurrence.observedAt,
      outcome: previous?.outcome ?? null,
    });
  }

  private async snapshotFor(scope: string) {
    const cached = this.snapshots.get(scope);
    if (cached) return cached;
    const snapshot = await store.loadScope([scope]);
    const value = {
      // Mappings of an older rules version never stand in for the current one.
      index: snapshot.index
        .filter((row) => row.version === FINGERPRINT_VERSION)
        .map((row) => ({
          fingerprint: row.fingerprint,
          groupId: row.groupId,
          facets: row.facets as unknown as Facets,
        })),
      links: snapshot.links.map((d: CiDecision) => ({
        fingerprintA: d.fingerprintA,
        fingerprintB: d.fingerprintB,
      })),
    };
    this.snapshots.set(scope, value);
    return value;
  }

  private priorityOf(pr: PullRequestWithChecks): Priority {
    const me = this.username().toLowerCase();
    const p = pr.pullRequest;
    if (me && p.authorLogin.toLowerCase() === me) return 0;
    if (me && (p.requestedReviewers ?? []).some((r) => r.toLowerCase() === me)) return 1;
    return 2;
  }

  private enqueue(item: QueueItem): void {
    const id = pendingOccurrence(item.target).id;
    if (this.queued.has(id)) return;
    this.queued.add(id);
    this.queue.push(item);
    this.queue.sort(
      (a, b) => a.priority - b.priority || b.completedAt.localeCompare(a.completedAt),
    );
  }

  /**
   * Records the failed checks of an accepted poll that the store doesn't know
   * yet, queues their evidence, and notes passing retries and pushes.
   */
  async observe(prs: readonly PullRequestWithChecks[]): Promise<void> {
    if (this.stopped || !this.settings().enabled) return;
    for (const context of this.contexts()) {
      const repoPrs = prs.filter(
        (pr) =>
          pr.ciJobs !== undefined &&
          pr.pullRequest.repoOwner.toLowerCase() === context.owner.toLowerCase() &&
          pr.pullRequest.repoName.toLowerCase() === context.repo.toLowerCase(),
      );
      if (repoPrs.length === 0) continue;
      await this.serialized(context.scope, () => this.observeRepo(context, repoPrs)).catch(
        (error) =>
          log.warn('observing CI failures failed', { scope: context.scope, error: String(error) }),
      );
    }
    await this.requeueDue();
  }

  private async observeRepo(
    context: RepoContext,
    prs: readonly PullRequestWithChecks[],
  ): Promise<void> {
    const known = await this.knownFor(context.scope);
    if (this.stopped) return;
    const now = this.deps.now();
    const fresh: CiOccurrence[] = [];
    const outcomes: CiOutcome[] = [];
    const statuses: CollectTarget[] = [];
    for (const pr of prs) {
      const p = pr.pullRequest;
      for (const job of pr.ciJobs ?? []) {
        const target: CollectTarget = {
          scope: context.scope,
          owner: context.owner,
          repo: context.repo,
          source: 'pull_request',
          prNumber: p.number,
          prHeadSha: p.headSha ?? null,
          job,
          attempts: 0,
        };
        if (FAILED.has(job.conclusion)) {
          const occurrence = pendingOccurrence(target, now);
          if (known.has(occurrence.id)) continue;
          if (job.kind === 'status') statuses.push(target);
          else {
            fresh.push(occurrence);
            this.enqueue({
              target,
              context,
              priority: this.priorityOf(pr),
              completedAt: job.completedAt ?? now.toISOString(),
            });
          }
        } else if (job.conclusion === 'success' && job.kind === 'actions') {
          outcomes.push(...this.passesFor(known, p.number, p.headSha ?? null, job, now));
        }
      }
    }
    if (fresh.length > 0 || outcomes.length > 0) {
      await store.record({ ...emptyBatch(), occurrences: fresh, outcomes });
      for (const occurrence of fresh) this.remember(occurrence);
      for (const outcome of outcomes) {
        const entry = known.get(outcome.occurrenceId);
        if (entry) known.set(outcome.occurrenceId, { ...entry, outcome: outcome.kind });
      }
    }
    for (const target of statuses) {
      const collected = await this.deps.collect(context.client, target, this.limits(), now);
      await this.recordCollected(context, target, collected);
    }
  }

  /** A pass of a job that failed earlier: on retry in the same run, or after a push. */
  private passesFor(
    known: Map<string, CiKnownOccurrence>,
    prNumber: number,
    headSha: string | null,
    job: CiJob,
    now: Date,
  ): CiOutcome[] {
    const outcomes: CiOutcome[] = [];
    for (const entry of known.values()) {
      if (entry.prNumber !== prNumber || entry.outcome || !FAILED.has(entry.conclusion)) continue;
      // The full name: `test (linux)` passing says nothing about `test (windows)`.
      if (entry.jobName !== job.name) continue;
      const sameRun = entry.runId !== null && entry.runId === job.runId;
      if (sameRun && jobIdOf(entry.id) !== job.id) {
        outcomes.push({
          occurrenceId: entry.id,
          kind: 'passed_on_retry',
          byJobId: job.id,
          observedAt: now.toISOString(),
        });
      } else if (!sameRun && headSha && entry.testedSha !== headSha) {
        outcomes.push({
          occurrenceId: entry.id,
          kind: 'passed_after_push',
          byJobId: job.id,
          observedAt: now.toISOString(),
        });
      }
    }
    return outcomes;
  }

  /** Queues failed occurrences left from an earlier session or due for another read. */
  async resume(): Promise<void> {
    await this.upgradeFingerprints();
    await this.requeueDue();
  }

  /**
   * Queues every stored occurrence still waiting for its evidence: a failed
   * read whose retry time passed, or one the daily limit held back. Runs on
   * every poll, so default-branch jobs the branch watch has moved past retry too.
   */
  private async requeueDue(): Promise<void> {
    if (this.stopped || !this.settings().enabled) return;
    for (const context of this.contexts()) {
      const known = await this.knownFor(context.scope).catch(
        () => new Map<string, CiKnownOccurrence>(),
      );
      const now = this.deps.now().toISOString();
      for (const entry of known.values()) {
        const jobId = jobIdOf(entry.id);
        if (!isDue(entry, now) || jobId === null) continue;
        this.enqueue({
          target: {
            scope: context.scope,
            owner: context.owner,
            repo: context.repo,
            source: entry.prNumber === null ? 'default_branch' : 'pull_request',
            prNumber: entry.prNumber,
            prHeadSha: entry.testedSha || null,
            job: {
              id: jobId,
              kind: entry.runId !== null ? 'actions' : 'check',
              name: entry.jobName,
              ...(entry.runId !== null ? { runId: entry.runId } : {}),
              conclusion: entry.conclusion,
            },
            attempts: entry.evidenceAttempts,
          },
          context,
          priority: entry.prNumber === null ? 3 : 2,
          completedAt: entry.observedAt,
        });
      }
    }
    this.pump();
  }

  private limits(): CollectLimits {
    const settings = this.settings();
    return {
      maxBytes: Math.max(1, settings.maxLogMib) * 1024 * 1024,
      timeoutMs: Math.max(1, settings.logTimeoutSeconds) * 1000,
    };
  }

  private async usageFor(account: string) {
    const today = day(this.deps.now());
    const current = this.usage.get(account);
    if (current?.day === today) return current;
    const stored = await store.usage(today, account).catch(() => null);
    const fresh = { day: today, reads: stored?.reads ?? 0, skipped: new Set<string>() };
    this.usage.set(account, fresh);
    return fresh;
  }

  private rateLimited(client: GitHubClient): boolean {
    const limit = client.getRateLimit();
    if (limit.remaining < 0 || limit.total <= 0 || limit.remaining >= limit.total * RATE_FLOOR) {
      return false;
    }
    const now = this.deps.now().getTime();
    const reset = limit.reset?.getTime() ?? now + 60_000;
    // The window already reset; the next request refreshes the snapshot.
    if (reset <= now) return false;
    this.pausedUntil = Math.max(this.pausedUntil, reset);
    return true;
  }

  /** Starts queued reads while slots, the daily limit and the rate limit allow. */
  pump(): void {
    if (this.stopped || !this.settings().enabled) return;
    const now = this.deps.now().getTime();
    if (now < this.pausedUntil) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = setTimeout(() => this.pump(), this.pausedUntil - now);
      return;
    }
    for (const item of [...this.queue]) {
      const account = item.context.account;
      if ((this.inFlight.get(account) ?? 0) >= READS_PER_ACCOUNT) continue;
      if (this.rateLimited(item.context.client)) {
        this.pump();
        return;
      }
      this.queue.splice(this.queue.indexOf(item), 1);
      this.inFlight.set(account, (this.inFlight.get(account) ?? 0) + 1);
      void this.process(item).finally(() => {
        this.inFlight.set(account, (this.inFlight.get(account) ?? 1) - 1);
        this.queued.delete(pendingOccurrence(item.target).id);
        this.pump();
      });
    }
  }

  private async process(item: QueueItem): Promise<void> {
    const { context, target } = item;
    const usage = await this.usageFor(context.account);
    const id = pendingOccurrence(target).id;
    if (usage.reads >= this.settings().dailyEvidenceLimit) {
      if (!usage.skipped.has(id)) {
        usage.skipped.add(id);
        await store.countUsage(usage.day, context.account, 0, 0, 1).catch(() => undefined);
      }
      return;
    }
    let collected: Collected;
    try {
      collected = await this.deps.collect(context.client, target, this.limits(), this.deps.now());
    } catch (error) {
      if (this.stopped) return;
      collected = failedCollect(target, error, this.deps.now());
    }
    if (this.stopped) return;
    usage.reads += 1;
    await store
      .countUsage(usage.day, context.account, 1, collected.logBytes, 0)
      .catch(() => undefined);
    await this.serialized(context.scope, () => this.recordCollected(context, target, collected));
    if (collected.actionsJob && collected.actionsJob.runAttempt > 1) {
      await this.backfill(context, target, collected).catch((error) =>
        log.debug('backfilling earlier attempts failed', { error: String(error) }),
      );
    }
  }

  private async recordCollected(
    context: RepoContext,
    _target: CollectTarget,
    collected: Collected,
  ) {
    await this.recordSignals(context, collected.occurrence, collected.signals, []);
  }

  /**
   * Fingerprints `signals`, puts them in groups and records them with their
   * occurrence. `previousGroups[i]` is the group signal `i` belonged to under
   * an older rules version, so a re-fingerprinted failure keeps its group.
   */
  private async recordSignals(
    context: RepoContext,
    occurrence: CiOccurrence,
    signalsIn: readonly Signal[],
    previousGroups: readonly (string | null)[],
  ) {
    if (this.stopped) return;
    const snapshot = await this.snapshotFor(context.scope);
    const fingerprintContext = {
      failedStep: occurrence.failedStep,
      workflowPath: occurrence.workflowPath ?? occurrence.workflowName,
      conclusion: occurrence.conclusion,
      appSlug: occurrence.appSlug,
      checkName: occurrence.runId === null ? occurrence.jobName : null,
    };
    const fingerprints = signalsIn.map((signal) => fingerprintOf(signal, fingerprintContext));
    const incoming: IncomingSignal[] = fingerprints.flatMap((fingerprint, ordinal) =>
      fingerprint
        ? [
            {
              occurrenceId: occurrence.id,
              ordinal,
              fingerprint,
              observedAt: occurrence.completedAt ?? occurrence.observedAt,
              previousGroup: previousGroups[ordinal] ?? null,
            },
          ]
        : [],
    );
    const assignment = assign(snapshot.index, snapshot.links, incoming);
    const crossRepo = this.settings().crossRepoSuggestions
      ? await this.crossRepoCandidates(context, assignment.mappings)
      : [];
    const nowIso = this.deps.now().toISOString();
    const signals: CiSignalRow[] = signalsIn.map((signal, ordinal) => ({
      occurrenceId: occurrence.id,
      ordinal,
      signal,
      fingerprintVersion: FINGERPRINT_VERSION,
      fingerprint: fingerprints[ordinal]?.value ?? `summary:${ordinal}`,
      tier: fingerprints[ordinal]?.tier ?? 'low',
      groupId: null,
    }));
    const mappings: CiFingerprintRow[] = assignment.mappings.map((mapping) => ({
      scope: context.scope,
      version: FINGERPRINT_VERSION,
      fingerprint: mapping.fingerprint,
      groupId: mapping.groupId,
      facets: mapping.facets as never,
      firstSeenAt: nowIso,
    }));
    await store.record({
      ...emptyBatch(),
      occurrences: [occurrence],
      signals,
      replaceSignalsFor: [occurrence.id],
      newGroups: assignment.newGroups.map((group) => ({ ...group, scope: context.scope })),
      mappings,
      candidates: [...assignment.candidates, ...crossRepo],
    });
    snapshot.index.push(...assignment.mappings);
    this.remember(occurrence);
  }

  /**
   * After a rules change (`FINGERPRINT_VERSION`), fingerprints the stored
   * signals again from what the store kept; no log is needed. Each new
   * fingerprint keeps the group most of its signals belonged to, so owners,
   * fixes and tracking issues stay with the failure.
   */
  async upgradeFingerprints(): Promise<void> {
    for (const context of this.contexts()) {
      await this.serialized(context.scope, async () => {
        const snapshot = await store.loadScope([context.scope]);
        const stale = new Set(
          snapshot.index
            .filter((row) => row.version !== FINGERPRINT_VERSION)
            .map((row) => row.groupId),
        );
        if (stale.size === 0) return;
        log.info('re-fingerprinting stored failures', { scope: context.scope, groups: stale.size });
        const done = new Set<string>();
        for (const groupId of stale) {
          const detail = await store.loadGroup(groupId).catch(() => null);
          for (const { occurrence, signals } of detail?.occurrences ?? []) {
            if (done.has(occurrence.id) || this.stopped) continue;
            done.add(occurrence.id);
            if (signals.every((row) => row.fingerprintVersion === FINGERPRINT_VERSION)) continue;
            await this.recordSignals(
              context,
              occurrence,
              signals.map((row) => row.signal),
              signals.map((row) => row.groupId),
            );
          }
        }
      }).catch((error) =>
        log.warn('re-fingerprinting failed', { scope: context.scope, error: String(error) }),
      );
    }
  }

  /**
   * Suggestions between a new fingerprint and groups of other repositories
   * read by the same account. Never across accounts, never merged without you.
   */
  private async crossRepoCandidates(
    context: RepoContext,
    mappings: readonly IndexedFingerprint[],
  ): Promise<CandidateLink[]> {
    if (mappings.length === 0) return [];
    const links = new Map<string, CandidateLink>();
    for (const other of this.contexts()) {
      if (other.scope === context.scope || !sameAccount(other.scope, context.scope)) continue;
      const snapshot = await this.snapshotFor(other.scope).catch(() => null);
      for (const mapping of mappings) {
        for (const entry of snapshot?.index ?? []) {
          const reasons =
            entry.fingerprint === mapping.fingerprint
              ? ['Same failure in another repository']
              : candidateReasons(mapping.facets, entry.facets)?.map(
                  (r) => `${r}, in another repository`,
                );
          if (!reasons) continue;
          const [groupA, groupB] =
            mapping.groupId < entry.groupId
              ? [mapping.groupId, entry.groupId]
              : [entry.groupId, mapping.groupId];
          links.set(`${groupA}|${groupB}`, { groupA, groupB, reasons });
        }
      }
    }
    return [...links.values()];
  }

  /** The first sighting was attempt N > 1: record failed jobs of the attempt before it. */
  private async backfill(context: RepoContext, target: CollectTarget, collected: Collected) {
    const job = collected.actionsJob;
    if (!job) return;
    const known = await this.knownFor(context.scope);
    const earlier = [...known.values()].some(
      (entry) =>
        entry.runId === job.runId && entry.jobName === job.name && jobIdOf(entry.id) !== job.id,
    );
    if (earlier) return;
    const jobs = await getRunAttemptJobs(
      context.client,
      context.owner,
      context.repo,
      job.runId,
      job.runAttempt - 1,
    );
    const now = this.deps.now();
    const missed = jobs.filter(
      (j) => j.name === job.name && j.conclusion !== null && FAILED.has(j.conclusion),
    );
    for (const missedJob of missed) {
      const missedTarget: CollectTarget = {
        ...target,
        job: {
          id: missedJob.id,
          kind: 'actions',
          name: missedJob.name,
          runId: missedJob.runId,
          conclusion: missedJob.conclusion ?? 'failure',
          ...(missedJob.completedAt ? { completedAt: missedJob.completedAt } : {}),
        },
        attempts: 0,
      };
      const occurrence = pendingOccurrence(missedTarget, now);
      if (known.has(occurrence.id)) continue;
      await store.record({ ...emptyBatch(), occurrences: [occurrence] });
      this.remember(occurrence);
      this.enqueue({
        target: missedTarget,
        context,
        priority: 2,
        completedAt: missedJob.completedAt ?? now.toISOString(),
      });
    }
    this.pump();
  }

  /**
   * Failed push runs on each repo's default branch become occurrences too: a
   * failure that is on the default branch is the strongest sign it isn't the
   * PR's fault.
   */
  async observeDefaultBranches(): Promise<void> {
    const settings = this.settings();
    if (this.stopped || !settings.enabled || !settings.includeDefaultBranch) return;
    for (const context of this.contexts()) {
      await this.serialized(context.scope, () => this.observeDefaultBranch(context)).catch(
        (error) =>
          log.debug('default branch watch failed', { scope: context.scope, error: String(error) }),
      );
    }
    this.pump();
  }

  private async observeDefaultBranch(context: RepoContext): Promise<void> {
    const branch = await getRepoDefaultBranch(context.client, context.owner, context.repo);
    if (!branch || this.stopped) return;
    const runs = await listBranchPushRuns(context.client, context.owner, context.repo, branch);
    const watches = new Map(
      (await store.branchWatch(context.scope)).map((watch) => [watch.workflowPath, watch]),
    );
    const known = await this.knownFor(context.scope);
    const now = this.deps.now();
    const updated = new Map<string, CiBranchWatch>();
    for (const run of runs) {
      if (run.status !== 'completed') continue;
      const path = run.path ?? run.name ?? 'workflow';
      const watch = updated.get(path) ??
        watches.get(path) ?? {
          scope: context.scope,
          workflowPath: path,
          lastFailedRun: null,
          lastPassedRun: null,
          checkedAt: null,
        };
      if (run.conclusion === 'success') {
        updated.set(path, {
          ...watch,
          lastPassedRun: Math.max(watch.lastPassedRun ?? 0, run.id),
          checkedAt: now.toISOString(),
        });
        continue;
      }
      if (run.conclusion !== 'failure' || run.id <= (watch.lastFailedRun ?? 0)) continue;
      updated.set(path, { ...watch, lastFailedRun: run.id, checkedAt: now.toISOString() });
      const created = run.createdAt ? Date.parse(run.createdAt) : now.getTime();
      if (now.getTime() - created > DEFAULT_BRANCH_WINDOW_MS) continue;
      const jobs = await getRunAttemptJobs(
        context.client,
        context.owner,
        context.repo,
        run.id,
        run.runAttempt,
      );
      const fresh: CiOccurrence[] = [];
      for (const job of jobs) {
        if (!job.conclusion || !FAILED.has(job.conclusion)) continue;
        const target: CollectTarget = {
          scope: context.scope,
          owner: context.owner,
          repo: context.repo,
          source: 'default_branch',
          prNumber: null,
          prHeadSha: run.headSha,
          job: {
            id: job.id,
            kind: 'actions',
            name: job.name,
            runId: run.id,
            ...(run.runNumber !== null ? { runNumber: run.runNumber } : {}),
            ...(run.name ? { workflowName: run.name } : {}),
            workflowEvent: 'push',
            conclusion: job.conclusion,
            ...(job.completedAt ? { completedAt: job.completedAt } : {}),
          },
          attempts: 0,
        };
        const occurrence = pendingOccurrence(target, now);
        if (known.has(occurrence.id)) continue;
        fresh.push(occurrence);
        this.enqueue({
          target,
          context,
          priority: 3,
          completedAt: job.completedAt ?? now.toISOString(),
        });
      }
      if (fresh.length > 0) {
        await store.record({ ...emptyBatch(), occurrences: fresh });
        for (const occurrence of fresh) this.remember(occurrence);
      }
    }
    if (updated.size > 0) await store.setBranchWatch([...updated.values()]);
  }

  /** Deletes history past the retention window; protected groups keep their newest occurrence. */
  async retention(activeScopes: string[]): Promise<void> {
    if (this.stopped) return;
    await store.retention(activeScopes, this.settings().retentionDays, 20_000, 7);
    this.known.clear();
    this.snapshots.clear();
  }

  /** Drops cached scope state after another window merged, split or cleared groups. */
  forget(scopes: readonly string[]): void {
    for (const scope of scopes) {
      this.snapshots.delete(scope);
    }
  }
}

function emptyBatch(): CiRecordBatch {
  return {
    occurrences: [],
    signals: [],
    replaceSignalsFor: [],
    newGroups: [],
    mappings: [],
    candidates: [],
    outcomes: [],
  };
}

/** A read that threw: the API refused the job (404, 410) or the network failed. */
function failedCollect(target: CollectTarget, error: unknown, now: Date): Collected {
  const occurrence = pendingOccurrence(target, now);
  const attempts = target.attempts + 1;
  const gone = error instanceof GitHubApiError && (error.status === 404 || error.status === 410);
  return {
    occurrence: {
      ...occurrence,
      // A failed read learned nothing about the tested commit; the stored one stays.
      testedSha: '',
      evidenceState: gone ? 'unavailable' : 'failed',
      evidenceReason: gone
        ? 'GitHub no longer has this job'
        : String(error instanceof Error ? error.message : error),
      evidenceAttempts: attempts,
      retryAt: gone
        ? null
        : new Date(now.getTime() + Math.min(120, 2 ** attempts) * 60_000).toISOString(),
    },
    signals: [],
    actionsJob: null,
    logBytes: 0,
  };
}

/** The repos the sync covers, each with its account's client and scope. */
export function repoContextsOf(
  repos: readonly { owner: string; name: string; enabled: boolean; githubAccount?: string }[],
  clientFor: (owner: string, repo: string) => GitHubClient | null,
): RepoContext[] {
  return repos.flatMap((repo) => {
    if (!repo.enabled) return [];
    const client = clientFor(repo.owner, repo.name);
    if (!client) return [];
    const account = repo.githubAccount?.trim() ?? '';
    return [
      {
        owner: repo.owner,
        repo: repo.name,
        account,
        scope: scopeOf({ host: GITHUB_HOST, account, owner: repo.owner, repo: repo.name }),
        client,
      },
    ];
  });
}
