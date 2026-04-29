import clsx from 'clsx';
import type { MouseEvent } from 'react';
import { Button } from '@/components/shared/primitives';
import {
  ACTION_LABEL,
  type PrActionId,
  primaryTone,
} from '@/services/pr-action-resolver';
import { PrActionIcon, type PrActionIconKind } from './PrActionIcons';

const ACTION_ICON: Record<PrActionId, PrActionIconKind> = {
  rerun: 'refresh',
  merge: 'merge',
  review: 'eye',
  checkout: 'branch',
  open: 'external',
};

export interface PrPrimaryActionButtonProps {
  action: PrActionId;
  onClick: (e: MouseEvent) => void;
  /** Hide the label, show only the icon. */
  iconOnly?: boolean;
}

/**
 * State-aware primary action button (Re-run / Merge / Review / Checkout / Open).
 * Mirrors the design's tonal treatment in pr-actions.jsx ActionBtn.
 */
export function PrPrimaryActionButton({ action, onClick, iconOnly }: PrPrimaryActionButtonProps) {
  const tone = primaryTone(action);
  return (
    <Button
      variant={tone === 'success' || tone === 'primary' ? 'primary' : 'secondary'}
      size="sm"
      leading={<PrActionIcon kind={ACTION_ICON[action]} size={12} />}
      title={ACTION_LABEL[action]}
      data-pr-primary-action={action}
      data-pr-primary-tone={tone}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={clsx(
        tone === 'success' &&
          '!bg-[var(--color-status-green)] !border-[var(--color-status-green)] !text-white',
        tone === 'warning' &&
          '!bg-[var(--color-status-yellow)] !border-[var(--color-status-yellow)] !text-white',
      )}
    >
      {iconOnly ? null : ACTION_LABEL[action]}
    </Button>
  );
}
