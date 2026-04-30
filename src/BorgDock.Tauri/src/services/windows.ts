import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@/services/logger';

const log = createLogger('windows');

export interface OpenPrDetailInput {
  owner: string;
  repo: string;
  number: number;
  [key: string]: unknown; // satisfy Tauri's InvokeArgs constraint
}

/**
 * Open the pop-out PR detail window. Five separate call sites (sidebar
 * context menu, flyout list-item, flyout context menu, flyout toast action,
 * detail panel pop-out button) all duplicated the same `invoke()` call with
 * subtly different error handling. Centralizing here means future args
 * (e.g. an initial tab) and consistent error logging happen in one place.
 */
export async function openPrDetail(input: OpenPrDetailInput): Promise<void> {
  log.info('openPrDetail', { owner: input.owner, repo: input.repo, number: input.number });
  try {
    await invoke('open_pr_detail_window', input);
  } catch (err) {
    log.error('open_pr_detail_window failed', err, {
      owner: input.owner,
      repo: input.repo,
      number: input.number,
    });
    throw err;
  }
}

export interface OpenWorkItemDetailInput {
  workItemId: number;
  [key: string]: unknown;
}

export async function openWorkItemDetail(input: OpenWorkItemDetailInput): Promise<void> {
  log.info('openWorkItemDetail', { workItemId: input.workItemId });
  try {
    await invoke('open_workitem_detail_window', input);
  } catch (err) {
    log.error('open_workitem_detail_window failed', err, { workItemId: input.workItemId });
    throw err;
  }
}

export async function openWhatsNew(version: string | null): Promise<void> {
  log.info('openWhatsNew', { version });
  try {
    await invoke('open_whats_new_window', { version });
  } catch (err) {
    log.error('open_whats_new_window failed', err);
    throw err;
  }
}
