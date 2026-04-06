import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SqlApp } from '../SqlApp';

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
              rows: [['1', 'Alice'], ['2', 'Bob']],
              rowCount: 2,
              truncated: false,
            },
          ],
          executionTimeMs: 42,
          totalRowCount: 2,
        });
      }
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
    expect(screen.getByText('PRDock SQL')).toBeTruthy();
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
            connections: [{ name: 'DevDB', server: 'localhost', port: 1433, database: 'test', authentication: 'sql', trustServerCertificate: true }],
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

    expect(localStorage.getItem('prdock-sql-last-query')).toBe('SELECT * FROM users');
  });

  it('renders line numbers in the gutter', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    const gutterLines = document.querySelectorAll('.sql-gutter-line');
    expect(gutterLines.length).toBeGreaterThanOrEqual(6);
  });

  it('renders the resize handle', async () => {
    await act(async () => {
      render(<SqlApp />);
    });

    const handle = document.querySelector('.sql-resize-handle');
    expect(handle).toBeTruthy();
  });
});
