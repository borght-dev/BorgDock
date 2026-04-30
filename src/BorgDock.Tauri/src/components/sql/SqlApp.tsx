import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WindowStatusBar } from '@/components/shared/chrome';
import { Button, Kbd, Pill } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import type { AppSettings, SqlSettings } from '@/types/settings';
import { parseError } from '@/utils/parse-error';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CopyIcon,
  PlayIcon,
  PlusIcon,
  SpinnerIcon,
  TerminalIcon,
} from './icons';
import { ResultsPanel } from './ResultsPanel';
import { SaveSnippetDialog } from './SaveSnippetDialog';
import { SnippetsRail } from './SnippetsRail';
import { SqlEditor, type SqlEditorHandle } from './SqlEditor';
import type { SqlSnippet } from './snippet-types';
import { useSnippets } from './use-snippets';
import { useSqlSchema } from './use-sql-schema';

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

const POSITION_KEY = 'borgdock-sql-position';
const QUERY_KEY = 'borgdock-sql-last-query';
const RAIL_WIDTH_KEY = 'borgdock.sql.railWidth';
const RAIL_COLLAPSED_KEY = 'borgdock.sql.railCollapsed';
const EDITOR_HEIGHT_KEY = 'borgdock.sql.editorHeight';
const ACTIVE_SNIPPET_KEY = 'borgdock.sql.activeSnippet';
const QUERY_PERSIST_DEBOUNCE_MS = 300;

const RAIL_MIN = 180;
const RAIL_MAX = 480;
const RAIL_DEFAULT = 240;
const EDITOR_MIN = 80;
const EDITOR_DEFAULT = 220;

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readNumber(key: string, fallback: number, min: number, max: number) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return clamp(n, min, max);
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

