import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  mergePullRequest,
  postComment,
  submitReview,
  toggleDraft,
} from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import type { PullRequestWithChecks } from '@/types';
import { MergeReadinessChecklist } from './MergeReadinessChecklist';

interface OverviewTabProps {
  pr: PullRequestWithChecks;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAge(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function handleOpenInBrowser(url: string) {
  import('@tauri-apps/plugin-opener')
    .then(({ openUrl }) => {
      openUrl(url).catch(console.error);
    })
    .catch(() => {
      window.open(url, '_blank');
    });
}

function handleCopyBranch(branch: string) {
  import('@tauri-apps/plugin-clipboard-manager')
    .then(({ writeText }) => {
      writeText(branch).catch(console.error);
    })
    .catch(() => {
      navigator.clipboard.writeText(branch).catch(console.error);
    });
}

export function OverviewTab({ pr }: OverviewTabProps) {
  const p = pr.pullRequest;
  const [actionStatus, setActionStatus] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewEvent, setReviewEvent] = useState<'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'>(
    'COMMENT',
  );
  const [commentBody, setCommentBody] = useState('');

  const handleCheckout = useCallback(async () => {
    setActionStatus('Checking out...');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('git_fetch', { repoPath: '.', remote: 'origin' });
      await invoke('git_checkout', { repoPath: '.', branch: p.headRef });
      setActionStatus('Checked out!');
    } catch (err) {
      setActionStatus(`Checkout failed: ${err}`);
    }
    setTimeout(() => setActionStatus(''), 3000);
  }, [p.headRef]);

