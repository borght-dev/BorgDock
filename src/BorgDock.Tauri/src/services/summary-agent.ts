import { commands, type PromptSource } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import type { AgentProvider, AppSettings, PullRequest } from '@/types';

/** Where the PR's repository is checked out on this machine, for the agent to read. */
export function summaryCheckout(
  settings: AppSettings,
  pr: Pick<PullRequest, 'repoOwner' | 'repoName'>,
): string | undefined {
  return (
    settings.repos.find(
      (repo) =>
        repo.owner.toLowerCase() === pr.repoOwner.toLowerCase() &&
        repo.name.toLowerCase() === pr.repoName.toLowerCase(),
    )?.worktreeBasePath || undefined
  );
}

/** The efforts each CLI accepts, lowest first. Rust passes on only these. */
export const SUMMARY_EFFORTS: Record<AgentProvider, readonly string[]> = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['minimal', 'low', 'medium', 'high', 'xhigh'],
};

export interface SummaryRun {
  prompt: string;
  cwd?: string | null;
  timeoutSeconds: number;
  sources?: PromptSource[];
}

/**
 * Runs a prompt on the summary agent (Settings → Agents → Summaries) with
 * its provider, model, effort and, for Codex, the fast tier. An effort the
 * provider doesn't know (one picked for the other provider) is left out.
 */
export function runSummaryAgent(settings: AppSettings, run: SummaryRun) {
  const summaries = settings.summaries;
  const provider = summaries?.provider ?? 'claude';
  const effort = summaries?.effort;
  return commandData(
    commands.runHeadlessPrompt({
      provider,
      prompt: run.prompt,
      cwd: run.cwd || null,
      model: summaries?.model || null,
      executable:
        (provider === 'claude' ? settings.agents?.claudePath : settings.agents?.codexPath) ?? null,
      timeoutSeconds: run.timeoutSeconds,
      effort: effort && SUMMARY_EFFORTS[provider].includes(effort) ? effort : null,
      fast: provider === 'codex' && !!summaries?.fast,
      sources: run.sources ?? null,
    }),
  );
}
