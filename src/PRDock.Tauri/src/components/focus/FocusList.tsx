import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useUiStore } from '@/stores/ui-store';
import { PullRequestCard } from '@/components/pr/PullRequestCard';
import { FocusEmptyState } from './FocusEmptyState';

export function FocusList() {
  const focusPrs = usePrStore((s) => s.focusPrs)();
  const priorityScores = usePrStore((s) => s.priorityScores)();
  const needsMyReview = usePrStore((s) => s.needsMyReview)();
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);
  const startSession = useQuickReviewStore((s) => s.startSession);

  if (focusPrs.length === 0) {
    return <FocusEmptyState />;
  }

  return (
    <div className="flex flex-col gap-1.5 p-2">
      {needsMyReview.length > 0 && (
        <button
          onClick={() => startSession(needsMyReview)}
          className="mb-1 w-full rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-3 py-2 text-xs font-medium text-[var(--color-accent)] hover:opacity-80 transition-opacity"
        >
          Start Quick Review ({needsMyReview.length} PR{needsMyReview.length !== 1 ? 's' : ''})
        </button>
      )}
      {focusPrs.map((pr) => {
        const score = priorityScores.get(pr.pullRequest.number);
        return (
          <div
            key={pr.pullRequest.number}
            className="animate-[fadeSlideIn_0.2s_ease-out]"
          >
            <PullRequestCard
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
