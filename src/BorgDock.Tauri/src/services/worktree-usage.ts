/**
 * When BorgDock last opened each worktree (terminal, editor, folder, T3),
 * kept in localStorage so every window of the app shares it. Git has no
 * notion of "last used", so this is what the Worktrees section's meta line
 * reports; a worktree BorgDock never opened has no time.
 */

const STORAGE_KEY = 'borgdock-worktree-last-used';
/** Keep the map small: the most recently used worktrees only. */
const MAX_ENTRIES = 200;

export type WorktreeUsage = Record<string, number>;

export function readWorktreeUsage(): WorktreeUsage {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const usage: WorktreeUsage = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) usage[key] = value;
    }
    return usage;
  } catch {
    return {};
  }
}

/** Record that `key` (a `worktreeKey`) was opened at `at`; returns the new map. */
export function markWorktreeUsed(key: string, at: number = Date.now()): WorktreeUsage {
  const usage = { ...readWorktreeUsage(), [key]: at };
  const trimmed = Object.fromEntries(
    Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ENTRIES),
  );
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or unavailable: the time is simply not remembered.
  }
  return trimmed;
}
