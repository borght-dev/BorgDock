import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import {
  checkoutPrBranch,
  mergePr,
  openPrInBrowser,
  rerunChecks,
} from '@/services/pr-actions';
import { findRepoConfig } from '@/services/repo-lookup';
import { openPrDetail } from '@/services/windows';
import { useNotificationStore } from '@/stores/notification-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import { parseError } from '@/utils/parse-error';

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
  // Adjusted position after measuring — clamps the menu inside the viewport
  // and flips it to the left/up of the cursor when there isn't room to the
  // right/below. Starts at the requested position so the first paint is close.
  const [resolvedPos, setResolvedPos] = useState(position);
  const settings = useSettingsStore((s) => s.settings);
  const { fixWithClaude, monitorPr, getMonitorPrompt, getFixPrompt } = useClaudeActions();
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

  // Clamp the menu inside the viewport. The trigger sits at the right edge of
  // the card row, so the natural anchor often overflows on the right.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;
    if (x + rect.width + margin > vw) x = Math.max(margin, vw - rect.width - margin);
    if (y + rect.height + margin > vh) y = Math.max(margin, vh - rect.height - margin);
    setResolvedPos({ x, y });
  }, [position.x, position.y]);

  const { pullRequest, failedCheckNames, overallStatus } = pr;
  const owner = pullRequest.repoOwner;
  const repo = pullRequest.repoName;

  // Find the repo config for worktree/checkout path
  const repoConfig = findRepoConfig(settings.repos, owner, repo);
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
          showNotification({
            title: errorTitle ?? 'Action failed',
            message: parseError(err).message,
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
    await openPrInBrowser(pullRequest.htmlUrl);
  });

  const handleCopyBranch = handleAction(async () => {
    await copyToClipboard(pullRequest.headRef);
  });

  const handleCopyUrl = handleAction(async () => {
    await copyToClipboard(pullRequest.htmlUrl);
  });

  const handleCopyErrors = handleAction(async () => {
    if (failedCheckNames.length === 0) return;
    const markdown = [
      `## Failed checks for PR #${pullRequest.number}`,
      '',
      ...failedCheckNames.map((name) => `- ${name}`),
    ].join('\n');
    await copyToClipboard(markdown);
  });

  const handleCheckout = handleAction(async () => {
    await checkoutPrBranch({
      repoOwner: owner,
      repoName: repo,
      headRef: pullRequest.headRef,
    });
  });

  const handleToggleDraft = useCallback(() => {
    onClose();
    onConfirmAction?.('draft');
  }, [onClose, onConfirmAction]);

  const handleRerunFailed = handleAction(async () => {
    if (!failedCheck) return;
    await rerunChecks({ repoOwner: owner, repoName: repo, checkSuiteId: failedCheck.checkSuiteId });
  }, 'Failed to re-run checks');

  const handleFixWithClaude = handleAction(async () => {
    await fixWithClaude(
      pr,
      failedCheckNames.length > 0 ? failedCheckNames : ['unknown'],
      [],
      [],
      '',
    );
  }, 'Fix with Claude failed');

  const handleMonitorWithClaude = handleAction(async () => {
    await monitorPr(pr);
  }, 'Monitor with Claude failed');

  const handleCopyMonitorPrompt = handleAction(async () => {
    const prompt = getMonitorPrompt(pr);
    if (!prompt) throw new Error('Repo not configured in settings');
    await copyToClipboard(prompt);
  }, 'Failed to copy monitor prompt');

  const handleCopyFixPrompt = handleAction(async () => {
    const prompt = getFixPrompt(pr, failedCheckNames.length > 0 ? failedCheckNames : ['unknown']);
    if (!prompt) throw new Error('Repo not configured in settings');
    await copyToClipboard(prompt);
  }, 'Failed to copy fix prompt');

  const handleMerge = handleAction(async () => {
    await mergePr({
      repoOwner: owner,
      repoName: repo,
      number: pullRequest.number,
      title: pullRequest.title,
      htmlUrl: pullRequest.htmlUrl,
    });
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
    await openPrDetail({ owner, repo, number: pullRequest.number });
  });

  // style: context menu anchor coords from right-click event position — dynamic pixel values
  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-lg border shadow-lg py-1"
      style={{
        left: resolvedPos.x,
        top: resolvedPos.y,
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
      <MenuItem label="Copy monitor prompt" onClick={handleCopyMonitorPrompt} />
      <MenuItem
        label="Copy fix prompt"
        onClick={handleCopyFixPrompt}
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
      <MenuItem label="Close PR" onClick={handleClose} disabled={pullRequest.state !== 'open'} />
    </div>
  );
}
