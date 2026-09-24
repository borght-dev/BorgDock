import { BackButton } from '@/components/layout/BackButton';
import type { PrDetailTab } from '@/stores/ui-store';

export interface PrDetailViewProps {
  owner: string;
  repo: string;
  number: number;
  initialTab?: PrDetailTab;
}

/**
 * PrDetailView — the full-screen pull request view inside the main window.
 * Placeholder until plan phase 3 hosts the detail panel here: it shows which
 * pull request was opened and a Back button.
 */
export function PrDetailView({ owner, repo, number }: PrDetailViewProps) {
  return (
    <article className="bd-detail-view" aria-label={`Pull request #${number}`}>
      <header className="bd-detail-view__head">
        <BackButton />
        <span className="bd-detail-view__crumb">
          {owner}/{repo}
        </span>
      </header>
      <div className="bd-detail-view__body">
        <h1 className="bd-detail-view__title">#{number}</h1>
        <p className="bd-detail-view__note">
          The pull request detail view arrives in a later update.
        </p>
      </div>
    </article>
  );
}
