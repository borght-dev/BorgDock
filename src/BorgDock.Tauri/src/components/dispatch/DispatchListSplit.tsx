import { type ReactNode, useRef } from 'react';
import { useResizableWidth } from '@/hooks/useResizableWidth';

const DIVIDER_WIDTH = 6;
const DETAIL_MIN_WIDTH = 320;

export function DispatchListSplit({
  list,
  detail,
  hidden,
}: {
  list: ReactNode;
  detail: ReactNode;
  hidden: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, resizing, separatorProps } = useResizableWidth(containerRef, {
    storageKey: 'borgdock-dispatch-list-width',
    defaultWidth: 380,
    minWidth: 260,
    maxWidth: 760,
    reserve: DETAIL_MIN_WIDTH + DIVIDER_WIDTH,
    label: 'Thread list width',
  });

  return (
    <div
      ref={containerRef}
      className="bd-dp-split"
      hidden={hidden}
      data-resizing={resizing}
      style={{ gridTemplateColumns: `${width}px ${DIVIDER_WIDTH}px minmax(0, 1fr)` }}
    >
      {list}
      <div className="bd-dp-divider" {...separatorProps} />
      {detail}
    </div>
  );
}
