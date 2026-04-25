import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorktreeChangesPanel } from '../WorktreeChangesPanel';

vi.mock('@/services/worktree-changes', async () => {
  const actual = await vi.importActual<typeof import('@/services/worktree-changes')>(
    '@/services/worktree-changes',
  );
  return {
    ...actual,
    listWorktreeChanges: vi.fn(),
    diffWorktreeVsHead: vi.fn().mockResolvedValue({
      filePath: 'src/a.ts', previousPath: null, hunks: [], binary: null, isSubmodule: false,
    }),
    diffWorktreeVsBase: vi.fn().mockResolvedValue({
      filePath: 'src/a.ts', previousPath: null, hunks: [], binary: null, isSubmodule: false,
    }),
  };
});

import { listWorktreeChanges } from '@/services/worktree-changes';

const mockListSuccess = () => {
  vi.mocked(listWorktreeChanges).mockResolvedValueOnce({
    vsHead: [{
      path: 'src/a.ts', previousPath: null, status: 'modified',
      additions: 3, deletions: 1, isBinary: false, isSubmodule: false,
    }],
    vsBase: [{
      path: 'src/b.ts', previousPath: null, status: 'added',
      additions: 5, deletions: 0, isBinary: false, isSubmodule: false,
    }],
    baseBranch: 'main',
    baseBranchSource: 'origin-head',
    detachedHead: false,
    mergeBaseUnavailable: false,
  });
};

describe('WorktreeChangesPanel', () => {
  it('renders both sections with the resolved base branch', async () => {
    mockListSuccess();
    render(<WorktreeChangesPanel worktreePath="/wt" />);
    await waitFor(() => expect(screen.getByText('Uncommitted')).toBeInTheDocument());
    expect(screen.getByText(/Ahead of\s+main/)).toBeInTheDocument();
    expect(screen.getByText('src/a.ts')).toBeInTheDocument();
    expect(screen.getByText('src/b.ts')).toBeInTheDocument();
  });

  it('exposes data-* contracts the e2e spec relies on', async () => {
    mockListSuccess();
    render(<WorktreeChangesPanel worktreePath="/wt" />);
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument());
    expect(document.querySelector('[data-worktree-changes-panel]')).toBeTruthy();
    expect(document.querySelector('[data-changes-section="vs-head"]')).toBeTruthy();
    expect(document.querySelector('[data-changes-section="vs-base"]')).toBeTruthy();
    expect(document.querySelector('[data-base-branch="main"]')).toBeTruthy();
  });

  it('opens the diff overlay when a row is clicked', async () => {
    mockListSuccess();
    render(<WorktreeChangesPanel worktreePath="/wt" />);
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument());
    fireEvent.click(screen.getByText('src/a.ts'));
    expect(document.querySelector('[data-worktree-diff-overlay]')).toBeTruthy();
  });

  it('shows an empty state when both sections are empty', async () => {
    vi.mocked(listWorktreeChanges).mockResolvedValueOnce({
      vsHead: [], vsBase: [], baseBranch: 'main',
      baseBranchSource: 'origin-head', detachedHead: false, mergeBaseUnavailable: false,
    });
    render(<WorktreeChangesPanel worktreePath="/wt" />);
    await waitFor(() =>
      expect(screen.getByText(/no changes in this worktree/i)).toBeInTheDocument(),
    );
  });

  it('shows a base-branch warning when mergeBaseUnavailable is true', async () => {
    vi.mocked(listWorktreeChanges).mockResolvedValueOnce({
      vsHead: [], vsBase: [], baseBranch: 'master',
      baseBranchSource: 'fallback-master', detachedHead: false, mergeBaseUnavailable: true,
    });
    render(<WorktreeChangesPanel worktreePath="/wt" />);
    await waitFor(() =>
      expect(screen.getByText(/couldn.?t determine base branch/i)).toBeInTheDocument(),
    );
  });
});
