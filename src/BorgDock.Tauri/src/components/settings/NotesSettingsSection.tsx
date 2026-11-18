import { useEffect, useState } from 'react';
import { Card, Field, SectionHeader, Select } from '@/components/shared/primitives';
import { notesFolderSetting } from '@/services/notes/settings';
import { nativeNotesStorage } from '@/services/notes/storage';
import type { AppSettings } from '@/types/settings';

export function NotesSettingsSection({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (folder: string | undefined) => void;
}) {
  const vault = notesFolderSetting(settings);
  const selected = settings.dailyNoteFolder ?? '';
  const [listing, setListing] = useState<{ vault: string | null; folders: string[] | null }>();
  useEffect(() => {
    let active = true;
    void nativeNotesStorage.list(vault).then(
      ({ folders }) => {
        if (active) setListing({ vault, folders });
      },
      () => {
        if (active) setListing({ vault, folders: null });
      },
    );
    return () => {
      active = false;
    };
  }, [vault]);

  const folders = listing?.vault === vault ? listing.folders : undefined;
  const choices = new Set(folders ?? []);
  if (selected && selected !== '/') choices.add(selected);
  return (
    <>
      <SectionHeader title="Notes" />
      <Card variant="default" padding="md">
        <Field label="Daily note folder" anchorId="daily-note-folder">
          {folders === undefined ? (
            <p role="status">Loading vault folders…</p>
          ) : (
            <Select
              ariaLabel="Daily note folder"
              value={selected}
              options={[
                { value: '', label: 'Automatic' },
                { value: '/', label: 'Vault root' },
                ...[...choices].map((folder) => ({ value: folder, label: folder })),
              ]}
              onChange={(value) => onChange(value || undefined)}
            />
          )}
          {folders === null && <p role="status">Couldn’t load vault folders.</p>}
        </Field>
      </Card>
    </>
  );
}
