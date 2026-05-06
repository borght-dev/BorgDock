import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrStore } from '@/stores/pr-store';
import { PrToolbar } from '../PrToolbar';

afterEach(cleanup);

describe('PrToolbar', () => {
  beforeEach(() => {
    // Reset filter / search to known defaults
    usePrStore.setState({ filter: 'all', searchQuery: '' });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseCounts = {
    all: 9,
    needs: 1,
    mine: 3,
    failing: 2,
    ready: 1,
    review: 2,
    closed: 0,
  };

  it('renders all filter pills with their labels', () => {
    render(<PrToolbar counts={baseCounts} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Needs Review')).toBeInTheDocument();
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.getByText('Failing')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('renders the search input with correct placeholder', () => {
    render(<PrToolbar counts={baseCounts} />);
    expect(screen.getByPlaceholderText(/Filter pull requests/i)).toBeInTheDocument();
  });

  it('marks the active filter pill (default is "all")', () => {
    const { container } = render(<PrToolbar counts={baseCounts} />);
    const allChip = container.querySelector('[data-filter-key="all"]');
    expect(allChip?.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a filter pill updates the store', () => {
    render(<PrToolbar counts={baseCounts} />);
    fireEvent.click(screen.getByText('Failing'));
    expect(usePrStore.getState().filter).toBe('failing');
  });

  it('typing into the search input updates the store after debounce', () => {
    render(<PrToolbar counts={baseCounts} />);
    const input = screen.getByPlaceholderText(/Filter pull requests/i);
    fireEvent.change(input, { target: { value: 'docs' } });
    // Debounced — drain timers (wrap in act to flush the resulting state update)
    act(() => {
      vi.runAllTimers();
    });
    expect(usePrStore.getState().searchQuery).toBe('docs');
  });
});
