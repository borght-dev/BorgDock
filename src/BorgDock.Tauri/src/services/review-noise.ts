import { parsePatch } from '@/services/diff-parser';
import type { DiffFile, DiffHunk } from '@/types';

/**
 * A hunk nobody has to read line by line: only whitespace moved, only
 * imports changed, or a block that left one place and arrived unchanged in
 * another. Quick Review folds these into one line.
 */
export type HunkNoise =
  | { kind: 'whitespace' }
  | { kind: 'imports' }
  | { kind: 'moved'; direction: 'in' | 'out'; path: string; line: number };

export interface FileNoise {
  /** Per hunk of the file's patch, in order; null where the hunk needs reading. */
  hunks: Array<HunkNoise | null>;
  /** Every hunk is noise, or the file was renamed without changes. */
  mechanical: boolean;
  /** What the mechanical file holds, e.g. "Moved code"; null when it needs reading. */
  label: string | null;
}

/** A moved block has to be at least this long to count, so `return null;` twice is no move. */
const MIN_MOVED_LINES = 3;
const MIN_MOVED_CHARS = 40;

const IMPORT_LINE =
  /^(import\b|export\s+(\*|\{[^}]*\}|type\s+\{[^}]*\})\s+from\b|using\s+(static\s+)?[\w.]+\s*(=\s*[\w.<>]+\s*)?;|global\s+using\b|use\s+[\w:{}, *]+;|from\s+[\w.]+\s+import\b|#include\b|(const|let|var)\s+[\w${}, ]+\s*=\s*require\()/;
