import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { rerunWorkflow } from '@/services/github/checks';
import {
  bypassMergePullRequest,
  closePullRequest,
  mergePullRequest,
  toggleDraft,
} from '@/services/github/mutations';
import type { MergeMethod } from '@/services/github/repo';
import { getClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { celebrateMerge } from '@/services/merge-celebration';
import { findRepoConfig } from '@/services/repo-lookup';
import { useNotificationStore } from '@/stores/notification-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { parseError } from '@/utils/parse-error';

const log = createLogger('pr-actions');

/**
 * Single source of truth for PR action workflows. Every UI surface
 * (sidebar buttons, flyout primary button, flyout context menu, focus-mode
 * MergeToast, PR detail Overview tab) routes through these functions, so
 * the celebration / refresh / error-reporting decisions can't drift.
 *
 * Functions return `true` on success, `false` on failure (after invoking
 * the error sink). Callers that need richer state (e.g. OverviewTab's
 * "Merging..." status text) should override `onError` / `onSuccess`.
 */

export interface PrRef {
  repoOwner: string;
  repoName: string;
  number: number;
  title: string;
  htmlUrl: string;
}

export interface ActionOpts {
  /** Override default error reporter. Default: notification toast. */
  onError?: (title: string, err: unknown) => void;
  /** Override default success reporter. Default: notification toast. */
  onSuccess?: (title: string, message: string) => void;
}

export interface MergePrOpts extends ActionOpts {
  /** Pin a method (e.g. 'squash'). Omitted ⇒ resolved against repo config. */
  method?: MergeMethod;
}

export interface CheckoutOpts extends ActionOpts {
  /** When true, fire a "Checked out X" success toast. Default false. */
  notifyOnSuccess?: boolean;
}

const TERMINAL_REFRESH_DELAY_MS = 1500;

function defaultErrorSink(title: string, err: unknown): void {
  useNotificationStore.getState().show({
    title,
    message: parseError(err).message,
    severity: 'error',
    actions: [],
  });
}

function defaultSuccessSink(title: string, message: string): void {
  useNotificationStore.getState().show({
    title,
    message,
    severity: 'success',
    actions: [],
  });
}

function reportError(title: string, err: unknown, opts?: ActionOpts): void {
  log.warn(title, { error: String(err) });
  (opts?.onError ?? defaultErrorSink)(title, err);
}

function reportSuccess(title: string, message: string, opts?: ActionOpts): void {
  (opts?.onSuccess ?? defaultSuccessSink)(title, message);
}

/**
 * Schedule a single-PR refresh after the celebration has time to land.
 * Used by mutations that move the PR off the open list (merge / bypass /
 * close) so the sidebar reflects the new state without waiting for the
 * next polling tick.
 */
function scheduleTerminalRefresh(repoOwner: string, repoName: string, number: number): void {
  setTimeout(() => {
    void usePrStore.getState().refreshPr(repoOwner, repoName, number);
  }, TERMINAL_REFRESH_DELAY_MS);
}

// ── PR mutations ─────────────────────────────────────────────────────────

export async function mergePr(pr: PrRef, opts?: MergePrOpts): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await mergePullRequest(client, pr.repoOwner, pr.repoName, pr.number, opts?.method);
    celebrateMerge(pr);
    scheduleTerminalRefresh(pr.repoOwner, pr.repoName, pr.number);
    return true;
  } catch (err) {
    reportError('Merge failed', err, opts);
    return false;
  }
}

export async function bypassMergePr(pr: PrRef, opts?: ActionOpts): Promise<boolean> {
  try {
    await bypassMergePullRequest(pr.repoOwner, pr.repoName, pr.number);
    celebrateMerge(pr);
    scheduleTerminalRefresh(pr.repoOwner, pr.repoName, pr.number);
    return true;
  } catch (err) {
    reportError('Bypass merge failed', err, opts);
    return false;
  }
}

export interface ClosePrInput {
  repoOwner: string;
  repoName: string;
  number: number;
}

export async function closePr(pr: ClosePrInput, opts?: ActionOpts): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await closePullRequest(client, pr.repoOwner, pr.repoName, pr.number);
    scheduleTerminalRefresh(pr.repoOwner, pr.repoName, pr.number);
    return true;
  } catch (err) {
    reportError('Close PR failed', err, opts);
    return false;
  }
}

export interface ToggleDraftInput {
  repoOwner: string;
  repoName: string;
  number: number;
  /** Current draft state. The function flips it. */
  isDraft: boolean;
}

export async function toggleDraftPr(
  pr: ToggleDraftInput,
  opts?: ActionOpts,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await toggleDraft(client, pr.repoOwner, pr.repoName, pr.number, !pr.isDraft);
    // toggleDraft keeps the PR on the open list, so refresh immediately
    // to update pills / labels.
    void usePrStore.getState().refreshPr(pr.repoOwner, pr.repoName, pr.number);
    return true;
  } catch (err) {
    reportError(pr.isDraft ? 'Mark ready failed' : 'Mark draft failed', err, opts);
    return false;
  }
}

export interface RerunChecksInput {
  repoOwner: string;
  repoName: string;
  /** A check-suite ID for one of the failed checks — GitHub re-runs the suite. */
  checkSuiteId: number;
}

export async function rerunChecks(
  input: RerunChecksInput,
  opts?: ActionOpts,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await rerunWorkflow(client, input.repoOwner, input.repoName, input.checkSuiteId);
    return true;
  } catch (err) {
    reportError('Failed to re-run checks', err, opts);
    return false;
  }
}

// ── Local git workflow ──────────────────────────────────────────────────

export interface CheckoutInput {
  repoOwner: string;
  repoName: string;
  headRef: string;
}

/**
 * `git fetch origin && git checkout <headRef>` for the worktree base path
 * of the given repo. Three call sites used to inline this pair with three
 * different success/error UX. The repo lookup is case-insensitive — the
 * sidebar-only paths used to silently no-op when settings had a different
 * case than what the API returned.
 */
export async function checkoutPrBranch(
  input: CheckoutInput,
  opts?: CheckoutOpts,
): Promise<boolean> {
  const repoConfig = findRepoConfig(
    useSettingsStore.getState().settings.repos,
    input.repoOwner,
    input.repoName,
  );
  const repoPath = repoConfig?.worktreeBasePath;
  if (!repoPath) {
    reportError(
      'Checkout failed',
      new Error(`No worktree base path configured for ${input.repoOwner}/${input.repoName}`),
      opts,
    );
    return false;
  }
  try {
    await invoke('git_fetch', { repoPath, remote: 'origin' });
    await invoke('git_checkout', { repoPath, branch: input.headRef });
    if (opts?.notifyOnSuccess) {
      reportSuccess('Checked out', input.headRef, opts);
    }
    return true;
  } catch (err) {
    reportError('Checkout failed', err, opts);
    return false;
  }
}

// ── Browser ────────────────────────────────────────────────────────────

export async function openPrInBrowser(htmlUrl: string, opts?: ActionOpts): Promise<boolean> {
  try {
    await openUrl(htmlUrl);
    return true;
  } catch (err) {
    reportError('Failed to open URL', err, opts);
    return false;
  }
}
