import { fireEvent, render } from '@testing-library/react';
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
});
