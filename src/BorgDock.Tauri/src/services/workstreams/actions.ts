import { unitActions } from '@/components/dispatch/unit-actions';
import { dispatchActions, runItemAction, showDispatchItem } from '@/services/dispatch/actions';
import { configuredHosts, rawId } from '@/services/dispatch/hosts';
import { postComment } from '@/services/github/mutations';
import { getClientForRepo } from '@/services/github/singleton';
import { showPr, showWorkItem } from '@/services/navigation';
import { closePr } from '@/services/pr-actions';
import { t3ShowThread } from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import { useWorkstreamSourcesStore } from '@/stores/workstream-sources-store';
import type { ResolvedMember } from './resolve';
import type { RefKey } from './types';

/**
 * The only workstream code that acts on T3, GitHub or ADO. Every action is
 * resolved again right before it runs: when the record is no longer live,
 * or no longer offers the action the button showed, nothing runs and the
 * toast says why.
 */

function openUrl(url: string): void {
  import('@tauri-apps/plugin-opener')
    .then(({ openUrl: open }) => open(url))
    .catch((error) => toastError('Could not open the link', error));
}

/** The member as it resolves now, or `null` when it left the workstream. */
export function currentMember(workstreamId: string, key: RefKey): ResolvedMember | null {
  return useWorkstreamSourcesStore.getState().assessments[workstreamId]?.members.get(key) ?? null;
}

function hostRefOf(hostId: string) {
  const host = configuredHosts(useSettingsStore.getState().settings).find((h) => h.id === hostId);
  return host ? { id: host.id, baseUrl: host.baseUrl } : null;
}

/** Open the original record: in BorgDock when it lives there, else where it lives. */
export function openOriginal(resolved: ResolvedMember): void {
  const ref = resolved.member.ref;
  switch (ref.kind) {
    case 'github-pr':
      if (resolved.pr?.polled) {
        void showPr({
          owner: resolved.pr.owner,
          repo: resolved.pr.repo,
          number: ref.number,
          keepSection: true,
        });
      } else {
        openUrl(resolved.url);
      }
      return;
    case 'ado-item':
      if (resolved.item) void showWorkItem(ref.id);
      else openUrl(resolved.url);
      return;
    case 't3-thread': {
      const thread = resolved.thread;
      const host = thread ? hostRefOf(thread.hostId) : hostRefOf(ref.hostId);
      if (!host) {
        showToast({
          tone: 'error',
          message: resolved.reason ?? 'BorgDock does not follow the T3 host of this thread.',
        });
        return;
      }
      const executable = useSettingsStore.getState().settings.agents?.t3Path;
      t3ShowThread(host, ref.threadId, executable).catch((error) =>
        toastError('Could not open T3', error),
      );
      return;
    }
    case 'link':
      openUrl(ref.url);
  }
}

export interface MemberAction {
  id: string;
  label: string;
  /** Asks before it runs: the record changes at its source. */
  confirm?: { title: string; message: string; label: string };
  danger?: boolean;
}

/** What the record itself offers: Dispatch's actions on an item, settle and open on a thread. */
export function memberActions(resolved: ResolvedMember): MemberAction[] {
  if (resolved.freshness !== 'live') return [];
  const ref = resolved.member.ref;
  if (ref.kind === 'ado-item' && resolved.item) {
    const listed = useDispatchStore.getState().overview?.items.some((o) => o.item.id === ref.id);
    const own = unitActions(resolved.item)
      .filter((action) => listed || action.id === 'open-t3' || action.id === 'open-ado')
      .map((action): MemberAction => ({ id: `item:${action.id}`, label: action.label }));
    // An agent updates the item the way the repository's ADO skills say: a
    // superseded item needs notes, not a bare state change.
    return listed ? [...own, { id: 'item:sync', label: 'Have an agent update it…' }] : own;
  }
  if (ref.kind === 't3-thread' && resolved.thread) {
    const actions: MemberAction[] = [{ id: 'thread:open', label: 'Open in T3' }];
    if (resolved.thread.open && resolved.thread.available) {
      actions.push({
        id: 'thread:settle',
        label: 'Settle thread',
        confirm: {
          title: 'Settle this thread?',
          message: `The agent in ${resolved.thread.slot} stops and the slot is free again.`,
          label: 'Settle',
        },
      });
    }
    return actions;
  }
  if (ref.kind === 'github-pr' && resolved.pr?.state === 'open') {
    return [{ id: 'pr:close', label: 'Close with a comment…', danger: true }];
  }
  return [];
}

/**
 * Run `actionId` on a member, as it resolves now. `comment` is the text a
 * pull request is closed with.
 */
export async function runMemberAction(
  workstreamId: string,
  key: RefKey,
  actionId: string,
  comment?: string,
): Promise<boolean> {
  const resolved = currentMember(workstreamId, key);
  const offered = resolved
    ? memberActions(resolved).some((action) => action.id === actionId)
    : false;
  if (!resolved || !offered) {
    showToast({
      tone: 'error',
      message: 'That action no longer applies: the record changed or is out of reach.',
    });
    return false;
  }
  const ref = resolved.member.ref;
  if (actionId.startsWith('item:') && ref.kind === 'ado-item' && resolved.item) {
    const unit = actionId.slice('item:'.length);
    if (unit === 'sync') {
      showDispatchItem(ref.id);
      useDispatchStore
        .getState()
        .openRunSheet({ kind: 'sync', scope: { kind: 'item', itemId: ref.id, to: null } });
      return true;
    }
    // Moves and starts open Dispatch's sheets, so they run from Dispatch.
    if (unit === 'move' || unit === 'start') {
      runItemAction(ref.id, unit);
      return true;
    }
    const action = unitActions(resolved.item).find((a) => a.id === unit);
    action?.run(dispatchActions);
    return !!action;
  }
  if (ref.kind === 't3-thread' && resolved.thread) {
    if (actionId === 'thread:open') dispatchActions.openInT3(resolved.thread);
    if (actionId === 'thread:settle') dispatchActions.settle(resolved.thread);
    return true;
  }
  if (ref.kind === 'github-pr' && actionId === 'pr:close' && resolved.pr) {
    const { owner, repo } = resolved.pr;
    const client = getClientForRepo(owner, repo);
    if (comment?.trim() && client) {
      try {
        await postComment(client, owner, repo, ref.number, comment.trim());
      } catch (error) {
        toastError('Comment not posted, so the pull request stays open', error);
        return false;
      }
    }
    const closed = await closePr({ repoOwner: owner, repoName: repo, number: ref.number });
    if (closed) showToast({ tone: 'success', message: `Closed ${owner}/${repo}#${ref.number}.` });
    return closed;
  }
  return false;
}

/** The raw thread id and host of a thread member, for launching into its slot. */
export function threadTarget(
  resolved: ResolvedMember,
): { hostId: string; threadId: string } | null {
  const thread = resolved.thread;
  return thread ? { hostId: thread.hostId, threadId: rawId(thread.hostId, thread.id) } : null;
}
