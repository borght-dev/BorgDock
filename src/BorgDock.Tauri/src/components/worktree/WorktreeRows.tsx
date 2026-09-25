import clsx from 'clsx';
import { Folder, GitBranch, MessageSquareText, Pencil, Star, Terminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { checkCountsFor } from '@/components/pr/pr-card-data';
import { CheckBar, checkBarSummary, IconButton } from '@/components/shared/primitives';
import type { PullRequestWithChecks } from '@/types';
import type { WorktreeInfo } from '@/types/worktree';
import { formatAgo } from '@/utils/relative-time';
import {
  folderName,
  parentFolder,
  shortBranch,
  type WorktreeListEntry,
  worktreeKey,
} from './worktree-list-model';

/** Everything a row needs besides the entry; the same for both hosts. */
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

function FavoriteStar({
  isFavorite,
  className,
  onToggle,
}: {
  isFavorite: boolean;
  className: string;
  onToggle: () => void;
}) {
  return (
    <IconButton
      size={22}
      active={isFavorite}
      tooltip={isFavorite ? 'Unmark as favorite' : 'Mark as favorite'}
      aria-pressed={isFavorite}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      icon={<Star size={13} strokeWidth={2.25} fill={isFavorite ? 'currentColor' : 'none'} />}
    />
  );
}

function RowActions({
  className,
  size,
  linkedPr,
  onOpenT3,
  onOpenTerminal,
  onOpenFolder,
  onOpenEditor,
}: {
  className: string;
  size: 22 | 26;
  linkedPr?: PullRequestWithChecks;
  onOpenT3?: () => void;
  onOpenTerminal: () => void;
  onOpenFolder: () => void;
  onOpenEditor: () => void;
}) {
  const button = (action: string, tooltip: string, icon: ReactNode, run: () => void) => (
    <IconButton
      size={size}
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
    <div className={className}>
      {linkedPr &&
        onOpenT3 &&
        button(
          'open-t3',
          `Open a new thread in T3 for #${linkedPr.pullRequest.number}`,
          <MessageSquareText size={13} strokeWidth={2.25} />,
          onOpenT3,
        )}
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
 * The tool window's row, on the same `.bd-wb-row` grammar as the section's
 * row: star (or the main worktree's branch icon), the branch as the title
 * with one meta line (folder, then the parent path in the code font), one
 * chip (main or remote) and the open actions on hover, focus and selection.
 * Hover selects; a click or Enter opens a terminal. Remote worktrees are
 * read-only.
 *
 * No Open in T3 here: a T3 thread belongs to a pull request, and the tool
 * window has no pull request data (its PR store is never polled), so it
 * could never know which PR a worktree's branch belongs to.
 */
export function PaletteWorktreeRow({
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
  const chip = isRemote ? 'remote' : isMain ? 'main' : null;

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
      className="bd-wb-row bd-wtr bd-wtr--window"
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
          <FavoriteStar
            isFavorite={isFavorite}
            className="bd-wtr__star"
            onToggle={onToggleFavorite}
          />
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
          {isMain && isRemote && ', main worktree'}
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
        {chip && <span className="bd-wb-chip">{chip}</span>}
      </span>
      {!isRemote && (
        <RowActions
          className="bd-wtr__actions"
          size={22}
          onOpenTerminal={onOpenTerminal}
          onOpenFolder={onOpenFolder}
          onOpenEditor={onOpenEditor}
        />
      )}
    </div>
  );
}

function statusText(info: WorktreeInfo | undefined): { text: string; tone: string } | null {
  if (!info) return null;
  if (info.status === 'conflict') return { text: 'conflicts', tone: 'conflict' };
  if (info.status === 'dirty') {
    const n = info.uncommittedCount;
    return { text: n > 0 ? `${n} changed` : 'uncommitted changes', tone: 'dirty' };
  }
  return { text: 'clean', tone: 'clean' };
}

export interface SectionWorktreeRowProps extends WorktreeRowProps {
  /** This worktree's changes are showing beside the list. */
  isOpen: boolean;
  /** The open pull request whose head branch this worktree has checked out. */
  linkedPr?: PullRequestWithChecks;
  /** Open a new T3 thread for `linkedPr` on this worktree (local rows only). */
  onOpenT3: () => void;
  /** Working-tree status from `list_worktrees`, once it has arrived. */
  status?: WorktreeInfo;
  /** When BorgDock last opened this worktree (epoch ms). */
  lastUsedAt?: number;
  now: number;
  /** Select the row and show its changes. */
  onOpen: () => void;
  onOpenPr: (pr: PullRequestWithChecks) => void;
}

/**
 * The main window's row, on the `PrRowCore` grammar: 42 px, hover wash,
 * accent selection bar. Star, then the branch with a meta line (folder,
 * working-tree state, last used; the repository is the group heading),
 * then the linked pull request as its check bar and number (a click opens
 * it), and the open actions laid over the right end on hover, focus and
 * selection. The row is a group of
 * sibling buttons, never a button holding buttons.
 */
export function SectionWorktreeRow({
  entry,
  isSelected,
  isOpen,
  isFavorite,
  linkedPr,
  status,
  lastUsedAt,
  now,
  onOpen,
  onOpenPr,
  onSelect,
  onOpenTerminal,
  onOpenFolder,
  onOpenEditor,
  onOpenT3,
  onToggleFavorite,
  rowRef,
}: SectionWorktreeRowProps) {
  const { wt, repo } = entry;
  const isRemote = Boolean(repo.remote);
  const hasBranch = wt.branchName.length > 0;
  const isMain = wt.isMainWorktree;
  const branch = hasBranch ? shortBranch(wt.branchName) : '(detached)';
  const state = isRemote ? null : statusText(status);
  const used = lastUsedAt ? formatAgo(new Date(lastUsedAt).toISOString(), now) : '';
  const pr = linkedPr?.pullRequest;
  const checks = linkedPr ? checkCountsFor(linkedPr) : null;

  return (
    <div
      ref={rowRef}
      data-worktree-row
      data-tree-path={wt.path}
      data-key={worktreeKey(repo, wt.path)}
      data-selected={isSelected ? 'true' : undefined}
      data-open={isOpen ? 'true' : undefined}
      data-favorite={isFavorite ? 'true' : undefined}
      data-remote={isRemote ? 'true' : undefined}
      className="bd-wb-row bd-wtr"
    >
      <span className="bd-wtr__lead">
        {isMain && !isRemote ? (
          <span className="bd-wtr__main-icon" title="Main worktree">
            <GitBranch size={13} strokeWidth={2.25} aria-hidden />
          </span>
        ) : (
          <FavoriteStar
            isFavorite={isFavorite}
            className="bd-wtr__star"
            onToggle={onToggleFavorite}
          />
        )}
      </span>
      <button
        type="button"
        className="bd-wtr__body"
        data-worktree-open
        aria-label={`${branch}, ${folderName(wt.path)}${isRemote ? ', remote' : ''}`}
        aria-current={isOpen ? 'true' : undefined}
        onClick={onOpen}
        onFocus={onSelect}
      >
        <span
          className={clsx('bd-wtr__title', !hasBranch && 'bd-wtr__title--detached')}
          data-worktree-branch
        >
          {branch}
        </span>
        <span className="bd-wb-row__meta bd-wtr__meta">
          {folderName(wt.path)}
          {isMain && ', main worktree'}
          {isRemote && ', remote'}
          {state && (
            <>
              {', '}
              <span className="bd-wtr__state" data-state={state.tone}>
                {state.text}
              </span>
            </>
          )}
          {used && `, used ${used}`}
        </span>
      </button>
      <span className="bd-wtr__pr-cell">
        {pr && checks && (
          <button
            type="button"
            className="bd-wtr__pr"
            data-worktree-pr={pr.number}
            aria-label={`Open pull request #${pr.number}: ${pr.title}`}
            title={`#${pr.number} ${pr.title} · ${checkBarSummary(checks).label}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenPr(linkedPr);
            }}
          >
            <CheckBar
              className="bd-wtr__checks"
              ok={checks.ok}
              fail={checks.fail}
              run={checks.run}
              total={checks.total}
            />
            <span className="bd-wtr__pr-num">#{pr.number}</span>
          </button>
        )}
      </span>
      {!isRemote && (
        <RowActions
          className="bd-wtr__actions"
          size={22}
          linkedPr={linkedPr}
          onOpenT3={onOpenT3}
          onOpenTerminal={onOpenTerminal}
          onOpenFolder={onOpenFolder}
          onOpenEditor={onOpenEditor}
        />
      )}
    </div>
  );
}
