import { Card, Button } from '@/components/shared/primitives';
import { Field, SectionHeader, Select, ToggleRow } from '@/components/shared/primitives';
import type { NotificationSettings } from '@/types/settings';

interface Props { notifications: NotificationSettings; onChange: (n: NotificationSettings) => void }

const NUDGE_OPTIONS = [
  { value: '15',  label: '15 minutes' },
  { value: '30',  label: '30 minutes' },
  { value: '60',  label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
];

export function NotificationSection({ notifications, onChange }: Props) {
  const update = (partial: Partial<NotificationSettings>) =>
    onChange({ ...notifications, ...partial });

  const toggleChannel = (key: keyof NotificationSettings['channels']) => (next: boolean) => {
    update({ channels: { ...notifications.channels, [key]: next } });
  };

  return (
    <>
      <SectionHeader
        title="Notifications"
        subtitle="What BorgDock pings you about, and how. Muted channels still appear in the in-app feed."
      />

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          What to notify me about
        </h3>
        <div id="field-check-status">
          <ToggleRow
            label="Check status changes"
            hint="A required check went red or recovered."
            on={notifications.toastOnCheckStatusChange}
            onChange={(toastOnCheckStatusChange) => update({ toastOnCheckStatusChange })}
          />
        </div>
        <div id="field-new-pull-requests">
          <ToggleRow
            label="New pull requests"
            hint="A repo you watch got a new PR."
            on={notifications.toastOnNewPR}
            onChange={(toastOnNewPR) => update({ toastOnNewPR })}
          />
        </div>
        <div id="field-review-updates">
          <ToggleRow
            label="Review updates"
            hint="Someone submitted a review or comment."
            on={notifications.toastOnReviewUpdate}
            onChange={(toastOnReviewUpdate) => update({ toastOnReviewUpdate })}
          />
        </div>
        <div id="field-pr-mergeable">
          <ToggleRow
            label="PR becomes mergeable"
            hint="All requirements satisfied, merge button is live."
            on={notifications.toastOnMergeable}
            onChange={(toastOnMergeable) => update({ toastOnMergeable })}
          />
        </div>
        <div id="field-sound-on-merge">
          <ToggleRow
            label="Play sound on merge"
            on={notifications.playMergeSound}
            onChange={(playMergeSound) => update({ playMergeSound })}
          />
        </div>
        <div id="field-only-my-prs">
          <ToggleRow
            label="Only notify for my PRs"
            hint="Filter team-wide events to ones I'm directly involved in."
            on={notifications.onlyMyPRs}
            onChange={(onlyMyPRs) => update({ onlyMyPRs })}
            last
          />
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-1.5 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Review reminders
        </h3>
        <p className="mb-3.5 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
          Nudge me when I'm sitting on someone else's review request.
        </p>
        <div id="field-nudge-pending">
          <ToggleRow
            label="Nudge for pending reviews"
            on={notifications.reviewNudgeEnabled}
            onChange={(reviewNudgeEnabled) => update({ reviewNudgeEnabled })}
          />
        </div>
        <div id="field-remind-every" className="grid grid-cols-[1fr_130px] items-center gap-4 border-b border-[var(--color-subtle-border)] py-3">
          <div>
            <div className="text-xs font-medium text-[var(--color-text-primary)]">Remind every</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Cadence for the nudge above.</div>
          </div>
          <Select
            ariaLabel="Review nudge interval"
            value={String(notifications.reviewNudgeIntervalMinutes)}
            options={NUDGE_OPTIONS}
            onChange={(v) => update({ reviewNudgeIntervalMinutes: Number(v) })}
          />
        </div>
        <div id="field-escalate">
          <ToggleRow
            label="Escalate urgency over time"
            hint="Tone shifts from gentle → firm → critical the longer a review stalls."
            on={notifications.reviewNudgeEscalation}
            onChange={(reviewNudgeEscalation) => update({ reviewNudgeEscalation })}
            last
          />
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Channels
        </h3>
        <Field label="Send via" anchorId="channels">
          <div className="flex flex-wrap gap-2">
            <ChannelChip label="Tray balloon"   on={notifications.channels.tray}        onChange={toggleChannel('tray')} />
            <ChannelChip label="System (toast)" on={notifications.channels.system}      onChange={toggleChannel('system')} />
            <ChannelChip label="Sound"          on={notifications.channels.sound}       onChange={toggleChannel('sound')} />
            <ChannelChip label="Email digest"   on={notifications.channels.emailDigest} onChange={toggleChannel('emailDigest')} />
          </div>
        </Field>
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => {
            // TODO: wire to a real test_notification command if added.
            update({ lastTestFiredAt: Date.now() });
          }}>
            Test notification
          </Button>
          {typeof notifications.lastTestFiredAt === 'number' && (
            <span className="text-[10.5px] text-[var(--color-text-muted)]">
              last fired {Math.max(0, Math.round((Date.now() - notifications.lastTestFiredAt) / 1000))}s ago
            </span>
          )}
        </div>
      </Card>
    </>
  );
}

function ChannelChip({ label, on, onChange }: { label: string; on: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={[
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] font-medium cursor-pointer transition-colors',
        on
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
          : 'border-[var(--color-subtle-border)] text-[var(--color-text-tertiary)]',
      ].join(' ')}
    >
      <span aria-hidden>{on ? '✓' : '+'}</span>
      {label}
    </button>
  );
}
