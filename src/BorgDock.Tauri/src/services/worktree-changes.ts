import { invoke } from '@tauri-apps/api/core';
import type { DiffFile, DiffHunk, DiffLine } from '@/types';
import type {
  FileChange, RustDiffHunk, UnifiedWorktreeDiff, WorktreeChangeSet,
} from '@/types/worktree-changes';

export async function listWorktreeChanges(worktreePath: string): Promise<WorktreeChangeSet> {
  return invoke<WorktreeChangeSet>('list_worktree_changes', { worktreePath });
}

export async function diffWorktreeVsHead(
  worktreePath: string,
  filePath: string,
): Promise<UnifiedWorktreeDiff> {
  return invoke<UnifiedWorktreeDiff>('diff_worktree_vs_head', { worktreePath, filePath });
}

export async function diffWorktreeVsBase(
  worktreePath: string,
  baseBranch: string,
  filePath: string,
): Promise<UnifiedWorktreeDiff> {
  return invoke<UnifiedWorktreeDiff>('diff_worktree_vs_base', {
    worktreePath, baseBranch, filePath,
  });
}

/**
 * Adapt a Rust-side UnifiedWorktreeDiff into the existing frontend DiffFile
 * shape so DiffFileSection / UnifiedDiffView / SplitDiffView consume it
 * unchanged.
 *
 * The frontend's DiffLine union has a `'hunk-header'` variant that
 * UnifiedDiffView relies on to render the `@@ ... @@` row. The Rust side
 * only emits add/delete/context lines, so we prepend a `'hunk-header'`
 * DiffLine carrying the header string at the top of every hunk's `lines`.
 */
export function unifiedDiffToDiffFile(diff: UnifiedWorktreeDiff): DiffFile {
  const hunks: DiffHunk[] = diff.hunks.map((h: RustDiffHunk): DiffHunk => {
    const headerLine: DiffLine = { type: 'hunk-header', content: h.header };
    const bodyLines: DiffLine[] = h.lines.map((l) => ({
      type:
        l.kind === 'add' ? 'add'
        : l.kind === 'delete' ? 'delete'
        : 'context',
      content: l.content,
      oldLineNumber: l.oldLineNumber ?? undefined,
      newLineNumber: l.newLineNumber ?? undefined,
    }));
    return {
      header: h.header,
      oldStart: h.oldStart, oldCount: h.oldCount,
      newStart: h.newStart, newCount: h.newCount,
      lines: [headerLine, ...bodyLines],
    };
  });

  let additions = 0;
  let deletions = 0;
  for (const h of hunks) {
    for (const l of h.lines) {
      if (l.type === 'add') additions++;
      else if (l.type === 'delete') deletions++;
    }
  }

  const status: DiffFile['status'] = diff.previousPath
    ? 'renamed'
    : hunks.some((h) => h.lines.some((l) => l.type === 'add'))
      && !hunks.some((h) => h.lines.some((l) => l.type === 'delete'))
      ? 'added'
      : !hunks.some((h) => h.lines.some((l) => l.type === 'add'))
        && hunks.some((h) => h.lines.some((l) => l.type === 'delete'))
        ? 'removed'
        : 'modified';

  return {
    filename: diff.filePath,
    previousFilename: diff.previousPath ?? undefined,
    status,
    additions,
    deletions,
    isBinary: diff.binary !== null,
    isTruncated: false,
    sha: '',
    hunks,
  };
}

export function fileChangeToDiffFile(change: FileChange): DiffFile {
  return {
    filename: change.path,
    previousFilename: change.previousPath ?? undefined,
    status:
      change.status === 'added' || change.status === 'untracked' ? 'added'
      : change.status === 'deleted' ? 'removed'
      : change.status === 'renamed' ? 'renamed'
      : 'modified',
    additions: change.additions,
    deletions: change.deletions,
    isBinary: change.isBinary,
    isTruncated: false,
    sha: '',
  };
}
