import type { DiffFile, DiffHunk } from '@/types';

/** A changed file Quick Review can draw as the page it is, not only as a diff. */
export type RenderKind = 'markdown' | 'html' | 'svg';

export function renderKindOf(path: string): RenderKind | null {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'html' || extension === 'htm') return 'html';
  if (extension === 'svg') return 'svg';
  return null;
}

/** A removed file has no page at the head commit to draw. */
export function canRender(file: Pick<DiffFile, 'filename' | 'status'>): RenderKind | null {
  return file.status === 'removed' ? null : renderKindOf(file.filename);
}

/**
 * `reference` as a path in the repository, read from the file at `from`.
 * Null for an address outside the repository: another site, a data URL, an
 * anchor, or a path that climbs above the root.
 */
export function resolveRepoPath(from: string, reference: string): string | null {
  const target = reference.trim().split(/[?#]/)[0] ?? '';
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;
  const base = target.startsWith('/') ? [] : from.split('/').slice(0, -1);
  const segments = [...base];
  for (const raw of target.split('/')) {
    if (!raw || raw === '.') continue;
    if (raw === '..') {
      if (!segments.length) return null;
      segments.pop();
      continue;
    }
    try {
      segments.push(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
  return segments.length ? segments.join('/') : null;
}

/** Lines a change took out, and the new-side line they stood before. */
export interface RemovedRun {
  before: number;
  lines: string[];
  /** The new lines of the same change: what may have taken their place. */
  addedLines: number[];
}

export interface PatchLines {
  /** New-side numbers of the added lines. */
  added: Set<number>;
  removed: RemovedRun[];
}

/** What a diff did, by line of the file as it is now. */
export function patchLines(hunks: readonly DiffHunk[]): PatchLines {
  const added = new Set<number>();
  const removed: RemovedRun[] = [];
  for (const hunk of hunks) {
    let next = hunk.newStart;
    let run: RemovedRun | null = null;
    const close = () => {
      if (run?.lines.length) removed.push(run);
      run = null;
    };
    for (const line of hunk.lines) {
      if (line.type === 'hunk-header') continue;
      if (line.type === 'context') {
        close();
        next = (line.newLineNumber ?? next) + 1;
        continue;
      }
      run ??= { before: next, lines: [], addedLines: [] };
      if (line.type === 'delete') {
        run.lines.push(line.content);
        continue;
      }
      const number = line.newLineNumber ?? next;
      added.add(number);
      run.addedLines.push(number);
      next = number + 1;
    }
    close();
  }
  return { added, removed };
}

/** A top-level block of the document, by its first and last line. */
export interface SourceBlock {
  from: number;
  to: number;
}

export interface BlockMark {
  change: 'added' | 'changed';
  /** The line a comment on the block goes to: its last added line. */
  commentLine: number | null;
}

/** Removed text that left no block behind: drawn as a marker before `beforeBlock`. */
export interface RemovedGap {
  beforeBlock: number;
  lines: string[];
  title: string;
}

export interface ChangePlan {
  marks: Map<number, BlockMark>;
  gaps: RemovedGap[];
}

function gapTitle(lines: readonly string[]): string {
  const heading = lines
    .map((line) => /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1])
    .find(Boolean);
  const text = heading ?? lines.find((line) => line.trim()) ?? '';
  const plain = text
    .replace(/^\s*(?:[-*+>]|\d+[.)])\s+/, '')
    .replace(/[*_`~]/g, '')
    .trim();
  return plain.length > 60 ? `${plain.slice(0, 59).trimEnd()}…` : plain;
}

/** Removed lines as paragraphs: runs of written lines, the blank ones between them dropped. */
function paragraphs(lines: readonly string[]): string[][] {
  const found: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim()) {
      current.push(line);
      continue;
    }
    if (current.length) found.push(current);
    current = [];
  }
  if (current.length) found.push(current);
  return found;
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

/** How much of two texts' vocabulary is shared, from 0 to 1. */
function likeness(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Below this a new block did not come from the removed text: it replaced it. */
const REWRITE_LIKENESS = 0.25;

/**
 * Which blocks a diff touched and where text vanished. A block whose every
 * line is new is `added`; one with some new lines, or with lines taken out of
 * it, is `changed`. A removed paragraph counts as rewritten into the new
 * block that reads most like it; removed text nothing reads like gets a gap
 * where it stood.
 */
export function planChanges(
  source: string,
  blocks: readonly SourceBlock[],
  patch: PatchLines,
): ChangePlan {
  const lines = source.split('\n');
  const edited = new Set<number>();
  const gaps: RemovedGap[] = [];
  const gap = (beforeBlock: number, removed: string[]) => {
    const kept = [...removed];
    while (kept.length && !kept[kept.length - 1]!.trim()) kept.pop();
    while (kept.length && !kept[0]!.trim()) kept.shift();
    if (kept.length)
      gaps.push({
        beforeBlock: beforeBlock < 0 ? blocks.length : beforeBlock,
        lines: kept,
        title: gapTitle(kept),
      });
  };
  for (const run of patch.removed) {
    if (!run.addedLines.length) {
      const inside = blocks.findIndex((block) => block.from < run.before && run.before <= block.to);
      if (inside >= 0) edited.add(inside);
      else
        gap(
          blocks.findIndex((block) => block.from >= run.before),
          run.lines,
        );
      continue;
    }
    const fresh = new Set(run.addedLines);
    const candidates = blocks
      .map((block, index) => {
        const text: string[] = [];
        for (let number = block.from; number <= block.to; number++)
          if (fresh.has(number)) text.push(lines[number - 1] ?? '');
        return { index, text: text.join('\n') };
      })
      .filter((candidate) => candidate.text.trim());
    const lost: string[] = [];
    for (const paragraph of paragraphs(run.lines)) {
      const text = paragraph.join('\n');
      let best = { index: -1, score: 0 };
      for (const candidate of candidates) {
        const score = likeness(text, candidate.text);
        if (score > best.score) best = { index: candidate.index, score };
      }
      if (best.score >= REWRITE_LIKENESS) edited.add(best.index);
      else lost.push(...paragraph, '');
    }
    gap(
      blocks.findIndex((block) => block.to >= run.before),
      lost,
    );
  }
  const marks = new Map<number, BlockMark>();
  blocks.forEach((block, index) => {
    let commentLine: number | null = null;
    let written = 0;
    let fresh = 0;
    for (let number = block.from; number <= block.to; number++) {
      const isAdded = patch.added.has(number);
      if (isAdded) commentLine = number;
      if (!(lines[number - 1] ?? '').trim()) continue;
      written += 1;
      if (isAdded) fresh += 1;
    }
    if (commentLine === null && !edited.has(index)) return;
    const allNew = written > 0 && fresh === written && !edited.has(index);
    marks.set(index, { change: allNew ? 'added' : 'changed', commentLine });
  });
  return { marks, gaps };
}

/**
 * Front matter (`---` … `---` at the top) as a fenced YAML block. Markdown
 * would draw it as a rule and a heading. The line count stays the same, so
 * the diff's line numbers still fit.
 */
export function withFencedFrontMatter(source: string): string {
  const lines = source.split('\n');
  if (lines[0]?.trimEnd() !== '---') return source;
  const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
  if (end < 0) return source;
  lines[0] = '```yaml';
  lines[end] = '```';
  return lines.join('\n');
}

/** The data attributes the marks travel in; the sanitizer has to let them through. */
export const CHANGE_MARK_ATTRIBUTES = [
  'dataRenderedChange',
  'dataRenderedLines',
  'dataRenderedComment',
  'dataRenderedRemoved',
  'dataRenderedRow',
] as const;

export interface MarkdownNode {
  type: string;
  position?: { start: { line: number }; end: { line: number } };
  children?: MarkdownNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

/** Nodes that draw nothing where they stand: a mark around them would be an empty box. */
const INVISIBLE = new Set(['definition', 'footnoteDefinition']);

function rowChange(node: MarkdownNode, source: string[], added: Set<number>): string | null {
  if (!node.position) return null;
  let written = 0;
  let fresh = 0;
  for (let number = node.position.start.line; number <= node.position.end.line; number++) {
    if (!(source[number - 1] ?? '').trim()) continue;
    written += 1;
    if (added.has(number)) fresh += 1;
  }
  if (!fresh) return null;
  return fresh === written ? 'added' : 'changed';
}

/**
 * Remark plugin: wraps every block the diff touched in a `div` carrying the
 * change, its lines and where a comment goes, puts a `div` where text was
 * removed, and marks the rows of a changed list or table that are new.
 * `RenderedMarkdown` draws those `div`s.
 */
export function remarkChangeMarks(options: { source: string; patch: PatchLines }) {
  return (tree: MarkdownNode) => {
    const children = tree.children ?? [];
    const placed = children.filter((node) => node.position && !INVISIBLE.has(node.type));
    const blocks = placed.map((node) => ({
      from: node.position!.start.line,
      to: node.position!.end.line,
    }));
    const plan = planChanges(options.source, blocks, options.patch);
    if (!plan.marks.size && !plan.gaps.length) return;
    const source = options.source.split('\n');
    const gapNode = (gap: RemovedGap): MarkdownNode => ({
      type: 'renderedRemoved',
      data: {
        hName: 'div',
        hProperties: {
          dataRenderedRemoved: JSON.stringify({ title: gap.title, lines: gap.lines }),
        },
      },
      children: [],
    });
    const out: MarkdownNode[] = [];
    let index = 0;
    for (const node of children) {
      if (!placed.includes(node)) {
        out.push(node);
        continue;
      }
      for (const gap of plan.gaps) if (gap.beforeBlock === index) out.push(gapNode(gap));
      const mark = plan.marks.get(index);
      const block = blocks[index]!;
      index += 1;
      if (!mark) {
        out.push(node);
        continue;
      }
      if (mark.change === 'changed' && (node.type === 'list' || node.type === 'table')) {
        for (const row of node.children ?? []) {
          const change = rowChange(row, source, options.patch.added);
          if (change)
            row.data = {
              ...row.data,
              hProperties: { ...row.data?.hProperties, dataRenderedRow: change },
            };
        }
      }
      out.push({
        type: 'renderedChange',
        data: {
          hName: 'div',
          hProperties: {
            dataRenderedChange: mark.change,
            dataRenderedLines: `${block.from}-${block.to}`,
            ...(mark.commentLine ? { dataRenderedComment: String(mark.commentLine) } : {}),
          },
        },
        children: [node],
      });
    }
    for (const gap of plan.gaps) if (gap.beforeBlock === blocks.length) out.push(gapNode(gap));
    tree.children = out;
  };
}

/** What a removed-text marker carries, read back from its attribute. */
export function readRemovedMark(value: unknown): { title: string; lines: string[] } | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as { title?: unknown; lines?: unknown };
    if (!Array.isArray(parsed.lines) || !parsed.lines.every((line) => typeof line === 'string'))
      return null;
    return { title: typeof parsed.title === 'string' ? parsed.title : '', lines: parsed.lines };
  } catch {
    return null;
  }
}

/**
 * Whether the rendered page shows `draft` on one of its blocks: a comment on
 * a written line the diff added. The others (old-side lines, context lines)
 * are listed under the page.
 */
export function draftOnRenderedBlock(
  draft: { line: number; side: 'LEFT' | 'RIGHT' },
  source: string,
  patch: PatchLines,
): boolean {
  if (draft.side !== 'RIGHT' || !patch.added.has(draft.line)) return false;
  return !!(source.split('\n')[draft.line - 1] ?? '').trim();
}
