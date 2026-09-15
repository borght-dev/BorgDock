import { Zap } from 'lucide-react';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FeatureBadge, FirstRunOverlay, InlineHint } from '@/components/onboarding';
import { PrCardContainer } from '@/components/pr/PrCardContainer';
import { PrPanel } from '@/components/pr/PrRow';
import { Button } from '@/components/shared/primitives';
import { formatFocusHeadline, summarizeFocus } from '@/services/focus-summary';
import { prScoreKey } from '@/services/priority-scoring';
import { openPrDetail } from '@/services/windows';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { FocusEmptyState } from './FocusEmptyState';

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
  const density = useSettingsStore((s) => s.settings.ui.prDensity ?? 'comfortable');
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
          <Zap size={18} />
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

      {/* ── Focus rows — ranked, same rows as the PR list ───────────────── */}
      <div className="bd-pr-list">
        <PrPanel density={density} className="mt-2">
          {focusPrs.map((pr) => {
            const score = priorityScores.get(prScoreKey(pr.pullRequest));
            return (
              <PrCardContainer
                key={prScoreKey(pr.pullRequest)}
                prWithChecks={pr}
                density={density}
                showRepo
                focusMode
                priorityFactors={score?.factors}
                badge={
                  score && (
                    <span
                      data-priority-points=""
                      className="font-mono text-[10px] text-[var(--color-text-muted)]"
                    >
                      +{score.total}
                    </span>
                  )
                }
              />
            );
          })}
        </PrPanel>
      </div>

      {/* Feature badge (kept for onboarding tracking) */}
      <span className="sr-only">
        <FeatureBadge badgeId="review-mode" />
      </span>
    </div>
  );
}
