import type { NotificationSettings } from '@/types';

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
