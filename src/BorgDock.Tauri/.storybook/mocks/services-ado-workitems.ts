// .storybook/mocks/services-ado-workitems.ts
//
// Storybook stand-in for @/services/ado/workitems. Returns scenario
// data straight from getControl().workItemScenario instead of going
// through AdoClient / invoke('ado_fetch', ...).
//
// Why not mock at the invoke level: WorkItemDetailApp issues several
// distinct ADO HTTP requests during load (work item, states, comments)
// and would issue more for save (PATCH) and delete (DELETE). Without a
// per-call dispatch on URL/method, mocking at the invoke level requires
// either a fragile sequence-of-responses queue or fn-form invokeResponses
// (Phase 3's responsibility). Aliasing the high-level workitems module
// sidesteps both concerns.
//
// AdoClient is constructed but never has methods called — its constructor
// is side-effect-free. Stories that need to exercise client.getStream
// (attachment download) monkeypatch the prototype in the harness and
// restore on unmount.

import type { JsonPatchOperation, WorkItem, WorkItemComment } from '../../src/types';
import { getControl } from './control';

export async function getWorkItem(_client: unknown, id: number): Promise<WorkItem> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  ctrl.invocations.push({ command: 'workitems.getWorkItem', args: { id } });
  if (s.loadBehavior === 'pending') return new Promise(() => {});
  if (s.loadBehavior === 'reject') throw new Error(s.loadError ?? 'Failed to load work item');
  if (!s.workItem) throw new Error('storybook: no work item in scenario');
  return s.workItem;
}

export async function getWorkItemTypeStates(
  _client: unknown,
  type: string,
): Promise<string[]> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'workitems.getWorkItemTypeStates', args: { type } });
  if (ctrl.workItemScenario.statesBehavior === 'reject')
    throw new Error('storybook: states fetch failed');
  return ctrl.workItemScenario.states ?? [];
}

export async function getWorkItemComments(
  _client: unknown,
  id: number,
): Promise<WorkItemComment[]> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  ctrl.invocations.push({ command: 'workitems.getWorkItemComments', args: { id } });
  if (s.commentsBehavior === 'pending') return new Promise(() => {});
  if (s.commentsBehavior === 'reject') throw new Error('storybook: comments fetch failed');
  return s.comments ?? [];
}

export async function updateWorkItem(
  _client: unknown,
  id: number,
  ops: JsonPatchOperation[],
): Promise<WorkItem> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  ctrl.invocations.push({ command: 'workitems.updateWorkItem', args: { id, ops } });
  if (s.saveBehavior === 'pending') return new Promise(() => {});
  if (s.saveBehavior === 'reject') throw new Error('storybook: save failed');
  if (!s.workItem) throw new Error('storybook: no work item in scenario');

  // Apply the JSON-patch replace ops to the in-memory scenario item so
  // subsequent reads (e.g. re-render) see the new field values.
  const next: WorkItem = { ...s.workItem, fields: { ...s.workItem.fields } };
  for (const op of ops) {
    if (op.op !== 'replace') continue;
    const m = /^\/fields\/(.+)$/.exec(op.path);
    if (!m) continue;
    next.fields[m[1]!] = op.value;
  }
  s.workItem = next;
  return next;
}

export async function deleteWorkItem(_client: unknown, id: number): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'workitems.deleteWorkItem', args: { id } });
  if (ctrl.workItemScenario.deleteBehavior === 'reject')
    throw new Error('storybook: delete failed');
}

export async function addWorkItemComment(
  _client: unknown,
  id: number,
  text: string,
): Promise<WorkItemComment> {
  const ctrl = getControl();
  const s = ctrl.workItemScenario;
  ctrl.invocations.push({ command: 'workitems.addWorkItemComment', args: { id, text } });
  if (s.addCommentBehavior === 'reject') throw new Error('storybook: add comment failed');
  const c: WorkItemComment = {
    id: 9000 + (s.comments?.length ?? 0),
    text,
    createdBy: { displayName: 'You', uniqueName: 'you@example.com' },
    createdDate: new Date().toISOString(),
    modifiedDate: new Date().toISOString(),
  };
  s.comments = [...(s.comments ?? []), c];
  return c;
}

// --- Symbols re-exported as stubs so stories that accidentally import
// them via this alias fail loudly instead of silently calling the real
// HTTP-backed module. Add real mock impls if a future story needs them.

export async function getWorkItems(): Promise<WorkItem[]> {
  return [];
}
export async function createWorkItem(): Promise<WorkItem> {
  throw new Error('storybook: createWorkItem not mocked');
}
export async function downloadAttachment(): Promise<Blob> {
  throw new Error('storybook: downloadAttachment not mocked');
}
export async function getCurrentUserDisplayName(): Promise<string | null> {
  return null;
}
export async function searchWorkItemsByIdPrefix(): Promise<WorkItem[]> {
  return [];
}
export async function searchWorkItemsByText(): Promise<WorkItem[]> {
  return [];
}
export async function getAssignedToMe(): Promise<WorkItem[]> {
  return [];
}

// Pure helper — safe to re-export from the real module (no Tauri deps).
export { buildIdPrefixWiql } from '../../src/services/ado/workitems';
