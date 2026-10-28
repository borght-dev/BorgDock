import { CircleCheck, GitMerge } from 'lucide-react';
import { Button } from '@/components/shared/primitives';
import type { ReviewProgress } from '@/services/quick-review';

/** A shortcut drawn on its button; the button's `aria-keyshortcuts` names it. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="qr-key" aria-hidden="true">
      {children}
    </kbd>
  );
}

function drafts(count: number) {
  return count === 0 ? 'No drafts' : `${count} draft ${count === 1 ? 'comment' : 'comments'}`;
}

interface Props {
  progress: ReviewProgress;
  draftCount: number;
  ready: boolean;
  /** Why Approve is not possible, or null. */
  approveIssue: string | null;
  autoMergeEnabled: boolean;
  canGoBack: boolean;
  canGoOn: boolean;
  hasFile: boolean;
  onSkipGenerated: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onMark: () => void;
  onApprove: (autoMerge: boolean) => void;
  onRequestChanges: () => void;
  onComment: () => void;
}

/**
 * The file walk's footer. While files are left: drafts, Previous, Next file,
 * Mark reviewed & next, and Approve held back with how many files are left.
 * Once every file is reviewed it turns into the decision bar (Request
 * changes, Comment, Approve, Approve & auto-merge) — no Finish step. Its
 * primary button (`.qr-decide--go`) takes focus when the last file is marked.
 */
export function QuickReviewDecisionBar({
  progress,
  draftCount,
  ready,
  approveIssue,
  autoMergeEnabled,
  canGoBack,
  canGoOn,
  hasFile,
  onSkipGenerated,
  onPrevious,
  onNext,
  onMark,
  onApprove,
  onRequestChanges,
  onComment,
}: Props) {
  const done = ready && progress.left === 0;
  if (done)
    return (
      <div className="qr-foot" data-done="true" data-quick-review-actions="">
        <span className="qr-foot__stat" data-tone={approveIssue ? 'warning' : 'done'}>
          {approveIssue ? (
            approveIssue
          ) : (
            <>
              <CircleCheck size={16} strokeWidth={2.25} aria-hidden="true" />
              All {progress.toReview} files reviewed
              <span className="qr-muted">
                {' '}
                ·{' '}
                {draftCount
                  ? `${drafts(draftCount)} ${draftCount === 1 ? 'goes' : 'go'} with your review`
                  : 'no draft comments'}
              </span>
            </>
          )}
        </span>
        <Button
          variant="ghost"
          size="md"
          className="qr-decide qr-decide--changes"
          aria-keyshortcuts="R"
          onClick={onRequestChanges}
        >
          Request changes <Key>R</Key>
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="qr-decide"
          aria-keyshortcuts="C"
          onClick={onComment}
        >
          Comment <Key>C</Key>
        </Button>
        {autoMergeEnabled ? (
          <Button
            variant="primary"
            size="md"
            className="qr-decide qr-decide--go"
            aria-keyshortcuts="A Enter"
            aria-disabled={approveIssue ? true : undefined}
            onClick={() => onApprove(false)}
          >
            Approve <Key>Enter</Key>
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="md"
              className="qr-decide"
              aria-keyshortcuts="A"
              aria-disabled={approveIssue ? true : undefined}
              onClick={() => onApprove(false)}
            >
              Approve <Key>A</Key>
            </Button>
            <Button
              variant="primary"
              size="md"
              className="qr-decide qr-decide--go"
              aria-keyshortcuts="Enter"
              aria-disabled={approveIssue ? true : undefined}
              leading={<GitMerge size={14} strokeWidth={2.25} aria-hidden="true" />}
              onClick={() => onApprove(true)}
            >
              Approve &amp; auto-merge <Key>Enter</Key>
            </Button>
          </>
        )}
      </div>
    );
  return (
    <div className="qr-foot" data-quick-review-actions="">
      <span className="qr-foot__stat">{drafts(draftCount)}</span>
      {progress.generatedLeft > 0 && (
        <Button variant="ghost" size="md" className="qr-skip-gen" onClick={onSkipGenerated}>
          Skip generated
        </Button>
      )}
      <Button
        variant="secondary"
        size="md"
        className="qr-prev"
        aria-keyshortcuts="P"
        disabled={!ready || !canGoBack}
        onClick={onPrevious}
      >
        Previous <Key>P</Key>
      </Button>
      <Button
        variant="secondary"
        size="md"
        className="qr-next"
        aria-keyshortcuts="N"
        disabled={!ready || !canGoOn}
        onClick={onNext}
      >
        Next file <Key>N</Key>
      </Button>
      <Button
        variant="primary"
        size="md"
        className="qr-mark"
        aria-keyshortcuts="V"
        disabled={!ready || !hasFile}
        onClick={onMark}
      >
        Mark reviewed &amp; next <Key>V</Key>
      </Button>
      <span className="qr-foot__divider" aria-hidden="true" />
      <Button
        variant="secondary"
        size="md"
        className="qr-foot__approve"
        aria-disabled="true"
        title={approveIssue ?? undefined}
      >
        Approve · {progress.left} left
      </Button>
    </div>
  );
}
