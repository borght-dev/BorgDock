import { useState } from 'react';
import type { ReviewerLoad } from '@/services/team-review-load';
import { usePrStore } from '@/stores/pr-store';

function loadColor(count: number): string {
  if (count <= 2) return 'var(--color-status-green)';
  if (count <= 4) return 'var(--color-status-yellow)';
  return 'var(--color-status-red)';
}

function avatarInitials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

function ReviewerRow({ reviewer }: { reviewer: ReviewerLoad }) {
  const setFilter = usePrStore((s) => s.setFilter);
  const setSearchQuery = usePrStore((s) => s.setSearchQuery);
  const color = loadColor(reviewer.pendingReviewCount);
  const maxBar = 6; // normalize bar to max 6 reviews
  const barWidth = Math.min(reviewer.pendingReviewCount / maxBar, 1) * 100;

  return (
    <button
      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
      onClick={() => {
        setFilter('needsReview');
        setSearchQuery(reviewer.login);
      }}
      title={`${reviewer.login}: ${reviewer.pendingReviewCount} pending review${reviewer.pendingReviewCount !== 1 ? 's' : ''}${reviewer.stalePrCount > 0 ? `, ${reviewer.stalePrCount} stale` : ''}`}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium text-white bg-[#534AB7]"
      >
        {avatarInitials(reviewer.login)}
      </span>
      <span className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="truncate text-[11px] text-[var(--color-text-secondary)]">
            {reviewer.login}
          </span>
          {/* style: load-driven color token (green/yellow/red) varies per reviewer count */}
          <span className="ml-2 shrink-0 text-[10px] font-medium tabular-nums" style={{ color }}>
            {reviewer.pendingReviewCount}
          </span>
        </div>
        <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
          {/* style: bar width is computed (pendingReviewCount / maxBar) — dynamic, load-driven color token */}
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${barWidth}%`, background: color }}
          />
        </div>
      </span>
    </button>
  );
}

export function TeamReviewLoad() {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const reviewRequestTimestamps = usePrStore((s) => s.reviewRequestTimestamps);
  const teamReviewLoad = usePrStore((s) => s.teamReviewLoad);

  // Re-render when data changes
  void pullRequests;
  void reviewRequestTimestamps;

  const reviewers = teamReviewLoad();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (reviewers.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center gap-2 px-3 pt-2 pb-1"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`shrink-0 text-[var(--color-text-ghost)] transition-transform duration-200 ${isCollapsed ? 'rotate-0' : 'rotate-90'}`}
        >
          <path d="m6 4 4 4-4 4" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-ghost)]">
          Review Load
        </span>
        <span className="h-px flex-1 bg-[var(--color-separator)]" />
        <span
          className="rounded-full px-1.5 text-[9px] font-medium tabular-nums text-[var(--color-text-ghost)] bg-[var(--color-surface-raised)]"
        >
          {reviewers.length}
        </span>
      </button>
      {!isCollapsed && (
        <div className="flex flex-col gap-0.5 px-1 pt-0.5">
          {reviewers.map((r) => (
            <ReviewerRow key={r.login} reviewer={r} />
          ))}
        </div>
      )}
    </div>
  );
}
