import { useState } from 'react';
import { PrCardView, type PrCardData } from '@/components/pr/PrCardView';
import { BranchIcon, MoreHIcon } from '@/components/pr/PrActionIcons';
import { PrPrimaryActionButton } from '@/components/pr/PrPrimaryActionButton';
import { IconButton } from '@/components/shared/primitives';
import { type PrActionId, primaryFor } from '@/services/pr-action-resolver';
import type { FlyoutPr } from './FlyoutGlance';

interface FlyoutPrRowProps {
  pr: FlyoutPr;
  active?: boolean;
  onClick: (pr: FlyoutPr) => void;
  /** Generic action handler — wired by FlyoutGlance to emitTo events.
   *  The DOM event is forwarded so callers (e.g. 'more') can read click coords
   *  and anchor a popup menu. */
  onAction?: (pr: FlyoutPr, action: PrActionId | 'more', e: React.MouseEvent) => void;
  /** Show "owner/repo" in the secondary line. Defaults to true. */
  showRepo?: boolean;
}

function mapFlyoutPr(pr: FlyoutPr): PrCardData {
  const statusLabel =
    pr.failedCount > 0
      ? `${pr.failedCount} failing`
      : pr.pendingCount > 0
        ? `${pr.pendingCount} running`
        : `${pr.passedCount} passed`;
  const reviewState =
    pr.reviewStatus === 'approved'
      ? 'approved'
      : pr.reviewStatus === 'changesRequested'
        ? 'changes'
        : pr.reviewStatus === 'commented'
          ? 'commented'
          : pr.reviewStatus === 'pending'
            ? 'pending'
            : 'none';
  return {
    number: pr.number,
    title: pr.title,
    repoOwner: pr.repoOwner,
    repoName: pr.repoName,
    authorLogin: pr.authorLogin,
    isMine: pr.isMine,
    status: pr.overallStatus,
    statusLabel,
    reviewState,
    isDraft: false,
    isMerged: false,
    isClosed: false,
    hasConflict: false,
  };
}

/**
 * Variant B — smart primary action always visible, secondary icons fade in on hover.
 * Mirrors design's FlyoutPrRow in pr-card.jsx (chat lands on B for the flyout).
 */
export function FlyoutPrRow({ pr, active, onClick, onAction, showRepo = true }: FlyoutPrRowProps) {
  const [hovered, setHovered] = useState(false);
  const reviewing = pr.reviewStatus === 'pending';
  const primary = primaryFor({
    failing: pr.failedCount > 0 || pr.overallStatus === 'red',
    approved: pr.reviewStatus === 'approved',
    reviewing,
    own: pr.isMine,
  });

  const handleAction = (action: PrActionId | 'more') => (e: React.MouseEvent) => {
    e.stopPropagation();
    onAction?.(pr, action, e);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <PrCardView
        pr={mapFlyoutPr(pr)}
        density="compact"
        active={active}
        onClick={() => onClick(pr)}
        showRepo={showRepo}
      />
      {/* Action cluster — anchored bottom-right of the row.
          PrCardView compact reserves pb-9 of footer space so this band doesn't
          overlap the title/meta. Secondary icons fade in on hover, primary
          stays visible. */}
      <div
        data-pr-actions=""
        // biome-ignore lint/a11y/useKeyWithClickEvents: container only stops propagation; inner buttons handle their own activation
        onClick={(e) => e.stopPropagation()}
        className="absolute right-3 bottom-1.5 flex items-center gap-1"
        // style: pointer-events on inactive secondary span needs precise toggle separately from opacity
        style={{}}
      >
        <span
          className="flex items-center gap-1 transition-all duration-150"
          style={{
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateX(0)' : 'translateX(4px)',
            pointerEvents: hovered ? 'auto' : 'none',
          }}
        >
          <IconButton
            icon={<BranchIcon size={12} />}
            size={22}
            tooltip="Checkout"
            aria-label="Checkout"
            data-flyout-action="checkout"
            onClick={handleAction('checkout')}
          />
          <IconButton
            icon={<MoreHIcon size={12} />}
            size={22}
            tooltip="More actions"
            aria-label="More actions"
            data-flyout-action="more"
            onClick={handleAction('more')}
          />
        </span>
        {/* Hide the review pill on hover so the primary button sits cleanly. */}
        <span
          className="transition-opacity duration-150"
          style={{
            opacity: hovered ? 0 : 1,
            // Pill is rendered inside PrCardView; we don't need to render it here.
            // This empty span just reserves rhythm with the design.
          }}
        />
        <PrPrimaryActionButton
          action={primary}
          onClick={handleAction(primary)}
          iconOnly={!hovered && primary !== 'rerun' && primary !== 'merge'}
        />
      </div>
    </div>
  );
}
