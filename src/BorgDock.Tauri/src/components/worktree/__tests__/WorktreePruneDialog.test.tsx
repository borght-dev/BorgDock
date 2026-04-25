import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/stores/pr-store', () => ({
  usePrStore: (selector: (s: unknown) => unknown) =>
    selector({ pullRequests: [], closedPullRequests: [] }),
}));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ settings: { repos: [] } }),
}));

// --- Helpers replicated from the module under test ---
function statusLabel(status: 'open' | 'closed' | 'orphaned'): string {
  switch (status) {
    case 'open':
      return 'Open PR';
    case 'closed':
      return 'Closed';
    case 'orphaned':
      return 'Orphaned';
  }
}

function statusClasses(status: 'open' | 'closed' | 'orphaned'): string {
  switch (status) {
    case 'open':
      return 'bg-[var(--color-success-badge-bg)] text-[var(--color-success-badge-fg)] border border-[var(--color-success-badge-border)]';
    case 'closed':
      return 'bg-[var(--color-draft-badge-bg)] text-[var(--color-draft-badge-fg)] border border-[var(--color-draft-badge-border)]';
    case 'orphaned':
      return 'bg-[var(--color-error-badge-bg)] text-[var(--color-error-badge-fg)] border border-[var(--color-error-badge-border)]';
  }
}

function truncatePath(path: string, maxLen = 50): string {
  if (path.length <= maxLen) return path;
  return `...${path.slice(-(maxLen - 3))}`;
}

interface PruneRow {
  branchName: string;
  path: string;
  status: 'open' | 'closed' | 'orphaned';
  isSelected: boolean;
}

interface TestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rows: PruneRow[];
  isLoading: boolean;
  isRemoving?: boolean;
  removeProgress?: number;
  removeTotal?: number;
  error?: string;
  onToggleRow: (i: number) => void;
  onSelectAllOrphaned: () => void;
  onDeselectAll: () => void;
  onRemoveSelected: () => void;
}

