import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import type { DiffHunk, DiffLine, HighlightSpan, InlineChange } from '@/types';
import { computeInlineChanges, findLinePairs } from '@/services/diff-parser';
import { DiffLineContent } from './DiffLineContent';

const VIRTUALIZE_THRESHOLD = 500;

interface SplitDiffViewProps {
  hunks: DiffHunk[];
  syntaxHighlights?: Map<number, HighlightSpan[]> | null;
}

interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
  isHunkHeader?: boolean;
  hunkContent?: string;
  leftInline?: InlineChange[];
  rightInline?: InlineChange[];
  leftOrigIdx?: number;
  rightOrigIdx?: number;
}

export function SplitDiffView({ hunks, syntaxHighlights }: SplitDiffViewProps) {
  const rows = useMemo(() => buildSplitRows(hunks), [hunks]);

  if (rows.length > VIRTUALIZE_THRESHOLD) {
    return <VirtualSplitDiff rows={rows} syntaxHighlights={syntaxHighlights} />;
  }

  return (
    <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-code)', fontSize: '13px', lineHeight: '20px' }}>
      <colgroup>
        <col style={{ width: '40px' }} />
        <col style={{ width: '50%' }} />
        <col style={{ width: '40px' }} />
        <col style={{ width: '50%' }} />
      </colgroup>
      <tbody>
        {rows.map((row, i) => {
          if (row.isHunkHeader) {
            return (
              <tr key={i} style={{ backgroundColor: 'var(--color-diff-hunk-header-bg)' }}>
                <td colSpan={4} className="px-2 text-[11px] text-[var(--color-diff-hunk-header-text)] select-none" style={{ height: '28px' }}>
                  {row.hunkContent}
                </td>
              </tr>
            );
          }

          const leftBg = row.left
            ? row.left.type === 'delete'
              ? 'var(--color-diff-deleted-bg)'
              : row.left.type === 'context'
                ? 'var(--color-diff-context-bg)'
                : 'transparent'
            : 'var(--color-diff-context-bg)';

          const rightBg = row.right
            ? row.right.type === 'add'
              ? 'var(--color-diff-added-bg)'
              : row.right.type === 'context'
                ? 'var(--color-diff-context-bg)'
                : 'transparent'
            : 'var(--color-diff-context-bg)';

          const leftGutterBg = row.left?.type === 'delete' ? 'var(--color-diff-deleted-gutter-bg)' : 'transparent';
          const rightGutterBg = row.right?.type === 'add' ? 'var(--color-diff-added-gutter-bg)' : 'transparent';

          return (
            <tr key={i}>
              {/* Left side */}
              <td
                className="select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)] border-r border-[var(--color-diff-border)]"
                style={{ backgroundColor: leftGutterBg, userSelect: 'none' }}
              >
                {row.left?.oldLineNumber ?? ''}
              </td>
              <td
                className="pl-2 whitespace-pre overflow-x-auto border-r border-[var(--color-diff-border)]"
                style={{ backgroundColor: leftBg }}
              >
                {row.left && (
                  <DiffLineContent
                    content={row.left.content}
                    inlineChanges={row.leftInline}
                    syntaxSpans={row.leftOrigIdx !== undefined ? syntaxHighlights?.get(row.leftOrigIdx) : undefined}
                  />
                )}
              </td>
              {/* Right side */}
              <td
                className="select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)] border-r border-[var(--color-diff-border)]"
                style={{ backgroundColor: rightGutterBg, userSelect: 'none' }}
              >
                {row.right?.newLineNumber ?? ''}
              </td>
              <td
                className="pl-2 whitespace-pre overflow-x-auto"
                style={{ backgroundColor: rightBg }}
              >
                {row.right && (
                  <DiffLineContent
                    content={row.right.content}
                    inlineChanges={row.rightInline}
                    syntaxSpans={row.rightOrigIdx !== undefined ? syntaxHighlights?.get(row.rightOrigIdx) : undefined}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function buildSplitRows(hunks: DiffHunk[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let globalOffset = 0;

  for (const hunk of hunks) {
    const lines = hunk.lines;
    const pairs = findLinePairs(lines);

    const inlineCache = new Map<number, { deleted: InlineChange[]; added: InlineChange[] }>();
    for (const [delIdx, addIdx] of pairs) {
      const result = computeInlineChanges(lines[delIdx]!.content, lines[addIdx]!.content);
      if (result) {
        inlineCache.set(delIdx, result);
        inlineCache.set(addIdx, result);
      }
    }

    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;

      if (line.type === 'hunk-header') {
        rows.push({ left: null, right: null, isHunkHeader: true, hunkContent: line.content });
        i++;
        continue;
      }

      if (line.type === 'context') {
        const orig = globalOffset + i;
        rows.push({ left: line, right: line, leftOrigIdx: orig, rightOrigIdx: orig });
        i++;
        continue;
      }

      if (line.type === 'delete') {
        const deletes: number[] = [];
        while (i < lines.length && lines[i]!.type === 'delete') {
          deletes.push(i);
          i++;
        }
        const adds: number[] = [];
        while (i < lines.length && lines[i]!.type === 'add') {
          adds.push(i);
          i++;
        }

        const maxLen = Math.max(deletes.length, adds.length);
        for (let j = 0; j < maxLen; j++) {
          const delIdx = j < deletes.length ? deletes[j]! : undefined;
          const addIdx = j < adds.length ? adds[j]! : undefined;
          const delLine = delIdx !== undefined ? (lines[delIdx] ?? null) : null;
          const addLine = addIdx !== undefined ? (lines[addIdx] ?? null) : null;

          const delInline = delIdx !== undefined ? inlineCache.get(delIdx) : undefined;
          const addInline = addIdx !== undefined ? inlineCache.get(addIdx) : undefined;

          rows.push({
            left: delLine,
            right: addLine,
            leftInline: delInline?.deleted,
            rightInline: addInline?.added,
            leftOrigIdx: delIdx !== undefined ? globalOffset + delIdx : undefined,
            rightOrigIdx: addIdx !== undefined ? globalOffset + addIdx : undefined,
          });
        }
        continue;
      }

      if (line.type === 'add') {
        rows.push({
          left: null,
          right: line,
          rightInline: inlineCache.get(i)?.added,
          rightOrigIdx: globalOffset + i,
        });
        i++;
        continue;
      }

      i++;
    }

    globalOffset += lines.length;
  }

  return rows;
}

function VirtualSplitDiff({
  rows,
  syntaxHighlights,
}: {
  rows: SplitRow[];
  syntaxHighlights?: Map<number, HighlightSpan[]> | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    overscan: 30,
  });

  return (
    <div ref={parentRef} className="overflow-auto" style={{ fontFamily: 'var(--font-code)', fontSize: '13px', lineHeight: '20px' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const i = virtualRow.index;
          const row = rows[i]!;

          if (row.isHunkHeader) {
            return (
              <div
                key={i}
                data-index={i}
                ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="px-2 text-[11px] text-[var(--color-diff-hunk-header-text)] select-none" style={{ backgroundColor: 'var(--color-diff-hunk-header-bg)', height: '28px', lineHeight: '28px' }}>
                  {row.hunkContent}
                </div>
              </div>
            );
          }

          const leftBg = row.left ? (row.left.type === 'delete' ? 'var(--color-diff-deleted-bg)' : row.left.type === 'context' ? 'var(--color-diff-context-bg)' : 'transparent') : 'var(--color-diff-context-bg)';
          const rightBg = row.right ? (row.right.type === 'add' ? 'var(--color-diff-added-bg)' : row.right.type === 'context' ? 'var(--color-diff-context-bg)' : 'transparent') : 'var(--color-diff-context-bg)';
          const leftGutterBg = row.left?.type === 'delete' ? 'var(--color-diff-deleted-gutter-bg)' : 'transparent';
          const rightGutterBg = row.right?.type === 'add' ? 'var(--color-diff-added-gutter-bg)' : 'transparent';

          return (
            <div
              key={i}
              data-index={i}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="flex">
                <div className="w-[40px] shrink-0 select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)] border-r border-[var(--color-diff-border)]" style={{ backgroundColor: leftGutterBg }}>
                  {row.left?.oldLineNumber ?? ''}
                </div>
                <div className="w-[calc(50%-40px)] shrink-0 pl-2 whitespace-pre overflow-x-auto border-r border-[var(--color-diff-border)]" style={{ backgroundColor: leftBg }}>
                  {row.left && (
                    <DiffLineContent
                      content={row.left.content}
                      inlineChanges={row.leftInline}
                      syntaxSpans={row.leftOrigIdx !== undefined ? syntaxHighlights?.get(row.leftOrigIdx) : undefined}
                    />
                  )}
                </div>
                <div className="w-[40px] shrink-0 select-none text-right pr-1 text-[12px] text-[var(--color-diff-line-number)] border-r border-[var(--color-diff-border)]" style={{ backgroundColor: rightGutterBg }}>
                  {row.right?.newLineNumber ?? ''}
                </div>
                <div className="flex-1 pl-2 whitespace-pre overflow-x-auto" style={{ backgroundColor: rightBg }}>
                  {row.right && (
                    <DiffLineContent
                      content={row.right.content}
                      inlineChanges={row.rightInline}
                      syntaxSpans={row.rightOrigIdx !== undefined ? syntaxHighlights?.get(row.rightOrigIdx) : undefined}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
