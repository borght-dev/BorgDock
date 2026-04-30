import type { CSSProperties, MouseEvent } from 'react';
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

// Inline style is used (not Tailwind `!text-white`) because Tailwind v4 does
// not honour the v3 `!`-prefix important syntax — the override silently
// dropped through to `bd-btn`'s default secondary text colour, which is why
// the Re-run pill rendered with dark text on the warning fill.
const TONE_STYLE: Record<string, CSSProperties | undefined> = {
  success: {
    background: 'var(--color-status-green)',
    borderColor: 'var(--color-status-green)',
    color: '#fff',
  },
  warning: {
    background: 'var(--color-status-yellow)',
    borderColor: 'var(--color-status-yellow)',
    color: '#fff',
  },
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
      style={TONE_STYLE[tone]}
    >
      {iconOnly ? null : ACTION_LABEL[action]}
    </Button>
  );
}
