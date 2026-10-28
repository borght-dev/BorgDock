/**
 * The T3 threads started from notes, kept in `localStorage` so their results
 * can be written back after a restart. Each names the note it came from.
 */

const STORAGE_KEY = 'borgdock.notes.threads';

export interface TrackedThread {
  path: string;
  hostId: string;
  /** The id T3 knows the thread by. */
  threadId: string;
  label: string;
  startedAt: number;
}

export function readTracked(): TrackedThread[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as TrackedThread[]) : [];
  } catch {
    return [];
  }
}

export function writeTracked(threads: TrackedThread[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    // Following threads is best-effort; the note keeps the thread's link.
  }
}

export function trackThread(thread: TrackedThread) {
  writeTracked([...readTracked().filter((t) => t.threadId !== thread.threadId), thread]);
}

/** A renamed note keeps its threads: their results land in the note under its new name. */
export function retargetThreads(from: string, to: string) {
  const tracked = readTracked();
  if (!tracked.some((t) => t.path === from)) return;
  writeTracked(tracked.map((t) => (t.path === from ? { ...t, path: to } : t)));
}
