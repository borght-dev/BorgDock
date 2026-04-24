import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import { makePr } from '@/test-utils/make-pr';

const mockStartDragging = vi.fn(() => Promise.resolve());
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    toggleMaximize: vi.fn(),
    startDragging: mockStartDragging,
  })),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn(), save: vi.fn() })),
}));

vi.mock('@/components/onboarding', () => ({
  FeatureBadge: ({ badgeId }: { badgeId: string }) => (
    <span data-testid={`feature-badge-${badgeId}`}>NEW</span>
  ),
}));

import { Header } from '../Header';

describe('Header', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({
      activeSection: 'prs',
      isSettingsOpen: false,
      isDragging: false,
    });
    usePrStore.setState({
      pullRequests: [makePr(1), makePr(2)],
      closedPullRequests: [],
      username: 'testuser',
      isPolling: false,
    });
  });

  it('renders the BorgDock title', () => {
    render(<Header />);
    expect(screen.getByText('BorgDock')).toBeTruthy();
  });

  it('shows the open PR count', () => {
    render(<Header />);
    expect(screen.getByText('2 open')).toBeTruthy();
  });

  it('renders section switcher buttons', () => {
    render(<Header />);
    expect(screen.getByText('Focus')).toBeTruthy();
    expect(screen.getByText('PRs')).toBeTruthy();
    expect(screen.getByText('Work Items')).toBeTruthy();
  });

  it('highlights the active section', () => {
    render(<Header />);
    const tabs = screen.getAllByRole('tab');
    const prsTab = tabs.find((t) => t.textContent?.includes('PRs'));
    const focusTab = tabs.find((t) => t.textContent?.includes('Focus'));
    expect(prsTab).toHaveAttribute('aria-selected', 'true');
    expect(focusTab).toHaveAttribute('aria-selected', 'false');
  });

  it('switches section when a section button is clicked', () => {
    render(<Header />);
    fireEvent.click(screen.getByText('Focus'));
    expect(useUiStore.getState().activeSection).toBe('focus');
  });

  it('renders Refresh, Minimize, and Settings buttons', () => {
    render(<Header />);
    expect(screen.getByLabelText('Refresh')).toBeTruthy();
    expect(screen.getByLabelText('Minimize to badge')).toBeTruthy();
    expect(screen.getByLabelText('Settings')).toBeTruthy();
  });

  it('opens settings when Settings button is clicked', () => {
    render(<Header />);
    fireEvent.click(screen.getByLabelText('Settings'));
    expect(useUiStore.getState().isSettingsOpen).toBe(true);
  });

  it('dispatches borgdock-refresh event on Refresh click', () => {
    const spy = vi.fn();
    document.addEventListener('borgdock-refresh', spy);
    render(<Header />);
    fireEvent.click(screen.getByLabelText('Refresh'));
    expect(spy).toHaveBeenCalledTimes(1);
    document.removeEventListener('borgdock-refresh', spy);
  });

  it('calls invoke for minimize to badge', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    render(<Header />);
    fireEvent.click(screen.getByLabelText('Minimize to badge'));
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('hide_sidebar');
    });
  });

  it('shows green status dot when no failing PRs', () => {
    render(<Header />);
    const dot = document.querySelector('.sidebar-status-dot');
    expect(dot?.className).toContain('sidebar-status-dot--green');
  });

  it('shows red status dot when there are failing PRs', () => {
    usePrStore.setState({
      pullRequests: [makePr(1, { overallStatus: 'red' }), makePr(2)],
    });
    render(<Header />);
    const dot = document.querySelector('.sidebar-status-dot');
    expect(dot?.className).toContain('sidebar-status-dot--red');
  });

  it('shows polling spinner when isPolling is true', () => {
    usePrStore.setState({ isPolling: true });
    render(<Header />);
    expect(document.querySelector('.sidebar-poll-spinner')).toBeTruthy();
  });

  it('hides polling spinner when isPolling is false', () => {
    usePrStore.setState({ isPolling: false });
    render(<Header />);
    expect(document.querySelector('.sidebar-poll-spinner')).toBeNull();
  });

  it('renders FeatureBadge for focus mode', () => {
    render(<Header />);
    expect(screen.getByTestId('feature-badge-focus-mode')).toBeTruthy();
  });

  it('handles drag start on header mousedown', () => {
    render(<Header />);
    const header = document.querySelector('.sidebar-header') as HTMLElement;
    fireEvent.mouseDown(header, { button: 0 });
    expect(mockStartDragging).toHaveBeenCalled();
  });

  it('does not start drag on right-click', () => {
    render(<Header />);
    const header = document.querySelector('.sidebar-header') as HTMLElement;
    fireEvent.mouseDown(header, { button: 2 });
    expect(mockStartDragging).not.toHaveBeenCalled();
  });
});
