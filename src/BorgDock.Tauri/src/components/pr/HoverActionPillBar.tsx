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
  /** When set, renders a purple "Resolve Conflicts" button at the start of the bar. */
  onResolveConflicts?: (e: MouseEvent) => void;
  /** Optional extra leading slot (e.g. custom override). */
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
  onResolveConflicts,
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
      {onResolveConflicts && (
        <Button
          variant="primary"
          size="sm"
          leading={<ResolveConflictsIcon />}
          title="Resolve Conflicts"
          data-pr-action="resolve-conflicts"
          // Inline style — Tailwind v4 doesn't honour the v3 `!`-prefix syntax,
          // so an override like `!bg-...` is silently ignored. Inline style
          // wins reliably and gives the design's purple "fix-me" treatment.
          style={{
            background: 'var(--color-purple, #6655d4)',
            borderColor: 'var(--color-purple, #6655d4)',
            color: '#fff',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onResolveConflicts(e);
          }}
        >
          Resolve Conflicts
        </Button>
      )}
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

/**
 * Sparkle/conflict glyph for the Resolve Conflicts button. Matches the original
 * standalone-button glyph (✦) — small enough to read at sm button size while
 * still signalling "magic / fix-up flow" rather than a literal merge action.
 */
function ResolveConflictsIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 1 9.4 6.6 15 8l-5.6 1.4L8 15l-1.4-5.6L1 8l5.6-1.4z" />
    </svg>
  );
}
