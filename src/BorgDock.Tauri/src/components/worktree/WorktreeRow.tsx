import clsx from 'clsx';
import { Folder, GitBranch, Pencil, Star, Terminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/shared/primitives';
import {
  folderName,
  parentFolder,
  shortBranch,
  type WorktreeListEntry,
  worktreeKey,
} from './worktree-list-model';

export interface WorktreeRowProps {
  entry: WorktreeListEntry;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onOpenTerminal: () => void;
  onOpenFolder: () => void;
  onOpenEditor: () => void;
  onToggleFavorite: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
}

function FavoriteStar({ isFavorite, onToggle }: { isFavorite: boolean; onToggle: () => void }) {
  return (
    <IconButton
      size={22}
      active={isFavorite}
      tooltip={isFavorite ? 'Unmark as favorite' : 'Mark as favorite'}
      aria-pressed={isFavorite}
      className="bd-wtr__star"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      icon={<Star size={13} strokeWidth={2.25} fill={isFavorite ? 'currentColor' : 'none'} />}
    />
  );
}

function RowActions({
  onOpenTerminal,
  onOpenFolder,
  onOpenEditor,
}: Pick<WorktreeRowProps, 'onOpenTerminal' | 'onOpenFolder' | 'onOpenEditor'>) {
  const button = (action: string, tooltip: string, icon: ReactNode, run: () => void) => (
    <IconButton
      size={22}
      tooltip={tooltip}
      aria-label={tooltip}
      data-action={action}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
      icon={icon}
    />
  );
  return (
    <div className="bd-wtr__actions">
      {button(
        'open-terminal',
        'Open terminal here',
        <Terminal size={13} strokeWidth={2.25} />,
        onOpenTerminal,
      )}
      {button('open-folder', 'Open folder', <Folder size={13} strokeWidth={2.25} />, onOpenFolder)}
      {button(
        'open-editor',
        'Open in editor',
        <Pencil size={13} strokeWidth={2.25} />,
        onOpenEditor,
      )}
    </div>
  );
}

/**
 * One worktree, on the `.bd-wb-row` grammar: star (or the main worktree's
 * branch icon), the branch as the title with one meta line (folder, then the
 * parent path in the code font), a main chip and the open actions on hover,
 * focus and selection. Hover selects; a click or Enter opens a terminal.
 * Remote worktrees are read-only; their host heading says so.
 *
 * No Open in T3 here: a T3 thread belongs to a pull request, and the
 * worktrees window has no pull request data (its PR store is never polled),
 * so it could never know which PR a worktree's branch belongs to.
 */
export function WorktreeRow({
  entry,
  isSelected,
  isFavorite,
  onSelect,
  onOpenTerminal,
  onOpenFolder,
  onOpenEditor,
  onToggleFavorite,
  rowRef,
}: WorktreeRowProps) {
  const { wt } = entry;
  const isRemote = Boolean(entry.repo.remote);
  const hasBranch = wt.branchName.length > 0;
  const folder = folderName(wt.path);
  const parent = parentFolder(wt.path);
  const isMain = wt.isMainWorktree;

  return (
    <div
      ref={rowRef}
      data-palette-row
      data-worktree-row
      data-tree-path={wt.path}
      data-key={worktreeKey(entry.repo, wt.path)}
      data-selected={isSelected ? 'true' : undefined}
      data-favorite={isFavorite ? 'true' : undefined}
      data-remote={isRemote ? 'true' : undefined}
      className="bd-wb-row bd-wtr"
      role={isRemote ? undefined : 'button'}
      tabIndex={isRemote ? undefined : 0}
      onClick={isRemote ? undefined : onOpenTerminal}
      onKeyDown={(event) => {
        if (isRemote || event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenTerminal();
        }
      }}
      onMouseEnter={onSelect}
    >
      <span className="bd-wtr__lead">
        {isMain && !isRemote ? (
          <span className="bd-wtr__main-icon" title="Main worktree">
            <GitBranch size={13} strokeWidth={2.25} aria-hidden />
          </span>
        ) : (
          <FavoriteStar isFavorite={isFavorite} onToggle={onToggleFavorite} />
        )}
      </span>
      <span className="bd-wtr__text">
        <span
          className={clsx('bd-wtr__title', !hasBranch && 'bd-wtr__title--detached')}
          data-worktree-branch
        >
          {hasBranch ? shortBranch(wt.branchName) : '(detached)'}
        </span>
        <span className="bd-wb-row__meta bd-wtr__meta">
          {folder}
          {parent && (
            <>
              {', '}
              <span className="bd-wtr__path" title={parent}>
                {parent}
              </span>
            </>
          )}
        </span>
      </span>
      <span className="bd-wtr__chip-cell">
        {isMain && <span className="bd-wb-chip">main</span>}
      </span>
      {!isRemote && (
        <RowActions
          onOpenTerminal={onOpenTerminal}
          onOpenFolder={onOpenFolder}
          onOpenEditor={onOpenEditor}
        />
      )}
    </div>
  );
}
