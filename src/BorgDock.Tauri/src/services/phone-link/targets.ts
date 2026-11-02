import type { PhoneActivityTarget } from '@/generated/commands';
import { entityKey } from '@/services/activity/sources';
import type { ActivityEntry } from '@/services/activity/types';

/**
 * Activity entries here and on BorgDock for iPhone's server name the same
 * things differently: the journal scopes keys by host and repository and
 * lower-cases PRs, the server uses `ActivityTarget`. These two functions
 * translate in each direction.
 */

const PR_URL = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;
const PR_KEY = /^gh:([^/]+)\/([^#]+)#(\d+)$/;
const SERVER_PR_KEY = /^([^/]+)\/([^#]+)#(\d+)$/;
const THREAD = ':thread:';

/** What the server calls the thing an entry is about; null when it has no counterpart there. */
export function targetOf(
  entry: Pick<ActivityEntry, 'entity' | 'links'>,
): PhoneActivityTarget | null {
  const { kind, key, url } = entry.entity;
  switch (kind) {
    case 'pr': {
      // The key is lower-cased; the address keeps GitHub's spelling, which the server uses.
      const match = url?.match(PR_URL) ?? key.match(PR_KEY);
      return match ? { kind: 'pr', key: `${match[1]}/${match[2]}#${match[3]}` } : null;
    }
    case 'workitem': {
      const id = Number(key.slice(key.lastIndexOf(':') + 1));
      return Number.isInteger(id) && id > 0 ? { kind: 'item', id } : null;
    }
    case 'thread': {
      const at = key.indexOf(THREAD);
      if (at < 0) return null;
      return {
        kind: 'thread',
        id: key.slice(at + THREAD.length),
        itemId: entry.links.itemIds[0] ?? null,
      };
    }
    case 'ci-group':
      return key.startsWith('ci:') ? { kind: 'ci', groupId: key.slice('ci:'.length) } : null;
    default:
      return null;
  }
}

function sameThing(target: PhoneActivityTarget): string {
  switch (target.kind) {
    case 'pr':
      return `pr:${target.key.toLowerCase()}`;
    case 'item':
      return `item:${target.id}`;
    case 'thread':
      return `thread:${target.id}`;
    case 'ci':
      return `ci:${target.groupId}`;
    case 'none':
      return 'none';
  }
}

/** One target per thing the entries are about. */
export function targetsOf(
  entries: Pick<ActivityEntry, 'entity' | 'links'>[],
): PhoneActivityTarget[] {
  const targets = new Map<string, PhoneActivityTarget>();
  for (const entry of entries) {
    const target = targetOf(entry);
    if (target && !targets.has(sameThing(target))) targets.set(sameThing(target), target);
  }
  return [...targets.values()];
}

/** What the journal needs to find an entity: the ADO project and every T3 host. */
export interface LocalScope {
  ado: { organization: string; project: string } | null;
  hostIds: string[];
}

/** The journal's entity keys a read on the phone covers. */
export function entityKeysOf(target: PhoneActivityTarget, scope: LocalScope): string[] {
  switch (target.kind) {
    case 'pr': {
      const [, owner, repo, number] = target.key.match(SERVER_PR_KEY) ?? [];
      return owner && repo && number ? [entityKey.pr(owner, repo, Number(number))] : [];
    }
    case 'item':
      return scope.ado
        ? [entityKey.workItem(scope.ado.organization, scope.ado.project, target.id)]
        : [];
    case 'thread':
      return scope.hostIds.map((hostId) => entityKey.thread(hostId, target.id));
    case 'ci':
      return [entityKey.ciGroup(target.groupId)];
    case 'none':
      return [];
  }
}
