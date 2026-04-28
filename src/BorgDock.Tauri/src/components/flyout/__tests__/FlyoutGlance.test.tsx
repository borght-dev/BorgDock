import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlyoutGlance, type FlyoutData } from '../FlyoutGlance';

const data: FlyoutData = {
  pullRequests: [
    {
      number: 715,
      title: 'AB#54258 list price on add',
      repoOwner: 'Gomocha-FSP',
      repoName: 'FSP',
      authorLogin: 'sschmidt',
      authorAvatarUrl: '',
      overallStatus: 'yellow',
      reviewStatus: 'none',
      failedCount: 0,
      failedCheckNames: [],
      pendingCount: 2,
      passedCount: 3,
      totalChecks: 5,
      commentCount: 0,
      isMine: false,
    },
    {
      number: 714,
      title: 'AB#54252 quote grid refresh',
      repoOwner: 'Gomocha-FSP',
      repoName: 'FSP',
      authorLogin: 'sschmidt',
      authorAvatarUrl: '',
      overallStatus: 'red',
      reviewStatus: 'approved',
      failedCount: 2,
      failedCheckNames: ['ci/e2e', 'ci/deploy-check'],
      pendingCount: 0,
      passedCount: 7,
      totalChecks: 9,
      commentCount: 2,
      isMine: false,
    },
  ],
  failingCount: 1,
  pendingCount: 1,
  passingCount: 1,
  totalCount: 2,
  username: 'me',
  theme: 'dark',
  lastSyncAgo: 'just now',
  hotkey: 'Ctrl+Win+Shift+G',
};

describe('FlyoutGlance', () => {
  it('renders one PRRow per pullRequests entry with data-pr-row', () => {
    const { container } = render(<FlyoutGlance data={data} onClose={vi.fn()} />);
    const rows = container.querySelectorAll('[data-pr-row]');
    expect(rows).toHaveLength(2);
  });

  it('renders the approved review pill on the second row', () => {
    const { container } = render(<FlyoutGlance data={data} onClose={vi.fn()} />);
    expect(
      container.querySelector('[data-pr-number="714"] [data-pill-tone="approved"]'),
    ).toBeInTheDocument();
  });

  it('shows the count of open PRs in the header subtitle', () => {
    render(<FlyoutGlance data={data} onClose={vi.fn()} />);
    expect(screen.getByText(/2 open pull requests/)).toBeInTheDocument();
  });

  it('exposes header buttons by accessible name', () => {
    render(<FlyoutGlance data={data} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('advances activeIndex on j keypress and rewinds on k', () => {
    const { container } = render(<FlyoutGlance data={data} onClose={vi.fn()} />);
    // Initial: row 0 is active
    const rows = () => Array.from(container.querySelectorAll('[data-pr-row]'));
    const activeIndex = () => rows().findIndex((el) => el.matches('[data-active="true"]'));
    expect(activeIndex()).toBe(0);
    fireEvent.keyDown(window, { key: 'j' });
    expect(activeIndex()).toBe(1);
    fireEvent.keyDown(window, { key: 'k' });
    expect(activeIndex()).toBe(0);
  });
});
