import { Avatar } from '@/components/shared/primitives';
import type { ReviewerLoad } from '@/services/team-review-load';
import { usePrStore } from '@/stores/pr-store';

function loadColor(count: number): string {
  if (count <= 2) return 'var(--color-status-green)';
  if (count <= 4) return 'var(--color-status-yellow)';
  return 'var(--color-status-red)';
}

interface ReviewerRowProps {
  reviewer: ReviewerLoad;
  /** What a click does: the list filters to the reviewer through its filter control and FLIP. */
  onSelect: (reviewer: ReviewerLoad) => void;
}

/** Pending reviews that fill the load bar. */
const FULL_LOAD = 6;

function pendingLabel(r: ReviewerLoad): string {
  const pending = `${r.pendingReviewCount} pending review${r.pendingReviewCount === 1 ? '' : 's'}`;
  return r.stalePrCount > 0 ? `${pending}, ${r.stalePrCount} stale` : pending;
}

/**
 * One reviewer under "Review load", on the pull request row's grid: avatar,
 * login over the pending line, a load bar in the checks column and the count.
 */
export function ReviewerRow({ reviewer, onSelect }: ReviewerRowProps) {
  const color = loadColor(reviewer.pendingReviewCount);
  const fill = Math.min(reviewer.pendingReviewCount / FULL_LOAD, 1) * 100;
  const label = pendingLabel(reviewer);

  return (
    <button
      className="bd-wb-reviewer"
      type="button"
      onClick={() => onSelect(reviewer)}
      title={`${reviewer.login}: ${label}`}
    >
      <Avatar
        initials={reviewer.login.slice(0, 2).toUpperCase()}
        size="sm"
        className="bd-wb-row__avatar"
        aria-hidden="true"
      />
      <span className="bd-wb-row__text">
        <span className="bd-wb-row__title">{reviewer.login}</span>
        <span className="bd-wb-row__meta">{label}</span>
      </span>
      <span className="bd-wb-reviewer__bar" aria-hidden="true">
        {/* style: fill width and load colour are computed per reviewer */}
        <span style={{ width: `${fill}%`, background: color }} />
      </span>
      {/* style: load colour (green / yellow / red) varies per reviewer */}
      <span className="bd-wb-reviewer__count" style={{ color }}>
        {reviewer.pendingReviewCount}
      </span>
    </button>
  );
}

/** Pending reviews per reviewer, re-read whenever the PRs or request times change. */
export function useTeamReviewers(): ReviewerLoad[] {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const reviewRequestTimestamps = usePrStore((s) => s.reviewRequestTimestamps);
  const teamReviewLoad = usePrStore((s) => s.teamReviewLoad);

  // Re-render when data changes
  void pullRequests;
  void reviewRequestTimestamps;

  return teamReviewLoad();
}