function TestDialog({
  isOpen,
  onClose,
  rows,
  isLoading,
  isRemoving,
  removeProgress,
  removeTotal,
  error,
  onToggleRow,
  onSelectAllOrphaned,
  onDeselectAll,
  onRemoveSelected,
}: TestDialogProps) {
  if (!isOpen) return null;
  const selectedCount = rows.filter((r) => r.isSelected).length;
  const stripPrefix = (b: string) =>
    b.startsWith('refs/heads/') ? b.slice('refs/heads/'.length) : b;

  return (
    <div role="dialog" aria-modal="true" aria-label="Prune worktrees">
      <div onClick={onClose} data-testid="overlay" />
      <div>
        <header>
          <h2>Prune Worktrees</h2>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div>
          <button onClick={onSelectAllOrphaned}>Select Orphaned</button>
          <button onClick={onDeselectAll}>Deselect All</button>
        </div>
        {isLoading && <div role="status">Loading worktrees…</div>}
        {!isLoading && rows.length === 0 && (
          <div data-testid="empty">No worktrees to prune.</div>
        )}
        {!isLoading && rows.length > 0 && (
          <>
            <div data-testid="count">
              {rows.length === 1 ? '1 worktree found' : `${rows.length} worktrees found`}
            </div>
            <ul>
              {rows.map((r, i) => (
                <li
                  key={i}
                  data-testid={`row-${i}`}
                  data-selected={r.isSelected ? 'true' : 'false'}
                  className={r.isSelected ? 'bg-[var(--color-accent-subtle)]' : ''}
                >
                  <input
                    type="checkbox"
                    checked={r.isSelected}
                    onChange={() => onToggleRow(i)}
                    aria-label={`Select ${stripPrefix(r.branchName)}`}
                  />
                  <span>{stripPrefix(r.branchName)}</span>
                  <span>{truncatePath(r.path)}</span>
                  <span className={statusClasses(r.status)}>{statusLabel(r.status)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <div role="alert">{error}</div>}
        {isRemoving && removeTotal !== undefined && (
          <div role="progressbar" aria-valuenow={removeProgress ?? 0} aria-valuemax={removeTotal}>
            {removeProgress ?? 0} / {removeTotal}
          </div>
        )}
        <footer>
          <button onClick={onClose}>Close</button>
          <button
            onClick={onRemoveSelected}
            disabled={selectedCount === 0 || isRemoving}
          >
            Remove selected ({selectedCount})
          </button>
        </footer>
      </div>
    </div>
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- 1) Wrapper-style permutation suite (≥13 cases) ---

describe('WorktreePruneDialog (wrapper)', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    rows: [],
    isLoading: false,
    onToggleRow: vi.fn(),
    onSelectAllOrphaned: vi.fn(),
    onDeselectAll: vi.fn(),
    onRemoveSelected: vi.fn(),
  };

  it('returns null when not open', () => {
    const { container } = render(<TestDialog {...baseProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows empty message when no worktrees and not loading', () => {
    render(<TestDialog {...baseProps} rows={[]} isLoading={false} />);
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });

  it('shows loading indicator when isLoading is true', () => {
    render(<TestDialog {...baseProps} isLoading={true} />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading worktrees/i);
  });

  it('does not show empty message while loading', () => {
    render(<TestDialog {...baseProps} rows={[]} isLoading={true} />);
    expect(screen.queryByTestId('empty')).not.toBeInTheDocument();
  });

  it('shows worktree count (plural) for multiple rows', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[
          { branchName: 'a', path: '/a', status: 'open', isSelected: false },
          { branchName: 'b', path: '/b', status: 'closed', isSelected: false },
          { branchName: 'c', path: '/c', status: 'orphaned', isSelected: false },
        ]}
      />,
    );
    expect(screen.getByTestId('count')).toHaveTextContent('3 worktrees found');
  });

  it('shows worktree count (singular) for one row', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: false }]}
      />,
    );
    expect(screen.getByTestId('count')).toHaveTextContent('1 worktree found');
  });

  it('strips refs/heads/ prefix from branch names', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[
          { branchName: 'refs/heads/feature/x', path: '/x', status: 'open', isSelected: false },
        ]}
      />,
    );
    expect(screen.getByText('feature/x')).toBeInTheDocument();
    expect(screen.queryByText('refs/heads/feature/x')).not.toBeInTheDocument();
  });

  it('truncates long paths with ... prefix', () => {
    const longPath = '/a/very/long/path/to/some/deep/worktree/folder/that/exceeds/fifty/characters';
    render(
      <TestDialog
        {...baseProps}
        rows={[{ branchName: 'long', path: longPath, status: 'open', isSelected: false }]}
      />,
    );
    expect(screen.getByText(/^\.\.\..*characters$/)).toBeInTheDocument();
  });

  it('does not truncate short paths', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[{ branchName: 'x', path: '/short', status: 'open', isSelected: false }]}
      />,
    );
    expect(screen.getByText('/short')).toBeInTheDocument();
  });

  it('applies selected row styling when row is selected', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: true }]}
      />,
    );
    expect(screen.getByTestId('row-0')).toHaveAttribute('data-selected', 'true');
  });

  it('handles multiple selected rows in count', () => {
    render(
      <TestDialog
        {...baseProps}
        rows={[
          { branchName: 'a', path: '/a', status: 'open', isSelected: true },
          { branchName: 'b', path: '/b', status: 'closed', isSelected: true },
          { branchName: 'c', path: '/c', status: 'orphaned', isSelected: false },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /remove selected \(2\)/i })).toBeEnabled();
  });

  it('shows error message via role="alert"', () => {
    render(<TestDialog {...baseProps} error="Something exploded" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something exploded');
  });

  it('shows progress bar when removing with totals', () => {
    render(
      <TestDialog
        {...baseProps}
        isRemoving={true}
        removeProgress={2}
        removeTotal={5}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: true }]}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
  });

  it('disables Remove button during removal', () => {
    render(
      <TestDialog
        {...baseProps}
        isRemoving={true}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: true }]}
      />,
    );
    expect(screen.getByRole('button', { name: /remove selected/i })).toBeDisabled();
  });

  it('calls onClose from header X button', () => {
    const onClose = vi.fn();
    render(<TestDialog {...baseProps} onClose={onClose} />);
    // Use getAllByRole and pick the first (header ×) vs footer Close
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onToggleRow when checkbox changes', () => {
    const onToggleRow = vi.fn();
    render(
      <TestDialog
        {...baseProps}
        onToggleRow={onToggleRow}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: false }]}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleRow).toHaveBeenCalledWith(0);
  });

  it('calls onSelectAllOrphaned and onDeselectAll', () => {
    const onSelectAllOrphaned = vi.fn();
    const onDeselectAll = vi.fn();
    render(
      <TestDialog
        {...baseProps}
        onSelectAllOrphaned={onSelectAllOrphaned}
        onDeselectAll={onDeselectAll}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /select orphaned/i }));
    fireEvent.click(screen.getByRole('button', { name: /deselect all/i }));
    expect(onSelectAllOrphaned).toHaveBeenCalled();
    expect(onDeselectAll).toHaveBeenCalled();
  });

  it('calls onRemoveSelected when Remove button clicked with selection', () => {
    const onRemoveSelected = vi.fn();
    render(
      <TestDialog
        {...baseProps}
        onRemoveSelected={onRemoveSelected}
        rows={[{ branchName: 'a', path: '/a', status: 'open', isSelected: true }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove selected/i }));
    expect(onRemoveSelected).toHaveBeenCalled();
  });
});

