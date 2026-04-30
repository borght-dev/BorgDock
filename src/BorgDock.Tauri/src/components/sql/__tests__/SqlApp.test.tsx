import { act, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqlApp } from '../SqlApp';

vi.mock('../SqlEditor', () => {
  // Mock that mirrors the real SqlEditor's run-text contract:
  // returns the textarea selection if non-empty, else the full value.
  const SqlEditor = forwardRef<
    { getRunText: () => string | null },
    {
      value: string;
      onChange: (v: string) => void;
      onRunQuery: (text: string) => void;
    }
  >(function SqlEditor({ value, onChange, onRunQuery }, ref) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const computeRunText = () => {
      const ta = taRef.current;
      if (!ta) return value;
      const { selectionStart, selectionEnd } = ta;
      if (
        typeof selectionStart === 'number' &&
        typeof selectionEnd === 'number' &&
        selectionStart !== selectionEnd
      ) {
        return ta.value.slice(selectionStart, selectionEnd);
      }
      return ta.value;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: computeRunText reads taRef.current; the handle should never change identity.
    useImperativeHandle(ref, () => ({ getRunText: computeRunText }), []);
    return (
      <textarea
        ref={taRef}
        data-testid="sql-editor-stub"
        placeholder="SELECT * FROM ..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onRunQuery(computeRunText());
          }
        }}
      />
    );
  });
  return { SqlEditor };
});

const mockClose = vi.fn(() => Promise.resolve());
const mockOnMoved = vi.fn(() => Promise.resolve(() => {}));
const mockOuterPosition = vi.fn(() => Promise.resolve({ x: 100, y: 200 }));
const mockScaleFactor = vi.fn(() => Promise.resolve(1));
const mockSetPosition = vi.fn(() => Promise.resolve());
const mockMinimize = vi.fn(() => Promise.resolve());
const mockMaximize = vi.fn(() => Promise.resolve());
const mockUnmaximize = vi.fn(() => Promise.resolve());
const mockIsMaximized = vi.fn(() => Promise.resolve(false));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: mockClose,
    onMoved: mockOnMoved,
    outerPosition: mockOuterPosition,
    scaleFactor: mockScaleFactor,
    setPosition: mockSetPosition,
    minimize: mockMinimize,
    maximize: mockMaximize,
    unmaximize: mockUnmaximize,
    isMaximized: mockIsMaximized,
  })),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: vi.fn((x: number, y: number) => ({ x, y })),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(() => Promise.resolve()),
}));

