import type { UpdateSettings } from '@/types';
import { useUpdateStore } from '@/stores/update-store';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useSettingsStore } from '@/stores/settings-store';

interface UpdateSectionProps {
  updates: UpdateSettings;
  onChange: (updates: UpdateSettings) => void;
}

export function UpdateSection({ updates, onChange }: UpdateSectionProps) {
  const settings = useSettingsStore((s) => s.settings);
  const { checkForUpdate, downloadAndInstall } = useAutoUpdate(settings);
  const { checking, downloading, progress, available, version, statusText, currentVersion } =
    useUpdateStore();

  const update = (partial: Partial<UpdateSettings>) =>
    onChange({ ...updates, ...partial });

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-primary)]">Auto-check for updates</span>
        <ToggleSwitch
          checked={updates.autoCheckEnabled}
          onChange={(v) => update({ autoCheckEnabled: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-primary)]">Auto-download updates</span>
        <ToggleSwitch
          checked={updates.autoDownload}
          onChange={(v) => update({ autoDownload: v })}
        />
      </div>

      <div className="flex items-center gap-2">
        {available && !downloading && progress < 100 ? (
          <button
            className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent-foreground)] bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-50"
            onClick={downloadAndInstall}
            disabled={downloading}
          >
            Install v{version}
          </button>
        ) : (
          <button
            className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-action-secondary-fg)] bg-[var(--color-action-secondary-bg)] border border-[var(--color-subtle-border)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
            onClick={checkForUpdate}
            disabled={checking || downloading}
          >
            {checking ? 'Checking...' : 'Check for Updates'}
          </button>
        )}
        {statusText && (
          <span className="text-[10px] text-[var(--color-text-muted)]">{statusText}</span>
        )}
      </div>

      {downloading && (
        <div className="h-1 w-full rounded-full bg-[var(--color-filter-chip-bg)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="text-[10px] text-[var(--color-text-ghost)]">
        v{currentVersion || '0.1.0'}
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={`h-4 w-7 rounded-full transition-colors relative shrink-0 ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-filter-chip-bg)]'
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'left-3.5' : 'left-0.5'
        }`}
      />
    </button>
  );
}
