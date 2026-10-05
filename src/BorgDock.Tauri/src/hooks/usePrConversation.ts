import { useEffect, useState } from 'react';
import {
  buildDiscussionItems,
  type DiscussionItem,
} from '@/components/pr-detail/discussion/buildDiscussionItems';
import { getAllComments, getReviews } from '@/services/github/reviews';
import { getClientForRepo } from '@/services/github/singleton';
import type { PullRequest } from '@/types';
import { parseError } from '@/utils/parse-error';
export type ConversationEntry = Exclude<DiscussionItem, { kind: 'code' }> & {
  sourceBody?: string;
  htmlUrl?: string;
  filePath?: string;
  lineNumber?: number;
};

export function usePrConversation(pr: PullRequest, enabled: boolean) {
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
  const [items, setItems] = useState<ConversationEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const { repoOwner, repoName, number, htmlUrl, headSha } = pr;
  const requestKey = `${repoOwner}/${repoName}#${number}@${headSha ?? ''}`;
  const [loadedFor, setLoadedFor] = useState('');
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
        const entries = buildDiscussionItems(reviews, comments, []).flatMap(
          (item): ConversationEntry[] => {
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
                sourceBody:
                  comment?.sourceBody ??
                  (item.kind === 'review'
                    ? reviews.find((review) => String(review.id) === item.id.slice(7))?.sourceBody
                    : undefined),
                filePath: comment?.filePath,
                lineNumber: comment?.lineNumber,
              },
            ];
          },
        );
        setItems(entries.reverse());
        setErrors(warnings);
      } catch (error) {
        if (!cancelled) setErrors([parseError(error).message]);
      } finally {
        if (!cancelled) {
          setLoadedFor(requestKey);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, client, repoOwner, repoName, number, htmlUrl, requestKey, revision]);
  const current = loadedFor === requestKey;
  return {
    items: current ? items : [],
    errors: current ? errors : [],
    loading: enabled && (loading || !current),
    reload: () => setRevision((n) => n + 1),
  };
}

export type PrConversation = ReturnType<typeof usePrConversation>;
