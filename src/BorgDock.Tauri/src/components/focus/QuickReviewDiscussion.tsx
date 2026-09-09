import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useState } from 'react';
import { CommentItem } from '@/components/pr-detail/CommentItem';
import {
  buildDiscussionItems,
  type DiscussionItem,
} from '@/components/pr-detail/discussion/buildDiscussionItems';
import { ReviewItem } from '@/components/pr-detail/ReviewItem';
import { Button } from '@/components/shared/primitives';
import { getAllComments, getReviews } from '@/services/github/reviews';
import { getClientForRepo } from '@/services/github/singleton';
import type { PullRequest } from '@/types';
import { parseError } from '@/utils/parse-error';

type Entry = Exclude<DiscussionItem, { kind: 'code' }> & {
  htmlUrl?: string;
  filePath?: string;
  lineNumber?: number;
};
type AuthorFilter = 'all' | 'author' | 'others';

function useConversation(pr: PullRequest, enabled: boolean) {
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const { repoOwner, repoName, number, htmlUrl } = pr;
  useEffect(() => {
    if (!enabled) return;
    void revision;
    let cancelled = false;
    setLoading(true);
    setErrors([]);
    const warnings: string[] = [];
    async function load() {
      try {
        if (!client) throw new Error('No GitHub account is connected for this repository.');
        const [commentsResult, reviewsResult] = await Promise.allSettled([
          getAllComments(client, repoOwner, repoName, number, {
            paginate: true,
            renderedBody: true,
            onError: (source, error) => warnings.push(`${source}: ${parseError(error).message}`),
          }),
          getReviews(client, repoOwner, repoName, number, { paginate: true, renderedBody: true }),
        ]);
        if (cancelled) return;
        if (commentsResult.status === 'rejected')
          warnings.push(`Comments: ${parseError(commentsResult.reason).message}`);
        if (reviewsResult.status === 'rejected')
          warnings.push(`Reviews: ${parseError(reviewsResult.reason).message}`);
        const comments = (commentsResult.status === 'fulfilled' ? commentsResult.value : []).map(
          (c) => ({
            ...c,
            id: `${c.filePath ? 'inline' : 'issue'}-${c.id}`,
          }),
        );
        const reviews = reviewsResult.status === 'fulfilled' ? reviewsResult.value : [];
        const metadata = new Map(comments.map((c) => [`comment-${c.id}`, c]));
        const entries = buildDiscussionItems(reviews, comments, []).flatMap((item): Entry[] => {
          if (item.kind === 'code') return [];
          const comment = metadata.get(item.id);
          return [
            {
              ...item,
              htmlUrl:
                comment?.htmlUrl ||
                (item.kind === 'review'
                  ? `${htmlUrl}#pullrequestreview-${item.id.slice(7)}`
                  : htmlUrl),
              filePath: comment?.filePath,
              lineNumber: comment?.lineNumber,
            },
          ];
        });
        setItems(entries.reverse());
        setErrors(warnings);
      } catch (error) {
        if (!cancelled) setErrors([parseError(error).message]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, client, repoOwner, repoName, number, htmlUrl, revision]);
  return { items, errors, loading, reload: () => setRevision((n) => n + 1) };
}

export function QuickReviewDiscussion({ pr, enabled }: { pr: PullRequest; enabled: boolean }) {
  const { items, errors, loading, reload } = useConversation(pr, enabled);
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
