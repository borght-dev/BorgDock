import { useState } from 'react';
import { Button } from '@/components/shared/primitives';
import { PRCard, type PRCardData } from '@/components/pr/PRCard';
import type { FlyoutPr } from './FlyoutGlance';

interface PRRowProps {
  pr: FlyoutPr;
  active?: boolean;
  onClick: (pr: FlyoutPr) => void;
  /** Shown on hover when failedCount > 0. */
  onFix?: (pr: FlyoutPr) => void;
  /** Shown on hover when overallStatus !== 'green' && totalChecks > 0. */
  onMonitor?: (pr: FlyoutPr) => void;
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

export function PRRow({ pr, active, onClick, onFix, onMonitor }: PRRowProps) {
  const [hovered, setHovered] = useState(false);
  const showFix = !!onFix && pr.failedCount > 0;
  const showMonitor = !!onMonitor && pr.overallStatus !== 'green' && pr.totalChecks > 0;
  const showActions = hovered && (showFix || showMonitor);

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
      />
      {showActions && (
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 gap-1">
          {showFix && (
            <Button
              variant="danger"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onFix!(pr);
              }}
            >
              Fix
            </Button>
          )}
          {showMonitor && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onMonitor!(pr);
              }}
            >
              Monitor
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