const IMPORT_OPENER = /^(import|export)\b[^;]*\{[^}]*$/;
const IMPORT_CLOSER = /^\}\s*from\s+['"]/;
const IMPORT_MEMBER = /^(type\s+)?[\w$]+(\s+as\s+[\w$]+)?,?$/;

function strip(text: string): string {
  return text.replace(/\s+/g, '');
}

/** Lines that say nothing on their own (`}`, `});`, blank): left out when matching moves. */
function significant(line: string): boolean {
  return /[\w$]/.test(line);
}

function changedLines(hunk: DiffHunk) {
  const added: string[] = [];
  const deleted: string[] = [];
  for (const line of hunk.lines) {
    if (line.type === 'add') added.push(line.content);
    else if (line.type === 'delete') deleted.push(line.content);
  }
  return { added, deleted };
}

function onlyWhitespace(added: string[], deleted: string[]): boolean {
  return strip(added.join('')) === strip(deleted.join(''));
}

/**
 * Every changed line is an import, a blank line, or a member of a multi-line
 * `import { … } from` block. The block is followed through the hunk's
 * context; a hunk that starts inside one finds its `} from` further down.
 */
function onlyImports(hunk: DiffHunk): boolean {
  let inBlock = false;
  let sawChange = false;
  const lines = hunk.lines.filter((l) => l.type !== 'hunk-header');
  const firstOpener = lines.findIndex((l) => IMPORT_OPENER.test(l.content.trim()));
  const firstCloser = lines.findIndex((l) => IMPORT_CLOSER.test(l.content.trim()));
  if (firstCloser >= 0 && (firstOpener < 0 || firstCloser < firstOpener)) inBlock = true;
  for (const line of lines) {
    const text = line.content.trim();
    const changed = line.type === 'add' || line.type === 'delete';
    if (changed && text !== '') {
      sawChange = true;
      const ok =
        IMPORT_LINE.test(text) ||
        IMPORT_OPENER.test(text) ||
        IMPORT_CLOSER.test(text) ||
        (inBlock && IMPORT_MEMBER.test(text));
      if (!ok) return false;
    }
    if (IMPORT_OPENER.test(text)) inBlock = true;
    else if (IMPORT_CLOSER.test(text)) inBlock = false;
  }
  return sawChange;
}

interface Block {
  path: string;
  hunk: number;
  /** Trimmed significant lines, in order. */
  lines: string[];
  /** Each of `lines`' number on its side: the old file for deletions, the new for additions. */
  numbers: number[];
}

function blockOf(path: string, index: number, hunk: DiffHunk, side: 'add' | 'delete'): Block {
  const kept = hunk.lines
    .filter((l) => l.type === side)
    .map((l) => ({
      text: l.content.trim(),
      number: (side === 'add' ? l.newLineNumber : l.oldLineNumber) ?? 0,
    }))
    .filter((l) => significant(l.text));
  return {
    path,
    hunk: index,
    lines: kept.map((l) => l.text),
    numbers: kept.map((l) => l.number),
  };
}

/** `needle` appears in `haystack` as one unbroken run. */
function containsRun(haystack: readonly string[], needle: readonly string[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function bigEnough(block: Block): boolean {
  return block.lines.length >= MIN_MOVED_LINES && block.lines.join('').length >= MIN_MOVED_CHARS;
}

/**
 * Where a one-sided hunk's lines went to or came from: another hunk (in any
 * file) holding all of them, in order, on the other side. Indentation does
 * not count, an edit does. Only the hunk's own lines have to be found: a
 * block pasted into a new class folds where it was cut, while the new file
 * with its new wrapper stays open.
 */
function findMove(block: Block, others: readonly Block[]): { path: string; line: number } | null {
  if (!bigEnough(block)) return null;
  for (const other of others) {
    if (other.path === block.path && other.hunk === block.hunk) continue;
    const at = containsRun(other.lines, block.lines);
    if (at >= 0) return { path: other.path, line: other.numbers[at] ?? 0 };
  }
  return null;
}

function hunksOf(file: DiffFile): DiffHunk[] {
  if (file.hunks?.length) return file.hunks;
  return file.patch ? parsePatch(file.patch) : [];
}

const LABEL: Record<HunkNoise['kind'], string> = {
  whitespace: 'Whitespace only',
  imports: 'Imports only',
  moved: 'Moved code',
};

/**
 * Sorts every hunk of the PR into "needs reading" or one of the kinds of
 * noise. Moves are matched across the whole PR, so a block cut from one file
 * and pasted into another folds on both sides.
 */
export function classifyNoise(files: readonly DiffFile[]): Map<string, FileNoise> {
  const parsed = files.map((file) => ({ file, hunks: hunksOf(file) }));
  const additions: Block[] = [];
  const deletions: Block[] = [];
  for (const { file, hunks } of parsed) {
    hunks.forEach((hunk, i) => {
      const { added, deleted } = changedLines(hunk);
      if (added.length && !deleted.length) additions.push(blockOf(file.filename, i, hunk, 'add'));
      if (deleted.length && !added.length)
        deletions.push(blockOf(file.filename, i, hunk, 'delete'));
    });
  }

  const result = new Map<string, FileNoise>();
  for (const { file, hunks } of parsed) {
    const noise = hunks.map((hunk, i): HunkNoise | null => {
      const { added, deleted } = changedLines(hunk);
      if (!added.length && !deleted.length) return null;
      if (onlyWhitespace(added, deleted)) return { kind: 'whitespace' };
      if (onlyImports(hunk)) return { kind: 'imports' };
      if (deleted.length === 0) {
        const from = findMove(blockOf(file.filename, i, hunk, 'add'), deletions);
        if (from) return { kind: 'moved', direction: 'in', path: from.path, line: from.line };
      }
      if (added.length === 0) {
        const to = findMove(blockOf(file.filename, i, hunk, 'delete'), additions);
        if (to) return { kind: 'moved', direction: 'out', path: to.path, line: to.line };
      }
      return null;
    });
    const renamedOnly = file.status === 'renamed' && hunks.length === 0 && !file.isTruncated;
    const mechanical = renamedOnly || (noise.length > 0 && noise.every(Boolean));
    const kinds = new Set(noise.map((n) => n?.kind));
    const label = !mechanical
      ? null
      : renamedOnly
        ? 'Renamed only'
        : kinds.size === 1
          ? LABEL[noise[0]!.kind]
          : 'Mechanical changes';
    result.set(file.filename, { hunks: noise, mechanical, label });
  }
  return result;
}

/** The fold line's words: "Moved from Foo.ts:42", "Whitespace only". */
export function describeNoise(noise: HunkNoise): string {
  if (noise.kind !== 'moved') return LABEL[noise.kind];
  const name = noise.path.split('/').pop() ?? noise.path;
  return `Moved ${noise.direction === 'in' ? 'from' : 'to'} ${name}:${noise.line}`;
}
