import { useVirtualizer } from '@tanstack/react-virtual';
import { type ReactNode, useEffect, useRef } from 'react';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity } from '@/types';

export const VIRTUALIZE_THRESHOLD = 50;

interface VirtualizedRowsProps<T> {
  items: readonly T[];
  /** `owner/repo#number`: the virtualizer's item key and what selection scrolls to. */
  keyOf: (item: T) => string;
  density: PrDensity;
  /** One row; rows a virtualizer recycles must not animate (`animateKey` false). */
  render: (item: T) => ReactNode;
}

/**
 * A long group's rows, virtualized at the Workbench's fixed row height
 * (42 px, 32 px compact) inside a box of its own that scrolls; the
 * selected row is kept in view.
 */
export function VirtualizedRows<T>({ items, keyOf, density, render }: VirtualizedRowsProps<T>) {
  const parent = useRef<HTMLDivElement>(null);
  const selected = useUiStore((s) => s.selectedPrKey);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parent.current,
    estimateSize: () => (density === 'compact' ? 32 : 42),
    getItemKey: (index) => keyOf(items[index]!),
    initialRect: { width: 1000, height: 400 },
    overscan: 10,
  });
  useEffect(() => {
    const index = items.findIndex((item) => keyOf(item) === selected);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [items, keyOf, selected, virtualizer]);
  return (
    <div
      ref={parent}
      className="bd-wb-virtual"
      data-virtual-prs={items.length}
      data-virtual=""
      data-crossfade=""
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            className="bd-wb-virtual__item"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            {render(items[item.index]!)}
          </div>
        ))}
      </div>
    </div>
  );
}
