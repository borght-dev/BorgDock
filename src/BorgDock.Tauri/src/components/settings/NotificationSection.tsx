import { useState } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import type { InAppNotification, NotificationSettings, NotificationSeverity } from '@/types';

const TEST_NOTIFICATIONS: { severity: NotificationSeverity; notification: InAppNotification }[] = [
  {
    severity: 'error',
    notification: {
      title: 'Check failed: ci/build',
      message: '#142 Fix auth token refresh (acme/backend)',
      severity: 'error',
      launchUrl: '#',
      prNumber: 142,
      repoFullName: 'acme/backend',
      actions: [
        { label: 'Open in GitHub', url: '#' },
        { label: 'Fix with Claude', url: '#' },
      ],
    },
  },
  {
    severity: 'success',
    notification: {
      title: 'All checks passed',
      message: '#87 Add user profile endpoint (acme/api)',
      severity: 'success',
      launchUrl: '#',
      prNumber: 87,
      repoFullName: 'acme/api',
      actions: [{ label: 'Open in GitHub', url: '#' }],
    },
  },
  {
    severity: 'warning',
    notification: {
      title: 'Changes requested',
      message: '#203 Migrate to new auth middleware (acme/web)',
      severity: 'warning',
      launchUrl: '#',
      prNumber: 203,
      repoFullName: 'acme/web',
      actions: [{ label: 'Open in GitHub', url: '#' }],
    },
  },
  {
    severity: 'info',
    notification: {
      title: 'New PR opened',
      message: '#56 Update dependencies (acme/infra)',
      severity: 'info',
      launchUrl: '#',
      prNumber: 56,
      repoFullName: 'acme/infra',
      actions: [{ label: 'Open in GitHub', url: '#' }],
    },
  },
  {
    severity: 'merged',
    notification: {
      title: '🎉 PR #312 merged!',
      message: 'Redesign notification system (acme/frontend)',
      severity: 'merged',
      launchUrl: '#',
      prNumber: 312,
      repoFullName: 'acme/frontend',
      actions: [{ label: 'View on GitHub', url: '#' }],
    },
  },
];

interface NotificationSectionProps {
  notifications: NotificationSettings;
  onChange: (notifications: NotificationSettings) => void;
}

export function NotificationSection({ notifications, onChange }: NotificationSectionProps) {
  const update = (partial: Partial<NotificationSettings>) =>
    onChange({ ...notifications, ...partial });

  return (
    <div className="space-y-2">
      <ToggleRow
        label="Check status changes"
        checked={notifications.toastOnCheckStatusChange}
        onChange={(v) => update({ toastOnCheckStatusChange: v })}
      />
      <ToggleRow
        label="New pull requests"
        checked={notifications.toastOnNewPR}
        onChange={(v) => update({ toastOnNewPR: v })}
      />
      <ToggleRow
        label="Review updates"
        checked={notifications.toastOnReviewUpdate}
        onChange={(v) => update({ toastOnReviewUpdate: v })}
      />
      <ToggleRow
        label="PR becomes mergeable"
        checked={notifications.toastOnMergeable}
        onChange={(v) => update({ toastOnMergeable: v })}
      />

      <div className="my-2 h-px bg-[var(--color-separator)]" />

      <ToggleRow
        label="Only notify for my PRs"
        checked={notifications.onlyMyPRs}
        onChange={(v) => update({ onlyMyPRs: v })}
      />

      <div className="my-2 h-px bg-[var(--color-separator)]" />

      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-ghost)] mb-1">
        Review Reminders
      </div>
      <ToggleRow
        label="Nudge for pending reviews"
        checked={notifications.reviewNudgeEnabled}
        onChange={(v) => update({ reviewNudgeEnabled: v })}
      />
      {notifications.reviewNudgeEnabled && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-primary)]">Remind every</span>
            <select
              value={notifications.reviewNudgeIntervalMinutes}
              onChange={(e) => update({ reviewNudgeIntervalMinutes: Number(e.target.value) })}
              className="rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-2 py-0.5 text-xs text-[var(--color-text-primary)]"
            >
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={240}>4 hours</option>
            </select>
          </div>
          <ToggleRow
            label="Escalate urgency over time"
            checked={notifications.reviewNudgeEscalation}
            onChange={(v) => update({ reviewNudgeEscalation: v })}
          />
        </>
      )}

      <div className="my-2 h-px bg-[var(--color-separator)]" />

      <TestNotificationRow />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--color-text-primary)]">{label}</span>
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
    </div>
  );
}

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  error: 'var(--color-status-red)',
  success: 'var(--color-status-green)',
  warning: 'var(--color-status-yellow)',
  info: 'var(--color-accent)',
  merged: 'var(--color-toast-merged-stripe)',
};

function TestNotificationRow() {
  const show = useNotificationStore((s) => s.show);
  const [lastFired, setLastFired] = useState<NotificationSeverity | null>(null);

  const fire = (entry: (typeof TEST_NOTIFICATIONS)[number]) => {
    show(entry.notification);
    setLastFired(entry.severity);
    setTimeout(() => setLastFired(null), 600);
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--color-text-tertiary)]">Test notification</span>
      <div className="flex gap-1">
        {TEST_NOTIFICATIONS.map((entry) => (
          <button
            key={entry.severity}
            title={`Send ${entry.severity} notification`}
            className="h-5 w-5 rounded-md text-[9px] font-bold transition-all duration-150 hover:scale-110"
            style={{
              background:
                lastFired === entry.severity
                  ? SEVERITY_COLORS[entry.severity]
                  : 'var(--color-surface-raised)',
              color: lastFired === entry.severity ? '#fff' : SEVERITY_COLORS[entry.severity],
              border: `1px solid color-mix(in srgb, ${SEVERITY_COLORS[entry.severity]} 25%, transparent)`,
            }}
            onClick={() => fire(entry)}
          >
            {entry.severity[0]!.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
