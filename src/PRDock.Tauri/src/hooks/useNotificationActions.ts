import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { performFixWithClaude } from '@/services/claude-launcher';
import {
  bypassMergePullRequest,
  mergePullRequest,
  submitReview,
} from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { useNotificationStore } from '@/stores/notification-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';

interface NotificationActionPayload {
  action: string;
  owner: string;
  repo: string;
  number: number;
}

/**
 * Listens for OS toast notification clicks and button actions,
 * then dispatches to the appropriate handler (open PR detail, merge, approve, bypass).
 */
export function useNotificationActions() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<NotificationActionPayload>('notification-action', (event) => {
          handleNotificationAction(event.payload);
        });
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      } catch {
        // ignore — not running in Tauri context
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}

async function handleNotificationAction(payload: NotificationActionPayload) {
  const { action, owner, repo, number } = payload;
  if (!owner || !repo || !number) return;

  switch (action) {
    case 'open':
      // Click on toast body — open the PR detail window
      await invoke('open_pr_detail_window', { owner, repo, number }).catch((err) =>
        console.error('Failed to open PR detail:', err),
      );
      break;

    case 'merge':
      await performMerge(owner, repo, number);
      break;

    case 'approve':
      await performApprove(owner, repo, number);
      break;

    case 'bypass':
      await performBypassMerge(owner, repo, number);
      break;

    case 'fix-with-claude':
      await performFix(owner, repo, number);
      break;

    case 'rerun':
      await performRerun(owner, repo, number);
      break;

    default:
      console.warn('Unknown notification action:', action);
  }
}

async function performMerge(owner: string, repo: string, number: number) {
  const client = getClient();
  if (!client) {
    showError('GitHub client not initialized');
    return;
  }
  try {
    await mergePullRequest(client, owner, repo, number, 'squash');
    showSuccess(`PR #${number} merged successfully`);
  } catch (err) {
    showError(`Failed to merge PR #${number}: ${err}`);
  }
}

async function performApprove(owner: string, repo: string, number: number) {
  const client = getClient();
  if (!client) {
    showError('GitHub client not initialized');
    return;
  }
  try {
    await submitReview(client, owner, repo, number, 'APPROVE');
    showSuccess(`PR #${number} approved`);
  } catch (err) {
    showError(`Failed to approve PR #${number}: ${err}`);
  }
}

async function performBypassMerge(owner: string, repo: string, number: number) {
  try {
    await bypassMergePullRequest(owner, repo, number);
    showSuccess(`PR #${number} bypass-merged`);
  } catch (err) {
    showError(`Failed to bypass merge PR #${number}: ${err}`);
  }
}

async function performFix(owner: string, repo: string, number: number) {
  // Find the PR's branch name from the store
  const prs = usePrStore.getState().pullRequests;
  const pr = prs.find(
    (p) =>
      p.pullRequest.repoOwner === owner &&
      p.pullRequest.repoName === repo &&
      p.pullRequest.number === number,
  );
  const branch = pr?.pullRequest.headRef ?? `pr-${number}`;
  const settings = useSettingsStore.getState().settings;

  try {
    await performFixWithClaude(owner, repo, number, branch, settings);
    showSuccess(`Claude is fixing PR #${number}`);
  } catch (err) {
    showError(`Failed to fix PR #${number}: ${err}`);
  }
}

async function performRerun(owner: string, repo: string, number: number) {
  // Find a failed check to rerun
  const prs = usePrStore.getState().pullRequests;
  const pr = prs.find(
    (p) =>
      p.pullRequest.repoOwner === owner &&
      p.pullRequest.repoName === repo &&
      p.pullRequest.number === number,
  );
  if (!pr) {
    showError(`PR #${number} not found`);
    return;
  }

  const failedCheck = pr.checks.find(
    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out',
  );
  if (!failedCheck) {
    showError('No failed checks to re-run');
    return;
  }

  const client = getClient();
  if (!client) {
    showError('GitHub client not initialized');
    return;
  }

  try {
    const { rerunWorkflow } = await import('@/services/github/checks');
    await rerunWorkflow(client, owner, repo, failedCheck.checkSuiteId);
    showSuccess(`Re-running checks for PR #${number}`);
  } catch (err) {
    showError(`Failed to re-run checks: ${err}`);
  }
}

function showSuccess(message: string) {
  useNotificationStore.getState().show({
    title: message,
    message: '',
    severity: 'success',
    actions: [],
  });
}

function showError(message: string) {
  useNotificationStore.getState().show({
    title: message,
    message: '',
    severity: 'error',
    actions: [],
  });
}
