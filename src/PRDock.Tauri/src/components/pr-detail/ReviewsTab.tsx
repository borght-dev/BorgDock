import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

export function ReviewsTab({ prNumber, repoOwner, repoName }: ReviewsTabProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<Review[]>('get_pr_reviews', {
          owner: repoOwner,
          repo: repoName,
          prNumber,
        });
        if (!cancelled) setReviews(result);
      } catch (err) {
        console.error('Failed to load reviews:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [prNumber, repoOwner, repoName]);

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

  if (reviews.length === 0) {
    return (
      <p className="p-3 text-xs text-[var(--color-text-muted)]">No reviews yet.</p>
    );
  }

  return (
    <div className="divide-y divide-[var(--color-separator)]">
      {reviews.map((review) => {
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
              <div className="text-xs text-[var(--color-text-secondary)] [&_a]:text-[var(--color-accent)] [&_code]:bg-[var(--color-code-block-bg)] [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[10px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{review.body}</ReactMarkdown>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
