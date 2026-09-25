import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prRowKey } from '@/components/pr/pr-card-data';
import { submitReview } from '@/services/github/mutations';
import { getPRFiles, getPRReviewDetails } from '@/services/github/pulls';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useToastStore } from '@/stores/toast-store';
import { QuickReviewOverlay } from '../QuickReviewOverlay';
import { makePr, resetSeq } from './helpers';

vi.mock('@/services/github/pulls', () => ({ getPRFiles: vi.fn(), getPRReviewDetails: vi.fn() }));
vi.mock('@/services/github/mutations', () => ({ submitReview: vi.fn() }));
vi.mock('@/services/github/reviews', () => ({
  getAllComments: vi.fn().mockResolvedValue([]),
  getReviews: vi.fn().mockResolvedValue([]),
}));
const mockClient = vi.hoisted(() => ({ account: 'reviewer' }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => mockClient }));
vi.mock('@/stores/pr-store', () => ({
  usePrStore: { getState: () => ({ refreshPr: vi.fn().mockResolvedValue(null) }) },
}));
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
beforeEach(() => {
  vi.clearAllMocks();
  resetSeq();
  // Transitions finish at once: the walk unmounts and the overlay closes
  // without waiting for their animations.
  document.documentElement.classList.add('reduce-motion');
  useQuickReviewStore.getState().endSession();
  useQuickReviewStore.setState({ documents: {} });
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
    name: /^(Review files|Continue reviewing|Review files again)$/,
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
function finishWalk() {
  fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
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
  it('renders nothing while idle', () =>
    expect(render(<QuickReviewOverlay />).container.innerHTML).toBe(''));

  it('opens on the card with the files by folder and what is left to review', async () => {
    await start();
    const card = screen.getByRole('article', { name: `Pull request #${pr.pullRequest.number}` });
    expect(within(card).getByText('All details are visible.')).toBeInTheDocument();
    expect(within(card).getByText('3 of 3 to review, 1 generated')).toBeInTheDocument();
    expect(within(card).getByText('generated').closest('li')).toHaveAttribute(
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
    expect(screen.getByRole('button', { name: 'Skip generated' })).toBeInTheDocument();
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
    await screen.findByRole('alert');
    expect(screen.getByText('All details are visible.')).toBeInTheDocument();
    expectApproveBlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Reload files' }));
    await waitFor(() => expect(filesButton()).toBeEnabled());
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
    expect(screen.getByText('File 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('0 of 4 reviewed, 3 to go')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed and next' }));
    expect(screen.getByText('1 of 4 reviewed, 2 to go')).toBeInTheDocument();
    expect(currentFile()).toBe('bun.lock');
    const done = within(tree).getByRole('button', { name: /Service\.cs/, current: false });
    expect(done).toHaveAttribute('data-done', 'true');
    expect(within(done).getByRole('img', { name: 'Reviewed' })).toBeInTheDocument();

    press('n');
    expect(currentFile()).toBe('App.Tests/ServiceTests.cs');
    press('p');
    press('k');
    expect(currentFile()).toBe('src/Service.cs');
    fireEvent.click(screen.getByRole('button', { name: 'Next file' }));
    expect(currentFile()).toBe('bun.lock');
  });

  it('Skip generated marks only the generated files and then hides', async () => {
    await start();
    openFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Skip generated' }));
    const doc = Object.values(useQuickReviewStore.getState().documents)[0];
    expect(doc?.reviewed).toEqual(['bun.lock']);
    expect(screen.queryByRole('button', { name: 'Skip generated' })).toBeNull();
    expect(screen.getByText('1 of 4 reviewed, 3 to go')).toBeInTheDocument();
  });

  it('mark and next skips files already reviewed; Finish review turns primary when nothing is left', async () => {
    await start();
    openFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Skip generated' }));
    press('v');
    // bun.lock is already reviewed: the next open file is the first test.
    expect(currentFile()).toBe('App.Tests/ServiceTests.cs');
    const finish = screen.getByRole('button', { name: 'Finish review' });
    expect(finish).not.toHaveClass('bd-btn--primary');
    press('v');
    press('v');
    expect(screen.getByText('4 of 4 reviewed, 0 to go')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish review' })).toHaveClass('bd-btn--primary');
    finishWalk();
    expect(screen.queryByRole('navigation', { name: 'Review path' })).toBeNull();
    expectApproveOpen();
  });

  it('moves focus into the tree on open and back to Review files on Esc or Finish', async () => {
    await start();
    openFiles();
    expect(document.activeElement).toHaveAttribute('title', 'src/Service.cs');
    expect(document.activeElement).toHaveAttribute('aria-current', 'step');
    press('Escape');
    expect(document.activeElement).toBe(filesButton());
    openFiles();
    expect(document.activeElement).toHaveClass('qr-file');
    finishWalk();
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
    expect(screen.getByRole('checkbox', { name: 'Not reviewed' })).not.toBeChecked();
  });

  it('keeps reviewed progress on reopen, also for documents saved before the walk existed', async () => {
    const view = await start();
    openFiles();
    press('v');
    expect(screen.getByText('1 of 4 reviewed, 2 to go')).toBeInTheDocument();
    view.unmount();
    // Drop the new field, as an older build would have saved it.
    const [key, doc] = Object.entries(useQuickReviewStore.getState().documents)[0]!;
    const { walked: _walked, ...old } = doc;
    useQuickReviewStore.setState({ documents: { [key]: old } });
    render(<QuickReviewOverlay />);
    await waitFor(() => expect(screen.getByText('2 of 3 to review, 1 generated')).toBeVisible());
    expect(filesButton()).toHaveTextContent('Review files');
  });

  it('returns from comments to the same file and draft without changing progress', async () => {
    await start();
    await addDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    await screen.findByText('No comments yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Back to diff' }));
    expect(screen.getByText('File 1 of 4')).toBeVisible();
    expect(screen.getByText('Please handle failure.')).toBeVisible();
    expect(screen.getByText('0 of 4 reviewed, 3 to go')).toBeVisible();
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

  it('requires an overall explanation for request changes and never approves with A', async () => {
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

  it('does not save the card approval as the draft decision when it fails', async () => {
    await start();
    reviewEverything();
    vi.mocked(submitReview).mockRejectedValueOnce(new Error('Offline'));
    press('ArrowRight');
    await screen.findByRole('alert');
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
    await waitFor(() => expect(submitReview).toHaveBeenCalledOnce());
  });
});
