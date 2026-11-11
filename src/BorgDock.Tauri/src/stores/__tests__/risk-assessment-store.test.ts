import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REFUND_ANSWER,
  REFUND_FILES,
  REFUND_HEAD,
  REFUND_NEXT_HEAD,
  REFUND_SOURCES,
  refundAssessment,
  refundPr,
} from '@/components/focus/__fixtures__/quick-review-risk';
import { commands } from '@/generated/commands';
import { loadTabData, saveTabData } from '@/services/cache';
import { getTextFileAtRef } from '@/services/github/contents';
import type { ReviewSnapshot } from '@/services/quick-review';
import {
  ensureRiskAssessment,
  type RiskEntry,
  recallRiskAssessment,
  resetRiskAssessments,
  riskKey,
  riskPrId,
  riskViewOf,
  useRiskAssessmentStore,
} from '@/stores/risk-assessment-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequest, RepoSettings } from '@/types';

const list = vi.hoisted(() => ({ heads: new Map<string, string>() }));

vi.mock('@/generated/commands', () => ({ commands: { runHeadlessPrompt: vi.fn() } }));
vi.mock('@/services/cache', () => ({ loadTabData: vi.fn(), saveTabData: vi.fn() }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => ({}) }));
vi.mock('@/services/github/contents', () => ({ getTextFileAtRef: vi.fn() }));
vi.mock('@/stores/review-guide-store', () => ({ commitLines: vi.fn().mockResolvedValue([]) }));
vi.mock('@/stores/pr-store', () => ({
  usePrStore: {
    getState: () => ({
      pullRequests: [...list.heads].map(([number, headSha]) => ({
        pullRequest: { repoOwner: 'acme', repoName: 'shop', number: Number(number), headSha },
      })),
    }),
  },
}));

type Reply = Awaited<ReturnType<typeof commands.runHeadlessPrompt>>;

function reply(answer: unknown = REFUND_ANSWER): Reply {
  return {
    status: 'ok',
    data: { text: JSON.stringify(answer), provider: 'claude', model: 'sonnet', durationMs: 900 },
  } as Reply;
}

/** A run that answers when the test says so. */
function deferred() {
  let answer: (value: Reply) => void = () => {};
  let fail: (error: unknown) => void = () => {};
  const promise = new Promise<Reply>((resolve, reject) => {
    answer = resolve;
    fail = reject;
  });
  return { promise, answer, fail };
}

function snapshot(pr: PullRequest, files = REFUND_FILES): ReviewSnapshot {
  return { pr, baseSha: 'base', groups: [], files, loadedAt: 0 };
}

/** Cached tab data as the PR cache would hold it: the last save per PR. */
const cache = new Map<number, { data: unknown; prUpdatedAt: string; cachedAt: string }>();
const DEFAULTS = useSettingsStore.getState().settings;

function settings(summaries: Record<string, unknown> = {}) {
  useSettingsStore.setState({
    settings: {
      ...DEFAULTS,
      repos: [
        {
          owner: 'acme',
          name: 'shop',
          enabled: true,
          worktreeBasePath: '/repos/shop',
        } as RepoSettings,
      ],
      summaries: { ...DEFAULTS.summaries!, ...summaries },
    },
  });
}

const entry = (pr: PullRequest): RiskEntry | undefined =>
  useRiskAssessmentStore.getState().entries[riskKey(pr)];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  resetRiskAssessments();
  cache.clear();
  list.heads.clear();
  settings();
  vi.mocked(commands.runHeadlessPrompt).mockResolvedValue(reply());
  vi.mocked(loadTabData).mockImplementation(
    async (_o, _r, number) => (cache.get(number) as never) ?? null,
  );
  vi.mocked(saveTabData).mockImplementation(async (_o, _r, number, _t, data, prUpdatedAt) => {
    cache.set(number, { data, prUpdatedAt, cachedAt: 'now' });
  });
  vi.mocked(getTextFileAtRef).mockImplementation(
    async (_c, _o, _r, path) => REFUND_SOURCES[path] ?? null,
  );
});
afterEach(() => {
  useSettingsStore.setState({ settings: DEFAULTS });
});

