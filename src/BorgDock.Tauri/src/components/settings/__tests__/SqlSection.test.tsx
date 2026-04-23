import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqlSettings } from '@/types';
import { SqlSection } from '../SqlSection';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('OK'),
}));

function makeSql(overrides?: Partial<SqlSettings>): SqlSettings {
  return {
    connections: [],
    ...overrides,
  };
}

describe('SqlSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('renders add connection button', () => {
    render(<SqlSection sql={makeSql()} onChange={onChange} />);
    expect(screen.getByText('+ Add Connection')).toBeDefined();
  });

  it('adds a connection', () => {
    render(<SqlSection sql={makeSql()} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ Add Connection'));

    expect(onChange).toHaveBeenCalledWith({
      connections: [
        expect.objectContaining({
          name: 'Connection 1',
          server: '',
          port: 1433,
          database: '',
          authentication: 'windows',
          trustServerCertificate: true,
        }),
      ],
    });
  });

  it('renders existing connections', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    expect(screen.getByText('Dev DB')).toBeDefined();
  });

  it('renders Unnamed for connections without name', () => {
    const sql = makeSql({
      connections: [
        {
          name: '',
          server: 'localhost',
          port: 1433,
          database: '',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    expect(screen.getByText('Unnamed')).toBeDefined();
  });

  it('expands connection editor on Edit click', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByPlaceholderText('Dev DB')).toBeDefined();
    expect(screen.getByPlaceholderText('localhost')).toBeDefined();
    expect(screen.getByPlaceholderText('MyDatabase')).toBeDefined();
  });

  it('collapses on Collapse click', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Collapse')).toBeDefined();

    fireEvent.click(screen.getByText('Collapse'));
    expect(screen.getByText('Edit')).toBeDefined();
  });

  it('deletes a connection', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
        {
          name: 'Staging',
          server: 'staging-host',
          port: 1433,
          database: 'StagingDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]!);

    expect(onChange).toHaveBeenCalledWith({
      connections: [expect.objectContaining({ name: 'Staging' })],
    });
  });

  it('updates connection name', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    fireEvent.change(screen.getByPlaceholderText('Dev DB'), {
      target: { value: 'Production DB' },
    });

    expect(onChange).toHaveBeenCalledWith({
      connections: [expect.objectContaining({ name: 'Production DB' })],
    });
  });

  it('updates server', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    fireEvent.change(screen.getByPlaceholderText('localhost'), {
      target: { value: 'prod-server' },
    });

    expect(onChange).toHaveBeenCalledWith({
      connections: [expect.objectContaining({ server: 'prod-server' })],
    });
  });

  it('updates port', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const portInput = screen.getByDisplayValue('1433');
    fireEvent.change(portInput, { target: { value: '5432' } });

    expect(onChange).toHaveBeenCalledWith({
      connections: [expect.objectContaining({ port: 5432 })],
    });
  });

  it('switches authentication to sql and shows username/password', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    fireEvent.change(screen.getByDisplayValue('Windows Integrated'), {
      target: { value: 'sql' },
    });

    expect(onChange).toHaveBeenCalledWith({
      connections: [expect.objectContaining({ authentication: 'sql' })],
    });
  });

  it('shows username and password fields for sql auth', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'sql',
          username: 'sa',
          password: 'secret',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByPlaceholderText('sa')).toBeDefined();
    // Password is rendered as password type
    const passwordInput = screen.getByDisplayValue('secret') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');
  });

  it('toggles password visibility in sql auth', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'sql',
          username: 'sa',
          password: 'secret',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const passwordInput = screen.getByDisplayValue('secret') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    fireEvent.click(screen.getByText('Show'));
    expect(passwordInput.type).toBe('text');
  });

  it('toggles trust server certificate', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith({
      connections: [expect.objectContaining({ trustServerCertificate: false })],
    });
  });

  it('tests connection successfully', async () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeDefined();
    });
  });

  it('shows error on failed connection test', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce('Connection refused');

    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: 'localhost',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeDefined();
    });
  });

  it('disables test button when server is empty', () => {
    const sql = makeSql({
      connections: [
        {
          name: 'Dev DB',
          server: '',
          port: 1433,
          database: 'DevDB',
          authentication: 'windows',
          trustServerCertificate: true,
        },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const testBtn = screen.getByText('Test Connection') as HTMLButtonElement;
    expect(testBtn.disabled).toBe(true);
  });
});
