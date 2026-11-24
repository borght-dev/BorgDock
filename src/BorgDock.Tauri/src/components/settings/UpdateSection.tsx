import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  LinearProgress,
  Pill,
  type PillTone,
  SectionHeader,
  ToggleRow,
} from '@/components/shared/primitives';
import { RELEASES } from '@/generated/changelog';
import { openWhatsNew } from '@/hooks/useWhatsNew';
import {
  checkForUpdate,
  downloadUpdate,
  lastCheckedLabel,
  RELEASES_URL,
  restartToApplyUpdate,
  updateStatusLine,
} from '@/services/updates';
import { type UpdatePhase, type UpdateStatus, useUpdateStore } from '@/stores/update-store';
import type { UpdateSettings } from '@/types/settings';

interface Props {
  updates: UpdateSettings;
  onChange: (u: UpdateSettings) => void;
}

const AGE_REFRESH_MS = 30_000;

/** Now, refreshed often enough for "Last checked … ago" to stay true. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), AGE_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const STATUS_TONE: Record<UpdatePhase, PillTone> = {
  idle: 'success',
  checking: 'neutral',
  available: 'warning',
  downloading: 'neutral',
  ready: 'warning',
  installing: 'warning',
};

/** The header's verdict: "current" only when a check said so. */
function versionPill(status: UpdateStatus): { tone: PillTone; text: string } {
  const installed = `v${status.currentVersion || '0.1.0'}`;
  if (status.phase === 'ready' || status.phase === 'installing')
    return { tone: 'warning', text: `v${status.version} ready` };
  if (status.version) return { tone: 'warning', text: `v${status.version} available` };
  if (status.lastCheckedAt && !status.lastError)
    return { tone: 'success', text: `${installed} — current` };
  return { tone: 'neutral', text: installed };
}

export function UpdateSection({ updates, onChange }: Props) {
  const phase = useUpdateStore((s) => s.phase);
  const currentVersion = useUpdateStore((s) => s.currentVersion);
  const version = useUpdateStore((s) => s.version);
  const progress = useUpdateStore((s) => s.progress);
  const lastCheckedAt = useUpdateStore((s) => s.lastCheckedAt);
  const lastError = useUpdateStore((s) => s.lastError);
  const restarting = useUpdateStore((s) => s.restarting);
  const now = useNow();

  const update = (partial: Partial<UpdateSettings>) => onChange({ ...updates, ...partial });

  const status: UpdateStatus = {
    phase,
    currentVersion,
    version,
    progress,
    lastCheckedAt,
    lastError,
  };
  const pill = versionPill(status);
  const statusLine = updateStatusLine(status);
  const downloading = phase === 'downloading';
  const ready = phase === 'ready' || phase === 'installing';

  const recent = RELEASES.slice(0, 3);

  return (
    <>
      <SectionHeader
        title="Updates"
        subtitle="BorgDock updates itself from the borght-dev/BorgDock releases on GitHub."
        badge={<Pill tone={pill.tone}>{pill.text}</Pill>}
      />

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Channel
        </h3>
        <div id="field-auto-check">
          <ToggleRow
            label="Auto-check for updates"
            hint="Checks every hour, and when the computer wakes."
            on={updates.autoCheckEnabled}
            onChange={(autoCheckEnabled) => update({ autoCheckEnabled })}
          />
        </div>
        <div id="field-auto-download">
          <ToggleRow
            label="Auto-download updates"
            hint="Downloads in background. You choose when to restart."
            on={updates.autoDownload}
            onChange={(autoDownload) => update({ autoDownload })}
            last
          />
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Check now
        </h3>
        <div id="field-check-now" className="flex items-center gap-2 flex-wrap">
          {ready ? (
            <Button
              variant="primary"
              size="sm"
              onClick={restartToApplyUpdate}
              disabled={restarting || phase === 'installing'}
            >
              {restarting || phase === 'installing' ? 'Restarting…' : 'Restart to apply'}
            </Button>
          ) : phase === 'available' ? (
            <Button variant="primary" size="sm" onClick={downloadUpdate}>
              Download v{version}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={checkForUpdate}
              disabled={phase === 'checking' || downloading}
            >
              {phase === 'checking' ? 'Checking…' : 'Check for updates'}
            </Button>
          )}
          {statusLine && <Pill tone={STATUS_TONE[phase]}>{statusLine}</Pill>}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => openWhatsNew(null)}>
            View release notes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openUrl(RELEASES_URL).catch(console.error)}
          >
            Open releases
          </Button>
        </div>
        {downloading && (
          <div className="mt-3">
            <LinearProgress value={progress} tone="accent" />
          </div>
        )}
        <p
          className="mt-3 text-[11px] text-[var(--color-text-muted)]"
          data-testid="update-last-checked"
        >
          {lastCheckedLabel(lastCheckedAt, now)}
        </p>
        {lastError && (
          <p
            className="mt-1 text-[11px] text-[var(--color-status-red)]"
            role="alert"
            data-testid="update-error"
          >
            {lastError}
          </p>
        )}
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Recent releases
        </h3>
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
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span
                  className={[
                    'min-w-[60px] font-mono text-[11.5px] font-semibold',
                    isCurrent ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]',
                  ].join(' ')}
                >
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
