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
  const assignedTo = workItem?.fields['System.AssignedTo'] as
    | { displayName?: string }
    | string
    | undefined;
  const assignedName = typeof assignedTo === 'object' ? assignedTo?.displayName : assignedTo;

  return (
    <Card padding="sm" variant="default" data-linked-work-item={workItemId}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-medium text-[var(--color-accent)]">
          AB#{workItemId}
        </span>
        {workItem ? (
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[var(--color-text-primary)] truncate">
              {title ?? 'Untitled'}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-tertiary)]">
              {state && <span>{state}</span>}
              {assignedName && <span>assigned to {assignedName}</span>}
            </div>
          </div>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">Loading...</span>
        )}
      </div>
    </Card>
  );
}
