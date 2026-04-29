import { useState } from 'react';
import { PRCard, type PRCardData } from '@/components/pr/PRCard';
import { BranchIcon, MoreHIcon } from '@/components/pr/PrActionIcons';
import { PrPrimaryActionButton } from '@/components/pr/PrPrimaryActionButton';
import { IconButton } from '@/components/shared/primitives';
import { type PrActionId, primaryFor } from '@/services/pr-action-resolver';
import type { FlyoutPr } from './FlyoutGlance';

interface PRRowProps {
  pr: FlyoutPr;
  active?: boolean;
  onClick: (pr: FlyoutPr) => void;
  /** Generic action handler — wired by FlyoutGlance to emitTo events. */
  onAction?: (pr: FlyoutPr, action: PrActionId | 'more') => void;
  /** Show "owner/repo" in the secondary line. Defaults to true. */
  showRepo?: boolean;
}

function mapFlyoutPr(pr: FlyoutPr): PRCardData {
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
 * Mirrors design's PRRow in pr-card.jsx (chat lands on B for the flyout).
 */
export function PRRow({ pr, active, onClick, onAction, showRepo = true }: PRRowProps) {
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
    onAction?.(pr, action);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <PRCard
        pr={mapFlyoutPr(pr)}
        density="compact"
        active={active}
        onClick={() => onClick(pr)}
        showRepo={showRepo}
      />
      {/* Action cluster: secondary icons fade in on hover, primary always visible.
          Anchored on top of the trailing review pill area; the pill collapses behind
          this overlay when hovered. */}
      <div
        data-pr-actions=""
        // biome-ignore lint/a11y/useKeyWithClickEvents: container only stops propagation; inner buttons handle their own activation
        onClick={(e) => e.stopPropagation()}
        className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1"
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
            // Pill is rendered inside PRCard; we don't need to render it here.
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
