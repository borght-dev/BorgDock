import { openUrl } from '@tauri-apps/plugin-opener';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRenderedFiles } from '@/hooks/useRenderedFile';
import { submitReview } from '@/services/github/mutations';
import { getPRFiles, getPRReviewDetails } from '@/services/github/pulls';
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
// One stable object: a new client per call re-runs effects that depend on it forever.
const client = vi.hoisted(() => ({ account: 'reviewer', get: vi.fn() }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => client }));
vi.mock('@/stores/pr-store', () => {
  const state = () => ({
    needsMyReview: () => [] as PullRequestWithChecks[],
    pullRequests: [] as PullRequestWithChecks[],
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
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

const GUIDE = ['# Discount codes', '', 'Codes are checked at checkout.', '', 'A new closing line.'];
const files = [
  {
    filename: 'src/Service.cs',
    sha: 's',
    status: 'modified',
    additions: 2,
    deletions: 1,
    patch: '@@ -10,2 +10,3 @@\n-old();\n+first();\n+second();\n context();',
  },
  {
    filename: 'docs/guide.md',
    sha: 'g',
    status: 'modified',
    additions: 2,
    deletions: 0,
    patch:
      '@@ -1,3 +1,5 @@\n # Discount codes\n \n Codes are checked at checkout.\n+\n+A new closing line.',
  },
  {
    filename: 'docs/plan.html',
    sha: 'h',
    status: 'added',
    additions: 1,
    deletions: 0,
    patch: '@@ -0,0 +1 @@\n+<h1>Plan</h1>',
  },
  {
    filename: 'docs/shot.png',
    sha: 'p',
    status: 'added',
    additions: 0,
    deletions: 0,
  },
];

const content = (text: string) => ({
  type: 'file',
  size: text.length,
  encoding: 'base64',
  content: btoa(text),
});

let pr = makePr();
const DEFAULT_SETTINGS = useSettingsStore.getState().settings;
const createObjectURL = vi.fn(() => 'blob:preview');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetRenderedFiles();
  resetRiskAssessments();
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      ui: { ...DEFAULT_SETTINGS.ui, quickReviewRequireAllFiles: true },
      summaries: { ...DEFAULT_SETTINGS.summaries!, autoRiskAssessment: false },
    },
  });
  resetSeq();
  document.documentElement.classList.add('reduce-motion');
  useQuickReviewStore.getState().endSession();
  useQuickReviewStore.setState({ documents: {}, activity: {} });
  useToastStore.getState().clear();
  pr = makePr({ changedFiles: files.length, body: 'What changed.' });
  vi.mocked(getPRReviewDetails).mockResolvedValue({ pr: pr.pullRequest, baseSha: 'base' });
  vi.mocked(getPRFiles).mockResolvedValue(files);
  vi.mocked(submitReview).mockResolvedValue(undefined);
  client.get.mockImplementation(async (url: string) => {
    if (url.includes('/contents/docs/guide.md')) return content(GUIDE.join('\n'));
    if (url.includes('/contents/docs/plan.html')) return content('<h1>Plan</h1>');
    throw new Error('Unavailable');
  });
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  document.documentElement.classList.remove('reduce-motion');
});

async function openWalk() {
  useQuickReviewStore.getState().startSession([pr, makePr({ number: 42 })]);
  render(<QuickReviewOverlay />);
  const start = () => screen.getByRole('button', { name: 'Review files' });
  await waitFor(() => expect(start()).toBeEnabled());
  fireEvent.click(start());
}
function press(key: string) {
  fireEvent.keyDown(document, { key });
}
function open(path: string) {
  fireEvent.click(document.querySelector<HTMLElement>(`.qr-file[title="${path}"]`)!);
}
function fileView() {
  return within(screen.getByRole('group', { name: 'File view' }));
}
function walk() {
  return within(screen.getByRole('region', { name: 'File walk' }));
}

