import { Card, Button, LinearProgress, Pill } from '@/components/shared/primitives';
import { SectionHeader, ToggleRow } from '@/components/shared/primitives';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { openWhatsNew } from '@/hooks/useWhatsNew';
import { useSettingsStore } from '@/stores/settings-store';
import { useUpdateStore } from '@/stores/update-store';
import { RELEASES } from '@/generated/changelog';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { UpdateSettings } from '@/types/settings';

interface Props { updates: UpdateSettings; onChange: (u: UpdateSettings) => void }

export function UpdateSection({ updates, onChange }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const { checkForUpdate, downloadAndInstall } = useAutoUpdate(settings);
  const { checking, downloading, progress, available, version, statusText, currentVersion } = useUpdateStore();

  const update = (partial: Partial<UpdateSettings>) => onChange({ ...updates, ...partial });

  const statusTone: 'success' | 'warning' | 'neutral' = available
    ? 'warning'
    : downloading
      ? 'neutral'
      : 'success';

  const recent = RELEASES.slice(0, 3);

  return (
    <>
      <SectionHeader
        title="Updates"
        subtitle="BorgDock auto-updates from the Gomocha-FSP/borgdock GitHub releases feed."
        badge={<Pill tone="success">v{currentVersion || '0.1.0'} — current</Pill>}
      />

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Channel</h3>
        <div id="field-auto-check">
          <ToggleRow
            label="Auto-check for updates"
            on={updates.autoCheckEnabled}
            onChange={(autoCheckEnabled) => update({ autoCheckEnabled })}
          />
        </div>
        <div id="field-auto-download">
          <ToggleRow
            label="Auto-download updates"
            hint="Apply on next launch."
            on={updates.autoDownload}
            onChange={(autoDownload) => update({ autoDownload })}
            last
          />
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Check now</h3>
        <div id="field-check-now" className="flex items-center gap-2 flex-wrap">
          {available && !downloading && progress < 100 ? (
            <Button variant="primary" size="sm" onClick={downloadAndInstall} disabled={downloading}>
              Install v{version}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={checkForUpdate} disabled={checking || downloading}>
              {checking ? 'Checking…' : 'Check for updates'}
            </Button>
          )}
          {statusText && <Pill tone={statusTone}>{statusText}</Pill>}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => openWhatsNew(null)}>
            View release notes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openUrl('https://github.com/Gomocha-FSP/borgdock/releases').catch(console.error)}
          >
            Open releases
          </Button>
        </div>
        {downloading && (
          <div className="mt-3">
            <LinearProgress value={progress} tone="accent" />
          </div>
        )}
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Recent releases</h3>
        <div id="field-recent-releases">
          {recent.length === 0 && (
            <p className="text-[11.5px] text-[var(--color-text-muted)]">No releases yet.</p>
          )}
          {recent.map((r, i) => {
            const isCurrent = currentVersion ? r.version === currentVersion : false;
            return (
              <div
                key={r.version}
                className={[
                  'flex items-center gap-3.5 px-2 py-3',
                  i < recent.length - 1 && 'border-b border-[var(--color-subtle-border)]',
                  isCurrent && 'rounded-md bg-[var(--color-accent-subtle)] -mx-2 px-4',
                ].filter(Boolean).join(' ')}
              >
                <span className={[
                  'min-w-[60px] font-mono text-[11.5px] font-semibold',
                  isCurrent ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]',
                ].join(' ')}>
                  v{r.version}
                </span>
                <div className="flex-1 text-[11.5px] leading-relaxed text-[var(--color-text-secondary)] truncate">
                  {r.summary || r.highlights?.[0]?.title || r.alsoFixed?.[0] || '—'}
                </div>
                <span className="text-[10.5px] text-[var(--color-text-muted)]">{r.date}</span>
                {isCurrent && <Pill tone="neutral">installed</Pill>}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
