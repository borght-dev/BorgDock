// Parse /CHANGELOG.md (the source of truth that also feeds the in-app
// What's new window) for the changelog page, the release posts and the home
// page teaser.
import changelogMd from '../../../CHANGELOG.md?raw';

export type Kind = 'new' | 'improved' | 'fixed';

export interface ReleaseImage {
  /** Relative to docs/whats-new, e.g. `4.4.1/worktrees-by-host.png`. */
  path: string;
  alt: string;
}

export interface ReleaseEntry {
  title: string;
  /** The rest of the bullet after "**Title** — ", without images. */
  body?: string;
  image?: ReleaseImage;
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

export const KIND_ORDER: Kind[] = ['new', 'improved', 'fixed'];

export function stripInline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function imageOf(s: string): ReleaseImage | undefined {
  const m = s.match(/!\[([^\]]*)\]\(whats-new\/([^)]+)\)/);
  return m ? { alt: m[1], path: m[2] } : undefined;
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
    if (t) list.push({ title: stripInline(t[1]), body: stripInline(t[2]), image: imageOf(t[2]) });
    else if (p) list.push({ title: stripInline(p[1]) });
  }
  return releases;
}

export const releases: ChangelogRelease[] = parseChangelog(changelogMd);

/** The bullets of a release that have a title and a description, in kind order. */
export function highlightsOf(r: ChangelogRelease): (ReleaseEntry & { kind: Kind })[] {
  return KIND_ORDER.flatMap((kind) =>
    (r.groups[kind] ?? []).filter((e) => e.body).map((e) => ({ ...e, kind })),
  );
}

export function postSlug(v: string): string {
  return v.replace(/\./g, '-');
}

/**
 * What's new posts by version. A page at `src/pages/whats-new/<version>.astro`
 * (dots or dashes, so `2.0.0.astro` and `2-0-0.astro` both count) is a
 * hand-written post for that release. Every other release with at least one
 * highlight gets a post built from its CHANGELOG.md entry by
 * `whats-new/[version].astro`.
 */
const postFiles = Object.keys(import.meta.glob('../pages/whats-new/*.astro'));
export const handWrittenPosts: Record<string, string> = Object.fromEntries(
  postFiles.flatMap((file) => {
    const base = file.split('/').pop()?.replace(/\.astro$/, '') ?? '';
    if (base.startsWith('[')) return [];
    return [[base.replace(/-/g, '.'), `/whats-new/${base}`]];
  }),
);

export const generatedPostReleases: ChangelogRelease[] = releases.filter(
  (r) => !handWrittenPosts[r.v] && highlightsOf(r).length > 0,
);

export const whatsNewPosts: Record<string, string> = {
  ...Object.fromEntries(generatedPostReleases.map((r) => [r.v, `/whats-new/${postSlug(r.v)}`])),
  ...handWrittenPosts,
};

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[(m ?? 1) - 1]} ${d}, ${y}`;
}
