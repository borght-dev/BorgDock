import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface LogViewerProps {
  log: string;
}

const LINE_HEIGHT = 18; // px — matches text-[10px] + padding

export function LogViewer({ log }: LogViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => log.split('\n'), [log]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 30,
  });

  useEffect(() => {
    if (autoScroll && lines.length > 0) {
      virtualizer.scrollToIndex(lines.length - 1, { align: 'end' });
    }
  }, [autoScroll, lines.length, virtualizer]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    setAutoScroll(atBottom);
  }, []);

  const highlightMatch = useCallback(
    (line: string): React.ReactNode => {
      if (!searchQuery) return line;
      const idx = line.toLowerCase().indexOf(searchQuery.toLowerCase());
      if (idx === -1) return line;
      return (
        <>
          {line.slice(0, idx)}
          <mark className="bg-[var(--color-status-yellow)] text-[var(--color-text-primary)] rounded-sm px-0.5">
            {line.slice(idx, idx + searchQuery.length)}
          </mark>
          {line.slice(idx + searchQuery.length)}
        </>
      );
    },
    [searchQuery],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-separator)] px-2 py-1">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search log..."
          className="flex-1 rounded border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2 py-1 text-[10px] font-[var(--font-code)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
        />
        <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="h-3 w-3"
          />
          Auto-scroll
        </label>
      </div>

      {/* Log content — virtualized */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-[var(--color-code-block-bg)] p-2"
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const line = lines[virtualRow.index]!;
            return (
              <div
                key={virtualRow.index}
                className="flex hover:bg-[var(--color-surface-hover)]"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <span className="select-none pr-3 text-right align-top font-[var(--font-code)] text-[10px] text-[var(--color-text-muted)] w-8 shrink-0">
                  {virtualRow.index + 1}
                </span>
                <span className="whitespace-pre-wrap break-all font-[var(--font-code)] text-[10px] text-[var(--color-text-secondary)]">
                  {highlightMatch(line)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
