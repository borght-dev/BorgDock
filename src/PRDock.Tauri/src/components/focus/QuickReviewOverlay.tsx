import { useCallback, useState } from 'react';
import { submitReview } from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { QuickReviewCard } from './QuickReviewCard';
import { QuickReviewSummary } from './QuickReviewSummary';

export function QuickReviewOverlay() {
  const state = useQuickReviewStore((s) => s.state);
  const queue = useQuickReviewStore((s) => s.queue);
  const currentIndex = useQuickReviewStore((s) => s.currentIndex);
  const decisions = useQuickReviewStore((s) => s.decisions);
  const error = useQuickReviewStore((s) => s.error);
  const currentPr = useQuickReviewStore((s) => s.currentPr)();
  const remaining = useQuickReviewStore((s) => s.remaining)();
  const advance = useQuickReviewStore((s) => s.advance);
  const goBack = useQuickReviewStore((s) => s.goBack);
  const setSubmitting = useQuickReviewStore((s) => s.setSubmitting);
  const setError = useQuickReviewStore((s) => s.setError);
  const clearError = useQuickReviewStore((s) => s.clearError);
  const endSession = useQuickReviewStore((s) => s.endSession);

  const [commentBody, setCommentBody] = useState('');
  const [commentMode, setCommentMode] = useState<'comment' | 'changes' | null>(null);

  const handleApprove = useCallback(async () => {
    if (!currentPr) return;
    const client = getClient();
    if (!client) return;
    setSubmitting();
    try {
      const p = currentPr.pullRequest;
      await submitReview(client, p.repoOwner, p.repoName, p.number, 'APPROVE');
      advance('approved');
    } catch (err) {
      setError(`Approve failed: ${err}`);
    }
  }, [currentPr, setSubmitting, advance, setError]);

  const handleSubmitComment = useCallback(async () => {
    if (!currentPr || !commentBody.trim()) return;
    const client = getClient();
    if (!client) return;
    setSubmitting();
    try {
      const p = currentPr.pullRequest;
      const event = commentMode === 'changes' ? 'REQUEST_CHANGES' : 'COMMENT';
      await submitReview(client, p.repoOwner, p.repoName, p.number, event, commentBody);
      setCommentBody('');
      setCommentMode(null);
      advance('commented');
    } catch (err) {
      setError(`Submit failed: ${err}`);
    }
  }, [currentPr, commentBody, commentMode, setSubmitting, advance, setError]);

  const handleSkip = useCallback(() => {
    setCommentBody('');
    setCommentMode(null);
    advance('skipped');
  }, [advance]);

  if (state === 'idle') return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[80] bg-[var(--color-overlay-bg)]" onClick={endSession} />

      {/* Overlay panel */}
      <div className="fixed inset-x-4 top-8 bottom-8 z-[81] mx-auto max-w-[600px] flex flex-col rounded-xl border border-[var(--color-modal-border)] bg-[var(--color-modal-bg)] shadow-2xl overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[var(--color-separator)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Quick Review
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {currentIndex + 1} / {queue.length}
            </span>
            {remaining > 0 && (
              <span className="text-[10px] text-[var(--color-text-ghost)]">
                ({remaining} remaining)
              </span>
            )}
          </div>
          <button
            onClick={endSession}
            className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
          >
            &#10005;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {state === 'complete' ? (
            <QuickReviewSummary queue={queue} decisions={decisions} onClose={endSession} />
          ) : currentPr ? (
            <QuickReviewCard pr={currentPr} />
          ) : null}

          {/* Error banner */}
          {error && (
            <div className="mt-3 rounded-md border border-[var(--color-error-badge-border)] bg-[var(--color-error-badge-bg)] px-3 py-2 text-xs text-[var(--color-error-badge-fg)]">
              {error}
              <div className="mt-1 flex gap-2">
                <button
                  onClick={clearError}
                  className="text-[var(--color-accent)] hover:underline"
                >
                  Retry
                </button>
                <button
                  onClick={handleSkip}
                  className="text-[var(--color-text-muted)] hover:underline"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* Comment input */}
          {commentMode && state === 'reviewing' && (
            <div className="mt-3 space-y-2">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={
                  commentMode === 'changes'
                    ? 'Describe the changes needed...'
                    : 'Write a comment...'
                }
                rows={3}
                autoFocus
                className="w-full resize-none rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSubmitComment}
                  disabled={!commentBody.trim()}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-foreground)] hover:opacity-90 disabled:opacity-40"
                >
                  Submit {commentMode === 'changes' ? 'Request Changes' : 'Comment'}
                </button>
                <button
                  onClick={() => {
                    setCommentMode(null);
                    setCommentBody('');
                  }}
                  className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1 text-xs text-[var(--color-text-muted)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action bar (only in reviewing state, not complete) */}
        {state === 'reviewing' && !commentMode && (
          <div className="border-t border-[var(--color-separator)] px-4 py-3 flex items-center gap-2">
            {currentIndex > 0 && (
              <button
                onClick={goBack}
                className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
              >
                {'\u2190'} Back
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={handleSkip}
              className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
            >
              Skip {'\u2192'}
            </button>
            <button
              onClick={() => setCommentMode('comment')}
              className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            >
              Comment (C)
            </button>
            <button
              onClick={() => setCommentMode('changes')}
              className="rounded-md border border-[var(--color-status-red)] px-3 py-1.5 text-xs font-medium text-[var(--color-action-danger-fg)] hover:bg-[var(--color-action-danger-bg)]"
            >
              Request Changes (X)
            </button>
            <button
              onClick={handleApprove}
              className="rounded-md bg-[var(--color-status-green)] px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              Approve (A)
            </button>
          </div>
        )}

        {/* Keyboard hint */}
        {state === 'reviewing' && !commentMode && (
          <div className="border-t border-[var(--color-separator)] px-4 py-1.5 text-center text-[10px] text-[var(--color-text-ghost)]">
            A approve &middot; C comment &middot; X request changes &middot; S/{'\u2192'} skip
            &middot; {'\u2190'} back &middot; Esc close
          </div>
        )}
      </div>
    </>
  );
}
