import { useCallback, useState } from 'react';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import {
  bypassMergePr,
  checkoutPrBranch,
  closePr,
  mergePr,
  openPrInBrowser,
  rerunChecks,
  toggleDraftPr,
} from '@/services/pr-actions';
import { findRepoConfig } from '@/services/repo-lookup';
import { useNotificationStore } from '@/stores/notification-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import { parseError } from '@/utils/parse-error';

/**
 * Hook bundling the action handlers used by the sidebar PR card +
 * `PrContextMenu`. Each handler delegates to the canonical implementation
 * in `services/pr-actions.ts`; this file owns only the dialog-state plumbing
 * (confirmAction, contextMenu) and the React event glue.
 */
export function usePrCardActions(prWithChecks: PullRequestWithChecks) {
  const { pullRequest: pr, checks, failedCheckNames } = prWithChecks;
  const { fixWithClaude, monitorPr, resolveConflicts } = useClaudeActions();
  const showNotification = useNotificationStore((s) => s.show);
  const settings = useSettingsStore((s) => s.settings);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmAction, setConfirmAction] = useState<'close' | 'bypass' | 'draft' | null>(null);

  const repoConfig = findRepoConfig(settings.repos, pr.repoOwner, pr.repoName);
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
      if (!failedCheck) return;
      void rerunChecks({
        repoOwner: pr.repoOwner,
        repoName: pr.repoName,
        checkSuiteId: failedCheck.checkSuiteId,
      });
    },
    [failedCheck, pr.repoOwner, pr.repoName],
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
      void openPrInBrowser(pr.htmlUrl);
    },
    [pr.htmlUrl],
  );

  const handleCopyBranch = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void copyToClipboard(pr.headRef).then((ok) => {
        if (ok) {
          showNotification({
            title: 'Copied',
            message: pr.headRef,
            severity: 'success',
            actions: [],
          });
        } else {
          showError('Failed to copy branch', new Error('Clipboard unavailable'));
        }
      });
    },
    [pr.headRef, showNotification, showError],
  );

  const handleCheckout = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void checkoutPrBranch(
        { repoOwner: pr.repoOwner, repoName: pr.repoName, headRef: pr.headRef },
        { notifyOnSuccess: true },
      );
    },
    [pr.repoOwner, pr.repoName, pr.headRef],
  );

  const handleToggleDraft = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction('draft');
  }, []);

  const executeToggleDraft = useCallback(() => {
    void toggleDraftPr({
      repoOwner: pr.repoOwner,
      repoName: pr.repoName,
      number: pr.number,
      isDraft: pr.isDraft,
    });
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number, pr.isDraft]);

  const handleMerge = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void mergePr({
        repoOwner: pr.repoOwner,
        repoName: pr.repoName,
        number: pr.number,
        title: pr.title,
        htmlUrl: pr.htmlUrl,
      });
    },
    [pr.repoOwner, pr.repoName, pr.number, pr.title, pr.htmlUrl],
  );

  const handleBypassMerge = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction('bypass');
  }, []);

  const executeBypassMerge = useCallback(() => {
    void bypassMergePr({
      repoOwner: pr.repoOwner,
      repoName: pr.repoName,
      number: pr.number,
      title: pr.title,
      htmlUrl: pr.htmlUrl,
    });
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number, pr.title, pr.htmlUrl]);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction('close');
  }, []);

  const executeClose = useCallback(() => {
    void closePr({ repoOwner: pr.repoOwner, repoName: pr.repoName, number: pr.number });
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number]);

  const handleCopyErrors = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (failedCheckNames.length === 0) return;
      const markdown = [
        `## Failed checks for PR #${pr.number}`,
        '',
        ...failedCheckNames.map((name: string) => `- ${name}`),
      ].join('\n');
      void copyToClipboard(markdown).then((ok) => {
        if (ok) {
          showNotification({
            title: 'Copied to clipboard',
            message: `${failedCheckNames.length} failed check(s) copied`,
            severity: 'success',
            actions: [],
          });
        } else {
          showError('Failed to copy errors', new Error('Clipboard unavailable'));
        }
      });
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
