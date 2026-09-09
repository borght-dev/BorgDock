import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitReview } from '@/services/github/mutations';
import { getPRFiles, getPRReviewDetails } from '@/services/github/pulls';
import { useQuickReviewStore } from '@/stores/quick-review-store';
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
];
let pr = makePr();
beforeEach(() => {
  vi.clearAllMocks();
  resetSeq();
  useQuickReviewStore.getState().endSession();
  useQuickReviewStore.setState({ documents: {} });
  pr = makePr({ changedFiles: 3, body: '# Full description\n\nAll details are visible.' });
  vi.mocked(getPRReviewDetails).mockResolvedValue({ pr: pr.pullRequest, baseSha: 'base' });
  vi.mocked(getPRFiles).mockResolvedValue(files);
  vi.mocked(submitReview).mockResolvedValue(undefined);
});
afterEach(cleanup);
async function start() {
  useQuickReviewStore.getState().startSession([pr, makePr({ number: 42 })]);
  const view = render(<QuickReviewOverlay />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start review →' })).not.toBeDisabled(),
  );
  return view;
}
async function addDraft(side: 'old' | 'new' = 'new') {
  fireEvent.click(screen.getByRole('button', { name: 'Start review →' }));
  fireEvent.click(screen.getByRole('button', { name: `Comment on ${side} line 10` }));
  fireEvent.change(screen.getByPlaceholderText('Describe the issue or suggest a change...'), {
    target: { value: 'Please handle failure.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
}
function finish() {
  fireEvent.click(screen.getByRole('button', { name: /^Finish review/ }));
}

describe('Quick review workspace', () => {
  it('returns from comments to the same file and draft without changing reviewed progress', async () => {
    await start();
    await addDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    await screen.findByText('No comments yet.');
    expect(
      screen.queryByRole('button', { name: 'Comment on old line 10' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark reviewed & next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to review' }));
    expect(screen.getByText('File 1 of 3')).toBeVisible();
    expect(screen.getByText('Please handle failure.')).toBeVisible();
    expect(screen.getByText('0 of 3 files reviewed')).toBeVisible();
  });
  it('renders nothing while idle', () =>
    expect(render(<QuickReviewOverlay />).container.innerHTML).toBe(''));
  it('shows the complete description and orders production files before tests', async () => {
    await start();
    expect(screen.getByText('All details are visible.')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Review path' });
    const names = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names.findIndex((n) => n?.includes('Service.cs'))).toBeLessThan(
      names.findIndex((n) => n?.includes('ServiceTests.cs')),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start review →' }));
    expect(screen.getByText('File 1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next file →' }));
    expect(screen.getByText('0 of 3 files reviewed')).toBeInTheDocument();
  });
  it('marks only explicitly reviewed files and preserves progress on reopen', async () => {
    const view = await start();
    fireEvent.click(screen.getByRole('button', { name: 'Start review →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed & next' }));
    expect(screen.getByText('1 of 3 files reviewed')).toBeInTheDocument();
    view.unmount();
    render(<QuickReviewOverlay />);
    await waitFor(() => expect(screen.getByText('1 of 3 files reviewed')).toBeInTheDocument());
  });
  it('keeps unsaved text and saved comments while navigating and closing', async () => {
    const view = await start();
    await addDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Next file →' }));
    fireEvent.click(screen.getByRole('button', { name: '← Previous' }));
    expect(screen.getByText('Please handle failure.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
    fireEvent.change(screen.getByPlaceholderText('Describe the issue or suggest a change...'), {
      target: { value: 'Unfinished feedback' },
    });
    act(() => useQuickReviewStore.getState().endSession());
    view.unmount();
    act(() => useQuickReviewStore.getState().startSinglePr(pr));
    render(<QuickReviewOverlay />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Unfinished feedback')).toBeInTheDocument(),
    );
    finish();
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled();
  });
  it.each([
    'LEFT',
    'RIGHT',
  ] as const)('posts %s comments against the reviewed commit in one review', async (side) => {
    await start();
    await addDraft(side === 'LEFT' ? 'old' : 'new');
    finish();
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
  it('keeps drafts and the current PR after submission failure, then permits retry', async () => {
    await start();
    await addDraft();
    finish();
    vi.mocked(submitReview).mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    await screen.findByRole('alert');
    expect(useQuickReviewStore.getState().currentIndex).toBe(0);
    expect(screen.getByText('Please handle failure.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(useQuickReviewStore.getState().currentIndex).toBe(1));
  });
  it('blocks stale submission and preserves feedback for reattachment', async () => {
    await start();
    await addDraft();
    finish();
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
          ? { ...f, sha: 'new', patch: f.patch + '\n+changed();' }
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
    fireEvent.keyDown(document, { key: 'a' });
    expect(submitReview).not.toHaveBeenCalled();
    finish();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Review decision' })).getByRole('button', {
        name: 'Request changes',
      }),
    );
    const submit = document.querySelector('.qr-mark')!;
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Add overall feedback...'), {
      target: { value: 'Needs work' },
    });
    expect(submit).not.toBeDisabled();
  });
  it('reports a load failure with retry and retains the description', async () => {
    vi.mocked(getPRFiles).mockRejectedValueOnce(new Error('Files unavailable'));
    useQuickReviewStore.getState().startSinglePr(pr);
    render(<QuickReviewOverlay />);
    await screen.findByRole('alert');
    expect(screen.getByText('All details are visible.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload files' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start review →' })).not.toBeDisabled(),
    );
  });
});