export function SqlApp() {
  const [sqlSettings, setSqlSettings] = useState<SqlSettings | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const { schema, status: schemaStatus, refresh: refreshSchema } = useSqlSchema(selectedConnection);

  const snippetsApi = useSnippets();
  const { snippets, add, update, rename, duplicate, toggleStar, remove } = snippetsApi;

  const [activeSnippetId, setActiveSnippetId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_SNIPPET_KEY);
    } catch {
      return null;
    }
  });
  const [query, setQuery] = useState(() => localStorage.getItem(QUERY_KEY) ?? '');

  const [savingNew, setSavingNew] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [selectedRowsMap, setSelectedRowsMap] = useState<Map<number, Set<number>>>(new Map());

  const [railCollapsed, setRailCollapsed] = useState(() => readBool(RAIL_COLLAPSED_KEY, false));
  const [railWidth, setRailWidth] = useState(() =>
    readNumber(RAIL_WIDTH_KEY, RAIL_DEFAULT, RAIL_MIN, RAIL_MAX),
  );
  const [editorHeight, setEditorHeight] = useState(() =>
    readNumber(EDITOR_HEIGHT_KEY, EDITOR_DEFAULT, EDITOR_MIN, 800),
  );

  const splitWrapRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<SqlEditorHandle>(null);

  const railResizing = useRef(false);
  const editorResizing = useRef(false);

  const activeSnippet = useMemo(
    () => snippets.find((s) => s.id === activeSnippetId) ?? null,
    [snippets, activeSnippetId],
  );

  // Derived from the source-of-truth comparison so it can't drift out of
  // sync with the editor (the previous setDirty + syncing-effect pair
  // raced against the editor's own onChange callback after a snippet
  // load, leaving "● modified" stuck on).
  const dirty = useMemo(() => {
    if (activeSnippet) return query !== activeSnippet.body;
    return query.length > 0;
  }, [activeSnippet, query]);

  /* ── Initial settings + window position ───────────────── */
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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWindow().onMoved(() => {
        saveCurrentPosition();
      });
    })();
    return () => unlisten?.();
  }, []);

  /* ── Persist query (debounced) ────────────────────────── */
  const queryRef = useRef(query);
  queryRef.current = query;
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushQueryToStorage = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const current = queryRef.current;
    if ((localStorage.getItem(QUERY_KEY) ?? '') !== current) {
      localStorage.setItem(QUERY_KEY, current);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `query` is the trigger; the effect reads it indirectly through queryRef inside flushQueryToStorage.
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(flushQueryToStorage, QUERY_PERSIST_DEBOUNCE_MS);
  }, [query, flushQueryToStorage]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushQueryToStorage();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', flushQueryToStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', flushQueryToStorage);
      flushQueryToStorage();
    };
  }, [flushQueryToStorage]);

  /* ── Persist active snippet id ────────────────────────── */
  useEffect(() => {
    try {
      if (activeSnippetId) localStorage.setItem(ACTIVE_SNIPPET_KEY, activeSnippetId);
      else localStorage.removeItem(ACTIVE_SNIPPET_KEY);
    } catch {
      /* ignore */
    }
  }, [activeSnippetId]);

  /* ── Click outside rows clears selection ──────────────── */
  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.sql-data-row')) return;
      if (target.closest('.sql-copy-group')) return;
      if (target.closest('.sql-modal')) return;
      setSelectedRowsMap((prev) => (prev.size === 0 ? prev : new Map()));
    }
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  /* ── Rail resize ──────────────────────────────────────── */
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!railResizing.current) return;
      const rect = splitWrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = clamp(e.clientX - rect.left, RAIL_MIN, RAIL_MAX);
      setRailWidth(next);
    }
    function onUp() {
      if (!railResizing.current) return;
      railResizing.current = false;
      document.body.classList.remove('sql-resizing');
      try {
        localStorage.setItem(RAIL_WIDTH_KEY, String(queryRailWidthRef.current));
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);
  const queryRailWidthRef = useRef(railWidth);
  queryRailWidthRef.current = railWidth;

  /* ── Editor vertical resize ───────────────────────────── */
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!editorResizing.current) return;
      const rect = editorWrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = clamp(e.clientY - rect.top, EDITOR_MIN, rect.height - 100);
      setEditorHeight(next);
    }
    function onUp() {
      if (!editorResizing.current) return;
      editorResizing.current = false;
      document.body.classList.remove('sql-resizing-v');
      try {
        localStorage.setItem(EDITOR_HEIGHT_KEY, String(queryEditorHeightRef.current));
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);
  const queryEditorHeightRef = useRef(editorHeight);
  queryEditorHeightRef.current = editorHeight;

  /* ── Persist rail collapsed ───────────────────────────── */
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_COLLAPSED_KEY, railCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [railCollapsed]);

  /* ── Run query ────────────────────────────────────────── */
  // `textOverride` is what the editor passes when it triggers Mod-Enter — the
  // current selection if any, else the whole document. The toolbar Run button
  // doesn't pass anything, so we ask the editor handle directly. Either way,
  // a non-empty selection is preferred over the full doc.
  const runQuery = useCallback(
    async (textOverride?: string) => {
      if (!selectedConnection) return;
      const fromEditor = textOverride ?? editorRef.current?.getRunText();
      const toRun = (fromEditor ?? queryRef.current).trim();
      if (!toRun) return;

      setIsRunning(true);
      setError(null);
      setResult(null);
      setSelectedRowsMap(new Map());
      setHasRun(true);

      try {
        const res = await invoke<QueryResult>('execute_sql_query', {
          connectionName: selectedConnection,
          query: toRun,
        });
        setResult(res);
        if (activeSnippetId) {
          update(activeSnippetId, { lastRun: 'just now' });
        }
      } catch (err) {
        setError(parseError(err).message);
      } finally {
        setIsRunning(false);
      }
    },
    [selectedConnection, activeSnippetId, update],
  );

  /* ── Snippet load / save ──────────────────────────────── */
  const loadSnippet = useCallback((s: SqlSnippet) => {
    setActiveSnippetId(s.id);
    setQuery(s.body);
    setHasRun(false);
    setResult(null);
    setError(null);
  }, []);

  /** Deselect the active snippet and clear the editor — "start fresh". */
  const newQuery = useCallback(() => {
    setActiveSnippetId(null);
    setQuery('');
    setHasRun(false);
    setResult(null);
    setError(null);
  }, []);

  const updateQuery = useCallback((next: string) => {
    setQuery(next);
  }, []);

  const flashSaved = useCallback(() => {
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1400);
  }, []);

  const saveOverActive = useCallback(() => {
    if (!activeSnippet) {
      setSavingNew(true);
      return;
    }
    update(activeSnippet.id, { body: queryRef.current });
    flashSaved();
  }, [activeSnippet, update, flashSaved]);

  const openSaveAs = useCallback(() => {
    setSavingNew(true);
  }, []);

  const commitSaveAs = useCallback(
    (name: string) => {
      const created = add({ name, body: queryRef.current });
      setActiveSnippetId(created.id);
      setSavingNew(false);
      flashSaved();
    },
    [add, flashSaved],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      const dup = duplicate(id);
      if (dup) {
        setActiveSnippetId(dup.id);
        setQuery(dup.body);
      }
    },
    [duplicate],
  );

  const handleDelete = useCallback(
    (id: string) => {
      remove(id);
      if (activeSnippetId === id) {
        setActiveSnippetId(null);
      }
    },
    [remove, activeSnippetId],
  );

  /* ── Keyboard ─────────────────────────────────────────── */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Defer to whichever inner surface already handled it — CodeMirror's
        // autocomplete dropdown calls preventDefault on Escape when it has
        // an open completion to dismiss, and the inline snippet-rename input
        // does the same. Closing the window in those cases is jarring.
        if (e.defaultPrevented) return;
        if (savingNew) {
          setSavingNew(false);
          return;
        }
        getCurrentWindow().close().catch(console.debug);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey || !activeSnippet) {
          openSaveAs();
        } else {
          saveOverActive();
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [savingNew, activeSnippet, openSaveAs, saveOverActive]);

  /* ── Copy helpers ─────────────────────────────────────── */
  const flashCopy = useCallback((msg: string) => {
    setCopyFlash(msg);
    setTimeout(() => setCopyFlash(null), 1500);
  }, []);

  const getResultParts = useCallback(() => {
    if (!result) return [];
    return result.resultSets.map((rs, idx) => {
      const sel = selectedRowsMap.get(idx);
      const rows = sel && sel.size > 0 ? rs.rows.filter((_, i) => sel.has(i)) : rs.rows;
      return { columns: rs.columns, rows };
    });
  }, [result, selectedRowsMap]);

  const copyValues = useCallback(async () => {
    const parts = getResultParts();
    const text = parts
      .map((p) => p.rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n'))
      .join('\n\n');
    await writeText(text);
    flashCopy('Copied!');
  }, [getResultParts, flashCopy]);

  const copyWithHeaders = useCallback(async () => {
    const parts = getResultParts();
    const text = parts
      .map((p) => {
        const header = p.columns.join('\t');
        const body = p.rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n');
        return `${header}\n${body}`;
      })
      .join('\n\n');
    await writeText(text);
    flashCopy('Copied!');
  }, [getResultParts, flashCopy]);

  const copyAll = useCallback(async () => {
    const parts = getResultParts();
    const text = parts
      .map((p) => {
        const header = p.columns.join('\t');
        const body = p.rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n');
        return `${header}\n${body}`;
      })
      .join('\n\n');
    await writeText(`${queryRef.current.trim()}\n\n${text}`);
    flashCopy('Copied!');
  }, [getResultParts, flashCopy]);

  /* ── Derived ──────────────────────────────────────────── */
  const hasConnections = !!sqlSettings && sqlSettings.connections.length > 0;
  const totalRows = result ? result.resultSets.reduce((s, rs) => s + rs.rows.length, 0) : 0;
  const totalCols = result ? result.resultSets.reduce((s, rs) => s + rs.columns.length, 0) : 0;
  const totalSelectedRows = Array.from(selectedRowsMap.values()).reduce(
    (sum, s) => sum + s.size,
    0,
  );
  const lineCount = query ? query.split('\n').length : 1;
  const charCount = query.length;

  const handleSelectionChange = useCallback((idx: number, sel: Set<number>) => {
    setSelectedRowsMap((prev) => {
      const next = new Map(prev);
      next.set(idx, sel);
      return next;
    });
  }, []);

  /* ── Render ───────────────────────────────────────────── */
  const railTrack = railCollapsed ? '36px 0 1fr' : `${railWidth}px 6px 1fr`;

  return (
    <div className="sql-app">
      <WindowTitleBar title="BorgDock SQL" meta={<Kbd>Ctrl+F10</Kbd>} />

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="sql-toolbar">
        <div className="sql-toolbar__connection">
          <div className="sql-conn-input">
            <TerminalIcon size={12} className="sql-conn-input__icon" />
            {hasConnections ? (
              <select
                data-sql-connection-select
                aria-label="Database connection"
                className="sql-conn-input__select"
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
              <span className="sql-conn-input__empty">No connections — open Settings</span>
            )}
            <ChevronDownIcon size={11} className="sql-conn-input__chev" />
          </div>

          {hasConnections && (
            <Button
              variant="ghost"
              size="sm"
              className="sql-toolbar__connected"
              leading={<CheckCircleIcon size={11} className="sql-toolbar__conn-dot" />}
              onClick={refreshSchema}
              disabled={schemaStatus === 'cold' || schemaStatus === 'refreshing'}
              title="Refresh schema"
            >
              {schemaStatus === 'cold' || schemaStatus === 'refreshing' ? (
                <>
                  <SpinnerIcon size={11} /> Loading
                </>
              ) : schemaStatus === 'error' ? (
                'Schema error'
              ) : (
                'Connected'
              )}
            </Button>
          )}
        </div>

        <span className="sql-toolbar__divider" />

        <Button
          variant="ghost"
          size="sm"
          leading={<PlusIcon size={11} />}
          onClick={newQuery}
          disabled={!activeSnippet && query.length === 0}
          title="Start a new untitled query"
        >
          New
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leading={<CheckCircleIcon size={11} />}
          disabled={!dirty || !activeSnippet}
          onClick={saveOverActive}
          title={activeSnippet ? `Save changes to "${activeSnippet.name}"` : 'No snippet active'}
        >
          Save <Kbd>{navigator.platform.toLowerCase().includes('mac') ? '⌘S' : 'Ctrl+S'}</Kbd>
        </Button>
        <Button variant="ghost" size="sm" leading={<CopyIcon size={11} />} onClick={openSaveAs}>
          Save as snippet…
        </Button>

        <span className="sql-toolbar__spacer" />

        <span className="sql-toolbar__hint">execute selection or full query</span>
        <Button
          variant="primary"
          size="sm"
          data-action="run-query"
          leading={isRunning ? <SpinnerIcon size={11} /> : <PlayIcon size={11} />}
          disabled={isRunning || !hasConnections || !query.trim()}
          onClick={() => {
            void runQuery();
          }}
        >
          {isRunning ? 'Running' : 'Run'}
          <Kbd>Ctrl+Enter</Kbd>
        </Button>
      </div>

      {/* ── Split layout ────────────────────────────────── */}
      <div
        ref={splitWrapRef}
        className={clsx('sql-split', railCollapsed && 'sql-split--collapsed')}
        style={{ gridTemplateColumns: railTrack }}
      >
        <SnippetsRail
          snippets={snippets}
          activeId={activeSnippetId}
          collapsed={railCollapsed}
          onToggleCollapsed={() => setRailCollapsed((v) => !v)}
          onLoad={loadSnippet}
          onToggleStar={toggleStar}
          onRename={rename}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onSaveAs={openSaveAs}
        />

        {!railCollapsed && (
          <div
            className="sql-split__handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize snippets rail"
            onMouseDown={(e) => {
              e.preventDefault();
              railResizing.current = true;
              document.body.classList.add('sql-resizing');
            }}
            onDoubleClick={() => {
              setRailWidth(RAIL_DEFAULT);
              try {
                localStorage.setItem(RAIL_WIDTH_KEY, String(RAIL_DEFAULT));
              } catch {
                /* ignore */
              }
            }}
            title="Drag to resize · double-click to reset"
          >
            <span className="sql-split__handle-grip" />
          </div>
        )}

        <div className="sql-content" ref={editorWrapRef}>
          <div className="sql-editor-pane" style={{ height: editorHeight }}>
            <header className="sql-editor-pane__header">
              <TerminalIcon size={11} className="sql-editor-pane__icon" />
              <span className="sql-editor-pane__name">
                {activeSnippet ? activeSnippet.name : 'Untitled'}
              </span>
              {dirty && <span className="sql-editor-pane__dirty">● modified</span>}
              {saveFlash && <Pill tone="success">saved</Pill>}
              {!activeSnippet && dirty && <Pill tone="warning">unsaved</Pill>}
              <span className="sql-editor-pane__spacer" />
              <span className="sql-editor-pane__counts bd-mono">
                {lineCount} lines · {charCount} chars
              </span>
            </header>
            <div data-sql-editor className="sql-editor-pane__body">
              <SqlEditor
                ref={editorRef}
                value={query}
                onChange={updateQuery}
                onRunQuery={runQuery}
                schema={schema}
                height={Math.max(EDITOR_MIN, editorHeight - 32)}
              />
            </div>
          </div>

          <div
            className="sql-resize-handle"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize editor"
            onMouseDown={(e) => {
              e.preventDefault();
              editorResizing.current = true;
              document.body.classList.add('sql-resizing-v');
            }}
            onDoubleClick={() => {
              setEditorHeight(EDITOR_DEFAULT);
              try {
                localStorage.setItem(EDITOR_HEIGHT_KEY, String(EDITOR_DEFAULT));
              } catch {
                /* ignore */
              }
            }}
          >
            <div className="sql-resize-grip" />
          </div>

          <ResultsPanel
            isRunning={isRunning}
            hasRun={hasRun}
            error={error}
            resultSets={result?.resultSets ?? []}
            executionTimeMs={result?.executionTimeMs ?? 0}
            selectedRowsMap={selectedRowsMap}
            onSelectionChange={handleSelectionChange}
            copyFlash={copyFlash}
            onCopyValues={copyValues}
            onCopyWithHeaders={copyWithHeaders}
            onCopyAll={copyAll}
          />
        </div>
      </div>

      <WindowStatusBar
        left={
          result && !error ? (
            <span className="sql-status-meta bd-mono">
              {totalRows.toLocaleString()} row{totalRows === 1 ? '' : 's'} ·{' '}
              {result.executionTimeMs} ms · {totalCols} col{totalCols === 1 ? '' : 's'}
              {totalSelectedRows > 0 && (
                <>
                  {' · '}
                  <span className="sql-status-meta__selected">{totalSelectedRows} selected</span>
                </>
              )}
              {result.resultSets.some((rs) => rs.truncated) && (
                <span className="sql-status-meta__truncated"> (truncated)</span>
              )}
            </span>
          ) : (
            <span className="sql-status-meta bd-mono">
              {snippets.length} snippet{snippets.length === 1 ? '' : 's'} ·{' '}
              {selectedConnection || 'no connection'}
            </span>
          )
        }
        right={
          <span className="sql-status-shortcuts bd-mono">
            <Kbd>Ctrl+S</Kbd> save · <Kbd>Ctrl+Shift+S</Kbd> save as · <Kbd>Ctrl+↵</Kbd> run
          </span>
        }
      />

      {savingNew && (
        <SaveSnippetDialog
          initialName={activeSnippet ? `${activeSnippet.name} (copy)` : 'Untitled query'}
          body={query}
          onSave={commitSaveAs}
          onCancel={() => setSavingNew(false)}
        />
      )}
    </div>
  );
}
