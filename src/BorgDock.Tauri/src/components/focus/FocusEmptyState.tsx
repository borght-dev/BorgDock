import { Card } from '@/components/shared/primitives';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';

export function FocusEmptyState() {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const priorityScores = usePrStore((s) => s.priorityScores)();
  const setActiveSection = useUiStore((s) => s.setActiveSection);

  // Count PRs with zero score (filtered out)
  const totalPrs = pullRequests.length;
  const scoredPrs = priorityScores.size;
  const filteredOut = totalPrs - scoredPrs;

  // Count pending CI PRs
  const pendingCi = pullRequests.filter((pr) => pr.overallStatus === 'yellow').length;

  return (
    <Card padding="lg" className="flex flex-col items-center justify-center text-center">
      <div className="text-[var(--color-text-ghost)] mb-3">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">
        No PRs need attention
      </p>
      {pendingCi > 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {pendingCi} PR{pendingCi !== 1 ? 's' : ''} waiting for CI
        </p>
      )}
      {filteredOut > 0 && (
        <button
          onClick={() => setActiveSection('prs')}
          className="mt-3 text-xs text-[var(--color-accent)] hover:underline"
        >
          {filteredOut} PR{filteredOut !== 1 ? 's' : ''} filtered out — switch to All view
        </button>
      )}
    </Card>
  );
}
