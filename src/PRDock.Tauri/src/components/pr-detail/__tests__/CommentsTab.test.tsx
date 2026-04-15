import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeReviewComment } from '@/types';

const mockGetClient = vi.fn();
const mockGetAllComments = vi.fn();

vi.mock('@/services/github/singleton', () => ({
  getClient: () => mockGetClient(),
}));

vi.mock('@/services/github', () => ({
  getAllComments: (...args: unknown[]) => mockGetAllComments(...args),
  postComment: vi.fn(),
}));

vi.mock('@/services/cache', () => ({
  loadTabData: vi.fn().mockResolvedValue(null),
  saveTabData: vi.fn().mockResolvedValue(undefined),
}));

import { CommentsTab } from '../CommentsTab';

function makeComment(overrides: Partial<ClaudeReviewComment> = {}): ClaudeReviewComment {
  return {
    id: '1',
    author: 'alice',
    body: 'Looks good to me!',
    severity: 'unknown',
    createdAt: '2026-01-15T10:00:00Z',
    htmlUrl: 'https://github.com/owner/repo/pull/1#issuecomment-1',
    ...overrides,
  };
}

describe('CommentsTab', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClient.mockReturnValue({});
  });

  it('shows loading skeleton initially', () => {
    mockGetAllComments.mockImplementation(() => new Promise(() => {}));
    const { container } = render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it('shows empty state when no comments', async () => {
    mockGetAllComments.mockResolvedValue([]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('No comments yet.')).toBeTruthy();
    });
  });

  it('renders comment body', async () => {
    mockGetAllComments.mockResolvedValue([makeComment({ body: 'This is a great change!' })]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('This is a great change!')).toBeTruthy();
    });
  });

  it('renders author name', async () => {
    mockGetAllComments.mockResolvedValue([makeComment({ author: 'bob' })]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('bob')).toBeTruthy();
    });
  });

  it('renders avatar initials for regular users', async () => {
    mockGetAllComments.mockResolvedValue([makeComment({ author: 'alice' })]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('AL')).toBeTruthy();
    });
  });

  it('shows bot badge for bot users', async () => {
    mockGetAllComments.mockResolvedValue([makeComment({ author: 'dependabot[bot]' })]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('bot')).toBeTruthy();
    });
  });

  it('detects -bot suffix as bot', async () => {
    mockGetAllComments.mockResolvedValue([makeComment({ author: 'release-bot' })]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('bot')).toBeTruthy();
    });
  });

  it('renders file path for inline comments', async () => {
    mockGetAllComments.mockResolvedValue([makeComment({ filePath: 'src/app.ts', lineNumber: 42 })]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('src/app.ts:42')).toBeTruthy();
    });
  });

  it('renders file path without line number when absent', async () => {
    mockGetAllComments.mockResolvedValue([
      makeComment({ filePath: 'src/app.ts', lineNumber: undefined }),
    ]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeTruthy();
    });
  });

  it('shows sort toggle button', async () => {
    mockGetAllComments.mockResolvedValue([makeComment()]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Newest first')).toBeTruthy();
    });
  });

  it('toggles sort order on click', async () => {
    mockGetAllComments.mockResolvedValue([makeComment()]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Newest first')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Newest first'));
    expect(screen.getByText('Oldest first')).toBeTruthy();
  });

  it('renders comment input textarea', async () => {
    mockGetAllComments.mockResolvedValue([]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Leave a comment...')).toBeTruthy();
    });
  });

  it('renders Comment button disabled when input is empty', async () => {
    mockGetAllComments.mockResolvedValue([]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      const btn = screen.getByText('Comment');
      expect(btn.closest('button')?.disabled).toBe(true);
    });
  });

  it('enables Comment button when text is entered', async () => {
    mockGetAllComments.mockResolvedValue([]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Leave a comment...')).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText('Leave a comment...'), {
      target: { value: 'New comment' },
    });
    const btn = screen.getByText('Comment');
    expect(btn.closest('button')?.disabled).toBe(false);
  });

  it('shows "Ctrl+Enter to submit" hint', async () => {
    mockGetAllComments.mockResolvedValue([]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Ctrl+Enter to submit')).toBeTruthy();
    });
  });

  it('renders multiple comments', async () => {
    mockGetAllComments.mockResolvedValue([
      makeComment({ id: '1', author: 'alice', body: 'First' }),
      makeComment({ id: '2', author: 'bob', body: 'Second' }),
    ]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('First')).toBeTruthy();
      expect(screen.getByText('Second')).toBeTruthy();
    });
  });

  it('handles error gracefully during load', async () => {
    mockGetAllComments.mockRejectedValue(new Error('Network'));
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    // useCachedTabData catches the error; component shows empty state
    await waitFor(() => {
      expect(screen.getByText('No comments yet.')).toBeTruthy();
    });
  });

  it('does not load when client is null', async () => {
    mockGetClient.mockReturnValue(null);
    mockGetAllComments.mockResolvedValue([]);
    render(
      <CommentsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    // Should eventually stop loading without calling getAllComments
    await waitFor(() => {
      expect(mockGetAllComments).not.toHaveBeenCalled();
    });
  });
});
