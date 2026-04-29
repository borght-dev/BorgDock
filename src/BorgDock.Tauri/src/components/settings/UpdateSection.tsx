import { Button } from '@/components/shared/primitives/Button';
import { LinearProgress } from '@/components/shared/primitives/LinearProgress';
import { Pill } from '@/components/shared/primitives/Pill';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { openWhatsNew } from '@/hooks/useWhatsNew';
import { useSettingsStore } from '@/stores/settings-store';
import { useUpdateStore } from '@/stores/update-store';
import type { UpdateSettings } from '@/types';
import { ToggleSwitch } from './ToggleSwitch';

interface UpdateSectionProps {
  updates: UpdateSettings;
  onChange: (updates: UpdateSettings) => void;
}

export function UpdateSection({ updates, onChange }: UpdateSectionProps) {
  const settings = useSettingsStore((s) => s.settings);
  const { checkForUpdate, downloadAndInstall } = useAutoUpdate(settings);
  const { checking, downloading, progress, available, version, statusText, currentVersion } =
    useUpdateStore();

  const update = (partial: Partial<UpdateSettings>) => onChange({ ...updates, ...partial });

  const statusTone = available ? 'warning' : downloading ? 'neutral' : 'success';

  return (
    <div data-settings-section="updates" className="space-y-2.5">
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
          <Button variant="primary" size="sm" onClick={downloadAndInstall} disabled={downloading}>
            Install v{version}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={checkForUpdate}
            disabled={checking || downloading}
          >
            {checking ? 'Checking...' : 'Check for Updates'}
          </Button>
        )}
        {statusText && <Pill tone={statusTone}>{statusText}</Pill>}
        <Button variant="secondary" size="sm" onClick={() => openWhatsNew(null)}>
          View release notes
        </Button>
      </div>

      {downloading && <LinearProgress value={progress} tone="accent" />}

      <div className="text-[10px] text-[var(--color-text-ghost)]">v{currentVersion || '0.1.0'}</div>
    </div>
  );
}
