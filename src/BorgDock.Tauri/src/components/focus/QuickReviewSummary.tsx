import { avatarInitials, prRowKey } from '@/components/pr/pr-card-data';
import { Avatar, Button, Pill, type PillTone } from '@/components/shared/primitives';
import type { HeldPr } from '@/services/author-run';
import type { ReviewActivity, ReviewDecision } from '@/stores/quick-review-store';
import type { PullRequestWithChecks } from '@/types';

interface QuickReviewSummaryProps {
  queue: PullRequestWithChecks[];
  /** Keyed `owner/repo#number` (`prRowKey`). */
  decisions: Map<string, ReviewDecision>;
  activity?: readonly ReviewActivity[];
  nextPr?: PullRequestWithChecks;
  onNext: () => void;
  /** The same author's next unblocked PR, preferring passing checks. */
  authorNext?: PullRequestWithChecks;
  onAuthorNext?: () => void;
  /** The run's author's PRs it left out, and why. */
  held?: readonly HeldPr[];
  onClose: () => void;
}

const DECISION_LABELS: Record<ReviewDecision, { label: string; tone: PillTone }> = {
  approved: { label: 'Approved', tone: 'success' },
  commented: { label: 'Commented', tone: 'warning' },
  skipped: { label: 'Skipped', tone: 'ghost' },
};

function checksLabel(pr: PullRequestWithChecks): string {
  if (pr.overallStatus === 'green') return 'passing checks';
  if (pr.overallStatus === 'red') return 'failing checks';
  if (pr.overallStatus === 'yellow') return 'checks pending';
  return 'checks unavailable';
}

export function QuickReviewSummary({
  queue,
  decisions,
  activity,
  nextPr,
  onNext,
  authorNext,
  onAuthorNext,
  held = [],
  onClose,
}: QuickReviewSummaryProps) {
  const reviewed = activity?.length
    ? activity
    : queue.map((pr) => ({ pr, decision: decisions.get(prRowKey(pr.pullRequest)) }));
  const preferAuthor =
    authorNext && (authorNext.overallStatus === 'green' || nextPr?.overallStatus !== 'green');
  const approved = reviewed.filter((entry) => entry.decision === 'approved').length;
  const commented = reviewed.filter((entry) => entry.decision === 'commented').length;
  const skipped = reviewed.filter((entry) => entry.decision === 'skipped').length;
  const reviewedCount = reviewed.length - skipped;

  return (
    <div data-quick-review-summary="" className="space-y-4">
      <div className="text-center">
        <div className="text-lg font-semibold text-[var(--color-text-primary)]">
          Review complete
        </div>
        <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          {reviewedCount} PR{reviewedCount !== 1 ? 's' : ''} reviewed
          {activity?.length ? ' this app session' : ''}
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
        {reviewed.map(({ pr, decision }) => {
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

      {held.length > 0 && (
        <section className="qr-summary__held" aria-label="Left out of this run">
          <span className="qr-summary__next-label">
            Left out of this run · {held.length} PR{held.length === 1 ? '' : 's'}
          </span>
          <ul>
            {held.map(({ pr, fit }) => (
              <li key={prRowKey(pr.pullRequest)}>
                <span className="bd-pr-item__number">#{pr.pullRequest.number}</span>
                <span className="qr-summary__held-title">{pr.pullRequest.title}</span>
                <span className="qr-summary__held-why" data-reason={fit.reason}>
                  {fit.why}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {authorNext && (
        <section className="qr-summary__next" aria-label="Next from the same author">
          <span className="qr-summary__next-label">
            Next from {authorNext.pullRequest.authorLogin} · {checksLabel(authorNext)}
          </span>
          <span className="qr-summary__next-title">{authorNext.pullRequest.title}</span>
          <span className="qr-summary__next-meta">
            {authorNext.pullRequest.repoOwner}/{authorNext.pullRequest.repoName} #
            {authorNext.pullRequest.number}
          </span>
        </section>
      )}
      {nextPr && (
        <section className="qr-summary__next" aria-label="Next review">
          <span className="qr-summary__next-label">
            Next from {nextPr.pullRequest.authorLogin} · {checksLabel(nextPr)}
          </span>
          <span className="qr-summary__next-title">{nextPr.pullRequest.title}</span>
          <span className="qr-summary__next-meta">
            {nextPr.pullRequest.repoOwner}/{nextPr.pullRequest.repoName} #
            {nextPr.pullRequest.number}
          </span>
        </section>
      )}
      <div className="qr-summary__actions">
        {authorNext && (
          <Button
            variant={preferAuthor ? 'primary' : 'secondary'}
            size="md"
            aria-keyshortcuts={preferAuthor ? 'Enter' : undefined}
            onClick={onAuthorNext}
          >
            Next from {authorNext.pullRequest.authorLogin}
          </Button>
        )}
        {nextPr && (
          <Button
            variant={preferAuthor ? 'secondary' : 'primary'}
            size="md"
            aria-keyshortcuts={preferAuthor ? undefined : 'Enter'}
            onClick={onNext}
          >
            {authorNext ? `Review next from ${nextPr.pullRequest.authorLogin}` : 'Review next PR'}
          </Button>
        )}
        <Button
          variant={nextPr || authorNext ? 'secondary' : 'primary'}
          size="md"
          onClick={onClose}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
