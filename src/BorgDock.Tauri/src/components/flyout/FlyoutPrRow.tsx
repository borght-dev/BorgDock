import { HoverActionPillBar } from '@/components/pr/HoverActionPillBar';
import { PrRow } from '@/components/pr/PrRow';
import { checksStatusLabel, type PrCardData, reviewStateFor } from '@/components/pr/pr-card-data';
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
  /** Show the repo name next to the author. Defaults to true. */
  showRepo?: boolean;
}

function mapFlyoutPr(pr: FlyoutPr): PrCardData {
  return {
    number: pr.number,
    title: pr.title,
    repoOwner: pr.repoOwner,
    repoName: pr.repoName,
    authorLogin: pr.authorLogin,
    isMine: pr.isMine,
    status: pr.overallStatus,
    statusLabel: checksStatusLabel({
      failed: pr.failedCount,
      pending: pr.pendingCount,
      passed: pr.passedCount,
      relevant: pr.relevantChecks ?? pr.totalChecks,
    }),
    reviewState: reviewStateFor(pr.reviewStatus),
    isDraft: pr.isDraft ?? false,
    isMerged: false,
    isClosed: false,
    hasConflict: pr.mergeable === false,
    baseBranch: pr.baseRef,
    additions: pr.additions,
    deletions: pr.deletions,
    labels: pr.labels,
  };
}

/**
 * Flyout PR row — the main window's comfortable `PrRow` with the same
 * hover-reveal action bar. Actions are forwarded to the main window, which
 * owns the live pr-store.
 */
export function FlyoutPrRow({ pr, active, onClick, onAction, showRepo = true }: FlyoutPrRowProps) {
  const approved = pr.reviewStatus === 'approved';
  const primary = primaryFor({
    failing: pr.failedCount > 0 || pr.overallStatus === 'red',
    approved,
    reviewing: pr.reviewStatus === 'pending',
    own: pr.isMine,
    ready: pr.overallStatus === 'green' && approved && pr.mergeable !== false && !pr.isDraft,
  });

  const fire = (action: PrActionId | 'more') => (e: React.MouseEvent) => {
    e.stopPropagation();
    onAction?.(pr, action, e);
  };

  return (
    <div className="bd-pr-row-wrap">
      <PrRow
        pr={mapFlyoutPr(pr)}
        density="comfortable"
        score={pr.mergeScore}
        active={active}
        onClick={() => onClick(pr)}
        showRepo={showRepo}
      />
      <div className="bd-pr-item__actions" data-density="comfortable">
        <HoverActionPillBar
          primary={primary}
          onPrimary={fire(primary)}
          onCheckout={fire('checkout')}
          onReview={fire('review')}
          onMore={fire('more')}
        />
      </div>
    </div>
  );
}
