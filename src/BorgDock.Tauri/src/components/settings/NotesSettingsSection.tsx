import { useEffect, useState } from 'react';
import { Button, Card, Field, SectionHeader, Select } from '@/components/shared/primitives';
import { commands } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import { notesFolderSetting } from '@/services/notes/settings';
import { nativeNotesStorage } from '@/services/notes/storage';
import type { AppSettings } from '@/types/settings';

type NotesSettings = Pick<AppSettings, 'notesSyncFolder' | 'dailyNoteFolder'>;

const STATUS_CLASS = 'text-[11.5px] text-[var(--color-text-muted)]';

/**
 * NotesSettingsSection — where the vault lives and where daily notes go.
 * The vault is on this machine only, or in a folder a sync client shares
 * between machines (OneDrive, Syncthing). Switching moves nothing: the notes
 * in the folder you leave stay there.
 */
export function NotesSettingsSection({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (change: Partial<NotesSettings>) => void;
}) {
  const syncFolder = notesFolderSetting(settings);
  const selected = settings.dailyNoteFolder ?? '';
  const [vaultPath, setVaultPath] = useState<{ of: string | null; path: string }>();
  const [listing, setListing] = useState<{ vault: string | null; folders: string[] | null }>();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void nativeNotesStorage.folderPath(syncFolder).then(
      (path) => {
        if (active) setVaultPath({ of: syncFolder, path });
      },
      () => {
        if (active) setVaultPath({ of: syncFolder, path: '' });
      },
    );
    void nativeNotesStorage.list(syncFolder).then(
      ({ folders }) => {
        if (active) setListing({ vault: syncFolder, folders });
      },
      () => {
        if (active) setListing({ vault: syncFolder, folders: null });
      },
    );
    return () => {
      active = false;
    };
  }, [syncFolder]);

  const chooseFolder = async () => {
    setError('');
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({
        directory: true,
        multiple: false,
        title: 'Folder your sync client shares',
      });
      if (typeof picked === 'string' && picked) onChange({ notesSyncFolder: picked });
    } catch (e) {
      setError(String(e));
    }
  };

  const path = vaultPath?.of === syncFolder ? vaultPath.path : '';
  const folders = listing?.vault === syncFolder ? listing.folders : undefined;
  const choices = new Set(folders ?? []);
  if (selected && selected !== '/') choices.add(selected);
  return (
    <>
      <SectionHeader title="Notes" />
      <Card variant="default" padding="md">
        <h3 className="mb-1 text-[13px] font-semibold text-[var(--color-text-primary)]">
          Where notes live
        </h3>
        <p className="mb-3 text-[11.5px] text-[var(--color-text-muted)]">
          Notes are Markdown files in one folder, the vault. Put it in a folder your sync client
          shares to have your notes on every machine: BorgDock keeps them in “BorgDock Notes” inside
          it. Switching moves nothing: the notes in the folder you leave stay there.
        </p>
        <Field label="Vault" anchorId="notes-folder">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[5px] bg-[var(--color-surface-hover)] px-2 py-1 font-mono text-[11.5px]">
              {path || '…'}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void chooseFolder()}>
              {syncFolder ? 'Choose another folder…' : 'Use a sync folder…'}
            </Button>
            {syncFolder && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ notesSyncFolder: undefined })}
              >
                This machine only
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={!path}
              onClick={() => void commandData(commands.revealInFileManager(path)).catch(() => {})}
            >
              Open
            </Button>
          </div>
        </Field>
        {error && (
          <p role="alert" className="mt-2 text-[11.5px] text-[var(--color-status-red)]">
            {error}
          </p>
        )}
      </Card>
      <Card variant="default" padding="md">
        <Field label="Daily note folder" anchorId="daily-note-folder">
          {folders === undefined ? (
            <p role="status" className={STATUS_CLASS}>
              Loading vault folders…
            </p>
          ) : (
            <Select
              ariaLabel="Daily note folder"
              value={selected}
              options={[
                { value: '', label: 'Automatic' },
                { value: '/', label: 'Vault root' },
                ...[...choices].map((folder) => ({ value: folder, label: folder })),
              ]}
              onChange={(value) => onChange({ dailyNoteFolder: value || undefined })}
            />
          )}
          {folders === null && (
            <p role="status" className={`mt-2 ${STATUS_CLASS}`}>
              Couldn’t load vault folders.
            </p>
          )}
        </Field>
      </Card>
    </>
  );
}
