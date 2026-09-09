import { useState } from 'react';
import { Button } from '@/components/shared/primitives';
import type { ReviewDocument, ReviewFileGroup } from '@/services/quick-review';

interface Props {
  document: ReviewDocument;
  groups: ReviewFileGroup[];
  currentPath: string | null;
  finishing: boolean;
  showingComments: boolean;
  onComments: () => void;
  onNavigate: (path: string | null) => void;
}
export function QuickReviewNavigation({
  document: doc,
  groups,
  currentPath,
  finishing,
  showingComments,
  onComments,
  onNavigate,
}: Props) {
  const [open, setOpen] = useState(false);
  const reviewed = new Set(doc.reviewed);
  const commented = new Set(doc.comments.map((c) => c.path));
  const total = groups.reduce((sum, g) => sum + g.files.length, 0);
  const go = (path: string | null) => {
    setOpen(false);
    onNavigate(path);
  };
  return (
    <nav className={`qr-sidebar ${open ? 'qr-files-open' : ''}`} aria-label="Review path">
      <div className="qr-row">
        <strong>Review path</strong>
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
      <button
        type="button"
        className="qr-file"
        aria-current={!currentPath && !finishing && !showingComments ? 'step' : undefined}
        onClick={() => go(null)}
      >
        PR description
      </button>
      <button
        type="button"
        className="qr-file"
        aria-current={showingComments ? 'page' : undefined}
        onClick={() => {
          setOpen(false);
          onComments();
        }}
      >
        Comments
      </button>
      <div className="qr-file-groups">
        {groups.map((group) => (
          <details key={group.name} open>
            <summary>
              {group.name} · {group.files.length}
            </summary>
            {group.files.map((file) => (
              <button
                key={file.filename}
                type="button"
                className="qr-file"
                aria-current={
                  currentPath === file.filename && !finishing && !showingComments
                    ? 'step'
                    : undefined
                }
                onClick={() => go(file.filename)}
              >
                <span aria-label={reviewed.has(file.filename) ? 'Reviewed' : 'Not reviewed'}>
                  {reviewed.has(file.filename) ? '✓' : '○'}
                </span>
                <span className="qr-path">
                  {file.filename.split('/').pop()}
                  <small>{file.filename.split('/').slice(0, -1).join('/')}</small>
                </span>
                {commented.has(file.filename) && <span aria-label="Has draft comment">•</span>}
              </button>
            ))}
          </details>
        ))}
      </div>
      <div className="qr-progress">
        {doc.reviewed.length} of {total} files reviewed
        <progress
          aria-label="Files reviewed"
          max={Math.max(total, 1)}
          value={doc.reviewed.length}
        />
        <span className="qr-muted">Tests come last. Next does not mark files reviewed.</span>
      </div>
    </nav>
  );
}
