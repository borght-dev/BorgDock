import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrStore } from '@/stores/pr-store';
import { makePr } from '@/test-utils/make-pr';

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn(), save: vi.fn() })),
}));

import { StatusBar } from '../StatusBar';

describe('StatusBar', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [],
      username: '',
      rateLimit: null,
      lastPollTime: null,
    });
  });

  it('shows PR count', () => {
    usePrStore.setState({
      pullRequests: [makePr(1), makePr(2), makePr(3)],
    });
    render(<StatusBar />);
    expect(screen.getByText('3 PRs')).toBeTruthy();
  });

  it('shows 0 PRs when none exist', () => {
    render(<StatusBar />);
    expect(screen.getByText('0 PRs')).toBeTruthy();
  });

  it('shows failing count when there are failing PRs', () => {
    usePrStore.setState({
      pullRequests: [makePr(1, { overallStatus: 'red' }), makePr(2)],
    });
    render(<StatusBar />);
    expect(screen.getByText('1 failing')).toBeTruthy();
  });

  it('does not show failing count when none are failing', () => {
    usePrStore.setState({ pullRequests: [makePr(1)] });
    render(<StatusBar />);
    expect(screen.queryByText(/failing/)).toBeNull();
  });

  it('shows ready count when there are ready PRs (approved + green)', () => {
    usePrStore.setState({
      pullRequests: [makePr(1, { reviewStatus: 'approved' })],
    });
    render(<StatusBar />);
    expect(screen.getByText('1 ready')).toBeTruthy();
  });

  it('shows rate limit info when available', () => {
    usePrStore.setState({
      rateLimit: { remaining: 4500, limit: 5000, resetAt: new Date() },
    });
    render(<StatusBar />);
    expect(screen.getByText('4500/5000')).toBeTruthy();
  });

  it('does not show rate limit when null', () => {
    render(<StatusBar />);
    expect(screen.queryByText(/\d+\/\d+/)).toBeNull();
  });

  it('shows "Never" when lastPollTime is null', () => {
    render(<StatusBar />);
    expect(screen.getByText('Never')).toBeTruthy();
  });

  it('shows "Just now" when poll was seconds ago', () => {
    usePrStore.setState({ lastPollTime: new Date() });
    render(<StatusBar />);
    expect(screen.getByText('Just now')).toBeTruthy();
  });

  it('shows minutes ago format', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    usePrStore.setState({ lastPollTime: fiveMinAgo });
    render(<StatusBar />);
    expect(screen.getByText('5m ago')).toBeTruthy();
  });

  it('shows hours ago format', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    usePrStore.setState({ lastPollTime: twoHoursAgo });
    render(<StatusBar />);
    expect(screen.getByText('2h ago')).toBeTruthy();
  });

  it('shows rate limit title tooltip', () => {
    usePrStore.setState({
      rateLimit: { remaining: 100, limit: 5000, resetAt: new Date() },
    });
    render(<StatusBar />);
    const el = screen.getByText('100/5000');
    expect(el.getAttribute('title')).toBe('GitHub API: 100 of 5000 remaining');
  });
});
