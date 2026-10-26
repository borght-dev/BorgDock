import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addMembers,
  addOutcome,
  addRelation,
  openDecision,
  removeMember,
  setGoal,
  setNextAction,
  setTitle,
} from '@/services/workstreams/edits';
import { refKey } from '@/services/workstreams/identity';
import { memoryStorage, type WorkstreamStorage } from '@/services/workstreams/storage';
import type { WorkstreamDocument } from '@/services/workstreams/types';
import {
  resetWorkstreamsStore,
  settleWrites,
  setWorkstreamStorage,
  useWorkstreamsStore,
} from '../workstreams-store';

const persisted = new Map<string, unknown>();

vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(async (file: string, key: string, value: unknown) => {
    persisted.set(`${file}:${key}`, JSON.parse(JSON.stringify(value)));
  }),
  readFromTauriStore: vi.fn(async (file: string, key: string) => persisted.get(`${file}:${key}`)),
}));

const A = { kind: 'github-pr' as const, owner: 'acme', repo: 'shop', number: 12 };
const B = { kind: 'github-pr' as const, owner: 'acme', repo: 'warehouse', number: 12 };

let disk: ReturnType<typeof memoryStorage>;

function store() {
  return useWorkstreamsStore.getState();
}

function onDisk(id: string): WorkstreamDocument {
  return JSON.parse(disk.files.get('')!.get(`${id}.json`)!.contents) as WorkstreamDocument;
}

/** What another machine writes into the shared folder. */
function writeElsewhere(id: string, change: (document: WorkstreamDocument) => WorkstreamDocument) {
  const current = onDisk(id);
  const next = {
    ...change(current),
    revision: current.revision + 1,
    writtenBy: { deviceId: 'mini', deviceLabel: 'Mac mini' },
  };
  disk.files
    .get('')!
    .set(`${id}.json`, { contents: JSON.stringify(next), modifiedMs: Date.now() + Math.random() });
}

async function restart(storage: WorkstreamStorage = disk) {
  resetWorkstreamsStore();
  setWorkstreamStorage(storage);
  await store().load(null);
}

function edit(id: string, change: Parameters<ReturnType<typeof store>['edit']>[1]) {
  const error = store().edit(id, change);
  if (error) throw new Error(error);
}

beforeEach(async () => {
  persisted.clear();
  disk = memoryStorage();
  await restart();
});

afterEach(async () => {
  await settleWrites();
  resetWorkstreamsStore();
});

