import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PRRow } from '../PRRow';
import type { FlyoutPr } from '../FlyoutGlance';

const sample: FlyoutPr = {
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
};

describe('PRRow', () => {
  it('renders PRCard in compact density', () => {
    const { container } = render(<PRRow pr={sample} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-row]')).toBeInTheDocument();
    expect(container.querySelector('.bd-ring')).not.toBeInTheDocument();
  });

  it('emits data-pr-number for keyboard-nav contract', () => {
    const { container } = render(<PRRow pr={sample} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-number="715"]')).toBeInTheDocument();
  });

  it('calls onClick when row is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(<PRRow pr={sample} onClick={onClick} />);
    fireEvent.click(container.querySelector('[data-pr-row]')!);
    expect(onClick).toHaveBeenCalledWith(sample);
  });

  it('renders the approved review pill with data-pill-tone="approved"', () => {
    const { container } = render(
      <PRRow pr={{ ...sample, reviewStatus: 'approved' }} onClick={vi.fn()} />,
    );
    expect(
      container.querySelector('[data-pill-tone="approved"]'),
    ).toBeInTheDocument();
  });

  it('renders Fix button on hover when failedCount > 0', async () => {
    const onFix = vi.fn();
    const failingPr = { ...sample, failedCount: 2, overallStatus: 'red' as const };
    const { container } = render(
      <PRRow pr={failingPr} onClick={vi.fn()} onFix={onFix} />,
    );
    fireEvent.mouseEnter(container.querySelector('.relative')!);
    const fixBtn = await screen.findByText(/^Fix$/);
    fireEvent.click(fixBtn);
    expect(onFix).toHaveBeenCalledWith(failingPr);
  });

  it('does not render Fix button when failedCount is 0', () => {
    const onFix = vi.fn();
    const { container } = render(
      <PRRow pr={{ ...sample, failedCount: 0 }} onClick={vi.fn()} onFix={onFix} />,
    );
    fireEvent.mouseEnter(container.querySelector('.relative')!);
    expect(screen.queryByText(/^Fix$/)).not.toBeInTheDocument();
  });

  it('renders Monitor button on hover when status is not green', async () => {
    const onMonitor = vi.fn();
    const yellowPr = { ...sample, overallStatus: 'yellow' as const, totalChecks: 5 };
    const { container } = render(
      <PRRow pr={yellowPr} onClick={vi.fn()} onMonitor={onMonitor} />,
    );
    fireEvent.mouseEnter(container.querySelector('.relative')!);
    const btn = await screen.findByText(/^Monitor$/);
    fireEvent.click(btn);
    expect(onMonitor).toHaveBeenCalledWith(yellowPr);
  });

  it('does not render Monitor button when status is green', () => {
    const onMonitor = vi.fn();
    const { container } = render(
      <PRRow
        pr={{ ...sample, overallStatus: 'green', totalChecks: 5 }}
        onClick={vi.fn()}
        onMonitor={onMonitor}
      />,
    );
    fireEvent.mouseEnter(container.querySelector('.relative')!);
    expect(screen.queryByText(/^Monitor$/)).not.toBeInTheDocument();
  });
});
