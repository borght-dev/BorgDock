import { GitBranch, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { IconButton } from '@/components/shared/primitives';
import { WorktreeChangesPanel } from '@/components/worktree-changes';
import { WorktreeList } from './WorktreeList';
import { folderName, shortBranch, type WorktreeListEntry } from './worktree-list-model';

// Status-bar hint for this section; lives in the model so `useStatusBar`
// can import it without pulling in the section's components.
export { WORKTREES_STATUS_HINT } from './worktree-list-model';

interface OpenWorktree {
  path: string;
  branch: string;
  folder: string;
}

function ChangesPane({ open, onClose }: { open: OpenWorktree; onClose: () => void }) {
  return (
    <aside
      className="bd-wts__changes"
      aria-label={`Changes in ${open.branch}`}
      data-worktree-changes-for={open.path}
    >
      <header className="bd-wts__changes-head">
        <GitBranch
          size={13}
          strokeWidth={2.25}
          aria-hidden="true"
          className="bd-wts__changes-icon"
        />
        <span className="bd-wts__changes-title" title={open.path}>
          {open.branch}
        </span>
        <span className="bd-wts__changes-folder">{open.folder}</span>
        <IconButton
          size={22}
          tooltip="Close changes (Esc)"
          aria-label="Close changes"
          onClick={onClose}
          icon={<X size={13} strokeWidth={2.25} />}
        />
      </header>
      <div className="bd-wts__changes-body">
        <WorktreeChangesPanel key={open.path} worktreePath={open.path} />
      </div>
    </aside>
  );
}

/**
 * WorktreesSection — the rail's Worktrees section in the main window
 * (plans/ui-overhaul-workbench.md, phase 5 and decision 3): the shared
 * `WorktreeList` in its section host, with the selected worktree's changes
 * (uncommitted, and ahead of its base branch, each file opening its diff)
 * beside the list instead of in a window of their own. Ctrl+F7 still opens
 * the worktrees tool window; the head row has a button for it too.
 */
export function WorktreesSection() {
  const [open, setOpen] = useState<OpenWorktree | null>(null);

  const openChanges = useCallback((entry: WorktreeListEntry) => {
    setOpen({
      path: entry.wt.path,
      branch: entry.wt.branchName ? shortBranch(entry.wt.branchName) : '(detached)',
      folder: folderName(entry.wt.path),
    });
  }, []);
  const close = useCallback(() => setOpen(null), []);

  return (
    <section className="bd-wts-section" data-worktrees-section aria-label="Worktrees">
      <WorktreeList
        host="section"
        openPath={open?.path ?? null}
        onOpenChanges={openChanges}
        onClose={close}
        aside={open ? <ChangesPane open={open} onClose={close} /> : null}
      />
    </section>
  );
}
