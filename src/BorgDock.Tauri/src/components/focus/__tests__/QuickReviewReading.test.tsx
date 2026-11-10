import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands } from '@/generated/commands';
import { loadTabData } from '@/services/cache';
import {
  getCommitFiles,
  getPRCommits,
  getPRFiles,
  getPRReviewDetails,
} from '@/services/github/pulls';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { guideKey, useReviewGuideStore } from '@/stores/review-guide-store';
import { useSettingsStore } from '@/stores/settings-store';
import { QuickReviewOverlay } from '../QuickReviewOverlay';
import { makePr, resetSeq } from './helpers';

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

const MOVED = [
  'export function roundPerShift(shift: Shift, rule: Rule) {',
  '  return shift.parts.map((part) => rule.round(part.minutes));',
  '}',
  'export const QUARTER = 15;',
];

const files = [
  {
    filename: 'src/Workspace.tsx',
    sha: 'w',
    status: 'modified',
    // Enough changed lines for a guide: a small change gets none.
    additions: 80,
    deletions: 2,
    patch:
      '@@ -1,2 +1,2 @@\n-if (x) {\n-return y;\n+if (x) {\n+    return y;\n@@ -20,1 +20,2 @@\n context();\n+renderHiddenFields();',
  },
  {
    filename: 'src/hooks/useLayout.ts',
    sha: 'h',
    status: 'modified',
    additions: 1,
    deletions: 0,
    patch: '@@ -5,1 +5,2 @@\n const a = 1;\n+export const hiddenFields = [];',
  },
  {
    filename: 'src/rounding.ts',
    sha: 'r',
    status: 'modified',
    additions: 0,
    deletions: 3,
    patch: `@@ -10,4 +10,1 @@\n keep();\n${MOVED.map((l) => `-${l}`).join('\n')}`,
  },
  {
    filename: 'src/shift.ts',
    sha: 's',
    status: 'added',
    additions: 3,
    deletions: 0,
    patch: `@@ -0,0 +1,3 @@\n${MOVED.map((l) => `+${l}`).join('\n')}`,
  },
];

const GUIDE = {
  summary: 'Shows which saved filters the layout hides.',
  focus: ['The hook memoises on the layout object.'],
  chapters: [
    {
      title: 'Hook exposes hidden fields',
      intent: 'The workspace needs to know what is hidden.',
      check: 'Memoisation.',
      files: [{ path: 'src/hooks/useLayout.ts', why: 'returns hiddenFields' }],
    },
    {
      title: 'Workspace renders them',
      intent: 'Planners see why results narrowed.',
      check: '',
      files: [{ path: 'src/Workspace.tsx', why: 'new section' }],
    },
  ],
};

/** The agent's answer for `GUIDE`: files by their number in the prompt. */
const ANSWER = {
  ...GUIDE,
  chapters: [
    { ...GUIDE.chapters[0]!, files: [[1, 'returns hiddenFields']] },
    { ...GUIDE.chapters[1]!, files: [[4, 'new section']] },
  ],
};

function guideAnswer(text = JSON.stringify(ANSWER)) {
  return {
    status: 'ok' as const,
    data: { text, provider: 'claude', model: 'sonnet', durationMs: 900 },
  };
}

const SETTINGS = useSettingsStore.getState().settings;
function writeGuidesAutomatically(on: boolean) {
  useSettingsStore.setState({
    settings: { ...SETTINGS, summaries: { ...SETTINGS.summaries!, autoReviewGuide: on } },
  });
}

let pr = makePr();
beforeEach(() => {
  vi.clearAllMocks();
  resetSeq();
  localStorage.clear();
  document.documentElement.classList.add('reduce-motion');
  useQuickReviewStore.getState().endSession();
  useQuickReviewStore.setState({ documents: {} });
  useReviewGuideStore.setState({ entries: {} });
  pr = makePr({ changedFiles: files.length, body: 'Body' });
  vi.mocked(getPRReviewDetails).mockResolvedValue({ pr: pr.pullRequest, baseSha: 'base' });
  vi.mocked(getPRFiles).mockResolvedValue(files);
  vi.mocked(getPRCommits).mockResolvedValue([]);
  vi.mocked(commands.runHeadlessPrompt).mockResolvedValue(guideAnswer());
});
afterEach(() => {
  cleanup();
  useSettingsStore.setState({ settings: SETTINGS });
  document.documentElement.classList.remove('reduce-motion');
});

