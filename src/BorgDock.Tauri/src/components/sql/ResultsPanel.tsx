import { memo, useCallback } from 'react';
import { Button, Pill } from '@/components/shared/primitives';
import { AlertIcon, CheckCircleIcon, CopyIcon } from './icons';
import { ResultsTable } from './ResultsTable';

interface ResultSet {
  columns: string[];
  rows: (string | null)[][];
  rowCount: number;
  truncated: boolean;
}

interface ResultsPanelProps {
  isRunning: boolean;
  hasRun: boolean;
  error: string | null;
  resultSets: ResultSet[];
  executionTimeMs: number;
  rowsAffected: number | null;
  selectedRowsMap: Map<number, Set<number>>;
  onSelectionChange: (idx: number, sel: Set<number>) => void;
  copyFlash: string | null;
  onCopyValues: () => void;
  onCopyWithHeaders: () => void;
  onCopyAll: () => void;
}

const EMPTY: Set<number> = new Set();

function pluralRows(n: number) {
  return `${n.toLocaleString()} row${n === 1 ? '' : 's'}`;
}

interface ResultSetViewProps {
  idx: number;
  columns: string[];
  rows: (string | null)[][];
  selectedRows: Set<number>;
  onSelectionChange: (idx: number, sel: Set<number>) => void;
}

const ResultSetView = memo(function ResultSetView({
  idx,
  columns,
  rows,
  selectedRows,
  onSelectionChange,
}: ResultSetViewProps) {
  const handle = useCallback(
    (sel: Set<number>) => onSelectionChange(idx, sel),
    [idx, onSelectionChange],
  );
  return (
    <ResultsTable
      columns={columns}
      rows={rows}
      selectedRows={selectedRows}
      onSelectionChange={handle}
    />
  );
});

export function ResultsPanel({
  isRunning,
  hasRun,
  error,
  resultSets,
  executionTimeMs,
  rowsAffected,
  selectedRowsMap,
  onSelectionChange,
  copyFlash,
  onCopyValues,
  onCopyWithHeaders,
  onCopyAll,
}: ResultsPanelProps) {
  const populated = resultSets.filter((rs) => rs.columns.length > 0);
  const totalRows = resultSets.reduce((sum, rs) => sum + rs.rows.length, 0);
  const anyTruncated = resultSets.some((rs) => rs.truncated);

  let pill: { tone: 'success' | 'error' | 'neutral' | 'warning'; label: string } | null = null;
  let summary = '';

  if (error) {
    pill = { tone: 'error', label: 'query failed' };
    summary = '';
  } else if (isRunning) {
    pill = { tone: 'neutral', label: 'running…' };
    summary = 'executing query';
  } else if (hasRun) {
    if (rowsAffected != null) {
      pill = {
        tone: 'success',
        label: `${rowsAffected.toLocaleString()} affected`,
      };
      summary = `executed in ${executionTimeMs} ms`;
    } else {
      pill = { tone: 'success', label: pluralRows(totalRows) };
      if (populated.length > 0) {
        const setLabel =
          populated.length > 1 ? `${populated.length} result sets` : 'result set 1 of 1';
        summary = `executed in ${executionTimeMs} ms · ${setLabel}`;
      } else {
        summary = `executed in ${executionTimeMs} ms · no rows returned`;
      }
    }
  }

  const showCopy = hasRun && !error && totalRows > 0;

  return (
    <section className="sql-results">
      <header className="sql-results__header">
        {pill ? (
          <Pill
            tone={pill.tone}
            icon={
              pill.tone === 'success' ? (
                <CheckCircleIcon size={10} />
              ) : pill.tone === 'error' ? (
                <AlertIcon size={10} />
              ) : null
            }
          >
            {pill.label}
          </Pill>
        ) : (
          <span className="sql-results__hint">run a query to see results</span>
        )}
        {summary && <span className="sql-results__summary">{summary}</span>}
        {anyTruncated && !error && <span className="sql-results__truncated">truncated</span>}
        <span className="sql-results__spacer" />
        {copyFlash && <span className="sql-results__copy-flash">{copyFlash}</span>}
        {showCopy && (
          <div className="sql-copy-group" role="group" aria-label="Copy results">
            <CopyIcon size={12} />
            <Button variant="ghost" size="sm" onClick={onCopyValues}>
              Values
            </Button>
            <Button variant="ghost" size="sm" onClick={onCopyWithHeaders}>
              + Headers
            </Button>
            <Button variant="ghost" size="sm" onClick={onCopyAll}>
              All
            </Button>
          </div>
        )}
      </header>

      <div className="sql-results__body bd-scroll">
        {error && (
          <div className="sql-results__error" role="alert">
            <AlertIcon size={13} />
            <span>{error}</span>
          </div>
        )}

        {!error && hasRun && populated.length === 0 && (
          <div className="sql-results__empty">
            <CheckCircleIcon size={20} />
            <span>Query executed — no results returned</span>
          </div>
        )}

        {!error &&
          populated.map((rs, idx) => (
            <div key={idx} className="sql-results__set">
              {populated.length > 1 && (
                <div className="sql-results__set-header">
                  Result {idx + 1}
                  <span className="sql-results__set-count">
                    {pluralRows(rs.rowCount)}
                    {rs.truncated && ' · truncated'}
                  </span>
                </div>
              )}
              <ResultSetView
                idx={idx}
                columns={rs.columns}
                rows={rs.rows}
                selectedRows={selectedRowsMap.get(idx) ?? EMPTY}
                onSelectionChange={onSelectionChange}
              />
            </div>
          ))}

        {!error && !hasRun && (
          <div className="sql-results__empty sql-results__empty--idle">
            <span className="sql-results__empty-title">Ready when you are</span>
            <span className="sql-results__empty-sub">
              Press <kbd className="bd-kbd">Ctrl</kbd>+<kbd className="bd-kbd">↵</kbd> to run
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
