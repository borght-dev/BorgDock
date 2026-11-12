import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { prRowKey } from '@/components/pr/pr-card-data';
import type { GitHubClient } from '@/services/github/client';
import { enableAutoMerge, submitReview } from '@/services/github/mutations';
import { getPRFiles, getPRReviewDetails } from '@/services/github/pulls';
import { getAllComments, getReviews } from '@/services/github/reviews';
import { loadCachedReviewSnapshot } from '@/services/quick-review';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { resetRiskAssessments } from '@/stores/risk-assessment-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useToastStore } from '@/stores/toast-store';
import type { PullRequestWithChecks } from '@/types';
import { QuickReviewOverlay } from '../QuickReviewOverlay';
import { makePr, resetSeq } from './helpers';

vi.mock('@/services/github/pulls', () => ({ getPRFiles: vi.fn(), getPRReviewDetails: vi.fn() }));
vi.mock('@/services/github/mutations', () => ({
  submitReview: vi.fn(),
  enableAutoMerge: vi.fn().mockResolvedValue('enabled'),
}));
vi.mock('@/services/github/reviews', () => ({
  getAllComments: vi.fn().mockResolvedValue([]),
  getReviews: vi.fn().mockResolvedValue([]),
}));
let mockClient = vi.hoisted(() => ({
  account: 'reviewer',
  get: vi.fn().mockRejectedValue(new Error('Unavailable')),
}));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => mockClient }));
/** `prs`: review requested of me; `open`: every open PR (an author's next one comes from these). */
const reviewCandidates = vi.hoisted(() => ({
  prs: [] as PullRequestWithChecks[],
  open: [] as PullRequestWithChecks[],
}));
vi.mock('@/stores/pr-store', () => {
  const state = () => ({
    needsMyReview: () => reviewCandidates.prs,
    pullRequests: reviewCandidates.open,
    username: 'reviewer',
    refreshPr: vi.fn().mockResolvedValue(null),
    recordApproval: vi.fn(),
  });
  return {
    usePrStore: Object.assign(
      (selector: (s: ReturnType<typeof state>) => unknown) => selector(state()),
      { getState: state },
    ),
  };
});
vi.mock('@/hooks/useSyntaxHighlight', () => ({ useSyntaxHighlight: () => null }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

const files = [
  {
    filename: 'App.Tests/ServiceTests.cs',
    sha: 't',
    status: 'added',
    additions: 1,
    deletions: 0,
    patch: '@@ -0,0 +1 @@\n+test();',
  },
  {
    filename: 'src/Service.cs',
    sha: 's',
    status: 'modified',
    additions: 2,
    deletions: 1,
    patch: '@@ -10,2 +10,3 @@\n-old();\n+first();\n+second();\n context();',
  },
  {
    filename: 'src/service.test.ts',
    sha: 'j',
    status: 'added',
    additions: 1,
    deletions: 0,
    patch: '@@ -0,0 +1 @@\n+test();',
  },
  {
    filename: 'bun.lock',
    sha: 'l',
    status: 'modified',
    additions: 3,
    deletions: 1,
    patch: '@@ -1,1 +1,3 @@\n-a\n+b\n+c\n+d',
  },
];
/** The walk's order: source, then generated, then tests. */
const WALK = ['src/Service.cs', 'bun.lock', 'App.Tests/ServiceTests.cs', 'src/service.test.ts'];

let pr = makePr();
const DEFAULT_SETTINGS = useSettingsStore.getState().settings;
beforeEach(() => {
  vi.clearAllMocks();
  // No agent runs here: the risk assessment has its own suite.
  resetRiskAssessments();
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      summaries: { ...DEFAULT_SETTINGS.summaries!, autoRiskAssessment: false },
    },
  });
  mockClient = { ...mockClient };
  reviewCandidates.prs = [];
  reviewCandidates.open = [];
  resetSeq();
  // Transitions finish at once: the walk unmounts and the overlay closes
  // without waiting for their animations.
  document.documentElement.classList.add('reduce-motion');
  useQuickReviewStore.getState().endSession();
  useQuickReviewStore.setState({ documents: {}, activity: {} });
  useToastStore.getState().clear();
  pr = makePr({
    changedFiles: files.length,
    body: '# Full description\n\nAll details are visible.',
  });
  vi.mocked(getPRReviewDetails).mockResolvedValue({ pr: pr.pullRequest, baseSha: 'base' });
  vi.mocked(getPRFiles).mockResolvedValue(files);
  vi.mocked(submitReview).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  document.documentElement.classList.remove('reduce-motion');
});

