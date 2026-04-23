import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useState } from 'react';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { rerunWorkflow } from '@/services/github/checks';
import {
  bypassMergePullRequest,
  closePullRequest,
  mergePullRequest,
  toggleDraft,
} from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { useNotificationStore } from '@/stores/notification-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';

export function usePrCardActions(prWithChecks: PullRequestWithChecks) {
  const { pullRequest: pr, checks, failedCheckNames } = prWithChecks;
  const { fixWithClaude, monitorPr, resolveConflicts } = useClaudeActions();
  const showNotification = useNotificationStore((s) => s.show);
  const settings = useSettingsStore((s) => s.settings);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmAction, setConfirmAction] = useState<'close' | 'bypass' | 'draft' | null>(null);

  const repoConfig = settings.repos.find((r) => r.owner === pr.repoOwner && r.name === pr.repoName);
  const repoPath = repoConfig?.worktreeBasePath || '';

  const failedCheck = checks.find(
    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out',
  );

  const showError = useCallback(
    (title: string, err: unknown) => {
      showNotification({ title, message: parseError(err).message, severity: 'error', actions: [] });
    },
    [showNotification],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleRerun = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const client = getClient();
      if (!client || !failedCheck) return;
      rerunWorkflow(client, pr.repoOwner, pr.repoName, failedCheck.checkSuiteId).catch((err) =>
        showError('Failed to re-run checks', err),
      );
    },
    [failedCheck, pr.repoOwner, pr.repoName, showError],
  );

  const handleFix = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      fixWithClaude(
        prWithChecks,
        failedCheckNames.length > 0 ? failedCheckNames : ['unknown'],
        [],
        [],
        '',
      ).catch((err) => showError('Fix with Claude failed', err));
    },
    [prWithChecks, failedCheckNames, fixWithClaude, showError],
  );

  const handleMonitor = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      monitorPr(prWithChecks).catch((err) => showError('Monitor with Claude failed', err));
    },
    [prWithChecks, monitorPr, showError],
  );

  const handleResolveConflicts = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      resolveConflicts(prWithChecks).catch((err) => showError('Resolve conflicts failed', err));
    },
    [prWithChecks, resolveConflicts, showError],
  );

  const handleOpenInBrowser = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openUrl(pr.htmlUrl).catch((err) => showError('Failed to open URL', err));
    },
    [pr.htmlUrl, showError],
  );

  const handleCopyBranch = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      writeText(pr.headRef)
        .then(() =>
          showNotification({
            title: 'Copied',
            message: pr.headRef,
            severity: 'success',
            actions: [],
          }),
        )
        .catch((err) => showError('Failed to copy branch', err));
    },
    [pr.headRef, showNotification, showError],
  );

  const handleCheckout = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!repoPath) return;
      invoke('git_fetch', { repoPath, remote: 'origin' })
        .then(() => invoke('git_checkout', { repoPath, branch: pr.headRef }))
        .then(() =>
          showNotification({
            title: 'Checked out',
            message: pr.headRef,
            severity: 'success',
            actions: [],
          }),
        )
        .catch((err) => showError('Checkout failed', err));
    },
    [repoPath, pr.headRef, showNotification, showError],
  );

  const handleToggleDraft = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction('draft');
  }, []);

  const executeToggleDraft = useCallback(() => {
    const client = getClient();
    if (!client) return;
    toggleDraft(client, pr.repoOwner, pr.repoName, pr.number, !pr.isDraft).catch((err) =>
      showError('Failed to toggle draft', err),
    );
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number, pr.isDraft, showError]);

  const handleMerge = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const client = getClient();
      if (!client) return;
      mergePullRequest(client, pr.repoOwner, pr.repoName, pr.number).catch((err) =>
        showError('Merge failed', err),
      );
    },
    [pr.repoOwner, pr.repoName, pr.number, showError],
  );

  const handleBypassMerge = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction('bypass');
  }, []);

  const executeBypassMerge = useCallback(() => {
    bypassMergePullRequest(pr.repoOwner, pr.repoName, pr.number).catch((err) =>
      showError('Bypass merge failed', err),
    );
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number, showError]);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction('close');
  }, []);

  const executeClose = useCallback(() => {
    const client = getClient();
    if (!client) return;
    closePullRequest(client, pr.repoOwner, pr.repoName, pr.number).catch((err) =>
      showError('Close PR failed', err),
    );
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number, showError]);

  const handleCopyErrors = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (failedCheckNames.length === 0) return;
      const markdown = [
        `## Failed checks for PR #${pr.number}`,
        '',
        ...failedCheckNames.map((name: string) => `- ${name}`),
      ].join('\n');
      writeText(markdown)
        .then(() =>
          showNotification({
            title: 'Copied to clipboard',
            message: `${failedCheckNames.length} failed check(s) copied`,
            severity: 'success',
            actions: [],
          }),
        )
        .catch((err) => showError('Failed to copy errors', err));
    },
    [failedCheckNames, pr.number, showNotification, showError],
  );

  return {
    // State
    contextMenu,
    setContextMenu,
    confirmAction,
    setConfirmAction,
    repoPath,
    failedCheck,

    // Handlers
    handleContextMenu,
    handleRerun,
    handleFix,
    handleMonitor,
    handleResolveConflicts,
    handleOpenInBrowser,
    handleCopyBranch,
    handleCheckout,
    handleToggleDraft,
    executeToggleDraft,
    handleMerge,
    handleBypassMerge,
    executeBypassMerge,
    handleClose,
    executeClose,
    handleCopyErrors,
  };
}
