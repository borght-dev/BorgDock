import { useState } from 'react';
import { DetailDialog } from '@/components/shared/DetailDialog';
import { Button, Field, TextInput } from '@/components/shared/primitives';
import { folderOf } from '@/services/notes/paths';
import { useNotesStore } from '@/stores/notes-store';

export function FolderNameDialog({
  parent = '',
  from,
  onSaved,
  onClose,
}: {
  parent?: string;
  from?: string;
  onSaved?: (path: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(() => from?.slice(from.lastIndexOf('/') + 1) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trimmed = name.trim();
  const directory = from ? folderOf(from) : parent;
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <DetailDialog
      title={from ? 'Rename folder' : 'New folder'}
      onClose={close}
      className="[&_.bd-preview-dialog]:max-w-sm"
    >
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmed || busy) return;
          if (/^[.]|[.]$|[\\/:*?"<>|]/.test(trimmed)) {
            setError('Enter a folder name without path separators or reserved characters.');
            return;
          }
          setBusy(true);
          setError('');
          const path = directory ? `${directory}/${trimmed}` : trimmed;
          void useNotesStore
            .getState()
            .saveFolder(path, from)
            .then(
              () => {
                onSaved?.(path);
                onClose();
              },
              (failure) => {
                setError(failure instanceof Error ? failure.message : String(failure));
                setBusy(false);
              },
            );
        }}
      >
        <Field label="Folder name">
          <TextInput ariaLabel="Folder name" value={name} onChange={setName} />
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
          <Button variant="primary" size="sm" type="submit" disabled={!trimmed || busy}>
            {from ? 'Rename' : 'Create'}
          </Button>
        </div>
      </form>
    </DetailDialog>
  );
}
