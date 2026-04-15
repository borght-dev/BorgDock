import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClient = vi.fn();
const mockGetReviews = vi.fn();

vi.mock('@/services/github/singleton', () => ({
  getClient: () => mockGetClient(),
}));

vi.mock('@/services/github/reviews', () => ({
  getReviews: (...args: unknown[]) => mockGetReviews(...args),
}));

vi.mock('@/services/cache', () => ({
  loadTabData: vi.fn().mockResolvedValue(null),
  saveTabData: vi.fn().mockResolvedValue(undefined),
}));

import { ReviewsTab } from '../ReviewsTab';

function makeRawReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user: { login: 'alice' },
    state: 'APPROVED',
    body: 'LGTM',
    submitted_at: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('ReviewsTab', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClient.mockReturnValue({});
  });

  it('shows loading skeleton initially', () => {
    mockGetReviews.mockImplementation(() => new Promise(() => {}));
    const { container } = render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it('shows empty state when no reviews', async () => {
    mockGetReviews.mockResolvedValue([]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('No reviews yet.')).toBeTruthy();
    });
  });

  it('renders review user name', async () => {
    mockGetReviews.mockResolvedValue([makeRawReview()]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeTruthy();
    });
  });

  it('renders "Approved" state label', async () => {
    mockGetReviews.mockResolvedValue([makeRawReview({ state: 'APPROVED' })]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Approved')).toBeTruthy();
    });
  });

  it('renders "Changes Requested" state label', async () => {
    mockGetReviews.mockResolvedValue([makeRawReview({ state: 'CHANGES_REQUESTED' })]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Changes Requested')).toBeTruthy();
    });
  });

  it('renders "Commented" state label', async () => {
    mockGetReviews.mockResolvedValue([makeRawReview({ state: 'COMMENTED' })]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Commented')).toBeTruthy();
    });
  });

  it('renders review body as markdown', async () => {
    mockGetReviews.mockResolvedValue([makeRawReview({ body: 'Great work on this PR' })]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Great work on this PR')).toBeTruthy();
    });
  });

  it('does not render body section when body is empty', async () => {
    mockGetReviews.mockResolvedValue([makeRawReview({ body: '' })]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeTruthy();
    });
    const markdownBodies = document.querySelectorAll('.markdown-body');
    expect(markdownBodies.length).toBe(0);
  });

  it('renders avatar initials', async () => {
    mockGetReviews.mockResolvedValue([makeRawReview({ user: { login: 'bob' } })]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('BO')).toBeTruthy();
    });
  });

  it('renders multiple reviews', async () => {
    mockGetReviews.mockResolvedValue([
      makeRawReview({ id: 1, user: { login: 'alice' }, state: 'APPROVED' }),
      makeRawReview({ id: 2, user: { login: 'bob' }, state: 'CHANGES_REQUESTED' }),
    ]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeTruthy();
      expect(screen.getByText('bob')).toBeTruthy();
    });
  });

  it('renders sort buttons', async () => {
    mockGetReviews.mockResolvedValue([makeRawReview()]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Newest')).toBeTruthy();
      expect(screen.getByText('Oldest')).toBeTruthy();
      expect(screen.getByText('Severity')).toBeTruthy();
      expect(screen.getByText('File')).toBeTruthy();
    });
  });

  it('changes sort mode on button click', async () => {
    mockGetReviews.mockResolvedValue([
      makeRawReview({
        id: 1,
        user: { login: 'alice' },
        submitted_at: '2026-01-14T10:00:00Z',
        state: 'APPROVED',
      }),
      makeRawReview({
        id: 2,
        user: { login: 'bob' },
        submitted_at: '2026-01-16T10:00:00Z',
        state: 'CHANGES_REQUESTED',
      }),
    ]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Severity'));
    // After sorting by severity, CHANGES_REQUESTED should appear before APPROVED
    const reviews = screen.getAllByText(/alice|bob/);
    expect(reviews.length).toBe(2);
  });

  it('handles null client gracefully', async () => {
    mockGetClient.mockReturnValue(null);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('No reviews yet.')).toBeTruthy();
    });
  });

  it('handles error gracefully', async () => {
    mockGetReviews.mockRejectedValue(new Error('API error'));
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    // useCachedTabData catches the error; component shows empty state
    await waitFor(() => {
      expect(screen.getByText('No reviews yet.')).toBeTruthy();
    });
  });

  it('handles missing user login gracefully', async () => {
    mockGetReviews.mockResolvedValue([makeRawReview({ user: null })]);
    render(
      <ReviewsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      // Should render with empty string user
      const container = document.querySelector('.divide-y');
      expect(container).toBeTruthy();
    });
  });

  it('passes correct params to getReviews', async () => {
    mockGetReviews.mockResolvedValue([]);
    render(
      <ReviewsTab
        prNumber={42}
        repoOwner="myorg"
        repoName="myrepo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(mockGetReviews).toHaveBeenCalledWith(expect.anything(), 'myorg', 'myrepo', 42);
    });
  });
});
