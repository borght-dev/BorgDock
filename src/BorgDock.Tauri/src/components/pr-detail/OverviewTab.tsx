import clsx from 'clsx';
import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { FeatureBadge, InlineHint } from '@/components/onboarding';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button, Card } from '@/components/shared/primitives';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { useWorkItemLinks } from '@/hooks/useWorkItemLinks';
import {
  bypassMergePullRequest,
  closePullRequest,
  mergePullRequest,
  toggleDraft,
} from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { summaryKey, useSummaryStore } from '@/stores/summary-store';
import type { PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';
import { CheckoutFlow } from './CheckoutFlow';
import { LinkedWorkItemBadge } from './LinkedWorkItemBadge';
import { MergeReadinessChecklist } from './MergeReadinessChecklist';

const log = createLogger('OverviewTab');

interface OverviewTabProps {
  pr: PullRequestWithChecks;
}

const MergeIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="3" cy="8" r="1.5" />
    <circle cx="13" cy="3" r="1.5" />
    <circle cx="13" cy="13" r="1.5" />
    <path d="M3 9.5v3" />
    <path d="M3 6.5C3 6.5 5 5 8 5h3.5" />
    <path d="M3 9.5C3 9.5 5 11 8 11h3.5" />
  </svg>
);

const ExternalIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 2h5v5" />
    <path d="m14 2-7 7" />
    <path d="M4 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
  </svg>
);

const CopyIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
  </svg>
);

const BranchIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="4" cy="3.5" r="1.5" />
    <circle cx="4" cy="12.5" r="1.5" />
    <circle cx="12" cy="6.5" r="1.5" />
    <path d="M4 5v6" />
    <path d="M12 8c0 2-2 3-4 3s-4-.5-4-2" />
  </svg>
);

const EditIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 2.5 13.5 5 5 13.5l-3 .5.5-3z" />
  </svg>
);

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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmBypass, setConfirmBypass] = useState(false);
  const { resolveConflicts } = useClaudeActions();
  const { workItemIds, workItems, isLoading: workItemsLoading } = useWorkItemLinks(p);
  const claudeApiKey = useSettingsStore((s) => s.settings.claudeApi.apiKey);
  const repoConfig = useSettingsStore((s) =>
    s.settings.repos.find((r) => r.owner === p.repoOwner && r.name === p.repoName),
  );
  const repoPath = repoConfig?.worktreeBasePath ?? '';
  const worktreeSubfolder = repoConfig?.worktreeSubfolder ?? '.worktrees';
  const favoritePaths = repoConfig?.favoriteWorktreePaths;
  const favoritesOnlyDefault = useSettingsStore(
    (s) => s.settings.ui.worktreePaletteFavoritesOnly ?? false,
  );
  const windowsTerminalProfile = useSettingsStore(
    (s) => s.settings.ui.windowsTerminalProfile,
  );
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

  const handleCheckout = useCallback(() => {
    setCheckoutOpen((open) => !open);
  }, []);

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

  const handleBypassConfirm = useCallback(() => setConfirmBypass(true), []);

  const handleBypassExecute = useCallback(async () => {
    setConfirmBypass(false);
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

  const isReady =
    pr.overallStatus === 'green' &&
    !p.isDraft &&
    p.mergeable !== false &&
    p.reviewStatus === 'approved';

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Action buttons — primary action on the left, danger pair pushed right.
          Resolve Conflicts (purple-soft) and Bypass Merge (dashed danger) keep className
          overrides because Button's variant vocabulary doesn't cover those bespoke treatments. */}
      <div className="flex flex-wrap items-center gap-2">
        {isReady ? (
          <Button
            variant="primary"
            size="sm"
            leading={<MergeIcon />}
            onClick={handleMerge}
            data-overview-action="merge"
          >
            Merge
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            leading={<MergeIcon />}
            onClick={handleMerge}
            disabled
            data-overview-action="merge"
          >
            Merge
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          leading={<ExternalIcon />}
          onClick={() => handleOpenInBrowser(p.htmlUrl)}
          data-overview-action="browser"
        >
          Open in Browser
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leading={<CopyIcon />}
          onClick={() => handleCopyBranch(p.headRef)}
          data-overview-action="copy"
        >
          Copy Branch
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leading={<BranchIcon />}
          onClick={handleCheckout}
          aria-expanded={checkoutOpen}
          data-overview-action="checkout"
          className={clsx(
            checkoutOpen &&
              'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-purple-border)]',
          )}
        >
          Checkout
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leading={<EditIcon />}
          onClick={handleToggleDraft}
          data-overview-action="draft"
        >
          {p.isDraft ? 'Mark Ready' : 'Mark Draft'}
        </Button>
        {p.mergeable === false && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResolveConflicts}
            data-overview-action="resolve"
            className="border border-[var(--color-purple-border)] bg-[var(--color-purple-soft)] text-[var(--color-purple)]"
          >
            {'✦'} Resolve Conflicts
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={handleBypassConfirm}
            data-overview-action="bypass"
            className="border-2 border-dashed bg-transparent"
          >
            Bypass Merge
          </Button>
          {p.state === 'open' && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleCloseConfirm}
              data-overview-action="close"
              className="bg-transparent"
            >
              Close PR
            </Button>
          )}
        </div>
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
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateSummary}
                data-overview-action="summarize"
                className="w-full"
              >
                Summarize with AI
                <FeatureBadge badgeId="pr-summary" />
              </Button>
            </>
          )}
          {summaryLoading && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              Generating summary...
            </div>
          )}
          {summaryError && (
            <Card padding="sm" variant="default">
              <div className="text-xs text-[var(--color-error-badge-fg)]">
                {summaryError}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateSummary}
                  className="ml-2"
                >
                  Retry
                </Button>
              </div>
            </Card>
          )}
          {cachedSummary && (
            <Card padding="sm">
              <button
                type="button"
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]"
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
                <div className="mt-2 border-t border-[var(--color-separator)] pt-2">
                  <div className="markdown-body text-xs text-[var(--color-text-secondary)]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    >
                      {cachedSummary}
                    </ReactMarkdown>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      useSummaryStore.getState().invalidate(sKey);
                      handleGenerateSummary();
                    }}
                    className="mt-2"
                  >
                    Regenerate
                  </Button>
                </div>
              )}
            </Card>
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
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
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

      {/* Action status */}
      {actionStatus && !mergeSuccess && (
        <Card padding="sm" className="flex items-center gap-2">
          {actionStatus.includes('...') && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          <span className="text-xs text-[var(--color-text-secondary)]">{actionStatus}</span>
        </Card>
      )}

      {/* Checkout flow */}
      {checkoutOpen && (
        <CheckoutFlow
          branchName={p.headRef}
          repoBasePath={repoPath}
          worktreeSubfolder={worktreeSubfolder}
          favoritePaths={favoritePaths}
          favoritesOnlyDefault={favoritesOnlyDefault}
          windowsTerminalProfile={windowsTerminalProfile}
          onDismiss={() => setCheckoutOpen(false)}
        />
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

      {/* Bypass Merge confirm dialog */}
      <ConfirmDialog
        isOpen={confirmBypass}
        title="Bypass merge protections?"
        message={`This will merge PR #${p.number} bypassing branch protection rules. This action cannot be undone.`}
        confirmLabel="Bypass Merge"
        variant="danger"
        onConfirm={handleBypassExecute}
        onCancel={() => setConfirmBypass(false)}
      />

      {/* Description */}
      {p.body && (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
            {p.body}
          </ReactMarkdown>
        </div>
      )}

    </div>
  );
}

function MergeCelebration({ prNumber, title }: { prNumber: number; title: string }) {
  return (
    <Card
      padding="lg"
      className="text-center my-3 animate-[fadeSlideIn_0.3s_ease-out]"
      data-merge-celebration
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-2">
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
          className="animate-[merge-draw-check_0.4s_ease-out_forwards] [stroke-dasharray:30] [stroke-dashoffset:30]"
        />
      </svg>
      <div className="text-sm font-semibold text-[var(--color-text-primary)]">
        PR #{prNumber} merged!
      </div>
      <div className="text-xs text-[var(--color-text-secondary)]">{title}</div>
    </Card>
  );
}
