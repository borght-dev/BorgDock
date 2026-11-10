import { BookOpenText, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, IconButton, Seg2 } from '@/components/shared/primitives';
import type { ReviewGuide } from '@/services/review-guide';
import type { ReviewGuideEntry } from '@/stores/review-guide-store';

/** How the walk orders its files: the guide's chapters, by folder, or commit by commit. */
export type ReadingOrder = 'guide' | 'folders' | 'commits';

const ICON = { size: 14, strokeWidth: 2.25, 'aria-hidden': true } as const;

function agentName(provider: string): string {
  return provider === 'codex' ? 'Codex' : 'Claude';
}

function byline(guide: ReviewGuide): string {
  const model = guide.model && guide.model !== 'default' ? ` · ${guide.model}` : '';
  return `${agentName(guide.provider)}${model}`;
}

/**
 * The top of the walk's tree: Guide, Folders or Commits, and under Guide
 * what the agent is doing. Until there is a guide (being written, failed, or
 * not asked for) the tree shows folders, so the reviewer can start at once.
 */
export function ReadingOrderSwitch({
  order,
  onChange,
  guide,
  onWrite,
}: {
  order: ReadingOrder;
  onChange: (order: ReadingOrder) => void;
  guide: ReviewGuideEntry | null;
  /** Writes the guide now: the first one, a retry, or a new one. */
  onWrite: () => void;
}) {
  return (
    <div className="qr-order">
      <Seg2
        size="sm"
        full
        ariaLabel="Reading order"
        value={order}
        onChange={onChange}
        options={[
          { value: 'guide', label: 'Guide' },
          { value: 'folders', label: 'Folders' },
          { value: 'commits', label: 'Commits' },
        ]}
      />
      {order === 'guide' && guide && (
        <p className="qr-order__status" role="status" data-tone={guide.status}>
          {guide.status === 'idle' ? (
            <>
              <BookOpenText {...ICON} />
              <span>No guide yet. Folders until you ask for one.</span>
              <Button variant="ghost" size="sm" onClick={onWrite}>
                Write guide
              </Button>
            </>
          ) : guide.status === 'skipped' ? (
            <>
              <BookOpenText {...ICON} />
              <span>{guide.reason}.</span>
              <Button variant="ghost" size="sm" onClick={onWrite}>
                Write guide
              </Button>
            </>
          ) : guide.status === 'loading' ? (
            <>
              <LoaderCircle {...ICON} className="qr-spin" />
              {agentName(guide.provider)} is writing the guide. Folders until then.
            </>
          ) : guide.status === 'error' ? (
            <>
              <TriangleAlert {...ICON} />
              <span className="qr-order__error" title={guide.error}>
                No guide: {guide.error}
              </span>
              <Button variant="ghost" size="sm" onClick={onWrite}>
                Retry
              </Button>
            </>
          ) : (
            <>
              <BookOpenText {...ICON} />
              <span>
                {guide.guide.chapters.length} chapters by {byline(guide.guide)}
              </span>
              <IconButton
                icon={<RefreshCw size={12} strokeWidth={2.25} aria-hidden="true" />}
                tooltip="Write the guide again"
                aria-label="Write the guide again"
                size={22}
                onClick={onWrite}
              />
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Above the diff in Guide order: which chapter the file is in and why, what
 * the file adds to it, and what to check.
 */
export function ChapterStrip({
  number,
  total,
  title,
  intent,
  check,
  why,
}: {
  number: number;
  total: number;
  title: string;
  intent: string;
  check: string;
  why: string;
}) {
  return (
    <div className="qr-chapter" data-quick-review-chapter="">
      <BookOpenText {...ICON} />
      <div className="qr-chapter__text">
        <p>
          <span className="qr-chapter__num">
            Chapter {number} of {total}
          </span>{' '}
          <b>{title}</b>
          {intent && <> · {intent}</>}
        </p>
        {(why || check) && (
          <p className="qr-chapter__more">
            {why && (
              <span>
                <em>This file</em> {why}
              </span>
            )}
            {check && (
              <span>
                <em>Check</em> {check}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The card's account of the PR before the walk: what it does, the risks to
 * look for, and the chapters to read it in. A chapter opens the walk at its
 * first file.
 */
export function QuickReviewGuideSection({
  entry,
  onOpenFile,
  onWrite,
}: {
  entry: ReviewGuideEntry | null;
  onOpenFile?: (path: string) => void;
  /** Writes the guide now: the first one or a retry. */
  onWrite: () => void;
}) {
  if (!entry) return null;
  return (
    <section className="qr-overview-section qr-guide" aria-label="Review guide">
      <h3>
        Review guide
        {entry.status === 'ready' && <small>Written by {byline(entry.guide)}</small>}
      </h3>
      {entry.status === 'idle' ? (
        <p className="qr-guide__pending">
          <span>
            {agentName(entry.provider)} can read the diff and order the files into chapters.
          </span>
          <Button variant="secondary" size="sm" onClick={onWrite}>
            Write guide
          </Button>
        </p>
      ) : entry.status === 'skipped' ? (
        <p className="qr-guide__pending">
          <span>{entry.reason}. It reads faster than a guide is written.</span>
          <Button variant="secondary" size="sm" onClick={onWrite}>
            Write guide
          </Button>
        </p>
      ) : entry.status === 'loading' ? (
        <p className="qr-guide__pending" role="status">
          <LoaderCircle {...ICON} className="qr-spin" />
          {agentName(entry.provider)} is reading the diff. The walk follows its chapters once it is
          done.
        </p>
      ) : entry.status === 'error' ? (
        <p className="qr-warning" data-tone="error">
          No guide: {entry.error}
          <Button variant="secondary" size="sm" onClick={onWrite}>
            Try again
          </Button>
        </p>
      ) : (
        <>
          {entry.guide.summary && <p className="qr-guide__summary">{entry.guide.summary}</p>}
          {entry.guide.focus.length > 0 && (
            <ul className="qr-guide__focus" aria-label="Watch out for">
              {entry.guide.focus.map((risk) => (
                <li key={risk}>
                  <TriangleAlert {...ICON} />
                  {risk}
                </li>
              ))}
            </ul>
          )}
          <ol className="qr-guide__chapters">
            {entry.guide.chapters.map((chapter, i) => (
              <li key={chapter.title}>
                <button
                  type="button"
                  disabled={!onOpenFile}
                  onClick={() => {
                    const first = chapter.files[0];
                    if (first) onOpenFile?.(first.path);
                  }}
                >
                  <span className="qr-guide__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="qr-guide__chapter">
                    <b>{chapter.title}</b>
                    {chapter.intent && <span>{chapter.intent}</span>}
                  </span>
                  <span className="qr-guide__count">
                    {chapter.files.length} {chapter.files.length === 1 ? 'file' : 'files'}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
