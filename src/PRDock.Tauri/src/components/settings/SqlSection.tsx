import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import type { SqlServerConnection, SqlSettings } from '@/types';

interface SqlSectionProps {
  sql: SqlSettings;
  onChange: (sql: SqlSettings) => void;
}

export function SqlSection({ sql, onChange }: SqlSectionProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const addConnection = () => {
    const newConn: SqlServerConnection = {
      name: `Connection ${sql.connections.length + 1}`,
      server: '',
      port: 1433,
      database: '',
      authentication: 'windows',
      trustServerCertificate: true,
    };
    const connections = [...sql.connections, newConn];
    onChange({ ...sql, connections });
    setEditingIndex(connections.length - 1);
  };

  const updateConnection = (index: number, partial: Partial<SqlServerConnection>) => {
    const connections = sql.connections.map((c, i) =>
      i === index ? { ...c, ...partial } : c,
    );
    onChange({ ...sql, connections });
  };

  const removeConnection = (index: number) => {
    const connections = sql.connections.filter((_, i) => i !== index);
    onChange({ ...sql, connections });
    if (editingIndex === index) setEditingIndex(null);
  };

  return (
    <div className="space-y-2.5">
      {sql.connections.map((conn, index) => (
        <div key={index}>
          <div className="flex items-center justify-between">
            <button
              className="text-xs font-medium truncate text-left flex-1"
              style={{ color: 'var(--color-text-primary)' }}
              onClick={() => setEditingIndex(editingIndex === index ? null : index)}
            >
              {conn.name || 'Unnamed'}
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <button
                className="text-[10px] px-1"
                style={{ color: 'var(--color-text-muted)' }}
                onClick={() => setEditingIndex(editingIndex === index ? null : index)}
              >
                {editingIndex === index ? 'Collapse' : 'Edit'}
              </button>
              <button
                className="text-[10px] px-1"
                style={{ color: 'var(--color-status-red)' }}
                onClick={() => removeConnection(index)}
              >
                Delete
              </button>
            </div>
          </div>

          {editingIndex === index && (
            <ConnectionEditor
              conn={conn}
              onChange={(partial) => updateConnection(index, partial)}
            />
          )}

          {index < sql.connections.length - 1 && (
            <div className="mt-2 h-px" style={{ backgroundColor: 'var(--color-separator)' }} />
          )}
        </div>
      ))}

      <button
        className="w-full rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        style={{
          borderColor: 'var(--color-subtle-border)',
          color: 'var(--color-text-secondary)',
        }}
        onClick={addConnection}
      >
        + Add Connection
      </button>
    </div>
  );
}

function ConnectionEditor({
  conn,
  onChange,
}: {
  conn: SqlServerConnection;
  onChange: (partial: Partial<SqlServerConnection>) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      await invoke<string>('test_sql_connection', {
        server: conn.server,
        port: conn.port,
        database: conn.database,
        authentication: conn.authentication,
        username: conn.username ?? null,
        password: conn.password ?? null,
        trustServerCertificate: conn.trustServerCertificate,
      });
      setTestStatus('success');
    } catch (err) {
      setTestStatus('error');
      setTestError(String(err));
    }
  };

  return (
    <div className="mt-2 space-y-2 pl-1">
      <FieldLabel label="Name">
        <input
          className="field-input w-full"
          value={conn.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Dev DB"
        />
      </FieldLabel>

      <FieldLabel label="Server">
        <input
          className="field-input w-full"
          value={conn.server}
          onChange={(e) => onChange({ server: e.target.value })}
          placeholder="localhost"
        />
      </FieldLabel>

      <FieldLabel label="Port">
        <input
          type="number"
          className="field-input w-24"
          value={conn.port}
          onChange={(e) => onChange({ port: Number(e.target.value) || 1433 })}
        />
      </FieldLabel>

      <FieldLabel label="Database">
        <input
          className="field-input w-full"
          value={conn.database}
          onChange={(e) => onChange({ database: e.target.value })}
          placeholder="MyDatabase"
        />
      </FieldLabel>

      <FieldLabel label="Authentication">
        <select
          className="field-input w-full"
          value={conn.authentication}
          onChange={(e) => onChange({ authentication: e.target.value as 'windows' | 'sql' })}
        >
          <option value="windows">Windows Integrated</option>
          <option value="sql">SQL Server</option>
        </select>
      </FieldLabel>

      {conn.authentication === 'sql' && (
        <>
          <FieldLabel label="Username">
            <input
              className="field-input w-full"
              value={conn.username ?? ''}
              onChange={(e) => onChange({ username: e.target.value })}
              placeholder="sa"
            />
          </FieldLabel>

          <FieldLabel label="Password">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="field-input w-full pr-8"
                value={conn.password ?? ''}
                onChange={(e) => onChange({ password: e.target.value })}
              />
              <button
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px]"
                style={{ color: 'var(--color-text-muted)' }}
                onClick={() => setShowPassword((p) => !p)}
                type="button"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </FieldLabel>
        </>
      )}

      <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
        <input
          type="checkbox"
          checked={conn.trustServerCertificate}
          onChange={(e) => onChange({ trustServerCertificate: e.target.checked })}
          className="accent-[var(--color-accent)]"
        />
        Trust Server Certificate
      </label>

      <div className="flex items-center gap-2">
        <button
          className="rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors disabled:opacity-50"
          style={{
            color: 'var(--color-action-secondary-fg)',
            backgroundColor: 'var(--color-action-secondary-bg)',
            borderColor: 'var(--color-subtle-border)',
          }}
          onClick={handleTest}
          disabled={testStatus === 'testing' || !conn.server}
        >
          {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
        </button>
        {testStatus === 'success' && (
          <span className="text-[10px]" style={{ color: 'var(--color-status-green)' }}>
            Connected
          </span>
        )}
        {testStatus === 'error' && (
          <span className="text-[10px]" style={{ color: 'var(--color-status-red)' }}>
            {testError || 'Failed'}
          </span>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
