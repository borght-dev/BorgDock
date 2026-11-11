import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands } from '@/generated/commands';
import { loadTabData } from '@/services/cache';
import { getTextFileAtRef } from '@/services/github/contents';
import { getPRCommits, getPRFiles, getPRReviewDetails } from '@/services/github/pulls';
import { RISK_PROMPT_TITLE } from '@/services/risk-assessment';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useReviewGuideStore } from '@/stores/review-guide-store';
import { resetRiskAssessments } from '@/stores/risk-assessment-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { RepoSettings } from '@/types';
import {
  REFUND_ANSWER,
  REFUND_FILES,
  REFUND_HEAD,
  REFUND_NEXT_HEAD,
  REFUND_SOURCES,
  refundAssessment,
  refundPr,
} from '../__fixtures__/quick-review-risk';
import { QuickReviewOverlay } from '../QuickReviewOverlay';
import { makePr } from './helpers';

vi.mock('@/services/github/pulls', () => ({
  getPRFiles: vi.fn(),
  getPRReviewDetails: vi.fn(),
  getPRCommits: vi.fn(),
  getCommitFiles: vi.fn(),
}));
vi.mock('@/services/github/mutations', () => ({ submitReview: vi.fn(), enableAutoMerge: vi.fn() }));
vi.mock('@/services/github/reviews', () => ({
  getAllComments: vi.fn().mockResolvedValue([]),
  getReviews: vi.fn().mockResolvedValue([]),
}));
const mockClient = vi.hoisted(() => ({
  account: 'reviewer',
  get: vi.fn().mockRejectedValue(new Error('Unavailable')),
}));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => mockClient }));
vi.mock('@/services/github/contents', () => ({ getTextFileAtRef: vi.fn() }));
vi.mock('@/services/cache', () => ({
  loadTabData: vi.fn().mockResolvedValue(null),
  saveTabData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/generated/commands', () => ({ commands: { runHeadlessPrompt: vi.fn() } }));
vi.mock('@/stores/pr-store', () => ({
  usePrStore: Object.assign(
    (selector: (state: { needsMyReview: () => [] }) => unknown) =>
      selector({ needsMyReview: () => [] }),
    { getState: () => ({ refreshPr: vi.fn().mockResolvedValue(null), recordApproval: vi.fn() }) },
  ),
}));
vi.mock('@/hooks/useSyntaxHighlight', () => ({ useSyntaxHighlight: () => null }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

const GUIDE = {
  summary: 'Refunds for partly shipped orders.',
  chapters: [
    { title: 'Refund maths', intent: 'How much goes back.', check: '', files: [[1, 'the total']] },
  ],
  focus: [],
};

function agentReply(text: unknown) {
  return {
    status: 'ok' as const,
    data: { text: JSON.stringify(text), provider: 'claude', model: 'sonnet', durationMs: 900 },
  };
}

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
          worktreeSubfolder: '',
        } as RepoSettings,
      ],
      summaries: { ...DEFAULTS.summaries!, ...summaries },
    },
  });
}

function prWith(overrides: Parameters<typeof refundPr>[0] = {}) {
  return makePr(refundPr(overrides));
}

let pr = prWith();
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.classList.add('reduce-motion');
  useQuickReviewStore.getState().endSession();
  useQuickReviewStore.setState({ documents: {} });
  useReviewGuideStore.setState({ entries: {} });
  resetRiskAssessments();
  settings();
  pr = prWith();
  vi.mocked(getPRReviewDetails).mockImplementation(async () => ({
    pr: pr.pullRequest,
    baseSha: 'base',
  }));
  vi.mocked(getPRFiles).mockResolvedValue(REFUND_FILES);
  vi.mocked(getPRCommits).mockResolvedValue([]);
  vi.mocked(loadTabData).mockResolvedValue(null);
  vi.mocked(getTextFileAtRef).mockImplementation(
    async (_c, _o, _r, path) => REFUND_SOURCES[path] ?? null,
  );
  vi.mocked(commands.runHeadlessPrompt).mockImplementation(async ({ prompt }) =>
    agentReply(prompt.startsWith(RISK_PROMPT_TITLE) ? REFUND_ANSWER : GUIDE),
  );
});
afterEach(() => {
  cleanup();
  useSettingsStore.setState({ settings: DEFAULTS });
  document.documentElement.classList.remove('reduce-motion');
});

