import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isFailedRun } from '@/services/github/check-runs';
import { getCheckRunsForRef, rerunFailedChecks } from '@/services/github/checks';
import {
  bypassMergePullRequest,
  closePullRequest,
  mergePullRequest,
  toggleDraft,
} from '@/services/github/mutations';
import type { MergeMethod } from '@/services/github/repo';
import { getClientForRepo } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { celebrateMerge } from '@/services/merge-celebration';
import { sendOsNotification } from '@/services/notification';
import { findRepoConfig } from '@/services/repo-lookup';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { toastError } from '@/stores/toast-store';
import type { CheckRun, PullRequestWithChecks } from '@/types';
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
  void sendOsNotification({
    title,
    body: parseError(err).message,
    severity: 'error',
  }).catch(() => {});
}

function defaultSuccessSink(title: string, message: string): void {
  void sendOsNotification({
    title,
    body: message,
    severity: 'success',
  }).catch(() => {});
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
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
  if (!client) return false;
  try {
    await mergePullRequest(client, pr.repoOwner, pr.repoName, pr.number, opts?.method);
    usePrStore.getState().optimisticallyMarkMerged(pr.repoOwner, pr.repoName, pr.number);
    celebrateMerge(pr);
    scheduleTerminalRefresh(pr.repoOwner, pr.repoName, pr.number);
    return true;
  } catch (err) {
    reportError('Merge failed', err, opts);
    return false;
  }
}

/**
 * Merge from the Workbench row's action slot or the detail view's action bar:
 * a failure shows as an in-window toast (`stores/toast-store`) next to the
 * button that started it. Success is announced once, by `celebrateMerge`
 * (the OS notification, which honours the notification settings); the
 * button itself flips to "Merged".
 */
export async function mergePrWithToast(pr: PrRef, opts?: MergePrOpts): Promise<boolean> {
  return mergePr(pr, { onError: toastError, ...opts });
}

export async function bypassMergePr(pr: PrRef, opts?: ActionOpts): Promise<boolean> {
  try {
    await bypassMergePullRequest(pr.repoOwner, pr.repoName, pr.number);
    usePrStore.getState().optimisticallyMarkMerged(pr.repoOwner, pr.repoName, pr.number);
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
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
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

export async function toggleDraftPr(pr: ToggleDraftInput, opts?: ActionOpts): Promise<boolean> {
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
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
  /**
   * The PR's check runs (or just the failed ones), when the caller has them:
   * the detail view and a single suite. Their failed runs are rerun.
   */
  checks?: CheckRun[];
  /**
   * Otherwise the head commit (sha, or the branch) whose failed check runs
   * are fetched first: the list row, its context menu, the flyout.
   */
  ref?: string;
}

/**
 * Rerun a PR's failed checks: the failed jobs of each GitHub Actions workflow
 * run, and a rerequest of each other app's check suite
 * (`services/github/checks.rerunFailedChecks`). Fails, through the error
 * sink, when there is nothing failed to rerun.
 */
export async function rerunChecks(input: RerunChecksInput, opts?: ActionOpts): Promise<boolean> {
  const client = getClientForRepo(input.repoOwner, input.repoName);
  if (!client) return false;
  try {
    const runs =
      input.checks ??
      (input.ref
        ? await getCheckRunsForRef(client, input.repoOwner, input.repoName, input.ref)
        : []);
    const failed = runs.filter(isFailedRun);
    if (failed.length === 0) throw new Error('No failed checks to re-run');
    await rerunFailedChecks(client, input.repoOwner, input.repoName, failed);
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

// ── Review ─────────────────────────────────────────────────────────────

/**
 * The Review action: opens Quick Review for this one PR, in every layout (the
 * Workbench row slot, the detail action bar, the tab layout's hover bar).
 */
export function reviewPr(pr: PullRequestWithChecks): void {
  useQuickReviewStore.getState().startSinglePr(pr);
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
