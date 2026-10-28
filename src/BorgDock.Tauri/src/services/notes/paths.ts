/** Vault paths: what a note is called on disk. Pure. */

export const DAILY_FOLDER = 'Daily';
export const TEMPLATES_FOLDER = 'Templates';
export const DECISIONS_FOLDER = 'Decisions';
export const INBOX_PATH = 'Inbox.md';

/** `2026-10-28` in local time. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailyPath(date: Date): string {
  return `${DAILY_FOLDER}/${dayKey(date)}.md`;
}

export function isDailyPath(path: string): boolean {
  return new RegExp(`^${DAILY_FOLDER}/\\d{4}-\\d{2}-\\d{2}\\.md$`).test(path);
}

export function isTemplatePath(path: string): boolean {
  return path.startsWith(`${TEMPLATES_FOLDER}/`);
}

/** The folder a note sits in, `''` for the vault's root. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/**
 * A title as a file name: characters Windows and Obsidian refuse become a
 * space, runs of spaces collapse, and nothing is left empty.
 */
export function safeTitle(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120)
    .trim();
  return cleaned || 'Untitled';
}

export function pathFor(folder: string, title: string): string {
  const name = `${safeTitle(title)}.md`;
  return folder ? `${folder}/${name}` : name;
}

/** `pathFor`, numbered (`Untitled 2.md`) until no note in `taken` has it. */
export function uniquePath(folder: string, title: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((p) => p.toLowerCase()));
  const base = safeTitle(title);
  let path = pathFor(folder, base);
  for (let n = 2; lower.has(path.toLowerCase()); n++) path = pathFor(folder, `${base} ${n}`);
  return path;
}
