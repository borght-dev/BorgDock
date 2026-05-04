import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { parseError } from '@/utils/parse-error';
import { Button, Dot, Pill } from '@/components/shared/primitives';
import { Field, Seg2, TextInput, Checkbox } from '@/components/shared/primitives';
import type { SqlServerConnection, SqlSettings } from '@/types/settings';

interface Props {
  index: number | 'new' | null;
  sql: SqlSettings;
  onClose: () => void;
  onSave: (next: SqlServerConnection[]) => void;
}

const blank: SqlServerConnection = {
  name: '',
  server: '',
  port: 1433,
  database: '',
  authentication: 'windows',
  trustServerCertificate: true,
};

export function ConnectionEditorDialog({ index, sql, onClose, onSave }: Props) {
  const editing =
    index === 'new'
      ? { ...blank, name: `Connection ${sql.connections.length + 1}` }
      : index !== null
        ? sql.connections[index]
        : null;
  const [draft, setDraft] = useState<SqlServerConnection | null>(editing ?? null);
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  if (index === null || draft === null) return null;

  const update = (partial: Partial<SqlServerConnection>) => setDraft({ ...draft, ...partial });

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      await invoke<string>('test_sql_connection', {
        server: draft.server,
        port: draft.port,
        database: draft.database,
        authentication: draft.authentication,
        username: draft.username ?? null,
        password: draft.password ?? null,
        trustServerCertificate: draft.trustServerCertificate,
      });
      setTestStatus('success');
    } catch (err) {
      setTestStatus('error');
      setTestError(parseError(err).message);
    }
  };

  const handleSave = () => {
    const next = [...sql.connections];
    if (index === 'new') {
      next.push(draft);
    } else {
      next[index] = draft;
    }
    onSave(next);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="SQL connection editor"
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay-bg)]"
    >
      <div className="w-[480px] max-h-[80vh] overflow-auto rounded-lg bg-[var(--color-surface)] p-5 shadow-xl">
        <h3 className="mb-4 text-sm font-semibold text-[var(--color-text-primary)]">
          {index === 'new' ? 'Add connection' : 'Edit connection'}
        </h3>

        <Field label="Name">
          <TextInput
            ariaLabel="Connection name"
            value={draft.name}
            onChange={(name) => update({ name })}
            placeholder="Dev DB"
          />
        </Field>
        <Field label="Server">
          <TextInput
            ariaLabel="Server"
            value={draft.server}
            onChange={(server) => update({ server })}
            placeholder="localhost"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Port" dense>
            <TextInput
              ariaLabel="Port"
              value={String(draft.port)}
              onChange={(v) => update({ port: Number(v) || 1433 })}
              type="number"
              mono
            />
          </Field>
          <Field label="Database" dense>
            <TextInput
              ariaLabel="Database"
              value={draft.database}
              onChange={(database) => update({ database })}
              placeholder="MyDb"
            />
          </Field>
        </div>
        <Field label="Authentication">
          <Seg2
            value={draft.authentication}
            options={[
              { value: 'windows', label: 'Windows' },
              { value: 'sql', label: 'SQL Server' },
            ]}
            onChange={(v) => update({ authentication: v as 'windows' | 'sql' })}
          />
        </Field>

        {draft.authentication === 'sql' && (
          <>
            <Field label="Username">
              <TextInput
                ariaLabel="Username"
                value={draft.username ?? ''}
                onChange={(username) => update({ username })}
                placeholder="sa"
              />
            </Field>
            <Field label="Password">
              <TextInput
                ariaLabel="Password"
                value={draft.password ?? ''}
                onChange={(password) => update({ password })}
                type={showPassword ? 'text' : 'password'}
                mono
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                }
              />
            </Field>
          </>
        )}

        <Checkbox
          checked={draft.trustServerCertificate}
          onChange={(trustServerCertificate) => update({ trustServerCertificate })}
          label="Trust Server Certificate"
        />

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            disabled={testStatus === 'testing' || !draft.server}
          >
            {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
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

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
