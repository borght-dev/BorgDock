import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { titleOf } from '@/services/notes/parse';
import { useNotesStore } from '@/stores/notes-store';
import { toastError } from '@/stores/toast-store';

export function NoteTrashDialog({
  path,
  isFolder = false,
  onClose,
}: {
  path: string;
  isFolder?: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const kind = isFolder ? 'folder' : 'note';
  return (
    <ConfirmDialog
      isOpen
      title={`Move ${kind} to trash?`}
      message={
        isFolder
          ? `“${path}” and everything inside it will move to the vault trash.`
          : `“${titleOf(path)}” will move to the vault trash.`
      }
      confirmLabel={busy ? 'Moving…' : 'Move to trash'}
      variant="danger"
      onCancel={() => {
        if (!busy) onClose();
      }}
      onConfirm={() => {
        if (busy) return;
        setBusy(true);
        void useNotesStore
          .getState()
          .trash(path, isFolder)
          .then(onClose, (error) => {
            toastError(`Couldn’t move ${kind} to trash`, error);
            setBusy(false);
          });
      }}
    />
  );
}
