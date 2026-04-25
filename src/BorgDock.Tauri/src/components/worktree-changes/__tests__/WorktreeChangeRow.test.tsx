import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorktreeChangeRow } from '../WorktreeChangeRow';
import type { FileChange } from '@/types/worktree-changes';

const fc = (over: Partial<FileChange> = {}): FileChange => ({
  path: 'src/a.ts',
  previousPath: null,
  status: 'modified',
  additions: 3,
  deletions: 2,
  isBinary: false,
  isSubmodule: false,
  ...over,
});

describe('WorktreeChangeRow', () => {
  it('renders path, status badge, and stats', () => {
    render(<WorktreeChangeRow change={fc()} onClick={() => {}} />);
    expect(screen.getByText('src/a.ts')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('shows previousPath \u2192 path for renamed files', () => {
    render(
      <WorktreeChangeRow
        change={fc({ status: 'renamed', previousPath: 'src/old.ts', path: 'src/new.ts' })}
        onClick={() => {}}
      />,
    );
    const path = screen.getByTestId('file-change-row');
    expect(path.textContent).toContain('src/old.ts');
    expect(path.textContent).toContain('src/new.ts');
  });

  it('exposes data-* hooks for tests', () => {
    render(<WorktreeChangeRow change={fc()} onClick={() => {}} />);
    const row = screen.getByTestId('file-change-row');
    expect(row.getAttribute('data-file-change')).toBe('src/a.ts');
    expect(row.getAttribute('data-file-change-status')).toBe('modified');
  });

  it('fires onClick with the change when clicked', () => {
    const onClick = vi.fn();
    render(<WorktreeChangeRow change={fc()} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('file-change-row'));
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/a.ts' }));
  });

  it('renders a binary marker for binary files instead of stats', () => {
    render(<WorktreeChangeRow change={fc({ isBinary: true })} onClick={() => {}} />);
    expect(screen.getByText(/binary/i)).toBeInTheDocument();
  });

  it('renders a submodule marker for submodule entries', () => {
    render(
      <WorktreeChangeRow
        change={fc({ isSubmodule: true, status: 'submodule' })}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText(/submodule/i)).toBeInTheDocument();
  });
});
