import { create } from 'zustand';

export interface PrDetailJumpTarget {
  /** Absolute file path within the PR (matches DiffFile.filename). */
  filePath: string;
  /** New-side line number (1-based) — matches the DiffLine.newLineNumber the FilesTab uses to resolve nodes. */
  line: number;
  /** Optional thread id — when set, the FilesTab will auto-expand that thread on arrival. */
  threadId?: string;
  /** Monotonic timestamp. Bumped on every call so subscribers re-fire even on repeat coordinates. */
  ts: number;
}

interface PrDetailJumpState {
  target: PrDetailJumpTarget | null;
  setJumpTarget: (target: PrDetailJumpTarget) => void;
  clearJumpTarget: () => void;
}

/**
 * Cross-tab deep-link bus for the PR detail surface.
 *
 * Producers: Discussion's CodeThreadCard "View in Files" button, future notification deep-links.
 * Consumers: PRDetailPanel (switches active tab to Files), FilesTab (scrolls + highlights + expands thread).
 *
 * The store is intentionally global — multiple PR detail windows each carry their own React tree, so
 * a single global is fine; the FilesTab subscriber clears the target after consuming it.
 */
export const usePrDetailJumpStore = create<PrDetailJumpState>((set) => ({
  target: null,
  setJumpTarget: (target) => set({ target }),
  clearJumpTarget: () => set({ target: null }),
}));
