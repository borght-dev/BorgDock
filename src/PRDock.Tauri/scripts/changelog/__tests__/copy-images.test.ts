import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncImages } from '../copy-images';

let tmp: string;
let docsRoot: string;
let publicRoot: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-copy-'));
  docsRoot = path.join(tmp, 'docs', 'whats-new');
  publicRoot = path.join(tmp, 'public', 'whats-new');
  fs.mkdirSync(path.join(docsRoot, '1.0.11'), { recursive: true });
  fs.writeFileSync(path.join(docsRoot, '1.0.11', 'close-pr.png'), 'PNGDATA');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('syncImages', () => {
  it('copies referenced images into public/whats-new/<version>/', () => {
    syncImages({
      refs: [{ version: '1.0.11', relPath: 'whats-new/1.0.11/close-pr.png', lineNumber: 10 }],
      docsRoot,
      publicRoot,
    });
    const copied = path.join(publicRoot, '1.0.11', 'close-pr.png');
    expect(fs.existsSync(copied)).toBe(true);
    expect(fs.readFileSync(copied, 'utf8')).toBe('PNGDATA');
  });

  it('throws when a referenced image is missing on disk', () => {
    expect(() =>
      syncImages({
        refs: [{ version: '1.0.11', relPath: 'whats-new/1.0.11/missing.png', lineNumber: 10 }],
        docsRoot,
        publicRoot,
      }),
    ).toThrow(/CHANGELOG\.md:10/);
  });

  it('deduplicates and skips no-op copies when content is unchanged', () => {
    // Seed an identical file in public/ already.
    fs.mkdirSync(path.join(publicRoot, '1.0.11'), { recursive: true });
    fs.writeFileSync(path.join(publicRoot, '1.0.11', 'close-pr.png'), 'PNGDATA');
    const mtimeBefore = fs.statSync(path.join(publicRoot, '1.0.11', 'close-pr.png')).mtimeMs;

    syncImages({
      refs: [
        { version: '1.0.11', relPath: 'whats-new/1.0.11/close-pr.png', lineNumber: 10 },
        { version: '1.0.11', relPath: 'whats-new/1.0.11/close-pr.png', lineNumber: 12 },
      ],
      docsRoot,
      publicRoot,
    });

    const mtimeAfter = fs.statSync(path.join(publicRoot, '1.0.11', 'close-pr.png')).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
