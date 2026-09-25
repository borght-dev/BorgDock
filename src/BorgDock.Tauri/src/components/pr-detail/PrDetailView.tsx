import { BackButton } from '@/components/layout/BackButton';
import { usePrDetailData } from '@/hooks/usePrDetailData';
import type { PrDetailTab } from '@/stores/ui-store';
import { PrDetailPanel } from './PRDetailPanel';

export interface PrDetailViewProps {
  owner: string;
  repo: string;
  number: number;
  initialTab?: PrDetailTab;
}

/**
 * PrDetailView — the full-screen pull request view inside the main window
 * (plans/ui-overhaul-workbench.md, phase 3), rendered by `ViewStack` for a
 * `pr-detail` view.
 *
 * The data comes from `usePrDetailData`: a PR from the list shows at once
 * and follows the polls; any other PR loads from the cache and GitHub
 * behind a header that already has Back and the number. The body is
 * `PrDetailPanel` in embedded mode: the Workbench header (title and avatar
 * morph from the list row), readiness line, action bar and the tabs. The
 * root sets the reading font at 14 px for everything inside.
 */
export function PrDetailView({ owner, repo, number, initialTab }: PrDetailViewProps) {
  const { pr, checks, isLoading, error } = usePrDetailData({ owner, repo, number });

  return (
    <article className="bd-detail" aria-label={`Pull request #${number}`}>
      {pr ? (
        <PrDetailPanel pr={pr} checks={checks} embedded initialTab={initialTab} />
      ) : (
        <>
          <header className="bd-detail__head">
            <div className="bd-detail__bar">
              <BackButton />
              <span className="bd-detail__crumb">
                {owner}/{repo}
              </span>
            </div>
            <div className="bd-detail__titlerow">
              <h1 className="bd-detail__title">#{number}</h1>
            </div>
          </header>
          <div className="bd-detail__state" role="status">
            {error ? (
              <p>{error}</p>
            ) : isLoading ? (
              <span className="bd-detail__spinner" aria-label="Loading pull request" />
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}
