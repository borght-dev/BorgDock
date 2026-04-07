import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import {
  buildConflictPrompt,
  buildFixPrompt,
  buildMonitorPrompt,
  launchClaude,
  writePromptFile,
} from '@/services/claude-launcher';
import { useNotificationStore } from '@/stores/notification-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { ParsedError, PullRequestWithChecks } from '@/types';

const log = (step: string, detail?: string) =>
  console.log(`[claude-actions] ${step}${detail ? `: ${detail}` : ''}`);

export function useClaudeActions() {
  const settings = useSettingsStore((s) => s.settings);
  const showNotification = useNotificationStore((s) => s.show);

  const findRepoSettings = useCallback(
    (owner: string, name: string) => {
      return settings.repos.find((r) => r.owner === owner && r.name === name);
    },
    [settings.repos],
  );

  const getOrCreateWorktree = useCallback(
    async (owner: string, name: string, branch: string): Promise<string> => {
      const repo = findRepoSettings(owner, name);
      if (!repo?.worktreeBasePath) {
        throw new Error(
          `No worktree base path configured for ${owner}/${name}. Configure it in Settings → Repos.`,
        );
      }

      log('list_worktrees_bare', repo.worktreeBasePath);
      const worktrees = await invoke<
        Array<{ path: string; branchName: string; isMainWorktree: boolean }>
      >('list_worktrees_bare', { basePath: repo.worktreeBasePath });
      log('list_worktrees_bare done', `found ${worktrees.length} worktrees`);

      const existing = worktrees.find(
        (w) => w.branchName === branch || w.branchName === `refs/heads/${branch}`,
      );
      if (existing) {
        log('reusing worktree', existing.path);
        return existing.path;
      }

      log('create_worktree', `branch=${branch}`);
      const result = await invoke<string>('create_worktree', {
        basePath: repo.worktreeBasePath,
        subfolder: repo.worktreeSubfolder || '.worktrees',
        branchName: branch,
      });
      log('create_worktree done', result);

      return result;
    },
    [findRepoSettings],
  );

  const fixWithClaude = useCallback(
    async (
      pr: PullRequestWithChecks,
      failedCheckNames: string[],
      errors: ParsedError[],
      changedFiles: string[],
      rawLog: string,
    ) => {
      const p = pr.pullRequest;
      log('fixWithClaude', `PR #${p.number} checks=${failedCheckNames.join(', ')}`);

      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) throw new Error(`Repo ${p.repoOwner}/${p.repoName} not found in settings`);

      showNotification({ title: 'Launching Claude...', message: `Setting up worktree for PR #${p.number} (${p.headRef})...`, severity: 'info', actions: [] });
      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      log('building fix prompt');
      const prompt = buildFixPrompt(pr, failedCheckNames, errors, changedFiles, rawLog, repo);
      log('writing prompt file');
      const promptFile = await writePromptFile(prompt);
      log('prompt written', promptFile);
      log('launching claude');
      const checksLabel = failedCheckNames.length === 1
        ? failedCheckNames[0]
        : `${failedCheckNames.length} failing checks`;
      await launchClaude(worktreePath, promptFile, `Fix ${checksLabel}`);
      log('claude launched');
    },
    [findRepoSettings, getOrCreateWorktree],
  );

  const resolveConflicts = useCallback(
    async (pr: PullRequestWithChecks) => {
      const p = pr.pullRequest;
      log('resolveConflicts', `PR #${p.number}`);

      showNotification({ title: 'Launching Claude...', message: `Setting up worktree for PR #${p.number} (${p.headRef})...`, severity: 'info', actions: [] });
      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      const prompt = buildConflictPrompt(pr);
      const promptFile = await writePromptFile(prompt);
      await launchClaude(worktreePath, promptFile, 'Resolve merge conflicts');
      log('claude launched for conflict resolution');
    },
    [getOrCreateWorktree],
  );

  const monitorPr = useCallback(
    async (pr: PullRequestWithChecks) => {
      const p = pr.pullRequest;
      log('monitorPr', `PR #${p.number} branch=${p.headRef}`);

      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) throw new Error(`Repo ${p.repoOwner}/${p.repoName} not found in settings`);

      showNotification({ title: 'Launching Claude...', message: `Setting up worktree for PR #${p.number} (${p.headRef})...`, severity: 'info', actions: [] });
      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      log('building monitor prompt');
      const prompt = buildMonitorPrompt(pr, repo);
      log('writing prompt file');
      const promptFile = await writePromptFile(prompt);
      log('prompt written', promptFile);
      log('launching claude');
      await launchClaude(worktreePath, promptFile, `Monitor PR #${p.number}`);
      log('claude launched');
    },
    [findRepoSettings, getOrCreateWorktree],
  );

  const getMonitorPrompt = useCallback(
    (pr: PullRequestWithChecks): string | null => {
      const p = pr.pullRequest;
      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) return null;
      return buildMonitorPrompt(pr, repo);
    },
    [findRepoSettings],
  );

  const getFixPrompt = useCallback(
    (pr: PullRequestWithChecks, failedCheckNames: string[]): string | null => {
      const p = pr.pullRequest;
      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) return null;
      return buildFixPrompt(pr, failedCheckNames, [], [], '', repo);
    },
    [findRepoSettings],
  );

  return { fixWithClaude, resolveConflicts, monitorPr, getMonitorPrompt, getFixPrompt };
}