async function start() {
  useQuickReviewStore.getState().startSinglePr(pr);
  render(<QuickReviewOverlay />);
  const button = await screen.findByRole('button', { name: 'Review files' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
const card = () => screen.getByRole('article', { name: /Pull request #4821/ });
const riskSection = () => screen.getByRole('region', { name: 'Regression risk' });
function riskPrompts() {
  return vi
    .mocked(commands.runHeadlessPrompt)
    .mock.calls.map((c) => c[0].prompt)
    .filter((p) => p.startsWith(RISK_PROMPT_TITLE));
}

describe('Regression risk in Quick Review', () => {
  it('assesses the PR as it opens and puts risk first, above the guide, with a header chip', async () => {
    await start();
    await within(card()).findByText(/A refund that names a cancelled line pays it out in full/);
    expect(within(card()).getByText('High risk')).toBeInTheDocument();
    const guide = await screen.findByRole('region', { name: 'Review guide' });
    expect(
      riskSection().compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(riskPrompts()).toHaveLength(1);
    expect(getTextFileAtRef).toHaveBeenCalledWith(
      mockClient,
      'acme',
      'shop',
      'src/refunds/refundable-lines.ts',
      REFUND_HEAD,
    );
  });

  it('leaves Enter on a risk control to the control: no walk, no approval', async () => {
    await start();
    const title = await screen.findByRole('button', {
      name: 'Shipping refunds split over three or more lines',
    });
    title.focus();
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(document.querySelector('.qr-walk')).toBeNull();
    expect(useQuickReviewStore.getState().decisions.size).toBe(0);
    // Elsewhere Enter still opens the files while Approve is blocked.
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await waitFor(() => expect(document.querySelector('.qr-walk')).not.toBeNull());
  });

  it('opens the walk at a cited line: tagged in the tree, explained above the diff and under the line', async () => {
    await start();
    await within(card()).findByText(/A refund that names a cancelled line/);
    fireEvent.click(await screen.findByRole('button', { name: 'calculate.ts:139–141' }));
    const walk = await screen.findByRole('region', { name: 'File walk' });
    expect(walk.querySelector('.qr-file[aria-current]')).toHaveAttribute(
      'title',
      'src/refunds/calculate.ts',
    );
    expect(within(walk).getByRole('img', { name: 'Cited by R1' })).toBeInTheDocument();
    const strip = walk.querySelector('[data-quick-review-risk]') as HTMLElement;
    expect(strip).toHaveTextContent('R1 · High');
    expect(strip).toHaveTextContent('Lines139–141, 138 (removed)');
    const marks = [...walk.querySelectorAll('.qr-risk-linemark')];
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]).toHaveTextContent('Refunds on orders with a cancelled line');
    const cited = walk.querySelector<HTMLElement>(
      'tr:not([data-line-kind="del"])[data-line-no="139"]',
    );
    expect(cited?.style.boxShadow).toContain('inset');

    // The strip's reason goes back to the card, open at that reason.
    fireEvent.click(within(strip).getByRole('button', { name: /Refunds on orders/ }));
    await waitFor(() =>
      expect(
        within(card()).getByRole('button', { name: 'Refunds on orders with a cancelled line' }),
      ).toHaveFocus(),
    );
  });

  it('assesses a dependency update that gets no guide', async () => {
    // Its own head: a snapshot an earlier test loaded would be reused.
    pr = prWith({
      headSha: 'd3b0dep0000000000000000000000000000bump',
      authorLogin: 'dependabot[bot]',
      title: 'Bump money-fmt from 2.4.1 to 3.0.0',
      additions: 1,
      deletions: 1,
      changedFiles: 1,
    });
    vi.mocked(getPRFiles).mockResolvedValue([REFUND_FILES[4]!]);
    vi.mocked(commands.runHeadlessPrompt).mockImplementation(async () =>
      agentReply({
        verdict: 'assessed',
        unknownWhy: '',
        headline: 'Adds a nullable column; nothing existing reads it.',
        reasons: [REFUND_ANSWER.reasons[4]],
      }),
    );
    await start();
    await within(card()).findByText('Adds a nullable column; nothing existing reads it.');
    expect(riskSection()).toHaveTextContent(
      'No guide (a dependency update). Risk is assessed anyway.',
    );
    expect(within(card()).getByText('Low risk')).toBeInTheDocument();
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(1);
  });

  it("marks an older head's assessment stale, and leaves the diff's lines unmarked", async () => {
    settings({ autoRiskAssessment: false });
    pr = prWith({ headSha: REFUND_NEXT_HEAD });
    vi.mocked(loadTabData).mockImplementation(async (_o, _r, _n, type) =>
      type === 'riskAssessment'
        ? { data: refundAssessment(), prUpdatedAt: REFUND_HEAD, cachedAt: 'then' }
        : null,
    );
    await start();
    await within(card()).findByText('High risk · older commit');
    expect(riskSection()).toHaveTextContent('The head moved since this assessment.');
    expect(riskPrompts()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Review files' }));
    const walk = await screen.findByRole('region', { name: 'File walk' });
    expect(walk.querySelector('[data-quick-review-risk]')).toHaveTextContent(
      'Assessed at 9c41e7a.',
    );
    expect(walk.querySelector('.qr-risk-linemark')).toBeNull();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await act(async () => {});
    fireEvent.click(await screen.findByRole('button', { name: 'Assess head' }));
    await within(card()).findByText('High risk');
    expect(riskPrompts()).toHaveLength(1);
  });
});
