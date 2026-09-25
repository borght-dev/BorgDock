import type { ReactNode } from 'react';
import { ReviewDecisionPicker } from '@/components/pr-detail/ReviewComposer';
import type { ReviewDocument, ReviewProgress } from '@/services/quick-review';

interface Props {
  document: ReviewDocument;
  progress: ReviewProgress;
  comments: ReactNode;
  submitIssue: string | null;
  update: (updater: (doc: ReviewDocument) => ReviewDocument) => void;
}

/**
 * The review composer on the Quick Review card ("Write review"): the draft
 * comments, the decision (comment, approve, request changes) and the overall
 * comment, posted together as one GitHub review. Approving here waits for the
 * same thing the card's Approve does: every non-generated file reviewed.
 */
export function QuickReviewFinish({
  document: doc,
  progress,
  comments,
  submitIssue,
  update,
}: Props) {
  return (
    <div className="qr-compose">
      <h3>Your review</h3>
      <p className="qr-finish-progress">
        {progress.left === 0
          ? `All ${progress.toReview} files reviewed.`
          : `${progress.left} of ${progress.toReview} files still to review.`}
      </p>
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
