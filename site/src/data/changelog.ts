// Parse /CHANGELOG.md (the source of truth that also feeds the in-app
// What's new window) for the changelog page and the home page teaser.
import changelogMd from '../../../CHANGELOG.md?raw';

export type Kind = 'new' | 'improved' | 'fixed';

export interface ReleaseEntry {
  title: string;
  /** The rest of the bullet after "**Title** — ", without images. */
  body?: string;
}

export interface ChangelogRelease {
  v: string;
  date: string;
  groups: Partial<Record<Kind, ReleaseEntry[]>>;
}

const KIND_MAP: Record<string, Kind> = {
  'New Features': 'new',
  Improvements: 'improved',
  'Bug Fixes': 'fixed',
};

export const KIND_LABEL: Record<Kind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
};

export function stripInline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseChangelog(md: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let cur: ChangelogRelease | null = null;
  let kind: Kind | null = null;
  for (const line of md.split(/\r?\n/)) {
    const v = line.match(/^##\s+(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})/);
    if (v) {
      cur = { v: v[1], date: v[2], groups: {} };
      releases.push(cur);
      kind = null;
      continue;
    }
    const s = line.match(/^###\s+(.+?)\s*$/);
    if (s) {
      kind = KIND_MAP[s[1]] ?? null;
      continue;
    }
    if (!cur || !kind) continue;
    const t = line.match(/^-\s+\*\*(.+?)\*\*\s*—\s+(.*)$/);
    const p = line.match(/^-\s+(.+)$/);
    const list = (cur.groups[kind] ||= []);
    if (t) list.push({ title: stripInline(t[1]), body: stripInline(t[2]) });
    else if (p) list.push({ title: stripInline(p[1]) });
  }
  return releases;
}

export const releases: ChangelogRelease[] = parseChangelog(changelogMd);

/**
 * What's new posts by version, by convention: a page at
 * `src/pages/whats-new/<version>.astro` (dots or dashes, so `2.0.0.astro` and
 * `2-0-0.astro` both count) is the long-form post for that release.
 */
const postFiles = Object.keys(import.meta.glob('../pages/whats-new/*.astro'));
export const whatsNewPosts: Record<string, string> = Object.fromEntries(
  postFiles.map((file) => {
    const base = file.split('/').pop()?.replace(/\.astro$/, '') ?? '';
    return [base.replace(/-/g, '.'), `/whats-new/${base}`];
  }),
);

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[(m ?? 1) - 1]} ${d}, ${y}`;
}
