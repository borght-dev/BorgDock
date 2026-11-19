import { ChevronUp, CircleCheck, GitMerge, Lock } from 'lucide-react';
import { type Ref, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import type { ReviewCommentDraft, ReviewProgress } from '@/services/quick-review';

/** A shortcut drawn on its button; the button's `aria-keyshortcuts` names it. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="qr-key" aria-hidden="true">
      {children}
    </kbd>
  );
}

function draftsLabel(count: number) {
  return `${count} draft ${count === 1 ? 'comment' : 'comments'}`;
}

function fileName(path: string) {
  return path.split('/').pop() ?? path;
}

/** "2 draft comments": opens the list of drafts, each with a Jump to its line. */
function Drafts({
  drafts,
  onJump,
}: {
  drafts: readonly ReviewCommentDraft[];
  onJump: (comment: ReviewCommentDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (drafts.length === 0) return <span className="qr-drafts qr-muted">No drafts</span>;
  return (
    <span
      ref={rootRef}
      className="qr-drafts"
      onKeyDown={(event) => {
        // Escape closes the list, not the walk.
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="qr-drafts__btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {draftsLabel(drafts.length)}
        <ChevronUp size={13} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {open && (
        <ul className="qr-drafts__list" aria-label="Draft comments">
          {drafts.map((comment) => (
            <li key={comment.id}>
              <code title={comment.path}>
                {fileName(comment.path)}:{comment.line}
              </code>
              <span>{comment.body.trim() || 'Empty draft'}</span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onJump(comment);
                }}
              >
                Jump
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

interface Props {
  progress: ReviewProgress;
  drafts: readonly ReviewCommentDraft[];
  ready: boolean;
  /** Why Approve is not possible, or null. */
  approveIssue: string | null;
  missingFileReview: boolean;
  /** The approve that merges too (auto-merge, or merge as admin), or null. */
  merge: { label: string; hint?: string } | null;
  canGoBack: boolean;
  canGoOn: boolean;
  hasFile: boolean;
  /** What Previous / Next step through: files, or commits in the Commits view. Default file. */
  unit?: 'file' | 'commit';
  /** The overall comment posted with the review. */
  body: string;
  onBodyChange: (body: string) => void;
  bodyRef?: Ref<HTMLTextAreaElement>;
  /** Why the chosen decision cannot be posted yet, e.g. a missing overall comment. */
  notice?: string;
  onJump: (comment: ReviewCommentDraft) => void;
  onSkipGenerated: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onMark: () => void;
  onApprove: (merging: boolean) => void;
  onRequestChanges: () => void;
  onComment: () => void;
  /**
   * My own PR: a walk-through, not a review. GitHub takes no approval or
   * request for changes from the author, so the bar offers Comment and Done.
   */
  own?: boolean;
  /** Ends the walk-through of my own PR and moves on; nothing is posted. */
  onDone?: () => void;
}

/**
 * The file walk's footer. The overall comment, Request changes and Comment
 * are there from the first file: a review that finds its blocker in the
 * second file does not have to mark the rest. While files are left it also
 * has Previous, Next file, and Mark reviewed & next. Once every file is
 * reviewed the stepping buttons go, and the approve that merges (auto-merge, or
 * merge as admin past failures that are not the PR's). Its primary button
 * (`.qr-decide--go`) takes focus when the last file is marked.
 */
export function QuickReviewDecisionBar({
  progress,
  drafts,
  ready,
  approveIssue,
  missingFileReview,
  merge,
  canGoBack,
  canGoOn,
  hasFile,
  unit = 'file',
  body,
  onBodyChange,
  bodyRef,
  notice,
  onJump,
  onSkipGenerated,
  onPrevious,
  onNext,
  onMark,
  onApprove,
  onRequestChanges,
  onComment,
  own = false,
  onDone,
}: Props) {
  const done = ready && progress.left === 0;
  const overallComment = (
    <textarea
      ref={bodyRef}
      className="qr-foot__comment"
      rows={1}
      aria-label="Overall comment"
      value={body}
      onChange={(e) => onBodyChange(e.target.value)}
      placeholder="Overall comment (optional)"
    />
  );
  const requestChanges = !own && (
    <Button
      variant="ghost"
      size="md"
      className="qr-decide qr-decide--changes"
      aria-keyshortcuts="R"
      onClick={onRequestChanges}
    >
      Request changes <Key>R</Key>
    </Button>
  );
  const comment = (
    <Button
      variant="secondary"
      size="md"
      className="qr-decide"
      aria-keyshortcuts="C"
      onClick={onComment}
    >
      Comment <Key>C</Key>
    </Button>
  );
  if (done && own) {
    return (
      <div className="qr-foot" data-done="true" data-quick-review-actions="">
        <span className="qr-foot__stat" data-tone={notice ? 'warning' : 'done'} role="status">
          {notice || (
            <>
              <CircleCheck size={16} strokeWidth={2.25} aria-hidden="true" />
              All {progress.toReview} files read
            </>
          )}
        </span>
        {overallComment}
        <Drafts drafts={drafts} onJump={onJump} />
        {comment}
        <Button
          variant="primary"
          size="md"
          className="qr-decide qr-decide--go"
          aria-keyshortcuts="Enter"
          onClick={onDone}
        >
          Done <Key>Enter</Key>
        </Button>
      </div>
    );
  }
  if (done) {
    const issue = notice || approveIssue;
    return (
      <div className="qr-foot" data-done="true" data-quick-review-actions="">
        <span className="qr-foot__stat" data-tone={issue ? 'warning' : 'done'} role="status">
          {issue || (
            <>
              <CircleCheck size={16} strokeWidth={2.25} aria-hidden="true" />
              All {progress.toReview} files reviewed
            </>
          )}
        </span>
        {overallComment}
        <Drafts drafts={drafts} onJump={onJump} />
        {requestChanges}
        {comment}
        {!merge ? (
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
              title={approveIssue ? undefined : merge.hint}
              leading={<GitMerge size={14} strokeWidth={2.25} aria-hidden="true" />}
              onClick={() => onApprove(true)}
            >
              {merge.label} <Key>Enter</Key>
            </Button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="qr-foot" data-quick-review-actions="">
      {notice && (
        <span className="qr-foot__stat" data-tone="warning" role="status">
          {notice}
        </span>
      )}
      {overallComment}
      <Drafts drafts={drafts} onJump={onJump} />
      {requestChanges}
      {comment}
      <span className="qr-foot__divider" aria-hidden="true" />
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
        Next {unit} <Key>N</Key>
      </Button>
      <Button
        variant="primary"
        size="md"
        className="qr-mark"
        aria-keyshortcuts="V"
        disabled={!ready || !hasFile}
        onClick={onMark}
      >
        {unit === 'commit' || own ? 'Mark read' : 'Mark reviewed'} &amp; next <Key>V</Key>
      </Button>
      <span className="qr-foot__divider" aria-hidden="true" />
      {own ? (
        <Button variant="secondary" size="md" className="qr-foot__done" onClick={onDone}>
          Done · {progress.left} unread
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="md"
          className="qr-foot__approve"
          aria-disabled={approveIssue ? true : undefined}
          aria-keyshortcuts={approveIssue ? undefined : 'A'}
          title={approveIssue ?? undefined}
          leading={
            approveIssue ? <Lock size={13} strokeWidth={2.25} aria-hidden="true" /> : undefined
          }
          onClick={() => onApprove(false)}
        >
          {missingFileReview ? `Approve · ${progress.left} left` : 'Approve'}
          {!approveIssue && (
            <>
              {' '}
              <Key>A</Key>
            </>
          )}
        </Button>
      )}
    </div>
  );
}
