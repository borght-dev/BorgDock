import { invoke } from '@tauri-apps/api/core';
import { type ReactNode, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { WorktreePruneDialog } from '@/components/worktree/WorktreePruneDialog';
import { prBranches } from '@/components/worktree/worktree-prune-model';
import { useDiskMeasurements } from '@/hooks/useDiskSpace';
import { useWorktreeSnapshot } from '@/hooks/useWorktreeSnapshot';
import { createLogger } from '@/services/logger';
import { type CleanupState, useDiskSpaceStore } from '@/stores/disk-space-store';
import { usePrStore } from '@/stores/pr-store';
import { buildMachines, lastChecked, type Machine } from './machines-model';

const log = createLogger('machines');

export interface Machines {
  machines: Machine[];
  cleanup: Record<string, CleanupState>;
  /** When the disk probe last answered; null before its first answer. */
  checkedAt: number | null;
}

/**
 * Every host with its disks and worktrees, from what the main window already
 * reads: the disk probe (`useDiskSpace` in `App`), the worktree cache and the
 * pull request list.
 */
export function useMachines(): Machines {
  const snapshot = useWorktreeSnapshot();
  const { hosts: measured, error: probeError, cleanup, now } = useDiskMeasurements();
  const open = usePrStore((s) => s.pullRequests);
  const closed = usePrStore((s) => s.closedPullRequests);
  const prsRead = usePrStore((s) => s.pullRequests.length > 0 || s.lastPollTime !== null);

  const branches = useMemo(
    () => (prsRead ? prBranches(open, closed) : null),
    [prsRead, open, closed],
  );
  const machines = useMemo(
    () => buildMachines({ snapshot, measured, probeError, branches, now }),
    [snapshot, measured, probeError, branches, now],
  );
  return { machines, cleanup, checkedAt: lastChecked(measured) };
}

/**
 * Prune from outside the worktree list: the dialog over the whole window,
 * with the worktrees of merged or closed pull requests ticked. Closing it
 * rescans the worktrees and measures the disks again.
 */
export function useWorktreePrune(): { open: () => void; dialog: ReactNode } {
  const [isOpen, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    invoke('worktree_cache_refresh').catch((error) =>
      log.error('worktree_cache_refresh failed', error),
    );
    void useDiskSpaceStore.getState().refresh();
  };
  return {
    open: () => setOpen(true),
    dialog: isOpen
      ? createPortal(
          <WorktreePruneDialog isOpen onClose={close} preselect="closed" />,
          document.body,
        )
      : null,
  };
}

/** Opens the worktrees tool window (Ctrl+F7). */
export function openWorktreesWindow(): void {
  invoke('open_tool_window', { tool: 'worktrees' }).catch((error) =>
    log.error('open_tool_window(worktrees) failed', error),
  );
}
