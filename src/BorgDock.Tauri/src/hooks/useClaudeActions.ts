import { useCallback } from 'react';
import { guardLaunch } from '@/services/ci-failures/launch-guard';
import { fixEvidence } from '@/services/ci-failures/prompts';
import {
  buildConflictPrompt,
  buildFixPrompt,
  buildMonitorPrompt,
  launchAgentSession,
  writePromptFile,
} from '@/services/claude-launcher';
import { withNotesFor } from '@/services/notes/agents';
import { sendOsNotification } from '@/services/notification';
import { findRepoConfig } from '@/services/repo-lookup';
import { requestT3Thread } from '@/services/t3-thread';
import { ensureWorktree } from '@/services/worktree-lookup';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import type { AgentProvider, InteractiveProvider } from '@/types/settings';

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
    (worktreePath: string, promptFile: string, title: string, provider: AgentProvider) =>
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
      if (!repo) throw new Error(`Repo ${owner}/${name} not found in settings`);
      log('ensure worktree', `branch=${branch}`);
      const path = await ensureWorktree(repo, branch);
      log('worktree ready', path);
      return path;
    },
    [findRepoSettings],
  );

  const fixWithClaude = useCallback(
    async (
      pr: PullRequestWithChecks,
      failedCheckNames: string[],
      provider: InteractiveProvider = agentSettings.defaultProvider,
    ) => {
      const p = pr.pullRequest;
      log('fixWithClaude', `PR #${p.number} checks=${failedCheckNames.join(', ')}`);

      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) throw new Error(`Repo ${p.repoOwner}/${p.repoName} not found in settings`);

      const target = {
        owner: p.repoOwner,
        repo: p.repoName,
        prNumber: p.number,
        checkNames: failedCheckNames.filter((name) => name !== 'unknown'),
        headSha: p.headSha,
      };
      if ((await guardLaunch(target, 'Fix')) === 'cancel') return;

      const fixPrompt = async () => {
        const evidence = await fixEvidence(
          p.repoOwner,
          p.repoName,
          p.number,
          target.checkNames,
        ).catch(() => null);
        log('building fix prompt');
        return withNotesFor(
          buildFixPrompt(pr, failedCheckNames, evidence, repo),
          p.repoOwner,
          p.repoName,
          p.number,
        );
      };
      if (provider === 't3') {
        await requestT3Thread(p, { prompt: await fixPrompt(), intent: 'Fix the failing checks' });
        return;
      }

      notifyLaunching(p.number, p.headRef);
      const [worktreePath, prompt] = await Promise.all([
        getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef),
        fixPrompt(),
      ]);
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
    [agentSettings.defaultProvider, findRepoSettings, getOrCreateWorktree, launch],
  );

  const resolveConflicts = useCallback(
    async (
      pr: PullRequestWithChecks,
      provider: InteractiveProvider = agentSettings.defaultProvider,
    ) => {
      const p = pr.pullRequest;
      log('resolveConflicts', `PR #${p.number}`);

      const prompt = withNotesFor(buildConflictPrompt(pr), p.repoOwner, p.repoName, p.number);
      if (provider === 't3') {
        await requestT3Thread(p, { prompt, intent: 'Resolve the merge conflicts' });
        return;
      }
      notifyLaunching(p.number, p.headRef);
      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      const promptFile = await writePromptFile(prompt);
      await launch(worktreePath, promptFile, 'Resolve merge conflicts', provider);
      log('claude launched for conflict resolution');
    },
    [agentSettings.defaultProvider, getOrCreateWorktree, launch],
  );

  const monitorPr = useCallback(
    async (
      pr: PullRequestWithChecks,
      provider: InteractiveProvider = agentSettings.defaultProvider,
    ) => {
      const p = pr.pullRequest;
      log('monitorPr', `PR #${p.number} branch=${p.headRef}`);

      const repo = findRepoSettings(p.repoOwner, p.repoName);
      if (!repo) throw new Error(`Repo ${p.repoOwner}/${p.repoName} not found in settings`);

      log('building monitor prompt');
      const prompt = withNotesFor(buildMonitorPrompt(pr, repo), p.repoOwner, p.repoName, p.number);
      if (provider === 't3') {
        await requestT3Thread(p, { prompt, intent: 'Monitor' });
        return;
      }
      notifyLaunching(p.number, p.headRef);
      const worktreePath = await getOrCreateWorktree(p.repoOwner, p.repoName, p.headRef);
      log('writing prompt file');
      const promptFile = await writePromptFile(prompt);
      log('prompt written', promptFile);
      log('launching claude');
      await launch(worktreePath, promptFile, `Monitor PR #${p.number}`, provider);
      log('claude launched');
    },
    [agentSettings.defaultProvider, findRepoSettings, getOrCreateWorktree, launch],
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
      return buildFixPrompt(pr, failedCheckNames, null, repo);
    },
    [findRepoSettings],
  );

  return { fixWithClaude, resolveConflicts, monitorPr, getMonitorPrompt, getFixPrompt };
}