describe('SqlApp', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();

    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          sql: {
            connections: [
              {
                name: 'DevDB',
                server: 'localhost',
                port: 1433,
                database: 'test',
                authentication: 'sql',
                trustServerCertificate: true,
              },
            ],
            lastUsedConnection: 'DevDB',
          },
          ui: { theme: 'system' },
        });
      }
      if (cmd === 'execute_sql_query') {
        return Promise.resolve({
          resultSets: [
            {
              columns: ['id', 'name'],
              rows: [
                ['1', 'Alice'],
                ['2', 'Bob'],
              ],
              rowCount: 2,
              truncated: false,
            },
          ],
          executionTimeMs: 42,
          totalRowCount: 2,
        });
      }
      if (cmd === 'cache_load_sql_schema') return Promise.resolve(null);
      if (cmd === 'fetch_sql_schema') {
        return Promise.resolve({
          database: 'TestDb',
          fetchedAt: '2026-04-28T00:00:00Z',
          tables: [],
        });
      }
      if (cmd === 'cache_save_sql_schema') return Promise.resolve(undefined);
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the SQL app with title bar', async () => {
    await act(async () => {
      render(<SqlApp />);
    });
    expect(screen.getByText('BorgDock SQL')).toBeTruthy();
  });

  it('renders the Run button', async () => {
    await act(async () => {
      render(<SqlApp />);
    });
    expect(screen.getByText('Run')).toBeTruthy();
  });

  it('renders the Ctrl+Enter hint', async () => {
    await act(async () => {
      render(<SqlApp />);
    });
    expect(screen.getByText('Ctrl+Enter')).toBeTruthy();
  });

  it('renders the connection selector', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const select = document.querySelector('select');
    expect(select).toBeTruthy();
  });

  it('renders the SQL textarea', async () => {
    await act(async () => {
      render(<SqlApp />);
    });
    expect(screen.getByPlaceholderText('SELECT * FROM ...')).toBeTruthy();
  });

  it('updates query text on input', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    });
    expect(textarea.value).toBe('SELECT 1');
  });

  it('runs query on Ctrl+Enter', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT * FROM test' } });
    });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    });

    expect(invoke).toHaveBeenCalledWith('execute_sql_query', {
      connectionName: 'DevDB',
      query: 'SELECT * FROM test',
    });
  });

  it('runs query on Meta+Enter (Mac)', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    });

    expect(invoke).toHaveBeenCalledWith('execute_sql_query', {
      connectionName: 'DevDB',
      query: 'SELECT 1',
    });
  });

  it('runs query on Run button click', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    expect(invoke).toHaveBeenCalledWith('execute_sql_query', {
      connectionName: 'DevDB',
      query: 'SELECT 1',
    });
  });

  it('runs only the highlighted selection when one exists (Ctrl+Enter)', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    const fullDoc = 'SELECT 1;\nSELECT 2;\nSELECT 3;';
    await act(async () => {
      fireEvent.change(textarea, { target: { value: fullDoc } });
    });

    // Highlight just the second statement.
    const start = fullDoc.indexOf('SELECT 2;');
    const end = start + 'SELECT 2;'.length;
    textarea.focus();
    textarea.setSelectionRange(start, end);

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    });

    expect(invoke).toHaveBeenCalledWith('execute_sql_query', {
      connectionName: 'DevDB',
      query: 'SELECT 2;',
    });
  });

  it('runs only the highlighted selection when Run button is clicked', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    const fullDoc = 'SELECT a;\nSELECT b;';
    await act(async () => {
      fireEvent.change(textarea, { target: { value: fullDoc } });
    });

    const start = fullDoc.indexOf('SELECT b;');
    const end = start + 'SELECT b;'.length;
    textarea.focus();
    textarea.setSelectionRange(start, end);

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    expect(invoke).toHaveBeenCalledWith('execute_sql_query', {
      connectionName: 'DevDB',
      query: 'SELECT b;',
    });
  });

  it('runs the full document when no selection exists', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    const fullDoc = 'SELECT 1;\nSELECT 2;';
    await act(async () => {
      fireEvent.change(textarea, { target: { value: fullDoc } });
    });

    // Caret only — no selection.
    textarea.focus();
    textarea.setSelectionRange(0, 0);

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    expect(invoke).toHaveBeenCalledWith('execute_sql_query', {
      connectionName: 'DevDB',
      query: fullDoc,
    });
  });

  it('displays error when query fails', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          sql: {
            connections: [
              {
                name: 'DevDB',
                server: 'localhost',
                port: 1433,
                database: 'test',
                authentication: 'sql',
                trustServerCertificate: true,
              },
            ],
            lastUsedConnection: 'DevDB',
          },
          ui: { theme: 'system' },
        });
      }
      if (cmd === 'execute_sql_query') {
        return Promise.reject('Connection refused');
      }
      return Promise.resolve();
    });

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    expect(screen.getByText('Connection refused')).toBeTruthy();
  });

  it('shows "No connections" when there are no connections', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          sql: { connections: [] },
          ui: { theme: 'system' },
        });
      }
      return Promise.resolve();
    });

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText(/No connections/)).toBeTruthy();
  });

  it('closes window on Escape key', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(mockClose).toHaveBeenCalled();
  });

  it('does not close window when Escape was preventDefaulted (autocomplete dismiss)', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    // Simulate an inner consumer (CodeMirror autocomplete dismiss) handling
    // Escape first by calling preventDefault. The capture-phase listener runs
    // before SqlApp's bubble-phase document listener.
    const interceptor = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    document.addEventListener('keydown', interceptor, true);

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    document.removeEventListener('keydown', interceptor, true);

    expect(mockClose).not.toHaveBeenCalled();
  });

  it('persists query to localStorage (debounced)', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT * FROM users' } });
    });

    // Write is debounced; advance past the debounce window to flush.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(localStorage.getItem('borgdock-sql-last-query')).toBe('SELECT * FROM users');
  });

  it('renders the SqlEditor component', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    expect(document.querySelector('[data-testid="sql-editor-stub"]')).not.toBeNull();
  });

  it('renders the resize handle', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    const handle = document.querySelector('.sql-resize-handle');
    expect(handle).toBeTruthy();
  });

  it('displays results after successful query', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT * FROM test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Result-set pill shows row count; status bar shows execution time + cols.
    expect(screen.getAllByText(/2 rows/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/42 ms/).length).toBeGreaterThan(0);
  });

  it('shows copy buttons after query results', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('Values')).toBeTruthy();
    expect(screen.getByText('+ Headers')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
  });

  it('copies values when Values button is clicked', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Values'));
    });

    expect(writeText).toHaveBeenCalled();
  });

  it('copies with headers when + Headers button is clicked', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('+ Headers'));
    });

    expect(writeText).toHaveBeenCalled();
  });

  it('copies all (query + results) when All button is clicked', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('All'));
    });

    expect(writeText).toHaveBeenCalled();
  });

  it('shows empty results message for queries with no rows', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          sql: {
            connections: [
              {
                name: 'DevDB',
                server: 'localhost',
                port: 1433,
                database: 'test',
                authentication: 'sql',
                trustServerCertificate: true,
              },
            ],
            lastUsedConnection: 'DevDB',
          },
          ui: { theme: 'system' },
        });
      }
      if (cmd === 'execute_sql_query') {
        return Promise.resolve({
          resultSets: [{ columns: [], rows: [], rowCount: 0, truncated: false }],
          executionTimeMs: 5,
          totalRowCount: 0,
        });
      }
      return Promise.resolve();
    });

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'DELETE FROM test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText(/Query executed/)).toBeTruthy();
  });

  it('does not run query when input is empty', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Leave textarea empty and try to run
    await act(async () => {
      fireEvent.click(screen.getByText('Run'));
    });

    // execute_sql_query should NOT have been called (only load_settings)
    const calls = vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'execute_sql_query');
    expect(calls.length).toBe(0);
  });

  it('restores saved query from localStorage', async () => {
    localStorage.setItem('borgdock-sql-last-query', 'SELECT * FROM saved');

    await act(async () => {
      render(<SqlApp />);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    expect(textarea.value).toBe('SELECT * FROM saved');
  });

  it('starts resize on mousedown on resize handle', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    const handle = document.querySelector('.sql-resize-handle')!;
    fireEvent.mouseDown(handle);
    // body class signals an active row-resize drag
    expect(document.body.classList.contains('sql-resizing-v')).toBe(true);

    // Simulate mouseup to clean up
    fireEvent.mouseUp(document);
    expect(document.body.classList.contains('sql-resizing-v')).toBe(false);
  });

  it('exposes [data-sql-editor] and [data-sql-connection-select] hooks', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(document.querySelector('[data-sql-editor]')).not.toBeNull();
    expect(document.querySelector('[data-sql-connection-select]')).not.toBeNull();
  });

  it('Run button carries data-action="run-query"', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(document.querySelector('[data-action="run-query"]')).not.toBeNull();
  });

  it('changes connection selector', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          sql: {
            connections: [
              {
                name: 'DevDB',
                server: 'localhost',
                port: 1433,
                database: 'test',
                authentication: 'sql',
                trustServerCertificate: true,
              },
              {
                name: 'ProdDB',
                server: 'prod',
                port: 1433,
                database: 'prod',
                authentication: 'sql',
                trustServerCertificate: true,
              },
            ],
            lastUsedConnection: 'DevDB',
          },
          ui: { theme: 'system' },
        });
      }
      return Promise.resolve();
    });

    await act(async () => {
      render(<SqlApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const select = document.querySelector('select')!;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'ProdDB' } });
    });

    expect((select as HTMLSelectElement).value).toBe('ProdDB');
  });
});
