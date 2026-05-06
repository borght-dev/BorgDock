import type { DiffLine, HighlightSpan, InlineChange } from '@/types';
import { DiffLineContent } from './DiffLineContent';

interface DiffLineRowProps {
  line: DiffLine;
  inlineChanges?: InlineChange[];
  syntaxSpans?: HighlightSpan[];
  /** When true: row is clickable, chip rendered. */
  hasThread?: boolean;
  /** Number of comments in the thread (renders inside the chip when not open). */
  threadCount?: number;
  /** When true the chip shows "hide" and the row indicates expansion. */
  threadOpen?: boolean;
  /** Click handler for both the row and the chip. */
  onToggleThread?: () => void;
  /** Yellow-highlight treatment for the jump-target line. */
  highlight?: boolean;
}

/**
 * Single unified-diff row. Extracted from UnifiedDiffView so thread-anchor
 * rendering (DiffFileSection / InlineThread, Task 19/20) can pass thread props
 * through a stable surface.
 */
export function DiffLineRow({
  line,
  inlineChanges,
  syntaxSpans,
  hasThread,
  threadCount,
  threadOpen,
  onToggleThread,
  highlight,
}: DiffLineRowProps) {
  if (line.type === 'hunk-header') {
    return (
      <tr
        data-hunk-header=""
        // style: hunk-header bg token + 28px height for diff row alignment
        style={{ backgroundColor: 'var(--color-diff-hunk-header-bg)' }}
      >
        <td
          colSpan={3}
          className="px-2 text-[11px] text-[var(--color-diff-hunk-header-text)] select-none"
          style={{ height: '28px' }}
        >
          {line.content}
        </td>
      </tr>
    );
  }

  const bgColor =
    line.type === 'add'
      ? 'var(--color-diff-added-bg)'
      : line.type === 'delete'
        ? 'var(--color-diff-deleted-bg)'
        : 'var(--color-diff-context-bg)';
  const gutterBg =
    line.type === 'add'
      ? 'var(--color-diff-added-gutter-bg)'
      : line.type === 'delete'
        ? 'var(--color-diff-deleted-gutter-bg)'
        : 'transparent';
  const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
  const lineKind: 'add' | 'del' | 'context' =
    line.type === 'add' ? 'add' : line.type === 'delete' ? 'del' : 'context';

  return (
    <tr
      data-line-kind={lineKind}
      onClick={hasThread ? onToggleThread : undefined}
      style={{
        backgroundColor: highlight ? 'var(--color-warning-badge-bg)' : bgColor,
        cursor: hasThread ? 'pointer' : undefined,
        boxShadow: highlight ? 'inset 3px 0 0 var(--color-status-yellow)' : undefined,
      }}
    >
      <td
        className="select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)]"
        style={{ backgroundColor: gutterBg, userSelect: 'none' }}
      >
        {line.oldLineNumber ?? ''}
      </td>
      <td
        className="select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)]"
        style={{ backgroundColor: gutterBg, userSelect: 'none' }}
      >
        {line.newLineNumber ?? ''}
      </td>
      <td className="pl-2 whitespace-pre overflow-x-auto">
        <span className="select-none text-[var(--color-diff-line-number)] mr-1">{prefix}</span>
        <DiffLineContent
          content={line.content}
          inlineChanges={inlineChanges}
          syntaxSpans={syntaxSpans}
        />
        {hasThread && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleThread?.();
            }}
            className="ml-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-subtle)] px-2 py-[1px] text-[10px] font-semibold text-[var(--color-accent)]"
            aria-label={threadOpen ? 'Hide thread' : `${threadCount ?? 1} comment${threadCount === 1 ? '' : 's'}`}
            data-thread-chip
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 4h10v6H7l-3 3v-3H3z" />
            </svg>
            {threadOpen ? 'hide' : (threadCount ?? 1)}
          </button>
        )}
      </td>
    </tr>
  );
}
