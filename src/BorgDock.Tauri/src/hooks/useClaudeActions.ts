import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import {
  buildConflictPrompt,
  buildFixPrompt,
  buildMonitorPrompt,
  launchAgentSession,
  writePromptFile,
} from '@/services/claude-launcher';
import { sendOsNotification } from '@/services/notification';
import { findRepoConfig } from '@/services/repo-lookup';
import { findWorktreeForBranch } from '@/services/worktree-lookup';
import { useSettingsStore } from '@/stores/settings-store';
import type { ParsedError, PullRequestWithChecks } from '@/types';
import type { AgentProvider } from '@/types/settings';

const log = (step: string, detail?: string) =>
  console.log(`[claude-actions] ${step}${detail ? `: ${detail}` : ''}`);

function notifyLaunching(prNumber: number, headRef: string): void {
  void sendOsNotification({
    title: 'Launching Claude...',
    body: `Setting up worktree for PR #${prNumber} (${headRef})...`,
    severity: 'info',
  }).catch(() => {});
}

export function useClaudeActions() {
  const settings = useSettingsStore((s) => s.settings);
  const agentSettings = settings.agents ?? {
    defaultProvider: 'claude' as const,
    defaultPostFixAction: 'commitAndNotify' as const,
    t3Model: 'claude-fable-5',
    t3ModelInstance: 'claudeAgent',
  };

  const launch = useCallback(
    (
      worktreePath: string,
      promptFile: string,
      title: string,
      provider: AgentProvider = agentSettings.defaultProvider,
    ) =>
      launchAgentSession({
        provider,
        worktreePath,
        promptFile,
        title,
        claudePath: agentSettings.claudePath,
        codexPath: agentSettings.codexPath,
        codexModel: agentSettings.codexModel,
      }),
    [agentSettings],
  );

  const findRepoSettings = useCallback(
    (owner: string, name: string) => findRepoConfig(settings.repos, owner, name),
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
      const existing = await findWorktreeForBranch(repo.worktreeBasePath, branch);
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
      provider?: AgentProvider,
    ) => {
      const p = pr.pullRequest;
      log('fixWithClaude', `PR #${p.number} checks=${failedCheckNames.join(', ')}`);

      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) throw new Error(`Repo ${p.repoOwner}/${p.repoName} not found in settings`);

      notifyLaunching(p.number, p.headRef);
      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      log('building fix prompt');
      const prompt = buildFixPrompt(pr, failedCheckNames, errors, changedFiles, rawLog, repo);
      log('writing prompt file');
      const promptFile = await writePromptFile(prompt);
      log('prompt written', promptFile);
      log('launching claude');
      const checksLabel =
        failedCheckNames.length === 1
          ? failedCheckNames[0]
          : `${failedCheckNames.length} failing checks`;
      await launch(worktreePath, promptFile, `Fix ${checksLabel}`, provider);
      log('claude launched');
    },
    [findRepoSettings, getOrCreateWorktree, launch],
  );

  const resolveConflicts = useCallback(
    async (pr: PullRequestWithChecks, provider?: AgentProvider) => {
      const p = pr.pullRequest;
      log('resolveConflicts', `PR #${p.number}`);

      notifyLaunching(p.number, p.headRef);
      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      const prompt = buildConflictPrompt(pr);
      const promptFile = await writePromptFile(prompt);
      await launch(worktreePath, promptFile, 'Resolve merge conflicts', provider);
      log('claude launched for conflict resolution');
    },
    [getOrCreateWorktree, launch],
  );

  const monitorPr = useCallback(
    async (pr: PullRequestWithChecks, provider?: AgentProvider) => {
      const p = pr.pullRequest;
      log('monitorPr', `PR #${p.number} branch=${p.headRef}`);

      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) throw new Error(`Repo ${p.repoOwner}/${p.repoName} not found in settings`);

      notifyLaunching(p.number, p.headRef);
      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      log('building monitor prompt');
      const prompt = buildMonitorPrompt(pr, repo);
      log('writing prompt file');
      const promptFile = await writePromptFile(prompt);
      log('prompt written', promptFile);
      log('launching claude');
      await launch(worktreePath, promptFile, `Monitor PR #${p.number}`, provider);
      log('claude launched');
    },
    [findRepoSettings, getOrCreateWorktree, launch],
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
