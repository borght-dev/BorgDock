import { Button, Pill } from '@/components/shared/primitives';
import { downloadUpdate, restartToApplyUpdate } from '@/services/updates';
import { useSettingsStore } from '@/stores/settings-store';
import { useUpdateStore } from '@/stores/update-store';

/**
 * The title bar's update chip: there only when an update asks for something.
 * Ready → restart; downloading → progress; found with auto-download off → download.
 */
export function UpdateChip() {
  const phase = useUpdateStore((s) => s.phase);
  const version = useUpdateStore((s) => s.version);
  const progress = useUpdateStore((s) => s.progress);
  const restarting = useUpdateStore((s) => s.restarting);
  const autoDownload = useSettingsStore((s) => s.settings.updates.autoDownload);

  if (phase === 'ready' || phase === 'installing') {
    const busy = restarting || phase === 'installing';
    return (
      <Button
        variant="primary"
        size="sm"
        className="bd-update-chip"
        onClick={restartToApplyUpdate}
        disabled={busy}
        title={version ? `BorgDock v${version} is downloaded` : undefined}
        data-tauri-drag-region="false"
      >
        {busy ? 'Restarting…' : 'Restart to update'}
      </Button>
    );
  }
  if (phase === 'downloading') {
    return (
      <Pill
        tone="neutral"
        className="bd-update-chip bd-update-chip--progress"
        role="status"
        data-tauri-drag-region="false"
      >
        Updating… {progress}%
      </Pill>
    );
  }
  if (phase === 'available' && !autoDownload && version) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="bd-update-chip"
        onClick={downloadUpdate}
        title="Download this update"
        data-tauri-drag-region="false"
      >
        v{version} available
      </Button>
    );
  }
  return null;
}
