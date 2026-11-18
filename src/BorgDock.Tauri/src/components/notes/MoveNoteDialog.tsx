import { useState } from 'react';
import { DetailDialog } from '@/components/shared/DetailDialog';
import { Button, Field, Select } from '@/components/shared/primitives';
import { folderOf } from '@/services/notes/paths';
import { useNotesStore } from '@/stores/notes-store';

export function MoveNoteDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const folders = useNotesStore((state) => state.folders);
  const current = folderOf(path);
  const [destination, setDestination] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choices = [...new Set([current, ...folders])].filter(Boolean);
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <DetailDialog title="Move note" onClose={close} className="[&_.bd-preview-dialog]:max-w-sm">
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || destination === current) return;
          setBusy(true);
          setError('');
          void useNotesStore
            .getState()
            .move(path, destination)
            .then(onClose, (failure) => {
              setError(failure instanceof Error ? failure.message : String(failure));
              setBusy(false);
            });
        }}
      >
        <Field label="Destination">
          <Select
            ariaLabel="Destination"
            value={destination}
            options={[
              { value: '', label: 'Vault root' },
              ...choices.map((folder) => ({ value: folder, label: folder })),
            ]}
            onChange={(folder) => {
              setDestination(folder);
              setError('');
            }}
          />
        </Field>
        {error && (
          <p role="alert" className="text-xs text-[var(--color-text-danger)]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={busy || destination === current}
          >
            Move
          </Button>
        </div>
      </form>
    </DetailDialog>
  );
}
