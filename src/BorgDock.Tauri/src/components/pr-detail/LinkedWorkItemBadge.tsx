import { Card, Pill } from '@/components/shared/primitives';
import { WorkItemRef } from '@/components/work-items/WorkItemRef';
import type { WorkItem } from '@/types';

interface LinkedWorkItemBadgeProps {
  workItemId: number;

  workItem?: WorkItem;

  compact?: boolean;
}

function workItemBadgeText(workItemId: number, workItem?: WorkItem) {
  const title = String(workItem?.fields['System.Title'] ?? 'Untitled');

  const state = String(workItem?.fields['System.State'] ?? '');
  const type = String(workItem?.fields['System.WorkItemType'] ?? '');
  const priority = Number(workItem?.fields['Microsoft.VSTS.Common.Priority']) || undefined;
  const metadata = [state, type, priority ? `P${priority}` : ''].filter(Boolean).join(' · ');
  return {
    title,
    metadata,
    compactTitle: workItem ? `${title} (${state || 'Unknown'})` : `Work Item #${workItemId}`,
  };
}

/** A work item a PR links, as a card or a compact pill, with the work item hover card. */
export function LinkedWorkItemBadge({ workItemId, workItem, compact }: LinkedWorkItemBadgeProps) {
  const { title, metadata, compactTitle } = workItemBadgeText(workItemId, workItem);

  const content = compact ? (
    <Pill tone="neutral" data-linked-work-item={workItemId} title={compactTitle}>
      AB#{workItemId}
    </Pill>
  ) : (
    <Card padding="sm" variant="default" data-linked-work-item={workItemId}>
      <div className="flex items-center gap-3">
        <Pill tone="ghost" className="font-mono text-[var(--color-accent)]">
          AB#{workItemId}
        </Pill>
        <span className="flex-1 min-w-0 truncate text-[13px]">
          {workItem ? title : 'Loading...'}
        </span>
        {metadata && (
          <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{metadata}</span>
        )}
      </div>
    </Card>
  );

  return (
    <WorkItemRef
      id={workItemId}
      item={workItem}
      href={workItem?.htmlUrl}
      className="bd-linked-item-button"
      triggerStyle={compact ? undefined : { display: 'block' }}
      aria-label={`Read AB#${workItemId}: ${title}`}
    >
      {content}
    </WorkItemRef>
  );
}
