import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorktreeDiffOverlay } from '../WorktreeDiffOverlay';
import type { FileChange } from '@/types/worktree-changes';

vi.mock('@/services/worktree-changes', async () => {
  const actual = await vi.importActual<typeof import('@/services/worktree-changes')>(
    '@/services/worktree-changes',
  );
  return {
    ...actual,
    diffWorktreeVsHead: vi.fn().mockResolvedValue({
      filePath: 'src/a.ts', previousPath: null,
      hunks: [{
        header: '@@ -1 +1,2 @@', oldStart: 1, oldCount: 1, newStart: 1, newCount: 2,
        lines: [
          { kind: 'context', content: 'a', oldLineNumber: 1, newLineNumber: 1 },
          { kind: 'add', content: 'b', oldLineNumber: null, newLineNumber: 2 },
        ],
      }],
      binary: null, isSubmodule: false,
    }),
    diffWorktreeVsBase: vi.fn().mockResolvedValue({
      filePath: 'src/a.ts', previousPath: null,
      hunks: [{
        header: '@@ -1 +1 @@', oldStart: 1, oldCount: 1, newStart: 1, newCount: 1,
        lines: [
          { kind: 'delete', content: 'old', oldLineNumber: 1, newLineNumber: null },
          { kind: 'add', content: 'new', oldLineNumber: null, newLineNumber: 1 },
        ],
      }],
      binary: null, isSubmodule: false,
    }),
  };
});

const file: FileChange = {
  path: 'src/a.ts', previousPath: null, status: 'modified',
  additions: 1, deletions: 0, isBinary: false, isSubmodule: false,
};

describe('WorktreeDiffOverlay', () => {
  it('loads vs HEAD diff by default', async () => {
    render(
      <WorktreeDiffOverlay
        worktreePath="/wt" baseBranch="main"
        change={file} initialSource="vs-head" onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText('@@ -1 +1,2 @@')).toBeInTheDocument(),
    );
  });

  it('toggle pill flips the diff source vs-head <-> vs-base', async () => {
    render(
      <WorktreeDiffOverlay
        worktreePath="/wt" baseBranch="main"
        change={file} initialSource="vs-head" onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('@@ -1 +1,2 @@')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('worktree-diff-source-vs-base'));
    await waitFor(() => expect(screen.getByText('@@ -1 +1 @@')).toBeInTheDocument());
  });

  it('exposes data-* hooks for the e2e spec', () => {
    render(
      <WorktreeDiffOverlay
        worktreePath="/wt" baseBranch="main"
        change={file} initialSource="vs-head" onClose={() => {}}
      />,
    );
    expect(document.querySelector('[data-worktree-diff-overlay]')).toBeTruthy();
    expect(document.querySelector('[data-diff-source-toggle]')).toBeTruthy();
    expect(document.querySelector('[data-diff-source="vs-head"]')).toBeTruthy();
    expect(document.querySelector('[data-diff-source="vs-base"]')).toBeTruthy();
  });

  it('fires onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <WorktreeDiffOverlay
        worktreePath="/wt" baseBranch="main"
        change={file} initialSource="vs-head" onClose={onClose}
      />,
    );
    await waitFor(() => expect(screen.getByText('@@ -1 +1,2 @@')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('worktree-diff-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
