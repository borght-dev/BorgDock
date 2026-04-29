import type { MouseEvent, ReactNode } from 'react';
import { Button, IconButton } from '@/components/shared/primitives';
import type { PrActionId } from '@/services/pr-action-resolver';
import { MoreHIcon, PrActionIcon } from './PrActionIcons';
import { PrPrimaryActionButton } from './PrPrimaryActionButton';

export interface HoverActionPillBarProps {
  primary: PrActionId;
  onPrimary: (e: MouseEvent) => void;
  onCheckout?: (e: MouseEvent) => void;
  onReview?: (e: MouseEvent) => void;
  onMore: (e: MouseEvent) => void;
  /** Optional extra leading slot (e.g. Resolve Conflicts). */
  leading?: ReactNode;
}

/**
 * Variant A — compact hover-reveal pill bar for the main-window PR card.
 * Anchored bottom-right via parent positioning. Reveal/visibility is handled
 * by the parent's `group-hover` modifier; this component only renders the bar.
 *
 * See design/mockups/borgdock-streamline-redesign.html — pr-actions.jsx variant A.
 */
export function HoverActionPillBar({
  primary,
  onPrimary,
  onCheckout,
  onReview,
  onMore,
  leading,
}: HoverActionPillBarProps) {
  return (
    <div
      data-pr-action-bar="A"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="PR actions"
      className="flex gap-1 rounded-lg border bg-[var(--color-surface)] p-1 px-1.5 border-[var(--color-strong-border)] shadow-[var(--elevation-2)]"
    >
      {leading}
      <PrPrimaryActionButton action={primary} onClick={onPrimary} />
      {onCheckout && primary !== 'checkout' && (
        <Button
          variant="secondary"
          size="sm"
          leading={<PrActionIcon kind="branch" size={12} />}
          title="Checkout"
          data-pr-action="checkout"
          onClick={(e) => {
            e.stopPropagation();
            onCheckout(e);
          }}
        >
          Checkout
        </Button>
      )}
      {onReview && primary !== 'review' && (
        <Button
          variant="secondary"
          size="sm"
          leading={<PrActionIcon kind="eye" size={12} />}
          title="Review"
          data-pr-action="review"
          onClick={(e) => {
            e.stopPropagation();
            onReview(e);
          }}
        >
          Review
        </Button>
      )}
      <IconButton
        icon={<MoreHIcon size={12} />}
        size={22}
        tooltip="More actions"
        aria-label="More actions"
        data-pr-action="more"
        onClick={(e) => {
          e.stopPropagation();
          onMore(e);
        }}
      />
    </div>
  );
}
