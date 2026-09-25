import { GitMerge, MessageSquareText, MoreHorizontal } from 'lucide-react';
import type { MouseEvent } from 'react';
import { PrRowCore } from '@/components/pr/PrRowCore';
import { checksStatusLabel, type PrCardData, reviewStateFor } from '@/components/pr/pr-card-data';
import { Button, IconButton } from '@/components/shared/primitives';
import type { PrActionId } from '@/services/pr-action-resolver';
import type { FlyoutPr } from './FlyoutGlance';

const ICON = { size: 12, strokeWidth: 2.25, 'aria-hidden': true } as const;

interface FlyoutPrRowProps {
  pr: FlyoutPr;
  active?: boolean;
  onClick: (pr: FlyoutPr) => void;
  /** Generic action handler — wired by FlyoutGlance to emitTo events.
   *  The DOM event is forwarded so callers (e.g. 'more') can read click coords
   *  and anchor a popup menu. */
  onAction?: (pr: FlyoutPr, action: PrActionId | 'more', e: MouseEvent) => void;
}

/** The flyout payload's PR in the shape `PrRowCore` draws. */
export function flyoutCardData(pr: FlyoutPr): PrCardData {
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
    checks: {
      ok: pr.passedCount,
      fail: pr.failedCount,
      run: pr.pendingCount,
      total: pr.totalChecks,
    },
  };
}

/**
 * Flyout PR row — the main window's compact Workbench row (`PrRowCore`,
 * 32 px: avatar, title, check bar, chip, number) inside the flyout's own
 * frame. Its action slot holds the PR's `primaryAction` from the payload
 * (Review or Merge), and "More" for the flyout's context menu (also on
 * right-click).
 * Actions are forwarded to the main window, which owns the live pr-store:
 * Review brings the main window forward and opens Quick Review there.
 */
export function FlyoutPrRow({ pr, active, onClick, onAction }: FlyoutPrRowProps) {
  // Worked out by the main window, which knows who you are and your teams.
  const rowAction = pr.primaryAction ?? null;

  const fire = (action: PrActionId | 'more') => (e: MouseEvent) => {
    e.stopPropagation();
    onAction?.(pr, action, e);
  };

  return (
    <PrRowCore
      pr={flyoutCardData(pr)}
      density="compact"
      selected={active}
      className="bd-flyout-row"
      onClick={() => onClick(pr)}
      onContextMenu={(e) => {
        e.preventDefault();
        onAction?.(pr, 'more', e);
      }}
      action={
        <>
          {rowAction === 'review' && (
            <Button
              variant="primary"
              size="sm"
              leading={<MessageSquareText {...ICON} />}
              aria-label={`Review #${pr.number}`}
              data-pr-action="review"
              onClick={fire('review')}
            >
              Review
            </Button>
          )}
          {rowAction === 'merge' && (
            <Button
              variant="primary"
              size="sm"
              leading={<GitMerge {...ICON} />}
              aria-label={`Merge #${pr.number}`}
              data-pr-action="merge"
              onClick={fire('merge')}
            >
              Merge
            </Button>
          )}
          <IconButton
            icon={<MoreHorizontal size={14} strokeWidth={2.25} aria-hidden="true" />}
            tooltip="More actions"
            aria-label={`More actions for #${pr.number}`}
            size={22}
            data-pr-action="more"
            onClick={fire('more')}
          />
        </>
      }
    />
  );
}
