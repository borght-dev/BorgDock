import type { ParsedChangelog, Release } from './types';
import type { Highlight, Kind } from '../../src/types/whats-new';

const VERSION_HEADING = /^##\s+(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})\s*$/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const TITLE_BULLET = /^-\s+\*\*(.+?)\*\*\s*—\s+(.*)$/;
const PLAIN_BULLET = /^-\s+(.+)$/;

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

function makeHighlight(kind: Kind, title: string, body: string): Highlight {
  return {
    kind,
    title,
    description: body,
    hero: null,
    keyboard: null,
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
      currentRelease.highlights.push(
        makeHighlight(currentKind, titleMatch[1], titleMatch[2]),
      );
      continue;
    }

    if (currentKind === 'fixed') {
      const plain = line.match(PLAIN_BULLET);
      if (plain) currentRelease.alsoFixed.push(plain[1]);
    }
  }

  releases.sort((a, b) => semverCompareDesc(a.version, b.version));
  return { releases, imageRefs };
}
