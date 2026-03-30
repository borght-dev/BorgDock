import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useRef } from 'react';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { rerunWorkflow } from '@/services/github/checks';
import { mergePullRequest } from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { useNotificationStore } from '@/stores/notification-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';

interface PrContextMenuProps {
  pr: PullRequestWithChecks;
  position: { x: number; y: number };
  onClose: () => void;
  onConfirmAction?: (action: 'close' | 'bypass' | 'draft') => void;
}

function Separator() {
  return <div className="h-px bg-[var(--color-separator)] my-1" />;
}

interface MenuItemProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

function MenuItem({ label, disabled, onClick }: MenuItemProps) {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 text-[13px] text-[var(--color-text-primary)] rounded transition-colors ${
        disabled
          ? 'opacity-40 pointer-events-none'
          : 'hover:bg-[var(--color-surface-hover)] cursor-default'
      }`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

export function PrContextMenu({ pr, position, onClose, onConfirmAction }: PrContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const settings = useSettingsStore((s) => s.settings);
  const { fixWithClaude, monitorPr } = useClaudeActions();
  const showNotification = useNotificationStore((s) => s.show);

  // Close on click outside
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const { pullRequest, failedCheckNames, overallStatus } = pr;
  const owner = pullRequest.repoOwner;
  const repo = pullRequest.repoName;

  // Find the repo config for worktree/checkout path
  const repoConfig = settings.repos.find((r) => r.owner === owner && r.name === repo);
  const repoPath = repoConfig?.worktreeBasePath || '';

  const hasFailingChecks = failedCheckNames.length > 0;
  const canMerge =
    !pullRequest.isDraft && overallStatus === 'green' && pullRequest.state === 'open';

  // Find a failed check's run ID for rerun (pick the first failed check's suite)
  const failedCheck = pr.checks.find(
    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out',
  );

  const handleAction = useCallback(
    (action: () => Promise<void>, errorTitle?: string) => {
      return () => {
        action().catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          showNotification({
            title: errorTitle ?? 'Action failed',
            message,
            severity: 'error',
            actions: [],
          });
        });
        onClose();
      };
    },
    [onClose, showNotification],
  );

  const handleOpenInGitHub = handleAction(async () => {
    await openUrl(pullRequest.htmlUrl);
  });

  const handleCopyBranch = handleAction(async () => {
    await writeText(pullRequest.headRef);
  });

  const handleCopyUrl = handleAction(async () => {
    await writeText(pullRequest.htmlUrl);
  });

  const handleCopyErrors = handleAction(async () => {
    if (failedCheckNames.length === 0) return;
    const markdown = [
      `## Failed checks for PR #${pullRequest.number}`,
      '',
      ...failedCheckNames.map((name) => `- ${name}`),
    ].join('\n');
    await writeText(markdown);
  });

  const handleCheckout = handleAction(async () => {
    if (!repoPath) return;
    await invoke('git_fetch', { repoPath, remote: 'origin' });
    await invoke('git_checkout', { repoPath, branch: pullRequest.headRef });
  });

  const handleToggleDraft = useCallback(() => {
    onClose();
    onConfirmAction?.('draft');
  }, [onClose, onConfirmAction]);

  const handleRerunFailed = handleAction(async () => {
    const client = getClient();
    if (!client || !failedCheck) return;
    await rerunWorkflow(client, owner, repo, failedCheck.checkSuiteId);
  }, 'Failed to re-run checks');

  const handleFixWithClaude = handleAction(async () => {
    await fixWithClaude(pr, failedCheckNames.length > 0 ? failedCheckNames : ['unknown'], [], [], '');
  }, 'Fix with Claude failed');

  const handleMonitorWithClaude = handleAction(async () => {
    await monitorPr(pr);
  }, 'Monitor with Claude failed');

  const handleMerge = handleAction(async () => {
    const client = getClient();
    if (!client) return;
    await mergePullRequest(client, owner, repo, pullRequest.number);
  }, 'Merge failed');

  const handleBypassMerge = useCallback(() => {
    onClose();
    onConfirmAction?.('bypass');
  }, [onClose, onConfirmAction]);

  const handleClose = useCallback(() => {
    onClose();
    onConfirmAction?.('close');
  }, [onClose, onConfirmAction]);

  const handleOpenInDetailWindow = handleAction(async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_pr_detail_window', {
      owner,
      repo,
      number: pullRequest.number,
    });
  });

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-lg border shadow-lg py-1"
      style={{
        left: position.x,
        top: position.y,
        backgroundColor: 'var(--color-modal-bg)',
        borderColor: 'var(--color-modal-border)',
      }}
    >
      <MenuItem label="Open in GitHub" onClick={handleOpenInGitHub} />
      <MenuItem label="Open in detail window" onClick={handleOpenInDetailWindow} />
      <MenuItem label="Copy branch name" onClick={handleCopyBranch} />
      <MenuItem label="Copy PR URL" onClick={handleCopyUrl} />
      <MenuItem
        label="Copy errors for Claude"
        onClick={handleCopyErrors}
        disabled={!hasFailingChecks}
      />

      <Separator />

      <MenuItem label="Checkout branch" onClick={handleCheckout} disabled={!repoPath} />
      <MenuItem
        label={pullRequest.isDraft ? 'Mark as ready' : 'Mark as draft'}
        onClick={handleToggleDraft}
      />

      <Separator />

      <MenuItem
        label="Rerun failed checks"
        onClick={handleRerunFailed}
        disabled={!hasFailingChecks || !failedCheck}
      />
      <MenuItem label="Fix with Claude" onClick={handleFixWithClaude} />
      <MenuItem label="Monitor with Claude" onClick={handleMonitorWithClaude} />

      <Separator />

      <MenuItem label="Merge" onClick={handleMerge} disabled={!canMerge} />
      <MenuItem
        label="Bypass merge (admin)"
        onClick={handleBypassMerge}
        disabled={pullRequest.state !== 'open'}
      />
      <MenuItem
        label="Close PR"
        onClick={handleClose}
        disabled={pullRequest.state !== 'open'}
      />
    </div>
  );
}
