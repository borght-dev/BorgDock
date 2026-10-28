/**
 * The vault index: which note a `[[link]]` names, which notes link to a
 * note, which notes mention a pull request, work item, thread or workstream,
 * and every tag and task. Pure and derived: rebuilt from parsed notes, never
 * stored in the vault.
 */
import { refKey } from '@/services/workstreams/identity';
import type { RefKey, SourceRef } from '@/services/workstreams/types';
import type { InlineToken, ParsedNote, Task } from './parse';

/** What the user configured, which turns short refs into identities. */
export interface RefContext {
  /** The Azure DevOps organization and project `AB#123` belongs to. */
  adoOrganization: string | null;
  adoProject: string | null;
  /** Configured repositories: `repo#12` names one when exactly one has that name. */
  repos: readonly { owner: string; name: string }[];
}

export interface Mention {
  path: string;
  line: number;
}

export interface VaultIndex {
  notes: ReadonlyMap<string, ParsedNote>;
  /** Lower-case title → paths, the shortest first. */
  byTitle: ReadonlyMap<string, readonly string[]>;
  /** Note path → the notes that link to it. */
  backlinks: ReadonlyMap<string, readonly Mention[]>;
  /** `RefKey` (or `ws:<id>` for a workstream) → the notes that mention it. */
  mentions: ReadonlyMap<string, readonly Mention[]>;
  /** Tag → the notes that carry it. */
  tags: ReadonlyMap<string, readonly string[]>;
  tasks: readonly (Task & { path: string })[];
}

export const EMPTY_INDEX: VaultIndex = {
  notes: new Map(),
  byTitle: new Map(),
  backlinks: new Map(),
  mentions: new Map(),
  tags: new Map(),
  tasks: [],
};

const WORKSTREAM_PREFIX = 'ws:';

export function workstreamKey(id: string): string {
  return `${WORKSTREAM_PREFIX}${id}`;
}

/** The reference a token stands for, or `null` when it names nothing known. */
export function sourceOfToken(token: InlineToken, context: RefContext): SourceRef | null {
  switch (token.kind) {
    case 'ado': {
      const organization = token.organization ?? context.adoOrganization;
      const project = token.project ?? context.adoProject;
      if (!organization || !project) return null;
      return { kind: 'ado-item', organization, project, id: token.id };
    }
    case 'pr': {
      if (token.owner) {
        return { kind: 'github-pr', owner: token.owner, repo: token.repo, number: token.number };
      }
      const named = context.repos.filter((r) => r.name.toLowerCase() === token.repo.toLowerCase());
      if (named.length !== 1) return null;
      return {
        kind: 'github-pr',
        owner: named[0]!.owner,
        repo: named[0]!.name,
        number: token.number,
      };
    }
    case 't3':
      return {
        kind: 't3-thread',
        environmentId: token.environmentId,
        threadId: token.threadId,
        hostId: '',
      };
    default:
      return null;
  }
}

/** The key a token is indexed under in `mentions`. */
export function keyOfToken(token: InlineToken, context: RefContext): string | null {
  if (token.kind === 'workstream') return workstreamKey(token.id);
  const source = sourceOfToken(token, context);
  return source ? refKey(source) : null;
}

function withoutExtension(path: string): string {
  return path.replace(/\.md$/i, '');
}

function depth(path: string): number {
  return path.split('/').length;
}

/**
 * The note a `[[target]]` names: a vault path (`Projects/Plan`) when the
 * target holds a `/`, else a title, case-insensitive; the shortest path wins
 * when two folders hold the same title, as in Obsidian.
 */
export function resolveLink(index: VaultIndex, target: string): string | null {
  const wanted = target.trim().replace(/\.md$/i, '').toLowerCase();
  if (!wanted) return null;
  if (wanted.includes('/')) {
    for (const path of index.notes.keys()) {
      if (withoutExtension(path).toLowerCase() === wanted) return path;
    }
    return null;
  }
  return index.byTitle.get(wanted)?.[0] ?? null;
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildIndex(parsed: readonly ParsedNote[], context: RefContext): VaultIndex {
  const notes = new Map(parsed.map((note) => [note.path, note]));
  const byTitle = new Map<string, string[]>();
  for (const note of parsed) push(byTitle, note.title.toLowerCase(), note.path);
  for (const paths of byTitle.values()) {
    paths.sort((a, b) => depth(a) - depth(b) || a.length - b.length || a.localeCompare(b));
  }

  const partial: VaultIndex = { ...EMPTY_INDEX, notes, byTitle };
  const backlinks = new Map<string, Mention[]>();
  const mentions = new Map<string, Mention[]>();
  const tags = new Map<string, string[]>();
  const tasks: (Task & { path: string })[] = [];

  for (const note of parsed) {
    const linked = new Set<string>();
    const mentioned = new Set<string>();
    for (const token of note.tokens) {
      if (token.kind === 'wikilink') {
        const target = resolveLink(partial, token.target);
        if (target && target !== note.path && !linked.has(target)) {
          linked.add(target);
          push(backlinks, target, { path: note.path, line: token.line });
        }
        continue;
      }
      if (token.kind === 'tag') continue;
      const key = keyOfToken(token, context);
      if (key && !mentioned.has(key)) {
        mentioned.add(key);
        push(mentions, key, { path: note.path, line: token.line });
      }
    }
    for (const tag of note.tags) push(tags, tag, note.path);
    for (const task of note.tasks) tasks.push({ ...task, path: note.path });
  }

  return { notes, byTitle, backlinks, mentions, tags, tasks };
}

/** The notes that mention `key`, one entry per note. */
export function mentionsOf(index: VaultIndex, key: RefKey): readonly Mention[] {
  return index.mentions.get(key) ?? [];
}
