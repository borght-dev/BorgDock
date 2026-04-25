import { PRCard, type PRCardData } from '@/components/pr/PRCard';
import type { FlyoutPr } from './FlyoutGlance';

interface PRRowProps {
  pr: FlyoutPr;
  active?: boolean;
  onClick: (pr: FlyoutPr) => void;
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

export function PRRow({ pr, active, onClick }: PRRowProps) {
  return (
    <PRCard
      pr={mapFlyoutPr(pr)}
      density="compact"
      active={active}
      onClick={() => onClick(pr)}
    />
  );
}
