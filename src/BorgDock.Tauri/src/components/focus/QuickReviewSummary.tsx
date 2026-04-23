import type { ReviewDecision } from '@/stores/quick-review-store';
import type { PullRequestWithChecks } from '@/types';

interface QuickReviewSummaryProps {
  queue: PullRequestWithChecks[];
  decisions: Map<number, ReviewDecision>;
  onClose: () => void;
}

const DECISION_LABELS: Record<ReviewDecision, { label: string; color: string }> = {
  approved: { label: 'Approved', color: 'var(--color-status-green)' },
  commented: { label: 'Commented', color: 'var(--color-status-yellow)' },
  skipped: { label: 'Skipped', color: 'var(--color-text-muted)' },
};

export function QuickReviewSummary({ queue, decisions, onClose }: QuickReviewSummaryProps) {
  const approved = [...decisions.values()].filter((d) => d === 'approved').length;
  const commented = [...decisions.values()].filter((d) => d === 'commented').length;
  const skipped = [...decisions.values()].filter((d) => d === 'skipped').length;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-lg font-semibold text-[var(--color-text-primary)]">
          Review Complete
        </div>
        <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          {queue.length} PR{queue.length !== 1 ? 's' : ''} reviewed
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex justify-center gap-6">
        {approved > 0 && (
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: 'var(--color-status-green)' }}>
              {approved}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)]">Approved</div>
          </div>
        )}
        {commented > 0 && (
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: 'var(--color-status-yellow)' }}>
              {commented}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)]">Commented</div>
          </div>
        )}
        {skipped > 0 && (
          <div className="text-center">
            <div className="text-xl font-bold text-[var(--color-text-muted)]">{skipped}</div>
            <div className="text-[10px] text-[var(--color-text-muted)]">Skipped</div>
          </div>
        )}
      </div>

      {/* PR list */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {queue.map((pr) => {
          const decision = decisions.get(pr.pullRequest.number);
          const info = decision ? DECISION_LABELS[decision] : null;
          return (
            <div
              key={pr.pullRequest.number}
              className="flex items-center justify-between rounded-md px-3 py-1.5 text-xs"
            >
              <span className="text-[var(--color-text-secondary)] truncate mr-2">
                #{pr.pullRequest.number} {pr.pullRequest.title}
              </span>
              {info && (
                <span className="shrink-0 font-medium" style={{ color: info.color }}>
                  {info.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={onClose}
        className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-[var(--color-accent-foreground)] hover:opacity-90 transition-opacity"
      >
        Done
      </button>
    </div>
  );
}
