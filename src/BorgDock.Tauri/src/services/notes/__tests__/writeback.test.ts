import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatchStore } from '@/stores/dispatch-store';
import { setNotesStorage, useNotesStore } from '@/stores/notes-store';
import { memoryNotesStorage } from '../storage';
import { readTracked, trackThread } from '../thread-tracking';
import { startThreadWriteback } from '../writeback';

const lastMessage = vi.hoisted(() => vi.fn());
vi.mock('@/services/t3/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/t3/api')>()),
  t3ThreadLastMessage: lastMessage,
}));

let vault: ReturnType<typeof memoryNotesStorage>;
let stop: () => void = () => {};

beforeEach(async () => {
  window.localStorage.clear();
  vault = memoryNotesStorage({ 'Plan.md': '# Plan\n' });
  setNotesStorage(vault);
  await useNotesStore.getState().load(null);
});

afterEach(() => {
  stop();
});

it('writes a result into the renamed note when the rename lands while the message is read', async () => {
  trackThread({
    path: 'Plan.md',
    hostId: 'local',
    threadId: 't-1',
    label: 'Run',
    startedAt: Date.now(),
  });
  lastMessage.mockImplementation(async () => {
    await useNotesStore.getState().rename('Plan.md', 'Launch plan');
    return 'Done: the writer keeps the column.';
  });
  stop = startThreadWriteback();
  useDispatchStore.setState({
    threads: [{ id: 't-1', hostId: 'local', status: 'your-turn', available: true }] as never,
  });

  await vi.waitFor(() =>
    expect(vault.files.get('Launch plan.md')?.text).toContain('Done: the writer keeps the column.'),
  );
  expect(vault.files.has('Plan.md')).toBe(false);
  expect(readTracked().map((t) => t.path)).toEqual(['Launch plan.md']);
});
