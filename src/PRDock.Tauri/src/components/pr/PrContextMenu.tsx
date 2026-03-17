import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { PullRequestWithChecks } from '@/types';
import { useSettingsStore } from '@/stores/settings-store';
import { getClient } from '@/services/github/singleton';
import { mergePullRequest, toggleDraft } from '@/services/github/mutations';
import { rerunWorkflow } from '@/services/github/checks';
import { useClaudeActions } from '@/hooks/useClaudeActions';

interface PrContextMenuProps {
  pr: PullRequestWithChecks;
  position: { x: number; y: number };
  onClose: () => void;
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

export function PrContextMenu({ pr, position, onClose }: PrContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const settings = useSettingsStore((s) => s.settings);
  const { fixWithClaude, monitorPr } = useClaudeActions();

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
  const repoConfig = settings.repos.find(
    (r) => r.owner === owner && r.name === repo
  );
  const repoPath = repoConfig?.worktreeBasePath || '';

  const hasFailingChecks = failedCheckNames.length > 0;
  const canMerge =
    !pullRequest.isDraft &&
    overallStatus === 'green' &&
    pullRequest.state === 'open';

  // Find a failed check's run ID for rerun (pick the first failed check's suite)
  const failedCheck = pr.checks.find(
    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out'
  );

  const handleAction = useCallback(
    (action: () => Promise<void>) => {
      return () => {
        action().catch((err) => console.error('Context menu action failed:', err));
        onClose();
      };
    },
    [onClose]
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

  const handleToggleDraft = handleAction(async () => {
    const client = getClient();
    if (!client) return;
    await toggleDraft(
      client,
      owner,
      repo,
      pullRequest.number,
      !pullRequest.isDraft
    );
  });

  const handleRerunFailed = handleAction(async () => {
    const client = getClient();
    if (!client || !failedCheck) return;
    await rerunWorkflow(client, owner, repo, failedCheck.checkSuiteId);
  });

  const handleFixWithClaude = handleAction(async () => {
    const firstFailedName = failedCheckNames[0] ?? 'unknown';
    await fixWithClaude(pr, firstFailedName, [], [], '');
  });

  const handleMonitorWithClaude = handleAction(async () => {
    await monitorPr(pr);
  });

  const handleMerge = handleAction(async () => {
    const client = getClient();
    if (!client) return;
    await mergePullRequest(client, owner, repo, pullRequest.number);
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
      <MenuItem label="Copy branch name" onClick={handleCopyBranch} />
      <MenuItem label="Copy PR URL" onClick={handleCopyUrl} />
      <MenuItem
        label="Copy errors for Claude"
        onClick={handleCopyErrors}
        disabled={!hasFailingChecks}
      />

      <Separator />

      <MenuItem
        label="Checkout branch"
        onClick={handleCheckout}
        disabled={!repoPath}
      />
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
      <MenuItem
        label="Monitor with Claude"
        onClick={handleMonitorWithClaude}
      />

      <Separator />

      <MenuItem
        label="Merge"
        onClick={handleMerge}
        disabled={!canMerge}
      />
    </div>
  );
}
