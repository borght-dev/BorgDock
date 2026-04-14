import type { ParsedChangelog, Release } from './types';

const VERSION_HEADING = /^##\s+(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})\s*$/;

function semverCompareDesc(a: string, b: string): number {
  const [aMaj, aMin, aPat] = a.split('.').map(Number);
  const [bMaj, bMin, bPat] = b.split('.').map(Number);
  if (aMaj !== bMaj) return bMaj - aMaj;
  if (aMin !== bMin) return bMin - aMin;
  return bPat - aPat;
}

export function parseChangelog(md: string): ParsedChangelog {
  const lines = md.split(/\r?\n/);
  const releases: Release[] = [];
  const imageRefs: ParsedChangelog['imageRefs'] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('## ')) continue;
    if (line.startsWith('### ')) continue;
    const m = line.match(VERSION_HEADING);
    if (!m) {
      const err: Error & { lineNumber?: number } = new Error(
        `malformed version heading at line ${i + 1}: ${line}`,
      );
      err.lineNumber = i + 1;
      throw err;
    }
    releases.push({
      version: m[1],
      date: m[2],
      summary: '',
      highlights: [],
      alsoFixed: [],
      autoOpenEligible: false,
    });
  }

  releases.sort((a, b) => semverCompareDesc(a.version, b.version));
  return { releases, imageRefs };
}
