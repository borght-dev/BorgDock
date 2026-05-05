import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

interface ResultsTableProps {
  columns: string[];
  rows: (string | null)[][];
  selectedRows: Set<number>;
  onSelectionChange: (selected: Set<number>) => void;
}

const ROW_HEIGHT = 30;
const ROW_NUM_WIDTH = 42;
const CELL_MIN_WIDTH = 120;
const CELL_MAX_WIDTH = 360;
const MEASURE_SAMPLE = 50;

function measureColumnWidths(columns: string[], rows: (string | null)[][]): number[] {
  const sample = Math.min(rows.length, MEASURE_SAMPLE);
  return columns.map((col, ci) => {
    let max = col.length;
    for (let i = 0; i < sample; i++) {
      const v = rows[i]?.[ci];
      if (v != null && v.length > max) max = v.length;
    }
    return Math.min(CELL_MAX_WIDTH, Math.max(CELL_MIN_WIDTH, max * 7 + 28));
  });
}

function ResultsTableImpl({ columns, rows, selectedRows, onSelectionChange }: ResultsTableProps) {
  const [lastClickedRow, setLastClickedRow] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const colWidths = useMemo(() => measureColumnWidths(columns, rows), [columns, rows]);
  const gridTemplate = useMemo(
    () => `${ROW_NUM_WIDTH}px ${colWidths.map((w) => `${w}px`).join(' ')}`,
    [colWidths],
  );
  const totalWidth = ROW_NUM_WIDTH + colWidths.reduce((a, b) => a + b, 0);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const handleRowClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const next = new Set(selectedRows);

      if (e.shiftKey && lastClickedRow !== null) {
        const start = Math.min(lastClickedRow, index);
        const end = Math.max(lastClickedRow, index);
        for (let i = start; i <= end; i++) next.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
      } else if (next.has(index) && next.size === 1) {
        next.clear();
      } else {
        next.clear();
        next.add(index);
      }

      setLastClickedRow(index);
      onSelectionChange(next);
    },
    [selectedRows, lastClickedRow, onSelectionChange],
  );

  if (columns.length === 0) return null;

  return (
    <div ref={scrollRef} data-sql-results-table className="sql-results-grid bd-mono">
      <div className="sql-grid-inner" style={{ minWidth: totalWidth }}>
        <div className="sql-grid-header" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="sql-row-num-header" aria-label="Row number">
            #
          </div>
          {columns.map((col, i) => (
            <div key={i} className="sql-col-header">
              <span className="sql-col-name">{col}</span>
            </div>
          ))}
        </div>
        <div
          className="sql-grid-body"
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const ri = vi.index;
            const row = rows[ri]!;
            const isSelected = selectedRows.has(ri);
            return (
              <div
                key={ri}
                className={clsx('sql-data-row', isSelected && 'sql-data-row--selected')}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  transform: `translateY(${vi.start}px)`,
                }}
                onClick={(e) => handleRowClick(ri, e)}
              >
                <div className="sql-row-num">{ri + 1}</div>
                {row.map((cell, ci) => (
                  <div key={ci} className={clsx('sql-cell', cell === null && 'sql-cell--null')}>
                    {cell === null ? 'NULL' : cell}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const ResultsTable = memo(ResultsTableImpl);
