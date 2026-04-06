import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { WorktreeInfo } from '../../types';
import type { WorkItemCardData } from './WorkItemCard';
import { WorkItemCard } from './WorkItemCard';

const VIRTUALIZE_THRESHOLD = 100;

interface WorkItemListProps {
  items: WorkItemCardData[];
  worktrees: WorktreeInfo[];
  isLoading: boolean;
  isEmpty: boolean;
  selectedQueryName?: string;
  onSelect: (id: number) => void;
  onToggleTracked: (id: number) => void;
  onToggleWorkingOn: (id: number) => void;
  onAssignWorktree: (id: number, path: string) => void;
  onOpenInBrowser: (url: string) => void;
}

export function WorkItemList({
  items,
  worktrees,
  isLoading,
  isEmpty,
  selectedQueryName,
  onSelect,
  onToggleTracked,
  onToggleWorkingOn,
  onAssignWorktree,
  onOpenInBrowser,
}: WorkItemListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
          <span className="text-[13px] text-[var(--color-text-muted)]">Loading work items...</span>
        </div>
      </div>
    );
  }

  if (!selectedQueryName) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="text-center">
          <svg
            className="mx-auto mb-3 h-10 w-10 text-[var(--color-text-ghost)]"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          >
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <path d="M5 6h6M5 9h4" />
          </svg>
          <p className="text-[13px] text-[var(--color-text-muted)]">
            Select a saved query to load work items
          </p>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="text-center">
          <svg
            className="mx-auto mb-3 h-10 w-10 text-[var(--color-text-ghost)]"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3M8 10v.5" strokeLinecap="round" />
          </svg>
          <p className="text-[13px] text-[var(--color-text-muted)]">
            No work items match the current filters
          </p>
        </div>
      </div>
    );
  }

  if (items.length > VIRTUALIZE_THRESHOLD) {
    return (
      <VirtualizedList
        items={items}
        worktrees={worktrees}
        onSelect={onSelect}
        onToggleTracked={onToggleTracked}
        onToggleWorkingOn={onToggleWorkingOn}
        onAssignWorktree={onAssignWorktree}
        onOpenInBrowser={onOpenInBrowser}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      <div className="space-y-1.5">
        {items.map((item) => (
          <WorkItemCard
            key={item.id}
            item={item}
            worktrees={worktrees}
            onSelect={onSelect}
            onToggleTracked={onToggleTracked}
            onToggleWorkingOn={onToggleWorkingOn}
            onAssignWorktree={onAssignWorktree}
            onOpenInBrowser={onOpenInBrowser}
          />
        ))}
      </div>
    </div>
  );
}

function VirtualizedList({
  items,
  worktrees,
  onSelect,
  onToggleTracked,
  onToggleWorkingOn,
  onAssignWorktree,
  onOpenInBrowser,
}: Omit<WorkItemListProps, 'isLoading' | 'isEmpty' | 'selectedQueryName'>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto px-2 py-2">
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="pb-1.5">
                <WorkItemCard
                  item={item}
                  worktrees={worktrees}
                  onSelect={onSelect}
                  onToggleTracked={onToggleTracked}
                  onToggleWorkingOn={onToggleWorkingOn}
                  onAssignWorktree={onAssignWorktree}
                  onOpenInBrowser={onOpenInBrowser}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
