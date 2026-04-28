import { type BadgeId, useOnboardingStore } from '@/stores/onboarding-store';

interface FeatureBadgeProps {
  badgeId: BadgeId;
  label?: string;
}

export function FeatureBadge({ badgeId, label = 'NEW' }: FeatureBadgeProps) {
  const dismissedBadges = useOnboardingStore((s) => s.dismissedBadges);
  const dismissBadge = useOnboardingStore((s) => s.dismissBadge);

  if (dismissedBadges.has(badgeId)) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        dismissBadge(badgeId);
      }}
      className="ml-1.5 inline-flex items-center rounded-full bg-[var(--color-accent)] px-1.5 py-px text-[8px] font-bold uppercase leading-tight tracking-wide text-white hover:opacity-80 transition-opacity"
      data-feature-badge
      data-badge-id={badgeId}
    >
      {label}
    </button>
  );
}
