import { useCallback, useEffect, useRef, useState } from 'react';

interface LogViewerProps {
  log: string;
}

export function LogViewer({ log }: LogViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = log.split('\n');

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [autoScroll]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    setAutoScroll(atBottom);
  }, []);

  const highlightMatch = (line: string): React.ReactNode => {
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
  };

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

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-[var(--color-code-block-bg)] p-2"
      >
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="hover:bg-[var(--color-surface-hover)]">
                <td className="select-none pr-3 text-right align-top font-[var(--font-code)] text-[10px] text-[var(--color-text-muted)] w-8">
                  {i + 1}
                </td>
                <td className="whitespace-pre-wrap break-all font-[var(--font-code)] text-[10px] text-[var(--color-text-secondary)]">
                  {highlightMatch(line)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
