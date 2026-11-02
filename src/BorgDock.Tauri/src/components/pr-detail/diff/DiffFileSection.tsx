import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, ExternalLink } from 'lucide-react';
import {
  Fragment,
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconButton, Pill, type PillTone } from '@/components/shared/primitives';
import { useSyntaxHighlight } from '@/hooks/useSyntaxHighlight';
import { parsePatch } from '@/services/diff-parser';
import type {
  DiffFile,
  DiffHunk,
  DiffLine,
  DiffViewMode,
  HighlightSpan,
  ReviewThread,
} from '@/types';
import { SplitDiffView } from './SplitDiffView';
import { UnifiedDiffView } from './UnifiedDiffView';

/**
 * A hunk drawn as one line (`row`) instead of its lines, or with that line
 * above it once opened (`folded: false`). Keyed by the hunk's index.
 */
export type HunkFolds = ReadonlyMap<number, { folded: boolean; row: ReactNode }>;

type Segment =
  | { kind: 'hunks'; hunks: DiffHunk[]; offset: number; length: number }
  | { kind: 'fold'; index: number };

/**
 * Which hunks have a fold line and which of those are folded, as a string:
 * the host rebuilds `HunkFolds` on every render, and the segments (and the
 * views' inline diffs) must only be rebuilt when this changes.
 */
function foldStateOf(folds: HunkFolds | undefined): string {
  return folds ? [...folds].map(([i, fold]) => `${i}${fold.folded ? 'f' : 'o'}`).join(',') : '';
}

/**
 * The hunks split around their fold lines. `offset` is where a run of hunks
 * starts in the file's flat line list, which the syntax highlights are keyed by.
 */
function segmentsOf(hunks: DiffHunk[], foldState: string): Segment[] {
  if (!foldState) return [{ kind: 'hunks', hunks, offset: 0, length: Number.POSITIVE_INFINITY }];
  const folds = new Map(
    foldState.split(',').map((entry) => [Number(entry.slice(0, -1)), entry.endsWith('f')]),
  );
  const segments: Segment[] = [];
  let offset = 0;
  let run: Extract<Segment, { kind: 'hunks' }> | null = null;
  for (const [index, hunk] of hunks.entries()) {
    const folded = folds.get(index);
    if (folded !== undefined) {
      run = null;
      segments.push({ kind: 'fold', index });
    }
    if (!folded) {
      if (!run) {
        run = { kind: 'hunks', hunks: [], offset, length: 0 };
        segments.push(run);
      }
      run.hunks.push(hunk);
      run.length += hunk.lines.length;
    }
    offset += hunk.lines.length;
  }
  return segments;
}

function shiftHighlights(
  highlights: Map<number, HighlightSpan[]> | null,
  offset: number,
  length: number,
): Map<number, HighlightSpan[]> | null {
  if (!highlights || offset === 0) return highlights;
  const shifted = new Map<number, HighlightSpan[]>();
  for (const [i, spans] of highlights) {
    if (i >= offset && i < offset + length) shifted.set(i - offset, spans);
  }
  return shifted;
}