  const handleMerge = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setActionStatus('Merging...');
    try {
      await mergePullRequest(client, p.repoOwner, p.repoName, p.number);
      setActionStatus('Merged!');
    } catch (err) {
      setActionStatus(`Merge failed: ${err}`);
    }
    setTimeout(() => setActionStatus(''), 3000);
  }, [p.repoOwner, p.repoName, p.number]);

  const handleToggleDraft = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setActionStatus(p.isDraft ? 'Marking ready...' : 'Marking draft...');
    try {
      await toggleDraft(client, p.repoOwner, p.repoName, p.number, !p.isDraft);
      setActionStatus(p.isDraft ? 'Marked ready!' : 'Marked draft!');
    } catch (err) {
      setActionStatus(`Failed: ${err}`);
    }
    setTimeout(() => setActionStatus(''), 3000);
  }, [p.repoOwner, p.repoName, p.number, p.isDraft]);

  const handleSubmitReview = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setActionStatus('Submitting review...');
    try {
      await submitReview(
        client,
        p.repoOwner,
        p.repoName,
        p.number,
        reviewEvent,
        reviewBody || undefined,
      );
      setActionStatus('Review submitted!');
      setReviewBody('');
    } catch (err) {
      setActionStatus(`Review failed: ${err}`);
    }
    setTimeout(() => setActionStatus(''), 3000);
  }, [p.repoOwner, p.repoName, p.number, reviewEvent, reviewBody]);

  const handlePostComment = useCallback(async () => {
    const client = getClient();
    if (!client || !commentBody.trim()) return;
    setActionStatus('Posting comment...');
    try {
      await postComment(client, p.repoOwner, p.repoName, p.number, commentBody);
      setActionStatus('Comment posted!');
      setCommentBody('');
    } catch (err) {
      setActionStatus(`Comment failed: ${err}`);
    }
    setTimeout(() => setActionStatus(''), 3000);
  }, [p.repoOwner, p.repoName, p.number, commentBody]);

  const isReady =
    pr.overallStatus === 'green' &&
    !p.isDraft &&
    p.mergeable !== false &&
    p.reviewStatus === 'approved';

  return (
    <div className="p-3 space-y-4">
      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
        <span>
          by <strong className="text-[var(--color-text-secondary)]">{p.authorLogin}</strong>
        </span>
        <span>{formatDate(p.createdAt)}</span>
        <span title="Age">({formatAge(p.createdAt)} old)</span>
        <div className="flex items-center gap-1">
          <span className="rounded border border-[var(--color-branch-badge-border)] bg-[var(--color-branch-badge-bg)] px-1.5 py-0.5 font-mono text-[10px]">
            {p.headRef}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="m5 8 6 0M9 5l3 3-3 3" />
          </svg>
          <span className="rounded border border-[var(--color-target-badge-border)] bg-[var(--color-target-badge-bg)] px-1.5 py-0.5 font-mono text-[10px]">
            {p.baseRef}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
        <span title="Additions" className="text-[var(--color-status-green)]">
          +{p.additions}
        </span>
        <span title="Deletions" className="text-[var(--color-status-red)]">
          -{p.deletions}
        </span>
        <span>
          {p.changedFiles} file{p.changedFiles !== 1 ? 's' : ''}
        </span>
        <span>
          {p.commitCount} commit{p.commitCount !== 1 ? 's' : ''}
        </span>
        <span>
          {p.commentCount} comment{p.commentCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Merge status */}
      <div className="flex items-center gap-2">
        {p.mergeable === false ? (
          <span className="rounded bg-[var(--color-error-badge-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-error-badge-fg)] border border-[var(--color-error-badge-border)]">
            Merge Conflicts
          </span>
        ) : p.mergeable === true ? (
          <span className="rounded bg-[var(--color-success-badge-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-success-badge-fg)] border border-[var(--color-success-badge-border)]">
            Mergeable
          </span>
        ) : null}
        {p.isDraft && (
          <span className="rounded bg-[var(--color-draft-badge-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-draft-badge-fg)] border border-[var(--color-draft-badge-border)]">
            Draft
          </span>
        )}
      </div>

      {/* Merge Readiness Checklist */}
      <MergeReadinessChecklist pr={pr} />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleOpenInBrowser(p.htmlUrl)}
          className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-action-secondary-fg)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          Open in Browser
        </button>
        <button
          onClick={() => handleCopyBranch(p.headRef)}
          className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          Copy Branch
        </button>
        <button
          onClick={handleCheckout}
          className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          Checkout
        </button>
        <button
          onClick={handleToggleDraft}
          className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          {p.isDraft ? 'Mark Ready' : 'Mark Draft'}
        </button>
        {isReady && (
          <button
            onClick={handleMerge}
            className="rounded-md bg-[var(--color-action-success-bg)] px-3 py-1.5 text-xs font-medium text-[var(--color-status-green)] hover:opacity-90 transition-opacity"
          >
            Merge
          </button>
        )}
      </div>

      {/* Action status */}
      {actionStatus && (
        <div className="text-[11px] text-[var(--color-text-muted)]">{actionStatus}</div>
      )}

      {/* Description */}
      {p.body && (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body}</ReactMarkdown>
        </div>
      )}

      {/* Review submission */}
      <div className="space-y-2 border-t border-[var(--color-separator)] pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-ghost)]">
          Submit Review
        </div>
        <textarea
          value={reviewBody}
          onChange={(e) => setReviewBody(e.target.value)}
          placeholder="Review comment (optional for APPROVE)"
          rows={2}
          className="w-full resize-none rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
        />
        <div className="flex items-center gap-2">
          <select
            value={reviewEvent}
            onChange={(e) => setReviewEvent(e.target.value as typeof reviewEvent)}
            className="rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          >
            <option value="COMMENT">Comment</option>
            <option value="APPROVE">Approve</option>
            <option value="REQUEST_CHANGES">Request Changes</option>
          </select>
          <button
            onClick={handleSubmitReview}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-foreground)] hover:opacity-90 transition-opacity"
          >
            Submit
          </button>
        </div>
      </div>

      {/* Quick comment */}
      <div className="space-y-2 border-t border-[var(--color-separator)] pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-ghost)]">
          Post Comment
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlePostComment();
              }
            }}
          />
          <button
            onClick={handlePostComment}
            disabled={!commentBody.trim()}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-foreground)] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