describe('workstreams store', () => {
  it('writes a new workstream as revision 1', async () => {
    const id = store().create('Checkout rewrite');
    await settleWrites();
    expect(onDisk(id)).toMatchObject({ id, title: 'Checkout rewrite', revision: 1, schema: 1 });
    expect(store().entries[id]).toMatchObject({ dirty: false, saving: false });
  });

  it('keeps every edit across a restart', async () => {
    const id = store().create('Checkout rewrite');
    edit(id, (d, c) => setGoal(d, 'Pay in one step', c));
    edit(id, (d, c) =>
      addMembers(
        d,
        [
          { ref: A, label: 'Queue rewrite' },
          { ref: B, label: 'Patch' },
        ],
        c,
      ),
    );
    edit(id, (d, c) =>
      addOutcome(d, 'Customers can pay', true, [{ kind: 'pr-merged', target: refKey(A) }], c),
    );
    edit(id, (d, c) => addRelation(d, 'blocks', refKey(B), refKey(A), 'first', c));
    edit(id, (d, c) => openDecision(d, 'Rewrite or patch?', [refKey(A), refKey(B)], c));
    edit(id, (d, c) => setNextAction(d, 'Decide', refKey(A), 'you', c));
    await settleWrites();
    const before = store().entries[id]!.document;

    await restart();
    const after = store().entries[id]!.document;
    expect(after).toEqual(before);
    expect(after.members).toHaveLength(2);
    expect(after.decisions[0]!.question).toBe('Rewrite or patch?');
  });

  it('a slow read that started before an edit never brings a removed link back', async () => {
    const id = store().create('x');
    edit(id, (d, c) => addMembers(d, [{ ref: A, label: 'a' }], c));
    await settleWrites();
    const stale = disk.files.get('')!.get(`${id}.json`)!.contents;

    let release: () => void = () => {};
    const slow: WorkstreamStorage = {
      ...disk,
      read: () =>
        new Promise((resolve) => {
          release = () => resolve(stale);
        }),
      list: async (folder) =>
        (await disk.list(folder)).map((file) => ({ ...file, modifiedMs: file.modifiedMs + 1000 })),
    };
    setWorkstreamStorage(slow);
    const refreshing = store().refresh();
    setWorkstreamStorage(disk);
    edit(id, (d, c) => removeMember(d, refKey(A), c));
    await settleWrites();
    release();
    await refreshing;
    expect(store().entries[id]!.document.members).toEqual([]);
    expect(onDisk(id).members).toEqual([]);
  });

  it('keeps an edit that failed to save and writes it on retry', async () => {
    const id = store().create('x');
    await settleWrites();
    let fail = true;
    setWorkstreamStorage({
      ...disk,
      write: async (...args) => {
        if (fail) throw 'disk full';
        return disk.write(...args);
      },
    });
    edit(id, (d, c) => setTitle(d, 'Renamed', c));
    await settleWrites();
    expect(store().entries[id]).toMatchObject({ saveError: 'disk full', dirty: true });
    expect(store().entries[id]!.document.title).toBe('Renamed');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(persisted.get('workstreams-pending.json:pending')).toHaveProperty(id);

    fail = false;
    store().retrySave(id);
    await settleWrites();
    expect(onDisk(id).title).toBe('Renamed');
    expect(store().entries[id]!.saveError).toBeNull();
  });

  it('restores an edit that never reached the disk after a restart', async () => {
    const id = store().create('x');
    await settleWrites();
    setWorkstreamStorage({ ...disk, write: async () => Promise.reject('offline') });
    edit(id, (d, c) => setGoal(d, 'kept', c));
    await settleWrites();
    await new Promise((resolve) => setTimeout(resolve, 300));

    await restart();
    await settleWrites();
    expect(onDisk(id).goal).toBe('kept');
  });

  it('merges an edit with what another machine wrote meanwhile', async () => {
    const id = store().create('x');
    await settleWrites();
    writeElsewhere(id, (d) => ({ ...d, goal: 'from the mini' }));
    edit(id, (d, c) => setTitle(d, 'from the laptop', c));
    await settleWrites();
    expect(onDisk(id)).toMatchObject({
      title: 'from the laptop',
      goal: 'from the mini',
      revision: 3,
    });
  });

  it('asks when both machines changed one field, then writes the choice', async () => {
    const id = store().create('x');
    await settleWrites();
    writeElsewhere(id, (d) => ({ ...d, title: 'Theirs' }));
    edit(id, (d, c) => setTitle(d, 'Mine', c));
    await settleWrites();
    const conflict = store().entries[id]!.conflict;
    expect(conflict?.conflicts.map((c) => c.path)).toEqual(['title']);
    expect(conflict?.theirsDevice).toBe('Mac mini');
    expect(store().edit(id, (d, c) => setGoal(d, 'blocked', c))).toMatch(/other version/);

    store().resolveConflict(id, { title: 'theirs' });
    await settleWrites();
    expect(onDisk(id)).toMatchObject({ title: 'Theirs', revision: 3 });
    expect(store().entries[id]!.conflict).toBeNull();
  });

  it('takes in what another machine wrote when nothing is pending here', async () => {
    const id = store().create('x');
    await settleWrites();
    writeElsewhere(id, (d) => ({ ...d, goal: 'from the mini' }));
    await store().refresh();
    expect(store().entries[id]!.document.goal).toBe('from the mini');
  });

  it('calls a file malformed only on the second failed read, and never writes over it', async () => {
    const id = '0b9a5a8e-6f4e-4e4b-9d3c-2a1f0e9d8c7b';
    disk.files.get('')!.set(`${id}.json`, { contents: '{ half', modifiedMs: 1 });
    await restart();
    expect(store().unreadable).toEqual([]);
    await store().refresh();
    expect(store().unreadable).toEqual([expect.objectContaining({ id })]);
    expect(disk.files.get('')!.get(`${id}.json`)!.contents).toBe('{ half');
  });

  it('shows a workstream from a newer BorgDock read-only', async () => {
    const id = store().create('x');
    await settleWrites();
    writeElsewhere(id, (d) => ({ ...d, schema: 2 }));
    await store().refresh();
    expect(store().entries[id]!.readOnly).toBe(true);
    expect(store().edit(id, (d, c) => setTitle(d, 'y', c))).toMatch(/newer BorgDock/);
  });

  it('merges a sync client’s copy into the workstream and puts the copy away', async () => {
    const id = store().create('x');
    await settleWrites();
    const copy = { ...onDisk(id), members: [], goal: '' };
    const withMember = {
      ...copy,
      members: [
        {
          key: refKey(B),
          ref: B,
          role: 'supporting',
          label: 'Patch',
          note: '',
          addedAt: copy.createdAt,
          addedBy: 'you',
        },
      ],
    };
    disk.files
      .get('')!
      .set(`${id}-LAPTOP.json`, { contents: JSON.stringify(withMember), modifiedMs: 99 });
    await store().refresh();
    await settleWrites();
    expect(onDisk(id).members.map((m) => m.key)).toEqual([refKey(B)]);
    expect(disk.files.get('')!.has(`${id}-LAPTOP.json`)).toBe(false);
  });

  it('trashes a workstream and restores it', async () => {
    const id = store().create('Old goal');
    await settleWrites();
    await store().trash(id);
    expect(store().entries[id]).toBeUndefined();
    expect(store().trashed).toEqual([expect.objectContaining({ id, title: 'Old goal' })]);
    await store().restoreTrashed(id);
    expect(store().entries[id]!.document.title).toBe('Old goal');
  });

  it('undoes the last undoable edit', async () => {
    const id = store().create('x');
    store().edit(id, (d, c) => addMembers(d, [{ ref: A, label: 'a' }], c));
    store().edit(id, (d, c) => removeMember(d, refKey(A), c), { undoable: true });
    expect(store().canUndo(id)).toBe(true);
    store().undo(id);
    await settleWrites();
    expect(onDisk(id).members).toHaveLength(1);
  });
});
