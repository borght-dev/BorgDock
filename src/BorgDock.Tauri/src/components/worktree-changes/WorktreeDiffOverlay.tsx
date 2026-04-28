import { useEffect, useState } from 'react';
import { Pill, IconButton } from '@/components/shared/primitives';
import { DiffFileSection } from '@/components/pr-detail/diff/DiffFileSection';
import {
  diffWorktreeVsHead, diffWorktreeVsBase, unifiedDiffToDiffFile,
} from '@/services/worktree-changes';
import type { FileChange, DiffSource } from '@/types/worktree-changes';
import type { DiffFile } from '@/types';

interface Props {
  worktreePath: string;
  baseBranch: string;
  change: FileChange;
  initialSource: DiffSource;
  onClose: () => void;
}

export function WorktreeDiffOverlay({
  worktreePath, baseBranch, change, initialSource, onClose,
}: Props) {
  const [source, setSource] = useState<DiffSource>(initialSource);
  const [file, setFile] = useState<DiffFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setFile(null);
    const load =
      source === 'vs-head'
        ? diffWorktreeVsHead(worktreePath, change.path)
        : diffWorktreeVsBase(worktreePath, baseBranch, change.path);
    load
      .then((d) => { if (!cancelled) setFile(unifiedDiffToDiffFile(d)); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => {
      cancelled = true;
    };
  }, [source, worktreePath, baseBranch, change.path]);

  return (
    <div
      data-worktree-diff-overlay
      className="absolute inset-0 z-30 flex flex-col bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-subtle-border)] px-3 py-2">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)] truncate">
          {change.path}
        </span>
        <div
          className="ml-auto flex gap-1"
          data-testid="worktree-diff-source-toggle"
          data-diff-source-toggle
        >
          <button
            type="button"
            onClick={() => setSource('vs-head')}
            data-testid="worktree-diff-source-vs-head"
            data-diff-source="vs-head"
            className="border-none bg-transparent p-0"
          >
            <Pill tone={source === 'vs-head' ? 'success' : 'ghost'}>vs HEAD</Pill>
          </button>
          <button
            type="button"
            onClick={() => setSource('vs-base')}
            data-testid="worktree-diff-source-vs-base"
            data-diff-source="vs-base"
            className="border-none bg-transparent p-0"
          >
            <Pill tone={source === 'vs-base' ? 'success' : 'ghost'}>vs {baseBranch}</Pill>
          </button>
        </div>
        <IconButton
          size={22}
          tooltip="Close (Esc)"
          onClick={onClose}
          data-testid="worktree-diff-close"
          icon={<span aria-hidden>{'\u2715'}</span>}
        />
      </div>
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="p-3 text-[12px] text-[var(--color-status-red)]">{error}</div>
        )}
        {file && (
          <DiffFileSection
            file={file}
            viewMode="unified"
            onCopyPath={() => {}}
          />
        )}
        {!file && !error && (
          <div className="p-3 text-[12px] text-[var(--color-text-muted)]">Loading diff{'\u2026'}</div>
        )}
      </div>
    </div>
  );
}
