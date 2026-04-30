import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FlyoutPr } from '../FlyoutGlance';
import { FlyoutPrRow } from '../FlyoutPrRow';

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

describe('FlyoutPrRow', () => {
  it('renders PrCardView in compact density', () => {
    const { container } = render(<FlyoutPrRow pr={sample} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-row]')).toBeInTheDocument();
    expect(container.querySelector('.bd-ring')).not.toBeInTheDocument();
  });

  it('emits data-pr-number for keyboard-nav contract', () => {
    const { container } = render(<FlyoutPrRow pr={sample} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-number="715"]')).toBeInTheDocument();
  });

  it('calls onClick when row is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(<FlyoutPrRow pr={sample} onClick={onClick} />);
    fireEvent.click(container.querySelector('[data-pr-row]')!);
    expect(onClick).toHaveBeenCalledWith(sample);
  });

  it('renders the approved review pill with data-pill-tone="approved"', () => {
    const { container } = render(
      <FlyoutPrRow pr={{ ...sample, reviewStatus: 'approved' }} onClick={vi.fn()} />,
    );
    expect(container.querySelector('[data-pill-tone="approved"]')).toBeInTheDocument();
  });

  it('always renders the smart-primary action button (Variant B)', () => {
    const { container } = render(<FlyoutPrRow pr={sample} onClick={vi.fn()} />);
    // Status is yellow, no failure → "open" is the primary for non-mine PRs.
    expect(container.querySelector('[data-pr-primary-action]')).toBeInTheDocument();
  });

  it('chooses "rerun" as primary when PR is failing', () => {
    const failingPr: FlyoutPr = {
      ...sample,
      failedCount: 2,
      overallStatus: 'red',
    };
    const { container } = render(<FlyoutPrRow pr={failingPr} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-primary-action="rerun"]')).toBeInTheDocument();
  });

  it('chooses "merge" as primary when PR is fully ready (green + approved + not draft)', () => {
    const readyPr: FlyoutPr = {
      ...sample,
      overallStatus: 'green',
      reviewStatus: 'approved',
      pendingCount: 0,
      passedCount: 5,
      isDraft: false,
    };
    const { container } = render(<FlyoutPrRow pr={readyPr} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-primary-action="merge"]')).toBeInTheDocument();
  });

  it('chooses "merge" as primary even when the PR is not the user\'s own', () => {
    const readyTheirPr: FlyoutPr = {
      ...sample,
      overallStatus: 'green',
      reviewStatus: 'approved',
      pendingCount: 0,
      passedCount: 5,
      isDraft: false,
      isMine: false,
    };
    const { container } = render(<FlyoutPrRow pr={readyTheirPr} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-primary-action="merge"]')).toBeInTheDocument();
  });

  it('does not choose "merge" when there are merge conflicts', () => {
    const conflictedPr: FlyoutPr = {
      ...sample,
      overallStatus: 'green',
      reviewStatus: 'approved',
      pendingCount: 0,
      passedCount: 5,
      isDraft: false,
      mergeable: false,
    };
    const { container } = render(<FlyoutPrRow pr={conflictedPr} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-primary-action="merge"]')).not.toBeInTheDocument();
  });

  it('chooses "checkout" as primary when PR is mine but not approved', () => {
    const ownPr: FlyoutPr = { ...sample, isMine: true };
    const { container } = render(<FlyoutPrRow pr={ownPr} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-primary-action="checkout"]')).toBeInTheDocument();
  });

  it('chooses "review" as primary when review is pending', () => {
    const reviewPr: FlyoutPr = { ...sample, reviewStatus: 'pending' };
    const { container } = render(<FlyoutPrRow pr={reviewPr} onClick={vi.fn()} />);
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
      <FlyoutPrRow pr={failingPr} onClick={vi.fn()} onAction={onAction} />,
    );
    const primaryBtn = container.querySelector('[data-pr-primary-action="rerun"]')!;
    fireEvent.click(primaryBtn);
    // The third arg is the React MouseEvent — used by FlyoutGlance to anchor
    // the context menu when action === 'more'. Tests assert on (pr, action)
    // and ignore the event payload.
    expect(onAction).toHaveBeenCalledWith(failingPr, 'rerun', expect.anything());
  });

  it('reveals secondary checkout/more icons on hover', () => {
    const onAction = vi.fn();
    const { container } = render(
      <FlyoutPrRow pr={sample} onClick={vi.fn()} onAction={onAction} />,
    );
    fireEvent.mouseEnter(container.querySelector('.relative')!);
    const checkoutBtn = container.querySelector('[data-flyout-action="checkout"]')!;
    fireEvent.click(checkoutBtn);
    expect(onAction).toHaveBeenCalledWith(sample, 'checkout', expect.anything());

    const moreBtn = container.querySelector('[data-flyout-action="more"]')!;
    fireEvent.click(moreBtn);
    expect(onAction).toHaveBeenCalledWith(sample, 'more', expect.anything());

    expect(screen.queryByText(/^Fix$/)).not.toBeInTheDocument();
  });
});
