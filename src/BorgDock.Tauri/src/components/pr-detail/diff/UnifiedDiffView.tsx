import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import { computeInlineChanges, findLinePairs } from '@/services/diff-parser';
import type { DiffHunk, DiffLine, HighlightSpan, InlineChange } from '@/types';
import { DiffLineContent } from './DiffLineContent';

const VIRTUALIZE_THRESHOLD = 500;

interface UnifiedDiffViewProps {
  hunks: DiffHunk[];
  syntaxHighlights?: Map<number, HighlightSpan[]> | null;
}

export function UnifiedDiffView({ hunks, syntaxHighlights }: UnifiedDiffViewProps) {
  const allLines = useMemo(() => hunks.flatMap((h) => h.lines), [hunks]);

  const inlineMap = useMemo(() => {
    const pairs = findLinePairs(allLines);
    const map = new Map<number, { deleted: InlineChange[]; added: InlineChange[] }>();

    for (const [delIdx, addIdx] of pairs) {
      const delLine = allLines[delIdx]!;
      const addLine = allLines[addIdx]!;
      const result = computeInlineChanges(delLine.content, addLine.content);
      if (result) {
        map.set(delIdx, result);
        map.set(addIdx, result);
      }
    }
    return map;
  }, [allLines]);

  if (allLines.length > VIRTUALIZE_THRESHOLD) {
    return (
      <VirtualUnifiedDiff
        allLines={allLines}
        inlineMap={inlineMap}
        syntaxHighlights={syntaxHighlights}
      />
    );
  }

  return (
    <table
      className="w-full border-collapse"
      // style: var(--font-code) custom property + exact pixel fontSize/lineHeight for diff alignment
      style={{ fontFamily: 'var(--font-code)', fontSize: '13px', lineHeight: '20px' }}
    >
      <colgroup>
        {/* style: exact gutter pixel widths — diff layout requires precise col sizing */}
        <col style={{ width: '44px' }} />
        <col style={{ width: '44px' }} />
        <col />
      </colgroup>
      <tbody>
        {allLines.map((line, i) => {
          if (line.type === 'hunk-header') {
            // style: hunk-header bg token + exact 28px height for diff row alignment
            return (
              <tr
                key={i}
                data-hunk-header=""
                style={{ backgroundColor: 'var(--color-diff-hunk-header-bg)' }}
              >
                <td
                  colSpan={3}
                  className="px-2 text-[11px] text-[var(--color-diff-hunk-header-text)] select-none"
                  // style: exact 28px height matches diff line height for visual alignment
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

          const inlineData = inlineMap.get(i);
          const inlineChanges: InlineChange[] | undefined = inlineData
            ? line.type === 'delete'
              ? inlineData.deleted
              : line.type === 'add'
                ? inlineData.added
                : undefined
            : undefined;

          const syntaxSpans = syntaxHighlights?.get(i);

          const lineKind: 'add' | 'del' | 'context' =
            line.type === 'add' ? 'add' : line.type === 'delete' ? 'del' : 'context';

          return (
            // style: line-type-driven bg color (add/delete/context) — computed per line
            <tr key={i} data-line-kind={lineKind} style={{ backgroundColor: bgColor }}>
              <td
                className="select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)]"
                // style: line-type-driven gutter bg + userSelect CSS property with no Tailwind equivalent
                style={{ backgroundColor: gutterBg, userSelect: 'none' }}
              >
                {line.oldLineNumber ?? ''}
              </td>
              <td
                className="select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)]"
                // style: line-type-driven gutter bg + userSelect CSS property with no Tailwind equivalent
                style={{ backgroundColor: gutterBg, userSelect: 'none' }}
              >
                {line.newLineNumber ?? ''}
              </td>
              <td className="pl-2 whitespace-pre overflow-x-auto">
                <span className="select-none text-[var(--color-diff-line-number)] mr-1">
                  {prefix}
                </span>
                <DiffLineContent
                  content={line.content}
                  inlineChanges={inlineChanges}
                  syntaxSpans={syntaxSpans}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function VirtualUnifiedDiff({
  allLines,
  inlineMap,
  syntaxHighlights,
}: {
  allLines: DiffLine[];
  inlineMap: Map<number, { deleted: InlineChange[]; added: InlineChange[] }>;
  syntaxHighlights?: Map<number, HighlightSpan[]> | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: allLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    overscan: 30,
  });

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      // style: var(--font-code) custom property + exact pixel fontSize/lineHeight for diff alignment
      style={{ fontFamily: 'var(--font-code)', fontSize: '13px', lineHeight: '20px' }}
    >
      {/* style: virtualizer total height computed per render */}
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const i = virtualRow.index;
          const line = allLines[i]!;

          if (line.type === 'hunk-header') {
            return (
              <div
                key={i}
                data-index={i}
                data-hunk-header=""
                ref={virtualizer.measureElement}
                // style: virtualizer absolute positioning + translateY offset computed per row
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className="flex"
                  // style: hunk-header bg token + exact 28px height for diff row alignment
                  style={{ backgroundColor: 'var(--color-diff-hunk-header-bg)', height: '28px' }}
                >
                  <div className="px-2 text-[11px] text-[var(--color-diff-hunk-header-text)] select-none leading-[28px]">
                    {line.content}
                  </div>
                </div>
              </div>
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
          const inlineData = inlineMap.get(i);
          const inlineChanges = inlineData
            ? line.type === 'delete'
              ? inlineData.deleted
              : line.type === 'add'
                ? inlineData.added
                : undefined
            : undefined;
          const syntaxSpans = syntaxHighlights?.get(i);

          const lineKind: 'add' | 'del' | 'context' =
            line.type === 'add' ? 'add' : line.type === 'delete' ? 'del' : 'context';

          return (
            <div
              key={i}
              data-index={i}
              data-line-kind={lineKind}
              ref={virtualizer.measureElement}
              // style: virtualizer absolute positioning + line-type-driven bg — both computed per row
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                backgroundColor: bgColor,
              }}
            >
              <div className="flex">
                <div
                  className="w-[44px] shrink-0 select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)]"
                  // style: line-type-driven gutter bg — computed per line
                  style={{ backgroundColor: gutterBg }}
                >
                  {line.oldLineNumber ?? ''}
                </div>
                <div
                  className="w-[44px] shrink-0 select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)]"
                  // style: line-type-driven gutter bg — computed per line
                  style={{ backgroundColor: gutterBg }}
                >
                  {line.newLineNumber ?? ''}
                </div>
                <div className="pl-2 whitespace-pre overflow-x-auto flex-1">
                  <span className="select-none text-[var(--color-diff-line-number)] mr-1">
                    {prefix}
                  </span>
                  <DiffLineContent
                    content={line.content}
                    inlineChanges={inlineChanges}
                    syntaxSpans={syntaxSpans}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
