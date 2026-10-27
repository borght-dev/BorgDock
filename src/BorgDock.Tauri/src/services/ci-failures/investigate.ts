import { launchAgentSession, writePromptFile } from '@/services/claude-launcher';
import { configuredHosts, rawId } from '@/services/dispatch/hosts';
import { type LaunchModel, launchInSlot } from '@/services/dispatch/launch';
import type { Slot } from '@/services/dispatch/types';
import { findRepoConfig } from '@/services/repo-lookup';
import { t3ShowThread } from '@/services/t3/api';
import { ensureWorktree } from '@/services/worktree-lookup';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AgentProvider } from '@/types/settings';
import { claimGroup } from './actions';
import { parseScope } from './identity';
import * as store from './store-api';
import type { CiClaim, CiGroupDetail } from './types';

export type InvestigationTarget =
  | { kind: 't3'; slot: Slot; model: LaunchModel; effort: string | null; openInT3: boolean }
  | { kind: 'terminal'; provider: AgentProvider };

/** Someone claimed the group between opening the sheet and launching. */
export class AlreadyOwnedError extends Error {
  constructor(readonly claim: CiClaim) {
    super(`${claim.ownerLabel ?? 'Someone'} already investigates this failure.`);
    this.name = 'AlreadyOwnedError';
  }
}

/** The T3 slot whose workspace is this repository, when one is free. */
export function slotForRepo(slots: readonly Slot[], repo: string): string | null {
  const name = repo.toLowerCase();
  const matches = (slot: Slot) =>
    (slot.workspaceRoot ?? '').toLowerCase().replace(/\\/g, '/').split('/').includes(name) ||
    slot.name.toLowerCase().includes(name);
  return slots.find((slot) => slot.available && slot.state === 'free' && matches(slot))?.id ?? null;
}

/**
 * A terminal investigation runs in the earliest affected PR's worktree, or
 * the repository's own checkout when only the default branch fails.
 */
async function terminalWorktree(detail: CiGroupDetail): Promise<string> {
  const parts = parseScope(detail.summary.scope);
  if (!parts) throw new Error('Unknown repository');
  const repo = findRepoConfig(useSettingsStore.getState().settings.repos, parts.owner, parts.repo);
  if (!repo?.worktreeBasePath) {
    throw new Error(
      `No worktree base path configured for ${parts.owner}/${parts.repo}. Configure it in Settings → Repos.`,
    );
  }
  const numbers = new Set(detail.summary.prNumbers);
  const earliest = [...usePrStore.getState().pullRequests]
    .filter(
      (pr) =>
        numbers.has(pr.pullRequest.number) &&
        pr.pullRequest.repoOwner.toLowerCase() === parts.owner &&
        pr.pullRequest.repoName.toLowerCase() === parts.repo,
    )
    .sort((a, b) => a.pullRequest.createdAt.localeCompare(b.pullRequest.createdAt))[0];
  return earliest ? ensureWorktree(repo, earliest.pullRequest.headRef) : repo.worktreeBasePath;
}

/**
 * Claims the group, then starts the investigation. The claim comes first so
 * a second launch from another window sees the owner; a launch that fails
 * releases it again with a `launch_failed` event.
 */
export async function launchInvestigation(
  detail: CiGroupDetail,
  prompt: string,
  target: InvestigationTarget,
): Promise<{ ownerRef: string }> {
  const summary = detail.summary;
  const title = `CI: ${summary.title}`.slice(0, 120);
  const result = await claimGroup(summary, {
    kind: target.kind,
    ownerRef: `pending:${crypto.randomUUID()}`,
    label: title,
    hostId: target.kind === 't3' ? target.slot.hostId : null,
  });
  if (result.outcome === 'alreadyClaimed') throw new AlreadyOwnedError(result.claim);
  const claim = result.claim;
  try {
    let ownerRef: string;
    if (target.kind === 't3') {
      ownerRef = await launchInSlot({
        slot: target.slot,
        model: target.model,
        effort: target.effort,
        title,
        prompt,
      });
      useDispatchStore.getState().linkThread(ownerRef, null);
      if (target.openInT3) {
        const settings = useSettingsStore.getState().settings;
        const host = configuredHosts(settings).find((h) => h.id === target.slot.hostId);
        await t3ShowThread(
          { id: target.slot.hostId, baseUrl: host?.baseUrl },
          rawId(target.slot.hostId, ownerRef),
          settings.agents?.t3Path,
        ).catch(() => {});
      }
    } else {
      const agents = useSettingsStore.getState().settings.agents;
      const worktreePath = await terminalWorktree(detail);
      const promptFile = await writePromptFile(prompt);
      await launchAgentSession({
        provider: target.provider,
        worktreePath,
        promptFile,
        title,
        claudePath: agents?.claudePath,
        codexPath: agents?.codexPath,
        codexModel: agents?.codexModel,
      });
      ownerRef = `terminal:${Date.now()}`;
    }
    await store.updateClaim(claim.id, claim.revision, { ownerRef }, 'owner_changed', 'started');
    return { ownerRef };
  } catch (error) {
    await store
      .updateClaim(claim.id, claim.revision, { state: 'released' }, 'launch_failed', String(error))
      .catch(() => {});
    throw error;
  }
}
