import FocusTrap from 'focus-trap-react';
import { useCallback, useState } from 'react';
import { InlineHint } from '@/components/onboarding';
import { Button, IconButton } from '@/components/shared/primitives';
import { submitReview } from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { parseError } from '@/utils/parse-error';
import { QuickReviewCard } from './QuickReviewCard';
import { QuickReviewSummary } from './QuickReviewSummary';

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="m4 4 8 8M12 4 4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
      setError(`Approve failed: ${parseError(err).message}`);
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
      setError(`Submit failed: ${parseError(err).message}`);
    }
  }, [currentPr, commentBody, commentMode, setSubmitting, advance, setError]);

  const handleSkip = useCallback(() => {
    setCommentBody('');
    setCommentMode(null);
    advance('skipped');
  }, [advance]);

  if (state === 'idle') return null;

  return (
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false,
        tabbableOptions: { displayCheck: 'none' },
      }}
    >
      <div>
        {/* Backdrop */}
        <div className="fixed inset-0 z-[80] bg-[var(--color-overlay-bg)]" onClick={endSession} />

        {/* Overlay panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick Review"
          data-overlay="quick-review"
          className="fixed inset-x-4 top-8 bottom-8 z-[81] mx-auto max-w-[600px] flex flex-col rounded-xl border border-[var(--color-modal-border)] bg-[var(--color-modal-bg)] shadow-2xl overflow-hidden"
        >
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
            <IconButton icon={<CloseIcon />} tooltip="Close" onClick={endSession} />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {state === 'reviewing' && (
              <InlineHint
                hintId="review-mode-shortcuts"
                text="Press A to approve, S to skip, C to comment"
              />
            )}
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
                  <Button variant="ghost" size="sm" onClick={clearError}>
                    Retry
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSkip}>
                    Skip
                  </Button>
                </div>
              </div>
            )}

            {/* Comment input */}
            {commentMode && state === 'reviewing' && (
              <div className="mt-3 space-y-2">
                {/* Input is single-line — textarea stays raw until a Textarea primitive lands */}
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
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleSubmitComment}
                    disabled={!commentBody.trim()}
                  >
                    Submit {commentMode === 'changes' ? 'Request Changes' : 'Comment'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      setCommentMode(null);
                      setCommentBody('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Action bar (only in reviewing state, not complete) */}
          {state === 'reviewing' && !commentMode && (
            <div className="border-t border-[var(--color-separator)] px-4 py-3 flex items-center gap-2">
              {currentIndex > 0 && (
                <Button variant="ghost" size="md" onClick={goBack}>
                  {'\u2190'} Back
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" size="md" onClick={handleSkip}>
                Skip {'\u2192'}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setCommentMode('comment')}>
                Comment (C)
              </Button>
              <Button variant="danger" size="md" onClick={() => setCommentMode('changes')}>
                Request Changes (X)
              </Button>
              <Button variant="primary" size="md" onClick={handleApprove}>
                Approve (A)
              </Button>
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
      </div>
    </FocusTrap>
  );
}
