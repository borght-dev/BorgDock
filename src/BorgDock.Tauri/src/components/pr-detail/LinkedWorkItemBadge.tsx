import { Card, Pill } from '@/components/shared/primitives';
import type { WorkItem } from '@/types';


interface LinkedWorkItemBadgeProps {
  workItemId: number;
  workItem?: WorkItem;
  compact?: boolean;
}

export function LinkedWorkItemBadge({ workItemId, workItem, compact }: LinkedWorkItemBadgeProps) {
  if (compact) {
    const compactTitle = workItem?.fields['System.Title'] as string | undefined;
    const compactState = workItem?.fields['System.State'] as string | undefined;
    return (
      <Pill
        tone="neutral"
        data-linked-work-item={workItemId}
        title={
          workItem
            ? `${compactTitle ?? 'Untitled'} (${compactState ?? 'Unknown'})`
            : `Work Item #${workItemId}`
        }
      >
        AB#{workItemId}
      </Pill>
    );
  }

  const title = workItem?.fields['System.Title'] as string | undefined;
  const state = workItem?.fields['System.State'] as string | undefined;
  const workItemType = workItem?.fields['System.WorkItemType'] as string | undefined;
  const priorityRaw = workItem?.fields['Microsoft.VSTS.Common.Priority'];
  const priority = typeof priorityRaw === 'number' ? priorityRaw : Number(priorityRaw) || undefined;

  const meta = [state, workItemType, priority ? `P${priority}` : null].filter(Boolean) as string[];

  return (
    <Card padding="sm" variant="default" data-linked-work-item={workItemId}>
      <div className="flex items-center gap-3">
        <Pill tone="ghost" className="font-mono text-[var(--color-accent)]">
          AB#{workItemId}
        </Pill>
        {workItem ? (
          <>
            <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--color-text-primary)]">
              {title ?? 'Untitled'}
            </span>
            {meta.length > 0 && (
              <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                {meta.join(' · ')}
              </span>
            )}
          </>
        ) : (
          <span className="flex-1 text-xs text-[var(--color-text-muted)]">Loading...</span>
        )}
      </div>
    </Card>
  );
}
