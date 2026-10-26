import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity, PullRequestWithChecks } from '@/types';
import { PrRow } from './PrRow';
import { prRowKey } from './pr-card-data';

export const VIRTUALIZE_THRESHOLD = 50;

export function VirtualizedPrRows({
  prs,
  density,
  now,
}: {
  prs: PullRequestWithChecks[];
  density: PrDensity;
  now: number;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const selected = useUiStore((s) => s.selectedPrKey);
  const virtualizer = useVirtualizer({
    count: prs.length,
    getScrollElement: () => parent.current,
    estimateSize: () => (density === 'compact' ? 32 : 42),
    getItemKey: (index) => prRowKey(prs[index]!.pullRequest),
    initialRect: { width: 1000, height: 400 },
    overscan: 10,
  });
  useEffect(() => {
    const index = prs.findIndex((pr) => prRowKey(pr.pullRequest) === selected);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [prs, selected, virtualizer]);
  return (
    <div
      ref={parent}
      className="bd-wb-virtual"
      data-virtual-prs={prs.length}
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
            <PrRow prWithChecks={prs[item.index]!} density={density} now={now} animateKey={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
