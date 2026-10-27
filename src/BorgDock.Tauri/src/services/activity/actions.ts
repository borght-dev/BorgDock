import { showGroupPrs } from '@/services/ci-failures/actions';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { dispatchActions, showDispatchItem } from '@/services/dispatch/actions';
import { scopedId } from '@/services/dispatch/hosts';
import type { AgentThread } from '@/services/dispatch/types';
import { showPr, showWorkstream } from '@/services/navigation';
import { isReadyToMerge } from '@/services/notification';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import type { PullRequestWithChecks } from '@/types';
import * as api from './api';
import type { ActionTarget, ActivityEntry } from './types';

/**
 * What an entry's action does, checked against the stores right before it
 * runs: an answer only while the thread still asks the same question, a
 * merge only on the same head while it is still ready. When the check
 * fails the row says what changed and offers Open instead. Actions run
 * through the code that exists; reading an entry never starts anything.
 */

/** What an action is checked against; components pass it from their selectors. */
export interface World {
  threads: readonly AgentThread[];
  hosts: readonly { id: string; label: string; ok: boolean }[];
  pullRequests: readonly PullRequestWithChecks[];
  groups: readonly CiGroupSummary[];
}

export function currentWorld(): World {
  const dispatch = useDispatchStore.getState();
  return {
    threads: dispatch.threads,
    hosts: dispatch.hosts,
    pullRequests: usePrStore.getState().pullRequests,
    groups: useCiFailuresStore.getState().groups,
  };
}

export type Check =
  | { ok: true; action: ActionTarget }
  | { ok: false; reason: string; fallback: ActionTarget | null };

function threadOf(
  hostId: string,
  threadId: string,
  world: World = currentWorld(),
): AgentThread | undefined {
  const id = scopedId(hostId, threadId);
  return world.threads.find((thread) => thread.id === id);
}

function prOf(
  owner: string,
  repo: string,
  number: number,
  world: World = currentWorld(),
): PullRequestWithChecks | undefined {
  return world.pullRequests.find(
    (pr) =>
      pr.pullRequest.repoOwner.toLowerCase() === owner.toLowerCase() &&
      pr.pullRequest.repoName.toLowerCase() === repo.toLowerCase() &&
      pr.pullRequest.number === number,
  );
}

function hostOffline(hostId: string, world: World): string | null {
  const host = world.hosts.find((h) => h.id === hostId);
  return host && !host.ok ? `${host.label} is offline` : null;
}

export function actionLabel(action: ActionTarget): string {
  switch (action.kind) {
    case 'answer':
      return action.option ? `Answer: ${action.option}` : 'Answer';
    case 'approve-plan':
      return 'Approve plan';
    case 'open-thread':
      return 'Open thread';
    case 'open-item':
      return 'Open item';
    case 'open-pr':
      return action.tab === 'checks'
        ? 'Open checks'
        : action.tab === 'reviews'
          ? 'Open reviews'
          : 'Open PR';
    case 'review-pr':
      return 'Review';
    case 'fix-checks':
      return 'Fix checks';
    case 'merge':
      return 'Merge';
    case 'open-ci-group':
      return 'Open failure group';
    case 'open-workstream':
      return 'Open workstream';
    case 'open-url':
      return /\/actions\/runs\//.test(action.url) ? 'Open run log' : 'Open';
  }
}

