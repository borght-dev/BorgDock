import { describe, expect, it } from 'vitest';
import { computeInlineChanges, findLinePairs, parsePatch } from '../diff-parser';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_PATCH = `@@ -1,5 +1,6 @@
 import React from 'react';
-import { useState } from 'react';
+import { useState, useEffect } from 'react';
+import clsx from 'clsx';

 function App() {
   const [count, setCount] = useState(0);
@@ -10,4 +11,6 @@
   return (
     <div>
+      <h1>Hello</h1>
       <button onClick={() => setCount(count + 1)}>{count}</button>
+      <p>Footer</p>
     </div>`;

const ADDITIONS_ONLY_PATCH = `@@ -0,0 +1,3 @@
+line one
+line two
+line three`;

const DELETIONS_ONLY_PATCH = `@@ -1,3 +0,0 @@
-line one
-line two
-line three`;

const SINGLE_LINE_HUNK = `@@ -1 +1 @@
-old
+new`;

const MULTI_DELETE_ADD_PATCH = `@@ -1,6 +1,6 @@
-aaa
-bbb
-ccc
+AAA
+BBB
+CCC
 context1
 context2
 context3`;

const NO_NEWLINE_MIXED_PATCH = `@@ -1,3 +1,3 @@
 first
-middle
\\ No newline at end of file
+MIDDLE
\\ No newline at end of file
 last`;

const THREE_HUNK_PATCH = `@@ -1,2 +1,2 @@
-a
+A
 b
@@ -10,2 +10,2 @@
-c
+C
 d
@@ -20,2 +20,2 @@
-e
+E
 f`;

// ---------------------------------------------------------------------------
// parsePatch
// ---------------------------------------------------------------------------

