import type { WorkstreamDocument } from './types';

/**
 * Three-way merge of one workstream: `base` is the revision both sides last
 * shared, `mine` holds this machine's edits, `theirs` what is on disk now.
 *
 * - Entries with an id (members, outcomes, relations, decisions, proposals,
 *   runs, log) merge as sets: what either side added stays, and a removal
 *   wins only when the other side left that entry alone since the base.
 * - A field one side changed takes that side. A field both changed to
 *   different values is a conflict: the merge holds mine until you choose.
 */

export interface FieldConflict {
  /** Names the field uniquely: what a choice is keyed by. */
  path: string;
  /** For a field of one entry: which collection, and the entry's id. */
  collection?: Collection['name'];
  entryId?: string;
  field: string;
  label: string;
  mine: unknown;
  theirs: unknown;
}

export interface MergeResult {
  document: WorkstreamDocument;
  conflicts: FieldConflict[];
}

type Entity = Record<string, unknown>;

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  }
  const left = a as Entity;
  const right = b as Entity;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] === undefined && right[key] === undefined) continue;
    if (!equal(left[key], right[key])) return false;
  }
  return true;
}

/** Which side a three-way field takes; `conflict` when both changed it differently. */
function pick(base: unknown, mine: unknown, theirs: unknown): 'mine' | 'theirs' | 'conflict' {
  if (equal(mine, theirs)) return 'mine';
  if (base !== undefined && equal(mine, base)) return 'theirs';
  if (base !== undefined && equal(theirs, base)) return 'mine';
  return 'conflict';
}

const TOP_FIELDS = ['title', 'goal', 'status', 'pinned', 'nextAction', 'completedAt'] as const;

const TOP_LABEL: Record<(typeof TOP_FIELDS)[number], string> = {
  title: 'Title',
  goal: 'Goal',
  status: 'Status',
  pinned: 'Pinned',
  nextAction: 'Next action',
  completedAt: 'Completed',
};

interface Collection {
  name: 'members' | 'outcomes' | 'relations' | 'decisions' | 'proposals' | 'runs' | 'log';
  id: (entry: Entity) => string;
  label: (entry: Entity) => string;
}

const COLLECTIONS: Collection[] = [
  {
    name: 'members',
    id: (e) => e.key as string,
    label: (e) => `Record ${(e.label as string) || (e.key as string)}`,
  },
  { name: 'outcomes', id: (e) => e.id as string, label: (e) => `Outcome "${e.title as string}"` },
  { name: 'relations', id: (e) => e.id as string, label: () => 'Relation' },
  {
    name: 'decisions',
    id: (e) => e.id as string,
    label: (e) => `Decision "${e.question as string}"`,
  },
  { name: 'proposals', id: (e) => e.id as string, label: () => 'Agent proposal' },
  { name: 'runs', id: (e) => e.key as string, label: () => 'Agent run' },
  { name: 'log', id: (e) => e.id as string, label: () => 'Log' },
];

/**
 * Two machines verifying the same outcome by rule agree: the earlier
 * verification stands on both sides. Any other pair of verifications merges
 * like every other field.
 */
function agreedVerification(mine: Entity, theirs: Entity): Entity | null {
  const a = mine.verification as Entity | undefined;
  const b = theirs.verification as Entity | undefined;
  if (!a || !b || a.state !== 'verified' || b.state !== 'verified') return null;
  return String(b.at ?? '') < String(a.at ?? '') ? b : a;
}

function mergeEntity(
  base: Entity | undefined,
  mine: Entity,
  theirs: Entity,
  collection: Collection['name'],
  entryId: string,
  label: string,
  conflicts: FieldConflict[],
): Entity {
  const agreed = collection === 'outcomes' ? agreedVerification(mine, theirs) : null;
  const settled = agreed ? { ...mine, verification: agreed } : mine;
  const theirsSettled = agreed ? { ...theirs, verification: agreed } : theirs;
  const merged: Entity = { ...settled };
  const keys = new Set([...Object.keys(settled), ...Object.keys(theirsSettled)]);
  for (const key of keys) {
    const side = pick(base?.[key], settled[key], theirsSettled[key]);
    if (side === 'theirs') merged[key] = theirsSettled[key];
    if (side === 'conflict') {
      conflicts.push({
        path: JSON.stringify([collection, entryId, key]),
        collection,
        entryId,
        field: key,
        label: `${label}: ${key}`,
        mine: settled[key],
        theirs: theirsSettled[key],
      });
    }
  }
  return merged;
}

function mergeCollection(
  collection: Collection,
  base: readonly Entity[] | undefined,
  mine: readonly Entity[],
  theirs: readonly Entity[],
  conflicts: FieldConflict[],
): Entity[] {
  const byId = (entries: readonly Entity[] | undefined) =>
    new Map((entries ?? []).map((entry) => [collection.id(entry), entry]));
  const b = byId(base);
  const m = byId(mine);
  const t = byId(theirs);
  const order = [...m.keys(), ...[...t.keys()].filter((id) => !m.has(id))];
  const merged: Entity[] = [];
  for (const id of order) {
    const was = b.get(id);
    const ours = m.get(id);
    const other = t.get(id);
    if (ours && other) {
      merged.push(
        equal(ours, other)
          ? ours
          : mergeEntity(was, ours, other, collection.name, id, collection.label(ours), conflicts),
      );
      continue;
    }
    const only = ours ?? other!;
    // Removed on one side: the removal stands unless the other side changed it since.
    if (was && equal(only, was)) continue;
    merged.push(only);
  }
  if (collection.name === 'log') {
    merged.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  }
  return merged;
}

export function mergeDocuments(
  base: WorkstreamDocument | null,
  mine: WorkstreamDocument,
  theirs: WorkstreamDocument,
): MergeResult {
  const conflicts: FieldConflict[] = [];
  const document: Entity = { ...theirs, ...mine };
  for (const field of TOP_FIELDS) {
    const side = pick(base?.[field], mine[field], theirs[field]);
    if (side === 'theirs') document[field] = theirs[field];
    if (side === 'conflict') {
      conflicts.push({
        path: field,
        field,
        label: TOP_LABEL[field],
        mine: mine[field],
        theirs: theirs[field],
      });
    }
  }
  for (const collection of COLLECTIONS) {
    document[collection.name] = mergeCollection(
      collection,
      base?.[collection.name] as unknown as Entity[] | undefined,
      mine[collection.name] as unknown as Entity[],
      theirs[collection.name] as unknown as Entity[],
      conflicts,
    );
  }
  document.dismissedSuggestions = [
    ...new Set([...mine.dismissedSuggestions, ...theirs.dismissedSuggestions]),
  ];
  document.revision = theirs.revision;
  document.writtenBy = theirs.writtenBy;
  document.updatedAt = theirs.updatedAt;
  return { document: document as unknown as WorkstreamDocument, conflicts };
}

/** Take `value` for a conflicting field (a choice in the merge view). */
export function applyChoice(
  document: WorkstreamDocument,
  conflict: Pick<FieldConflict, 'collection' | 'entryId' | 'field'>,
  value: unknown,
): WorkstreamDocument {
  if (!conflict.collection) return { ...document, [conflict.field]: value };
  const spec = COLLECTIONS.find((c) => c.name === conflict.collection);
  if (!spec) return document;
  const entries = document[conflict.collection] as unknown as Entity[];
  return {
    ...document,
    [conflict.collection]: entries.map((entry) =>
      spec.id(entry) === conflict.entryId ? { ...entry, [conflict.field]: value } : entry,
    ),
  };
}
