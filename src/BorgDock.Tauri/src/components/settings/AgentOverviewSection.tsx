import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { Card, Pill } from '@/components/shared/primitives';
import { Checkbox, SectionHeader } from '@/components/shared/primitives';
import { useSettingsStore } from '@/stores/settings-store';

export function AgentOverviewSection() {
  const settings = useSettingsStore((s) => s.settings.agentOverview);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [busy, setBusy] = useState(false);

  const enabled = settings?.enabled ?? false;
  const autoOpen = settings?.autoOpenOnStartup ?? false;
  const autoArchive = (settings?.autoArchiveAfterHours ?? null) === 24;
  const interval = settings?.otelExportIntervalMs ?? 2000;

  const onToggleEnable = async (next: boolean) => {
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
    <>
      <SectionHeader
        title="Agent Overview"
        subtitle={
          'Live dashboard of every Claude Code session running on this machine. Enabling this writes a small env block to ~/.claude/settings.json so Claude Code emits OpenTelemetry events to BorgDock on loopback.'
        }
        badge={<Pill tone={enabled ? 'success' : 'neutral'}>{enabled ? 'enabled' : 'disabled'}</Pill>}
      />

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Configuration
        </h3>

        <div id="field-enable-telemetry">
          <div aria-disabled={busy}>
            <Checkbox
              checked={enabled}
              onChange={onToggleEnable}
              label="Enable telemetry collection"
            />
          </div>
        </div>

        <div id="field-open-on-startup">
          <Checkbox
            checked={autoOpen}
            onChange={(autoOpenOnStartup) =>
              updateSettings({ agentOverview: { ...(settings ?? {}), autoOpenOnStartup } })
            }
            label="Open on BorgDock startup"
          />
        </div>

        <div id="field-auto-archive">
          <Checkbox
            checked={autoArchive}
            onChange={(on) =>
              updateSettings({
                agentOverview: { ...(settings ?? {}), autoArchiveAfterHours: on ? 24 : undefined },
              })
            }
            label="Auto-archive completed sessions after 24h"
          />
        </div>

        <div className="mt-4 flex items-center gap-2.5 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-hover)] px-3 py-2.5">
          <span
            className={[
              'grid h-[22px] w-[22px] place-items-center rounded-md',
              enabled
                ? 'bg-[var(--color-success-badge-bg)] text-[var(--color-success-badge-fg)]'
                : 'bg-[var(--color-neutral-badge-bg)] text-[var(--color-neutral-badge-fg)]',
            ].join(' ')}
            aria-hidden
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {enabled ? (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8 12 3 3 5-6" />
                </>
              ) : (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h0" />
                </>
              )}
            </svg>
          </span>
          <div className="flex-1">
            <div className="text-[11.5px] font-semibold text-[var(--color-text-primary)]">
              {enabled ? 'OTel endpoint configured' : 'OTel endpoint disabled'}
            </div>
            <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-text-muted)]">
              127.0.0.1:4318 · export every {interval}ms
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
