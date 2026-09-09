import { useEffect, useRef, useState } from 'react';
import { submitReview } from '@/services/github/mutations';
import { getPRReviewDetails } from '@/services/github/pulls';
import { getClientForRepo } from '@/services/github/singleton';
import {
  emptyReviewDocument,
  loadReviewSnapshot,
  type ReviewDocument,
  type ReviewSnapshot,
  reconcileReviewDocument,
  reviewDocumentKey,
} from '@/services/quick-review';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import type { PullRequest } from '@/types';
import { parseError } from '@/utils/parse-error';

export function useQuickReviewDocument(pr: PullRequest) {
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
  const key = reviewDocumentKey(pr, client?.account ?? '');
  const document = useQuickReviewStore((s) => s.documents[key] ?? emptyReviewDocument);
  const updateDocument = useQuickReviewStore((s) => s.updateDocument);
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    void revision;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        if (!client) throw new Error('No GitHub account is connected for this repository.');
        const result = await loadReviewSnapshot(client, pr);
        if (cancelled) return;
        updateDocument(key, (doc) => reconcileReviewDocument(doc, result));
        setSnapshot(result);
        setStale(false);
      } catch (error) {
        if (!cancelled) setLoadError(parseError(error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, key, pr, revision, updateDocument]);

  function update(updater: (doc: ReviewDocument) => ReviewDocument) {
    updateDocument(key, updater);
  }
  async function submit() {
    if (submitting.current || !client || !snapshot || loading || stale || loadError) return;
    const doc = useQuickReviewStore.getState().documents[key];
    if (!doc || doc.comments.some((c) => !c.saved || c.outdated || !c.body.trim())) return;
    if (
      doc.event !== 'APPROVE' &&
      !doc.body.trim() &&
      (doc.event === 'REQUEST_CHANGES' || !doc.comments.length)
    )
      return;
    submitting.current = true;
    const store = useQuickReviewStore.getState();
    store.setSubmitting();
    try {
      const current = await getPRReviewDetails(client, pr.repoOwner, pr.repoName, pr.number);
      if (current.pr.headSha !== doc.headSha || current.baseSha !== doc.baseSha) {
        setStale(true);
        throw new Error(
          'This PR has new changes. Reload files before submitting. Your drafts are kept.',
        );
      }
      if (current.pr.state !== 'open') throw new Error('This PR is no longer open.');
      await submitReview(client, pr.repoOwner, pr.repoName, pr.number, doc.event, doc.body.trim(), {
        commit_id: doc.headSha,
        comments: doc.comments.map((c) => ({
          path: c.path,
          line: c.line,
          side: c.side,
          body: c.body.trim(),
        })),
      });
      store.discardDocument(key);
      store.advance(doc.event === 'APPROVE' ? 'approved' : 'commented');
      void usePrStore.getState().refreshPr(pr.repoOwner, pr.repoName, pr.number);
    } catch (error) {
      store.setError(`Review not submitted: ${parseError(error).message}`);
    } finally {
      submitting.current = false;
    }
  }
  return {
    document,
    update,
    snapshot,
    loading,
    loadError,
    stale,
    submit,
    reload: () => {
      useQuickReviewStore.getState().clearError();
      setRevision((n) => n + 1);
    },
  };
}
