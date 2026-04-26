import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useSyntaxHighlight } from '@/hooks/useSyntaxHighlight';
import { parsePatch } from '@/services/diff-parser';
import type { DiffFile, DiffViewMode } from '@/types';
import { IconButton, Pill, type PillTone } from '@/components/shared/primitives';
import { SplitDiffView } from './SplitDiffView';
import { UnifiedDiffView } from './UnifiedDiffView';

interface DiffFileSectionProps {
  file: DiffFile;
  viewMode: DiffViewMode;
  defaultCollapsed?: boolean;
  onCopyPath: (path: string) => void;
  onOpenInGitHub?: (filename: string) => void;
}

function statusPillTone(status: DiffFile['status']): PillTone {
  if (status === 'added') return 'success';
  if (status === 'removed') return 'error';
  if (status === 'renamed' || status === 'copied') return 'neutral';
  return 'warning'; // modified
}

function statusBadgeLetter(status: DiffFile['status']): string {
  return status === 'added'
    ? 'A'
    : status === 'removed'
      ? 'D'
      : status === 'renamed'
        ? 'R'
        : status === 'copied'
          ? 'C'
          : 'M';
}

export const DiffFileSection = forwardRef<HTMLDivElement, DiffFileSectionProps>(
  function DiffFileSection({ file, viewMode, defaultCollapsed, onCopyPath, onOpenInGitHub }, ref) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
    const sectionRef = useRef<HTMLDivElement | null>(null);

    // Forward our internal ref to the consumer's ref so FilesTab still gets the DOM node.
    useImperativeHandle(ref, () => sectionRef.current as HTMLDivElement, []);

    const hunks = useMemo(() => {
      if (file.hunks && file.hunks.length > 0) return file.hunks;
      if (!file.patch) return [];
      return parsePatch(file.patch);
    }, [file.hunks, file.patch]);

    const syntaxHighlights = useSyntaxHighlight(file.filename, hunks);

    const displayName =
      file.previousFilename && file.status === 'renamed'
        ? `${file.previousFilename} \u2192 ${file.filename}`
        : file.filename;

    const handleNextHunk = useCallback(() => {
      const headers = sectionRef.current?.querySelectorAll('[data-hunk-header]');
      if (!headers || headers.length === 0) return;
      // Find the first hunk-header below the current viewport top (relative to the diff pane).
      const target = Array.from(headers).find((h) => {
        const rect = (h as HTMLElement).getBoundingClientRect();
        return rect.top > 80; // 80px = sticky header height + buffer
      });
      const first = headers[0];
      if (first) (target ?? first).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const handlePrevHunk = useCallback(() => {
      const headers = sectionRef.current?.querySelectorAll('[data-hunk-header]');
      if (!headers || headers.length === 0) return;
      const target = Array.from(headers)
        .reverse()
        .find((h) => {
          const rect = (h as HTMLElement).getBoundingClientRect();
          return rect.bottom < 80;
        });
      const last = headers[headers.length - 1];
      if (last) (target ?? last).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const handleKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'n') {
          e.preventDefault();
          handleNextHunk();
        } else if (e.key === 'p') {
          e.preventDefault();
          handlePrevHunk();
        }
      },
      [handleNextHunk, handlePrevHunk],
    );

    return (
      <div
        ref={sectionRef}
        data-diff-file=""
        data-filename={file.filename}
        className="border-b border-[var(--color-diff-border)]"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {/* Sticky file header */}
        <div
          className="sticky top-0 z-[5] flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-diff-file-header-border)] bg-[var(--color-diff-file-header-bg)] backdrop-blur-[8px]"
        >
          <IconButton
            icon={collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
            tooltip={collapsed ? 'Expand' : 'Collapse'}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            size={22}
            onClick={() => setCollapsed((v) => !v)}
          />

          <Pill tone={statusPillTone(file.status)} data-diff-status>
            {statusBadgeLetter(file.status)}
          </Pill>

          {/* style: var(--font-code) custom property — no Tailwind font-mono maps to this design token */}
          <span
            className="flex-1 min-w-0 truncate text-[11px] font-medium text-[var(--color-text-secondary)]"
            style={{ fontFamily: 'var(--font-code)' }}
            title={file.filename}
          >
            {displayName}
          </span>

          <div className="shrink-0 flex items-center gap-1.5 text-[10px]">
            {file.additions > 0 && (
              <span className="text-[var(--color-status-green)]" data-diff-stat="added">
                +{file.additions}
              </span>
            )}
            {file.deletions > 0 && (
              <span className="text-[var(--color-status-red)]" data-diff-stat="deleted">
                -{file.deletions}
              </span>
            )}
          </div>

          <IconButton
            icon={<ArrowUpIcon />}
            tooltip="Previous hunk (p)"
            aria-label="Previous hunk"
            size={22}
            onClick={handlePrevHunk}
            data-action="prev-hunk"
          />
          <IconButton
            icon={<ArrowDownIcon />}
            tooltip="Next hunk (n)"
            aria-label="Next hunk"
            size={22}
            onClick={handleNextHunk}
            data-action="next-hunk"
          />

          <IconButton
            icon={<CopyIcon />}
            tooltip="Copy file path"
            aria-label="Copy file path"
            size={22}
            onClick={() => onCopyPath(file.filename)}
          />

          {onOpenInGitHub && (
            <IconButton
              icon={<ExternalLinkIcon />}
              tooltip="Open in GitHub"
              aria-label="Open in GitHub"
              size={22}
              onClick={() => onOpenInGitHub(file.filename)}
            />
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

// --- Inline icon glyphs --------------------------------------------------

function ChevronRightIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 12V4" />
      <path d="M4 8l4-4 4 4" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 4v8" />
      <path d="M4 8l4 4 4-4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="8" height="8" rx="1" />
      <path d="M3 11V3h8" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9 2h5v5" />
      <path d="m14 2-7 7" />
      <path d="M4 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
    </svg>
  );
}
