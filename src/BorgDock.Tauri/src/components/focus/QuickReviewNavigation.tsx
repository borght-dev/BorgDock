import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import {
  isGeneratedPath,
  type ReviewDocument,
  type ReviewFileGroup,
  type ReviewProgress,
} from '@/services/quick-review';

interface Props {
  document: ReviewDocument;
  groups: ReviewFileGroup[];
  currentPath: string | null;
  onNavigate: (path: string) => void;
  /** Progress over the files listed (the changed ones on a re-review). */
  progress: ReviewProgress;
  /** Files changed since the viewer's last review, dotted in the tree. */
  changed?: ReadonlySet<string>;
  /** On a re-review limited to changed files: how many are left out, and since when. */
  unchanged?: { count: number; reviewedAgo: string; onShowAll: () => void };
}

/**
 * The file walk's tree (the iteration 2 mockup's `.qr-tree`): progress over
 * the files listed, then the files grouped by folder (tests, docs and
 * generated files in their own groups, tests last), each folder with how
 * many of its files are done. A checkbox per file draws its checkmark once
 * the file is marked reviewed; the current file is highlighted. Clicking a
 * file opens it.
 */
export function QuickReviewNavigation({
  document: doc,
  groups,
  currentPath,
  onNavigate,
  progress,
  changed,
  unchanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const reviewed = new Set(doc.reviewed);
  const commented = new Set(doc.comments.map((c) => c.path));
  const currentRef = useRef<HTMLButtonElement>(null);
  const percent = progress.total ? (progress.reviewed / progress.total) * 100 : 0;

  // Keep the current file in view as the walk moves through the tree.
  useEffect(() => {
    if (currentPath) currentRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [currentPath]);

  return (
    <nav className={clsx('qr-tree', open && 'qr-files-open')} aria-label="Review path">
      <div className="qr-tree__mobile">
        <Button
          variant="ghost"
          size="sm"
          className="qr-mobile-files"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          Files
        </Button>
      </div>
      <div className="qr-tree__progress" data-quick-review-progress="">
        <div className="qr-tree__counts">
          <span>
            <b>{progress.reviewed}</b> of {progress.total}{' '}
            {unchanged ? 'changed files' : 'reviewed'}
          </span>
          <span>{progress.left ? `${progress.left} left` : 'done'}</span>
        </div>
        <span className="qr-tree__bar" aria-hidden="true">
          <i style={{ width: `${percent}%` }} />
        </span>
      </div>
      <div className="qr-file-groups">
        {groups.map((group) => {
          const done = group.files.filter((f) => reviewed.has(f.filename)).length;
          return (
            <div key={group.name} className="qr-fold" role="group" aria-label={group.name}>
              <div className="qr-fold__head">
                <span className="qr-fold__name" title={group.name}>
                  {group.name}
                </span>
                <span
                  className="qr-fold__count"
                  data-done={done === group.files.length || undefined}
                  title={`${done} of ${group.files.length} reviewed`}
                >
                  {done}/{group.files.length}
                </span>
              </div>
              {group.files.map((file) => {
                const isDone = reviewed.has(file.filename);
                const current = currentPath === file.filename;
                return (
                  <button
                    key={file.filename}
                    ref={current ? currentRef : undefined}
                    type="button"
                    className="qr-file"
                    data-done={isDone ? 'true' : undefined}
                    data-generated={isGeneratedPath(file.filename) ? 'true' : undefined}
                    aria-current={current ? 'step' : undefined}
                    title={file.filename}
                    onClick={() => {
                      setOpen(false);
                      onNavigate(file.filename);
                    }}
                  >
                    <span
                      className="qr-cb"
                      role="img"
                      aria-label={isDone ? 'Reviewed' : 'Not reviewed'}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m5 12 5 5L20 7" />
                      </svg>
                    </span>
                    <span className="qr-path">{file.filename.split('/').pop()}</span>
                    <span className="qr-delta">
                      {commented.has(file.filename) && (
                        <span className="qr-has-draft" role="img" aria-label="Has draft comment">
                          •
                        </span>
                      )}
                      {changed?.has(file.filename) && (
                        <span
                          className="qr-changed"
                          role="img"
                          aria-label="Changed since your review"
                        />
                      )}
                      <em>+{file.additions}</em> <i>−{file.deletions}</i>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {unchanged && unchanged.count > 0 && (
          <button type="button" className="qr-unchanged" onClick={unchanged.onShowAll}>
            <span className="qr-cb" data-done="true" aria-hidden="true">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12 5 5L20 7" />
              </svg>
            </span>
            {unchanged.count} unchanged {unchanged.count === 1 ? 'file' : 'files'}, reviewed{' '}
            {unchanged.reviewedAgo}
          </button>
        )}
      </div>
    </nav>
  );
}