describe('the overall comment while files are left', () => {
  it('offers the comment, Request changes and Comment from the first file', async () => {
    await openWalk();
    expect(screen.getByRole('textbox', { name: 'Overall comment' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Comment' })).toBeEnabled();
    // Stepping through the files and the held-back Approve are still there.
    expect(screen.getByRole('button', { name: 'Mark reviewed & next' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Approve · 4 left' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('requests changes without marking a file', async () => {
    await openWalk();
    press('r');
    const body = screen.getByRole('textbox', { name: 'Overall comment' });
    expect(document.activeElement).toBe(body);
    expect(screen.getByText('Add an overall comment before requesting changes.')).toBeVisible();
    expect(submitReview).not.toHaveBeenCalled();
    fireEvent.change(body, { target: { value: 'The service drops the failure case.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith(
        expect.anything(),
        'owner',
        'repo',
        pr.pullRequest.number,
        'REQUEST_CHANGES',
        'The service drops the failure case.',
        { commit_id: pr.pullRequest.headSha, comments: [] },
      ),
    );
  });

  it('comments with C once there is something to say', async () => {
    await openWalk();
    press('c');
    expect(screen.getByText('Add an overall or inline comment before submitting.')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Overall comment' }), {
      target: { value: 'Looks good so far.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith(
        expect.anything(),
        'owner',
        'repo',
        pr.pullRequest.number,
        'COMMENT',
        'Looks good so far.',
        { commit_id: pr.pullRequest.headSha, comments: [] },
      ),
    );
  });

  it('does not post the drafts on a stray C; the button does', async () => {
    await openWalk();
    fireEvent.click(screen.getByRole('button', { name: 'Comment on new line 10' }));
    fireEvent.change(screen.getByPlaceholderText('Describe the issue or suggest a change...'), {
      target: { value: 'Handle the failure case.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    press('c');
    expect(
      screen.getByText('Write an overall comment first, or click Comment to post only the drafts.'),
    ).toBeVisible();
    expect(submitReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith(
        expect.anything(),
        'owner',
        'repo',
        pr.pullRequest.number,
        'COMMENT',
        '',
        {
          commit_id: pr.pullRequest.headSha,
          comments: [
            { path: 'src/Service.cs', line: 10, side: 'RIGHT', body: 'Handle the failure case.' },
          ],
        },
      ),
    );
  });

  it('does not approve with files left when file review is required', async () => {
    await openWalk();
    press('a');
    press('Enter');
    expect(submitReview).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

describe('the first proof', () => {
  it('opens the first screenshot with I, on the card and in the walk', async () => {
    // Its own number: a snapshot read moments ago is reused for the same PR.
    pr = makePr({
      number: 101,
      changedFiles: files.length,
      body: '## Proof\n\n![After the fix](https://example.com/after.png)\n\n![Before](https://example.com/before.png)',
    });
    vi.mocked(getPRReviewDetails).mockResolvedValue({ pr: pr.pullRequest, baseSha: 'base' });
    useQuickReviewStore.getState().startSession([pr, makePr({ number: 42 })]);
    render(<QuickReviewOverlay />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review files' })).toBeEnabled());
    press('i');
    const viewer = screen.getByRole('dialog', { name: 'Proof image 1 of 2 · After the fix' });
    expect(within(viewer).getByRole('img', { name: 'After the fix' })).toHaveAttribute(
      'src',
      'https://example.com/after.png',
    );
    fireEvent.keyDown(viewer, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Proof image/ })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Review files' }));
    press('i');
    expect(screen.getByRole('dialog', { name: /Proof image 1 of 2/ })).toBeInTheDocument();
  });

  it('opens a recording in the browser when that comes first', async () => {
    const recording =
      'https://github.com/user-attachments/assets/0f1e2d3c-aaaa-bbbb-cccc-1234567890ab';
    pr = makePr({
      number: 102,
      changedFiles: files.length,
      body: `## Proof\n\n${recording}\n\n![After](https://example.com/after.png)`,
    });
    vi.mocked(getPRReviewDetails).mockResolvedValue({ pr: pr.pullRequest, baseSha: 'base' });
    await openWalk();
    press('i');
    expect(openUrl).toHaveBeenCalledWith(recording);
    expect(screen.queryByRole('dialog', { name: /Proof image/ })).toBeNull();
    // The Proof tab lists it too.
    expect(walk().getByRole('button', { name: /Recording/ })).toBeInTheDocument();
  });

  it('says so when the PR has no proof to open', async () => {
    await openWalk();
    press('i');
    expect(screen.getByText('This PR has no proof image or recording.')).toBeInTheDocument();
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe('rendered files', () => {
  it('opens a Markdown file as its page, with the change marked', async () => {
    await openWalk();
    open('docs/guide.md');
    expect(await screen.findByRole('heading', { name: 'Discount codes' })).toBeInTheDocument();
    expect(fileView().getByRole('button', { name: 'Rendered' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const added = screen.getByText('A new closing line.').closest('.bd-rendered-change');
    expect(added).toHaveAttribute('data-rendered-change', 'added');
    expect(
      screen.getByText('Codes are checked at checkout.').closest('.bd-rendered-change'),
    ).toBeNull();
    expect(await screen.findByText('Change 1 of 1')).toBeInTheDocument();
    // Read at the commit under review, not at a branch.
    expect(
      client.get.mock.calls.some(([url]) => url.endsWith(`?ref=${pr.pullRequest.headSha}`)),
    ).toBe(true);
    // No lines to split or wrap.
    expect(screen.queryByRole('group', { name: 'Diff layout' })).toBeNull();
  });

  it('switches to the diff and back with E, and remembers the choice', async () => {
    await openWalk();
    open('docs/guide.md');
    await screen.findByRole('heading', { name: 'Discount codes' });
    press('e');
    expect(screen.queryByRole('heading', { name: 'Discount codes' })).toBeNull();
    expect(fileView().getByRole('button', { name: 'Diff' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('group', { name: 'Diff layout' })).toBeInTheDocument();
    expect(localStorage.getItem('borgdock-quick-review-rendered')).toBe('false');
    press('e');
    expect(await screen.findByRole('heading', { name: 'Discount codes' })).toBeInTheDocument();
    expect(localStorage.getItem('borgdock-quick-review-rendered')).toBe('true');
  });

  it('drafts a comment on a changed block', async () => {
    await openWalk();
    open('docs/guide.md');
    fireEvent.click(await screen.findByRole('button', { name: 'Comment on line 5' }));
    const draft = screen.getByRole('region', { name: 'Draft on docs/guide.md line 5' });
    fireEvent.change(
      within(draft).getByPlaceholderText('Describe the issue or suggest a change...'),
      {
        target: { value: 'Say which line closes.' },
      },
    );
    fireEvent.click(within(draft).getByRole('button', { name: 'Save draft' }));
    // Under its block on the page, and on its line in the diff.
    expect(
      screen.getByText('A new closing line.').closest('.bd-rendered-change')?.nextElementSibling,
    ).toBe(screen.getByRole('region', { name: 'Draft on docs/guide.md line 5' }));
    press('e');
    expect(screen.getByText('Say which line closes.')).toBeInTheDocument();
  });

  it('offers no switch on a source file', async () => {
    await openWalk();
    open('src/Service.cs');
    expect(screen.queryByRole('group', { name: 'File view' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Diff layout' })).toBeInTheDocument();
  });

  it('shows the diff, with the reason, when the file cannot be read', async () => {
    client.get.mockRejectedValue(new Error('GitHub is not answering.'));
    await openWalk();
    open('docs/guide.md');
    await waitFor(() =>
      expect(fileView().getByRole('button', { name: 'Diff' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(screen.getByText('GitHub is not answering.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comment on new line 5' })).toBeInTheDocument();
  });

  it('draws an HTML file in a sandboxed frame', async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 900, height: 600 } as DOMRect);
    try {
      await openWalk();
      open('docs/plan.html');
      const frame = await screen.findByTitle('After: docs/plan.html');
      expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
      expect(frame).toHaveAttribute('src', 'blob:preview');
      expect(screen.getByText('Sandboxed')).toBeInTheDocument();
      // A new file has one version: nothing to compare it with.
      expect(screen.queryByRole('group', { name: 'Version' })).toBeNull();
      expect(screen.getByRole('group', { name: 'Page width' })).toBeInTheDocument();
      const [page] = createObjectURL.mock.calls[0] as unknown as [Blob];
      expect(await page.text()).toMatch(/^<script>.*<\/script><h1>Plan<\/h1>$/s);
      press('e');
      expect(screen.queryByTitle('After: docs/plan.html')).toBeNull();
      expect(screen.getByRole('button', { name: 'Comment on new line 1' })).toBeInTheDocument();
    } finally {
      rect.mockRestore();
    }
  });

  it('always draws a picture, with no switch to turn that off', async () => {
    await openWalk();
    open('docs/shot.png');
    expect(await screen.findByRole('region', { name: 'Image comparison' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rich diff' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'File view' })).toBeNull();
  });
});
