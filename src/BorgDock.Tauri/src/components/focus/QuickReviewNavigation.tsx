import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import {
  isGeneratedPath,
  type ReviewDocument,
  type ReviewFileGroup,
} from '@/services/quick-review';

interface Props {
  document: ReviewDocument;
  groups: ReviewFileGroup[];
  currentPath: string | null;
  onNavigate: (path: string) => void;
}

/**
 * The file walk's tree (the iteration 2 mockup's `.qr-tree`): files grouped
 * by folder (tests, docs and generated files in their own groups, tests
 * last), a checkbox per file that draws its checkmark once the file is
 * marked reviewed, the current file highlighted. Clicking a file opens it.
 */
export function QuickReviewNavigation({ document: doc, groups, currentPath, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const reviewed = new Set(doc.reviewed);
  const commented = new Set(doc.comments.map((c) => c.path));
  const currentRef = useRef<HTMLButtonElement>(null);

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
      <div className="qr-file-groups">
        {groups.map((group) => (
          <div key={group.name} className="qr-fold" role="group" aria-label={group.name}>
            <div className="qr-fold__head">
              <span>{group.name}</span>
              <span>{group.files.length}</span>
            </div>
            {group.files.map((file) => {
              const done = reviewed.has(file.filename);
              const current = currentPath === file.filename;
              return (
                <button
                  key={file.filename}
                  ref={current ? currentRef : undefined}
                  type="button"
                  className="qr-file"
                  data-done={done ? 'true' : undefined}
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
                    aria-label={done ? 'Reviewed' : 'Not reviewed'}
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
                    <em>+{file.additions}</em> <i>−{file.deletions}</i>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
