import { useCallback, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useCachedTabData } from '@/hooks/useCachedTabData';
import { saveTabData } from '@/services/cache';
import { getAllComments, postComment } from '@/services/github';
import { getClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import type { ClaudeReviewComment } from '@/types';

const log = createLogger('commentsTab');

interface CommentsTabProps {
  prNumber: number;
  repoOwner: string;
  repoName: string;
  prUpdatedAt: string;
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
  // Strip [bot] suffix for cleaner initials
  const clean = login.replace(/\[bot\]$/, '').trim();
  return clean.slice(0, 2).toUpperCase();
}

/**
 * Curated palette of distinguishable author colors.
 * Pairs: [avatar-bg (solid), stripe/tint (used at 12% opacity for card bg)].
 * Colors chosen to be vibrant yet legible in both light and dark themes.
 */
const AUTHOR_PALETTE = [
  '#7C6AF6', // violet
  '#E54065', // ruby
  '#7DD3C0', // aquamarine
  '#6655D4', // deep violet
  '#3BA68E', // teal
  '#B8B0F8', // lavender
  '#9384F7', // light violet
  '#C7324F', // deep ruby
  '#F5B73B', // amber
  '#5A4ABF', // indigo
] as const;

/** Deterministic hash → palette index for a given username. */
function authorColor(author: string): string {
  let hash = 0;
  for (let i = 0; i < author.length; i++) {
    hash = ((hash << 5) - hash + author.charCodeAt(i)) | 0;
  }
  return AUTHOR_PALETTE[Math.abs(hash) % AUTHOR_PALETTE.length]!;
}

function isBot(login: string): boolean {
  return login.endsWith('[bot]') || login.endsWith('-bot');
}

export function CommentsTab({ prNumber, repoOwner, repoName, prUpdatedAt }: CommentsTabProps) {
  const [postedComments, setPostedComments] = useState<ClaudeReviewComment[] | null>(null);
  const [sortNewest, setSortNewest] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchFn = useCallback(async () => {
    const client = getClient();
    if (!client) return [];
    return getAllComments(client, repoOwner, repoName, prNumber);
  }, [repoOwner, repoName, prNumber]);

  const { data: cachedComments, isLoading: loading } = useCachedTabData<ClaudeReviewComment[]>(
    repoOwner,
    repoName,
    prNumber,
    'comments',
    prUpdatedAt,
    fetchFn,
  );

  // Use posted comments (after user posts) if available, otherwise cached/fetched
  const comments = postedComments ?? cachedComments ?? [];

  const handlePost = async () => {
    const text = newComment.trim();
    if (!text) return;
    const client = getClient();
    if (!client) return;

    setPosting(true);
    try {
      log.info('posting comment', { prNumber, length: text.length });
      await postComment(client, repoOwner, repoName, prNumber, text);
      setNewComment('');
      // Reload comments after posting
      const fresh = await getAllComments(client, repoOwner, repoName, prNumber);
      setPostedComments(fresh);
      saveTabData(repoOwner, repoName, prNumber, 'comments', fresh, prUpdatedAt);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      log.error('post comment failed', err, { prNumber });
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-[var(--color-subtle-border)] p-3"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded-full bg-[var(--color-surface-raised)]" />
              <div className="h-3 w-20 rounded bg-[var(--color-surface-raised)]" />
              <div className="ml-auto h-2.5 w-10 rounded bg-[var(--color-surface-raised)]" />
            </div>
            <div className="mt-2.5 space-y-1.5">
              <div className="h-2.5 w-full rounded bg-[var(--color-surface-raised)]" />
              <div className="h-2.5 w-3/4 rounded bg-[var(--color-surface-raised)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const sorted = sortNewest
    ? [...comments].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : comments;

  return (
    <div className="flex h-full flex-col">
      {/* Comment list */}
      <div className="flex-1 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="p-3 text-xs text-[var(--color-text-muted)]">No comments yet.</p>
        ) : (
          <div className="space-y-2 p-3">
            {/* Sort toggle */}
            <div className="flex items-center justify-end">
              <button
                onClick={() => setSortNewest((v) => !v)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  {sortNewest ? <path d="M8 3v10M4 7l4-4 4 4" /> : <path d="M8 3v10M4 9l4 4 4-4" />}
                </svg>
                {sortNewest ? 'Newest first' : 'Oldest first'}
              </button>
            </div>
            {sorted.map((comment, idx) => {
              const color = authorColor(comment.author);
              const bot = isBot(comment.author);
              // Collapse top margin when same author posts consecutively
              const prevSameAuthor = idx > 0 && sorted[idx - 1]?.author === comment.author;

              return (
                <div
                  key={comment.id}
                  className="comment-card-enter flex overflow-hidden rounded-lg border border-[var(--color-subtle-border)]"
                  style={{
                    animationDelay: `${idx * 40}ms`,
                    marginTop: prevSameAuthor ? '4px' : undefined,
                  }}
                >
                  {/* Left author stripe */}
                  <div className="w-[3px] shrink-0" style={{ backgroundColor: color }} />

                  <div className="min-w-0 flex-1 px-3 py-2.5">
                    {/* Author header — hide if same as previous for visual grouping */}
                    {!prevSameAuthor && (
                      <div className="mb-1.5 flex items-center gap-2">
                        {/* Avatar */}
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
                          style={{
                            backgroundColor: color,
                            color: '#fff',
                          }}
                        >
                          {bot ? (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="3" y="5" width="10" height="8" rx="1.5" />
                              <path d="M6 9h0M10 9h0" strokeWidth="2" />
                              <path d="M8 5V3" />
                              <circle cx="8" cy="2.5" r="0.5" fill="currentColor" stroke="none" />
                            </svg>
                          ) : (
                            avatarInitials(comment.author)
                          )}
                        </span>

                        {/* Name + badges */}
                        <span className="text-xs font-semibold" style={{ color }}>
                          {comment.author}
                        </span>

                        {bot && (
                          <span
                            className="rounded px-1 py-px text-[9px] font-medium leading-none"
                            style={{
                              color,
                              backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
                            }}
                          >
                            bot
                          </span>
                        )}

                        <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
                          {formatRelativeDate(comment.createdAt)}
                        </span>
                      </div>
                    )}

                    {/* Timestamp when header is collapsed */}
                    {prevSameAuthor && (
                      <div className="mb-1 flex">
                        <span className="text-[10px] text-[var(--color-text-faint)]">
                          {formatRelativeDate(comment.createdAt)}
                        </span>
                      </div>
                    )}

                    {/* File reference for inline comments */}
                    {comment.filePath && (
                      <div
                        className="mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono"
                        style={{
                          color,
                          backgroundColor: `color-mix(in srgb, ${color} 6%, transparent)`,
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6L9 2z" />
                          <path d="M9 2v4h4" />
                        </svg>
                        {comment.filePath}
                        {comment.lineNumber != null && `:${comment.lineNumber}`}
                      </div>
                    )}

                    {/* Body */}
                    <div className="markdown-body">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                      >
                        {comment.body}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Comment input */}
      <div className="border-t border-[var(--color-separator)] px-3 py-2.5">
        <div className="overflow-hidden rounded-lg border border-[var(--color-input-border)] transition-colors focus-within:border-[var(--color-accent)]">
          <textarea
            className="block w-full resize-none bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-ghost)]"
            rows={2}
            placeholder="Leave a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handlePost();
              }
            }}
          />
          <div className="flex items-center justify-between bg-[var(--color-surface-raised)] px-3 py-1.5">
            <span className="text-[10px] text-[var(--color-text-faint)]">Ctrl+Enter to submit</span>
            <button
              className="rounded-md px-3 py-1 text-[11px] font-medium text-[var(--color-accent-foreground)] bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-40"
              onClick={handlePost}
              disabled={posting || !newComment.trim()}
            >
              {posting ? 'Posting...' : 'Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
