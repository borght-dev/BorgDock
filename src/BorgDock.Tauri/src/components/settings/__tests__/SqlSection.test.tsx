import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqlSettings } from '@/types/settings';
import { SqlSection } from '../SqlSection';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('OK'),
}));

function makeSql(overrides?: Partial<SqlSettings>): SqlSettings {
  return {
    connections: [],
    readOnlyByDefault: false,
    confirmDestructiveWithoutWhere: false,
    ...overrides,
  };
}

const devConn = {
  name: 'Dev DB',
  server: 'localhost',
  port: 1433,
  database: 'DevDB',
  authentication: 'windows' as const,
  trustServerCertificate: true,
};

describe('SqlSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  // 1. Empty state
  it('renders empty state with no connections', () => {
    render(<SqlSection sql={makeSql()} onChange={onChange} />);
    expect(screen.getByText('No SQL connections yet.')).toBeDefined();
  });

  // 2. One row per connection with name + server
  it('renders one row per connection with name and server', () => {
    const sql = makeSql({
      connections: [
        devConn,
        { name: 'Staging', server: 'staging-host', port: 1433, database: 'StagingDB', authentication: 'windows', trustServerCertificate: true },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    // Connection names appear in row headings (may also appear in the Select dropdown as options)
    expect(screen.getAllByText('Dev DB').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Staging').length).toBeGreaterThanOrEqual(1);
    // Server info appears in the subtitle text
    expect(screen.getByText(/localhost/)).toBeDefined();
    expect(screen.getByText(/staging-host/)).toBeDefined();
  });

  // 3. "Add connection" button opens the editor dialog
  it('opens editor dialog when Add connection is clicked', () => {
    render(<SqlSection sql={makeSql()} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ Add connection'));
    // Dialog should appear with "Add connection" heading
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Add connection')).toBeDefined();
  });

  // 4. Edit button opens dialog with that connection's data
  it('opens edit dialog with connection data when Edit is clicked', () => {
    const sql = makeSql({ connections: [devConn] });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Edit connection')).toBeDefined();
    // Connection name is pre-filled
    const nameInput = screen.getByLabelText('Connection name') as HTMLInputElement;
    expect(nameInput.value).toBe('Dev DB');
  });

  // 5. Delete button removes the connection via onChange
  it('calls onChange with connection removed when Delete is clicked', () => {
    const sql = makeSql({
      connections: [
        devConn,
        { name: 'Staging', server: 'staging-host', port: 1433, database: 'StagingDB', authentication: 'windows', trustServerCertificate: true },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    // Delete the first connection (Dev DB)
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]!);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        connections: [expect.objectContaining({ name: 'Staging' })],
      }),
    );
  });

  // 6. Default-connection Select includes "(none)" plus all named connections
  it('default-connection Select shows (none) and all connection names', () => {
    const sql = makeSql({
      connections: [
        devConn,
        { name: 'Staging', server: 'staging-host', port: 1433, database: 'StagingDB', authentication: 'windows', trustServerCertificate: true },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    const select = screen.getByLabelText('Default SQL connection') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('');
    expect(optionValues).toContain('Dev DB');
    expect(optionValues).toContain('Staging');
    const optionLabels = Array.from(select.options).map((o) => o.text);
    expect(optionLabels).toContain('(none)');
  });

  // 7. Two ToggleRows for the defaults
  it('renders Read-only by default toggle row', () => {
    render(<SqlSection sql={makeSql()} onChange={onChange} />);
    expect(screen.getByText('Read-only by default')).toBeDefined();
  });

  it('renders Confirm DELETE / UPDATE without WHERE toggle row', () => {
    render(<SqlSection sql={makeSql()} onChange={onChange} />);
    expect(screen.getByText('Confirm DELETE / UPDATE without WHERE')).toBeDefined();
  });

  // Dialog: Save button calls onSave for a new connection
  it('saves new connection via dialog Save button', () => {
    render(<SqlSection sql={makeSql()} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ Add connection'));

    // Clear the default name and type a new one
    const nameInput = screen.getByLabelText('Connection name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My Conn' } });

    fireEvent.click(screen.getByText('Save'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        connections: [expect.objectContaining({ name: 'My Conn' })],
      }),
    );
    // Dialog should close
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Dialog: Cancel button closes dialog without calling onChange
  it('Cancel closes the dialog without calling onChange', () => {
    render(<SqlSection sql={makeSql()} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ Add connection'));
    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  // Dialog: Test connection
  it('tests connection successfully from dialog', async () => {
    const sql = makeSql({ connections: [devConn] });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeDefined();
    });
  });

  it('shows error on failed connection test', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce('Connection refused');

    const sql = makeSql({ connections: [devConn] });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeDefined();
    });
  });

  it('disables test button when server is empty', () => {
    const sql = makeSql({
      connections: [{ ...devConn, server: '' }],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const testBtn = screen.getByText('Test connection') as HTMLButtonElement;
    expect(testBtn.closest('button')?.disabled).toBe(true);
  });

  // Dialog: SQL auth shows username/password fields
  it('shows username and password fields for sql auth in dialog', () => {
    const sql = makeSql({
      connections: [
        { ...devConn, authentication: 'sql', username: 'sa', password: 'secret' },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByLabelText('Username')).toBeDefined();
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');
  });

  it('toggles password visibility in dialog', () => {
    const sql = makeSql({
      connections: [
        { ...devConn, authentication: 'sql', username: 'sa', password: 'secret' },
      ],
    });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    fireEvent.click(screen.getByText('Show'));
    expect(passwordInput.type).toBe('text');
  });

  it('switches authentication to SQL Server in dialog', () => {
    const sql = makeSql({ connections: [devConn] });
    render(<SqlSection sql={sql} onChange={onChange} />);
    fireEvent.click(screen.getByText('Edit'));

    // "SQL Server" appears both in the section heading and in the Seg2 button;
    // use getByRole to target the Seg2 button specifically (aria-pressed="false")
    const sqlServerBtn = screen.getAllByText('SQL Server').find(
      (el) => el.closest('button') !== null,
    );
    expect(sqlServerBtn).toBeDefined();
    fireEvent.click(sqlServerBtn!.closest('button')!);

    // SQL auth fields should now appear
    expect(screen.getByLabelText('Username')).toBeDefined();
  });

  it('anchor divs exist for search index', () => {
    const { container } = render(<SqlSection sql={makeSql()} onChange={onChange} />);
    expect(container.querySelector('#field-connections')).not.toBeNull();
    expect(container.querySelector('#field-read-only-default')).not.toBeNull();
    expect(container.querySelector('#field-confirm-destructive')).not.toBeNull();
    // Field anchorId prefixes with "field-" automatically
    expect(container.querySelector('#field-default-connection')).not.toBeNull();
  });
});
