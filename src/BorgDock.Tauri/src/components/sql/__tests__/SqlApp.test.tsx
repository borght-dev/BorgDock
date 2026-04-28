import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqlApp } from '../SqlApp';

vi.mock('../SqlEditor', () => ({
  SqlEditor: ({
    value,
    onChange,
    onRunQuery,
  }: {
    value: string;
    onChange: (v: string) => void;
    onRunQuery: () => void;
  }) => (
    <textarea
      data-testid="sql-editor-stub"
      placeholder="SELECT * FROM ..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onRunQuery();
        }
      }}
    />
  ),
}));

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

  it('persists query to localStorage', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    const textarea = screen.getByPlaceholderText('SELECT * FROM ...') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'SELECT * FROM users' } });
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

    // Status bar should show row count and execution time
    expect(screen.getByText(/2 rows/)).toBeTruthy();
    expect(screen.getByText('42ms')).toBeTruthy();
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
    // body cursor should be set
    expect(document.body.style.cursor).toBe('row-resize');

    // Simulate mouseup to clean up
    fireEvent.mouseUp(document);
    expect(document.body.style.cursor).toBe('');
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
