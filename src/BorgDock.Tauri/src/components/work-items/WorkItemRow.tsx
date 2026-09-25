import clsx from 'clsx';
import { Star } from 'lucide-react';
import { type CSSProperties, memo } from 'react';
import { showWorkItem } from '@/services/navigation';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity } from '@/types';
import {
  workItemStateLine,
  workItemTitleTransitionName,
} from './WorkItemDetailPanel/WorkItemDetailHeader';
import { WorkItemTypePill } from './WorkItemTypePill';
import { toggleTrackedWorkItem, toggleWorkingOnWorkItem } from './work-item-toggles';

export type WorkItemType = 'Bug' | 'User Story' | 'Task' | 'Feature' | string;

export interface WorkItemRowData {
  id: number;
  type: WorkItemType;
  title: string;
  state: string;
  priority?: number;
  isWorking: boolean;
  isTracked: boolean;
}

/** `flip()` key of a work item row. */
export function workItemRowKey(id: number): string {
  return `wi-${id}`;
}

export interface WorkItemRowProps {
  item: WorkItemRowData;
  selected: boolean;
  /** `comfortable` (42 px, title over the state line) or `compact` (32 px, one line). */
  density?: PrDensity;
  /** Opens the item. Default: select it and push the full-screen detail view. */
  onOpen?: (id: number) => void;
  /** Default: flip the id in the store and save it with the settings. */
  onToggleTracked?: (id: number) => void;
  onToggleWorking?: (id: number) => void;
}

function openInView(id: number) {
  void showWorkItem(id);
}

/**
 * WorkItemRow — a work item row (plans/ui-overhaul-workbench.md, phase 5)
 * in the pull request row's shape: same heights, hover wash and selection bar
 * (`.bd-wb-row`). Type pill (Bug red, Task amber, the rest neutral), `AB#id`,
 * the title and "Active, P2".
 *
 * - Click, Enter or Space selects the row and pushes the detail view. There
 *   is no pop-out from the main window, so Ctrl+click opens in place too and
 *   middle-click does nothing.
 * - The ★ track and ● working toggles sit beside the row (a button may not
 *   sit inside its `role="button"`), drawn over its right end: quiet until
 *   hover, focus or selection, always shown while on.
 * - `data-key="wi-<id>"` (on the wrapper) lets `flip()` follow the row; the
 *   selected row's title carries `wi-title-<id>` and morphs into the header.
 */
export const WorkItemRow = memo(function WorkItemRow({
  item,
  selected,
  density = 'comfortable',
  onOpen = openInView,
  onToggleTracked = toggleTrackedWorkItem,
  onToggleWorking = toggleWorkingOnWorkItem,
}: WorkItemRowProps) {
  const { id } = item;
  const open = () => {
    useUiStore.getState().setWorkItemsSelectedId(id);
    onOpen(id);
  };
  const vtStyle = { '--bd-vt-title': workItemTitleTransitionName(id) } as CSSProperties;
  const stateLine = workItemStateLine(item.state, item.priority);

  return (
    <div
      className="bd-wb-rowwrap bd-wi-wb-rowwrap"
      data-key={workItemRowKey(id)}
      data-selected={selected ? 'true' : undefined}
    >
      <div
        className={clsx('bd-wb-row', `bd-wb-row--${density}`, 'bd-wi-wb-row')}
        data-wi-id={id}
        data-density={density}
        data-selected={selected ? 'true' : undefined}
        data-tracked={item.isTracked ? 'true' : undefined}
        data-working={item.isWorking ? 'true' : undefined}
        style={vtStyle}
        role="button"
        tabIndex={0}
        aria-label={`${item.title}, AB#${id}`}
        aria-current={selected ? 'true' : undefined}
        onClick={open}
        onMouseDown={(e) => {
          // No autoscroll cursor on middle-click.
          if (e.button === 1) e.preventDefault();
        }}
        onKeyDown={(e) => {
          if (e.defaultPrevented || e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        <WorkItemTypePill type={item.type} />
        <span className="bd-wi-wb-row__id">AB#{id}</span>
        <span className="bd-wb-row__text">
          <span className="bd-wb-row__title" title={item.title}>
            {item.title}
          </span>
          <span className="bd-wb-row__meta bd-wi-wb-row__state">{stateLine}</span>
        </span>
      </div>
      <span className="bd-wi-wb-toggles">
        <button
          type="button"
          className="bd-wi-wb-toggle"
          data-wi-toggle="track"
          data-on={item.isTracked ? 'true' : undefined}
          aria-pressed={item.isTracked}
          aria-label={item.isTracked ? `Untrack AB#${id}` : `Track AB#${id}`}
          title={item.isTracked ? 'Untrack' : 'Track'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleTracked(id);
          }}
        >
          <Star
            size={13}
            strokeWidth={2.1}
            fill={item.isTracked ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          className="bd-wi-wb-toggle"
          data-wi-toggle="working"
          data-on={item.isWorking ? 'true' : undefined}
          aria-pressed={item.isWorking}
          aria-label={item.isWorking ? `Stop working on AB#${id}` : `Start working on AB#${id}`}
          title={item.isWorking ? 'Stop working on' : 'Start working on'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWorking(id);
          }}
        >
          <span className="bd-wi-wb-toggle__dot" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
});
