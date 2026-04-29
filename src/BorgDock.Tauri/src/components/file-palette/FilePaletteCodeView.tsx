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

export interface CodeViewProps {
  path: string;
  content: string;
  scrollToLine?: number;
  highlightedLines?: number[];
  onIdentifierJump?: (word: string) => void;
}

export function FilePaletteCodeView({
  path,
  content,
  scrollToLine,
  highlightedLines,
  onIdentifierJump,
}: CodeViewProps) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [spans, setSpans] = useState<Map<number, HighlightSpan[]> | null>(null);
  const hitSet = useMemo(() => new Set(highlightedLines ?? []), [highlightedLines]);

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
              {renderLine(text, spans?.get(i) ?? null)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function renderLine(text: string, spans: HighlightSpan[] | null) {
  if (!spans || spans.length === 0) return text === '' ? ' ' : text;
  const out: Array<string | React.ReactNode> = [];
  let cursor = 0;
  spans.forEach((span, idx) => {
    if (span.start > cursor) out.push(text.slice(cursor, span.start));
    out.push(
      // style: syntax-highlight category-driven CSS variable name — token name varies per span.category
      <span
        key={idx}
        className={`hl-${span.category}`}
        style={{ color: `var(${getHighlightClass(span.category)})` }}
      >
        {text.slice(span.start, span.end)}
      </span>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
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