describe('ensureRiskAssessment', () => {
  it('assesses a head once, however often it is asked, and caches it by head', async () => {
    const pr = refundPr();
    await Promise.all([ensureRiskAssessment(snapshot(pr)), ensureRiskAssessment(snapshot(pr))]);
    await ensureRiskAssessment(snapshot(pr));
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(commands.runHeadlessPrompt).mock.calls[0]![0];
    expect(prompt).toMatchObject({ provider: 'claude', model: 'sonnet', cwd: '/repos/shop' });
    const ready = entry(pr);
    expect(ready?.status).toBe('ready');
    expect(ready?.status === 'ready' && ready.assessment.level).toBe('high');
    await flush();
    expect(saveTabData).toHaveBeenCalledWith(
      'acme',
      'shop',
      4821,
      'riskAssessment',
      expect.anything(),
      REFUND_HEAD,
    );
  });

  it('reads the files it cites outside the diff at the head commit, not the checkout', async () => {
    await ensureRiskAssessment(snapshot(refundPr()));
    expect(vi.mocked(getTextFileAtRef).mock.calls.map((c) => [c[3], c[4]])).toEqual([
      ['src/refunds/refundable-lines.ts', REFUND_HEAD],
      ['web/src/account/refund-form.tsx', REFUND_HEAD],
      // A changed file's own lines outside its hunks are read at the head too.
      ['src/refunds/calculate.ts', REFUND_HEAD],
    ]);
  });

  it('assesses dependency updates and tiny changes, which get no guide', async () => {
    const bump = refundPr({
      number: 4830,
      authorLogin: 'dependabot[bot]',
      additions: 1,
      deletions: 1,
    });
    await ensureRiskAssessment(snapshot(bump, REFUND_FILES.slice(4, 5)));
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(1);
    expect(entry(bump)?.status).toBe('ready');
  });

  it('waits for a click while automatic assessment is off', async () => {
    settings({ autoRiskAssessment: false });
    const pr = refundPr();
    await ensureRiskAssessment(snapshot(pr));
    expect(entry(pr)).toEqual({ status: 'idle', provider: 'claude' });
    expect(commands.runHeadlessPrompt).not.toHaveBeenCalled();
    await ensureRiskAssessment(snapshot(pr), { force: true });
    expect(entry(pr)?.status).toBe('ready');
  });

  it('keeps a failure as a failure, and pauses automatic runs after it', async () => {
    vi.mocked(commands.runHeadlessPrompt).mockResolvedValueOnce({
      status: 'error',
      error: 'claude exited with code 1: usage limit reached',
    } as Reply);
    const pr = refundPr();
    await ensureRiskAssessment(snapshot(pr));
    expect(entry(pr)).toMatchObject({
      status: 'error',
      error: expect.stringContaining('usage limit'),
    });
    // Opening it again does not start the broken CLI again.
    await ensureRiskAssessment(snapshot(pr));
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(1);

    const other = refundPr({ number: 4900 });
    await ensureRiskAssessment(snapshot(other));
    expect(entry(other)).toMatchObject({
      status: 'idle',
      paused: expect.stringContaining('usage limit'),
    });
    const ahead = refundPr({ number: 4901 });
    await ensureRiskAssessment(snapshot(ahead), { background: true });
    expect(entry(ahead)).toBeUndefined();
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(1);

    await ensureRiskAssessment(snapshot(pr), { force: true });
    expect(entry(pr)?.status).toBe('ready');
  });

  it('fails on an answer that is not an assessment instead of calling it Low', async () => {
    vi.mocked(commands.runHeadlessPrompt).mockResolvedValueOnce(
      reply({ summary: 'a guide', chapters: [] }),
    );
    const pr = refundPr();
    await ensureRiskAssessment(snapshot(pr));
    expect(entry(pr)).toMatchObject({
      status: 'error',
      error: 'The agent did not answer with an assessment.',
    });
  });

  it('runs at most two at once; the rest wait their turn', async () => {
    const runs = [deferred(), deferred(), deferred()];
    let call = 0;
    vi.mocked(commands.runHeadlessPrompt).mockImplementation(() => runs[call++]!.promise);
    const prs = [refundPr({ number: 1 }), refundPr({ number: 2 }), refundPr({ number: 3 })];
    const all = prs.map((pr) => ensureRiskAssessment(snapshot(pr)));
    await flush();
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(2);
    expect(entry(prs[2]!)).toMatchObject({ status: 'loading', startedAt: null });
    runs[0]!.answer(reply());
    await flush();
    await flush();
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(3);
    expect(entry(prs[2]!)).toMatchObject({ status: 'loading', startedAt: expect.any(Number) });
    runs[1]!.answer(reply());
    runs[2]!.answer(reply());
    await Promise.all(all);
    expect(prs.map((pr) => entry(pr)?.status)).toEqual(['ready', 'ready', 'ready']);
  });
});

