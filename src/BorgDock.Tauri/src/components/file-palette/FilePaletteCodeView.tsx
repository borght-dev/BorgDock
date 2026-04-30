import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  getHighlightClass,
  highlightLines as runHighlighter,
} from '@/services/syntax-highlighter';
import type { HighlightSpan } from '@/types';

// Must match the `line-height` on `.code-view` in file-palette.css (see
// var(--code-line-height) fallback). scrollToLine relies on this.
const LINE_HEIGHT_PX = 20;

export interface FindMatch { line: number; col: number; length: number }

export function scanFindMatches(content: string, term: string): FindMatch[] {
  if (!term) return [];
  const out: FindMatch[] = [];
  const lower = term.toLowerCase();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const hay = lines[i]!.toLowerCase();
    let from = 0;
    while (from < hay.length) {
      const idx = hay.indexOf(lower, from);
      if (idx < 0) break;
      out.push({ line: i + 1, col: idx, length: term.length });
      from = idx + Math.max(1, term.length);
    }
  }
  return out;
}

export interface CodeViewProps {
  path: string;
  content: string;
  scrollToLine?: number;
  highlightedLines?: number[];
  onIdentifierJump?: (word: string) => void;
  findMatches?: FindMatch[];
  /** Index into `findMatches` indicating the active match (for emphasis). */
  findCurrent?: number;
}

export function FilePaletteCodeView({
  path,
  content,
  scrollToLine,
  highlightedLines,
  onIdentifierJump,
  findMatches,
  findCurrent,
}: CodeViewProps) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [spans, setSpans] = useState<Map<number, HighlightSpan[]> | null>(null);
  const hitSet = useMemo(() => new Set(highlightedLines ?? []), [highlightedLines]);

  const findByLine = useMemo(() => {
    const map = new Map<number, Array<FindMatch & { _idx: number }>>();
    (findMatches ?? []).forEach((m, _idx) => {
      const list = map.get(m.line) ?? [];
      list.push({ ...m, _idx });
      map.set(m.line, list);
    });
    return map;
  }, [findMatches]);

  // Load syntax highlighting asynchronously.
  useEffect(() => {
    let cancelled = false;
    runHighlighter(path, lines).then((result) => {
      if (!cancelled) setSpans(result);
    });
    return () => {
      cancelled = true;
    };
  }, [path, lines]);

  // Scroll to a specific line.
  useEffect(() => {
    // TODO: scrollToLine only re-fires on prop change. Setting the same line
    // value twice (e.g., user re-clicks the current row) will not re-scroll.
    if (!scrollToLine || !rootRef.current) return;
    const target = (scrollToLine - 1) * LINE_HEIGHT_PX - rootRef.current.clientHeight / 3;
    rootRef.current.scrollTop = Math.max(0, target);
  }, [scrollToLine]);

  const copyAll = useCallback(() => {
    navigator.clipboard.writeText(content).catch(() => {
      /* ignore */
    });
  }, [content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        copyAll();
        return;
      }
      if (e.key === 'F12' && onIdentifierJump) {
        const word = wordFromSelectionOrCaret();
        if (word) {
          e.preventDefault();
          onIdentifierJump(word);
        }
      }
    },
    [copyAll, onIdentifierJump],
  );

  return (
    <div
      ref={rootRef}
      className="bd-code-view"
      data-testid="code-view-root"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {lines.map((text, i) => {
        const lineNo = i + 1;
        const isHit = hitSet.has(lineNo);
        return (
          <div
            key={lineNo}
            data-testid="code-line-row"
            className={clsx('bd-code-line-row', isHit && 'bd-code-line-row--hit')}
          >
            <span data-line-gutter className="bd-code-line-gutter">
              <span data-line-number data-testid="code-line-number" className="bd-code-line-number">
                {lineNo}
              </span>
            </span>
            <span className="bd-code-line-text" data-testid="code-line-text">
              {renderLine(
                text,
                spans?.get(i) ?? null,
                findByLine.get(lineNo) ?? [],
                findCurrent ?? -1,
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function renderLine(
  text: string,
  spans: HighlightSpan[] | null,
  matches: Array<FindMatch & { _idx: number }>,
  current: number,
): React.ReactNode {
  // Build a flat list of atoms (text spans with optional syntax styling).
  // If no syntax spans, the whole line is one atom.
  type Atom = { start: number; end: number; renderText: (slice: string) => React.ReactNode };
  const atoms: Atom[] = [];
  if (!spans || spans.length === 0) {
    atoms.push({ start: 0, end: text.length, renderText: (s) => s });
  } else {
    let cursor = 0;
    spans.forEach((span, idx) => {
      if (span.start > cursor) {
        atoms.push({ start: cursor, end: span.start, renderText: (s) => s });
      }
      atoms.push({
        start: span.start,
        end: span.end,
        renderText: (s) => (
          <span
            key={`syn-${idx}`}
            className={`hl-${span.category}`}
            style={{ color: `var(${getHighlightClass(span.category)})` }}
          >
            {s}
          </span>
        ),
      });
      cursor = span.end;
    });
    if (cursor < text.length) atoms.push({ start: cursor, end: text.length, renderText: (s) => s });
  }
  const sortedMatches = [...matches].sort((a, b) => a.col - b.col);

  // Walk each atom, splicing in find-match wrappers where matches overlap.
  const out: React.ReactNode[] = [];
  let key = 0;
  for (const atom of atoms) {
    let pos = atom.start;
    while (pos < atom.end) {
      const overlap = sortedMatches.find((m) => m.col + m.length > pos && m.col < atom.end);
      if (!overlap || overlap.col >= atom.end) {
        out.push(<span key={key++}>{atom.renderText(text.slice(pos, atom.end))}</span>);
        pos = atom.end;
        break;
      }
      const matchStart = Math.max(pos, overlap.col);
      const matchEnd = Math.min(atom.end, overlap.col + overlap.length);
      if (matchStart > pos) {
        out.push(<span key={key++}>{atom.renderText(text.slice(pos, matchStart))}</span>);
      }
      const isCurrent = overlap._idx === current;
      out.push(
        <span
          key={key++}
          className={`bd-fp-find-match${isCurrent ? ' bd-fp-find-match--current' : ''}`}
        >
          {atom.renderText(text.slice(matchStart, matchEnd))}
        </span>,
      );
      pos = matchEnd;
      if (overlap.col + overlap.length <= pos) {
        sortedMatches.splice(sortedMatches.indexOf(overlap), 1);
      }
    }
  }
  return text === '' ? ' ' : out;
}

function wordFromSelectionOrCaret(): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const text = sel.toString().trim();
  if (text) {
    // If the selection is a single identifier, return it directly; otherwise
    // return the raw selection text (callers decide how to interpret multi-word
    // selections — the test expects the selected content to flow through).
    const single = text.match(/^[A-Za-z_][A-Za-z0-9_]*$/);
    return single ? single[0] : text;
  }
  // No explicit selection — fall back to the caret's parent text node.
  const node = sel.focusNode;
  const offset = sel.focusOffset;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const raw = node.textContent ?? '';
  if (!raw) return null;
  const left = raw.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_]*$/);
  const right = raw.slice(offset).match(/^[A-Za-z_][A-Za-z0-9_]*/);
  const word = (left?.[0] ?? '') + (right?.[0] ?? '');
  return word || null;
}
