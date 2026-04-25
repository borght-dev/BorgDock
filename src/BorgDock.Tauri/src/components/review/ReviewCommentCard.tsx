import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { Dot, type DotTone } from '@/components/shared/primitives';
import type { ClaudeReviewComment, CommentSeverity } from '@/types';

interface ReviewCommentCardProps {
  comment: ClaudeReviewComment;
}

function severityDotTone(severity: CommentSeverity): DotTone {
  if (severity === 'critical') return 'red';
  if (severity === 'suggestion') return 'yellow';
  if (severity === 'praise') return 'green';
  return 'gray';
}

export function ReviewCommentCard({ comment }: ReviewCommentCardProps) {
  return (
    <div
      data-review-card
      data-review-severity={comment.severity}
      className="flex gap-2 rounded-md border border-[var(--color-subtle-border)] p-2.5"
    >
      {/* Severity dot */}
      <Dot tone={severityDotTone(comment.severity)} size={8} className="mt-1 shrink-0" />

      <div className="min-w-0 flex-1 space-y-1">
        {/* File path */}
        {comment.filePath && (
          <p className="font-[var(--font-code)] text-[10px] text-[var(--color-text-muted)]">
            {comment.filePath}
            {comment.lineNumber != null && `:${comment.lineNumber}`}
          </p>
        )}

        {/* Body */}
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
            {comment.body}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
