import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffViewMode, FileStatusFilter, PullRequestCommit } from '@/types';
import { DiffToolbar } from '../DiffToolbar';

function makeCommit(overrides: Partial<PullRequestCommit> = {}): PullRequestCommit {
  return {
    sha: 'abc1234567890',
    message: 'fix: resolve issue with rendering',
    authorLogin: 'testuser',
    authorAvatarUrl: 'https://example.com/avatar.png',
    date: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof DiffToolbar>[0]> = {}) {
  return {
    viewMode: 'unified' as DiffViewMode,
    onViewModeChange: vi.fn(),
    showFileTree: false,
    onToggleFileTree: vi.fn(),
    allExpanded: true,
    onToggleAllExpanded: vi.fn(),
    statusFilter: 'all' as FileStatusFilter,
    onStatusFilterChange: vi.fn(),
    fileCount: 5,
    totalAdditions: 42,
    totalDeletions: 13,
    commits: [] as PullRequestCommit[],
    selectedCommit: null as string | null,
    onCommitChange: vi.fn(),
    ...overrides,
  };
}

describe('DiffToolbar', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Unified/Split mode chips', () => {
    const { container } = render(<DiffToolbar {...makeProps({ viewMode: 'unified' })} />);
    const chips = container.querySelectorAll('[data-diff-view-mode]');
    expect(chips).toHaveLength(2);
    expect(
      container.querySelector('[data-diff-view-mode="unified"][aria-pressed="true"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-diff-view-mode="split"][aria-pressed="false"]'),
    ).toBeInTheDocument();
  });

  it('calls onViewModeChange when clicking Unified', () => {
    const props = makeProps({ viewMode: 'split' });
    render(<DiffToolbar {...props} />);
    fireEvent.click(screen.getByText('Unified'));
    expect(props.onViewModeChange).toHaveBeenCalledWith('unified');
  });

  it('calls onViewModeChange when clicking Split', () => {
    const props = makeProps({ viewMode: 'unified' });
    render(<DiffToolbar {...props} />);
    fireEvent.click(screen.getByText('Split'));
    expect(props.onViewModeChange).toHaveBeenCalledWith('split');
  });

  it('renders the file-tree IconButton with correct tooltip when hidden', () => {
    const { container } = render(<DiffToolbar {...makeProps({ showFileTree: false })} />);
    const btn = container.querySelector('[data-diff-toolbar-action="file-tree"]');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('title', 'Show file tree');
  });

  it('renders the file-tree IconButton with active state when shown', () => {
    const { container } = render(<DiffToolbar {...makeProps({ showFileTree: true })} />);
    const btn = container.querySelector('[data-diff-toolbar-action="file-tree"]');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('title', 'Hide file tree');
    expect(btn?.className).toContain('bd-icon-btn--active');
  });

  it('calls onToggleFileTree when clicking file tree button', () => {
    const props = makeProps();
    const { container } = render(<DiffToolbar {...props} />);
    const btn = container.querySelector('[data-diff-toolbar-action="file-tree"]') as HTMLElement;
    fireEvent.click(btn);
    expect(props.onToggleFileTree).toHaveBeenCalledOnce();
  });

  it('renders expand/collapse IconButton with correct tooltip when expanded', () => {
    const { container } = render(<DiffToolbar {...makeProps({ allExpanded: true })} />);
    const btn = container.querySelector('[data-diff-toolbar-action="expand-collapse"]');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('title', 'Collapse all');
  });

  it('renders expand/collapse IconButton with correct tooltip when collapsed', () => {
    const { container } = render(<DiffToolbar {...makeProps({ allExpanded: false })} />);
    const btn = container.querySelector('[data-diff-toolbar-action="expand-collapse"]');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('title', 'Expand all');
  });

  it('calls onToggleAllExpanded when clicking expand/collapse button', () => {
    const props = makeProps({ allExpanded: true });
    const { container } = render(<DiffToolbar {...props} />);
    const btn = container.querySelector(
      '[data-diff-toolbar-action="expand-collapse"]',
    ) as HTMLElement;
    fireEvent.click(btn);
    expect(props.onToggleAllExpanded).toHaveBeenCalledOnce();
  });

  it('renders the four status filter chips', () => {
    const { container } = render(<DiffToolbar {...makeProps({ statusFilter: 'all' })} />);
    expect(container.querySelectorAll('[data-diff-filter]')).toHaveLength(4);
    expect(
      container.querySelector('[data-diff-filter="all"][aria-pressed="true"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-diff-filter="added"][aria-pressed="false"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-diff-filter="modified"][aria-pressed="false"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-diff-filter="deleted"][aria-pressed="false"]'),
    ).toBeInTheDocument();
  });

  it('marks the active status filter via aria-pressed', () => {
    const { container } = render(<DiffToolbar {...makeProps({ statusFilter: 'modified' })} />);
    expect(
      container.querySelector('[data-diff-filter="modified"][aria-pressed="true"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-diff-filter="all"][aria-pressed="false"]'),
    ).toBeInTheDocument();
  });

  it('calls onStatusFilterChange when clicking a filter chip', () => {
    const props = makeProps();
    render(<DiffToolbar {...props} />);
    fireEvent.click(screen.getByText('Added'));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith('added');
  });

  it('calls onStatusFilterChange with modified', () => {
    const props = makeProps();
    render(<DiffToolbar {...props} />);
    fireEvent.click(screen.getByText('Modified'));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith('modified');
  });

  it('calls onStatusFilterChange with deleted', () => {
    const props = makeProps();
    render(<DiffToolbar {...props} />);
    fireEvent.click(screen.getByText('Deleted'));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith('deleted');
  });

  it('displays file count with plural suffix', () => {
    render(<DiffToolbar {...makeProps({ fileCount: 5 })} />);
    expect(screen.getByText(/5 files/)).toBeDefined();
  });

  it('displays file count with singular suffix for 1 file', () => {
    render(<DiffToolbar {...makeProps({ fileCount: 1 })} />);
    expect(screen.getByText(/1 file,/)).toBeDefined();
  });

  it('displays additions and deletions', () => {
    render(<DiffToolbar {...makeProps({ totalAdditions: 42, totalDeletions: 13 })} />);
    expect(screen.getByText('+42')).toBeDefined();
    expect(screen.getByText('-13')).toBeDefined();
  });

  it('does not render commit selector when commits is empty', () => {
    const { container } = render(<DiffToolbar {...makeProps({ commits: [] })} />);
    expect(container.querySelector('[data-diff-commit-selector]')).toBeNull();
  });

  it('renders commit selector when commits are provided', () => {
    const commits = [makeCommit()];
    const { container } = render(<DiffToolbar {...makeProps({ commits })} />);
    expect(container.querySelector('[data-diff-commit-selector]')).toBeInTheDocument();
    expect(screen.getByText('All changes')).toBeDefined();
  });

  it('renders commit options with sha and message', () => {
    const commits = [
      makeCommit({ sha: 'aaaa1234567890', message: 'first commit' }),
      makeCommit({ sha: 'bbbb5678901234', message: 'second commit' }),
    ];
    render(<DiffToolbar {...makeProps({ commits })} />);
    expect(screen.getByText(/aaaa123/)).toBeDefined();
    expect(screen.getByText(/bbbb567/)).toBeDefined();
  });

  it('calls onCommitChange when selecting a commit', () => {
    const commits = [makeCommit({ sha: 'aaaa1234567890', message: 'first' })];
    const props = makeProps({ commits, selectedCommit: null });
    render(<DiffToolbar {...props} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'aaaa1234567890' } });
    expect(props.onCommitChange).toHaveBeenCalledWith('aaaa1234567890');
  });

  it('calls onCommitChange with null when selecting "All changes"', () => {
    const commits = [makeCommit({ sha: 'aaaa1234567890' })];
    const props = makeProps({ commits, selectedCommit: 'aaaa1234567890' });
    render(<DiffToolbar {...props} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    expect(props.onCommitChange).toHaveBeenCalledWith(null);
  });

  it('truncates long commit messages in selector', () => {
    const longMsg = 'A'.repeat(60);
    const commits = [makeCommit({ sha: 'cccc1234567890', message: longMsg })];
    render(<DiffToolbar {...makeProps({ commits })} />);
    // Message should be sliced to 50 chars
    const option = screen.getByText(/A{50}/);
    expect(option).toBeDefined();
  });
});
