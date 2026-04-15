import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { FeatureBadge, InlineHint } from '@/components/onboarding';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { useWorkItemLinks } from '@/hooks/useWorkItemLinks';
import {
  bypassMergePullRequest,
  closePullRequest,
  mergePullRequest,
  postComment,
  submitReview,
  toggleDraft,
} from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { summaryKey, useSummaryStore } from '@/stores/summary-store';
import type { PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';
import { LinkedWorkItemBadge } from './LinkedWorkItemBadge';
import { MergeReadinessChecklist } from './MergeReadinessChecklist';

const log = createLogger('OverviewTab');

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

async function handleOpenInBrowser(url: string) {
  log.info('open-in-browser clicked', { url });
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    log.info('openUrl succeeded', { url });
  } catch (err) {
    log.error('openUrl failed', err, { url });
  }
}

async function handleCopyBranch(branch: string) {
  log.info('copy-branch clicked', { branch });
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(branch);
    log.info('clipboard writeText succeeded', { branch });
    return;
  } catch (err) {
    log.warn('tauri clipboard plugin failed, trying navigator.clipboard', {
      error: String(err),
    });
  }
  try {
    await navigator.clipboard?.writeText(branch);
    log.info('navigator.clipboard succeeded', { branch });
    return;
  } catch (err) {
    log.warn('navigator.clipboard failed, trying execCommand fallback', {
      error: String(err),
    });
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = branch;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('execCommand returned false');
    log.info('execCommand copy succeeded', { branch });
  } catch (err) {
    log.error('all clipboard strategies failed', err, { branch });
  }
}

