import type { DiffHunk, DiffLine, InlineChange } from '@/types';

const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@\s*(.*)?$/;

export function parsePatch(patch: string): DiffHunk[] {
  if (!patch) return [];

  const lines = patch.split('\n');
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;

    const hunkMatch = raw.match(HUNK_HEADER_RE);
    if (hunkMatch) {
      const oldStart = parseInt(hunkMatch[1]!, 10);
      const oldCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3]!, 10);
      const newCount = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;
      const sectionName = hunkMatch[5]?.trim() || undefined;

      current = {
        header: raw,
        oldStart,
        oldCount,
        newStart,
        newCount,
        sectionName,
        lines: [],
      };
      hunks.push(current);
      oldLine = oldStart;
      newLine = newStart;

      current.lines.push({
        type: 'hunk-header',
        content: raw,
      });
      continue;
    }

    if (!current) continue;

    // "\ No newline at end of file" annotation
    if (raw.startsWith('\\')) {
      const prev = current.lines[current.lines.length - 1];
      if (prev) prev.noNewline = true;
      continue;
    }

    const prefix = raw[0];
    const content = raw.slice(1);

    if (prefix === '+') {
      current.lines.push({
        type: 'add',
        content,
        newLineNumber: newLine,
      });
      newLine++;
    } else if (prefix === '-') {
      current.lines.push({
        type: 'delete',
        content,
        oldLineNumber: oldLine,
      });
      oldLine++;
    } else {
      // context line (space prefix) or any other line
      current.lines.push({
        type: 'context',
        content: prefix === ' ' ? content : raw,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return hunks;
}

// --- Word-level diff ---

export function computeInlineChanges(
  deletedContent: string,
  addedContent: string,
): { deleted: InlineChange[]; added: InlineChange[] } | null {
  if (!deletedContent && !addedContent) return null;

  const similarity = computeSimilarity(deletedContent, addedContent);
  if (similarity < 0.4) return null;

  const lcs = longestCommonSubsequence(deletedContent, addedContent);
  const deleted = buildSpans(deletedContent, lcs, 'deleted');
  const added = buildSpans(addedContent, lcs, 'added');

  return { deleted, added };
}

function buildSpans(
  text: string,
  lcs: string,
  changeType: 'added' | 'deleted',
): InlineChange[] {
  const spans: InlineChange[] = [];
  let ti = 0;
  let li = 0;

  while (ti < text.length) {
    if (li < lcs.length && text[ti] === lcs[li]) {
      // Unchanged character
      if (spans.length > 0 && spans[spans.length - 1]!.type === 'unchanged') {
        spans[spans.length - 1]!.text += text[ti];
      } else {
        spans.push({ type: 'unchanged', text: text[ti]! });
      }
      ti++;
      li++;
    } else {
      // Changed character
      if (spans.length > 0 && spans[spans.length - 1]!.type === changeType) {
        spans[spans.length - 1]!.text += text[ti];
      } else {
        spans.push({ type: changeType, text: text[ti]! });
      }
      ti++;
    }
  }

  return spans;
}

function longestCommonSubsequence(a: string, b: string): string {
  const m = a.length;
  const n = b.length;

  // Optimize for long strings: use two rows instead of full matrix
  if (m === 0 || n === 0) return '';

  const prev = new Uint32Array(n + 1);
  const curr = new Uint32Array(n + 1);

  // Build LCS length table
  const directions = new Uint8Array(m * n);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1]! + 1;
        directions[(i - 1) * n + (j - 1)] = 1; // diagonal
      } else if (prev[j]! >= curr[j - 1]!) {
        curr[j] = prev[j]!;
        directions[(i - 1) * n + (j - 1)] = 2; // up
      } else {
        curr[j] = curr[j - 1]!;
        directions[(i - 1) * n + (j - 1)] = 3; // left
      }
    }
    prev.set(curr);
  }

  // Backtrack to find the actual LCS string
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    const dir = directions[(i - 1) * n + (j - 1)]!;
    if (dir === 1) {
      result.push(a[i - 1]!);
      i--;
      j--;
    } else if (dir === 2) {
      i--;
    } else {
      j--;
    }
  }
  return result.reverse().join('');
}

function computeSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  let common = 0;
  const m = a.length;
  const n = b.length;
  const prev = new Uint32Array(n + 1);
  const curr = new Uint32Array(n + 1);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1]! + 1;
      } else {
        curr[j] = Math.max(prev[j]!, curr[j - 1]!);
      }
    }
    prev.set(curr);
  }
  common = curr[n]!;

  return common / maxLen;
}

export function findLinePairs(lines: DiffLine[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.type === 'delete') {
      // Collect consecutive deletes
      const deleteStart = i;
      while (i < lines.length && lines[i]!.type === 'delete') i++;
      // Collect consecutive adds
      const addStart = i;
      while (i < lines.length && lines[i]!.type === 'add') i++;
      const addEnd = i;

      // Pair them up
      const deleteCount = addStart - deleteStart;
      const addCount = addEnd - addStart;
      const pairCount = Math.min(deleteCount, addCount);
      for (let p = 0; p < pairCount; p++) {
        pairs.set(deleteStart + p, addStart + p);
      }
    } else {
      i++;
    }
  }

  return pairs;
}
