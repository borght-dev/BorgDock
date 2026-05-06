import clsx from 'clsx';
import { useState } from 'react';
import { Button } from '@/components/shared/primitives';

const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m4 8 3 3 5-6" />
  </svg>
);

const CloseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="m4 4 8 8M12 4 4 12" />
  </svg>
);

export type ReviewComposerDecision = 'approve' | 'comment' | 'request';

export type ReviewComposerSubmitPayload =
  | { kind: 'comment'; body: string }
  | { kind: 'review'; decision: ReviewComposerDecision; body: string };

interface ReviewComposerProps {
  kind: 'comment' | 'review';
  onSubmit: (payload: ReviewComposerSubmitPayload) => void;
  onCancel: () => void;
  /** Optional default decision for review mode. Defaults to "approve". */
  defaultDecision?: ReviewComposerDecision;
  /** Optional initial textarea body. */
  defaultBody?: string;
  /** Render with a tighter padding for inline use (Files toolbar). Default false. */
  inline?: boolean;
}

const DECISIONS: Array<{ id: ReviewComposerDecision; label: string; tone: 'success' | 'neutral' | 'error' }> = [
  { id: 'approve', label: 'Approve', tone: 'success' },
  { id: 'comment', label: 'Comment only', tone: 'neutral' },
  { id: 'request', label: 'Request changes', tone: 'error' },
];

/**
 * ReviewComposer — shared inline composer for adding a comment or submitting a review.
 *
 * Used by:
 * - DiscussionTab (top-level "Comment" / "Submit review" CTA)
 * - FilesTab (Submit review CTA in the diff toolbar — slides down inline)
 */
export function ReviewComposer({
  kind,
  onSubmit,
  onCancel,
  defaultDecision = 'approve',
  defaultBody = '',
  inline = false,
}: ReviewComposerProps) {
  const [decision, setDecision] = useState<ReviewComposerDecision>(defaultDecision);
  const [body, setBody] = useState(defaultBody);

  const submit = () => {
    if (kind === 'comment') {
      onSubmit({ kind: 'comment', body });
    } else {
      onSubmit({ kind: 'review', decision, body });
    }
  };

  const submitLabel =
    kind === 'comment'
      ? 'Comment'
      : `Submit ${decision}`;

  return (
    <div
      data-review-composer
      className={clsx(
        'rounded-md border bg-[var(--color-accent-subtle)] border-[var(--color-purple-border)]',
        inline ? 'p-3' : 'p-3.5',
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">
          {kind === 'review' ? 'Submit review' : 'Add comment'}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Close"
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
          onClick={onCancel}
        >
          <CloseIcon />
        </button>
      </div>

      {kind === 'review' && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {DECISIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDecision(d.id)}
              aria-pressed={decision === d.id}
              className={clsx(
                'bd-pill h-[26px] cursor-pointer text-[11px]',
                decision === d.id ? `bd-pill--${d.tone}` : 'bd-pill--ghost',
                decision === d.id ? 'font-semibold' : 'font-medium',
              )}
            >
              {decision === d.id && (
                <span className="mr-1 inline-flex">
                  <CheckIcon />
                </span>
              )}
              {d.label}
            </button>
          ))}
        </div>
      )}

      <textarea
        placeholder={kind === 'review' ? 'Optional comment for review…' : 'Leave a comment…'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="block min-h-[72px] w-full resize-y rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] p-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
      />

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={submit} data-review-composer-submit>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
