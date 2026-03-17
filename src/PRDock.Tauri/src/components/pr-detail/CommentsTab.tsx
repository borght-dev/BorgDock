import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getClient } from '@/services/github/singleton';
import { getAllComments, postComment } from '@/services/github';
import type { ClaudeReviewComment } from '@/types';

interface CommentsTabProps {
  prNumber: number;
  repoOwner: string;
  repoName: string;
}

function formatRelativeDate(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function avatarInitials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

export function CommentsTab({ prNumber, repoOwner, repoName }: CommentsTabProps) {
  const [comments, setComments] = useState<ClaudeReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadComments = async () => {
    try {
      const client = getClient();
      if (!client) return;
      const result = await getAllComments(client, repoOwner, repoName, prNumber);
      setComments(result);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadComments();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [prNumber, repoOwner, repoName]);

  const handlePost = async () => {
    const text = newComment.trim();
    if (!text) return;
    const client = getClient();
    if (!client) return;

    setPosting(true);
    try {
      await postComment(client, repoOwner, repoName, prNumber, text);
      setNewComment('');
      await loadComments();
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 animate-pulse">
            <div className="flex gap-2">
              <div className="h-5 w-5 rounded-full bg-[var(--color-surface-raised)]" />
              <div className="h-3 w-24 rounded bg-[var(--color-surface-raised)]" />
            </div>
            <div className="h-10 w-full rounded bg-[var(--color-surface-raised)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Comment list */}
      <div className="flex-1 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="p-3 text-xs text-[var(--color-text-muted)]">No comments yet.</p>
        ) : (
          <div className="divide-y divide-[var(--color-separator)]">
            {comments.map((comment) => (
              <div key={comment.id} className="px-3 py-2.5 space-y-1.5">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[7px] font-bold text-[var(--color-avatar-text)]">
                    {avatarInitials(comment.author)}
                  </span>
                  <span className="text-xs font-medium text-[var(--color-text-primary)]">
                    {comment.author}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {formatRelativeDate(comment.createdAt)}
                  </span>
                </div>
                {/* File reference for inline comments */}
                {comment.filePath && (
                  <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                    {comment.filePath}
                    {comment.lineNumber != null && `:${comment.lineNumber}`}
                  </div>
                )}
                {/* Body */}
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.body}</ReactMarkdown>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Comment input */}
      <div className="border-t border-[var(--color-separator)] px-3 py-2">
        <div className="flex gap-2">
          <textarea
            className="field-input min-h-[60px] flex-1 resize-none text-xs"
            placeholder="Leave a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handlePost();
              }
            }}
          />
          <button
            className="self-end rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-accent-foreground)] bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-50"
            onClick={handlePost}
            disabled={posting || !newComment.trim()}
          >
            {posting ? 'Posting...' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