/** Whether `entry`'s action may still run, and what to offer when not. */
export function revalidate(
  entry: ActivityEntry,
  retired = false,
  world: World = currentWorld(),
): Check {
  const action = entry.action;
  if (!action) return { ok: false, reason: 'Nothing to do', fallback: null };
  if (retired) {
    return { ok: false, reason: 'Its source was removed from settings', fallback: null };
  }
  if (entry.status !== 'open' && (action.kind === 'answer' || action.kind === 'approve-plan')) {
    const thread = threadOf(action.hostId, action.threadId, world);
    return {
      ok: false,
      reason: entry.resolvedBy === 'answered' ? 'Answered on another device' : 'No longer waiting',
      fallback: thread
        ? { kind: 'open-thread', hostId: action.hostId, threadId: action.threadId }
        : null,
    };
  }
  switch (action.kind) {
    case 'answer':
    case 'approve-plan':
    case 'open-thread': {
      const offline = hostOffline(action.hostId, world);
      const thread = threadOf(action.hostId, action.threadId, world);
      const open: ActionTarget = {
        kind: 'open-thread',
        hostId: action.hostId,
        threadId: action.threadId,
      };
      if (offline) return { ok: false, reason: offline, fallback: null };
      if (!thread) return { ok: false, reason: 'The thread is gone', fallback: null };
      if (action.kind === 'answer') {
        const asking =
          thread.status === 'question' &&
          (thread.questionRequestId ?? thread.run?.pendingRequest?.id) === action.requestId;
        if (!asking) return { ok: false, reason: 'Answered on another device', fallback: open };
        if (!action.option) return { ok: false, reason: 'Answer it in T3', fallback: open };
      }
      if (action.kind === 'approve-plan') {
        const planned =
          thread.status === 'plan' && (thread.run?.id ?? action.runId) === action.runId;
        if (!planned) return { ok: false, reason: 'The plan moved on', fallback: open };
      }
      return { ok: true, action };
    }
    case 'fix-checks':
    case 'merge': {
      const pr = prOf(action.owner, action.repo, action.number, world);
      const open: ActionTarget = {
        kind: 'open-pr',
        owner: action.owner,
        repo: action.repo,
        number: action.number,
      };
      if (!pr) return { ok: false, reason: 'The PR is no longer open', fallback: open };
      if ((pr.pullRequest.headSha ?? '') !== action.headSha) {
        return { ok: false, reason: 'New commits since', fallback: open };
      }
      if (action.kind === 'fix-checks' && pr.overallStatus !== 'red') {
        return { ok: false, reason: 'Checks pass now', fallback: open };
      }
      if (action.kind === 'merge' && !isReadyToMerge(pr)) {
        return { ok: false, reason: 'No longer ready to merge', fallback: open };
      }
      return { ok: true, action };
    }
    case 'review-pr': {
      const pr = prOf(action.owner, action.repo, action.number, world);
      return pr
        ? { ok: true, action }
        : {
            ok: false,
            reason: 'The PR is no longer open',
            fallback: {
              kind: 'open-pr',
              owner: action.owner,
              repo: action.repo,
              number: action.number,
            },
          };
    }
    case 'open-ci-group': {
      const group = world.groups.find((g) => g.id === action.groupId);
      return group
        ? { ok: true, action }
        : { ok: false, reason: 'The group is gone', fallback: null };
    }
    default:
      return { ok: true, action };
  }
}

async function openUrl(url: string): Promise<void> {
  const { openUrl: open } = await import('@tauri-apps/plugin-opener');
  await open(url);
}

/** Run an action that passed `revalidate`. */
export async function run(action: ActionTarget): Promise<void> {
  switch (action.kind) {
    case 'answer': {
      const thread = threadOf(action.hostId, action.threadId);
      const [question] = thread?.questions ?? [];
      const option = question?.options.find((o) => o.label === action.option);
      if (thread && question && option)
        dispatchActions.answer(thread, { [question.id]: option.value });
      return;
    }
    case 'approve-plan': {
      const thread = threadOf(action.hostId, action.threadId);
      if (thread) dispatchActions.approvePlan(thread);
      return;
    }
    case 'open-thread':
      dispatchActions.openInT3({
        id: scopedId(action.hostId, action.threadId),
        hostId: action.hostId,
      });
      return;
    case 'open-item':
      showDispatchItem(action.itemId);
      return;
    case 'open-pr':
      await showPr({
        owner: action.owner,
        repo: action.repo,
        number: action.number,
        ...(action.tab ? { tab: action.tab === 'reviews' ? 'discussion' : 'checks' } : {}),
      });
      return;
    case 'review-pr':
    case 'merge': {
      const { handleFlyoutPrAction } = await import('@/hooks/useFlyoutSync');
      await handleFlyoutPrAction({
        repoOwner: action.owner,
        repoName: action.repo,
        number: action.number,
        action: action.kind === 'merge' ? 'merge' : 'review',
        failedCheckNames: [],
      });
      return;
    }
    case 'fix-checks': {
      // The main window's fix listener runs the launch guard, so a fix
      // already under way is not started twice.
      const pr = prOf(action.owner, action.repo, action.number);
      const { emit } = await import('@tauri-apps/api/event');
      await emit('flyout-fix-pr', {
        repoOwner: action.owner,
        repoName: action.repo,
        number: action.number,
        failedCheckNames: pr?.failedCheckNames ?? [],
      });
      return;
    }
    case 'open-ci-group': {
      const group = useCiFailuresStore.getState().groups.find((g) => g.id === action.groupId);
      if (group) {
        await showGroupPrs({
          groupId: group.id,
          title: group.title,
          scope: group.scope,
          prNumbers: group.prNumbers,
        });
      }
      return;
    }
    case 'open-workstream':
      await showWorkstream(action.id);
      return;
    case 'open-url':
      await openUrl(action.url);
      return;
  }
}

/**
 * Take an entry's action, or the fallback when it no longer applies, and
 * mark the entry read. Returns what ran, for the row to say.
 */
export async function act(
  entry: ActivityEntry,
  retired = false,
): Promise<{ ran: ActionTarget | null; reason: string | null }> {
  const check = revalidate(entry, retired);
  const target = check.ok ? check.action : check.fallback;
  if (target) await run(target);
  if (target && entry.read === 'unread') {
    await api
      .mark({ ids: [entry.id], entityKeys: [], before: null, read: 'read', reason: 'action' })
      .catch(() => {});
  }
  return { ran: target, reason: check.ok ? null : check.reason };
}
