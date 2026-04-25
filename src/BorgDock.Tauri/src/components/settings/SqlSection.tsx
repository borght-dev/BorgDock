import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import type { SqlServerConnection, SqlSettings } from '@/types';
import { parseError } from '@/utils/parse-error';
import { Button, Chip, Dot, IconButton, Input, Pill } from '@/components/shared/primitives';

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
    const connections = sql.connections.map((c, i) => (i === index ? { ...c, ...partial } : c));
    onChange({ ...sql, connections });
  };

  const removeConnection = (index: number) => {
    const connections = sql.connections.filter((_, i) => i !== index);
    onChange({ ...sql, connections });
    if (editingIndex === index) setEditingIndex(null);
  };

  return (
    <div className="space-y-2.5" data-settings-section="sql-server">
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingIndex(editingIndex === index ? null : index)}
              >
                {editingIndex === index ? 'Collapse' : 'Edit'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => removeConnection(index)}
              >
                Delete
              </Button>
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

      <Button
        variant="secondary"
        size="sm"
        className="w-full justify-center"
        onClick={addConnection}
      >
        + Add Connection
      </Button>
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
      setTestError(parseError(err).message);
    }
  };

  return (
    <div className="mt-2 space-y-2 pl-1">
      <FieldLabel label="Name">
        <Input
          className="w-full"
          value={conn.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Dev DB"
        />
      </FieldLabel>

      <FieldLabel label="Server">
        <Input
          className="w-full"
          value={conn.server}
          onChange={(e) => onChange({ server: e.target.value })}
          placeholder="localhost"
        />
      </FieldLabel>

      <FieldLabel label="Port">
        <Input
          type="number"
          className="w-24"
          value={conn.port}
          onChange={(e) => onChange({ port: Number(e.target.value) || 1433 })}
        />
      </FieldLabel>

      <FieldLabel label="Database">
        <Input
          className="w-full"
          value={conn.database}
          onChange={(e) => onChange({ database: e.target.value })}
          placeholder="MyDatabase"
        />
      </FieldLabel>

      <FieldLabel label="Authentication">
        <div className="flex gap-1">
          <Chip
            active={conn.authentication === 'windows'}
            onClick={() => onChange({ authentication: 'windows' })}
            data-segmented-option
            className="flex-1 justify-center"
          >
            Windows
          </Chip>
          <Chip
            active={conn.authentication === 'sql'}
            onClick={() => onChange({ authentication: 'sql' })}
            data-segmented-option
            className="flex-1 justify-center"
          >
            SQL Server
          </Chip>
        </div>
      </FieldLabel>

      {conn.authentication === 'sql' && (
        <>
          <FieldLabel label="Username">
            <Input
              className="w-full"
              value={conn.username ?? ''}
              onChange={(e) => onChange({ username: e.target.value })}
              placeholder="sa"
            />
          </FieldLabel>

          <FieldLabel label="Password">
            <Input
              type={showPassword ? 'text' : 'password'}
              className="w-full"
              value={conn.password ?? ''}
              onChange={(e) => onChange({ password: e.target.value })}
              trailing={
                <IconButton
                  size={22}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  icon={<span>{showPassword ? 'Hide' : 'Show'}</span>}
                  onClick={() => setShowPassword((p) => !p)}
                  type="button"
                />
              }
            />
          </FieldLabel>
        </>
      )}

      <label
        className="flex items-center gap-2 text-[11px]"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <input
          type="checkbox"
          checked={conn.trustServerCertificate}
          onChange={(e) => onChange({ trustServerCertificate: e.target.checked })}
          className="accent-[var(--color-accent)]"
        />
        Trust Server Certificate
      </label>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleTest}
          disabled={testStatus === 'testing' || !conn.server}
        >
          {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
        </Button>
        {testStatus === 'success' && (
          <Pill tone="success" icon={<Dot tone="green" />}>
            Connected
          </Pill>
        )}
        {testStatus === 'error' && (
          <Pill tone="error" icon={<Dot tone="red" />}>
            {testError || 'Failed'}
          </Pill>
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
