import clsx from 'clsx';
import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useCachedTabData } from '@/hooks/useCachedTabData';
import { getReviews } from '@/services/github/reviews';
import { getClient } from '@/services/github/singleton';

interface Review {
  id: number;
  user: string;
  state: string;
  body: string;
  submittedAt: string;
}

interface ReviewsTabProps {
  prNumber: number;
  repoOwner: string;
  repoName: string;
  prUpdatedAt: string;
}

function stateLabel(state: string): { label: string; color: string } {
  switch (state) {
    case 'APPROVED':
      return { label: 'Approved', color: 'var(--color-review-approved)' };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes Requested', color: 'var(--color-review-changes-requested)' };
    case 'COMMENTED':
      return { label: 'Commented', color: 'var(--color-review-commented)' };
    default:
      return { label: state, color: 'var(--color-text-muted)' };
  }
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

export function severityOrder(state: string): number {
  switch (state) {
    case 'CHANGES_REQUESTED':
      return 0;
    case 'COMMENTED':
      return 1;
    case 'APPROVED':
      return 2;
    default:
      return 3;
  }
}

export type SortMode = 'newest' | 'oldest' | 'severity' | 'file';

export function sortReviews(reviews: Review[], mode: SortMode | string): Review[] {
  switch (mode) {
    case 'oldest':
      return [...reviews].sort(
        (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
      );
    case 'newest':
      return [...reviews].sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      );
    case 'severity':
      return [...reviews].sort((a, b) => severityOrder(a.state) - severityOrder(b.state));
    case 'file':
      return [...reviews]; // reviews don't have file paths — passthrough
    default:
      return reviews;
  }
}

const SORT_MODES: SortMode[] = ['newest', 'oldest', 'severity', 'file'];

export function ReviewsTab({ prNumber, repoOwner, repoName, prUpdatedAt }: ReviewsTabProps) {
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const fetchFn = useCallback(async (): Promise<Review[]> => {
    const client = getClient();
    if (!client) return [];
    const result = await getReviews(client, repoOwner, repoName, prNumber);
    return result.map((r) => ({
      id: r.id,
      user: r.user?.login ?? '',
      state: r.state ?? '',
      body: r.body ?? '',
      submittedAt: r.submitted_at ?? '',
    }));
  }, [repoOwner, repoName, prNumber]);

  const { data: reviews, isLoading: loading } = useCachedTabData<Review[]>(
    repoOwner,
    repoName,
    prNumber,
    'reviews',
    prUpdatedAt,
    fetchFn,
  );

  if (loading) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 2 }).map((_, i) => (
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

  if (!reviews || reviews.length === 0) {
    return <p className="p-3 text-xs text-[var(--color-text-muted)]">No reviews yet.</p>;
  }

  const sortedReviews = sortReviews(reviews, sortMode);

  return (
    <div>
      {/* Sort buttons */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-[var(--color-separator)]">
        {SORT_MODES.map((mode) => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            className={clsx(
              'px-2 py-0.5 text-[10px] rounded transition-colors',
              sortMode === mode
                ? 'bg-[var(--color-accent)] text-[var(--color-avatar-text)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]',
            )}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      <div className="divide-y divide-[var(--color-separator)]">
        {sortedReviews.map((review) => {
          const { label, color } = stateLabel(review.state);
          return (
            <div key={review.id} className="px-3 py-2.5 space-y-1.5">
              {/* Header */}
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[7px] font-bold text-[var(--color-avatar-text)]">
                  {avatarInitials(review.user)}
                </span>
                <span className="text-xs font-medium text-[var(--color-text-primary)]">
                  {review.user}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {formatRelativeDate(review.submittedAt)}
                </span>
                <span
                  className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    color,
                    backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
                  }}
                >
                  {label}
                </span>
              </div>
              {/* Body */}
              {review.body && (
                <div className="markdown-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize]}
                  >
                    {review.body}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
