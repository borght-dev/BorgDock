import { Pill } from '@/components/shared/primitives';
import type { PillTone } from '@/components/shared/primitives';
import type { FileChange } from '@/types/worktree-changes';

const STATUS_TONES: Record<FileChange['status'], PillTone> = {
  added: 'success',
  untracked: 'success',
  deleted: 'error',
  modified: 'warning',
  renamed: 'neutral',
  submodule: 'ghost',
};

const STATUS_LETTERS: Record<FileChange['status'], string> = {
  added: 'A',
  untracked: 'U',
  deleted: 'D',
  modified: 'M',
  renamed: 'R',
  submodule: 'S',
};

interface Props {
  change: FileChange;
  onClick: (change: FileChange) => void;
}

export function WorktreeChangeRow({ change, onClick }: Props) {
  const tone = STATUS_TONES[change.status];
  const letter = STATUS_LETTERS[change.status];
  const displayPath =
    change.status === 'renamed' && change.previousPath
      ? `${change.previousPath} \u2192 ${change.path}`
      : change.path;

  return (
    <button
      type="button"
      data-testid="file-change-row"
      data-file-change={change.path}
      data-file-change-status={change.status}
      onClick={() => onClick(change)}
      className="w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-[var(--color-surface-hover)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)] rounded"
    >
      <Pill tone={tone}>{letter}</Pill>
      <span className="flex-1 truncate text-[12px] text-[var(--color-text-primary)]">
        {displayPath}
      </span>
      {change.isSubmodule ? (
        <span className="text-[10px] text-[var(--color-text-muted)]">submodule</span>
      ) : change.isBinary ? (
        <span className="text-[10px] text-[var(--color-text-muted)]">binary</span>
      ) : (
        <>
          <span className="text-[10px] text-[var(--color-status-green)]">+{change.additions}</span>
          <span className="text-[10px] text-[var(--color-status-red)]">-{change.deletions}</span>
        </>
      )}
    </button>
  );
}