describe('heads', () => {
  it("recalls this head's cached assessment without a run", async () => {
    cache.set(4821, { data: refundAssessment(), prUpdatedAt: REFUND_HEAD, cachedAt: 'then' });
    const pr = refundPr();
    await ensureRiskAssessment(snapshot(pr));
    expect(commands.runHeadlessPrompt).not.toHaveBeenCalled();
    expect(entry(pr)?.status).toBe('ready');
  });

  it("shows an older head's assessment as stale while the new head is assessed", async () => {
    cache.set(4821, { data: refundAssessment(), prUpdatedAt: REFUND_HEAD, cachedAt: 'then' });
    const run = deferred();
    vi.mocked(commands.runHeadlessPrompt).mockReturnValueOnce(run.promise);
    const pr = refundPr({ headSha: REFUND_NEXT_HEAD });
    const pending = ensureRiskAssessment(snapshot(pr));
    await flush();
    const state = useRiskAssessmentStore.getState();
    const view = riskViewOf(
      REFUND_NEXT_HEAD,
      state.entries[riskKey(pr)],
      state.latest[riskPrId(pr)],
      'claude',
    );
    expect(view.kind).toBe('assessing');
    expect(view.kind === 'assessing' && view.previous?.headSha).toBe(REFUND_HEAD);
    run.answer(reply());
    await pending;
    expect(useRiskAssessmentStore.getState().latest[riskPrId(pr)]?.headSha).toBe(REFUND_NEXT_HEAD);
  });

  it('never lets an older head that finishes late replace the head the list shows', async () => {
    list.heads.set('4821', REFUND_NEXT_HEAD);
    const older = deferred();
    const newer = deferred();
    vi.mocked(commands.runHeadlessPrompt)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const before = refundPr();
    const after = refundPr({ headSha: REFUND_NEXT_HEAD });
    const first = ensureRiskAssessment(snapshot(before));
    const second = ensureRiskAssessment(snapshot(after));
    await flush();
    newer.answer(reply());
    await second;
    await flush();
    older.answer(reply());
    await first;
    await flush();
    expect(entry(before)?.status).toBe('ready');
    expect(useRiskAssessmentStore.getState().latest[riskPrId(after)]?.headSha).toBe(
      REFUND_NEXT_HEAD,
    );
    expect(cache.get(4821)?.prUpdatedAt).toBe(REFUND_NEXT_HEAD);
    expect(vi.mocked(saveTabData).mock.calls.map((c) => c[5])).toEqual([REFUND_NEXT_HEAD]);
  });

  it('leaves the store alone when there is no head', async () => {
    expect(await recallRiskAssessment(refundPr({ headSha: undefined }))).toBe(false);
    expect(useRiskAssessmentStore.getState().entries).toEqual({});
  });
});

describe('riskViewOf', () => {
  it('is never Low without an assessment', () => {
    expect(riskViewOf(null, undefined, undefined, 'claude')).toEqual({ kind: 'waiting' });
    expect(riskViewOf('abc', undefined, undefined, 'codex')).toEqual({
      kind: 'idle',
      provider: 'codex',
      previous: null,
    });
    expect(
      riskViewOf(
        'abc',
        { status: 'error', provider: 'claude', error: 'x', failedAt: 1 },
        undefined,
        'claude',
      ).kind,
    ).toBe('failed');
  });

  it("does not call this head's own assessment stale", () => {
    const assessment = refundAssessment();
    expect(riskViewOf(REFUND_HEAD, undefined, assessment, 'claude')).toMatchObject({
      kind: 'idle',
      previous: null,
    });
  });
});
