import { useMemo, useState, forwardRef } from 'react';
import type { DiffFile, DiffViewMode } from '@/types';
import { parsePatch } from '@/services/diff-parser';
import { useSyntaxHighlight } from '@/hooks/useSyntaxHighlight';
import { UnifiedDiffView } from './UnifiedDiffView';
import { SplitDiffView } from './SplitDiffView';

interface DiffFileSectionProps {
  file: DiffFile;
  viewMode: DiffViewMode;
  defaultCollapsed?: boolean;
  onCopyPath: (path: string) => void;
  onOpenInGitHub?: (filename: string) => void;
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case 'added':
      return 'var(--color-status-green)';
    case 'removed':
      return 'var(--color-status-red)';
    case 'renamed':
      return 'var(--color-status-yellow)';
    default:
      return 'var(--color-text-muted)';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'added': return 'A';
    case 'removed': return 'D';
    case 'renamed': return 'R';
    case 'copied': return 'C';
    default: return 'M';
  }
}

export const DiffFileSection = forwardRef<HTMLDivElement, DiffFileSectionProps>(
  function DiffFileSection({ file, viewMode, defaultCollapsed, onCopyPath, onOpenInGitHub }, ref) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);

    const hunks = useMemo(() => {
      if (!file.patch) return [];
      return parsePatch(file.patch);
    }, [file.patch]);

    const syntaxHighlights = useSyntaxHighlight(file.filename, hunks);

    const displayName =
      file.previousFilename && file.status === 'renamed'
        ? `${file.previousFilename} \u2192 ${file.filename}`
        : file.filename;

    return (
      <div ref={ref} data-filename={file.filename} className="border-b border-[var(--color-diff-border)]">
        {/* Sticky file header */}
        <div
          className="sticky top-0 z-[5] flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-diff-file-header-border)]"
          style={{ backgroundColor: 'var(--color-diff-file-header-bg)', backdropFilter: 'blur(8px)' }}
        >
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="currentColor"
              style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
            >
              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          <span
            className="shrink-0 text-[9px] font-bold px-1 rounded"
            style={{ color: statusBadgeColor(file.status), backgroundColor: `color-mix(in srgb, ${statusBadgeColor(file.status)} 10%, transparent)` }}
          >
            {statusLabel(file.status)}
          </span>

          <span
            className="flex-1 min-w-0 truncate text-[11px] font-medium text-[var(--color-text-secondary)]"
            style={{ fontFamily: 'var(--font-code)' }}
            title={file.filename}
          >
            {displayName}
          </span>

          <div className="shrink-0 flex items-center gap-1.5 text-[10px]">
            {file.additions > 0 && (
              <span className="text-[var(--color-status-green)]">+{file.additions}</span>
            )}
            {file.deletions > 0 && (
              <span className="text-[var(--color-status-red)]">-{file.deletions}</span>
            )}
          </div>

          <button
            onClick={() => onCopyPath(file.filename)}
            className="shrink-0 p-0.5 rounded text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
            title="Copy file path"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="5" y="5" width="8" height="8" rx="1" />
              <path d="M3 11V3h8" />
            </svg>
          </button>

          {onOpenInGitHub && (
            <button
              onClick={() => onOpenInGitHub(file.filename)}
              className="shrink-0 p-0.5 rounded text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
              title="Open in GitHub"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M9 2h5v5" />
                <path d="m14 2-7 7" />
                <path d="M4 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
              </svg>
            </button>
          )}
        </div>

        {/* Diff content */}
        {!collapsed && (
          <div className="overflow-x-auto">
            {file.isBinary ? (
              <div className="px-4 py-6 text-center text-[11px] text-[var(--color-text-muted)]">
                Binary file not shown
              </div>
            ) : file.isTruncated ? (
              <div className="px-4 py-6 text-center text-[11px] text-[var(--color-text-muted)]">
                Diff too large to display inline
              </div>
            ) : hunks.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-[var(--color-text-muted)]">
                {file.status === 'renamed'
                  ? 'File renamed without changes'
                  : 'No changes to display'}
              </div>
            ) : viewMode === 'unified' ? (
              <UnifiedDiffView hunks={hunks} syntaxHighlights={syntaxHighlights} />
            ) : (
              <SplitDiffView hunks={hunks} syntaxHighlights={syntaxHighlights} />
            )}
          </div>
        )}
      </div>
    );
  },
);
