import type { EditContext, EditResult } from '../edits';
import { refKey } from '../identity';
import { newDocument } from '../schema';
import type {
  AdoItemRef,
  GitHubPrRef,
  Member,
  SourceRef,
  T3ThreadRef,
  WorkstreamDocument,
} from '../types';

/** Every name here is invented: BorgDock is public. */

export const NOW = '2026-10-26T09:00:00.000Z';
export const DEVICE = { deviceId: 'device-laptop', deviceLabel: 'Laptop' };
export const CONTEXT: EditContext = { now: NOW, device: 'Laptop' };

export function pr(repo: string, number: number, owner = 'acme'): GitHubPrRef {
  return { kind: 'github-pr', owner, repo, number };
}

export function item(id: number, organization = 'acme'): AdoItemRef {
  return { kind: 'ado-item', organization, project: 'Shop', id };
}

export function thread(
  threadId: string,
  environmentId = 'env-laptop',
  hostId = 'local',
): T3ThreadRef {
  return { kind: 't3-thread', environmentId, threadId, hostId };
}

export function member(ref: SourceRef, overrides: Partial<Member> = {}): Member {
  return {
    key: refKey(ref),
    ref,
    role: 'supporting',
    label: refKey(ref),
    note: '',
    addedAt: NOW,
    addedBy: 'you',
    ...overrides,
  };
}

export function workstream(overrides: Partial<WorkstreamDocument> = {}): WorkstreamDocument {
  return { ...newDocument('Checkout rewrite', NOW, DEVICE), ...overrides };
}

/** The document of an edit that must succeed. */
export function ok(result: EditResult): WorkstreamDocument {
  if ('error' in result) throw new Error(result.error);
  return result.document;
}
