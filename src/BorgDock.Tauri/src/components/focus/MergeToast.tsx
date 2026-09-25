import { useEffect } from 'react';
import { Pill } from '@/components/shared/primitives';
import { mergePr } from '@/services/pr-actions';
import { showToast, toastError } from '@/stores/toast-store';

/** How long the merge waits for Undo. */
export const MERGE_UNDO_MS = 3000;

function executeMerge(owner: string, repo: string, prNumber: number) {
  // Focus-mode pins squash because the keyboard shortcut bypasses the
  // sidebar's per-repo configuration UI; preserving the historical choice.
  // Success is announced once, by mergePr's celebration (OS notification,
  // which honours the notification settings); a failure toasts here.
  return mergePr(
    {
      number: prNumber,
      title: `PR #${prNumber}`,
      repoOwner: owner,
      repoName: repo,
      htmlUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
    },
    {
      method: 'squash',
      // Focus mode merges without a card on screen, so the toast names the PR.
      onError: (_title, err) => toastError(`Failed to merge PR #${prNumber}`, err),
    },
  );
}

/**
 * MergeToast — Focus mode's merge with undo (`M`). It installs
 * `window.__borgdockQueueMerge`, which `useKeyboardNav` calls; each call shows
 * a "Merging PR #n…" toast with Undo through the shared toast stack
 * (`components/shared/Toast`) and merges once the toast times out. Renders
 * nothing itself: `ToastViewport` draws the toast.
 */
export function MergeToast() {
  useEffect(() => {
    const queueMerge = (owner: string, repo: string, prNumber: number) => {
      showToast({
        tone: 'progress',
        leading: (
          <Pill
            tone="success"
            icon={
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            }
          >
            Merging
          </Pill>
        ),
        message: `PR #${prNumber}...`,
        actionLabel: 'Undo',
        onAction: () => {},
        // Only Undo cancels: no close button that would cancel silently.
        dismissible: false,
        durationMs: MERGE_UNDO_MS,
        onExpire: () => void executeMerge(owner, repo, prNumber),
      });
    };
    (window as unknown as Record<string, unknown>).__borgdockQueueMerge = queueMerge;
    return () => {
      delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
    };
  }, []);

  return null;
}
