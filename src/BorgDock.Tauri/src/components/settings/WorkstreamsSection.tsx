import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, ToggleRow } from '@/components/shared/primitives';
import { commands } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import type { WorkstreamSettings } from '@/types';

interface Props {
  workstreams: WorkstreamSettings;
  onChange: (next: WorkstreamSettings) => void;
}

interface Counts {
  here: number;
  there: number;
}

/** Workstreams in a folder: the real files, not a sync client's copies. */
async function countIn(folder: string | null): Promise<number> {
  const files = await commandData(commands.workstreamsList(folder));
  return files.filter((file) => !file.conflictCopy).length;
}

type Pending =
  | { kind: 'to-folder'; folder: string; counts: Counts }
  | { kind: 'to-local'; counts: Counts };

/**
 * WorkstreamsSection — where workstreams are kept. On this machine only, or
 * in a folder a sync client shares between machines (OneDrive, Syncthing):
 * each workstream is one file there, and an edit made on two machines at
 * once is merged, or shown side by side to choose. Switching never deletes
 * anything; the workstreams left behind stay where they were.
 */
export function WorkstreamsSection({ workstreams, onChange }: Props) {
  const folder = workstreams.folder?.trim() || null;
  const [path, setPath] = useState('');
  const [computerName, setComputerName] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    void commandData(commands.workstreamsFolderPath(folder))
      .then(setPath)
      .catch(() => setPath(''));
  }, [folder]);
  useEffect(() => {
    void commandData(commands.workstreamsDeviceName())
      .then(setComputerName)
      .catch(() => {});
  }, []);

  const device = workstreams.deviceLabel?.trim() || computerName || 'this computer';

  const chooseFolder = async () => {
    setError('');
    setDone('');
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({
        directory: true,
        multiple: false,
        title: 'Folder your sync client shares',
      });
      if (typeof picked !== 'string' || !picked) return;
      const counts = { here: await countIn(folder), there: await countIn(picked) };
      if (counts.here === 0) {
        onChange({ ...workstreams, folder: picked });
        setDone(`Workstreams now live in ${picked}.`);
        return;
      }
      setPending({ kind: 'to-folder', folder: picked, counts });
    } catch (e) {
      setError(String(e));
    }
  };

  const keepOnThisMachine = async () => {
    setError('');
    setDone('');
    try {
      const counts = { here: await countIn(folder), there: await countIn(null) };
      if (counts.here === 0) {
        onChange({ ...workstreams, folder: undefined });
        return;
      }
      setPending({ kind: 'to-local', counts });
    } catch (e) {
      setError(String(e));
    }
  };

  const finish = async (copy: boolean) => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const target = pending.kind === 'to-folder' ? pending.folder : null;
      if (copy) {
        const report = await commandData(commands.workstreamsCopyInto(folder, target, device));
        setDone(
          [
            report.copied > 0 && `${report.copied} copied`,
            report.copies > 0 &&
              `${report.copies} held on both sides, offered for merging in Workstreams`,
            report.same > 0 && `${report.same} already the same`,
          ]
            .filter(Boolean)
            .join(', '),
        );
      }
      onChange({ ...workstreams, folder: target ?? undefined });
      setPending(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card variant="default" padding="md">
        <h3 className="mb-1 text-[13px] font-semibold text-[var(--color-text-primary)]">
          Where workstreams live
        </h3>
        <p className="mb-3 text-[11.5px] text-[var(--color-text-muted)]">
          Each workstream is one file. Put them in a folder your sync client shares to have them on
          every machine. An edit made on two machines at once is merged; when both changed the same
          thing, BorgDock shows both.
        </p>
        <Field label="Folder" anchorId="workstreams-folder">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[5px] bg-[var(--color-surface-hover)] px-2 py-1 font-mono text-[11.5px]">
              {path || '…'}
            </code>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void chooseFolder()}
            >
              {folder ? 'Choose another folder…' : 'Use a sync folder…'}
            </Button>
            {folder && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void keepOnThisMachine()}
              >
                This machine only
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void commandData(commands.revealInFileManager(path)).catch(() => {})}
              disabled={!path}
            >
              Open
            </Button>
          </div>
        </Field>
        {pending && (
          <div
            role="group"
            aria-label="Move workstreams"
            className="mt-3 rounded-[6px] border border-[var(--color-warning-badge-border)] bg-[var(--color-warning-badge-bg)] p-3 text-[12px] text-[var(--color-text-primary)]"
          >
            <p className="mb-2">
              {pending.kind === 'to-folder'
                ? `This machine has ${pending.counts.here} workstream${pending.counts.here === 1 ? '' : 's'}; the folder has ${pending.counts.there}.`
                : `The folder has ${pending.counts.here} workstream${pending.counts.here === 1 ? '' : 's'}; this machine has ${pending.counts.there}.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" loading={busy} onClick={() => void finish(true)}>
                {pending.kind === 'to-folder' ? 'Merge both' : 'Copy them to this machine'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void finish(false)}
              >
                {pending.kind === 'to-folder' ? "Use the folder's" : "Use this machine's"}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              Nothing is deleted: the workstreams you leave stay where they are.
            </p>
          </div>
        )}
        {done && <p className="mt-2 text-[11.5px] text-[var(--color-text-secondary)]">{done}</p>}
        {error && (
          <p role="alert" className="mt-2 text-[11.5px] text-[var(--color-status-red)]">
            {error}
          </p>
        )}
      </Card>

      <Card variant="default" padding="md">
        <Field
          label="This machine's name"
          hint="How the log and a merge name this machine."
          anchorId="workstreams-device"
        >
          <Input
            aria-label="This machine's name"
            value={workstreams.deviceLabel ?? ''}
            placeholder={computerName || 'This computer'}
            onChange={(e) => onChange({ ...workstreams, deviceLabel: e.target.value || undefined })}
          />
        </Field>
        <ToggleRow
          label="Notify me"
          hint="When a workstream is unblocked, stops holding, is changed on another machine as well, or an agent's review is in."
          on={workstreams.notifications ?? true}
          last
          onChange={(notifications) => onChange({ ...workstreams, notifications })}
        />
      </Card>
    </div>
  );
}
