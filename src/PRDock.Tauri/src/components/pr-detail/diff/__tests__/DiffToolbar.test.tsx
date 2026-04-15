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

  it('renders unified and split view mode buttons', () => {
    render(<DiffToolbar {...makeProps()} />);
    expect(screen.getByText('Unified')).toBeDefined();
    expect(screen.getByText('Split')).toBeDefined();
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

  it('renders file tree toggle with correct title when hidden', () => {
    render(<DiffToolbar {...makeProps({ showFileTree: false })} />);
    expect(screen.getByTitle('Show file tree')).toBeDefined();
  });

  it('renders file tree toggle with correct title when shown', () => {
    render(<DiffToolbar {...makeProps({ showFileTree: true })} />);
    expect(screen.getByTitle('Hide file tree')).toBeDefined();
  });

  it('calls onToggleFileTree when clicking file tree button', () => {
    const props = makeProps();
    render(<DiffToolbar {...props} />);
    fireEvent.click(screen.getByTitle('Show file tree'));
    expect(props.onToggleFileTree).toHaveBeenCalledOnce();
  });

  it('renders expand/collapse button with correct title when expanded', () => {
    render(<DiffToolbar {...makeProps({ allExpanded: true })} />);
    expect(screen.getByTitle('Collapse all')).toBeDefined();
  });

  it('renders expand/collapse button with correct title when collapsed', () => {
    render(<DiffToolbar {...makeProps({ allExpanded: false })} />);
    expect(screen.getByTitle('Expand all')).toBeDefined();
  });

  it('calls onToggleAllExpanded when clicking expand/collapse button', () => {
    const props = makeProps({ allExpanded: true });
    render(<DiffToolbar {...props} />);
    fireEvent.click(screen.getByTitle('Collapse all'));
    expect(props.onToggleAllExpanded).toHaveBeenCalledOnce();
  });

  it('renders all status filter chips', () => {
    render(<DiffToolbar {...makeProps()} />);
    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByText('Added')).toBeDefined();
    expect(screen.getByText('Modified')).toBeDefined();
    expect(screen.getByText('Deleted')).toBeDefined();
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
    render(<DiffToolbar {...makeProps({ commits: [] })} />);
    expect(screen.queryByText('All changes')).toBeNull();
  });

  it('renders commit selector when commits are provided', () => {
    const commits = [makeCommit()];
    render(<DiffToolbar {...makeProps({ commits })} />);
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