interface DiffFileSectionProps {
  file: DiffFile;
  viewMode: DiffViewMode;
  defaultCollapsed?: boolean;
  onCopyPath: (path: string) => void;
  onOpenInGitHub?: (filename: string) => void;
  threads?: ReviewThread[];
  /** Forwarded from FilesTab — only set on the active file when a jump target is consumed. */
  highlightLine?: number | null;
  /** Forwarded handlers for thread interactions. */
  onResolve?: (threadId: string) => void;
  onUnresolve?: (threadId: string) => void;
  onReply?: (threadId: string, body: string) => void;
  /** Forwarded from FilesTab for cross-render persistence. */
  openThreadIds?: Set<string>;
  onToggleThread?: (id: string) => void;
  onAddComment?: (line: DiffLine) => void;
  renderLineAttachment?: (line: DiffLine) => ReactNode;
  richContent?: ReactNode;
  /** The sticky header with the path, sizes and hunk buttons, and the N / P hunk keys. Default true; Quick Review draws its own. */
  header?: boolean;
  /** Hunks Quick Review folds to one line (whitespace, imports, moved code). */
  hunkFolds?: HunkFolds;
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
  function DiffFileSection(
    {
      file,
      viewMode,
      defaultCollapsed,
      onCopyPath,
      onOpenInGitHub,
      threads,
      highlightLine,
      onResolve,
      onUnresolve,
      onReply,
      openThreadIds,
      onToggleThread,
      onAddComment,
      renderLineAttachment,
      richContent,
      header = true,
      hunkFolds,
    },
    ref,
  ) {
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
    const foldState = foldStateOf(hunkFolds);
    const segments = useMemo(() => segmentsOf(hunks, foldState), [hunks, foldState]);
    const segmentHighlights = useMemo(
      () =>
        segments.map((segment) =>
          segment.kind === 'hunks'
            ? shiftHighlights(syntaxHighlights, segment.offset, segment.length)
            : null,
        ),
      [segments, syntaxHighlights],
    );

    const threadsByLine = useMemo(() => {
      const map = new Map<number, ReviewThread[]>();
      for (const t of threads ?? []) {
        const list = map.get(t.line) ?? [];
        list.push(t);
        map.set(t.line, list);
      }
      return map;
    }, [threads]);

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
        // Without the header (Quick Review) N and P belong to the host, like the hunk buttons.
        if (
          !header ||
          onAddComment ||
          (e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')
        )
          return;
        if (e.key === 'n') {
          e.preventDefault();
          handleNextHunk();
        } else if (e.key === 'p') {
          e.preventDefault();
          handlePrevHunk();
        }
      },
      [handleNextHunk, handlePrevHunk, onAddComment, header],
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
        {header && (
          <div className="sticky top-0 z-[5] flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-diff-file-header-border)] bg-[var(--color-diff-file-header-bg)] backdrop-blur-[8px]">
            <IconButton
              icon={
                collapsed ? (
                  <ChevronRight size={12} strokeWidth={3} aria-hidden="true" />
                ) : (
                  <ChevronDown size={12} strokeWidth={3} aria-hidden="true" />
                )
              }
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
              icon={<ArrowUp size={12} strokeWidth={2.25} aria-hidden="true" />}
              tooltip="Previous hunk (p)"
              aria-label="Previous hunk"
              size={22}
              onClick={handlePrevHunk}
              data-action="prev-hunk"
            />
            <IconButton
              icon={<ArrowDown size={12} strokeWidth={2.25} aria-hidden="true" />}
              tooltip="Next hunk (n)"
              aria-label="Next hunk"
              size={22}
              onClick={handleNextHunk}
              data-action="next-hunk"
            />

            <IconButton
              icon={<Copy size={12} strokeWidth={2.25} aria-hidden="true" />}
              tooltip="Copy file path"
              aria-label="Copy file path"
              size={22}
              onClick={() => onCopyPath(file.filename)}
            />

            {onOpenInGitHub && (
              <IconButton
                icon={<ExternalLink size={12} strokeWidth={2.25} aria-hidden="true" />}
                tooltip="Open in GitHub"
                aria-label="Open in GitHub"
                size={22}
                onClick={() => onOpenInGitHub(file.filename)}
              />
            )}
          </div>
        )}

        {/* Diff content */}
        {!collapsed && (
          <div className="overflow-x-auto select-text" data-diff-scroll>
            {richContent ??
              (file.isBinary ? (
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
              ) : (
                segments.map((segment, i) => {
                  if (segment.kind === 'fold')
                    return (
                      <Fragment key={`fold-${segment.index}`}>
                        {hunkFolds?.get(segment.index)?.row}
                      </Fragment>
                    );
                  const highlights = segmentHighlights[i] ?? null;
                  return viewMode === 'unified' ? (
                    <UnifiedDiffView
                      key={`hunks-${segment.offset}`}
                      onAddComment={onAddComment}
                      renderLineAttachment={renderLineAttachment}
                      hunks={segment.hunks}
                      syntaxHighlights={highlights}
                      threadsByLine={threadsByLine}
                      openThreadIds={openThreadIds}
                      onToggleThread={onToggleThread}
                      onResolve={onResolve}
                      onUnresolve={onUnresolve}
                      onReply={onReply}
                      highlightLine={highlightLine ?? null}
                    />
                  ) : (
                    <SplitDiffView
                      key={`hunks-${segment.offset}`}
                      hunks={segment.hunks}
                      syntaxHighlights={highlights}
                      threadsByLine={threadsByLine}
                      openThreadIds={openThreadIds}
                      onToggleThread={onToggleThread}
                      onResolve={onResolve}
                      onUnresolve={onUnresolve}
                      onReply={onReply}
                      highlightLine={highlightLine ?? null}
                    />
                  );
                })
              ))}
          </div>
        )}
      </div>
    );
  },
);
