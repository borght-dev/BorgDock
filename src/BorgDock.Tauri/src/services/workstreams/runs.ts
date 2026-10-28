import { rawId } from '@/services/dispatch/hosts';
import {
  hostRefOf,
  type LaunchModel,
  launchAt,
  PLAN_FIRST,
  rememberTarget,
} from '@/services/dispatch/launch';
import type { LaunchTarget } from '@/services/dispatch/launch-target';
import { t3Environment, t3ShowThread } from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import { PROMPT_LIMIT } from './brief';
import { addRun } from './edits';
import { refKey } from './identity';
import type { RunKind, T3ThreadRef } from './types';

/**
 * Start an agent from a workstream: a review that proposes, or work on the
 * next action. The thread joins the workstream and is remembered in it, so
 * the run follows the workstream to the other machine.
 */

export interface WorkstreamRunRequest {
  workstreamId: string;
  kind: RunKind;
  target: LaunchTarget;
  /** Absent when the target continues a thread: it keeps its own model. */
  model: LaunchModel | undefined;
  effort: string | null;
  prompt: string;
  /** Work only: ask for a plan before changes (an instruction, not T3's plan mode). */
  planFirst: boolean;
  openInT3: boolean;
}

const TITLE_LIMIT = 120;

export async function startWorkstreamRun(request: WorkstreamRunRequest): Promise<string> {
  const { target, model } = request;
  const entry = useWorkstreamsStore.getState().entries[request.workstreamId];
  if (!entry) throw new Error('That workstream is gone.');
  if (entry.readOnly) throw new Error('This workstream was made by a newer BorgDock.');
  if (entry.conflict) throw new Error('Choose what to keep from the other version first.');
  const written = request.prompt.trim();
  if (written.length > PROMPT_LIMIT)
    throw new Error('The first message is longer than 20,000 characters.');

  const document = entry.document;
  const nextActionKey = document.nextAction?.target ?? null;
  const targetItem = nextActionKey
    ? document.members.find((m) => m.key === nextActionKey && m.ref.kind === 'ado-item')
    : undefined;
  const itemId =
    request.kind === 'work' && targetItem?.ref.kind === 'ado-item' ? targetItem.ref.id : null;
  const title =
    request.kind === 'review'
      ? `Workstream: ${document.title}`
      : itemId !== null
        ? `AB#${itemId} ${targetItem?.label || document.title}`
        : `Workstream: ${document.title}, next action`;

  const hostRef = hostRefOf(target.hostId);
  const prompt =
    request.kind === 'work' && request.planFirst ? `${written}\n\n${PLAN_FIRST}` : written;
  const threadId = await launchAt({
    target,
    model,
    effort: request.effort,
    title: title.slice(0, TITLE_LIMIT),
    prompt,
  });
  const rawThreadId = rawId(target.hostId, threadId);
  rememberTarget(target);
  // A review names many items; it belongs to none of them in Dispatch. Work
  // on an item's next action is that item's thread. A continued thread keeps its own.
  if (target.kind !== 'continue') useDispatchStore.getState().linkThread(threadId, itemId);

  const environmentId =
    useDispatchStore.getState().hosts.find((h) => h.id === target.hostId)?.environmentId ??
    (await t3Environment(hostRef));
  const ref: T3ThreadRef = {
    kind: 't3-thread',
    environmentId,
    threadId: rawThreadId,
    hostId: target.hostId,
  };
  const device = useWorkstreamsStore.getState().device.deviceLabel;
  const notRecorded = useWorkstreamsStore.getState().edit(request.workstreamId, (d, c) =>
    addRun(
      d,
      { key: refKey(ref), kind: request.kind, startedAt: c.now, device },
      {
        ref,
        label: title.slice(0, TITLE_LIMIT),
        role: request.kind === 'review' ? 'context' : 'supporting',
        addedBy: 'run',
      },
      c,
    ),
  );
  if (notRecorded) {
    throw new Error(`The thread started, but the workstream did not take it: ${notRecorded}`);
  }
  if (request.openInT3) {
    await t3ShowThread(
      hostRef,
      rawThreadId,
      useSettingsStore.getState().settings.agents?.t3Path,
    ).catch(() => {});
  }
  return threadId;
}
