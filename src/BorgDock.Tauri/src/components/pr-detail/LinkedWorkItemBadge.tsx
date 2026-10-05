import { useState } from 'react';
import { Markdown } from '@/components/shared/Markdown';
import { Card, Pill } from '@/components/shared/primitives';
import { HoverPopover } from '@/components/shared/primitives/HoverPopover';
import type { WorkItem } from '@/types';
import { WorkItemPreview } from './WorkItemPreview';

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
  const description = String(
    workItem?.fields['System.Description'] ??
      workItem?.fields['Microsoft.VSTS.TCM.ReproSteps'] ??
      '',
  );
  return {
    title,
    state,
    type,
    metadata,
    description,
    compactTitle: workItem ? `${title} (${state || 'Unknown'})` : `Work Item #${workItemId}`,
  };
}

export function LinkedWorkItemBadge({ workItemId, workItem, compact }: LinkedWorkItemBadgeProps) {
  const [open, setOpen] = useState(false);
  const { title, state, type, metadata, description, compactTitle } = workItemBadgeText(
    workItemId,
    workItem,
  );

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
    <>
      <HoverPopover
        disabled={open}
        triggerStyle={compact ? undefined : { display: 'block' }}
        maxWidth={420}
        maxHeight={360}
        content={
          <div className="bd-work-item-peek">
            <b>
              AB#{workItemId} · {state || 'Details'}
            </b>
            <p>{title}</p>
            <p>{type}</p>
            {description && (
              <div className="markdown-body">
                <Markdown>{description}</Markdown>
              </div>
            )}
            <small>Click to read the full item</small>
          </div>
        }
      >
        <button
          type="button"
          className="bd-linked-item-button"
          aria-label={`Read AB#${workItemId}: ${title}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
          }}
        >
          {content}
        </button>
      </HoverPopover>
      {open && (
        <WorkItemPreview
          key={workItemId}
          id={workItemId}
          item={workItem}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
