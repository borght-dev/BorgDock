import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import { TeamReviewLoad } from '../TeamReviewLoad';
import { usePrStore } from '@/stores/pr-store';

afterEach(cleanup);

vi.mock('@/stores/pr-store', () => {
  const fn = vi.fn();
  fn.getState = vi.fn(() => ({}));
  return { usePrStore: fn };
});

const mockUsePrStore = usePrStore as unknown as ReturnType<typeof vi.fn> & { getState: ReturnType<typeof vi.fn> };

describe('TeamReviewLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupStore(reviewers: Array<{ login: string; pendingReviewCount: number; stalePrCount: number; avgWaitHours: number }>) {
    const setFilter = vi.fn();
    const setSearchQuery = vi.fn();
    mockUsePrStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state: Record<string, unknown> = {
        pullRequests: [],
        reviewRequestTimestamps: {},
        teamReviewLoad: () => reviewers,
        setFilter,
        setSearchQuery,
      };
      return selector(state);
    });
    return { setFilter, setSearchQuery };
  }

  it('renders nothing when there are no reviewers', () => {
    setupStore([]);
    const { container } = render(<TeamReviewLoad />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the Review Load heading when reviewers exist', () => {
    setupStore([
      { login: 'alice', pendingReviewCount: 2, stalePrCount: 0, avgWaitHours: 1 },
    ]);
    render(<TeamReviewLoad />);
    expect(screen.getByText('Review Load')).toBeInTheDocument();
  });

  it('shows the reviewer count badge', () => {
    setupStore([
      { login: 'alice', pendingReviewCount: 2, stalePrCount: 0, avgWaitHours: 1 },
    ]);
    render(<TeamReviewLoad />);
    // Count badge shows "1" for 1 reviewer
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders reviewer rows with login and pending count', () => {
    setupStore([
      { login: 'alice', pendingReviewCount: 2, stalePrCount: 0, avgWaitHours: 1 },
      { login: 'bob', pendingReviewCount: 5, stalePrCount: 2, avgWaitHours: 10 },
    ]);
    render(<TeamReviewLoad />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('shows avatar initials for each reviewer', () => {
    setupStore([
      { login: 'carol', pendingReviewCount: 1, stalePrCount: 0, avgWaitHours: 0.5 },
    ]);
    render(<TeamReviewLoad />);
    expect(screen.getByText('CA')).toBeInTheDocument();
  });

  it('collapses and expands when clicking the heading button', () => {
    setupStore([
      { login: 'dave', pendingReviewCount: 3, stalePrCount: 0, avgWaitHours: 2 },
    ]);
    render(<TeamReviewLoad />);
    expect(screen.getByText('dave')).toBeInTheDocument();

    // Click the collapse button (the button that contains "Review Load")
    const collapseButton = screen.getByText('Review Load').closest('button')!;
    fireEvent.click(collapseButton);
    expect(screen.queryByText('dave')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(collapseButton);
    expect(screen.getByText('dave')).toBeInTheDocument();
  });

  it('calls setFilter and setSearchQuery when a reviewer row is clicked', () => {
    const { setFilter, setSearchQuery } = setupStore([
      { login: 'eve', pendingReviewCount: 1, stalePrCount: 0, avgWaitHours: 0 },
    ]);
    render(<TeamReviewLoad />);
    fireEvent.click(screen.getByText('eve'));
    expect(setFilter).toHaveBeenCalledWith('needsReview');
    expect(setSearchQuery).toHaveBeenCalledWith('eve');
  });
});
