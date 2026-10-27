import { Fragment } from 'react';
import { Button, Card, SectionHeader, Select, ToggleRow } from '@/components/shared/primitives';
import { CATEGORY_LABEL } from '@/services/activity/labels';
import { CATEGORY_DEFAULTS, type CategoryChannels } from '@/services/activity/policy';
import { categoriesOf } from '@/services/activity/sources';
import type { ActivityCategory, ActivityCategoryGroup } from '@/services/activity/types';
import { sendOsNotification } from '@/services/notification';
import type { ActivityNotificationSettings, NotificationSettings } from '@/types/settings';
import { PhoneCard } from './PhoneCard';

interface Props {
  notifications: NotificationSettings;
  onChange: (n: NotificationSettings) => void;
}

const NUDGE_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
];

const GROUPS: readonly { group: ActivityCategoryGroup; label: string }[] = [
  { group: 'agents', label: 'Agents' },
  { group: 'pull-requests', label: 'Pull requests' },
  { group: 'ci', label: 'CI failures' },
  { group: 'workstreams', label: 'Workstreams' },
  { group: 'deployments', label: 'Deployments' },
  { group: 'work-items', label: 'Work items' },
];

export const DEFAULT_ACTIVITY: ActivityNotificationSettings = {
  categories: {},
  seenInT3: true,
  markReadOnOpen: true,
  taskbarBadge: true,
  push: { enabled: false, preset: 'home-assistant', awayMinutes: 10, hideTitles: false },
};

function channelsOf(
  activity: ActivityNotificationSettings,
  category: ActivityCategory,
): CategoryChannels {
  return { ...CATEGORY_DEFAULTS[category], ...activity.categories[category] };
}

