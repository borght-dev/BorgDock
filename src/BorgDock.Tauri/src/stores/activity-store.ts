import { create } from 'zustand';
import { type ActivityCapacity, type ActivityCounts, events } from '@/generated/commands';
import * as api from '@/services/activity/api';

/**
 * The read side of the activity journal in this window: the counts Rust
 * sends with every change, and what ingestion ran into. The section's page,
 * filters and undo live in `activity-view-store.ts`.
 */
interface ActivityState {
  counts: ActivityCounts | null;
  capacity: ActivityCapacity;
  /** Source id → the last commit error, for the banner with Retry. */
  commitErrors: Record<string, string>;
  /** Written by a newer BorgDock: reads work, ingestion stopped. */
  readOnly: boolean;
  /** Where an unusable journal was moved this session. */
  recoveredFrom: string | null;
  setCounts: (counts: ActivityCounts) => void;
  setCapacity: (capacity: ActivityCapacity) => void;
  setCommitError: (sourceId: string, message: string) => void;
  clearCommitError: (sourceId: string) => void;
  setReadOnly: (readOnly: boolean) => void;
  setRecoveredFrom: (path: string | null) => void;
}

export const useActivityStore = create<ActivityState>()((set) => ({
  counts: null,
  capacity: 'ok',
  commitErrors: {},
  readOnly: false,
  recoveredFrom: null,
  setCounts: (counts) =>
    set((state) => (state.counts && state.counts.revision > counts.revision ? state : { counts })),
  setCapacity: (capacity) => set((state) => (state.capacity === capacity ? state : { capacity })),
  setCommitError: (sourceId, message) =>
    set((state) =>
      state.commitErrors[sourceId] === message
        ? state
        : { commitErrors: { ...state.commitErrors, [sourceId]: message } },
    ),
  clearCommitError: (sourceId) =>
    set((state) => {
      if (!(sourceId in state.commitErrors)) return state;
      const { [sourceId]: _, ...rest } = state.commitErrors;
      return { commitErrors: rest };
    }),
  setReadOnly: (readOnly) => set({ readOnly }),
  setRecoveredFrom: (recoveredFrom) => set({ recoveredFrom }),
}));

/** Unread entries that need me: the rail, tray and taskbar count. */
export const selectNeedsYou = (state: ActivityState) => state.counts?.needsYou ?? 0;
export const selectUnread = (state: ActivityState) => state.counts?.unread ?? 0;

/**
 * Keep this window's counts current: read them once, then take the ones
 * Rust sends with every change. Any window can follow; only the main
 * window's runtime writes.
 */
export function followActivityCounts(): () => void {
  let stopped = false;
  let unlisten: (() => void) | undefined;
  void api
    .counts()
    .then((counts) => {
      if (!stopped) useActivityStore.getState().setCounts(counts);
    })
    .catch(() => {});
  void Promise.resolve()
    .then(() =>
      events.activityChanged.listen((event) =>
        useActivityStore.getState().setCounts(event.payload.counts),
      ),
    )
    .then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    unlisten?.();
  };
}
