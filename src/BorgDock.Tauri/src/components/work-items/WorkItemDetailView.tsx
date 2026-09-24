import { BackButton } from '@/components/layout/BackButton';

export interface WorkItemDetailViewProps {
  id: number;
}

/**
 * WorkItemDetailView — the full-screen work item view inside the main
 * window. Placeholder until plan phase 5 hosts the detail panel here: it
 * shows which work item was opened and a Back button.
 */
export function WorkItemDetailView({ id }: WorkItemDetailViewProps) {
  return (
    <article className="bd-detail-view" aria-label={`Work item AB#${id}`}>
      <header className="bd-detail-view__head">
        <BackButton />
        <span className="bd-detail-view__crumb">Work item</span>
      </header>
      <div className="bd-detail-view__body">
        <h1 className="bd-detail-view__title">AB#{id}</h1>
        <p className="bd-detail-view__note">The work item detail view arrives in a later update.</p>
      </div>
    </article>
  );
}
