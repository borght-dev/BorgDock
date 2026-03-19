import { useState } from 'react';
import type { CheckRun, ParsedError } from '@/types';
import { LogViewer } from './LogViewer';
import { ParsedErrorCard } from './ParsedErrorCard';

interface CheckDetailPanelProps {
  checkRuns: CheckRun[];
  selectedRunId?: number;
  parsedErrors?: ParsedError[];
  rawLog?: string;
}

export function CheckDetailPanel({
  checkRuns,
  selectedRunId,
  parsedErrors = [],
  rawLog = '',
}: CheckDetailPanelProps) {
  const [selectedId, setSelectedId] = useState(selectedRunId ?? checkRuns[0]?.id);
  const [showRawLog, setShowRawLog] = useState(false);

  const selectedRun = checkRuns.find((r) => r.id === selectedId);

  return (
    <div className="flex flex-col h-full">
      {/* Run selector */}
      <div className="border-b border-[var(--color-separator)] px-3 py-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] outline-none"
        >
          {checkRuns.map((run) => (
            <option key={run.id} value={run.id}>
              {run.name} — {run.conclusion ?? run.status}
            </option>
          ))}
        </select>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-separator)]">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          {selectedRun?.name ?? 'Check Details'}
        </span>
        <button
          onClick={() => setShowRawLog((v) => !v)}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-[var(--color-action-secondary-fg)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          {showRawLog ? 'Show Errors' : 'Show Raw Log'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {showRawLog ? (
          <LogViewer log={rawLog} />
        ) : (
          <div className="space-y-2 p-3">
            {parsedErrors.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No parsed errors for this check run.
              </p>
            ) : (
              parsedErrors.map((error, i) => <ParsedErrorCard key={i} error={error} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
