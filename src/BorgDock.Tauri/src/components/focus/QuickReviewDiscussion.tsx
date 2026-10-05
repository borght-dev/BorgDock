import { openUrl } from '@tauri-apps/plugin-opener';
import { useState } from 'react';
import { CommentItem } from '@/components/pr-detail/CommentItem';
import { ReviewItem } from '@/components/pr-detail/ReviewItem';
import { Button } from '@/components/shared/primitives';
import { type PrConversation, usePrConversation } from '@/hooks/usePrConversation';
import type { PullRequest } from '@/types';

type AuthorFilter = 'all' | 'author' | 'others';

export function QuickReviewDiscussion({
  pr,
  enabled,
  conversation,
}: {
  pr: PullRequest;
  enabled: boolean;
  conversation?: PrConversation;
}) {
  const own = usePrConversation(pr, enabled && !conversation);
  const { items, errors, loading, reload } = conversation ?? own;
  const [filter, setFilter] = useState<AuthorFilter>('all');
  const [openError, setOpenError] = useState('');
  const author = pr.authorLogin.toLowerCase();
  const byAuthor = items.filter((item) => item.author.toLowerCase() === author);
  const filtered =
    filter === 'all'
      ? items
      : filter === 'author'
        ? byAuthor
        : items.filter((item) => item.author.toLowerCase() !== author);
  return (
    <section className="qr-discussion" aria-label="PR comments">
      <div className="qr-discussion-toolbar">
        <div className="qr-row">
          <h3>Comments</h3>
          <span className="qr-muted">Newest first</span>
          <span className="qr-spacer" />
          <Button variant="secondary" size="sm" onClick={reload} disabled={loading}>
            Refresh comments
          </Button>
        </div>
        <div className="qr-row" role="group" aria-label="Filter comments by author">
          {(
            [
              ['all', 'Everyone', items.length],
              ['author', 'PR author', byAuthor.length],
              ['others', 'Other commenters', items.length - byAuthor.length],
            ] as const
          ).map(([value, label, count]) => (
            <Button
              key={value}
              variant={filter === value ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label} · {count}
            </Button>
          ))}
        </div>
      </div>
      {loading && <p role="status">Loading comments…</p>}
      {errors.length > 0 && (
        <div className="qr-warning" role="alert">
          <p>Some comments could not be loaded. Refresh to try again.</p>
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
      {openError && <p role="alert">{openError}</p>}
      {!loading && !errors.length && !filtered.length && (
        <p className="qr-muted">
          {filter === 'all'
            ? 'No comments yet.'
            : filter === 'author'
              ? 'No comments from the PR author.'
              : 'No comments from other commenters.'}
        </p>
      )}
      <div className="qr-discussion-items">
        {filtered.map((item) => (
          <article key={item.id} aria-label={`Comment by ${item.author || 'Deleted user'}`}>
            <div className="qr-row qr-muted qr-comment-source">
              <span>
                {item.filePath
                  ? `Inline comment · ${item.filePath}${item.lineNumber ? `:${item.lineNumber}` : ''}`
                  : item.kind === 'review'
                    ? 'Review'
                    : 'PR comment'}
              </span>
              <span className="qr-spacer" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpenError('');
                  if (item.htmlUrl && /^https?:\/\//i.test(item.htmlUrl))
                    void openUrl(item.htmlUrl).catch(() =>
                      setOpenError('Could not open the comment on GitHub.'),
                    );
                }}
              >
                View on GitHub
              </Button>
            </div>
            {item.kind === 'review' ? (
              <ReviewItem {...item} previewImages />
            ) : (
              <CommentItem {...item} previewImages />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
