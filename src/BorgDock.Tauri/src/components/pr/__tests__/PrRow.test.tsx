import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PrRow, PrTableHeader } from '../PrRow';
import type { PrCardData } from '../pr-card-data';

const basePr: PrCardData = {
  number: 715,
  title: 'AB#54258 Portal. Quote: resolve list price on add',
  repoOwner: 'Gomocha-FSP',
  repoName: 'FSP',
  authorLogin: 'sschmidt',
  isMine: false,
  status: 'red',
  statusLabel: '1 failing',
  reviewState: 'none',
  isDraft: false,
  isMerged: false,
  isClosed: false,
  hasConflict: false,
  branch: 'features/54258-list-price-on-add',
  baseBranch: 'main',
  additions: 1350,
  deletions: 10,
  changedFiles: 4,
  commitCount: 3,
  commentCount: 5,
};

describe.each(['comfortable', 'compact'] as const)('PrRow (%s)', (density) => {
  it('renders title, author, status, delta and number', () => {
    const { container } = render(<PrRow pr={basePr} density={density} />);
    expect(screen.getByText(basePr.title)).toBeInTheDocument();
    expect(screen.getByText('sschmidt')).toBeInTheDocument();
    expect(screen.getByText('1 failing')).toBeInTheDocument();
    expect(screen.getByText('+1,350')).toBeInTheDocument();
    expect(container.textContent).toContain('715');
  });

  it('hides repo, branch, commit/file/comment counts', () => {
    const { container } = render(<PrRow pr={basePr} density={density} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Gomocha-FSP');
    expect(text).not.toContain('features/54258');
    expect(text).not.toContain('3c');
    expect(text).not.toContain('files');
  });

  it('shows the base branch only when it is not main/master', () => {
    const { rerender } = render(<PrRow pr={basePr} density={density} />);
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    rerender(<PrRow pr={{ ...basePr, baseBranch: 'release/2.3' }} density={density} />);
    expect(screen.getByText(/release\/2\.3/)).toBeInTheDocument();
  });

  it('renders review, conflict, draft and label pills', () => {
    const { container } = render(
      <PrRow
        pr={{
          ...basePr,
          reviewState: 'commented',
          hasConflict: true,
          isDraft: true,
          labels: ['core-api'],
        }}
        density={density}
      />,
    );
    expect(container.querySelector('[data-pill-tone="commented"]')).toBeInTheDocument();
    expect(screen.getByText('conflicts')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('core-api')).toBeInTheDocument();
  });

  it('renders the readiness ring when a score is given', () => {
    const { container } = render(<PrRow pr={basePr} density={density} score={72} />);
    expect(container.querySelector('.bd-ring')).toBeInTheDocument();
  });

  it('renders extras inline', () => {
    render(<PrRow pr={basePr} density={density} extras={<span>AB#99</span>} />);
    expect(screen.getByText('AB#99')).toBeInTheDocument();
  });

  it('fires onClick on click and Enter', () => {
    const onClick = vi.fn();
    const { container } = render(<PrRow pr={basePr} density={density} onClick={onClick} />);
    const row = container.querySelector('[data-pr-row]')!;
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('marks active and selected rows', () => {
    const { container } = render(<PrRow pr={basePr} density={density} active isFocused />);
    const row = container.querySelector('[data-pr-row]')!;
    expect(row).toHaveAttribute('data-active', 'true');
    expect(row).toHaveAttribute('data-selected', 'true');
  });
});

describe('PrRow compact specifics', () => {
  it('shows an em dash when there is no review', () => {
    const { container } = render(<PrRow pr={basePr} density="compact" />);
    expect(container.querySelector('[data-pr-review]')?.textContent).toBe('—');
  });

  it('PrTableHeader lists the table columns', () => {
    const { container } = render(<PrTableHeader />);
    expect(container.textContent).toContain('Pull request');
    expect(container.textContent).toContain('Checks');
    expect(container.textContent).toContain('Ready');
  });
});
