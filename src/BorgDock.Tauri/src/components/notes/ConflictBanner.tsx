import { Button } from '@/components/shared/primitives';
import { useNotesStore } from '@/stores/notes-store';

/**
 * ConflictBanner — the open note's file changed (or went) while it held an
 * unsaved edit. BorgDock wrote nothing; you choose which text stays.
 */
export function ConflictBanner({ path }: { path: string }) {
  const conflicts = useNotesStore((s) => s.conflicts);
  if (!(path in conflicts)) return null;
  const gone = conflicts[path] === null;
  const resolve = (keep: 'disk' | 'mine') =>
    void useNotesStore.getState().resolveConflict(path, keep);
  return (
    <div className="bd-dp-notice bd-notes-conflict" role="alert">
      <span>
        {gone
          ? 'This note was deleted outside BorgDock while you were editing it.'
          : 'This note changed on disk while you were editing it. Nothing was overwritten.'}
      </span>
      <span className="bd-notes-conflict__actions">
        <Button variant="secondary" size="sm" onClick={() => resolve('mine')}>
          {gone ? 'Keep my text' : 'Keep mine'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => resolve('disk')}>
          {gone ? 'Discard my text' : "Use the file's version"}
        </Button>
      </span>
    </div>
  );
}
