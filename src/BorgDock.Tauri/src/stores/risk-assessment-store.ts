import { create } from 'zustand';
import { loadTabData, saveTabData } from '@/services/cache';
import { getTextFileAtRef } from '@/services/github/contents';
import { getClientForRepo } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import type { ReviewSnapshot } from '@/services/quick-review';
import {
  applyRiskReads,
  buildRiskPrompt,
  finishRiskAssessment,
  isRiskAssessment,
  outsidePathsOf,
  planRiskPrompt,
  type RiskAssessment,
  readRiskAnswer,
  riskPromptSources,
} from '@/services/risk-assessment';
import { runSummaryAgent, summaryCheckout } from '@/services/summary-agent';
import { usePrStore } from '@/stores/pr-store';
import { commitLines } from '@/stores/review-guide-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequest } from '@/types';
import { parseError } from '@/utils/parse-error';

const log = createLogger('risk-assessment');

/** An assessment reads the whole diff and may look around the checkout. */
const RISK_TIMEOUT_SECONDS = 300;
/** Assessments that run at once; the rest wait their turn. */
const MAX_RUNS = 2;
/**
 * After a run fails (the CLI is broken, the usage limit is reached) nothing
 * starts on its own for this long: every PR opened next would fail the same way.
 */
const PAUSE_MS = 10 * 60_000;

export type RiskEntry =
  /** Not assessed: automatic assessment is off, or paused after a failure. Waits for a click. */
  | { status: 'idle'; provider: string; paused?: string }
  /** `startedAt` is null while it waits for a free run. */
  | { status: 'loading'; provider: string; startedAt: number | null }
  | { status: 'ready'; assessment: RiskAssessment }
  | { status: 'error'; provider: string; error: string; failedAt: number };

interface RiskState {
  /** By `riskKey`: one assessment per head commit. */
  entries: Record<string, RiskEntry>;
  /** By `riskPrId`: the newest assessment seen for the PR, whatever its head. */
  latest: Record<string, RiskAssessment>;
}

export const useRiskAssessmentStore = create<RiskState>(() => ({ entries: {}, latest: {} }));

