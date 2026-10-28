import { useEffect, useRef, useState } from 'react';
import { getClientForRepo } from '@/services/github/singleton';
import { submitPrReview } from '@/services/pr-review';
import {
  currentReviewDetails,
  loadReviewSnapshot,
  normalizeReviewDocument,
  type ReviewDocument,
  type ReviewEvent,
  type ReviewSnapshot,
  reconcileReviewDocument,
  reviewDocumentKey,
  reviewProgress,
} from '@/services/quick-review';
import { type ReviewDecision, useQuickReviewStore } from '@/stores/quick-review-store';
import { toastError } from '@/stores/toast-store';
import type { PullRequest } from '@/types';
import { parseError } from '@/utils/parse-error';

export function useQuickReviewDocument(pr: PullRequest) {
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
  const key = reviewDocumentKey(pr, client?.account ?? '');
  // Normalized outside the selector (a new object per call would loop), so
  // documents saved before a field existed still load.
  const stored = useQuickReviewStore((s) => s.documents[key]);
  const document = normalizeReviewDocument(stored);
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
  /**
   * The review as it would be posted now, as a function that posts it, or
   * null when it cannot be posted yet. `event` overrides the document's
   * decision for this submission only (the card's Approve); it is never
   * persisted. Approving waits until every non-generated file is reviewed.
   * The function captures everything it needs, so it can run after this PR
   * is no longer on screen (an approval held for Undo); it throws when
   * GitHub refuses, and resolves to the decision to record.
   */
  function prepare(event?: ReviewEvent, autoMerge = false) {
    if (submitting.current || !client || !snapshot || loading || stale || loadError) return null;
    const stored = useQuickReviewStore.getState().documents[key];
    // The override is not saved: a failed approval leaves the draft's own
    // decision as it was.
    const doc = stored && event ? { ...stored, event } : stored;
    if (!doc || doc.comments.some((c) => !c.saved || c.outdated || !c.body.trim())) return null;
    if (
      doc.event === 'APPROVE' &&
      reviewProgress(
        snapshot.files.map((f) => f.filename),
        doc.reviewed,
      ).left > 0
    )
      return null;
    if (
      doc.event !== 'APPROVE' &&
      !doc.body.trim() &&
      (doc.event === 'REQUEST_CHANGES' || !doc.comments.length)
    )
      return null;
    return async (): Promise<ReviewDecision> => {
      submitting.current = true;
      try {
        const current = await currentReviewDetails(client, snapshot);
        if (current.pr.headSha !== doc.headSha || current.baseSha !== doc.baseSha) {
          setStale(true);
          throw new Error(
            'This PR has new changes. Reload files before submitting. Your drafts are kept.',
          );
        }
        if (current.pr.state.toLowerCase() !== 'open')
          throw new Error('This PR is no longer open.');
        const { autoMerge: merging } = await submitPrReview(
          client,
          pr.repoOwner,
          pr.repoName,
          pr.number,
          doc.event,
          doc.body.trim(),
          {
            commit_id: doc.headSha,
            comments: doc.comments.map((c) => ({
              path: c.path,
              line: c.line,
              side: c.side,
              body: c.body.trim(),
            })),
          },
          autoMerge && !current.pr.autoMergeEnabled,
        );
        useQuickReviewStore.getState().discardDocument(key);
        merging?.catch((error) => toastError('Approved; auto merge not enabled', error));
        return doc.event === 'APPROVE' ? 'approved' : 'commented';
      } finally {
        submitting.current = false;
      }
    };
  }
  /** Posts the review now and moves to the next PR, or stays with the error. */
  async function submit(event?: ReviewEvent, autoMerge = false) {
    const send = prepare(event, autoMerge);
    if (!send) return;
    const store = useQuickReviewStore.getState();
    store.setSubmitting();
    try {
      store.advance(await send());
    } catch (error) {
      store.setError(`Review not submitted: ${parseError(error).message}`);
      toastError('Review not submitted', error);
    }
  }
  return {
    document,
    update,
    snapshot,
    loading,
    loadError,
    stale,
    prepare,
    submit,
    reload: () => {
      useQuickReviewStore.getState().clearError();
      setRevision((n) => n + 1);
    },
  };
}