describe('parsePatch', () => {
  it('parses multi-hunk patch with correct hunk counts', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    expect(hunks).toHaveLength(2);
  });

  it('parses first hunk line numbers correctly', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    const h1 = hunks[0]!;
    expect(h1.oldStart).toBe(1);
    expect(h1.oldCount).toBe(5);
    expect(h1.newStart).toBe(1);
    expect(h1.newCount).toBe(6);
  });

  it('parses second hunk line numbers correctly', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    const h2 = hunks[1]!;
    expect(h2.oldStart).toBe(10);
    expect(h2.oldCount).toBe(4);
    expect(h2.newStart).toBe(11);
    expect(h2.newCount).toBe(6);
  });

  it('classifies line types correctly in first hunk', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    const lines = hunks[0]!.lines.filter((l) => l.type !== 'hunk-header');
    expect(lines).toHaveLength(7);
    expect(lines.map((l) => l.type)).toEqual([
      'context', 'delete', 'add', 'add', 'context', 'context', 'context',
    ]);
  });

  it('assigns old line numbers to context and delete lines', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    const lines = hunks[0]!.lines.filter((l) => l.type !== 'hunk-header');
    // context line 1
    expect(lines[0]!.oldLineNumber).toBe(1);
    expect(lines[0]!.newLineNumber).toBe(1);
    // delete at old line 2
    expect(lines[1]!.oldLineNumber).toBe(2);
    expect(lines[1]!.newLineNumber).toBeUndefined();
    // first add at new line 2
    expect(lines[2]!.oldLineNumber).toBeUndefined();
    expect(lines[2]!.newLineNumber).toBe(2);
    // second add at new line 3
    expect(lines[3]!.newLineNumber).toBe(3);
    // next context should be old=3, new=4
    expect(lines[4]!.oldLineNumber).toBe(3);
    expect(lines[4]!.newLineNumber).toBe(4);
  });

  it('strips leading +/- from content', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    const lines = hunks[0]!.lines.filter((l) => l.type !== 'hunk-header');
    expect(lines[1]!.content).toBe("import { useState } from 'react';");
    expect(lines[2]!.content).toBe("import { useState, useEffect } from 'react';");
  });

  it('strips leading space from context lines', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    const lines = hunks[0]!.lines.filter((l) => l.type !== 'hunk-header');
    expect(lines[0]!.content).toBe("import React from 'react';");
  });

  it('includes hunk-header line as first line of each hunk', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    expect(hunks[0]!.lines[0]!.type).toBe('hunk-header');
    expect(hunks[1]!.lines[0]!.type).toBe('hunk-header');
  });

  it('extracts section name from hunk header', () => {
    const patch = '@@ -10,4 +11,6 @@ function App() {\n context';
    const hunks = parsePatch(patch);
    expect(hunks[0]!.sectionName).toBe('function App() {');
  });

  it('handles hunk header without section name', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    // first hunk: @@ -1,5 +1,6 @@ has no section name
    expect(hunks[0]!.sectionName).toBeUndefined();
  });

  it('handles empty patch', () => {
    expect(parsePatch('')).toEqual([]);
  });

  it('handles additions-only patch (new file)', () => {
    const hunks = parsePatch(ADDITIONS_ONLY_PATCH);
    expect(hunks).toHaveLength(1);
    const h = hunks[0]!;
    expect(h.oldStart).toBe(0);
    expect(h.oldCount).toBe(0);
    expect(h.newStart).toBe(1);
    expect(h.newCount).toBe(3);
    const lines = h.lines.filter((l) => l.type !== 'hunk-header');
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.type === 'add')).toBe(true);
    expect(lines[0]!.newLineNumber).toBe(1);
    expect(lines[1]!.newLineNumber).toBe(2);
    expect(lines[2]!.newLineNumber).toBe(3);
  });

  it('handles deletions-only patch (removed file)', () => {
    const hunks = parsePatch(DELETIONS_ONLY_PATCH);
    expect(hunks).toHaveLength(1);
    const h = hunks[0]!;
    expect(h.oldStart).toBe(1);
    expect(h.oldCount).toBe(3);
    expect(h.newStart).toBe(0);
    expect(h.newCount).toBe(0);
    const lines = h.lines.filter((l) => l.type !== 'hunk-header');
    expect(lines.every((l) => l.type === 'delete')).toBe(true);
  });

  it('handles single-line hunk (no count in header)', () => {
    const hunks = parsePatch(SINGLE_LINE_HUNK);
    expect(hunks).toHaveLength(1);
    const h = hunks[0]!;
    expect(h.oldStart).toBe(1);
    expect(h.oldCount).toBe(1);
    expect(h.newStart).toBe(1);
    expect(h.newCount).toBe(1);
  });

  it('handles three hunks', () => {
    const hunks = parsePatch(THREE_HUNK_PATCH);
    expect(hunks).toHaveLength(3);
    expect(hunks[0]!.oldStart).toBe(1);
    expect(hunks[1]!.oldStart).toBe(10);
    expect(hunks[2]!.oldStart).toBe(20);
  });

  it('tracks line numbers correctly across second hunk', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    const lines = hunks[1]!.lines.filter((l) => l.type !== 'hunk-header');
    // @@ -10,4 +11,6 @@
    // context: old=10, new=11
    expect(lines[0]!.oldLineNumber).toBe(10);
    expect(lines[0]!.newLineNumber).toBe(11);
    // context: old=11, new=12
    expect(lines[1]!.oldLineNumber).toBe(11);
    expect(lines[1]!.newLineNumber).toBe(12);
    // add: new=13
    expect(lines[2]!.type).toBe('add');
    expect(lines[2]!.newLineNumber).toBe(13);
  });

  it('marks no-newline-at-end-of-file on preceding line', () => {
    const hunks = parsePatch(NO_NEWLINE_MIXED_PATCH);
    const lines = hunks[0]!.lines.filter((l) => l.type !== 'hunk-header');
    // delete at index 1 should have noNewline
    expect(lines[1]!.type).toBe('delete');
    expect(lines[1]!.noNewline).toBe(true);
    // add at index 2 should have noNewline
    expect(lines[2]!.type).toBe('add');
    expect(lines[2]!.noNewline).toBe(true);
    // context lines should not have noNewline
    expect(lines[0]!.noNewline).toBeUndefined();
    expect(lines[3]!.noNewline).toBeUndefined();
  });

  it('ignores lines before first hunk header', () => {
    const patch = 'some garbage\nmore garbage\n@@ -1,1 +1,1 @@\n-old\n+new';
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    const lines = hunks[0]!.lines.filter((l) => l.type !== 'hunk-header');
    expect(lines).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// findLinePairs
// ---------------------------------------------------------------------------

describe('findLinePairs', () => {
  it('pairs adjacent delete-add lines', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);
    // hunk 1: [hunk-header, context, delete, add, add, context, context, context]
    // delete at index 2, first add at index 3
    expect(pairs.get(2)).toBe(3);
  });

  it('pairs equal counts of deletes and adds', () => {
    const hunks = parsePatch(MULTI_DELETE_ADD_PATCH);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);
    // [hunk-header(0), del(1), del(2), del(3), add(4), add(5), add(6), ctx, ctx, ctx]
    expect(pairs.size).toBe(3);
    expect(pairs.get(1)).toBe(4);
    expect(pairs.get(2)).toBe(5);
    expect(pairs.get(3)).toBe(6);
  });

  it('pairs only min(deletes, adds) when uneven', () => {
    const patch = `@@ -1,3 +1,2 @@
-a
-b
-c
+A
+B`;
    const hunks = parsePatch(patch);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);
    // 3 deletes, 2 adds -> 2 pairs
    expect(pairs.size).toBe(2);
    expect(pairs.get(1)).toBe(4); // del@1 -> add@4
    expect(pairs.get(2)).toBe(5); // del@2 -> add@5
    expect(pairs.has(3)).toBe(false); // unpaired delete
  });

  it('does not pair when adds come before deletes', () => {
    // findLinePairs only looks for delete→add sequences
    const patch = `@@ -1,2 +1,2 @@
+added
-deleted`;
    const hunks = parsePatch(patch);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);
    // add at 1, delete at 2 — not a delete→add sequence
    expect(pairs.size).toBe(0);
  });

  it('handles context lines between delete/add blocks', () => {
    const patch = `@@ -1,4 +1,4 @@
-a
+A
 ctx
-b
+B`;
    const hunks = parsePatch(patch);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);
    // Two separate delete-add blocks
    expect(pairs.size).toBe(2);
    expect(pairs.get(1)).toBe(2); // first block: del@1 -> add@2
    expect(pairs.get(4)).toBe(5); // second block: del@4 -> add@5
  });

  it('returns empty map for context-only patch', () => {
    const patch = `@@ -1,2 +1,2 @@
 same line
 another same`;
    const hunks = parsePatch(patch);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);
    expect(pairs.size).toBe(0);
  });

  it('handles empty lines array', () => {
    const pairs = findLinePairs([]);
    expect(pairs.size).toBe(0);
  });

  it('pairs across multiple hunks when flattened', () => {
    const hunks = parsePatch(THREE_HUNK_PATCH);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);
    // Three hunks, each with one del-add pair
    expect(pairs.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeInlineChanges
// ---------------------------------------------------------------------------

describe('computeInlineChanges', () => {
  it('detects word-level changes for similar lines', () => {
    const result = computeInlineChanges(
      "import { useState } from 'react';",
      "import { useState, useEffect } from 'react';",
    );
    expect(result).not.toBeNull();
    expect(result!.deleted.some((s) => s.type === 'unchanged')).toBe(true);
    expect(result!.added.some((s) => s.type === 'added')).toBe(true);
  });

  it('returns null for very different lines (below 40% similarity)', () => {
    const result = computeInlineChanges(
      'const x = 1;',
      'function foo() { return bar; }',
    );
    expect(result).toBeNull();
  });

  it('returns null for empty inputs', () => {
    expect(computeInlineChanges('', '')).toBeNull();
  });

  it('handles identical lines', () => {
    const result = computeInlineChanges('same', 'same');
    expect(result).not.toBeNull();
    // All spans should be unchanged
    expect(result!.deleted.every((s) => s.type === 'unchanged')).toBe(true);
    expect(result!.added.every((s) => s.type === 'unchanged')).toBe(true);
    // Joined text should match input
    expect(result!.deleted.map((s) => s.text).join('')).toBe('same');
    expect(result!.added.map((s) => s.text).join('')).toBe('same');
  });

  it('highlights single character change', () => {
    const result = computeInlineChanges('cat', 'bat');
    expect(result).not.toBeNull();
    // deleted spans should cover 'c' as deleted and 'at' as unchanged
    const delText = result!.deleted.map((s) => s.text).join('');
    expect(delText).toBe('cat');
    const addText = result!.added.map((s) => s.text).join('');
    expect(addText).toBe('bat');
    // The 'at' part should be unchanged in both
    expect(result!.deleted.some((s) => s.type === 'deleted' && s.text === 'c')).toBe(true);
    expect(result!.added.some((s) => s.type === 'added' && s.text === 'b')).toBe(true);
  });

  it('handles one side being a prefix of the other', () => {
    const result = computeInlineChanges('hello', 'hello world');
    expect(result).not.toBeNull();
    // deleted side: all unchanged (since 'hello' is entirely in 'hello world')
    expect(result!.deleted.every((s) => s.type === 'unchanged')).toBe(true);
    expect(result!.deleted.map((s) => s.text).join('')).toBe('hello');
    // added side: 'hello' unchanged, ' world' added
    expect(result!.added.map((s) => s.text).join('')).toBe('hello world');
    expect(result!.added.some((s) => s.type === 'added')).toBe(true);
  });

  it('produces non-overlapping spans that reconstruct original text', () => {
    const del = '  const count = useState(0);';
    const add = '  const [count, setCount] = useState(0);';
    const result = computeInlineChanges(del, add);
    expect(result).not.toBeNull();
    // Verify deleted spans reconstruct deleted content
    expect(result!.deleted.map((s) => s.text).join('')).toBe(del);
    // Verify added spans reconstruct added content
    expect(result!.added.map((s) => s.text).join('')).toBe(add);
  });

  it('returns result for just-above-threshold similarity', () => {
    // Two strings that are ~50% similar
    const result = computeInlineChanges('abcdef', 'abcxyz');
    expect(result).not.toBeNull();
  });

  it('returns null for just-below-threshold similarity', () => {
    // very short, very different
    const result = computeInlineChanges('ab', 'yz');
    expect(result).toBeNull();
  });

  it('spans have only valid types', () => {
    const result = computeInlineChanges(
      'const x = foo();',
      'const y = bar();',
    );
    expect(result).not.toBeNull();
    for (const span of result!.deleted) {
      expect(['unchanged', 'deleted']).toContain(span.type);
    }
    for (const span of result!.added) {
      expect(['unchanged', 'added']).toContain(span.type);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: parsePatch → findLinePairs → computeInlineChanges
// ---------------------------------------------------------------------------

describe('end-to-end inline highlighting', () => {
  it('produces inline changes for paired lines in a real patch', () => {
    const hunks = parsePatch(SAMPLE_PATCH);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);

    let foundHighlight = false;
    for (const [delIdx, addIdx] of pairs) {
      const delLine = allLines[delIdx]!;
      const addLine = allLines[addIdx]!;
      const result = computeInlineChanges(delLine.content, addLine.content);
      if (result) {
        foundHighlight = true;
        // Verify text reconstruction
        expect(result.deleted.map((s) => s.text).join('')).toBe(delLine.content);
        expect(result.added.map((s) => s.text).join('')).toBe(addLine.content);
      }
    }
    expect(foundHighlight).toBe(true);
  });

  it('pairs multi-line delete/add blocks correctly', () => {
    const hunks = parsePatch(MULTI_DELETE_ADD_PATCH);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);

    expect(pairs.size).toBe(3);
    // aaa→AAA shares no characters (case-sensitive LCS = 0), so inline changes
    // return null — that's correct, they'll render as full line add/delete
    for (const [delIdx, addIdx] of pairs) {
      const result = computeInlineChanges(allLines[delIdx]!.content, allLines[addIdx]!.content);
      expect(result).toBeNull(); // too dissimilar for word-level highlight
    }
  });

  it('produces inline changes for realistic similar lines', () => {
    const patch = `@@ -1,3 +1,3 @@
-  const name = "Alice";
-  const age = 25;
-  console.log(name);
+  const name = "Bob";
+  const age = 30;
+  console.log(name, age);`;
    const hunks = parsePatch(patch);
    const allLines = hunks.flatMap((h) => h.lines);
    const pairs = findLinePairs(allLines);

    expect(pairs.size).toBe(3);
    for (const [delIdx, addIdx] of pairs) {
      const result = computeInlineChanges(allLines[delIdx]!.content, allLines[addIdx]!.content);
      expect(result).not.toBeNull();
      expect(result!.deleted.map((s) => s.text).join('')).toBe(allLines[delIdx]!.content);
      expect(result!.added.map((s) => s.text).join('')).toBe(allLines[addIdx]!.content);
    }
  });
});
