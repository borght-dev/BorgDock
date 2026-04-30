import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

export function AgentOverviewSection() {
  const settings = useSettingsStore((s) => s.settings.agentOverview);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [busy, setBusy] = useState(false);

  const enabled = settings?.enabled ?? false;
  const interval = settings?.otelExportIntervalMs ?? 2000;

  const onToggle = async (next: boolean) => {
    setBusy(true);
    try {
      await invoke('set_agent_overview_enabled', {
        enabled: next,
        port: 4318,
        exportIntervalMs: interval,
      });
      updateSettings({
        agentOverview: { ...(settings ?? {}), enabled: next },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-settings-section="agent-overview" className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Agent Overview
      </h3>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Live dashboard of every Claude Code session running on this machine. Enabling this writes a small{' '}
        <code>env</code> block to <code>~/.claude/settings.json</code> so Claude Code emits OpenTelemetry
        events to BorgDock on loopback.
      </p>
      <label className="flex cursor-pointer items-center justify-between gap-2">
        <span className="text-xs text-[var(--color-text-primary)]">Enable telemetry collection</span>
        <input
          type="checkbox"
          aria-label="Enable telemetry collection"
          checked={enabled}
          disabled={busy}
          onChange={(e) => void onToggle(e.target.checked)}
        />
      </label>
      <label className="flex cursor-pointer items-center justify-between gap-2">
        <span className="text-xs text-[var(--color-text-primary)]">Open on BorgDock startup</span>
        <input
          type="checkbox"
          aria-label="Open on BorgDock startup"
          checked={settings?.autoOpenOnStartup ?? false}
          onChange={(e) =>
            updateSettings({
              agentOverview: { ...(settings ?? {}), autoOpenOnStartup: e.target.checked },
            })
          }
        />
      </label>
    </div>
  );
}
