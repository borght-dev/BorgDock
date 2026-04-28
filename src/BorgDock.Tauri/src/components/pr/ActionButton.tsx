import clsx from 'clsx';
import type { MouseEvent, ReactNode } from 'react';
import { Button, type ButtonVariant } from '@/components/shared/primitives';

type LegacyVariant = 'default' | 'accent' | 'purple' | 'success' | 'draft' | 'danger';

// Legacy variants the PR card hover-row uses. These map onto the primitive
// Button variants; for tones the primitive doesn't expose natively (purple,
// draft, success) we apply a small className override. These overrides are
// passthrough shims until a future Button variant lands.
const VARIANT_TO_BUTTON_VARIANT: Record<LegacyVariant, ButtonVariant> = {
  default: 'ghost',
  accent: 'primary',
  purple: 'ghost',
  success: 'primary',
  draft: 'ghost',
  danger: 'danger',
};

const VARIANT_OVERRIDE_CLASS: Record<LegacyVariant, string | null> = {
  default: null,
  accent: null,
  // Custom colors — passthrough until primitive Button gains these tones.
  purple: '!text-[var(--color-purple,#9384F7)] !border-[var(--color-purple-border,#6655D4)]',
  success: '!bg-[var(--color-action-success-bg,color-mix(in_srgb,var(--color-status-green)_15%,transparent))] !text-[var(--color-status-green)] !border-[var(--color-success-badge-border)]',
  draft: '!text-[var(--color-draft-badge-fg)] !border-[var(--color-draft-badge-border)]',
  danger: null,
};

export function ActionButton({
  label,
  icon,
  onClick,
  variant = 'default',
}: {
  label: string;
  icon?: string;
  onClick: (e: MouseEvent) => void;
  variant?: LegacyVariant;
}) {
  const leading: ReactNode = icon ? <span className="text-[10px]">{icon}</span> : undefined;
  return (
    <Button
      variant={VARIANT_TO_BUTTON_VARIANT[variant]}
      size="sm"
      leading={leading}
      className={clsx(VARIANT_OVERRIDE_CLASS[variant])}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      {label}
    </Button>
  );
}
