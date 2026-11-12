import { useCallback } from 'react';
import { BackButton } from '@/components/layout/BackButton';
import { useWorkItemDetailData } from '@/hooks/useWorkItemDetailData';
import { popView } from '@/services/navigation';
import { WorkItemDetailPanel } from './WorkItemDetailPanel';

export interface WorkItemDetailViewProps {
  id: number;
}

/**
 * WorkItemDetailView — the full-screen work item view inside the main
 * window (plans/ui-overhaul-workbench.md, phase 5), rendered by `ViewStack`
 * for a `work-item-detail` view, the way `PrDetailView` hosts a pull request.
 *
 * The data comes from `useWorkItemDetailData`: an item from the list's query
 * shows at once; any other loads behind a header that already has Back and
 * the id. The body is `WorkItemDetailPanel` in embedded mode: the header with
 * every fact once and "Now", the form's pages, Activity, Links, Attachments
 * and Notes with the sliding underline, and the ADO layout's groups in the
 * rail. Deleting the item returns to the list.
 */
export function WorkItemDetailView({ id }: WorkItemDetailViewProps) {
  const data = useWorkItemDetailData(id);
  const { detailData, remove } = data;

  const handleDelete = useCallback(async () => {
    if (await remove()) void popView();
  }, [remove]);

  return (
    <article className="bd-detail bd-wi-detail-view" aria-label={`Work item AB#${id}`}>
      {detailData ? (
        <WorkItemDetailPanel embedded data={data} onDelete={() => void handleDelete()} />
      ) : (
        <>
          <header className="bd-detail__head">
            <div className="bd-detail__bar">
              <BackButton />
              <span className="bd-detail__crumb">Work item</span>
            </div>
            <div className="bd-detail__titlerow">
              <h1 className="bd-detail__title">AB#{id}</h1>
            </div>
          </header>
          <div className="bd-detail__state" role="status">
            {data.error ? (
              <p>{data.error}</p>
            ) : (
              <span className="bd-detail__spinner" aria-label="Loading work item" />
            )}
          </div>
        </>
      )}
    </article>
  );
}
