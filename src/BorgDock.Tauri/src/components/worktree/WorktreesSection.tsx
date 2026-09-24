import { invoke } from '@tauri-apps/api/core';
import { GitBranch } from 'lucide-react';
import { Button, Kbd } from '@/components/shared/primitives';

function openWorktreesWindow() {
  void invoke('open_tool_window', { tool: 'worktrees' }).catch((err) =>
    console.error('open_tool_window(worktrees) failed', err),
  );
}

/**
 * WorktreesSection — the rail's Worktrees section. Until the worktree list
 * moves into the main window (plan phase 5) it explains where worktrees live
 * and opens the worktrees tool window, the same one Ctrl+F7 opens.
 */
export function WorktreesSection() {
  return (
    <section className="bd-section-placeholder" aria-labelledby="bd-worktrees-title">
      <GitBranch className="bd-section-placeholder__icon" size={32} strokeWidth={1.5} aria-hidden />
      <h2 id="bd-worktrees-title" className="bd-section-placeholder__title">
        Worktrees
      </h2>
      <p className="bd-section-placeholder__text">
        Your worktrees, favourites and cleanup live in the worktrees window for now. They move into
        this section in a later update.
      </p>
      <Button variant="primary" size="md" onClick={openWorktreesWindow}>
        Open worktrees window
      </Button>
      <p className="bd-section-placeholder__hint">
        Or press <Kbd>Ctrl+F7</Kbd> from anywhere.
      </p>
    </section>
  );
}
