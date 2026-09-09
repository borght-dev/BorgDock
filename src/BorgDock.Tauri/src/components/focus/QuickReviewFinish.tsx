import type { ReactNode } from 'react';
import { ReviewDecisionPicker } from '@/components/pr-detail/ReviewComposer';
import type { ReviewDocument } from '@/services/quick-review';

interface Props {
  document: ReviewDocument;
  total: number;
  unfinished: boolean;
  comments: ReactNode;
  update: (updater: (doc: ReviewDocument) => ReviewDocument) => void;
}
export function QuickReviewFinish({ document: doc, total, unfinished, comments, update }: Props) {
  return (
    <div className="qr-description">
      <h3>Finish review</h3>
      <p>
        {Math.max(0, total - doc.reviewed.length)} of {total} files remain unreviewed.
      </p>
      {doc.comments.length === 0 ? <p className="qr-muted">No inline comments.</p> : comments}
      {unfinished && (
        <p className="qr-warning">
          Save or delete unfinished drafts and reattach outdated comments before submitting.
        </p>
      )}
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
      <p className="qr-muted">Your drafts will be posted together as one GitHub review.</p>
    </div>
  );
}
