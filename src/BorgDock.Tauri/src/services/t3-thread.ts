import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@/services/logger';
import { sendOsNotification } from '@/services/notification';
import { findRepoConfig } from '@/services/repo-lookup';
import { findWorktreeForBranch } from '@/services/worktree-lookup';
import { useSettingsStore } from '@/stores/settings-store';
import { useT3ThreadStore } from '@/stores/t3-thread-store';
import type { PullRequest } from '@/types';

const log = createLogger('t3-thread');

export interface T3OpenThreadResult {
  /** 1 = T3 only activated (unpaired); 2 = thread created through the API. */
  tier: number;
  threadId?: string;
}

/**
 * Open a new, empty T3 thread for `pr` on `worktreePath` and bring T3 to the
 * front. When BorgDock is not paired with T3 the app is only activated and
 * the user is told how to pair.
 */
export async function openT3Thread(
  pr: PullRequest,
  worktreePath: string,
): Promise<T3OpenThreadResult> {
  const agents = useSettingsStore.getState().settings.agents;
  const context = {
    pr: pr.number,
    repository: `${pr.repoOwner}/${pr.repoName}`,
    branch: pr.headRef,
    worktreePath,
  };
  const started = performance.now();
  log.info('openT3Thread started', context);
  let result: T3OpenThreadResult;
  try {
    result = await invoke<T3OpenThreadResult>('t3_open_thread', {
      workspaceRoot: worktreePath,
      branch: pr.headRef,
      title: `PR #${pr.number}: ${pr.title}`,
      repository: `${pr.repoOwner}/${pr.repoName}`,
      prNumber: pr.number,
      prUrl: pr.htmlUrl,
      model: agents?.t3Model ?? 'claude-fable-5',
      modelInstance: agents?.t3ModelInstance ?? 'claudeAgent',
      executable: agents?.t3Path,
    });
  } catch (err) {
    log.error('openT3Thread failed', err, {
      ...context,
      durationMs: Math.round(performance.now() - started),
    });
    throw err;
  }
  log.info('openT3Thread completed', {
    ...context,
    tier: result.tier,
    threadId: result.threadId,
    durationMs: Math.round(performance.now() - started),
  });
  if (result.tier === 1) {
    void sendOsNotification({
      title: 'T3 opened without a new thread',
      body: 'Pair BorgDock with T3 in Settings → Agents so threads can be created for you.',
      severity: 'info',
    }).catch(() => {});
  }
  return result;
}

/**
 * Entry point for "Open a new thread in T3". Opens the thread straight away
 * when the PR branch is already checked out in a worktree; otherwise hands
 * the PR to the worktree picker (see `T3CheckoutDialog`), which calls
 * `openT3Thread` once a worktree exists.
 */
export async function requestT3Thread(pr: PullRequest): Promise<void> {
  log.info('T3 thread requested', {
    pr: pr.number,
    repository: `${pr.repoOwner}/${pr.repoName}`,
    branch: pr.headRef,
  });
  const repoConfig = findRepoConfig(
    useSettingsStore.getState().settings.repos,
    pr.repoOwner,
    pr.repoName,
  );
  if (!repoConfig?.worktreeBasePath) {
    throw new Error(
      `No worktree base path configured for ${pr.repoOwner}/${pr.repoName}. Configure it in Settings → Repos.`,
    );
  }
  const existing = await log.time('find worktree', () =>
    findWorktreeForBranch(repoConfig.worktreeBasePath, pr.headRef),
  );
  if (existing) {
    await openT3Thread(pr, existing.path);
    return;
  }
  log.info('Opening checkout picker', { pr: pr.number, repoBasePath: repoConfig.worktreeBasePath });
  useT3ThreadStore.getState().setPendingCheckout(pr);
}
