import clsx from 'clsx';
import { memo } from 'react';
import { WorkItemTypePill } from '@/components/work-items/WorkItemTypePill';
import { type ItemOverview, NEEDS_YOU } from '@/services/dispatch/types';
import type { PrDensity } from '@/types';
import { DISPATCH_ITEM_MIME } from './SlotStrip';
import { whyLine } from './unit-copy';

/** `flip()` key of a Dispatch row. */
export function dispatchRowKey(id: number): string {
  return `dp-${id}`;
}

/** An item an agent can be started on: nothing of its own is running. */
export function canStart(overview: ItemOverview): boolean {
  return !overview.threads.some((thread) => thread.open);
}

function RowAside({ overview }: { overview: ItemOverview }) {
  const thread = overview.threads.find((t) => t.open);
  if (thread) {
    const needsYou = NEEDS_YOU.includes(thread.status);
    return (
      <span
        className="bd-dp-slotchip"
        data-needs-you={needsYou ? 'true' : undefined}
        data-running={thread.status === 'running' ? 'true' : undefined}
        data-offline={thread.available ? undefined : 'true'}
        title={`${thread.slot}, ${thread.hostLabel}`}
      >
        {thread.slot}
      </span>
    );
  }
  const pr = overview.pullRequest;
  if (pr?.state === 'merged') return <span className="bd-wb-chip bd-wb-chip--merged">Merged</span>;
  if (pr?.state === 'open') {
    return (
      <span className={clsx('bd-wb-chip', pr.isDraft && 'bd-wb-chip--draft')}>
        {pr.isDraft ? 'Draft' : `PR ${pr.number}`}
      </span>
    );
  }
  return null;
}

export interface DispatchRowProps {
  overview: ItemOverview;
  selected: boolean;
  /** Epoch ms the relative times are measured from. */
  now: number;
  density?: PrDensity;
  onSelect: (id: number) => void;
  /** Enter, or a double click: open the work item full screen. */
  onOpen: (id: number) => void;
}

/**
 * DispatchRow — one work item in the Dispatch list, in the shape of every
 * Workbench row: type pill, the title over the reason it sits in its group,
 * and at the end the slot its agent runs in or the state of its pull request.
 * A row without a running agent can be dragged onto a free slot.
 */
export const DispatchRow = memo(function DispatchRow({
  overview,
  selected,
  now,
  density = 'comfortable',
  onSelect,
  onOpen,
}: DispatchRowProps) {
  const { item } = overview;
  const draggable = canStart(overview);
  return (
    <div
      className="bd-wb-rowwrap"
      data-key={dispatchRowKey(item.id)}
      data-selected={selected ? 'true' : undefined}
    >
      <div
        className={clsx('bd-wb-row', `bd-wb-row--${density}`, 'bd-dp-row')}
        data-dp-id={item.id}
        data-bay={overview.bay}
        data-selected={selected ? 'true' : undefined}
        role="button"
        tabIndex={0}
        aria-label={`${item.title}, AB#${item.id}`}
        aria-current={selected ? 'true' : undefined}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData(DISPATCH_ITEM_MIME, String(item.id));
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => onSelect(item.id)}
        onDoubleClick={() => onOpen(item.id)}
        onKeyDown={(e) => {
          if (e.defaultPrevented || e.target !== e.currentTarget) return;
          if (e.key === ' ') {
            e.preventDefault();
            onSelect(item.id);
          }
        }}
      >
        <WorkItemTypePill type={item.typeName} />
        <span className="bd-wb-row__text">
          <span className="bd-wb-row__title" title={item.title}>
            {item.title}
          </span>
          <span className="bd-wb-row__meta">
            <em>{item.id}</em> · {whyLine(overview, now)}
          </span>
        </span>
        <RowAside overview={overview} />
      </div>
    </div>
  );
});
