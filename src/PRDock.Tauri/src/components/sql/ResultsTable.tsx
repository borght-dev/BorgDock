import { useCallback, useRef, useState } from 'react';

interface ResultsTableProps {
  columns: string[];
  rows: (string | null)[][];
  selectedRows: Set<number>;
  onSelectionChange: (selected: Set<number>) => void;
}

export function ResultsTable({ columns, rows, selectedRows, onSelectionChange }: ResultsTableProps) {
  const [lastClickedRow, setLastClickedRow] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const handleRowClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const next = new Set(selectedRows);

      if (e.shiftKey && lastClickedRow !== null) {
        const start = Math.min(lastClickedRow, index);
        const end = Math.max(lastClickedRow, index);
        for (let i = start; i <= end; i++) {
          next.add(i);
        }
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
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
    <div ref={tableRef} className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
        <thead className="sticky top-0 z-10">
          <tr style={{ backgroundColor: 'var(--color-surface-raised)' }}>
            {columns.map((col, i) => (
              <th
                key={i}
                className="whitespace-nowrap border-b px-3 py-1.5 text-left text-[11px] font-semibold"
                style={{
                  borderColor: 'var(--color-separator)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="cursor-pointer transition-colors"
              style={{
                backgroundColor: selectedRows.has(rowIdx)
                  ? 'var(--color-accent-subtle)'
                  : 'transparent',
              }}
              onClick={(e) => handleRowClick(rowIdx, e)}
            >
              {row.map((cell, colIdx) => (
                <td
                  key={colIdx}
                  className="whitespace-nowrap border-b px-3 py-1"
                  style={{
                    borderColor: 'var(--color-separator)',
                    color: cell === null ? 'var(--color-text-ghost)' : 'var(--color-text-primary)',
                    fontStyle: cell === null ? 'italic' : 'normal',
                  }}
                >
                  {cell === null ? 'NULL' : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
