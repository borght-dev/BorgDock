import { fireEvent, render } from '@testing-library/react';
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

const ready: FlyoutPr = {
  ...sample,
  overallStatus: 'green',
  reviewStatus: 'approved',
  pendingCount: 0,
  passedCount: 5,
  isDraft: false,
};

describe('FlyoutPrRow', () => {
  it('is the compact Workbench row: PrRowCore at 32 px, no ring, no hover pill bar', () => {
    const { container } = render(<FlyoutPrRow pr={sample} onClick={vi.fn()} />);
    const row = container.querySelector('[data-pr-row]');
    expect(row).toHaveClass('bd-wb-row', 'bd-wb-row--compact');
    expect(row).toHaveAttribute('data-density', 'compact');
    expect(container.querySelector('.bd-ring')).not.toBeInTheDocument();
    expect(container.querySelector('[data-pr-primary-action]')).not.toBeInTheDocument();
    // Compact drops the meta line.
    expect(container.querySelector('.bd-wb-row__meta')).not.toBeInTheDocument();
  });

  it('emits data-pr-number and data-pr-key for the keyboard-nav contract', () => {
    const { container } = render(<FlyoutPrRow pr={sample} onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-number="715"]')).toBeInTheDocument();
    expect(container.querySelector('[data-pr-key="Gomocha-FSP/FSP#715"]')).toBeInTheDocument();
  });

  it('draws the check bar from the payload counts', () => {
    const { container } = render(<FlyoutPrRow pr={sample} onClick={vi.fn()} />);
    expect(container.querySelector('.bd-wb-row__checks')).toHaveAttribute(
      'title',
      expect.stringMatching(/running/),
    );
  });

  it('calls onClick when the row is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(<FlyoutPrRow pr={sample} onClick={onClick} />);
    fireEvent.click(container.querySelector('[data-pr-row]')!);
    expect(onClick).toHaveBeenCalledWith(sample);
  });

  it('marks the active row as selected', () => {
    const { container } = render(<FlyoutPrRow pr={sample} active onClick={vi.fn()} />);
    expect(container.querySelector('[data-pr-row]')).toHaveAttribute('data-selected', 'true');
  });

  it('shows the approved chip', () => {
    const { container } = render(
      <FlyoutPrRow pr={{ ...sample, reviewStatus: 'approved' }} onClick={vi.fn()} />,
    );
    expect(container.querySelector('[data-chip="approved"]')).toBeInTheDocument();
  });

  it('draws only the action the main window sent, never its own guess', () => {
    const { container, rerender } = render(
      // `reviewStatus: 'pending'` alone is not "waiting on you": no action.
      <FlyoutPrRow pr={{ ...sample, reviewStatus: 'pending' }} onClick={vi.fn()} />,
    );
    const actions = () =>
      [...container.querySelectorAll('[data-pr-action]')].map((el) =>
        el.getAttribute('data-pr-action'),
      );
    expect(actions()).toEqual(['more']);
    rerender(<FlyoutPrRow pr={{ ...sample, primaryAction: 'review' }} onClick={vi.fn()} />);
    expect(actions()).toEqual(['review', 'more']);
    rerender(<FlyoutPrRow pr={{ ...ready, primaryAction: 'merge' }} onClick={vi.fn()} />);
    expect(actions()).toEqual(['merge', 'more']);
    rerender(<FlyoutPrRow pr={{ ...ready, primaryAction: null }} onClick={vi.fn()} />);
    expect(actions()).toEqual(['more']);
  });

  it('Review forwards the review action without opening the row', () => {
    const onAction = vi.fn();
    const onClick = vi.fn();
    const pending: FlyoutPr = { ...sample, primaryAction: 'review' };
    const { container } = render(
      <FlyoutPrRow pr={pending} onClick={onClick} onAction={onAction} />,
    );
    fireEvent.click(container.querySelector('[data-pr-action="review"]')!);
    expect(onAction).toHaveBeenCalledWith(pending, 'review', expect.anything());
    expect(onClick).not.toHaveBeenCalled();
    expect(container.querySelector('[data-pr-action="merge"]')).not.toBeInTheDocument();
  });

  it('Merge forwards the merge action for a ready PR', () => {
    const onAction = vi.fn();
    const mergeable: FlyoutPr = { ...ready, primaryAction: 'merge' };
    const { container } = render(
      <FlyoutPrRow pr={mergeable} onClick={vi.fn()} onAction={onAction} />,
    );
    fireEvent.click(container.querySelector('[data-pr-action="merge"]')!);
    expect(onAction).toHaveBeenCalledWith(mergeable, 'merge', expect.anything());
  });

  it('More and right-click open the context menu', () => {
    const onAction = vi.fn();
    const { container } = render(<FlyoutPrRow pr={sample} onClick={vi.fn()} onAction={onAction} />);
    fireEvent.click(container.querySelector('[data-pr-action="more"]')!);
    expect(onAction).toHaveBeenLastCalledWith(sample, 'more', expect.anything());
    fireEvent.contextMenu(container.querySelector('[data-pr-row]')!);
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith(sample, 'more', expect.anything());
  });
});