async function start() {
  useQuickReviewStore.getState().startSinglePr(pr);
  render(<QuickReviewOverlay />);
  const button = await screen.findByRole('button', { name: 'Review files' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
function press(key: string) {
  fireEvent.keyDown(document, { key });
}
function currentFile() {
  return document.querySelector('.qr-file[aria-current]')?.getAttribute('title');
}
function tree() {
  return screen.getByRole('navigation', { name: /Review path|Commits/ });
}
/** The tree's groups: chapters in Guide order, folders in Folders order. */
function groupNames() {
  return [...tree().querySelectorAll('.qr-fold')].map((g) => g.getAttribute('aria-label'));
}

describe('Review guide', () => {
  it('summarises the PR on the card and walks the files in its chapters', async () => {
    const button = await start();
    await screen.findByText('Shows which saved filters the layout hides.');
    expect(screen.getByText('The hook memoises on the layout object.')).toBeInTheDocument();
    expect(screen.getByText('Written by Claude · sonnet')).toBeInTheDocument();

    fireEvent.click(button);
    expect(currentFile()).toBe('src/hooks/useLayout.ts');
    expect(groupNames()).toEqual([
      '1. Hook exposes hidden fields',
      '2. Workspace renders them',
      '3. Other changes',
    ]);
    const strip = document.querySelector('[data-quick-review-chapter]') as HTMLElement;
    expect(strip).toHaveTextContent('Chapter 1 of 3');
    expect(strip).toHaveTextContent('returns hiddenFields');
    expect(strip).toHaveTextContent('Memoisation.');

    press('n');
    expect(currentFile()).toBe('src/Workspace.tsx');
    expect(document.querySelector('[data-quick-review-chapter]')).toHaveTextContent(
      'Chapter 2 of 3',
    );
    const prompt = vi.mocked(commands.runHeadlessPrompt).mock.calls[0]![0];
    expect(prompt.provider).toBe('claude');
    expect(prompt.prompt).toContain('### [4] src/Workspace.tsx');
  });

  describe('with another PR queued', () => {
    let next = makePr();
    /** `headSha` is the test's own: a snapshot an earlier test loaded would be reused. */
    function startQueue(headSha: string) {
      next = makePr({ changedFiles: files.length, title: 'Round per shift', headSha });
      vi.mocked(getPRReviewDetails).mockImplementation(async (_client, _owner, _repo, number) => ({
        pr: number === next.pullRequest.number ? next.pullRequest : pr.pullRequest,
        baseSha: 'base',
      }));
      useQuickReviewStore.getState().startSession([pr, next]);
      render(<QuickReviewOverlay />);
    }
    function nextGuide() {
      return useReviewGuideStore.getState().entries[guideKey(next.pullRequest)];
    }

    it('writes the next guide while you read this one', async () => {
      startQueue('ahead');
      await screen.findByText('Shows which saved filters the layout hides.');
      await waitFor(() => expect(nextGuide()?.status).toBe('ready'));
      const prompts = vi.mocked(commands.runHeadlessPrompt).mock.calls.map((c) => c[0].prompt);
      expect(prompts).toHaveLength(2);
      expect(prompts[1]).toContain(`# Round per shift (#${next.pullRequest.number})`);
    });

    it('leaves the next guide alone in Folders order', async () => {
      localStorage.setItem('borgdock-quick-review-order', 'folders');
      startQueue('folders');
      // Its files are loaded ahead (two reads of the PR around them), its guide is not.
      await waitFor(() =>
        expect(
          vi.mocked(getPRReviewDetails).mock.calls.filter((c) => c[3] === next.pullRequest.number),
        ).toHaveLength(2),
      );
      await act(async () => {});
      expect(nextGuide()).toBeUndefined();
      expect(commands.runHeadlessPrompt).not.toHaveBeenCalled();
    });
  });

  it('starts the walk at the top of the guide once it is written', async () => {
    let answer: (value: ReturnType<typeof guideAnswer>) => void = () => {};
    vi.mocked(commands.runHeadlessPrompt).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const button = await start();
    fireEvent.click(button);
    // While the guide is written the tree shows folders; read on to another file.
    expect(groupNames()).toEqual(['src/hooks', 'src']);
    press('n');
    expect(currentFile()).toBe('src/rounding.ts');

    answer(guideAnswer());
    await within(tree()).findByText('3 chapters by Claude · sonnet');
    expect(currentFile()).toBe('src/hooks/useLayout.ts');
    expect(document.querySelector('[data-quick-review-chapter]')).toHaveTextContent(
      'Chapter 1 of 3',
    );
  });

  it('opens the walk at a chapter chosen on the card', async () => {
    await start();
    fireEvent.click(await screen.findByRole('button', { name: /Workspace renders them/ }));
    expect(currentFile()).toBe('src/Workspace.tsx');
  });

  it('shows folders while the guide failed, and asks again on Retry', async () => {
    vi.mocked(commands.runHeadlessPrompt).mockResolvedValueOnce({
      status: 'error',
      error: 'claude exited with 1: not logged in',
    });
    const button = await start();
    await screen.findByText(/No guide: claude exited with 1/, { selector: 'p' });
    fireEvent.click(button);
    expect(within(tree()).getByText(/No guide: claude exited/)).toBeInTheDocument();
    expect(groupNames()).toEqual(['src/hooks', 'src']);

    fireEvent.click(within(tree()).getByRole('button', { name: 'Retry' }));
    await within(tree()).findByText('3 chapters by Claude · sonnet');
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(2);
  });

  it('waits for Write guide when guides are not written automatically', async () => {
    writeGuidesAutomatically(false);
    const button = await start();
    const card = await screen.findByRole('region', { name: 'Review guide' });
    expect(card).toHaveTextContent('Claude can read the diff and order the files into chapters.');
    expect(commands.runHeadlessPrompt).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(within(tree()).getByText(/No guide yet/)).toBeInTheDocument();
    expect(groupNames()).toEqual(['src/hooks', 'src']);

    fireEvent.click(within(tree()).getByRole('button', { name: 'Write guide' }));
    await within(tree()).findByText('3 chapters by Claude · sonnet');
    expect(commands.runHeadlessPrompt).toHaveBeenCalledTimes(1);
    expect(groupNames()[0]).toBe('1. Hook exposes hidden fields');
  });

  it('writes no guide for a small change until Write guide', async () => {
    const small = files.map((file) => ({ ...file, additions: Math.min(file.additions, 3) }));
    vi.mocked(getPRFiles).mockResolvedValue(small);
    pr = makePr({ changedFiles: small.length, headSha: 'small' });
    vi.mocked(getPRReviewDetails).mockResolvedValue({ pr: pr.pullRequest, baseSha: 'base' });
    const button = await start();
    const card = await screen.findByRole('region', { name: 'Review guide' });
    expect(card).toHaveTextContent('A small change: 6 lines in 2 files.');
    expect(commands.runHeadlessPrompt).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(within(tree()).getByText('A small change: 6 lines in 2 files.')).toBeVisible();
    fireEvent.click(within(tree()).getByRole('button', { name: 'Write guide' }));
    await within(tree()).findByText('3 chapters by Claude · sonnet');
  });

  it('still shows a guide written earlier when guides are not written automatically', async () => {
    writeGuidesAutomatically(false);
    vi.mocked(loadTabData).mockResolvedValueOnce({
      data: {
        ...GUIDE,
        headSha: pr.pullRequest.headSha,
        provider: 'claude',
        model: 'sonnet',
        durationMs: 900,
        createdAt: '2026-10-30T10:00:00Z',
      },
      prUpdatedAt: pr.pullRequest.headSha,
    } as never);
    await start();
    await screen.findByText('Shows which saved filters the layout hides.');
    expect(commands.runHeadlessPrompt).not.toHaveBeenCalled();
  });

  it('does not ask the agent in Folders order', async () => {
    localStorage.setItem('borgdock-quick-review-order', 'folders');
    await start();
    expect(commands.runHeadlessPrompt).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Review guide' })).toBeNull();
  });
});

describe('Noise', () => {
  it('folds whitespace and moved hunks to one line that opens them', async () => {
    localStorage.setItem('borgdock-quick-review-order', 'folders');
    fireEvent.click(await start());
    fireEvent.click(within(tree()).getByRole('button', { name: /Workspace\.tsx/ }));
    const fold = screen.getByRole('button', { name: /Whitespace only/ });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('return y;')).toBeNull();
    expect(screen.getByText('renderHiddenFields();')).toBeInTheDocument();

    fireEvent.click(fold);
    expect(screen.getByRole('button', { name: /Whitespace only/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getAllByText('return y;')).toHaveLength(2);

    // Both ends of the move: the file it left and the one it arrived in.
    expect(within(tree()).getAllByRole('img', { name: 'Mechanical: Moved code' })).toHaveLength(2);
    fireEvent.click(within(tree()).getByRole('button', { name: /shift\.ts/ }));
    expect(screen.getByRole('button', { name: /Moved from rounding\.ts:11/ })).toBeInTheDocument();
    expect(screen.getByText('Moved code, mark reviewed')).toBeInTheDocument();
  });
});

describe('Commits order', () => {
  const commits = [
    {
      sha: 'c1aaaaaaaa',
      message: 'Expose hidden fields\n\nThe hook returns them now.',
      authorLogin: 'mvisser',
      authorAvatarUrl: '',
      date: '2026-10-29T10:00:00Z',
    },
    {
      sha: 'c2bbbbbbbb',
      message: 'Render the section',
      authorLogin: 'mvisser',
      authorAvatarUrl: '',
      date: '2026-10-29T11:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.mocked(getPRCommits).mockResolvedValue(commits);
    vi.mocked(getCommitFiles).mockImplementation(async (_c, _o, _r, sha) =>
      sha === 'c1aaaaaaaa' ? [files[1]!] : [files[0]!],
    );
  });

  it('reads the PR commit by commit and offers to mark the files once all are read', async () => {
    fireEvent.click(await start());
    fireEvent.click(screen.getByRole('button', { name: 'Commits' }));
    await within(tree()).findByText('Expose hidden fields');
    await screen.findByText('Commit 1 of 2');
    expect(document.querySelector('[data-quick-review-commit]')).toHaveTextContent(
      'The hook returns them now.',
    );
    await screen.findByText('export const hiddenFields = [];');
    expect(screen.getByRole('button', { name: /Next commit/ })).toBeEnabled();

    press('v');
    expect(
      within(tree()).getByRole('checkbox', { name: 'Read: Expose hidden fields' }),
    ).toHaveAttribute('aria-checked', 'true');
    await screen.findByText('Commit 2 of 2');
    await screen.findByText('renderHiddenFields();');

    press('v');
    fireEvent.click(await screen.findByRole('button', { name: 'Mark 4 files reviewed' }));
    await screen.findByText(/All 4 files reviewed/);
  });
});
