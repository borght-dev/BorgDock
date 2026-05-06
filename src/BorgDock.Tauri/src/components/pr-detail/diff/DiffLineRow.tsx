import type { DiffLine, HighlightSpan, InlineChange } from '@/types';
import { DiffLineContent } from './DiffLineContent';

interface DiffLineRowProps {
  line: DiffLine;
  inlineChanges?: InlineChange[];
  syntaxSpans?: HighlightSpan[];
}

/**
 * Single unified-diff row. Extracted from UnifiedDiffView so thread-anchor
 * rendering (DiffFileSection / InlineThread, Task 19/20) can pass thread props
 * through a stable surface.
 */
export function DiffLineRow({ line, inlineChanges, syntaxSpans }: DiffLineRowProps) {
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
    <tr data-line-kind={lineKind} style={{ backgroundColor: bgColor }}>
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
      </td>
    </tr>
  );
}
