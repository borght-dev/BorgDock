import { openUrl } from '@tauri-apps/plugin-opener';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllComments, getReviews } from '@/services/github/reviews';
import { QuickReviewDiscussion } from '../QuickReviewDiscussion';
import { makePr } from './helpers';

vi.mock('@/services/github/reviews', () => ({ getAllComments: vi.fn(), getReviews: vi.fn() }));
const client = vi.hoisted(() => ({ account: 'reviewer' }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => client }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
const pr = makePr({
  authorLogin: 'Author',
  htmlUrl: 'https://github.com/owner/repo/pull/42',
}).pullRequest;
const proof = 'https://github.com/user-attachments/assets/proof';
const comments = [
  {
    id: '1',
    author: 'author',
    body: `## Browser proof\n\n![Passing screenshot](${proof})`,
    createdAt: '2026-09-09T10:00:00Z',
    htmlUrl: `${pr.htmlUrl}#issuecomment-1`,
    severity: 'unknown' as const,
  },
  {
    id: '1',
    author: 'agent[bot]',
    body: 'Please handle errors.',
    filePath: 'src/order.ts',
    lineNumber: 10,
    createdAt: '2026-09-09T11:00:00Z',
    htmlUrl: `${pr.htmlUrl}#discussion_r1`,
    severity: 'unknown' as const,
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAllComments).mockResolvedValue(comments);
  vi.mocked(getReviews).mockResolvedValue([
    {
      id: 1,
      state: 'APPROVED',
      body: 'Review proof',
      submitted_at: '2026-09-09T12:00:00Z',
      user: { login: 'reviewer' },
    },
  ]);
  vi.mocked(openUrl).mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Quick Review comments', () => {
  it('loads on demand, includes all comment sources newest first, and filters author case-insensitively', async () => {
    const view = render(<QuickReviewDiscussion pr={pr} enabled={false} />);
    expect(getAllComments).not.toHaveBeenCalled();
    view.rerender(<QuickReviewDiscussion pr={pr} enabled />);
    await screen.findByText('Browser proof');
    const articles = screen.getAllByRole('article');
    expect(articles.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Comment by reviewer',
      'Comment by agent[bot]',
      'Comment by author',
    ]);
    expect(screen.getByText('Inline comment · src/order.ts:10')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'PR author · 1' }));
    expect(screen.getByText('Browser proof')).toBeVisible();
    expect(screen.queryByText('Review proof')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Other commenters · 2' }));
    expect(screen.queryByText('Browser proof')).not.toBeInTheDocument();
    expect(screen.getByText('Please handle errors.')).toBeVisible();
    expect(screen.getByText('Review proof')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Everyone · 3' }));
    fireEvent.click(
      within(screen.getByRole('article', { name: 'Comment by author' })).getByRole('button', {
        name: 'View on GitHub',
      }),
    );
    expect(openUrl).toHaveBeenCalledWith(`${pr.htmlUrl}#issuecomment-1`);
  });

  it('renders Markdown and HTML screenshots, and offers a browser fallback for private images', async () => {
    vi.mocked(getAllComments).mockResolvedValue([
      {
        ...comments[0]!,
        body: `[![Passing screenshot](${proof})](${proof})\n\n<img src="${proof}?second" alt="HTML proof" />`,
      },
    ]);
    render(<QuickReviewDiscussion pr={pr} enabled />);
    const image = await screen.findByAltText('Passing screenshot');
    expect(image).toHaveAttribute('src', proof);
    expect(screen.getByAltText('HTML proof')).toBeVisible();
    expect(image.closest('a')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open image in browser: Passing screenshot' }),
    );
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith(proof);
    fireEvent.error(image);
    expect(screen.getByText('Image could not load. Open image in browser.')).toBeVisible();
  });

  it('shows partial failures and retries without presenting them as an empty conversation', async () => {
    vi.mocked(getAllComments).mockImplementationOnce(
      async (_client, _owner, _repo, _number, options) => {
        options?.onError?.('PR comments', new Error('Offline'));
        return [comments[1]!];
      },
    );
    render(<QuickReviewDiscussion pr={pr} enabled />);
    await screen.findByText('PR comments: Offline');
    expect(screen.getByText('Please handle errors.')).toBeVisible();
    expect(screen.queryByText('No comments yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh comments' }));
    await screen.findByText('Browser proof');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('distinguishes an empty author filter from a load failure', async () => {
    vi.mocked(getAllComments).mockResolvedValue([comments[1]!]);
    render(<QuickReviewDiscussion pr={pr} enabled />);
    await screen.findByText('Please handle errors.');
    fireEvent.click(screen.getByRole('button', { name: 'PR author · 0' }));
    expect(screen.getByText('No comments from the PR author.')).toBeVisible();
  });
});
