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
      <span
        className="inline-flex items-center rounded-full bg-[var(--color-accent-subtle)] px-2 py-0.5 text-[10px] font-mono font-medium text-[var(--color-accent)] cursor-default"
        title={
          workItem
            ? `${compactTitle ?? 'Untitled'} (${compactState ?? 'Unknown'})`
            : `Work Item #${workItemId}`
        }
      >
        AB#{workItemId}
      </span>
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
    <div className="flex items-center gap-2 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-3 py-2">
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
  );
}