async function start() {
  useQuickReviewStore.getState().startSession([pr, makePr({ number: 42 })]);
  const view = render(<QuickReviewOverlay />);
  await waitFor(() => expect(filesButton()).toBeEnabled());
  return view;
}
function filesButton() {
  return screen.getByRole('button', {
    name: /^(Review files|Continue reviewing · \d+ left|Review files again)$/,
  });
}
function openFiles() {
  fireEvent.click(filesButton());
}
function approveButton() {
  return screen.getByRole('button', { name: 'Approve' });
}
/** Approve is blocked with `aria-disabled`: still focusable, click ignored. */
function expectApproveBlocked() {
  expect(approveButton()).toHaveAttribute('aria-disabled', 'true');
  expect(approveButton()).not.toBeDisabled();
}
function expectApproveOpen() {
  expect(approveButton()).not.toHaveAttribute('aria-disabled');
  expect(approveButton()).toBeEnabled();
}
function press(key: string) {
  fireEvent.keyDown(document, { key });
}
function currentFile() {
  return document.querySelector('.qr-file[aria-current]')?.getAttribute('title');
}
/** Back from the walk to the card: Finish is gone, Esc does it. */
function finishWalk() {
  press('Escape');
}
/** Runs out the approval's Undo toast, which posts the review. */
function sendHeldApproval() {
  const toast = useToastStore.getState().toasts.find((t) => t.actionLabel === 'Undo');
  if (!toast) throw new Error('No approval is waiting for Undo');
  act(() => {
    useToastStore.getState().dismiss(toast.id);
    toast.onExpire?.();
  });
}
function treeProgress() {
  return document.querySelector('[data-quick-review-progress]')?.textContent;
}
async function addDraft(side: 'old' | 'new' = 'new') {
  openFiles();
  fireEvent.click(screen.getByRole('button', { name: `Comment on ${side} line 10` }));
  fireEvent.change(screen.getByPlaceholderText('Describe the issue or suggest a change...'), {
    target: { value: 'Please handle failure.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
}
/** Marks every file reviewed from the walk, with Skip generated and V. */
function reviewEverything() {
  openFiles();
  fireEvent.click(screen.getByRole('button', { name: 'Skip generated' }));
  for (let i = 0; i < 3; i++) press('v');
  finishWalk();
}

describe('Quick review card', () => {
  it('preloads the next PR after the current files are ready and reuses it on advance', async () => {
    const next = makePr({ number: 42, changedFiles: files.length });
    vi.mocked(getPRReviewDetails).mockImplementation(async (_client, _owner, _repo, number) => ({
      pr: number === 42 ? next.pullRequest : pr.pullRequest,
      baseSha: 'base',
    }));
    useQuickReviewStore.getState().startSession([pr, next]);
    render(<QuickReviewOverlay />);
    await waitFor(() => expect(filesButton()).toBeEnabled());
    await waitFor(() => expect(getPRFiles).toHaveBeenCalledWith(mockClient, 'owner', 'repo', 42));
    await act(async () => {
      await loadCachedReviewSnapshot(mockClient as unknown as GitHubClient, next.pullRequest);
      useQuickReviewStore.getState().advance('skipped');
    });
    await waitFor(() => expect(filesButton()).toBeEnabled());
    expect(getPRFiles).toHaveBeenCalledTimes(2);
  });

  it('A defaults to approval and auto merge when auto merge is off', async () => {
    await start();
    reviewEverything();
    expect(screen.getByRole('button', { name: 'Approve & auto-merge' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Enter A ArrowRight',
    );
    press('a');
    expect(submitReview).not.toHaveBeenCalled();
    sendHeldApproval();
    await waitFor(() => expect(enableAutoMerge).toHaveBeenCalledTimes(1));
    expect(submitReview).toHaveBeenCalledTimes(1);
  });

  it('A only approves when auto merge is already enabled', async () => {
    pr.pullRequest.autoMergeEnabled = true;
    await start();
    reviewEverything();
    expect(screen.queryByRole('button', { name: 'Approve & auto-merge' })).not.toBeInTheDocument();
    expect(approveButton()).toHaveAttribute('aria-keyshortcuts', 'Enter A ArrowRight');
    press('a');
    sendHeldApproval();
    await waitFor(() => expect(submitReview).toHaveBeenCalledTimes(1));
    expect(enableAutoMerge).not.toHaveBeenCalled();
  });

  it('keeps plain Approve available when auto merge is off', async () => {
    await start();
    reviewEverything();
    fireEvent.click(approveButton());
    sendHeldApproval();
    await waitFor(() => expect(submitReview).toHaveBeenCalledTimes(1));
    expect(enableAutoMerge).not.toHaveBeenCalled();
  });

  it('moves to the next PR while GitHub is still merging', async () => {
    vi.mocked(enableAutoMerge).mockReturnValueOnce(new Promise(() => {}));
    await start();
    reviewEverything();
    press('a');
    expect(useQuickReviewStore.getState().currentIndex).toBe(1);
    sendHeldApproval();
    await waitFor(() => expect(enableAutoMerge).toHaveBeenCalledTimes(1));
  });

  it('toasts when auto merge fails after the card moved on', async () => {
    vi.mocked(enableAutoMerge).mockRejectedValueOnce(new Error('Merge conflict'));
    await start();
    reviewEverything();
    press('a');
    sendHeldApproval();
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(
        expect.arrayContaining([
          `Approved #${pr.pullRequest.number}`,
          'Approved; auto-merge not enabled: Merge conflict',
        ]),
      ),
    );
    expect(useQuickReviewStore.getState().currentIndex).toBe(1);
  });

  it('trusts a snapshot loaded moments ago instead of asking GitHub again', async () => {
    const readsOfThisPr = () =>
      vi.mocked(getPRReviewDetails).mock.calls.filter(([, , , n]) => n === pr.pullRequest.number)
        .length;
    await start();
    const loads = readsOfThisPr();
    reviewEverything();
    press('a');
    sendHeldApproval();
    await waitFor(() => expect(submitReview).toHaveBeenCalledTimes(1));
    expect(readsOfThisPr()).toBe(loads);
  });
  it('renders nothing while idle', () =>
    expect(render(<QuickReviewOverlay />).container.innerHTML).toBe(''));

  it('opens on the card with the files by folder and what is left to review', async () => {
    await start();
    const card = screen.getByRole('article', { name: `Pull request #${pr.pullRequest.number}` });
    expect(within(card).getByText('All details are visible.')).toBeInTheDocument();
    expect(within(card).getByText('3 of 3 to review, 1 generated')).toBeInTheDocument();
    expect(within(card).getByText('Generated').closest('details')).toHaveAttribute(
      'data-generated',
      'true',
    );
    expect(screen.getByText('PR 1 / 2')).toBeInTheDocument();
    // The next PR peeks behind the top card.
    expect(document.querySelector('.qr-card[data-i="1"]')).toHaveTextContent('#42');
  });

  it('keeps Approve disabled, with the reason, until every non-generated file is reviewed', async () => {
    await start();
    expectApproveBlocked();
    expect(approveButton()).toHaveAccessibleDescription('3 files not reviewed yet');
    // The reason is a visible line under the actions, not only a tooltip.
    expect(document.querySelector('.qr-act-note')).toHaveTextContent('3 files not reviewed yet');
    fireEvent.click(approveButton());
    press('ArrowRight');
    expect(submitReview).not.toHaveBeenCalled();

    openFiles();
    press('v'); // src/Service.cs
    finishWalk();
    expect(approveButton()).toHaveAccessibleDescription('2 files not reviewed yet');
    expect(filesButton()).toHaveTextContent('Continue reviewing');

    openFiles();
    // Generated files do not count: the two tests are enough.
    fireEvent.click(screen.getByRole('button', { name: /ServiceTests\.cs/ }));
    press('v');
    press('v');
    // Only the generated lockfile is left: the footer is already the decision bar.
    expect(screen.getByRole('button', { name: 'Approve & auto-merge' })).toBeInTheDocument();
    finishWalk();
    expectApproveOpen();
    expect(filesButton()).toHaveTextContent('Review files again');
    expect(screen.getByText('0 of 3 to review, 1 generated')).toBeInTheDocument();
  });

  it('approves with → once the files are reviewed, and moves to the next PR', async () => {
    vi.mocked(getPRReviewDetails).mockResolvedValue({
      pr: { ...pr.pullRequest, state: 'OPEN' },
      baseSha: 'base',
    });
    await start();
    reviewEverything();
    press('ArrowRight');
    sendHeldApproval();
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith(
        expect.anything(),
        'owner',
        'repo',
        pr.pullRequest.number,
        'APPROVE',
        '',
        { commit_id: pr.pullRequest.headSha, comments: [] },
      ),
    );
    await waitFor(() => expect(useQuickReviewStore.getState().currentIndex).toBe(1));
    expect(useQuickReviewStore.getState().decisions.get(prRowKey(pr.pullRequest))).toBe('approved');
    expect(screen.getByText('PR 2 / 2')).toBeInTheDocument();
    expectApproveBlocked();
  });

  it('opens Write review with W and approves with A after finishing the files', async () => {
    await start();
    press('w');
    expect(screen.getByRole('heading', { name: 'Your review' })).toBeVisible();
    press('Escape');
    reviewEverything();
    press('A');
    sendHeldApproval();
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith(
        expect.anything(),
        'owner',
        'repo',
        pr.pullRequest.number,
        'APPROVE',
        '',
        { commit_id: pr.pullRequest.headSha, comments: [] },
      ),
    );
  });

  it('flings an approved card right and a card left for later', async () => {
    document.documentElement.classList.remove('reduce-motion');
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Review later' }));
    expect(useQuickReviewStore.getState().decisions.get(prRowKey(pr.pullRequest))).toBe('skipped');
    const gone = document.querySelector('.qr-card--gone-left');
    expect(gone).toHaveTextContent(pr.pullRequest.title);
    expect(document.querySelector('.qr-deck')).toHaveAttribute('data-rise', 'true');
    expect(screen.getByText('PR 2 / 2')).toBeInTheDocument();
  });

  it('skips a PR with ← (Review later)', async () => {
    await start();
    press('ArrowLeft');
    expect(useQuickReviewStore.getState().currentIndex).toBe(1);
    expect(useQuickReviewStore.getState().decisions.get(prRowKey(pr.pullRequest))).toBe('skipped');
  });

  it('closes with Esc from the card', async () => {
    await start();
    press('Escape');
    expect(useQuickReviewStore.getState().state).toBe('idle');
  });

  it('reports a load failure with retry and keeps the description', async () => {
    vi.mocked(getPRFiles).mockRejectedValueOnce(new Error('Files unavailable'));
    useQuickReviewStore.getState().startSinglePr(pr);
    render(<QuickReviewOverlay />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-tone', 'error');
    expect(screen.getByText('All details are visible.')).toBeInTheDocument();
    expectApproveBlocked();
    // One failure state: nothing claims the files are still loading.
    const sidebar = within(screen.getByRole('complementary', { name: 'Review overview' }));
    expect(sidebar.queryByText(/loading/i)).toBeNull();
    expect(sidebar.getByText(/Couldn't load files/)).toBeInTheDocument();
    expect(sidebar.getByText("Files didn't load")).toBeInTheDocument();
    expect(document.querySelector('.qr-act-note')).toHaveTextContent("Files didn't load");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(filesButton()).toBeEnabled());
  });

  it('hides the queue position when only one PR is in review', async () => {
    useQuickReviewStore.getState().startSinglePr(pr);
    render(<QuickReviewOverlay />);
    await waitFor(() => expect(filesButton()).toBeEnabled());
    expect(screen.queryByText(/PR 1 \/ 1/)).toBeNull();
  });

  it('makes Approve the one primary once every file is reviewed, and Enter takes it', async () => {
    await start();
    expect(filesButton()).toHaveAttribute('aria-keyshortcuts', 'Enter');
    reviewEverything();
    expect(filesButton()).not.toHaveAttribute('aria-keyshortcuts');
    expect(filesButton()).not.toHaveClass('bd-btn--primary');
    press('Enter');
    expect(useQuickReviewStore.getState().currentIndex).toBe(1);
    sendHeldApproval();
    await waitFor(() => expect(enableAutoMerge).toHaveBeenCalledTimes(1));
  });
});

describe('Quick review file walk', () => {
  it('walks the files in review order with the tree marking what is done', async () => {
    await start();
    press('Enter');
    const tree = screen.getByRole('navigation', { name: 'Review path' });
    const names = [...tree.querySelectorAll('.qr-file')].map((b) => b.getAttribute('title'));
    expect(names).toEqual(WALK);
    expect(currentFile()).toBe('src/Service.cs');
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    expect(treeProgress()).toBe('0 of 4 reviewed3 left');

    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed & next' }));
    expect(treeProgress()).toBe('1 of 4 reviewed2 left');
    expect(currentFile()).toBe('bun.lock');
    const done = within(tree).getByRole('button', { name: /Service\.cs/, current: false });
    expect(done).toHaveAttribute('data-done', 'true');
    expect(within(tree).getByRole('checkbox', { name: 'Reviewed: Service.cs' })).toBeChecked();

    // The tree's checkbox takes the mark back, without leaving the current file.
    fireEvent.click(within(tree).getByRole('checkbox', { name: 'Reviewed: Service.cs' }));
    expect(treeProgress()).toBe('0 of 4 reviewed3 left');
    expect(currentFile()).toBe('bun.lock');
    fireEvent.click(within(tree).getByRole('checkbox', { name: 'Reviewed: Service.cs' }));
    expect(treeProgress()).toBe('1 of 4 reviewed2 left');

    press('n');
    expect(currentFile()).toBe('App.Tests/ServiceTests.cs');
    press('p');
    expect(currentFile()).toBe('bun.lock');
    press('p');
    expect(currentFile()).toBe('src/Service.cs');
    fireEvent.click(screen.getByRole('button', { name: 'Next file' }));
    expect(currentFile()).toBe('bun.lock');
  });

  it('scrolls the open diff with J/K without changing files', async () => {
    await start();
    openFiles();
    const pane = document.querySelector<HTMLElement>('[data-quick-review-content]')!;
    const scrollBy = vi.fn();
    pane.scrollBy = scrollBy;
    press('j');
    press('K');
    expect(scrollBy).toHaveBeenNthCalledWith(1, 0, 72);
    expect(scrollBy).toHaveBeenNthCalledWith(2, 0, -72);
    expect(currentFile()).toBe('src/Service.cs');
  });

  it('Skip generated marks only the generated files and then hides', async () => {
    await start();
    openFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Skip generated' }));
    const doc = Object.values(useQuickReviewStore.getState().documents)[0];
    expect(doc?.reviewed).toEqual(['bun.lock']);
    expect(screen.queryByRole('button', { name: 'Skip generated' })).toBeNull();
    expect(treeProgress()).toBe('1 of 4 reviewed3 left');
  });

  it('mark and next skips files already reviewed; the last mark turns the footer into the decision bar', async () => {
    await start();
    openFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Skip generated' }));
    press('v');
    // bun.lock is already reviewed: the next open file is the first test.
    expect(currentFile()).toBe('App.Tests/ServiceTests.cs');
    expect(screen.getByRole('button', { name: 'Approve · 2 left' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Finish review' })).toBeNull();
    press('v');
    press('v');
    expect(treeProgress()).toBe('4 of 4 revieweddone');
    expect(screen.getByText(/That was the last file/)).toBeVisible();
    const go = screen.getByRole('button', { name: 'Approve & auto-merge' });
    expect(document.activeElement).toBe(go);
    expect(screen.queryByRole('button', { name: 'Mark reviewed & next' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Review path' })).toBeInTheDocument();
  });

  it('moves focus into the tree on open and back to Review files on Esc', async () => {
    await start();
    openFiles();
    expect(document.activeElement).toHaveAttribute('title', 'src/Service.cs');
    expect(document.activeElement).toHaveAttribute('aria-current', 'step');
    press('Escape');
    expect(document.activeElement).toBe(filesButton());
  });

  it('ignores the card keys while the overlay animates out', async () => {
    document.documentElement.classList.remove('reduce-motion');
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    press('ArrowLeft');
    expect(useQuickReviewStore.getState().currentIndex).toBe(0);
    expect(useQuickReviewStore.getState().decisions.size).toBe(0);
    await waitFor(() => expect(useQuickReviewStore.getState().state).toBe('idle'));
  });

  it('Esc goes back to the card, a second Esc closes', async () => {
    await start();
    openFiles();
    press('Escape');
    expect(screen.queryByRole('navigation', { name: 'Review path' })).toBeNull();
    expect(useQuickReviewStore.getState().state).toBe('reviewing');
    press('Escape');
    expect(useQuickReviewStore.getState().state).toBe('idle');
  });

  it('can unmark a file with its checkbox', async () => {
    await start();
    openFiles();
    press('v');
    fireEvent.click(screen.getByRole('button', { name: /Service\.cs/ }));
    const box = screen.getByRole('checkbox', { name: 'Reviewed' });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(screen.getByRole('checkbox', { name: 'Mark reviewed' })).not.toBeChecked();
  });

  it('keeps reviewed progress on reopen, also for documents saved before the walk existed', async () => {
    const view = await start();
    openFiles();
    press('v');
    expect(treeProgress()).toBe('1 of 4 reviewed2 left');
    view.unmount();
    // Drop the new field, as an older build would have saved it.
    const [key, doc] = Object.entries(useQuickReviewStore.getState().documents)[0]!;
    const { walked: _walked, ...old } = doc;
    useQuickReviewStore.setState({ documents: { [key]: old } });
    render(<QuickReviewOverlay />);
    await waitFor(() => expect(screen.getByText('2 of 3 to review, 1 generated')).toBeVisible());
    expect(filesButton()).toHaveTextContent('Review files');
  });

  it('shows the comments beside the diff without leaving the file, draft or progress', async () => {
    await start();
    await addDraft();
    fireEvent.click(screen.getByRole('tab', { name: /Comments/ }));
    await screen.findByText('No comments yet.');
    expect(screen.getByText('1 of 4')).toBeVisible();
    expect(screen.getByText('Please handle failure.')).toBeVisible();
    expect(treeProgress()).toBe('0 of 4 reviewed3 left');
  });
});

describe('Quick review composer', () => {
  function compose() {
    fireEvent.click(screen.getByRole('button', { name: /^Write review/ }));
  }

  it('keeps unsaved text and saved comments while navigating and closing', async () => {
    const view = await start();
    await addDraft();
    press('n');
    press('p');
    expect(screen.getByText('Please handle failure.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
    fireEvent.change(screen.getByPlaceholderText('Describe the issue or suggest a change...'), {
      target: { value: 'Unfinished feedback' },
    });
    act(() => useQuickReviewStore.getState().endSession());
    view.unmount();
    act(() => useQuickReviewStore.getState().startSinglePr(pr));
    render(<QuickReviewOverlay />);
    await waitFor(() => expect(filesButton()).toBeEnabled());
    compose();
    expect(screen.getByDisplayValue('Unfinished feedback')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled();
  });

  it.each([
    'LEFT',
    'RIGHT',
  ] as const)('posts %s comments against the reviewed commit in one review', async (side) => {
    await start();
    await addDraft(side === 'LEFT' ? 'old' : 'new');
    finishWalk();
    compose();
    fireEvent.change(screen.getByPlaceholderText('Add overall feedback...'), {
      target: { value: 'Overall feedback' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith(
        expect.anything(),
        'owner',
        'repo',
        pr.pullRequest.number,
        'COMMENT',
        'Overall feedback',
        {
          commit_id: pr.pullRequest.headSha,
          comments: [{ path: 'src/Service.cs', line: 10, side, body: 'Please handle failure.' }],
        },
      ),
    );
    await waitFor(() => expect(useQuickReviewStore.getState().currentIndex).toBe(1));
  });

  it('keeps drafts after a failed submission, toasts the error, then permits retry', async () => {
    await start();
    await addDraft();
    finishWalk();
    compose();
    vi.mocked(submitReview).mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    await screen.findByRole('alert');
    expect(useQuickReviewStore.getState().currentIndex).toBe(0);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      'Review not submitted: Offline',
    ]);
    expect(screen.getByText('Please handle failure.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(useQuickReviewStore.getState().currentIndex).toBe(1));
  });

  it('blocks stale submission and preserves feedback for reattachment', async () => {
    await start();
    await addDraft();
    finishWalk();
    compose();
    const later = Date.now() + 60_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(later);
    onTestFinished(() => clock.mockRestore());
    vi.mocked(getPRReviewDetails).mockResolvedValue({
      pr: { ...pr.pullRequest, headSha: 'new-head' },
      baseSha: 'base',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    await screen.findByRole('alert');
    expect(submitReview).not.toHaveBeenCalled();
    vi.mocked(getPRFiles).mockResolvedValue(
      files.map((f) =>
        f.filename === 'src/Service.cs'
          ? { ...f, sha: 'new', patch: `${f.patch}\n+changed();` }
          : f,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload files' }));
    await screen.findByRole('button', { name: 'Choose new line' });
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled();
    expect(screen.getByText('Please handle failure.')).toBeInTheDocument();
  });

  it('requires an overall explanation for request changes and blocks A before files are reviewed', async () => {
    await start();
    press('a');
    expect(submitReview).not.toHaveBeenCalled();
    compose();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Review decision' })).getByRole('button', {
        name: 'Request changes',
      }),
    );
    const submit = document.querySelector('.qr-submit')!;
    expect(submit).toBeDisabled();
    expect(screen.getByText('Add an overall comment before requesting changes.')).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText('Add overall feedback...'), {
      target: { value: 'Needs work' },
    });
    expect(submit).not.toBeDisabled();
  });

  it('removes a failed approval from activity after Done without reopening the overlay', async () => {
    await start();
    reviewEverything();
    vi.mocked(submitReview).mockRejectedValueOnce(new Error('Offline'));
    press('ArrowRight');
    expect(Object.values(useQuickReviewStore.getState().activity)).toHaveLength(1);
    act(() => useQuickReviewStore.getState().endSession());
    sendHeldApproval();
    await waitFor(() => expect(submitReview).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(Object.values(useQuickReviewStore.getState().activity)).toHaveLength(0),
    );
    expect(useQuickReviewStore.getState().state).toBe('idle');
  });

  it('does not save the card approval as the draft decision when it fails', async () => {
    await start();
    reviewEverything();
    vi.mocked(submitReview).mockRejectedValueOnce(new Error('Offline'));
    press('ArrowRight');
    sendHeldApproval();
    await screen.findByRole('alert');
    expect(useQuickReviewStore.getState().currentIndex).toBe(0);
    const doc = Object.values(useQuickReviewStore.getState().documents)[0];
    expect(doc?.event).toBe('COMMENT');
  });

  it('holds an approval from the composer until the files are reviewed', async () => {
    vi.mocked(getPRReviewDetails).mockResolvedValue({
      pr: { ...pr.pullRequest, state: 'OPEN' },
      baseSha: 'base',
    });
    await start();
    compose();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Review decision' })).getByRole('button', {
        name: 'Approve',
      }),
    );
    expect(screen.getByRole('button', { name: 'Submit approval' })).toBeDisabled();
    expect(screen.getByText('3 files not reviewed yet')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    reviewEverything();
    compose();
    const submit = screen.getByRole('button', { name: 'Submit approval' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    sendHeldApproval();
    await waitFor(() => expect(submitReview).toHaveBeenCalledOnce());
  });
});

describe('Quick review next PR', () => {
  it('shows cumulative approvals after Done and separately opening another PR', () => {
    const store = useQuickReviewStore.getState();
    reviewCandidates.open = [pr];
    store.startSinglePr(pr);
    store.advance('approved');
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useQuickReviewStore.getState().state).toBe('idle');
    act(() => {
      store.startSinglePr(makePr({ number: 98, title: 'Second separate review' }));
      store.advance('approved');
    });
    expect(screen.getByText('2 PRs reviewed this app session')).toBeInTheDocument();
    expect(document.querySelector('[data-quick-review-summary]')).toHaveTextContent(
      'Second separate review',
    );
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Next from the same author' })).toBeNull();
  });

  it('excludes changes requested and conflicts before recommending a passing PR', () => {
    const blocked = makePr({
      number: 71,
      title: 'Changes still requested',
      reviewStatus: 'changesRequested',
    });
    const conflicted = makePr({ number: 72, title: 'Conflicted', mergeable: false });
    const passing = makePr({ number: 74, title: 'Ready to review' });
    const pending = { ...makePr({ number: 77 }), overallStatus: 'yellow' as const };
    const failing = {
      ...makePr({ number: 78 }),
      overallStatus: 'red' as const,
      failedCheckNames: ['Build'],
    };
    reviewCandidates.open = [pr, blocked, conflicted, pending, failing, passing];
    useQuickReviewStore.getState().startSinglePr(pr);
    useQuickReviewStore.getState().advance('skipped');
    render(<QuickReviewOverlay />);
    expect(screen.getByRole('region', { name: 'Next from the same author' })).toHaveTextContent(
      'Ready to review',
    );
    expect(screen.queryByText('Changes still requested')).toBeNull();
  });

  it('does not offer blocked, own, draft, closed or already approved PRs from another author', () => {
    const other = { authorLogin: 'robin' };
    reviewCandidates.open = [
      makePr({ ...other, number: 81, reviewStatus: 'changesRequested' }),
      makePr({ ...other, number: 82, mergeable: false }),
      makePr({ number: 83, authorLogin: 'reviewer' }),
      makePr({ ...other, number: 84, isDraft: true }),
      makePr({ ...other, number: 85, state: 'closed' }),
      makePr({
        ...other,
        number: 86,
        latestReviews: [{ authorLogin: 'reviewer', state: 'approved', commitSha: 'abc86def' }],
        headSha: 'abc86def',
      }),
    ];
    reviewCandidates.prs = reviewCandidates.open;
    useQuickReviewStore.getState().startSinglePr(pr);
    useQuickReviewStore.getState().advance('skipped');
    render(<QuickReviewOverlay />);
    expect(screen.queryByRole('region', { name: 'Next review' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Next from the same author' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('offers failing checks explicitly and another author without a review request', () => {
    const failing = {
      ...makePr({ number: 75, title: 'Needs a CI fix' }),
      overallStatus: 'red' as const,
      failedCheckNames: ['Build'],
    };
    const other = makePr({ number: 76, title: 'Another author ready', authorLogin: 'robin' });
    reviewCandidates.open = [pr, failing, other];
    useQuickReviewStore.getState().startSinglePr(pr);
    useQuickReviewStore.getState().advance('skipped');
    render(<QuickReviewOverlay />);
    expect(screen.getByRole('region', { name: 'Next from the same author' })).toHaveTextContent(
      'failing checks',
    );
    expect(screen.getByRole('button', { name: 'Review next from robin' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Enter',
    );
    press('Enter');
    expect(useQuickReviewStore.getState().currentPr()).toBe(other);
  });

  it.each([
    'red',
    'yellow',
    'gray',
  ] as const)('prefers a passing PR over an earlier %s PR and excludes reviewed PRs', async (overallStatus) => {
    const notPassing = { ...makePr({ number: 41, authorLogin: 'robin' }), overallStatus };
    const passing = makePr({ number: 42, title: 'Passing checks first', authorLogin: 'robin' });
    reviewCandidates.prs = [pr, notPassing, passing, makePr({ number: 43 })];
    useQuickReviewStore.getState().startSinglePr(pr);
    useQuickReviewStore.getState().advance('skipped');
    render(<QuickReviewOverlay />);

    expect(screen.getByText('Passing checks first')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review next PR' }));
    expect(useQuickReviewStore.getState().currentPr()).toBe(passing);
    await waitFor(() => expect(filesButton()).toBeEnabled());
  });

  it("offers the same author's oldest PR you can merge before the requested one", async () => {
    const author = pr.pullRequest.authorLogin;
    const conflicted = makePr({ number: 50, title: 'Has conflicts' });
    conflicted.pullRequest.mergeable = false;
    conflicted.pullRequest.createdAt = '2020-01-01T00:00:00Z';
    const older = makePr({ number: 51, title: 'Oldest mergeable' });
    older.pullRequest.createdAt = '2020-01-02T00:00:00Z';
    const newer = makePr({ number: 52, title: 'Newer' });
    newer.pullRequest.createdAt = '2020-01-03T00:00:00Z';
    const someoneElse = makePr({ number: 53, title: 'Requested of me' });
    someoneElse.pullRequest.authorLogin = 'someone-else';
    reviewCandidates.open = [pr, newer, conflicted, older];
    reviewCandidates.prs = [someoneElse];
    useQuickReviewStore.getState().startSinglePr(pr);
    useQuickReviewStore.getState().advance('skipped');
    render(<QuickReviewOverlay />);

    expect(screen.getByText('Oldest mergeable')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review next from someone-else' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Next from ${author}` }));
    expect(useQuickReviewStore.getState().currentPr()).toBe(older);
    expect(useQuickReviewStore.getState().run?.author).toBe(author);
    await waitFor(() => expect(useQuickReviewStore.getState().run?.filling).toBe(false));
    expect(useQuickReviewStore.getState().queue.map((p) => p.pullRequest.number)).toEqual([51, 52]);
    expect(useQuickReviewStore.getState().run?.held.map((h) => h.fit.why)).toEqual([
      'Has merge conflicts',
    ]);
    await waitFor(() => expect(filesButton()).toBeEnabled());
  });
});

describe('Quick review walk (v2)', () => {
  /** Marks every file from the walk and stays there: the footer is the decision bar. */
  function reviewEverythingInWalk() {
    openFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Skip generated' }));
    for (let i = 0; i < 3; i++) press('v');
  }
  function walk() {
    return screen.getByRole('region', { name: 'File walk' });
  }

  it('shows the PR above the walk: title, labels, and the full description only with D', async () => {
    pr.pullRequest.labels = ['bug', 'payroll'];
    pr.pullRequest.labelColors = { bug: 'd73a4a', payroll: 'not-a-colour' };
    await start();
    openFiles();
    const head = within(walk());
    expect(head.getByRole('heading', { name: pr.pullRequest.title })).toBeInTheDocument();
    const labels = head.getByRole('list', { name: 'Labels' });
    expect(within(labels).getByText('bug').getAttribute('style')).toContain('--label: #d73a4a');
    expect(within(labels).getByText('payroll').getAttribute('style')).toBeNull();
    // The diff gets the room: the description waits for D.
    expect(head.queryByText('All details are visible.')).toBeNull();
    press('d');
    expect(head.getByRole('button', { name: 'Hide description' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(head.getByRole('heading', { name: 'Full description' })).toBeInTheDocument();
    expect(head.getByText('All details are visible.')).toBeVisible();
  });

  it('approves from the walk with Enter, opens the next PR in the walk, and Z takes it back', async () => {
    await start();
    reviewEverythingInWalk();
    expect(screen.getByText('All 3 files reviewed')).toBeInTheDocument();
    press('Enter');
    expect(useQuickReviewStore.getState().currentIndex).toBe(1);
    // Nothing is posted until the toast runs out, and it says so.
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      `Approving #${pr.pullRequest.number} · auto-merge on`,
    ]);
    await waitFor(() => expect(screen.getByRole('region', { name: 'File walk' })).toBeVisible());
    press('z');
    expect(useQuickReviewStore.getState().currentIndex).toBe(0);
    expect(useQuickReviewStore.getState().decisions.size).toBe(0);
    expect(useToastStore.getState().toasts).toEqual([]);
    expect(submitReview).not.toHaveBeenCalled();
    // The draft survived Undo: every file is still marked.
    await waitFor(() => expect(screen.getByText('All 3 files reviewed')).toBeInTheDocument());
  });

  it('lists the drafts from the footer and jumps to one', async () => {
    await start();
    await addDraft();
    press('n');
    expect(currentFile()).not.toBe('src/Service.cs');
    fireEvent.click(screen.getByRole('button', { name: '1 draft comment' }));
    const list = screen.getByRole('list', { name: 'Draft comments' });
    expect(within(list).getByText('Service.cs:10')).toBeInTheDocument();
    expect(within(list).getByText('Please handle failure.')).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: 'Jump' }));
    expect(currentFile()).toBe('src/Service.cs');
    expect(screen.queryByRole('list', { name: 'Draft comments' })).toBeNull();
  });

  it('A approves without auto merge from the decision bar', async () => {
    await start();
    reviewEverythingInWalk();
    press('a');
    sendHeldApproval();
    await waitFor(() => expect(submitReview).toHaveBeenCalledTimes(1));
    expect(enableAutoMerge).not.toHaveBeenCalled();
  });

  it('asks for an overall comment before requesting changes, then posts it', async () => {
    await start();
    reviewEverythingInWalk();
    press('r');
    const body = screen.getByRole('textbox', { name: 'Overall comment' });
    expect(document.activeElement).toBe(body);
    expect(screen.getByText('Add an overall comment before requesting changes.')).toBeVisible();
    expect(submitReview).not.toHaveBeenCalled();
    fireEvent.change(body, { target: { value: 'Handle the failure case.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith(
        expect.anything(),
        'owner',
        'repo',
        pr.pullRequest.number,
        'REQUEST_CHANGES',
        'Handle the failure case.',
        { commit_id: pr.pullRequest.headSha, comments: [] },
      ),
    );
  });

  it('folds the context panel into a rail with ], remembers it, and opens a tab with 1–4', async () => {
    localStorage.removeItem('borgdock-quick-review-context-open');
    onTestFinished(() => localStorage.removeItem('borgdock-quick-review-context-open'));
    await start();
    openFiles();
    expect(within(walk()).getByRole('tab', { name: /Proof/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    press(']');
    expect(within(walk()).getByRole('button', { name: 'Show context panel' })).toBeVisible();
    expect(localStorage.getItem('borgdock-quick-review-context-open')).toBe('false');
    press('4');
    expect(within(walk()).getByRole('tab', { name: /Comments/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  /** One failing and one passing check on the PR under review. */
  function failOneCheck() {
    pr.failedCheckNames = ['e2e (chromium)'];
    pr.overallStatus = 'red';
    pr.passedCount = 1;
    pr.totalCheckCount = 2;
  }
  /** Reviews `pr` alone, so it is the one on the card and above the walk. */
  async function startAlone() {
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    await waitFor(() => expect(filesButton()).toBeEnabled());
  }
  function checksCard() {
    return document.querySelector<HTMLElement>('[data-checks-card]');
  }

  it('shows the checks when the CI chip is hovered and opens the Checks panel on click', async () => {
    failOneCheck();
    await startAlone();
    openFiles();
    const chip = within(walk()).getByRole('button', { name: 'CI 1 failing' });
    expect(checksCard()).toBeNull();
    fireEvent.mouseEnter(chip);
    await waitFor(() => expect(checksCard()).not.toBeNull());
    expect(within(checksCard()!).getByText('e2e (chromium)')).toBeInTheDocument();
    expect(within(checksCard()!).getByText('1 failing')).toBeInTheDocument();
    fireEvent.click(chip);
    expect(within(walk()).getByRole('tab', { name: /Checks/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens the walk on the Checks panel from the CI chip on the card', async () => {
    failOneCheck();
    await startAlone();
    expect(screen.queryByRole('region', { name: 'File walk' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CI 1 failing' }));
    await waitFor(() => expect(walk()).toBeVisible());
    expect(within(walk()).getByRole('tab', { name: /Checks/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('keeps the CI chip plain when the PR has no checks', async () => {
    pr.totalCheckCount = 0;
    await startAlone();
    openFiles();
    expect(within(walk()).getByText('No checks').closest('button')).toBeNull();
    fireEvent.mouseEnter(within(walk()).getByText('No checks'));
    expect(checksCard()).toBeNull();
  });

  it('excludes legacy proof comments from the proof tab', async () => {
    onTestFinished(() => {
      vi.mocked(getAllComments).mockResolvedValue([]);
    });
    vi.mocked(getAllComments).mockResolvedValue([
      {
        id: 'proof',
        author: 'vera',
        body: `<h2>Proof</h2><p>The flow passed.</p><img src="https://example.com/shot.png" alt="Passing flow">`,
        sourceBody: `## Proof\n\nHead SHA: ${pr.pullRequest.headSha}`,
        createdAt: '2025-01-02T00:00:00Z',
        severity: 'unknown',
        htmlUrl: pr.pullRequest.htmlUrl,
      },
    ]);
    await start();
    openFiles();
    await waitFor(() => expect(getAllComments).toHaveBeenCalled());
    expect(
      within(walk()).queryByRole('article', {
        name: 'Proof from the comment by vera',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(walk()).queryByRole('button', { name: 'Preview image: Passing flow' }),
    ).not.toBeInTheDocument();
  });

  it('on a re-review lists only the files changed since my last review and keeps the rest reviewed', async () => {
    onTestFinished(() => {
      vi.mocked(getReviews).mockResolvedValue([]);
    });
    vi.mocked(getReviews).mockResolvedValue([
      {
        id: 9,
        state: 'CHANGES_REQUESTED',
        body: 'Handle the failure case.',
        submitted_at: '2025-01-01T12:00:00Z',
        user: { login: 'Reviewer' },
        commit_id: 'old0123',
      },
    ]);
    mockClient.get.mockImplementation(async (path: string) => {
      if (!path.includes('/compare/old0123...')) throw new Error('Unavailable');
      return {
        status: 'ahead',
        ahead_by: 2,
        commits: [{ commit: { message: 'Handle failure\n\ndetails' } }],
        files: [
          {
            filename: 'src/Service.cs',
            status: 'modified',
            additions: 1,
            deletions: 0,
            patch: '@@ -11,1 +11,2 @@\n first();\n+handled();',
          },
          { filename: 'outside/the/pr.txt', status: 'added', additions: 1, deletions: 0 },
        ],
      };
    });
    onTestFinished(() => {
      mockClient.get.mockRejectedValue(new Error('Unavailable'));
    });
    await start();
    openFiles();
    await screen.findByText(/2 commits/);
    const tree = screen.getByRole('navigation', { name: 'Review path' });
    expect([...tree.querySelectorAll('.qr-file')].map((b) => b.getAttribute('title'))).toEqual([
      'src/Service.cs',
    ]);
    expect(treeProgress()).toBe('0 of 1 changed files1 left');
    expect(within(tree).getByRole('button', { name: /3 unchanged files, reviewed/ })).toBeVisible();
    expect(screen.getByText(/Handle failure/)).toBeInTheDocument();
    expect(screen.getByText('handled();')).toBeInTheDocument();
    const doc = Object.values(useQuickReviewStore.getState().documents)[0];
    expect(doc?.reviewed).toEqual(
      expect.arrayContaining(['bun.lock', 'App.Tests/ServiceTests.cs', 'src/service.test.ts']),
    );
    // The interdiff numbers lines of the reviewed commit: no line comments on it.
    expect(screen.queryByRole('button', { name: /^Comment on/ })).toBeNull();
    press('s');
    expect(tree.querySelectorAll('.qr-file')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Comment on new line 10' })).toBeInTheDocument();
  });

  it('N from inside a diff without line comments (split) still changes files', async () => {
    onTestFinished(() => {
      localStorage.removeItem('borgdock-quick-review-split-diff');
    });
    await start();
    openFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    fireEvent.keyDown(document.querySelector<HTMLElement>('[data-diff-file]')!, { key: 'n' });
    expect(currentFile()).toBe('bun.lock');
  });

  it('approving a PR again while its approval waits sends one review', async () => {
    await start();
    reviewEverythingInWalk();
    press('Enter');
    expect(useQuickReviewStore.getState().currentIndex).toBe(1);
    act(() => useQuickReviewStore.getState().goBack());
    await waitFor(() => expect(screen.getByText('All 3 files reviewed')).toBeInTheDocument());
    press('Enter');
    expect(useToastStore.getState().toasts.filter((t) => t.actionLabel === 'Undo')).toHaveLength(1);
    sendHeldApproval();
    await waitFor(() => expect(submitReview).toHaveBeenCalledTimes(1));
  });
});