export function riskPrId(pr: Pick<PullRequest, 'repoOwner' | 'repoName' | 'number'>): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}`.toLowerCase();
}

export function riskKey(pr: PullRequest): string {
  return `${riskPrId(pr)}@${pr.headSha ?? ''}`.toLowerCase();
}

/** Heads whose cached assessment is being read. */
const checking = new Set<string>();
let pausedUntil = 0;
let pauseReason = '';
let running = 0;
const queue: Array<() => void> = [];

/** A free run, waiting when `MAX_RUNS` are busy. Release hands it to the next in line. */
async function runSlot(): Promise<() => void> {
  if (running >= MAX_RUNS) await new Promise<void>((resolve) => queue.push(resolve));
  else running++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = queue.shift();
    if (next) next();
    else running--;
  };
}

/** Forgets every assessment and pause; for tests. */
export function resetRiskAssessments() {
  checking.clear();
  pausedUntil = 0;
  pauseReason = '';
  running = 0;
  queue.length = 0;
  useRiskAssessmentStore.setState({ entries: {}, latest: {} });
}

function setEntry(key: string, entry: RiskEntry) {
  useRiskAssessmentStore.setState((s) => ({ entries: { ...s.entries, [key]: entry } }));
}

/** The head the PR list has for this PR, when it has the PR. */
function listHead(pr: PullRequest): string | null {
  const id = riskPrId(pr);
  const found = (usePrStore.getState().pullRequests ?? []).find(
    (p) => riskPrId(p.pullRequest) === id,
  );
  return found?.pullRequest.headSha || null;
}

/**
 * Keeps `assessment` as the PR's newest, unless the one kept is for the head
 * the list shows now: an assessment of an older head that finishes late
 * never replaces it.
 */
function rememberLatest(pr: PullRequest, assessment: RiskAssessment) {
  const id = riskPrId(pr);
  const kept = useRiskAssessmentStore.getState().latest[id];
  if (kept && kept.headSha !== assessment.headSha && kept.headSha === listHead(pr)) return;
  useRiskAssessmentStore.setState((s) => ({ latest: { ...s.latest, [id]: assessment } }));
}

/** Saves the assessment in the PR cache, unless that holds one of the head the list shows now. */
async function persist(pr: PullRequest, assessment: RiskAssessment) {
  const head = listHead(pr);
  if (head && head !== assessment.headSha) {
    const cached = await loadTabData(pr.repoOwner, pr.repoName, pr.number, 'riskAssessment');
    if (cached?.prUpdatedAt === head) return;
  }
  await saveTabData(
    pr.repoOwner,
    pr.repoName,
    pr.number,
    'riskAssessment',
    assessment,
    assessment.headSha,
  );
}

/**
 * The assessment the PR cache holds, kept as the PR's newest; put in the
 * store as ready when it is for this head. True when this head is assessed.
 */
export async function recallRiskAssessment(pr: PullRequest): Promise<boolean> {
  const head = pr.headSha ?? '';
  const key = riskKey(pr);
  if (!head || checking.has(key)) return false;
  const existing = useRiskAssessmentStore.getState().entries[key];
  if (existing) return existing.status === 'ready';
  checking.add(key);
  try {
    const cached = await loadTabData<RiskAssessment>(
      pr.repoOwner,
      pr.repoName,
      pr.number,
      'riskAssessment',
    ).catch(() => null);
    const assessment = cached?.data;
    if (!isRiskAssessment(assessment) || cached?.prUpdatedAt !== assessment.headSha) return false;
    rememberLatest(pr, assessment);
    if (assessment.headSha !== head) return false;
    if (!useRiskAssessmentStore.getState().entries[key])
      setEntry(key, { status: 'ready', assessment });
    return true;
  } finally {
    checking.delete(key);
  }
}

/** The files the answer cites outside the diff, as they are at the head commit. */
async function readSources(pr: PullRequest, head: string, paths: readonly string[]) {
  const sources = new Map<string, string | null>();
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
  if (!client || !paths.length) return sources;
  await Promise.all(
    paths.map(async (path) => {
      const text = await getTextFileAtRef(client, pr.repoOwner, pr.repoName, path, head).catch(
        () => null,
      );
      sources.set(path, text);
    }),
  );
  return sources;
}

/**
 * The regression risk of the snapshot's head commit: from memory, then the
 * PR cache, then from the summary agent (Settings → Agents → Summaries).
 * Unlike the review guide it runs for every PR, small ones and dependency
 * updates too. Nobody asked for that last step unless `force` (Assess,
 * Try again, Assess again), so it happens only while automatic assessment
 * is on and nothing failed in the last ten minutes; `background` (written
 * ahead for the next PR) also stops while paused. One run per head at a
 * time, at most `MAX_RUNS` at once; a failed run stays failed until `force`.
 */
export async function ensureRiskAssessment(
  snapshot: ReviewSnapshot,
  { force = false, background = false }: { force?: boolean; background?: boolean } = {},
): Promise<void> {
  const pr = snapshot.pr;
  const head = pr.headSha ?? '';
  if (!head || snapshot.files.length === 0) return;
  const key = riskKey(pr);
  const current = useRiskAssessmentStore.getState().entries[key];
  if (current?.status === 'loading' || checking.has(key) || (current && !force)) return;

  const settings = useSettingsStore.getState().settings;
  const provider = settings.summaries?.provider ?? 'claude';
  if (!current) {
    if (await recallRiskAssessment(pr)) return;
    if (useRiskAssessmentStore.getState().entries[key]) return;
    if (!force) {
      if (settings.summaries?.autoRiskAssessment === false) {
        setEntry(key, { status: 'idle', provider });
        return;
      }
      if (Date.now() < pausedUntil) {
        if (!background) setEntry(key, { status: 'idle', provider, paused: pauseReason });
        return;
      }
    }
  }

  setEntry(key, { status: 'loading', provider, startedAt: null });
  const release = await runSlot();
  try {
    setEntry(key, { status: 'loading', provider, startedAt: Date.now() });
    const fresh = useSettingsStore.getState().settings;
    const checkout = summaryCheckout(fresh, pr);
    const input = {
      pr,
      files: snapshot.files,
      commits: await commitLines(pr),
      skip: fresh.summaries?.guideSkip,
      checkout,
    };
    const plan = planRiskPrompt(input);
    const result = await runSummaryAgent(fresh, {
      prompt: buildRiskPrompt(input, plan),
      cwd: checkout,
      timeoutSeconds: RISK_TIMEOUT_SECONDS,
      sources: riskPromptSources(input, plan),
    });
    const answer = readRiskAnswer(result.text);
    const readPlan = applyRiskReads(plan, result.reads ?? []);
    const sources = await readSources(pr, head, outsidePathsOf(answer, readPlan));
    const assessment = finishRiskAssessment(answer, readPlan, sources, {
      headSha: head,
      baseSha: snapshot.baseSha,
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
      createdAt: new Date().toISOString(),
    });
    setEntry(key, { status: 'ready', assessment });
    rememberLatest(pr, assessment);
    void persist(pr, assessment).catch((error: unknown) =>
      log.warn('assessment not cached', { pr: key, error: String(error) }),
    );
  } catch (err) {
    const error = parseError(err).message;
    pausedUntil = Date.now() + PAUSE_MS;
    pauseReason = error;
    setEntry(key, { status: 'error', provider, error, failedAt: Date.now() });
  } finally {
    release();
  }
}

export type RiskView =
  /** No head to assess yet: the files are still loading. */
  | { kind: 'waiting' }
  | { kind: 'idle'; provider: string; paused?: string; previous: RiskAssessment | null }
  | {
      kind: 'assessing';
      provider: string;
      startedAt: number | null;
      previous: RiskAssessment | null;
    }
  | {
      kind: 'failed';
      provider: string;
      error: string;
      failedAt: number;
      previous: RiskAssessment | null;
    }
  | { kind: 'ready'; assessment: RiskAssessment };

/**
 * What to show for `head`: its own assessment, or what is happening to it
 * with the newest assessment of another head as `previous` (shown stale).
 * Nothing at all is never Low: it is `idle`.
 */
export function riskViewOf(
  head: string | null | undefined,
  entry: RiskEntry | undefined,
  latest: RiskAssessment | undefined,
  provider: string,
): RiskView {
  if (!head) return { kind: 'waiting' };
  if (entry?.status === 'ready') return { kind: 'ready', assessment: entry.assessment };
  const previous = latest && latest.headSha !== head ? latest : null;
  if (!entry) return { kind: 'idle', provider, previous };
  if (entry.status === 'loading')
    return { kind: 'assessing', provider: entry.provider, startedAt: entry.startedAt, previous };
  if (entry.status === 'error')
    return {
      kind: 'failed',
      provider: entry.provider,
      error: entry.error,
      failedAt: entry.failedAt,
      previous,
    };
  return { kind: 'idle', provider: entry.provider, paused: entry.paused, previous };
}

/** The risk view for the PR at `head` (the snapshot's head once its files are in). */
export function useRiskView(pr: PullRequest, head: string | null | undefined): RiskView {
  const key = head ? riskKey({ ...pr, headSha: head }) : '';
  const entry = useRiskAssessmentStore((s) => (key ? s.entries[key] : undefined));
  const latest = useRiskAssessmentStore((s) => s.latest[riskPrId(pr)]);
  const provider = useSettingsStore((s) => s.settings.summaries?.provider ?? 'claude');
  return riskViewOf(head, entry, latest, provider);
}
