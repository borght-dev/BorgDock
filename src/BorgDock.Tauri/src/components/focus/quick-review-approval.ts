import { useSyncExternalStore } from 'react';
import { prRowKey } from '@/components/pr/pr-card-data';
import { type ReviewDecision, useQuickReviewStore } from '@/stores/quick-review-store';
import { showToast, toastError, useToastStore } from '@/stores/toast-store';
import type { PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';

/** How long an approval waits for Undo before it is sent. GitHub cannot take a review back. */
export const APPROVAL_UNDO_MS = 5000;

/** The toast of the approval waiting for Undo, if any. */
let held: string | null = null;
/** The toast of each PR's approval waiting to be sent, by `prRowKey`. */
const pending = new Map<string, string>();
const listeners = new Set<() => void>();

function setHeld(id: string | null) {
  held = id;
  for (const listener of listeners) listener();
}

/**
 * Approves `pr` with Undo: the deck moves on at once, and the review is
 * posted when the toast runs out. Undo brings the PR back with its draft
 * intact. Approving a PR again while its approval waits replaces it, so one
 * review is sent. If GitHub refuses, the error toast names the PR, and the
 * PR comes back with the reason while Quick Review is open (the draft is
 * kept either way; reopening it over other work would be worse).
 */
export function holdApproval(
  pr: PullRequestWithChecks,
  send: () => Promise<ReviewDecision>,
  autoMerge: boolean,
) {
  const key = prRowKey(pr.pullRequest);
  const earlier = pending.get(key);
  if (earlier) useToastStore.getState().dismiss(earlier);
  useQuickReviewStore.getState().advance('approved');
  const settle = () => {
    if (pending.get(key) === id) pending.delete(key);
    if (held === id) setHeld(null);
  };
  const number = pr.pullRequest.number;
  const id = showToast({
    tone: 'success',
    // Nothing is posted yet: the toast says so until it runs out.
    message: `Approving #${number}${autoMerge ? ' · auto-merge on' : ''}`,
    actionLabel: 'Undo',
    actionKey: 'Z',
    countdown: true,
    // Only Undo takes it back: a close button would look like it did.
    dismissible: false,
    durationMs: APPROVAL_UNDO_MS,
    onAction: () => {
      settle();
      useQuickReviewStore.getState().reopen(pr);
    },
    onExpire: () => {
      settle();
      send()
        .then(() => showToast({ tone: 'success', message: `Approved #${number}` }))
        .catch((error) => {
          toastError(`Approval of #${number} not submitted`, error);
          const store = useQuickReviewStore.getState();
          if (store.state !== 'idle')
            store.reopen(pr, `Review not submitted: ${parseError(error).message}`);
        });
    },
  });
  pending.set(key, id);
  setHeld(id);
}

/** Takes back the approval waiting for Undo (Z). False when there is none. */
export function undoHeldApproval(): boolean {
  const toasts = useToastStore.getState();
  if (!held || !toasts.toasts.some((t) => t.id === held)) {
    setHeld(null);
    return false;
  }
  toasts.act(held);
  return true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether an approval is waiting for Undo, for the shortcut line. */
export function useHeldApproval(): boolean {
  return useSyncExternalStore(subscribe, () => held !== null);
}
