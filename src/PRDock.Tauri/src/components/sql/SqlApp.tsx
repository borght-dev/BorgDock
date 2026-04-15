import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import type { AppSettings, SqlSettings } from '@/types/settings';
import { parseError } from '@/utils/parse-error';
import { ResultsTable } from './ResultsTable';

interface ResultSet {
  columns: string[];
  rows: (string | null)[][];
  rowCount: number;
  truncated: boolean;
}

interface QueryResult {
  resultSets: ResultSet[];
  executionTimeMs: number;
  totalRowCount: number;
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

/* ── Icons ─────────────────────────────────────────────── */

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M4.5 2.5v11l9-5.5z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={clsx('animate-spin', className)}
    >
      <path d="M8 1a7 7 0 1 0 7 7" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="8" cy="4" rx="6" ry="2.5" />
      <path d="M2 4v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V4" />
      <path d="M2 8v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V8" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 8.5 3.5 3.5 6.5-8" />
    </svg>
  );
}

/* ── Main App ──────────────────────────────────────────── */

export function SqlApp() {
  const [sqlSettings, setSqlSettings] = useState<SqlSettings | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [query, setQuery] = useState(() => localStorage.getItem(QUERY_KEY) ?? '');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedRowsMap, setSelectedRowsMap] = useState<Map<number, Set<number>>>(new Map());
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editorHeight, setEditorHeight] = useState(140);
  const isDragging = useRef(false);

  // Load settings and restore position
  useEffect(() => {
    (async () => {
      try {
        const settings = await invoke<AppSettings>('load_settings');
        setSqlSettings(settings.sql);

        const t = settings.ui?.theme ?? 'system';
        const isDark =
          t === 'dark' ||
          (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', isDark);

        const lastUsed = settings.sql.lastUsedConnection;
        if (lastUsed && settings.sql.connections.some((c) => c.name === lastUsed)) {
          setSelectedConnection(lastUsed);
        } else if (settings.sql.connections.length > 0) {
          setSelectedConnection(settings.sql.connections[0]!.name);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }

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
        getCurrentWindow().close().catch(console.debug); /* fire-and-forget */
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Drag-to-resize editor
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      e.preventDefault();
      const container = document.getElementById('sql-editor-area');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newHeight = Math.max(60, Math.min(400, e.clientY - rect.top));
      setEditorHeight(newHeight);
    }
    function onMouseUp() {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const runQuery = useCallback(async () => {
    if (!selectedConnection || !query.trim()) return;
    setIsRunning(true);
    setError('');
    setResult(null);
    setSelectedRowsMap(new Map());

    try {
      const res = await invoke<QueryResult>('execute_sql_query', {
        connectionName: selectedConnection,
        query: query.trim(),
      });
      setResult(res);
    } catch (err) {
      setError(parseError(err).message);
    } finally {
      setIsRunning(false);
    }
  }, [selectedConnection, query]);

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

  const getResultSetParts = useCallback(() => {
    if (!result) return [];
    return result.resultSets.map((rs, idx) => {
      const sel = selectedRowsMap.get(idx);
      const rows = sel && sel.size > 0 ? rs.rows.filter((_, i) => sel.has(i)) : rs.rows;
      return { columns: rs.columns, rows };
    });
  }, [result, selectedRowsMap]);

  const copyValues = useCallback(async () => {
    const parts = getResultSetParts();
    const text = parts
      .map((p) => p.rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n'))
      .join('\n\n');
    await writeText(text);
    flash('Copied!');
  }, [getResultSetParts, flash]);

  const copyWithHeaders = useCallback(async () => {
    const parts = getResultSetParts();
    const text = parts
      .map((p) => {
        const header = p.columns.join('\t');
        const body = p.rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n');
        return header + '\n' + body;
      })
      .join('\n\n');
    await writeText(text);
    flash('Copied!');
  }, [getResultSetParts, flash]);

  const copyAll = useCallback(async () => {
    const parts = getResultSetParts();
    const text = parts
      .map((p) => {
        const header = p.columns.join('\t');
        const body = p.rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n');
        return header + '\n' + body;
      })
      .join('\n\n');
    await writeText(query.trim() + '\n\n' + text);
    flash('Copied!');
  }, [query, getResultSetParts, flash]);

  const hasConnections = sqlSettings && sqlSettings.connections.length > 0;
  const hasResults = result && result.resultSets.some((rs) => rs.columns.length > 0);
  const totalSelectedRows = Array.from(selectedRowsMap.values()).reduce(
    (sum, s) => sum + s.size,
    0,
  );
  const totalRows = result ? result.resultSets.reduce((sum, rs) => sum + rs.rows.length, 0) : 0;
  const lineCount = query.split('\n').length;

  return (
    <div className="sql-app flex h-screen w-screen flex-col overflow-hidden">
      {/* ── Title bar ───────────────────────────────────── */}
      <WindowTitleBar title="PRDock SQL" />

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="sql-toolbar flex items-center gap-2 px-3 py-1.5">
        {/* Connection picker */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="sql-connection-icon">
            <DatabaseIcon />
          </div>
          {hasConnections ? (
            <select
              className="sql-connection-select flex-1 min-w-0"
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
            <span className="sql-no-connections">No connections — open Settings</span>
          )}
        </div>

        {/* Separator */}
        <div className="sql-toolbar-separator" />

        {/* Run button */}
        <button
          className={clsx('sql-run-btn', isRunning && 'sql-run-btn--running')}
          onClick={runQuery}
          disabled={isRunning || !hasConnections || !query.trim()}
        >
          {isRunning ? (
            <>
              <SpinnerIcon />
              <span>Running</span>
            </>
          ) : (
            <>
              <PlayIcon />
              <span>Run</span>
            </>
          )}
        </button>
        <kbd className="sql-kbd">Ctrl+Enter</kbd>
      </div>

      {/* ── Editor area ─────────────────────────────────── */}
      <div id="sql-editor-area" className="sql-editor-area" style={{ height: editorHeight }}>
        {/* Line numbers gutter */}
        <div className="sql-gutter" aria-hidden="true">
          {Array.from({ length: Math.max(lineCount, 6) }, (_, i) => (
            <div key={i} className="sql-gutter-line">
              {i + 1}
            </div>
          ))}
        </div>
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="sql-textarea"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="SELECT * FROM ..."
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>

      {/* ── Resize handle ───────────────────────────────── */}
      <div
        className="sql-resize-handle"
        onMouseDown={() => {
          isDragging.current = true;
          document.body.style.cursor = 'row-resize';
          document.body.style.userSelect = 'none';
        }}
      >
        <div className="sql-resize-grip" />
      </div>

      {/* ── Error display ───────────────────────────────── */}
      {error && (
        <div className="sql-error">
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 5v3.5M8 10.5v.5" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* ── Results ─────────────────────────────────────── */}
      {hasResults && (
        <div className="sql-results-container">
          {result.resultSets
            .filter((rs) => rs.columns.length > 0)
            .map((rs, idx) => (
              <div key={idx}>
                {result.resultSets.filter((r) => r.columns.length > 0).length > 1 && (
                  <div className="sql-resultset-header">
                    Result {idx + 1}
                    <span className="sql-resultset-count">
                      {rs.rowCount} row{rs.rowCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                <ResultsTable
                  columns={rs.columns}
                  rows={rs.rows}
                  selectedRows={selectedRowsMap.get(idx) ?? new Set()}
                  onSelectionChange={(sel) =>
                    setSelectedRowsMap((prev) => {
                      const next = new Map(prev);
                      next.set(idx, sel);
                      return next;
                    })
                  }
                />
              </div>
            ))}
        </div>
      )}

      {/* Empty results */}
      {result && !hasResults && !error && (
        <div className="sql-empty-results">
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.4"
          >
            <path d="m3 8.5 3.5 3.5 6.5-8" />
          </svg>
          <span>Query executed — no results returned</span>
        </div>
      )}

      {/* ── Status bar ──────────────────────────────────── */}
      <div className="sql-status-bar">
        <div className="sql-status-left">
          {result && (
            <>
              <span className="sql-status-rows">
                {result.totalRowCount.toLocaleString()} row{result.totalRowCount !== 1 ? 's' : ''}
                {result.resultSets.length > 1 && (
                  <span className="sql-status-sets">
                    {' '}
                    · {result.resultSets.filter((rs) => rs.columns.length > 0).length} results
                  </span>
                )}
                {result.resultSets.some((rs) => rs.truncated) && (
                  <span className="sql-status-truncated"> (truncated)</span>
                )}
              </span>
              <span className="sql-status-dot" />
              <span className="sql-status-time">{result.executionTimeMs}ms</span>
              {totalSelectedRows > 0 && (
                <>
                  <span className="sql-status-dot" />
                  <span className="sql-status-selected">{totalSelectedRows} selected</span>
                </>
              )}
            </>
          )}
        </div>

        <div className="sql-status-right">
          {copyFlash && (
            <span className="sql-copy-flash">
              <CheckIcon />
              {copyFlash}
            </span>
          )}
          {result && totalRows > 0 && (
            <div className="sql-copy-group">
              <CopyIcon />
              <button className="sql-copy-btn" onClick={copyValues}>
                Values
              </button>
              <button className="sql-copy-btn" onClick={copyWithHeaders}>
                + Headers
              </button>
              <button className="sql-copy-btn" onClick={copyAll}>
                All
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
