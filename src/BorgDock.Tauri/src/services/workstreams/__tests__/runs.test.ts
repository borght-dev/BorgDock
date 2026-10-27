import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/services/workstreams/storage';
import {
  resetWorkstreamsStore,
  settleWrites,
  setWorkstreamStorage,
  useWorkstreamsStore,
} from '@/stores/workstreams-store';
import { startWorkstreamRun } from '../runs';

const launch = vi.hoisted(() => vi.fn(async () => 'thread-1'));
vi.mock('@/services/t3/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/t3/api')>()),
  t3LaunchThread: launch,
}));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(async () => {}),
  readFromTauriStore: vi.fn(async () => undefined),
}));

beforeEach(async () => {
  resetWorkstreamsStore();
  setWorkstreamStorage(memoryStorage());
  launch.mockClear();
  await useWorkstreamsStore.getState().load(null);
});

afterEach(async () => {
  await settleWrites();
  resetWorkstreamsStore();
});

describe('startWorkstreamRun', () => {
  it('starts no thread while the workstream waits for a conflict to be resolved', async () => {
    const id = useWorkstreamsStore.getState().create('Checkout');
    const entry = useWorkstreamsStore.getState().entries[id]!;
    useWorkstreamsStore.setState({
      entries: { [id]: { ...entry, conflict: { conflicts: [] } as never } },
    });
    await expect(
      startWorkstreamRun({
        workstreamId: id,
        kind: 'review',
        slot: { available: true, state: 'free' } as never,
        model: {} as never,
        effort: null,
        prompt: 'Review it',
        planFirst: false,
        openInT3: false,
      }),
    ).rejects.toThrow('Choose what to keep');
    expect(launch).not.toHaveBeenCalled();
  });
});
