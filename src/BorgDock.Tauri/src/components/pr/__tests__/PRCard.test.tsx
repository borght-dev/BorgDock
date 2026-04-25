import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PRCard, type PRCardData } from '../PRCard';

const basePr: PRCardData = {
  number: 715,
  title: 'AB#54258 Portal. Quote: resolve list price on add',
  repoOwner: 'Gomocha-FSP',
  repoName: 'FSP',
  authorLogin: 'sschmidt',
  isMine: false,
  status: 'yellow',
  statusLabel: 'in progress',
  reviewState: 'none',
  isDraft: false,
  isMerged: false,
  isClosed: false,
  hasConflict: false,
};

describe('PRCard', () => {
  it('renders title, repo, and #number in compact density', () => {
    render(<PRCard pr={basePr} density="compact" />);
    expect(screen.getByText(basePr.title)).toBeInTheDocument();
    expect(screen.getByText(/Gomocha-FSP\/FSP/)).toBeInTheDocument();
    expect(screen.getByText('#715')).toBeInTheDocument();
  });

  it('renders the readiness Ring in normal density when score is provided', () => {
    const { container } = render(
      <PRCard pr={basePr} density="normal" score={72} />,
    );
    expect(container.querySelector('.bd-ring')).toBeInTheDocument();
    expect(container.textContent).toContain('72');
  });

  it('does not render Ring in compact density even when score is provided', () => {
    const { container } = render(
      <PRCard pr={basePr} density="compact" score={72} />,
    );
    expect(container.querySelector('.bd-ring')).not.toBeInTheDocument();
  });

  it('emits data-pr-row + data-pr-number for the flyout selector contract', () => {
    const { container } = render(<PRCard pr={basePr} density="compact" />);
    const row = container.querySelector('[data-pr-row]');
    expect(row).toBeInTheDocument();
    expect(row?.getAttribute('data-pr-number')).toBe('715');
  });

  it('emits data-active="true" when active prop is set', () => {
    const { container } = render(
      <PRCard pr={basePr} density="compact" active />,
    );
    expect(
      container.querySelector('[data-pr-row][data-active="true"]'),
    ).toBeInTheDocument();
  });

  it('renders the approved review pill with data-pill-tone="approved"', () => {
    const { container } = render(
      <PRCard pr={{ ...basePr, reviewState: 'approved' }} density="compact" />,
    );
    const pill = container.querySelector('[data-pill-tone="approved"]');
    expect(pill).toBeInTheDocument();
    expect(pill?.textContent?.toLowerCase()).toContain('approved');
  });

  it('renders the changes-requested review pill with data-pill-tone="changes"', () => {
    const { container } = render(
      <PRCard
        pr={{ ...basePr, reviewState: 'changes' }}
        density="compact"
      />,
    );
    expect(
      container.querySelector('[data-pill-tone="changes"]'),
    ).toBeInTheDocument();
  });

  it('renders the draft pill when isDraft is true', () => {
    render(<PRCard pr={{ ...basePr, isDraft: true }} density="normal" />);
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  it('renders the conflicts pill when hasConflict is true', () => {
    render(
      <PRCard pr={{ ...basePr, hasConflict: true }} density="normal" />,
    );
    expect(screen.getByText(/conflicts/i)).toBeInTheDocument();
  });

  it('renders the merged pill when isMerged is true', () => {
    render(<PRCard pr={{ ...basePr, isMerged: true }} density="normal" />);
    expect(screen.getByText(/merged/i)).toBeInTheDocument();
  });

  it('uses Avatar tone "own" when isMine is true', () => {
    const { container } = render(
      <PRCard pr={{ ...basePr, isMine: true }} density="compact" />,
    );
    expect(container.querySelector('.bd-avatar--own')).toBeInTheDocument();
  });

  it('uses Avatar tone "them" when isMine is false', () => {
    const { container } = render(<PRCard pr={basePr} density="compact" />);
    expect(container.querySelector('.bd-avatar--them')).toBeInTheDocument();
  });

  it('fires onClick when the row is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <PRCard pr={basePr} density="compact" onClick={onClick} />,
    );
    fireEvent.click(container.querySelector('[data-pr-row]')!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders branch + diff stats only in normal density', () => {
    const enriched: PRCardData = {
      ...basePr,
      branch: 'features/54258-list-price-on-add',
      baseBranch: 'releases/R5.2',
      additions: 135,
      deletions: 10,
      changedFiles: 1,
      commitCount: 3,
    };
    const { rerender, container } = render(
      <PRCard pr={enriched} density="normal" />,
    );
    expect(screen.getByText(/features\/54258/)).toBeInTheDocument();
    expect(screen.getByText(/\+135/)).toBeInTheDocument();
    expect(screen.getByText(/[\u2212-]10/)).toBeInTheDocument();
    rerender(<PRCard pr={enriched} density="compact" />);
    expect(container.querySelector('[data-pr-row]')?.textContent).not.toContain('+135');
  });

  it('renders labels row in normal density when labels are present', () => {
    render(
      <PRCard
        pr={{ ...basePr, labels: ['AB#54258', 'AB#54482'] }}
        density="normal"
      />,
    );
    expect(screen.getByText('AB#54258')).toBeInTheDocument();
    expect(screen.getByText('AB#54482')).toBeInTheDocument();
  });

  it('renders trailing slot in normal density', () => {
    render(
      <PRCard
        pr={basePr}
        density="normal"
        trailing={<span data-testid="custom-trailing">x</span>}
      />,
    );
    expect(screen.getByTestId('custom-trailing')).toBeInTheDocument();
  });

  it('renders the commented review pill with data-pill-tone="commented"', () => {
    const { container } = render(
      <PRCard pr={{ ...basePr, reviewState: 'commented' }} density="compact" />,
    );
    expect(
      container.querySelector('[data-pill-tone="commented"]'),
    ).toBeInTheDocument();
  });

  it('renders the pending review pill with data-pill-tone="pending"', () => {
    const { container } = render(
      <PRCard pr={{ ...basePr, reviewState: 'pending' }} density="compact" />,
    );
    expect(
      container.querySelector('[data-pill-tone="pending"]'),
    ).toBeInTheDocument();
  });

  it('renders the closed pill when isClosed is true and isMerged is false', () => {
    render(
      <PRCard
        pr={{ ...basePr, isClosed: true, isMerged: false }}
        density="normal"
      />,
    );
    expect(screen.getByText(/closed/i)).toBeInTheDocument();
  });

  it('does not render the closed pill when isMerged is true', () => {
    render(
      <PRCard
        pr={{ ...basePr, isClosed: true, isMerged: true }}
        density="normal"
      />,
    );
    expect(screen.queryByText(/closed/i)).not.toBeInTheDocument();
    expect(screen.getByText(/merged/i)).toBeInTheDocument();
  });

  it('renders the worktree slot pill when worktreeSlot is provided', () => {
    render(
      <PRCard
        pr={{ ...basePr, worktreeSlot: 'wt-3' }}
        density="normal"
      />,
    );
    expect(screen.getByText('wt-3')).toBeInTheDocument();
  });

  it('fires onClick on Enter keypress in compact density', () => {
    const onClick = vi.fn();
    const { container } = render(
      <PRCard pr={basePr} density="compact" onClick={onClick} />,
    );
    fireEvent.keyDown(container.querySelector('[data-pr-row]')!, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('fires onClick on Space keypress in compact density and prevents default', () => {
    const onClick = vi.fn();
    const { container } = render(
      <PRCard pr={basePr} density="compact" onClick={onClick} />,
    );
    const event = fireEvent.keyDown(container.querySelector('[data-pr-row]')!, { key: ' ' });
    expect(onClick).toHaveBeenCalledOnce();
    expect(event).toBe(false); // preventDefault was called
  });
});
