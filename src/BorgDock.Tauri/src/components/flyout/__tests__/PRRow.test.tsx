import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FlyoutPr } from '../FlyoutGlance';
import { PRRow } from '../PRRow';

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
    expect(container.querySelector('[data-pill-tone="approved"]')).toBeInTheDocument();
  });

  it('always renders the smart-primary action button (Variant B)', () => {
    const { container } = render(<PRRow pr={sample} onClick={vi.fn()} />);
    // Status is yellow, no failure → "open" is the primary for non-mine PRs.
    expect(container.querySelector('[data-pr-primary-action]')).toBeInTheDocument();
  });

  it('chooses "rerun" as primary when PR is failing', () => {
    const failingPr: FlyoutPr = {
      ...sample,
      failedCount: 2,
      overallStatus: 'red',
    };
    const { container } = render(<PRRow pr={failingPr} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-primary-action="rerun"]')).toBeInTheDocument();
  });

  it('chooses "merge" as primary when PR is approved & owned', () => {
    const approvedOwnPr: FlyoutPr = {
      ...sample,
      reviewStatus: 'approved',
      isMine: true,
    };
    const { container } = render(<PRRow pr={approvedOwnPr} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-primary-action="merge"]')).toBeInTheDocument();
  });

  it('chooses "checkout" as primary when PR is mine but not approved', () => {
    const ownPr: FlyoutPr = { ...sample, isMine: true };
    const { container } = render(<PRRow pr={ownPr} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-primary-action="checkout"]')).toBeInTheDocument();
  });

  it('chooses "review" as primary when review is pending', () => {
    const reviewPr: FlyoutPr = { ...sample, reviewStatus: 'pending' };
    const { container } = render(<PRRow pr={reviewPr} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-primary-action="review"]')).toBeInTheDocument();
  });

  it('invokes onAction with the resolved primary id when primary is clicked', () => {
    const onAction = vi.fn();
    const failingPr: FlyoutPr = {
      ...sample,
      failedCount: 2,
      overallStatus: 'red',
    };
    const { container } = render(
      <PRRow pr={failingPr} onClick={vi.fn()} onAction={onAction} />,
    );
    const primaryBtn = container.querySelector('[data-pr-primary-action="rerun"]')!;
    fireEvent.click(primaryBtn);
    expect(onAction).toHaveBeenCalledWith(failingPr, 'rerun');
  });

  it('reveals secondary checkout/more icons on hover', () => {
    const onAction = vi.fn();
    const { container } = render(
      <PRRow pr={sample} onClick={vi.fn()} onAction={onAction} />,
    );
    fireEvent.mouseEnter(container.querySelector('.relative')!);
    const checkoutBtn = container.querySelector('[data-flyout-action="checkout"]')!;
    fireEvent.click(checkoutBtn);
    expect(onAction).toHaveBeenCalledWith(sample, 'checkout');

    const moreBtn = container.querySelector('[data-flyout-action="more"]')!;
    fireEvent.click(moreBtn);
    expect(onAction).toHaveBeenCalledWith(sample, 'more');

    expect(screen.queryByText(/^Fix$/)).not.toBeInTheDocument();
  });
});
