import { configuredHosts, rawId, scopedId } from '@/services/dispatch/hosts';
import type { LaunchModel } from '@/services/dispatch/launch';
import { PLAN_FIRST } from '@/services/dispatch/launch';
import type { Slot } from '@/services/dispatch/types';
import { t3Environment, t3LaunchThread, t3ShowThread } from '@/services/t3/api';
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
  slot: Slot;
  model: LaunchModel;
  effort: string | null;
  prompt: string;
  /** Work only: ask for a plan before changes (an instruction, not T3's plan mode). */
  planFirst: boolean;
  openInT3: boolean;
}

const TITLE_LIMIT = 120;

export async function startWorkstreamRun(request: WorkstreamRunRequest): Promise<string> {
  const { slot, model } = request;
  const entry = useWorkstreamsStore.getState().entries[request.workstreamId];
  if (!entry) throw new Error('That workstream is gone.');
  if (entry.readOnly) throw new Error('This workstream was made by a newer BorgDock.');
  if (entry.conflict) throw new Error('Choose what to keep from the other version first.');
  const written = request.prompt.trim();
  if (!written) throw new Error('The first message is empty.');
  if (written.length > PROMPT_LIMIT)
    throw new Error('The first message is longer than 20,000 characters.');
  if (!slot.available) throw new Error(`${slot.hostLabel} is offline.`);
  if (slot.state !== 'free') {
    throw new Error(`${slot.name} already has an open thread. Settle it or pick another slot.`);
  }

  const document = entry.document;
  const target = document.nextAction?.target ?? null;
  const targetItem = target
    ? document.members.find((m) => m.key === target && m.ref.kind === 'ado-item')
    : undefined;
  const itemId =
    request.kind === 'work' && targetItem?.ref.kind === 'ado-item' ? targetItem.ref.id : null;
  const title =
    request.kind === 'review'
      ? `Workstream: ${document.title}`
      : itemId !== null
        ? `AB#${itemId} ${targetItem?.label || document.title}`
        : `Workstream: ${document.title}, next action`;

  const settings = useSettingsStore.getState().settings;
  const host = configuredHosts(settings).find((h) => h.id === slot.hostId);
  const hostRef = { id: slot.hostId, baseUrl: host?.baseUrl };
  const prompt =
    request.kind === 'work' && request.planFirst ? `${written}\n\n${PLAN_FIRST}` : written;
  const rawThreadId = await t3LaunchThread(hostRef, {
    projectId: rawId(slot.hostId, slot.id),
    title: title.slice(0, TITLE_LIMIT),
    modelSelection: model.selection(model.efforts.length > 0 ? request.effort : null),
    prompt,
  });
  const threadId = scopedId(slot.hostId, rawThreadId);
  // A review names many items; it belongs to none of them in Dispatch. Work
  // on an item's next action is that item's thread.
  useDispatchStore.getState().linkThread(threadId, itemId);

  const environmentId =
    useDispatchStore.getState().hosts.find((h) => h.id === slot.hostId)?.environmentId ??
    (await t3Environment(hostRef));
  const ref: T3ThreadRef = {
    kind: 't3-thread',
    environmentId,
    threadId: rawThreadId,
    hostId: slot.hostId,
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
    await t3ShowThread(hostRef, rawThreadId, settings.agents?.t3Path).catch(() => {});
  }
  return threadId;
}
