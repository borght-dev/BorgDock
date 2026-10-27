import { useState } from 'react';
import { Button } from '@/components/shared/primitives';
import type { FieldConflict } from '@/services/workstreams/merge';
import type { Conflict } from '@/stores/workstreams-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import { Sheet } from './Sheet';

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && value && 'text' in value)
    return String((value as { text: unknown }).text);
  if (typeof value === 'object' && value && 'state' in value)
    return String((value as { state: unknown }).state);
  return JSON.stringify(value);
}

interface ConflictViewProps {
  workstreamId: string;
  conflict: Conflict;
  onClose: () => void;
}

/**
 * ConflictView — both machines changed the same fields. Everything else is
 * merged already; for each field you pick this machine's value or the other
 * one's. Nothing is written until you finish.
 */
export function ConflictView({ workstreamId, conflict, onClose }: ConflictViewProps) {
  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>({});
  const choose = (field: FieldConflict, side: 'mine' | 'theirs') =>
    setChoices((current) => ({ ...current, [field.path]: side }));
  const finish = () => {
    useWorkstreamsStore.getState().resolveConflict(workstreamId, choices);
    onClose();
  };
  return (
    <Sheet
      wide
      title="Choose what to keep"
      subtitle={`This machine and ${conflict.theirsDevice} both changed ${conflict.conflicts.length === 1 ? 'one field' : `${conflict.conflicts.length} fields`}. The rest is merged.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Later
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button
            variant="secondary"
            size="md"
            onClick={() =>
              setChoices(Object.fromEntries(conflict.conflicts.map((c) => [c.path, 'theirs'])))
            }
          >
            Take all from {conflict.theirsDevice}
          </Button>
          <Button variant="primary" size="md" onClick={finish}>
            Merge
          </Button>
        </>
      }
    >
      <ul className="bd-ws-conflicts">
        {conflict.conflicts.map((field) => {
          const side = choices[field.path] ?? 'mine';
          return (
            <li key={field.path}>
              <h3 className="bd-dp-sheet__label">{field.label}</h3>
              <div className="bd-ws-conflicts__sides" role="radiogroup" aria-label={field.label}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={side === 'mine'}
                  className="bd-ws-conflicts__side"
                  onClick={() => choose(field, 'mine')}
                >
                  <span className="bd-ws-muted">This machine</span>
                  <span>{show(field.mine)}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={side === 'theirs'}
                  className="bd-ws-conflicts__side"
                  onClick={() => choose(field, 'theirs')}
                >
                  <span className="bd-ws-muted">{conflict.theirsDevice}</span>
                  <span>{show(field.theirs)}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
