import { useState } from 'react';
import type { UpdateSettings } from '@/types';

interface UpdateSectionProps {
  updates: UpdateSettings;
  onChange: (updates: UpdateSettings) => void;
}

export function UpdateSection({ updates, onChange }: UpdateSectionProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');

  const update = (partial: Partial<UpdateSettings>) =>
    onChange({ ...updates, ...partial });

  const handleCheckForUpdates = async () => {
    setIsChecking(true);
    setUpdateStatus('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<string>('check_for_updates');
      setUpdateStatus(result ?? 'Up to date');
    } catch {
      setUpdateStatus('Check failed');
    } finally {
      setIsChecking(false);
    }
  };

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
        <button
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-action-secondary-fg)] bg-[var(--color-action-secondary-bg)] border border-[var(--color-subtle-border)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
          onClick={handleCheckForUpdates}
          disabled={isChecking}
        >
          {isChecking ? 'Checking...' : 'Check for Updates'}
        </button>
        {updateStatus && (
          <span className="text-[10px] text-[var(--color-text-muted)]">{updateStatus}</span>
        )}
      </div>

      <div className="text-[10px] text-[var(--color-text-ghost)]">v0.1.0</div>
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
