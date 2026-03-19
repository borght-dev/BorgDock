import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, SqlSettings } from '@/types/settings';
import { ResultsTable } from './ResultsTable';

interface QueryResult {
  columns: string[];
  rows: (string | null)[][];
  executionTimeMs: number;
  rowCount: number;
  truncated: boolean;
}

const POSITION_KEY = 'prdock-sql-position';
const QUERY_KEY = 'prdock-sql-last-query';

function loadSavedPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  } catch {
    /* ignore */
  }
  return null;
}

async function saveCurrentPosition() {
  try {
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const scale = await win.scaleFactor();
    localStorage.setItem(
      POSITION_KEY,
      JSON.stringify({
        x: Math.round(pos.x / scale),
        y: Math.round(pos.y / scale),
      }),
    );
  } catch {
    /* ignore */
  }
}

export function SqlApp() {
  const [sqlSettings, setSqlSettings] = useState<SqlSettings | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [query, setQuery] = useState(() => localStorage.getItem(QUERY_KEY) ?? '');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load settings and restore position
  useEffect(() => {
    (async () => {
      try {
        const settings = await invoke<AppSettings>('load_settings');
        setSqlSettings(settings.sql);

        // Apply theme
        const t = settings.ui?.theme ?? 'system';
        const isDark =
          t === 'dark' ||
          (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', isDark);

        // Select last used connection or first available
        const lastUsed = settings.sql.lastUsedConnection;
        if (lastUsed && settings.sql.connections.some((c) => c.name === lastUsed)) {
          setSelectedConnection(lastUsed);
        } else if (settings.sql.connections.length > 0) {
          setSelectedConnection(settings.sql.connections[0]!.name);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }

      // Restore saved position
      const saved = loadSavedPosition();
      if (
        saved &&
        saved.x >= 0 &&
        saved.y >= 0 &&
        saved.x < screen.width &&
        saved.y < screen.height
      ) {
        try {
          const { LogicalPosition } = await import('@tauri-apps/api/dpi');
          await getCurrentWindow().setPosition(new LogicalPosition(saved.x, saved.y));
        } catch {
          /* ignore */
        }
      }
    })();
  }, []);

  // Save position on move
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWindow().onMoved(() => {
        saveCurrentPosition();
      });
    })();
    return () => unlisten?.();
  }, []);

  // Persist query text
  useEffect(() => {
    localStorage.setItem(QUERY_KEY, query);
  }, [query]);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        getCurrentWindow().close().catch(() => {});
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const runQuery = useCallback(async () => {
    if (!selectedConnection || !query.trim()) return;
    setIsRunning(true);
    setError('');
    setResult(null);
    setSelectedRows(new Set());

    try {
      const res = await invoke<QueryResult>('execute_sql_query', {
        connectionName: selectedConnection,
        query: query.trim(),
      });
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRunning(false);
    }
  }, [selectedConnection, query]);

  // Ctrl+Enter to run
  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runQuery();
      }
    },
    [runQuery],
  );

  const flash = useCallback((msg: string) => {
    setCopyFlash(msg);
    setTimeout(() => setCopyFlash(null), 1500);
  }, []);

  const getRowsForCopy = useCallback(() => {
    if (!result) return [];
    if (selectedRows.size === 0) return result.rows;
    return result.rows.filter((_, i) => selectedRows.has(i));
  }, [result, selectedRows]);

  const copyValues = useCallback(async () => {
    const rows = getRowsForCopy();
    const text = rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n');
    await writeText(text);
    flash('Copied!');
  }, [getRowsForCopy, flash]);

  const copyWithHeaders = useCallback(async () => {
    if (!result) return;
    const rows = getRowsForCopy();
    const header = result.columns.join('\t');
    const body = rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n');
    await writeText(header + '\n' + body);
    flash('Copied!');
  }, [result, getRowsForCopy, flash]);

  const copyAll = useCallback(async () => {
    if (!result) return;
    const rows = getRowsForCopy();
    const header = result.columns.join('\t');
    const body = rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n');
    await writeText(query.trim() + '\n\n' + header + '\n' + body);
    flash('Copied!');
  }, [result, query, getRowsForCopy, flash]);

  const hasConnections = sqlSettings && sqlSettings.connections.length > 0;

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--color-card-background)' }}
    >
      {/* Connection picker */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--color-separator)' }}
      >
        <label
          className="shrink-0 text-[11px] font-medium"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Connection
        </label>
        {hasConnections ? (
          <select
            className="flex-1 rounded border px-2 py-1 text-xs outline-none"
            style={{
              backgroundColor: 'var(--color-input-bg)',
              borderColor: 'var(--color-input-border)',
              color: 'var(--color-text-primary)',
            }}
            value={selectedConnection}
            onChange={(e) => setSelectedConnection(e.target.value)}
          >
            {sqlSettings.connections.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No connections configured — open Settings
          </span>
        )}
      </div>

      {/* Query editor */}
      <div className="px-3 pt-2">
        <textarea
          ref={textareaRef}
          className="w-full resize-y rounded border px-3 py-2 text-xs outline-none"
          style={{
            fontFamily: 'Consolas, "Courier New", monospace',
            minHeight: '100px',
            maxHeight: '300px',
            backgroundColor: 'var(--color-input-bg)',
            borderColor: 'var(--color-input-border)',
            color: 'var(--color-text-primary)',
            caretColor: 'var(--color-accent)',
          }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Enter SQL query..."
          spellCheck={false}
        />
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center gap-2 border-b px-3 py-1.5"
        style={{ borderColor: 'var(--color-separator)' }}
      >
        <button
          className="rounded-md px-3 py-1 text-[11px] font-semibold transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-accent-foreground)',
          }}
          onClick={runQuery}
          disabled={isRunning || !hasConnections || !query.trim()}
        >
          {isRunning ? 'Running...' : 'Run'}
        </button>
        <span className="text-[10px]" style={{ color: 'var(--color-text-ghost)' }}>
          Ctrl+Enter
        </span>
        {isRunning && (
          <span
            className="ml-auto inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
            style={{ color: 'var(--color-accent)' }}
          />
        )}
      </div>

      {/* Error display */}
      {error && (
        <div
          className="border-b px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-separator)',
            color: 'var(--color-status-red)',
            backgroundColor: 'var(--color-surface-raised)',
          }}
        >
          {error}
        </div>
      )}

      {/* Results table */}
      {result && result.columns.length > 0 && (
        <ResultsTable
          columns={result.columns}
          rows={result.rows}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
        />
      )}

      {/* Empty results message */}
      {result && result.columns.length === 0 && !error && (
        <div
          className="flex flex-1 items-center justify-center text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Query executed successfully — no results returned
        </div>
      )}

      {/* Status bar */}
      <div
        className="flex shrink-0 items-center justify-between border-t px-3 py-1.5"
        style={{
          borderColor: 'var(--color-separator)',
          backgroundColor: 'var(--color-surface-raised)',
        }}
      >
        <div className="flex items-center gap-3">
          {result && (
            <>
              <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                {result.rowCount} row{result.rowCount !== 1 ? 's' : ''}
                {result.truncated ? ' (truncated)' : ''} — {result.executionTimeMs}ms
              </span>
              {selectedRows.size > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {selectedRows.size} selected
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {copyFlash && (
            <span
              className="text-[10px] font-medium"
              style={{ color: 'var(--color-status-green)' }}
            >
              {copyFlash}
            </span>
          )}
          {result && result.rows.length > 0 && (
            <>
              <CopyButton label="Values" onClick={copyValues} />
              <CopyButton label="+ Headers" onClick={copyWithHeaders} />
              <CopyButton label="All" onClick={copyAll} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
      style={{
        color: 'var(--color-text-secondary)',
        backgroundColor: 'var(--color-surface-hover)',
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
