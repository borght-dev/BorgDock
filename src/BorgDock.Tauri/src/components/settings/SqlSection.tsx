import { useState } from 'react';
import { Card, Button, Pill } from '@/components/shared/primitives';
import { Field, SectionHeader, Select, ToggleRow } from '@/components/shared/primitives';
import type { SqlSettings } from '@/types/settings';
import { ConnectionEditorDialog } from './ConnectionEditorDialog';

interface Props {
  sql: SqlSettings;
  onChange: (s: SqlSettings) => void;
}

export function SqlSection({ sql, onChange }: Props) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const conns = sql.connections ?? [];

  return (
    <>
      <SectionHeader
        title="SQL Server"
        subtitle='Saved connections used by the SQL window (Ctrl+F10) and the "Open in SQL" action on PR cards.'
      />

      <Card variant="default" padding="md">
        <div className="mb-3 flex items-start gap-2.5">
          <h3 className="flex-1 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            Connections
          </h3>
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            + Add connection
          </Button>
        </div>
        <div id="field-connections" className="flex flex-col gap-2">
          {conns.length === 0 && (
            <p className="text-[11.5px] text-[var(--color-text-muted)]">No SQL connections yet.</p>
          )}
          {conns.map((c, i) => (
            <div
              key={`${c.name}-${i}`}
              className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-3 py-2.5"
            >
              <span
                aria-hidden
                className="grid h-[22px] w-[22px] place-items-center rounded-md bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m4 17 6-6-6-6" />
                  <path d="M12 19h8" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                  {c.name}
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-text-muted)] truncate">
                  {c.server}
                  {c.port !== 1433 ? `:${c.port}` : ''} · {c.database || '—'} ·{' '}
                  {c.authentication === 'windows' ? 'Windows' : 'SQL'}
                </div>
              </div>
              <Pill tone={c.password || c.authentication === 'windows' ? 'success' : 'neutral'}>
                {c.authentication === 'windows' ? 'Windows' : c.password ? 'saved' : 'session'}
              </Pill>
              <Button variant="secondary" size="sm" onClick={() => setEditing(i)}>
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                aria-label={`Delete ${c.name}`}
                onClick={() => onChange({ ...sql, connections: conns.filter((_, j) => j !== i) })}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Defaults
        </h3>
        <Field
          label="Default connection"
          hint="Used when SQL window opens with no context."
          anchorId="default-connection"
        >
          <Select
            ariaLabel="Default SQL connection"
            value={sql.defaultConnectionName ?? ''}
            options={[
              { value: '', label: '(none)' },
              ...conns.map((c) => ({ value: c.name, label: c.name })),
            ]}
            onChange={(v) => onChange({ ...sql, defaultConnectionName: v || undefined })}
          />
        </Field>
        <div id="field-read-only-default">
          <ToggleRow
            label="Read-only by default"
            hint="Block writes unless explicitly toggled in the SQL window."
            on={sql.readOnlyByDefault}
            onChange={(readOnlyByDefault) => onChange({ ...sql, readOnlyByDefault })}
          />
        </div>
        <div id="field-confirm-destructive">
          <ToggleRow
            label="Confirm DELETE / UPDATE without WHERE"
            on={sql.confirmDestructiveWithoutWhere}
            onChange={(confirmDestructiveWithoutWhere) =>
              onChange({ ...sql, confirmDestructiveWithoutWhere })
            }
            last
          />
        </div>
      </Card>

      {editing !== null && (
        <ConnectionEditorDialog
          key={editing}
          index={editing}
          sql={sql}
          onClose={() => setEditing(null)}
          onSave={(connections) => {
            onChange({ ...sql, connections });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
