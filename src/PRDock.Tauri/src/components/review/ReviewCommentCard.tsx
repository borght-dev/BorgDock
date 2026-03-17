import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ClaudeReviewComment, CommentSeverity } from '@/types';

interface ReviewCommentCardProps {
  comment: ClaudeReviewComment;
}

function severityColor(severity: CommentSeverity): string {
  switch (severity) {
    case 'critical': return 'var(--color-status-red)';
    case 'suggestion': return 'var(--color-purple)';
    case 'praise': return 'var(--color-status-green)';
    default: return 'var(--color-status-gray)';
  }
}

export function ReviewCommentCard({ comment }: ReviewCommentCardProps) {
  const color = severityColor(comment.severity);

  return (
    <div className="flex gap-2 rounded-md border border-[var(--color-subtle-border)] p-2.5">
      {/* Severity dot */}
      <span
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />

      <div className="min-w-0 flex-1 space-y-1">
        {/* File path */}
        {comment.filePath && (
          <p className="font-[var(--font-code)] text-[10px] text-[var(--color-text-muted)]">
            {comment.filePath}
            {comment.lineNumber != null && `:${comment.lineNumber}`}
          </p>
        )}

        {/* Body */}
        <div className="text-xs text-[var(--color-text-secondary)] [&_a]:text-[var(--color-accent)] [&_code]:bg-[var(--color-code-block-bg)] [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[10px] [&_code]:font-[var(--font-code)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.body}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
