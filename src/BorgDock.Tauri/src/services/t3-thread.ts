import { type GuardDecision, guardLaunch } from '@/services/ci-failures/launch-guard';
import { rawId, scopedId } from '@/services/dispatch/hosts';
import { hostRefOf } from '@/services/dispatch/launch';
import {
  type LaunchTarget,
  projectForRepository,
  repositoryProjects,
} from '@/services/dispatch/launch-target';
import { createLogger } from '@/services/logger';
import { isMainWindow, MAIN_WINDOW_LABEL } from '@/services/navigation';
import {
  LOCAL_T3_HOST_ID,
  type T3PrWorkspace,
  t3OpenPrThread,
  t3ShowThread,
  t3Snapshot,
} from '@/services/t3/api';
import { useSettingsStore } from '@/stores/settings-store';
import { useT3ThreadStore } from '@/stores/t3-thread-store';
import type { PullRequest } from '@/types';

const log = createLogger('t3-thread');

/** Another window asks the main window, where Dispatch's T3 data lives, to open the dialog. */
export const OPEN_PR_THREAD_EVENT = 'open-pr-thread-dialog';

function repositoryOf(pr: PullRequest): string {
  return `${pr.repoOwner}/${pr.repoName}`;
}

function executable(): string | undefined {
  return useSettingsStore.getState().settings.agents?.t3Path;
}

async function openOn(
  pr: PullRequest,
  hostId: string,
  projectId: string,
  workspace: T3PrWorkspace,
): Promise<string> {
  const agents = useSettingsStore.getState().settings.agents;
  const context = {
    pr: pr.number,
    repository: repositoryOf(pr),
    hostId,
    workspace: workspace.type,
  };
  log.info('PR thread requested', context);
  const threadId = await log.time('open PR thread', () =>
    t3OpenPrThread(
      hostRefOf(hostId),
      {
        projectId: rawId(hostId, projectId),
        workspace,
        title: `PR #${pr.number}: ${pr.title}`,
        repository: repositoryOf(pr),
        prNumber: pr.number,
        prUrl: pr.htmlUrl,
        model: agents?.t3Model ?? 'claude-fable-5',
        modelInstance: agents?.t3ModelInstance ?? 'claudeAgent',
      },
      executable(),
    ),
  );
  return scopedId(hostId, threadId);
}

/**
 * Open a new, empty T3 thread for `pr` where `target` says and bring T3 to
 * the front on it. A new worktree checks the pull request's branch out (T3
 * reuses the worktree that has it); continuing a thread only shows it.
 * Resolves with the thread's scoped id.
 */
export async function openPrThread(pr: PullRequest, target: LaunchTarget): Promise<string> {
  if (target.kind === 'continue') {
    await t3ShowThread(
      hostRefOf(target.hostId),
      rawId(target.hostId, target.thread.id),
      executable(),
    );
    return target.thread.id;
  }
  if (target.kind === 'worktree') {
    return openOn(pr, target.hostId, target.project.id, { type: 'checkOut' });
  }
  const { thread } = target;
  return openOn(
    pr,
    target.hostId,
    thread.projectId,
    thread.worktreePath
      ? { type: 'existingWorktree', worktreePath: thread.worktreePath, branch: thread.branch }
      : { type: 'root' },
  );
}

/**
 * Open a new T3 thread for `pr` in the worktree at `worktreePath` on this
 * machine, under T3's project for the pull request's repository. Windows
 * other than the main one have no Dispatch data, so T3 is asked directly.
 */
export async function openT3Thread(pr: PullRequest, worktreePath: string): Promise<void> {
  const snapshot = await t3Snapshot({ id: LOCAL_T3_HOST_ID }, null);
  const projects = snapshot.projects.map((project) => ({
    ...project,
    hostId: LOCAL_T3_HOST_ID,
    hostLabel: '',
    available: true,
  }));
  const project = projectForRepository(
    repositoryProjects(projects, LOCAL_T3_HOST_ID),
    repositoryOf(pr),
  );
  if (!project) {
    throw new Error(
      `T3 on this machine has no project for ${repositoryOf(pr)}. Add the repository in T3 first.`,
    );
  }
  await openOn(pr, LOCAL_T3_HOST_ID, project.id, {
    type: 'existingWorktree',
    worktreePath,
    branch: pr.headRef,
  });
}

/**
 * Every way to open a T3 thread for a PR asks this first, so a failure
 * someone already investigates doesn't get a second agent.
 */
export function guardT3Launch(pr: PullRequest): Promise<GuardDecision> {
  return guardLaunch(
    {
      owner: pr.repoOwner,
      repo: pr.repoName,
      prNumber: pr.number,
      checkNames: [],
      headSha: pr.headSha,
    },
    'Open in T3',
  );
}

/**
 * Entry point for "Open a new thread in T3": the dialog in the main window
 * picks the environment and where the thread works (`T3PrThreadDialog`).
 */
export async function requestT3Thread(pr: PullRequest): Promise<void> {
  if (!isMainWindow()) {
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo(MAIN_WINDOW_LABEL, OPEN_PR_THREAD_EVENT, pr);
    return;
  }
  log.info('T3 thread requested', { pr: pr.number, repository: repositoryOf(pr) });
  if ((await guardT3Launch(pr)) === 'cancel') return;
  useT3ThreadStore.getState().setPendingPr(pr);
}
