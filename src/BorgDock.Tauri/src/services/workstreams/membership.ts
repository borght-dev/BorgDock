import { createLogger } from '@/services/logger';
import { isMainWindow, MAIN_WINDOW_LABEL } from '@/services/navigation';
import { useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';
import type { SourceRef } from './types';

const log = createLogger('workstreams');

/** Another window (a pull request or work item pop-out) asks to add records to a workstream. */
export const ADD_TO_WORKSTREAM_EVENT = 'workstreams-add';

export interface AddRequest {
  refs: { ref: SourceRef; label: string }[];
}

/**
 * Offer `refs` to a workstream: the main window opens its "Add to
 * workstream" sheet; any other window asks the main window to, since only
 * the main window holds and writes workstreams.
 */
export async function addToWorkstream(request: AddRequest): Promise<void> {
  if (isMainWindow()) {
    useWorkstreamsUiStore.getState().openAdd(request);
    return;
  }
  try {
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo(MAIN_WINDOW_LABEL, ADD_TO_WORKSTREAM_EVENT, request);
  } catch (error) {
    log.error('add to workstream not sent to the main window', error);
  }
}

/** A work item of the configured organization as a reference. */
export function itemRef(organization: string, project: string, id: number): SourceRef {
  return { kind: 'ado-item', organization, project, id };
}

/** A pull request as a reference. */
export function pullRequestRef(owner: string, repo: string, number: number): SourceRef {
  return { kind: 'github-pr', owner, repo, number };
}
