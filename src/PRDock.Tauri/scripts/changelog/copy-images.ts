import fs from 'node:fs';
import path from 'node:path';
import type { ParsedChangelog } from './types';

export interface SyncImagesInput {
  refs: ParsedChangelog['imageRefs'];
  /** Directory that contains `<version>/` subfolders with source PNGs. */
  docsRoot: string;
  /** Destination directory that Vite serves statically. */
  publicRoot: string;
}

function relativeToDocs(relPath: string): string {
  // "whats-new/1.0.11/close-pr.png" → "1.0.11/close-pr.png"
  const prefix = 'whats-new/';
  if (!relPath.startsWith(prefix)) {
    throw new Error(`unexpected image path "${relPath}" — must start with "whats-new/"`);
  }
  return relPath.slice(prefix.length);
}

function sameContent(a: string, b: string): boolean {
  try {
    const ab = fs.readFileSync(a);
    const bb = fs.readFileSync(b);
    if (ab.byteLength !== bb.byteLength) return false;
    return ab.equals(bb);
  } catch {
    return false;
  }
}

export function syncImages({ refs, docsRoot, publicRoot }: SyncImagesInput): string[] {
  const seen = new Set<string>();
  const copied: string[] = [];

  for (const ref of refs) {
    const rel = relativeToDocs(ref.relPath);
    if (seen.has(rel)) continue;
    seen.add(rel);

    const src = path.join(docsRoot, rel);
    if (!fs.existsSync(src)) {
      throw new Error(
        `CHANGELOG.md:${ref.lineNumber} references missing image "${ref.relPath}". ` +
          `Add ${path.join('docs', 'whats-new', rel)} or remove the ![](...) from the bullet.`,
      );
    }

    const dst = path.join(publicRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });

    if (sameContent(src, dst)) continue;
    fs.copyFileSync(src, dst);
    copied.push(dst);
  }

  return copied;
}
