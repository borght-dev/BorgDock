import type { ParsedChangelog, Release } from './types';
import type { Highlight, Kind } from '../../src/types/whats-new';

const VERSION_HEADING = /^##\s+(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})\s*$/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const TITLE_BULLET = /^-\s+\*\*(.+?)\*\*\s*—\s+(.*)$/;
const PLAIN_BULLET = /^-\s+(.+)$/;

const MD_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/;
const SHORTCUT_TOKEN = /^(?:⌘|⇧|⌃|⌥|Ctrl|Cmd|Command|Alt|Option|Shift|Meta|Super)(?:[+\-](?:⌘|⇧|⌃|⌥|Ctrl|Cmd|Command|Alt|Option|Shift|Meta|Super|[A-Z0-9]|F\d{1,2}))+$|^F\d{1,2}$/;
const BACKTICK_SPAN = /`([^`]+)`/g;

const SECTION_TO_KIND: Record<string, Kind> = {
  'New Features': 'new',
  Improvements: 'improved',
  'Bug Fixes': 'fixed',
};

function semverCompareDesc(a: string, b: string): number {
  const [aMaj, aMin, aPat] = a.split('.').map(Number);
  const [bMaj, bMin, bPat] = b.split('.').map(Number);
  if (aMaj !== bMaj) return bMaj - aMaj;
  if (aMin !== bMin) return bMin - aMin;
  return bPat - aPat;
}

function extractHero(body: string, fallbackAlt: string): {
  body: string;
  hero: Highlight['hero'];
  heroRel: string | null;
} {
  const match = body.match(MD_IMAGE);
  if (!match) return { body, hero: null, heroRel: null };
  const [full, alt, src] = match;
  // Collapse surrounding whitespace: remove the token and any trailing single space.
  const cleaned = body.replace(full, '').replace(/  +/g, ' ').replace(/ +([.,;:!?])/g, '$1');
  return {
    body: cleaned,
    hero: { src, alt: alt.trim() || fallbackAlt },
    heroRel: src,
  };
}

function extractKeyboard(body: string): string | null {
  let m: RegExpExecArray | null;
  const re = new RegExp(BACKTICK_SPAN.source, 'g');
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(body)) !== null) {
    if (SHORTCUT_TOKEN.test(m[1])) return m[1];
  }
  return null;
}

function makeHighlight(kind: Kind, title: string, rawBody: string): {
  highlight: Highlight;
  heroRel: string | null;
} {
  const { body: bodyAfterHero, hero, heroRel } = extractHero(rawBody, title);
  const keyboard = extractKeyboard(bodyAfterHero);
  return {
    highlight: {
      kind,
      title,
      description: bodyAfterHero.trim(),
      hero,
      keyboard,
    },
    heroRel,
  };
}

export function parseChangelog(md: string): ParsedChangelog {
  const lines = md.split(/\r?\n/);
  const releases: Release[] = [];
  const imageRefs: ParsedChangelog['imageRefs'] = [];

  let currentRelease: Release | null = null;
  let currentKind: Kind | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('## ') && !line.startsWith('### ')) {
      const m = line.match(VERSION_HEADING);
      if (!m) {
        const err: Error & { lineNumber?: number } = new Error(
          `malformed version heading at line ${i + 1}: ${line}`,
        );
        err.lineNumber = i + 1;
        throw err;
      }
      currentRelease = {
        version: m[1],
        date: m[2],
        summary: '',
        highlights: [],
        alsoFixed: [],
        autoOpenEligible: false,
      };
      releases.push(currentRelease);
      currentKind = null;
      continue;
    }

    if (line.startsWith('### ')) {
      const m = line.match(SECTION_HEADING);
      currentKind = (m && SECTION_TO_KIND[m[1]]) ?? null;
      continue;
    }

    if (!currentRelease || !currentKind) continue;

    const titleMatch = line.match(TITLE_BULLET);
    if (titleMatch) {
      const { highlight, heroRel } = makeHighlight(currentKind, titleMatch[1], titleMatch[2]);
      currentRelease.highlights.push(highlight);
      if (heroRel) {
        imageRefs.push({ version: currentRelease.version, relPath: heroRel, lineNumber: i + 1 });
      }
      continue;
    }

    if (currentKind === 'fixed') {
      const plain = line.match(PLAIN_BULLET);
      if (plain) currentRelease.alsoFixed.push(plain[1]);
    }
  }

  for (const r of releases) {
    r.summary = deriveSummary(r.highlights);
    r.autoOpenEligible = r.highlights.some((h) => h.kind === 'new' || h.kind === 'improved');
  }

  releases.sort((a, b) => semverCompareDesc(a.version, b.version));
  return { releases, imageRefs };
}

function deriveSummary(highlights: Highlight[]): string {
  const titles = highlights.map((h) => h.title);
  if (titles.length === 0) return '';
  if (titles.length === 1) return `${titles[0]}.`;
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}.`;
  if (titles.length === 3) return `${titles[0]}, ${titles[1]}, and ${titles[2]}.`;
  return `${titles[0]}, ${titles[1]}, ${titles[2]}, and more.`;
}
