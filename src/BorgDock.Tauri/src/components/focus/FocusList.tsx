import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FeatureBadge, FirstRunOverlay, InlineHint } from '@/components/onboarding';
import { Avatar, Button, Pill, Ring } from '@/components/shared/primitives';
import { formatFocusHeadline, summarizeFocus } from '@/services/focus-summary';
import { prScoreKey } from '@/services/priority-scoring';
import { openPrDetail } from '@/services/windows';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import type { OverallStatus, PullRequestWithChecks } from '@/types';
import { FocusEmptyState } from './FocusEmptyState';
import { PriorityReasonLabel } from './PriorityReasonLabel';

// ── helpers ────────────────────────────────────────────────────────────────

function statusToneFor(status: OverallStatus): string {
  if (status === 'green') return 'passing';
  if (status === 'red') return 'failing';
  if (status === 'yellow') return 'running';
  return 'passing';
}

function statusLabelFor(status: OverallStatus): string {
  if (status === 'green') return 'Passing';
  if (status === 'red') return 'Failing';
  if (status === 'yellow') return 'Running';
  return 'Unknown';
}

function initialsFor(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

// ── component ──────────────────────────────────────────────────────────────

function openPrDetailFor(prw: PullRequestWithChecks): void {
  void openPrDetail({
    owner: prw.pullRequest.repoOwner,
    repo: prw.pullRequest.repoName,
    number: prw.pullRequest.number,
  });
}

export function FocusList() {
  const { pullRequests, username, teams } = usePrStore(
    useShallow((s) => ({
      pullRequests: s.pullRequests,
      username: s.username,
      teams: s.teams,
    })),
  );
  const focusPrs = usePrStore((s) => s.focusPrs)();
  const priorityScores = usePrStore((s) => s.priorityScores)();
  const needsMyReview = usePrStore((s) => s.needsMyReview)();
  const startSession = useQuickReviewStore((s) => s.startSession);
  const hasSeenFocusOverlay = useOnboardingStore((s) => s.hasSeenFocusOverlay);
  const markFocusOverlaySeen = useOnboardingStore((s) => s.markFocusOverlaySeen);
  const dismissBadge = useOnboardingStore((s) => s.dismissBadge);
  const summary = summarizeFocus(pullRequests, priorityScores, username, teams);

  // Auto-dismiss Focus badge when tab is viewed
  useEffect(() => {
    dismissBadge('focus-mode');
  }, [dismissBadge]);

  if (focusPrs.length === 0) {
    return <FocusEmptyState />;
  }

  return (
    <div className="flex flex-col">
      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="bd-focus-hero">
        <span className="bd-focus-hero__icon" aria-hidden>
          {/* Zap / lightning icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
        </span>
        <div className="bd-focus-hero__text">
          <div className="bd-focus-hero__title">{formatFocusHeadline(summary)}</div>
          <div className="bd-focus-hero__sub">
            These need you to act. The remaining {summary.total - summary.shown} stay in Pull
            Requests.
          </div>
          {summary.excluded.length > 0 && (
            <details className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
              <summary className="cursor-pointer">Why not the others?</summary>
              <ul className="mt-1">
                {summary.excluded.map((item) => (
                  <li key={item.reason}>
                    {item.count} {item.reason.toLowerCase()}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            dismissBadge('review-mode');
            startSession(needsMyReview.length > 0 ? needsMyReview : focusPrs);
          }}
        >
          Start Quick Review
        </Button>
      </div>

      {/* ── Onboarding overlays ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 px-2 pt-2">
        {!hasSeenFocusOverlay && focusPrs.length > 0 && (
          <FirstRunOverlay
            message="These are the PRs that need your attention"
            ctaLabel="Open first PR"
            onCtaClick={() => openPrDetailFor(focusPrs[0]!)}
            onDismiss={markFocusOverlaySeen}
          />
        )}
        <InlineHint
          hintId="focus-priority-ranking"
          text="PRs are ranked by priority — most urgent first"
        />
      </div>

      {/* ── Focus rows ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0 px-2 pb-2 pt-1">
        {focusPrs.map((pr, index) => {
          const score = priorityScores.get(prScoreKey(pr.pullRequest));
          const rank = index + 1;
          const scoreValue = score?.total ?? 0;
          const tone = statusToneFor(pr.overallStatus);
          const label = statusLabelFor(pr.overallStatus);
          const initials = initialsFor(pr.pullRequest.authorLogin);

          return (
            <div
              key={prScoreKey(pr.pullRequest)}
              data-focus-item=""
              className="animate-[fadeSlideIn_0.2s_ease-out]"
            >
              <div className="bd-focus-row">
                {/* Rank pill */}
                <div className="bd-focus-row__rank">{rank}</div>

                {/* Ring score */}
                <Ring value={scoreValue} size={38} stroke={3} />

                {/* Main column: reason + title + meta */}
                <div className="bd-focus-row__main">
                  <div className="bd-focus-row__chips">
                    {score && score.factors.length > 0 ? (
                      <PriorityReasonLabel factors={score.factors} />
                    ) : (
                      <Pill tone="neutral">In focus</Pill>
                    )}
                    {score && <span className="bd-mono bd-focus-row__points">+{score.total}</span>}
                  </div>
                  <div className="bd-focus-row__title">{pr.pullRequest.title}</div>
                  <div className="bd-meta bd-focus-row__meta">
                    <Avatar initials={initials} size="sm" />
                    <span className="bd-mono">{pr.pullRequest.repoName}</span>
                    <span className="sep">·</span>
                    <span className="bd-mono">#{pr.pullRequest.number}</span>
                  </div>
                </div>

                {/* Status label */}
                <div className="bd-focus-row__status" data-tone={tone}>
                  {label}
                </div>

                {/* Open button — pops out the PR detail window (the inline
                    detail panel was removed in the main-window rewrite). */}
                <Button variant="secondary" size="sm" onClick={() => openPrDetailFor(pr)}>
                  Open
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature badge (kept for onboarding tracking) */}
      <span className="sr-only">
        <FeatureBadge badgeId="review-mode" />
      </span>
    </div>
  );
}