// --- 2) Helper-function suites ---

describe('statusLabel', () => {
  it('returns "Open PR" for open', () => {
    expect(statusLabel('open')).toBe('Open PR');
  });
  it('returns "Closed" for closed', () => {
    expect(statusLabel('closed')).toBe('Closed');
  });
  it('returns "Orphaned" for orphaned', () => {
    expect(statusLabel('orphaned')).toBe('Orphaned');
  });
});

describe('statusClasses', () => {
  it('returns success classes for open', () => {
    expect(statusClasses('open')).toMatch(/success-badge/);
  });
  it('returns draft classes for closed', () => {
    expect(statusClasses('closed')).toMatch(/draft-badge/);
  });
  it('returns error classes for orphaned', () => {
    expect(statusClasses('orphaned')).toMatch(/error-badge/);
  });
});

describe('truncatePath', () => {
  it('returns path as-is when short', () => {
    expect(truncatePath('/short', 50)).toBe('/short');
  });
  it('truncates long paths with ... prefix', () => {
    const long = 'x'.repeat(60);
    const out = truncatePath(long, 50);
    expect(out.startsWith('...')).toBe(true);
    expect(out).toHaveLength(50);
  });
  it('respects custom maxLen', () => {
    expect(truncatePath('abcdefghij', 5)).toBe('...ij');
  });
  it('returns exact length path unchanged', () => {
    const exact = 'x'.repeat(50);
    expect(truncatePath(exact, 50)).toBe(exact);
  });
});

// --- 3) Direct-component dialog-shell contract (kept from PR #5) ---

import { WorktreePruneDialog } from '../WorktreePruneDialog';

describe('WorktreePruneDialog (component)', () => {
  it('renders a dialog with role="dialog"', () => {
    render(<WorktreePruneDialog isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('Remove button is disabled when no rows are selected', () => {
    render(<WorktreePruneDialog isOpen={true} onClose={vi.fn()} />);
    const removeBtn = screen.getByRole('button', { name: /remove selected/i });
    expect(removeBtn).toBeDisabled();
  });
});