export function OverviewTab({ pr }: OverviewTabProps) {
  const p = pr.pullRequest;
  const [actionStatus, setActionStatus] = useState('');
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewEvent, setReviewEvent] = useState<'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'>(
    'COMMENT',
  );
  const [commentBody, setCommentBody] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const { resolveConflicts } = useClaudeActions();
  const { workItemIds, workItems, isLoading: workItemsLoading } = useWorkItemLinks(p);
  const claudeApiKey = useSettingsStore((s) => s.settings.claudeApi.apiKey);
  const sKey = summaryKey(p.repoOwner, p.repoName, p.number);
  const cachedSummary = useSummaryStore((s) => s.getSummary(sKey, p.updatedAt));
  const summaryLoading = useSummaryStore((s) => s.isLoading(sKey));
  const [summaryError, setSummaryError] = useState('');
  const [summaryExpanded, setSummaryExpanded] = useState(true);

  const handleGenerateSummary = useCallback(async () => {
    useOnboardingStore.getState().dismissBadge('pr-summary');
    setSummaryError('');
    useSummaryStore.getState().setLoading(sKey, true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const text = await invoke<string>('generate_pr_summary', {
        title: p.title,
        body: p.body,
        changedFiles: [], // v1: no file list from this view
        branchName: p.headRef,
        labels: p.labels,
        additions: p.additions,
        deletions: p.deletions,
      });
      useSummaryStore.getState().setSummary(sKey, text, p.updatedAt);
    } catch (err) {
      useSummaryStore.getState().setLoading(sKey, false);
      setSummaryError(parseError(err).message);
    }
  }, [sKey, p]);

  const handleResolveConflicts = useCallback(async () => {
    setActionStatus('Launching Claude to resolve conflicts...');
    try {
      await resolveConflicts(pr);
      setActionStatus('Claude is resolving conflicts');
    } catch (err) {
      setActionStatus(`Failed: ${err}`);
    }
    setTimeout(() => setActionStatus(''), 5000);
  }, [pr, resolveConflicts]);

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
      await mergePullRequest(client, p.repoOwner, p.repoName, p.number, 'squash');
      setActionStatus('');
      setMergeSuccess(true);
    } catch (err) {
      setActionStatus(`Merge failed: ${err}`);
      setTimeout(() => setActionStatus(''), 5000);
    }
  }, [p.repoOwner, p.repoName, p.number]);

  const handleBypassMerge = useCallback(async () => {
    setActionStatus('Merging...');
    try {
      await bypassMergePullRequest(p.repoOwner, p.repoName, p.number);
      setActionStatus('');
      setMergeSuccess(true);
    } catch (err) {
      setActionStatus(`Bypass merge failed: ${err}`);
      setTimeout(() => setActionStatus(''), 5000);
    }
  }, [p.repoOwner, p.repoName, p.number]);

  const handleCloseConfirm = useCallback(() => setConfirmClose(true), []);

  const handleCloseExecute = useCallback(async () => {
    setConfirmClose(false);
    const client = getClient();
    if (!client) return;
    setActionStatus('Closing...');
    try {
      await closePullRequest(client, p.repoOwner, p.repoName, p.number);
      setActionStatus('PR closed');
    } catch (err) {
      setActionStatus(`Close failed: ${err}`);
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

      {/* AI Summary */}
      {claudeApiKey ? (
        <div className="space-y-2">
          {!cachedSummary && !summaryLoading && (
            <>
              <InlineHint
                hintId="pr-summary-generate"
                text="Generate a quick AI summary of this PR"
              />
              <button
                onClick={handleGenerateSummary}
                className="w-full rounded-md border border-[var(--color-purple-border,#6655D4)] bg-[var(--color-purple-soft,color-mix(in_srgb,#9384F7_8%,transparent))] px-3 py-1.5 text-xs font-medium text-[var(--color-purple,#9384F7)] hover:opacity-80 transition-opacity"
              >
                Summarize with AI
                <FeatureBadge badgeId="pr-summary" />
              </button>
            </>
          )}
          {summaryLoading && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              Generating summary...
            </div>
          )}
          {summaryError && (
            <div className="rounded-md border border-[var(--color-error-badge-border)] bg-[var(--color-error-badge-bg)] px-3 py-2 text-xs text-[var(--color-error-badge-fg)]">
              {summaryError}
              <button
                onClick={handleGenerateSummary}
                className="ml-2 text-[var(--color-accent)] hover:underline"
              >
                Retry
              </button>
            </div>
          )}
          {cachedSummary && (
            <div className="rounded-lg border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)]">
              <button
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-ghost)]"
              >
                AI Summary
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  {summaryExpanded ? <path d="m4 10 4-4 4 4" /> : <path d="m4 6 4 4 4-4" />}
                </svg>
              </button>
              {summaryExpanded && (
                <div className="border-t border-[var(--color-separator)] px-3 py-2">
                  <div className="markdown-body text-xs text-[var(--color-text-secondary)]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    >
                      {cachedSummary}
                    </ReactMarkdown>
                  </div>
                  <button
                    onClick={() => {
                      useSummaryStore.getState().invalidate(sKey);
                      handleGenerateSummary();
                    }}
                    className="mt-2 text-[10px] text-[var(--color-accent)] hover:underline"
                  >
                    Regenerate
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-[var(--color-text-ghost)]">
          Configure an API key in Settings to enable AI summaries
        </div>
      )}

      {/* Linked Work Items */}
      {workItemIds.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-ghost)]">
            Linked Work Items
          </div>
          {workItemIds.map((id) => (
            <LinkedWorkItemBadge
              key={id}
              workItemId={id}
              workItem={workItems.find((w) => w.id === id)}
            />
          ))}
          {workItemsLoading && (
            <div className="text-[10px] text-[var(--color-text-muted)]">Loading work items...</div>
          )}
        </div>
      )}

      {/* Action buttons — layered hierarchy: primary > secondary > ghost > danger */}
      <div className="flex flex-wrap gap-2">
        {isReady && (
          <button
            onClick={handleMerge}
            className="rounded-md bg-[var(--color-status-green)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:brightness-110 active:scale-[0.97] transition-all"
          >
            Squash &amp; Merge
          </button>
        )}
        <button
          onClick={() => handleOpenInBrowser(p.htmlUrl)}
          className="rounded-md bg-[var(--color-accent-subtle)] border border-[var(--color-purple-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-colors"
        >
          Open in Browser
        </button>
        <button
          onClick={() => handleCopyBranch(p.headRef)}
          className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          Copy Branch
        </button>
        <button
          onClick={handleCheckout}
          className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          Checkout
        </button>
        <button
          onClick={handleToggleDraft}
          className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          {p.isDraft ? 'Mark Ready' : 'Mark Draft'}
        </button>
        {p.mergeable === false && (
          <button
            onClick={handleResolveConflicts}
            className="rounded-md border border-[var(--color-purple-border)] bg-[var(--color-purple-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-purple)] hover:opacity-90 transition-opacity"
          >
            {'\u2726'} Resolve Conflicts
          </button>
        )}
        <button
          onClick={handleBypassMerge}
          className="rounded-md border-2 border-[var(--color-status-red)] border-dashed bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--color-action-danger-fg)] hover:bg-[var(--color-action-danger-bg)] transition-colors"
        >
          Bypass Merge
        </button>
        {p.state === 'open' && (
          <button
            onClick={handleCloseConfirm}
            className="rounded-md border border-[var(--color-status-red)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--color-action-danger-fg)] hover:bg-[var(--color-action-danger-bg)] transition-colors"
          >
            Close PR
          </button>
        )}
      </div>

      {/* Action status */}
      {actionStatus && !mergeSuccess && (
        <div className="flex items-center gap-2 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
          {actionStatus.includes('...') && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {actionStatus}
        </div>
      )}

      {/* Merge celebration */}
      {mergeSuccess && <MergeCelebration prNumber={p.number} title={p.title} />}

      {/* Close PR confirm dialog */}
      <ConfirmDialog
        isOpen={confirmClose}
        title="Close pull request?"
        message={`This will close PR #${p.number} without merging. You can reopen it later.`}
        confirmLabel="Close PR"
        variant="danger"
        onConfirm={handleCloseExecute}
        onCancel={() => setConfirmClose(false)}
      />

      {/* Description */}
      {p.body && (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
            {p.body}
          </ReactMarkdown>
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

function MergeCelebration({ prNumber, title }: { prNumber: number; title: string }) {
  return (
    <div className="merge-celebration">
      <div className="merge-celebration-inner">
        <div className="merge-celebration-icon">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle
              cx="20"
              cy="20"
              r="19"
              stroke="var(--color-status-green)"
              strokeWidth="2"
              fill="var(--color-action-success-bg)"
            />
            <path
              d="M12 20.5l5.5 5.5L28 15"
              stroke="var(--color-status-green)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="merge-checkmark"
            />
          </svg>
        </div>
        <div className="merge-celebration-title">PR #{prNumber} merged!</div>
        <div className="merge-celebration-subtitle">{title}</div>
      </div>
    </div>
  );
}