export function NotificationSection({ notifications, onChange }: Props) {
  const update = (partial: Partial<NotificationSettings>) =>
    onChange({ ...notifications, ...partial });
  const activity = notifications.activity ?? DEFAULT_ACTIVITY;
  const updateActivity = (partial: Partial<ActivityNotificationSettings>) =>
    update({ activity: { ...activity, ...partial } });
  const setChannel = (category: ActivityCategory, channel: keyof CategoryChannels, on: boolean) =>
    updateActivity({
      categories: {
        ...activity.categories,
        [category]: { ...activity.categories[category], [channel]: on },
      },
    });

  return (
    <>
      <SectionHeader
        title="Notifications"
        subtitle="Every popup comes from an entry in Activity, so a restart never repeats one and time away becomes one summary."
      />

      <Card variant="default" padding="md">
        <h3 className="mb-1.5 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          What pops up
        </h3>
        <p className="mb-3 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
          Each kind of update can pop up on this laptop and go to your phone. Phone only sends
          updates that need you, once you are away.
        </p>
        <div
          id="field-activity-categories"
          className="grid grid-cols-[1fr_64px_64px] items-center gap-x-3 gap-y-1.5 text-xs"
          role="table"
          aria-label="Activity notifications per kind of update"
        >
          <span role="columnheader" className="sr-only">
            Update
          </span>
          <span
            role="columnheader"
            className="text-center text-[11px] text-[var(--color-text-muted)]"
          >
            Popup
          </span>
          <span
            role="columnheader"
            className="text-center text-[11px] text-[var(--color-text-muted)]"
          >
            Phone
          </span>
          {GROUPS.map(({ group, label }) => (
            <Fragment key={group}>
              <span className="col-span-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {label}
              </span>
              {categoriesOf(group).map((category) => {
                const channels = channelsOf(activity, category);
                return (
                  <Fragment key={category}>
                    <span className="text-[var(--color-text-primary)]">
                      {CATEGORY_LABEL[category]}
                    </span>
                    <span className="flex justify-center">
                      <input
                        type="checkbox"
                        className="bd-act-check"
                        checked={channels.popup}
                        aria-label={`Popup: ${CATEGORY_LABEL[category]}`}
                        onChange={(e) => setChannel(category, 'popup', e.target.checked)}
                      />
                    </span>
                    <span className="flex justify-center">
                      <input
                        type="checkbox"
                        className="bd-act-check"
                        checked={channels.push}
                        disabled={!activity.push.enabled}
                        aria-label={`Phone: ${CATEGORY_LABEL[category]}`}
                        onChange={(e) => setChannel(category, 'push', e.target.checked)}
                      />
                    </span>
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Reading
        </h3>
        <div id="field-seen-in-t3">
          <ToggleRow
            label="A visit in T3 marks a thread's updates read"
            hint="Opening a thread in T3, on this laptop or your phone, reads what happened up to then. A T3 window left open on a thread counts too."
            on={activity.seenInT3}
            onChange={(seenInT3) => updateActivity({ seenInT3 })}
          />
        </div>
        <div id="field-read-on-open">
          <ToggleRow
            label="Opening something marks its updates read"
            hint="A PR's detail, an item in Dispatch, a workstream, a CI failure group."
            on={activity.markReadOnOpen}
            onChange={(markReadOnOpen) => updateActivity({ markReadOnOpen })}
          />
        </div>
        <div id="field-taskbar-badge">
          <ToggleRow
            label="Count on the taskbar icon"
            hint="How many unread updates need you."
            on={activity.taskbarBadge}
            onChange={(taskbarBadge) => updateActivity({ taskbarBadge })}
            last
          />
        </div>
      </Card>

      <PhoneCard push={activity.push} onChange={(push) => updateActivity({ push })} />

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Sound
        </h3>
        <div id="field-sounds">
          <ToggleRow
            label="Sounds"
            hint="Off silences every sound BorgDock plays."
            on={notifications.channels.sound}
            onChange={(sound) => update({ channels: { ...notifications.channels, sound } })}
          />
        </div>
        <div id="field-sound-on-merge">
          <ToggleRow
            label="Play sound on merge"
            on={notifications.playMergeSound}
            onChange={(playMergeSound) => update({ playMergeSound })}
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
        <div
          id="field-remind-every"
          className="grid grid-cols-[1fr_130px] items-center gap-4 border-b border-[var(--color-subtle-border)] py-3"
        >
          <div>
            <div className="text-xs font-medium text-[var(--color-text-primary)]">Remind every</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
              Cadence for the nudge above.
            </div>
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
        <div className="flex items-center gap-2.5" id="field-test-notification">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void sendOsNotification({
                title: 'Test notification',
                body: 'If you can see this, BorgDock notifications are working.',
                severity: 'info',
              }).catch(() => {});
              update({ lastTestFiredAt: Date.now() });
            }}
          >
            Test notification
          </Button>
          {typeof notifications.lastTestFiredAt === 'number' && (
            <span className="text-[10.5px] text-[var(--color-text-muted)]">
              last fired{' '}
              {Math.max(0, Math.round((Date.now() - notifications.lastTestFiredAt) / 1000))}s ago
            </span>
          )}
        </div>

        {import.meta.env.DEV && (
          <div className="mt-4 border-t pt-3 border-[var(--color-subtle-border)]">
            <div className="mb-1.5 text-[12px] font-medium text-[var(--color-text-secondary)]">
              Dev: fire by severity
            </div>
            <div className="mb-2 text-[10.5px] text-[var(--color-text-muted)]">
              Stripped from production builds. Merged plays the tada sound when the "Play sound on
              merge" toggle above is on.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['info', 'success', 'warning', 'error', 'merged'] as const).map((sev) => (
                <Button
                  key={sev}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void sendOsNotification({
                      title: `Dev test: ${sev}`,
                      body:
                        sev === 'merged'
                          ? '🎉 Pretend a PR just merged.'
                          : `A ${sev}-severity notification — tests visual + dismiss + actions.`,
                      severity: sev,
                      actions: [
                        { label: 'Open in GitHub', action: 'open-url', url: 'https://github.com' },
                      ],
                    }).catch(() => {});
                    update({ lastTestFiredAt: Date.now() });
                  }}
                >
                  {sev}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
