import { CircleCheck } from 'lucide-react';
import type { Ref } from 'react';
import type { ReviewCommentDraft, ReviewDocument } from '@/services/quick-review';

interface Props {
  document: ReviewDocument;
  update: (updater: (doc: ReviewDocument) => ReviewDocument) => void;
  /** The file on screen is the last one in the walk. */
  last: boolean;
  /** Why the chosen decision cannot be posted yet, e.g. a missing overall comment. */
  notice?: string;
  bodyRef?: Ref<HTMLTextAreaElement>;
  onJump: (comment: ReviewCommentDraft) => void;
}

function fileName(path: string) {
  return path.split('/').pop() ?? path;
}

/**
 * Under the diff once every file is reviewed: the overall comment and the
 * draft comments that go with the review, so deciding needs no trip back to
 * the card.
 */
export function QuickReviewEndCard({
  document: doc,
  update,
  last,
  notice,
  bodyRef,
  onJump,
}: Props) {
  return (
    <section className="qr-endcard" aria-label="Your review">
      <h3>
        <CircleCheck size={16} strokeWidth={2.25} aria-hidden="true" />
        {last ? 'That was the last file' : 'Every file is reviewed'}
      </h3>
      <textarea
        ref={bodyRef}
        aria-label="Overall comment"
        value={doc.body}
        onChange={(e) => update((d) => ({ ...d, body: e.target.value }))}
        placeholder="Overall comment (optional) · posted with your review"
      />
      {notice && (
        <p className="qr-warning" role="status">
          {notice}
        </p>
      )}
      {doc.comments.length > 0 && (
        <>
          <p className="qr-endcard__label">
            Draft comments that go with it · {doc.comments.length}
          </p>
          <ul className="qr-endcard__drafts">
            {doc.comments.map((comment) => (
              <li key={comment.id}>
                <code title={comment.path}>
                  {fileName(comment.path)}:{comment.line}
                </code>
                <span>{comment.body.trim() || 'Empty draft'}</span>
                <button type="button" onClick={() => onJump(comment)}>
                  Jump
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
