import { useEffect } from 'react';
import { FeatureBadge, FirstRunOverlay, InlineHint } from '@/components/onboarding';
import { PrCardContainer } from '@/components/pr/PrCardContainer';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useUiStore } from '@/stores/ui-store';
import { FocusEmptyState } from './FocusEmptyState';

export function FocusList() {
  const focusPrs = usePrStore((s) => s.focusPrs)();
  const priorityScores = usePrStore((s) => s.priorityScores)();
  const needsMyReview = usePrStore((s) => s.needsMyReview)();
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);
  const selectPr = useUiStore((s) => s.selectPr);
  const startSession = useQuickReviewStore((s) => s.startSession);
  const hasSeenFocusOverlay = useOnboardingStore((s) => s.hasSeenFocusOverlay);
  const markFocusOverlaySeen = useOnboardingStore((s) => s.markFocusOverlaySeen);
  const dismissBadge = useOnboardingStore((s) => s.dismissBadge);

  // Auto-dismiss Focus badge when tab is viewed
  useEffect(() => {
    dismissBadge('focus-mode');
  }, [dismissBadge]);

  if (focusPrs.length === 0) {
    return <FocusEmptyState />;
  }

  return (
    <div className="flex flex-col gap-1.5 p-2">
      {!hasSeenFocusOverlay && focusPrs.length > 0 && (
        <FirstRunOverlay
          message="These are the PRs that need your attention"
          ctaLabel="Open first PR"
          onCtaClick={() => selectPr(focusPrs[0]!.pullRequest.number)}
          onDismiss={markFocusOverlaySeen}
        />
      )}
      <InlineHint
        hintId="focus-priority-ranking"
        text="PRs are ranked by priority — most urgent first"
      />
      {needsMyReview.length > 0 && (
        <button
          onClick={() => {
            dismissBadge('review-mode');
            startSession(needsMyReview);
          }}
          className="mb-1 w-full rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-3 py-2 text-xs font-medium text-[var(--color-accent)] hover:opacity-80 transition-opacity"
        >
          Start Quick Review ({needsMyReview.length} PR{needsMyReview.length !== 1 ? 's' : ''})
          <FeatureBadge badgeId="review-mode" />
        </button>
      )}
      {focusPrs.map((pr) => {
        const score = priorityScores.get(pr.pullRequest.number);
        return (
          <div
            key={pr.pullRequest.number}
            data-focus-item=""
            className="animate-[fadeSlideIn_0.2s_ease-out]"
          >
            <PrCardContainer
              prWithChecks={pr}
              isFocused={selectedPrNumber === pr.pullRequest.number}
              focusMode
              priorityFactors={score?.factors}
            />
          </div>
        );
      })}
    </div>
  );
}
