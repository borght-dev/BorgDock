import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import { FocusEmptyState } from '../FocusEmptyState';
import { makePr, resetSeq } from './helpers';

// Mock Tauri plugin-store to prevent real persistence calls
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    save: vi.fn(),
  }),
}));

afterEach(cleanup);

describe('FocusEmptyState', () => {
  beforeEach(() => {
    resetSeq();
    usePrStore.setState({ pullRequests: [] });
  });

  it('renders the empty state message', () => {
    render(<FocusEmptyState />);
    expect(screen.getByText('No PRs need attention')).toBeDefined();
  });

  it('renders the check-mark SVG icon', () => {
    const { container } = render(<FocusEmptyState />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('does not show pending CI text when no PRs are pending', () => {
    render(<FocusEmptyState />);
    expect(screen.queryByText(/waiting for CI/)).toBeNull();
  });

  it('shows pending CI count for single PR', () => {
    const pr = makePr();
    usePrStore.setState({
      pullRequests: [{ ...pr, overallStatus: 'yellow' }],
    });
    render(<FocusEmptyState />);
    expect(screen.getByText('1 PR waiting for CI')).toBeDefined();
  });

  it('shows pending CI count with plural for multiple PRs', () => {
    const pr1 = { ...makePr(), overallStatus: 'yellow' as const };
    const pr2 = { ...makePr(), overallStatus: 'yellow' as const };
    usePrStore.setState({ pullRequests: [pr1, pr2] });
    render(<FocusEmptyState />);
    expect(screen.getByText('2 PRs waiting for CI')).toBeDefined();
  });

  it('does not show filtered-out link when all PRs have scores', () => {
    render(<FocusEmptyState />);
    expect(screen.queryByText(/filtered out/)).toBeNull();
  });

  it('shows filtered-out count and switches to All view on click', () => {
    // Others' draft PRs get excluded from priority scoring, so they count as "filtered out"
    const pr1 = makePr({ isDraft: true, authorLogin: 'other1' });
    const pr2 = makePr({ isDraft: true, authorLogin: 'other2' });
    usePrStore.setState({ pullRequests: [pr1, pr2], username: 'testuser' });
    render(<FocusEmptyState />);
    const link = screen.getByText(/filtered out/);
    expect(link).toBeDefined();
    expect(link.textContent).toContain('2 PRs filtered out');

    fireEvent.click(link);
    expect(useUiStore.getState().activeSection).toBe('prs');
  });

  it('shows singular "PR" when only one is filtered out', () => {
    const pr1 = makePr({ isDraft: true, authorLogin: 'other' });
    usePrStore.setState({ pullRequests: [pr1], username: 'testuser' });
    render(<FocusEmptyState />);
    expect(screen.getByText(/1 PR filtered out/)).toBeDefined();
  });
});
