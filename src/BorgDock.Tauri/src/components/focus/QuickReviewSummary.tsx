import { avatarInitials, prRowKey } from '@/components/pr/pr-card-data';
import { Avatar, Button, Pill, type PillTone } from '@/components/shared/primitives';
import type { ReviewDecision } from '@/stores/quick-review-store';
import type { PullRequestWithChecks } from '@/types';

interface QuickReviewSummaryProps {
  queue: PullRequestWithChecks[];
  /** Keyed `owner/repo#number` (`prRowKey`). */
  decisions: Map<string, ReviewDecision>;
  nextPr?: PullRequestWithChecks;
  onNext: () => void;
  onClose: () => void;
}

const DECISION_LABELS: Record<ReviewDecision, { label: string; tone: PillTone }> = {
  approved: { label: 'Approved', tone: 'success' },
  commented: { label: 'Commented', tone: 'warning' },
  skipped: { label: 'Skipped', tone: 'ghost' },
};

export function QuickReviewSummary({
  queue,
  decisions,
  nextPr,
  onNext,
  onClose,
}: QuickReviewSummaryProps) {
  const approved = [...decisions.values()].filter((d) => d === 'approved').length;
  const commented = [...decisions.values()].filter((d) => d === 'commented').length;
  const skipped = [...decisions.values()].filter((d) => d === 'skipped').length;

  return (
    <div data-quick-review-summary="" className="space-y-4">
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
            <div className="text-xl font-bold text-[var(--color-status-green)]">{approved}</div>
            <div className="text-[10px] text-[var(--color-text-muted)]">Approved</div>
          </div>
        )}
        {commented > 0 && (
          <div className="text-center">
            <div className="text-xl font-bold text-[var(--color-status-yellow)]">{commented}</div>
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
      <div className="bd-pr-panel max-h-[300px] overflow-y-auto">
        {queue.map((pr) => {
          const decision = decisions.get(prRowKey(pr.pullRequest));
          const info = decision ? DECISION_LABELS[decision] : null;
          return (
            <div key={prRowKey(pr.pullRequest)} className="bd-pr-mini-row">
              <Avatar initials={avatarInitials(pr.pullRequest.authorLogin)} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{pr.pullRequest.title}</span>
              <span className="bd-pr-item__number">#{pr.pullRequest.number}</span>
              {info && <Pill tone={info.tone}>{info.label}</Pill>}
            </div>
          );
        })}
      </div>

      {nextPr && (
        <section className="qr-summary__next" aria-label="Next review">
          <span className="qr-summary__next-label">Up next · review requested</span>
          <span className="qr-summary__next-title">{nextPr.pullRequest.title}</span>
          <span className="qr-summary__next-meta">
            {nextPr.pullRequest.repoOwner}/{nextPr.pullRequest.repoName} #
            {nextPr.pullRequest.number}
          </span>
        </section>
      )}
      <div className="qr-summary__actions">
        {nextPr && (
          <Button variant="primary" size="md" aria-keyshortcuts="Enter" onClick={onNext}>
            Review next PR
          </Button>
        )}
        <Button variant={nextPr ? 'secondary' : 'primary'} size="md" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
