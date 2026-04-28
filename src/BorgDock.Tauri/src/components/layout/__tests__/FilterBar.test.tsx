import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrStore } from '@/stores/pr-store';
import { makePr } from '@/test-utils/make-pr';

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn(), save: vi.fn() })),
}));

import { FilterBar } from '../FilterBar';

/** Get the count badge span inside a filter chip, or null if none */
function getCountBadge(button: HTMLElement): HTMLElement | null {
  return button.querySelector('span.bd-chip__count');
}

describe('FilterBar', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    usePrStore.setState({
      filter: 'all',
      pullRequests: [
        makePr(1),
        makePr(2, { overallStatus: 'red' }),
        makePr(3, { authorLogin: 'me', reviewStatus: 'approved' }),
      ],
      closedPullRequests: [],
      username: 'me',
      searchQuery: '',
    });
  });

  it('renders all filter buttons', () => {
    render(<FilterBar />);
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Needs Review')).toBeTruthy();
    expect(screen.getByText('Mine')).toBeTruthy();
    expect(screen.getByText('Failing')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Closed')).toBeTruthy();
  });

  it('highlights the active filter via aria-pressed', () => {
    render(<FilterBar />);
    const allBtn = screen.getByText('All').closest('button') as HTMLElement;
    expect(allBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('changes filter when a filter button is clicked', () => {
    render(<FilterBar />);
    fireEvent.click(screen.getByText('Failing'));
    expect(usePrStore.getState().filter).toBe('failing');
  });

  it('shows count badge for All filter', () => {
    render(<FilterBar />);
    const allBtn = screen.getByText('All').closest('button') as HTMLElement;
    const badge = getCountBadge(allBtn);
    expect(badge?.textContent).toBe('3');
  });

  it('shows count for failing filter', () => {
    render(<FilterBar />);
    const failingBtn = screen.getByText('Failing').closest('button') as HTMLElement;
    const badge = getCountBadge(failingBtn);
    expect(badge?.textContent).toBe('1');
  });

  it('shows count for mine filter', () => {
    render(<FilterBar />);
    const mineBtn = screen.getByText('Mine').closest('button') as HTMLElement;
    const badge = getCountBadge(mineBtn);
    expect(badge?.textContent).toBe('1');
  });

  it('applies active styling to clicked filter', () => {
    render(<FilterBar />);
    fireEvent.click(screen.getByText('Mine'));
    const mineBtn = screen.getByText('Mine').closest('button') as HTMLElement;
    expect(mineBtn.getAttribute('aria-pressed')).toBe('true');
    expect(mineBtn.getAttribute('data-filter-active')).toBe('true');
  });

  it('applies error tone to failing filter via Chip primitive', () => {
    usePrStore.setState({ filter: 'failing' });
    render(<FilterBar />);
    const failingBtn = screen.getByText('Failing').closest('button') as HTMLElement;
    expect(failingBtn.className).toContain('bd-pill--error');
  });

  it('does not show count badge when count is 0', () => {
    usePrStore.setState({ pullRequests: [] });
    render(<FilterBar />);
    const failingBtn = screen.getByText('Failing').closest('button') as HTMLElement;
    const badge = getCountBadge(failingBtn);
    expect(badge).toBeNull();
  });

  it('shows ready count for approved green PRs', () => {
    render(<FilterBar />);
    const readyBtn = screen.getByText('Ready').closest('button') as HTMLElement;
    const badge = getCountBadge(readyBtn);
    expect(badge?.textContent).toBe('1');
  });

  it('renders one Chip per filter key', () => {
    const { container } = render(<FilterBar />);
    expect(container.querySelectorAll('[data-filter-chip]').length).toBeGreaterThanOrEqual(5);
  });

  it('marks the active filter with data-filter-active="true"', () => {
    const { container } = render(<FilterBar />);
    expect(container.querySelector('[data-filter-chip][data-filter-active="true"]')).toBeInTheDocument();
  });

  it('uses Chip primitive (no --color-filter-chip-bg token reference)', () => {
    const { container } = render(<FilterBar />);
    expect(container.querySelector('.bd-chip')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/var\(--color-filter-chip-bg\)/);
  });
});
