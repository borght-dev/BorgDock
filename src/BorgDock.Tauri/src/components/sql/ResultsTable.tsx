import clsx from 'clsx';
import { useCallback, useRef, useState } from 'react';

interface ResultsTableProps {
  columns: string[];
  rows: (string | null)[][];
  selectedRows: Set<number>;
  onSelectionChange: (selected: Set<number>) => void;
}

export function ResultsTable({
  columns,
  rows,
  selectedRows,
  onSelectionChange,
}: ResultsTableProps) {
  const [lastClickedRow, setLastClickedRow] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

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
    <table ref={tableRef} className="sql-results-table">
      <thead>
        <tr>
          <th className="sql-row-num-header">#</th>
          {columns.map((col, i) => (
            <th key={i} className="sql-col-header">
              <span className="sql-col-name">{col}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIdx) => {
          const isSelected = selectedRows.has(rowIdx);
          return (
            <tr
              key={rowIdx}
              className={clsx('sql-data-row', isSelected && 'sql-data-row--selected')}
              onClick={(e) => handleRowClick(rowIdx, e)}
            >
              <td className="sql-row-num">{rowIdx + 1}</td>
              {row.map((cell, colIdx) => (
                <td key={colIdx} className={clsx('sql-cell', cell === null && 'sql-cell--null')}>
                  {cell === null ? 'NULL' : cell}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
