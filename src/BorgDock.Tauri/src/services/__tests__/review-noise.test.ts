import { describe, expect, it } from 'vitest';
import type { DiffFile } from '@/types';
import { classifyNoise, describeNoise } from '../review-noise';

function file(filename: string, patch: string, status: DiffFile['status'] = 'modified'): DiffFile {
  return {
    filename,
    status,
    patch,
    additions: 0,
    deletions: 0,
    isBinary: false,
    isTruncated: false,
    sha: filename,
  };
}

const MOVED = [
  'export function roundPerShift(shift: Shift, rule: Rule) {',
  '  return shift.parts.map((part) => rule.round(part.minutes));',
  '}',
  'export function totalBreak(shift: Shift) {',
  '  return shift.parts.reduce((sum, part) => sum + part.minutes, 0);',
];

describe('classifyNoise', () => {
  it('folds a hunk that only re-indents code', () => {
    const noise = classifyNoise([
      file('a.ts', '@@ -1,2 +1,2 @@\n-if (x) {\n-return y;\n+if (x) {\n+    return y;'),
    ]);
    expect(noise.get('a.ts')).toEqual({
      hunks: [{ kind: 'whitespace' }],
      mechanical: true,
      label: 'Whitespace only',
    });
  });

  it('folds a hunk that only adds blank lines', () => {
    const noise = classifyNoise([file('a.ts', '@@ -1,2 +1,3 @@\n a();\n+\n b();')]);
    expect(noise.get('a.ts')?.hunks).toEqual([{ kind: 'whitespace' }]);
  });

  it('folds import changes, including members of a multi-line import', () => {
    const noise = classifyNoise([
      file(
        'a.tsx',
        "@@ -1,5 +1,6 @@\n import {\n   Button,\n+  Pill,\n   Seg2,\n } from '@/components/shared/primitives';\n-import { a } from './a';\n+import { a, b } from './a';",
      ),
      file('B.cs', '@@ -1,2 +1,3 @@\n using System;\n+using System.Linq;\n namespace X;'),
      file('c.rs', '@@ -1,1 +1,2 @@\n use std::fs;\n+use std::io::{Read, Write};'),
    ]);
    expect(noise.get('a.tsx')?.label).toBe('Imports only');
    expect(noise.get('B.cs')?.label).toBe('Imports only');
    expect(noise.get('c.rs')?.label).toBe('Imports only');
  });

  it('does not fold code that sits next to an import', () => {
    const noise = classifyNoise([
      file('a.ts', "@@ -1,1 +1,3 @@\n+import { b } from './b';\n+const answer = b();\n x();"),
    ]);
    expect(noise.get('a.ts')).toEqual({ hunks: [null], mechanical: false, label: null });
  });

  it('matches a block moved to another file on both sides, indentation aside', () => {
    const out = `@@ -10,6 +10,1 @@\n keep();\n${MOVED.map((l) => `-${l}`).join('\n')}`;
    const into = `@@ -0,0 +1,5 @@\n${MOVED.map((l) => `+    ${l}`).join('\n')}`;
    const noise = classifyNoise([file('src/rounding.ts', out), file('src/shift.ts', into)]);
    expect(noise.get('src/shift.ts')?.hunks).toEqual([
      { kind: 'moved', direction: 'in', path: 'src/rounding.ts', line: 11 },
    ]);
    expect(noise.get('src/rounding.ts')?.hunks).toEqual([
      { kind: 'moved', direction: 'out', path: 'src/shift.ts', line: 1 },
    ]);
    expect(noise.get('src/shift.ts')?.label).toBe('Moved code');
  });

  it('folds where a block was cut, not the new class it was pasted into', () => {
    const out = `@@ -10,5 +10,0 @@\n${MOVED.map((l) => `-${l}`).join('\n')}`;
    const into = `@@ -0,0 +1,7 @@\n+export class ShiftRounding {\n${MOVED.map((l) => `+  ${l}`).join('\n')}\n+}`;
    const noise = classifyNoise([file('src/rounding.ts', out), file('src/ShiftRounding.ts', into)]);
    expect(noise.get('src/rounding.ts')?.hunks).toEqual([
      { kind: 'moved', direction: 'out', path: 'src/ShiftRounding.ts', line: 2 },
    ]);
    expect(noise.get('src/ShiftRounding.ts')?.hunks).toEqual([null]);
  });

  it('does not call an edited block moved', () => {
    const edited = MOVED.map((l, i) => (i === 1 ? '  return shift.parts.length;' : l));
    const noise = classifyNoise([
      file('a.ts', `@@ -1,5 +1,0 @@\n${MOVED.map((l) => `-${l}`).join('\n')}`),
      file('b.ts', `@@ -0,0 +1,5 @@\n${edited.map((l) => `+${l}`).join('\n')}`),
    ]);
    expect(noise.get('b.ts')?.hunks).toEqual([null]);
    expect(noise.get('a.ts')?.hunks).toEqual([null]);
  });

  it('ignores short coincidences', () => {
    const noise = classifyNoise([
      file('a.ts', '@@ -1,1 +1,0 @@\n-return null;'),
      file('b.ts', '@@ -0,0 +1,1 @@\n+return null;'),
    ]);
    expect(noise.get('b.ts')?.mechanical).toBe(false);
  });

  it('needs every hunk to be noise before a file is mechanical', () => {
    const noise = classifyNoise([
      file('a.ts', '@@ -1,1 +1,1 @@\n-a( b );\n+a(b);\n@@ -9,1 +9,1 @@\n-return 1;\n+return 2;'),
    ]);
    expect(noise.get('a.ts')).toEqual({
      hunks: [{ kind: 'whitespace' }, null],
      mechanical: false,
      label: null,
    });
  });

  it('calls a rename without changes mechanical', () => {
    const noise = classifyNoise([file('new.ts', '', 'renamed')]);
    expect(noise.get('new.ts')).toEqual({ hunks: [], mechanical: true, label: 'Renamed only' });
  });

  it('does not call a file with no patch mechanical', () => {
    expect(classifyNoise([file('big.ts', '')]).get('big.ts')?.mechanical).toBe(false);
  });
});

describe('describeNoise', () => {
  it('names where a move went, by file name', () => {
    expect(
      describeNoise({ kind: 'moved', direction: 'out', path: 'src/deep/shift.ts', line: 4 }),
    ).toBe('Moved to shift.ts:4');
    expect(describeNoise({ kind: 'imports' })).toBe('Imports only');
  });
});
