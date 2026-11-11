/**
 * The Pull requests list applies a filter, group or sort change only after
 * the rows that leave have faded out (FLIP in `PrList`). Until then the
 * stores still hold the old state, so anything that reads them in that
 * window (a second quick change, saving a view) applies the waiting change
 * first through `settleChange`.
 */

let pending: (() => void) | null = null;

/** Hold `apply` until the leave fade ends; a held change it replaces is applied first. */
export function holdChange(apply: () => void): void {
  settleChange();
  pending = apply;
}

/** The fade ended and `apply` ran: forget it (unless a newer change took its place). */
export function releaseChange(apply: () => void): void {
  if (pending === apply) pending = null;
}

/** Apply the held change now, if any. */
export function settleChange(): void {
  const apply = pending;
  pending = null;
  apply?.();
}
