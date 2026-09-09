import { Markdown } from '@/components/shared/Markdown';
import { Button } from '@/components/shared/primitives';
import type { ReviewCommentDraft } from '@/services/quick-review';

interface Props {
  comment: ReviewCommentDraft;
  onChange: (change: Partial<ReviewCommentDraft>) => void;
  onDelete: () => void;
  onReattach: () => void;
}
export function QuickReviewComment({ comment, onChange, onDelete, onReattach }: Props) {
  return (
    <section className="qr-comment" aria-label={`Draft on ${comment.path} line ${comment.line}`}>
      <div className="qr-row">
        <strong>Draft</strong>
        <span className="qr-muted qr-path">
          {comment.path} · {comment.side === 'LEFT' ? 'old' : 'new'} line {comment.line}
        </span>
      </div>
      {comment.outdated && (
        <p className="qr-warning">
          This file changed. Choose a new line before submitting this comment.
        </p>
      )}
      {comment.saved ? (
        <div className="markdown-body">
          <Markdown>{comment.body}</Markdown>
        </div>
      ) : (
        <label>
          Comment
          <textarea
            autoFocus
            value={comment.body}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder="Describe the issue or suggest a change..."
          />
        </label>
      )}
      <div className="qr-row qr-end">
        {comment.outdated && (
          <Button variant="secondary" size="md" onClick={onReattach}>
            Choose new line
          </Button>
        )}
        <Button variant="ghost" size="md" onClick={onDelete}>
          Delete draft
        </Button>
        {comment.saved ? (
          <Button variant="secondary" size="md" onClick={() => onChange({ saved: false })}>
            Edit draft
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            disabled={!comment.body.trim() || comment.outdated}
            onClick={() => onChange({ saved: true })}
          >
            Save draft
          </Button>
        )}
      </div>
    </section>
  );
}
