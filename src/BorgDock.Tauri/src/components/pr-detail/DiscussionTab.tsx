import { useCallback, useMemo, useState } from 'react';
import { Button, Chip } from '@/components/shared/primitives';
import { useCachedTabData } from '@/hooks/useCachedTabData';
import {
  getAllComments,
  getPRFiles,
  getReviews,
  getReviewThreads,
  resolveReviewThread,
  unresolveReviewThread,
} from '@/services/github';
import { getClient } from '@/services/github/singleton';
import type { ClaudeReviewComment, ReviewThread } from '@/types';
import { buildDiscussionItems, type DiscussionItem } from './discussion/buildDiscussionItems';
import { CodeThreadCard, type CodeThreadJumpTarget } from './CodeThreadCard';
import { CommentItem } from './CommentItem';
import { ReviewComposer, type ReviewComposerSubmitPayload } from './ReviewComposer';
import { ReviewItem } from './ReviewItem';

const Speech = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h10v6H7l-3 3v-3H3z" />
  </svg>
);

const CheckCircle = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" />
    <path d="m5 8.5 2 2 4-4" />
  </svg>
);

const Eye = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);

const FileIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6L9 2z" />
    <path d="M9 2v4h4" />
  </svg>
);

type Filter = 'all' | 'reviews' | 'comments' | 'code';

interface DiscussionTabProps {
  prNumber: number;
  repoOwner: string;
  repoName: string;
  prUpdatedAt: string;
  onJumpToFile: (target: CodeThreadJumpTarget) => void;
}

export function DiscussionTab({
  prNumber,
  repoOwner,
  repoName,
  prUpdatedAt,
  onJumpToFile,
}: DiscussionTabProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [composing, setComposing] = useState<null | 'comment' | 'review'>(null);

  const fetchReviews = useCallback(async () => {
    const client = getClient();
    if (!client) return [];
    return await getReviews(client, repoOwner, repoName, prNumber);
  }, [repoOwner, repoName, prNumber]);

  const fetchComments = useCallback(async (): Promise<ClaudeReviewComment[]> => {
    const client = getClient();
    if (!client) return [];
    // Filter: only top-level (issue) comments — code-anchored comments live in threads.
    const all = await getAllComments(client, repoOwner, repoName, prNumber);
    return all.filter((c) => !c.filePath);
  }, [repoOwner, repoName, prNumber]);

  const fetchThreads = useCallback(async (): Promise<ReviewThread[]> => {
    const client = getClient();
    if (!client) return [];
    const files = await getPRFiles(client, repoOwner, repoName, prNumber);
    const patches = new Map<string, string | undefined>();
    for (const f of files) patches.set(f.filename, f.patch);
    return await getReviewThreads(client, repoOwner, repoName, prNumber, patches);
  }, [repoOwner, repoName, prNumber]);

  const { data: reviews } = useCachedTabData(repoOwner, repoName, prNumber, 'reviews', prUpdatedAt, fetchReviews);
  const { data: comments } = useCachedTabData(repoOwner, repoName, prNumber, 'comments', prUpdatedAt, fetchComments);
  const { data: threads } = useCachedTabData(repoOwner, repoName, prNumber, 'reviewThreads', prUpdatedAt, fetchThreads);

  const items = useMemo<DiscussionItem[]>(
    () => buildDiscussionItems(reviews ?? [], comments ?? [], threads ?? []),
    [reviews, comments, threads],
  );

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (i.kind === 'code' && i.thread.isResolved && !showResolved) return false;
      if (filter === 'all') return true;
      if (filter === 'reviews') return i.kind === 'review';
      if (filter === 'comments') return i.kind === 'comment';
      if (filter === 'code') return i.kind === 'code';
      return true;
    });
  }, [items, filter, showResolved]);

  const counts = useMemo(() => {
    const liveCode = items.filter((i) => i.kind === 'code' && !i.thread.isResolved).length;
    return {
      all: items.filter((i) => !(i.kind === 'code' && i.thread.isResolved)).length,
      reviews: items.filter((i) => i.kind === 'review').length,
      comments: items.filter((i) => i.kind === 'comment').length,
      code: liveCode,
      resolved: items.filter((i) => i.kind === 'code' && i.thread.isResolved).length,
    };
  }, [items]);

  const handleResolve = useCallback(async (threadId: string) => {
    const client = getClient();
    if (!client) return;
    await resolveReviewThread(client, threadId);
  }, []);

  const handleUnresolve = useCallback(async (threadId: string) => {
    const client = getClient();
    if (!client) return;
    await unresolveReviewThread(client, threadId);
  }, []);

  const handleComposerSubmit = useCallback(
    async (_payload: ReviewComposerSubmitPayload) => {
      // Wired in Task 23 (final wire-up). For now, just close the composer.
      setComposing(null);
    },
    [],
  );

  return (
    <div className="space-y-3.5 p-3.5">
      {/* Filter chips + Show resolved + compose CTAs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={filter === 'all'} count={counts.all} onClick={() => setFilter('all')}>
          All
        </Chip>
        <Chip active={filter === 'reviews'} count={counts.reviews} onClick={() => setFilter('reviews')}>
          Reviews
        </Chip>
        <Chip active={filter === 'comments'} count={counts.comments} onClick={() => setFilter('comments')}>
          Comments
        </Chip>
        <Chip active={filter === 'code'} count={counts.code} onClick={() => setFilter('code')}>
          <span className="inline-flex items-center gap-1.5">
            <FileIcon />
            On code
          </span>
        </Chip>
        {counts.resolved > 0 && (
          <button
            type="button"
            onClick={() => setShowResolved((s) => !s)}
            aria-pressed={showResolved}
            data-discussion-toggle="resolved"
            className="bd-pill bd-pill--ghost h-[24px] cursor-pointer text-[11px] font-medium"
          >
            <span className="inline-flex items-center gap-1.5">
              {showResolved ? <Eye /> : <CheckCircle />}
              {showResolved ? 'Hide resolved' : `Show resolved (${counts.resolved})`}
            </span>
          </button>
        )}
        <span className="flex-1" />
        <Button
          variant="secondary"
          size="sm"
          leading={<Speech />}
          onClick={() => setComposing('comment')}
        >
          Comment
        </Button>
        <Button
          variant="primary"
          size="sm"
          leading={<CheckCircle />}
          onClick={() => setComposing('review')}
        >
          Submit review
        </Button>
      </div>

      {composing && (
        <ReviewComposer
          kind={composing}
          onSubmit={handleComposerSubmit}
          onCancel={() => setComposing(null)}
        />
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((item) => {
          if (item.kind === 'code') {
            return (
              <CodeThreadCard
                key={item.thread.id}
                thread={item.thread}
                onJumpToFile={onJumpToFile}
                onResolve={handleResolve}
                onUnresolve={handleUnresolve}
              />
            );
          }
          if (item.kind === 'review') {
            return (
              <ReviewItem
                key={item.id}
                author={item.author}
                authorIsBot={item.authorIsBot}
                verdict={item.verdict}
                body={item.body}
                createdAt={item.createdAt}
              />
            );
          }
          return (
            <CommentItem
              key={item.id}
              author={item.author}
              authorIsBot={item.authorIsBot}
              body={item.body}
              createdAt={item.createdAt}
            />
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-[var(--color-text-muted)]">
            No discussion yet.
          </p>
        )}
      </div>
    </div>
  );
}
