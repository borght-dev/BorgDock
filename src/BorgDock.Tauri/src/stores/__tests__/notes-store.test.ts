import { beforeEach, describe, expect, it } from 'vitest';
import { memoryNotesStorage } from '@/services/notes/storage';
import { readTracked, trackThread } from '@/services/notes/thread-tracking';
import { setNotesStorage, useNotesStore } from '../notes-store';

let vault: ReturnType<typeof memoryNotesStorage>;
const store = () => useNotesStore.getState();

beforeEach(async () => {
  window.localStorage.clear();
  vault = memoryNotesStorage({
    'Plan.md': '# Plan\nShip it',
    'Daily/2026-10-28.md': 'Waiting on [[Plan]]',
  });
  setNotesStorage(vault);
  useNotesStore.setState({ openPath: null, buffers: {}, conflicts: {} });
  await store().load(null);
});

describe('notes store', () => {
  it('loads every note and indexes its links', () => {
    expect(store().status).toBe('ready');
    expect(Object.keys(store().texts).sort()).toEqual(['Daily/2026-10-28.md', 'Plan.md']);
    expect(store().index.backlinks.get('Plan.md')).toEqual([
      { path: 'Daily/2026-10-28.md', line: 0 },
    ]);
  });

  it('saves an edit over the text it read', async () => {
    store().edit('Plan.md', '# Plan\nShip it today');
    expect(store().textOf('Plan.md')).toBe('# Plan\nShip it today');
    await store().flush('Plan.md');
    expect(vault.files.get('Plan.md')?.text).toBe('# Plan\nShip it today');
    expect(store().buffers).toEqual({});
  });

  it('never writes over a change it has not read, and keeps both', async () => {
    store().edit('Plan.md', 'my edit');
    vault.files.set('Plan.md', { text: 'their edit', modifiedMs: 999 });
    await store().flush('Plan.md');
    expect(vault.files.get('Plan.md')?.text).toBe('their edit');
    expect(store().conflicts['Plan.md']).toBe('their edit');

    await store().resolveConflict('Plan.md', 'mine');
    expect(vault.files.get('Plan.md')?.text).toBe('my edit');
    expect(store().conflicts).toEqual({});
  });

  it('reloads a note changed on disk unless it holds an unsaved edit', async () => {
    vault.files.set('Plan.md', { text: 'from Obsidian', modifiedMs: 1000 });
    await store().refresh();
    expect(store().texts['Plan.md']).toBe('from Obsidian');

    store().edit('Daily/2026-10-28.md', 'typing');
    vault.files.set('Daily/2026-10-28.md', { text: 'from the phone', modifiedMs: 1001 });
    await store().refresh();
    expect(store().conflicts['Daily/2026-10-28.md']).toBe('from the phone');
    await store().resolveConflict('Daily/2026-10-28.md', 'disk');
    expect(store().textOf('Daily/2026-10-28.md')).toBe('from the phone');
  });

  it('notices notes added and deleted outside BorgDock', async () => {
    vault.files.set('New.md', { text: 'hi', modifiedMs: 2000 });
    vault.files.delete('Plan.md');
    await store().refresh();
    expect(Object.keys(store().texts).sort()).toEqual(['Daily/2026-10-28.md', 'New.md']);
  });

  it('creates numbered notes when the title is taken', async () => {
    expect(await store().createNote('Plan', '')).toBe('Plan 2.md');
    expect(vault.files.has('Plan 2.md')).toBe(true);
  });

  it('renames a note and points the links at it', async () => {
    const target = await store().rename('Plan.md', 'Launch plan');
    expect(target).toBe('Launch plan.md');
    expect(vault.files.get('Daily/2026-10-28.md')?.text).toBe('Waiting on [[Launch plan]]');
    expect(store().index.backlinks.get('Launch plan.md')).toHaveLength(1);
  });

  it('refuses to rename a note whose edit could not be saved, and keeps the edit', async () => {
    store().edit('Plan.md', 'my edit');
    vault.files.set('Plan.md', { text: 'their edit', modifiedMs: 999 });
    await expect(store().rename('Plan.md', 'Launch plan')).rejects.toThrow(/not saved/);
    expect(store().buffers['Plan.md']).toBe('my edit');
    expect(vault.files.get('Plan.md')?.text).toBe('their edit');
    expect(vault.files.has('Launch plan.md')).toBe(false);
  });

  it('saves a note once when the autosave and a note switch flush it together', async () => {
    store().edit('Plan.md', 'one save');
    await Promise.all([store().flush('Plan.md'), store().flush('Plan.md')]);
    expect(vault.files.get('Plan.md')?.text).toBe('one save');
    expect(store().conflicts).toEqual({});
    expect(store().buffers).toEqual({});
  });

  it('moves the threads started from a note along with a rename', async () => {
    trackThread({ path: 'Plan.md', hostId: 'local', threadId: 't-1', label: 'Run', startedAt: 1 });
    await store().rename('Plan.md', 'Launch plan');
    expect(readTracked()).toEqual([
      { path: 'Launch plan.md', hostId: 'local', threadId: 't-1', label: 'Run', startedAt: 1 },
    ]);
  });

  it('updates a note from what the file holds now', async () => {
    vault.files.set('Plan.md', { text: 'newer', modifiedMs: 3000 });
    expect(await store().update('Plan.md', (text) => `${text}\nappended`)).toBe(true);
    expect(vault.files.get('Plan.md')?.text).toBe('newer\nappended');
    expect(await store().update('Missing.md', (text) => (text === null ? 'created' : null))).toBe(
      true,
    );
    expect(vault.files.get('Missing.md')?.text).toBe('created');
  });
});
