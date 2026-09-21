import type { ReactNode } from 'react';
import { ReviewDecisionPicker } from '@/components/pr-detail/ReviewComposer';
import { Button } from '@/components/shared/primitives';
import type { ReviewDocument } from '@/services/quick-review';

interface Props {
  document: ReviewDocument;
  filePaths: string[];
  comments: ReactNode;
  submitIssue: string | null;
  update: (updater: (doc: ReviewDocument) => ReviewDocument) => void;
}
export function QuickReviewFinish({
  document: doc,
  filePaths,
  comments,
  submitIssue,
  update,
}: Props) {
  const reviewed = new Set(doc.reviewed);
  const unreviewed = filePaths.filter((path) => !reviewed.has(path));
  return (
    <div className="qr-description">
      <h3>Finish review</h3>
      <div className="qr-finish-progress">
        <p>
          {unreviewed.length} of {filePaths.length} files remain unreviewed.
        </p>
        {unreviewed.length > 0 && (
          <Button
            variant="secondary"
            size="md"
            onClick={() =>
              update((d) => ({ ...d, reviewed: [...new Set([...d.reviewed, ...filePaths])] }))
            }
          >
            Mark all files reviewed
          </Button>
        )}
      </div>
      {doc.comments.length === 0 ? <p className="qr-muted">No inline comments.</p> : comments}
      <ReviewDecisionPicker
        decision={
          doc.event === 'APPROVE'
            ? 'approve'
            : doc.event === 'REQUEST_CHANGES'
              ? 'request'
              : 'comment'
        }
        onChange={(value) =>
          update((d) => ({
            ...d,
            event:
              value === 'approve' ? 'APPROVE' : value === 'request' ? 'REQUEST_CHANGES' : 'COMMENT',
          }))
        }
      />
      <label>
        Overall comment{doc.event === 'REQUEST_CHANGES' ? ' (required)' : ''}
        <textarea
          value={doc.body}
          onChange={(e) => update((d) => ({ ...d, body: e.target.value }))}
          placeholder="Add overall feedback..."
        />
      </label>
      {submitIssue && (
        <p className="qr-warning" id="quick-review-submit-issue" role="status">
          {submitIssue}
        </p>
      )}
      <p className="qr-muted">Your drafts will be posted together as one GitHub review.</p>
    </div>
  );
}
