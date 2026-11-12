import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePr, resetSeq } from '@/components/focus/__tests__/helpers';
import { commands } from '@/generated/commands';
import { loadTabData } from '@/services/cache';
import { getPRCommits, getPRFiles, getPRReviewDetails } from '@/services/github/pulls';
import { guideKey, useReviewGuideStore } from '@/stores/review-guide-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { startReviewGuideWriter } from '../review-guide-writer';

/** `prs` wait for my review; `others` are the rest of the open list. */
const queue = vi.hoisted(() => ({ prs: [] as unknown[], others: [] as unknown[] }));
vi.mock('@/stores/pr-store', () => ({
  usePrStore: {
    getState: () => ({
      needsMyReview: () => queue.prs,
      pullRequests: [...queue.others, ...queue.prs],
      username: 'reviewer',
    }),
    subscribe: () => () => {},
  },
}));
vi.mock('@/services/github/pulls', () => ({
  getPRFiles: vi.fn(),
  getPRReviewDetails: vi.fn(),
  getPRCommits: vi.fn(),
}));
const mockClient = vi.hoisted(() => ({ account: 'reviewer' }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => mockClient }));
vi.mock('@/services/cache', () => ({ loadTabData: vi.fn(), saveTabData: vi.fn() }));
vi.mock('@/generated/commands', () => ({ commands: { runHeadlessPrompt: vi.fn() } }));

const FILES = [
  {
    filename: 'src/Workspace.tsx',
    sha: 'w',
    status: 'modified',
    additions: 200,
    deletions: 0,
    patch: '@@ -20,1 +20,2 @@\n context();\n+renderHiddenFields();',
  },
];
const ANSWER = {
  status: 'ok' as const,
  data: {
    text: JSON.stringify({
      summary: 'Shows hidden filters.',
      chapters: [{ title: 'Workspace', files: [[1, 'new section']] }],
      focus: [],
    }),
    provider: 'claude',
    model: 'opus',
    durationMs: 900,
    reads: null,
  },
};
const SETTLE_MS = 5_000;
const RETRY_MS = 10 * 60_000;

const SETTINGS = useSettingsStore.getState().settings;
function writeAhead(on: boolean) {
  useSettingsStore.setState({
    hasLoaded: true,
    settings: { ...SETTINGS, summaries: { ...SETTINGS.summaries!, backgroundReviewGuides: on } },
  });
}

function big(overrides: Parameters<typeof makePr>[0] = {}): PullRequestWithChecks {
  return makePr({ additions: 200, deletions: 0, changedFiles: FILES.length, ...overrides });
}
function small(): PullRequestWithChecks {
  return makePr({ additions: 4, deletions: 1, changedFiles: 1 });
}
function statusOf(pr: PullRequestWithChecks) {
  return useReviewGuideStore.getState().entries[guideKey(pr.pullRequest)]?.status;
}

let stop = () => {};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  resetSeq();
  useReviewGuideStore.setState({ entries: {} });
  queue.prs = [];
  queue.others = [];
  vi.mocked(getPRReviewDetails).mockImplementation(async (_client, _owner, _repo, number) => ({
    pr: ([...queue.prs, ...queue.others] as PullRequestWithChecks[]).find(
      (pr) => pr.pullRequest.number === number,
    )!.pullRequest,
    baseSha: 'base',
  }));
  vi.mocked(getPRFiles).mockResolvedValue(FILES);
  vi.mocked(getPRCommits).mockResolvedValue([]);
  vi.mocked(loadTabData).mockResolvedValue(null);
  vi.mocked(commands.runHeadlessPrompt).mockResolvedValue(ANSWER);
  writeAhead(true);
});
afterEach(() => {
  stop();
  vi.useRealTimers();
  useSettingsStore.setState({ settings: SETTINGS });
});

async function run(ms = SETTLE_MS) {
  stop = startReviewGuideWriter();
  await vi.advanceTimersByTimeAsync(ms);
}

describe('review guide writer', () => {
  it('writes nothing until the setting is on', async () => {
    writeAhead(false);
    queue.prs = [big()];
    await run();
    expect(loadTabData).not.toHaveBeenCalled();
    expect(commands.runHeadlessPrompt).not.toHaveBeenCalled();
  });

  it('writes a guide for each PR waiting for my review and leaves a small one unread', async () => {
    const [first, tiny, last] = [big(), small(), big()];
    queue.prs = [first, tiny, last];
    await run();
    await vi.waitFor(() => expect(statusOf(last)).toBe('ready'));
    expect(statusOf(first)).toBe('ready');
    expect(useReviewGuideStore.getState().entries[guideKey(tiny.pullRequest)]).toEqual({
      status: 'skipped',
      reason: 'A small change: 5 lines in 1 file',
    });
    expect(getPRFiles).toHaveBeenCalledTimes(2);
    const prompts = vi.mocked(commands.runHeadlessPrompt).mock.calls.map((c) => c[0].prompt);
    expect(prompts.map((prompt) => /\(#(\d+)\)/.exec(prompt)?.[1])).toEqual([
      String(first.pullRequest.number),
      String(last.pullRequest.number),
    ]);
  });

  it('goes on to the other open PRs I can review, never mine or a draft', async () => {
    const [other, mine, draft, asked] = [
      big(),
      big({ authorLogin: 'Reviewer' }),
      big({ isDraft: true }),
      big(),
    ];
    queue.prs = [asked];
    queue.others = [other, mine, draft];
    await run();
    await vi.waitFor(() => expect(statusOf(other)).toBe('ready'));
    expect(statusOf(mine)).toBeUndefined();
    expect(statusOf(draft)).toBeUndefined();
    const prompts = vi.mocked(commands.runHeadlessPrompt).mock.calls.map((c) => c[0].prompt);
    expect(prompts.map((prompt) => /\(#(\d+)\)/.exec(prompt)?.[1])).toEqual([
      String(asked.pullRequest.number),
      String(other.pullRequest.number),
    ]);
  });

  it('takes the guide written earlier without reading the PR again', async () => {
    const pr = big();
    queue.prs = [pr];
    vi.mocked(loadTabData).mockResolvedValue({
      data: { headSha: pr.pullRequest.headSha, summary: '', chapters: [], focus: [] },
      prUpdatedAt: pr.pullRequest.headSha,
    } as never);
    await run();
    await vi.waitFor(() => expect(statusOf(pr)).toBe('ready'));
    expect(getPRFiles).not.toHaveBeenCalled();
    expect(commands.runHeadlessPrompt).not.toHaveBeenCalled();
  });

  it('waits ten minutes after a failure before it tries the next PR', async () => {
    const [first, second] = [big(), big()];
    queue.prs = [first, second];
    vi.mocked(commands.runHeadlessPrompt).mockResolvedValueOnce({
      status: 'error',
      error: 'claude exited with 1: usage limit reached',
    });
    await run();
    await vi.waitFor(() => expect(statusOf(first)).toBe('error'));
    await vi.advanceTimersByTimeAsync(RETRY_MS - 10_000);
    expect(statusOf(second)).toBeUndefined();
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => expect(statusOf(second)).toBe('ready'));
    expect(statusOf(first)).toBe('error');
  });
});
