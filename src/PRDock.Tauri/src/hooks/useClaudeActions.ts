import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import {
  buildConflictPrompt,
  buildFixPrompt,
  buildMonitorPrompt,
  launchClaude,
  writePromptFile,
} from '@/services/claude-launcher';
import { useSettingsStore } from '@/stores/settings-store';
import type { ParsedError, PullRequestWithChecks } from '@/types';

export function useClaudeActions() {
  const settings = useSettingsStore((s) => s.settings);

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

      // Try to find existing worktree for this branch
      const worktrees = await invoke<
        Array<{ path: string; branchName: string; isMainWorktree: boolean }>
      >('list_worktrees', { basePath: repo.worktreeBasePath });

      const existing = worktrees.find(
        (w) => w.branchName === branch || w.branchName === `refs/heads/${branch}`,
      );
      if (existing) return existing.path;

      // Create new worktree
      const result = await invoke<string>('create_worktree', {
        basePath: repo.worktreeBasePath,
        subfolder: repo.worktreeSubfolder || '.worktrees',
        branchName: branch,
      });

      return result;
    },
    [findRepoSettings],
  );

  const fixWithClaude = useCallback(
    async (
      pr: PullRequestWithChecks,
      checkName: string,
      errors: ParsedError[],
      changedFiles: string[],
      rawLog: string,
    ) => {
      const p = pr.pullRequest;
      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) throw new Error(`Repo ${p.repoOwner}/${p.repoName} not found in settings`);

      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      const prompt = buildFixPrompt(pr, checkName, errors, changedFiles, rawLog, repo);
      const promptFile = await writePromptFile(prompt);
      await launchClaude(worktreePath, promptFile, `Fix failing check: ${checkName}`);
    },
    [findRepoSettings, getOrCreateWorktree],
  );

  const resolveConflicts = useCallback(
    async (pr: PullRequestWithChecks) => {
      const p = pr.pullRequest;
      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      const prompt = buildConflictPrompt(pr);
      const promptFile = await writePromptFile(prompt);
      await launchClaude(worktreePath, promptFile, 'Resolve merge conflicts');
    },
    [getOrCreateWorktree],
  );

  const monitorPr = useCallback(
    async (pr: PullRequestWithChecks) => {
      const p = pr.pullRequest;
      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) throw new Error(`Repo ${p.repoOwner}/${p.repoName} not found in settings`);

      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      const prompt = buildMonitorPrompt(pr, repo);
      const promptFile = await writePromptFile(prompt);
      await launchClaude(worktreePath, promptFile, `Monitor PR #${p.number}`);
    },
    [findRepoSettings, getOrCreateWorktree],
  );

  return { fixWithClaude, resolveConflicts, monitorPr };
}
