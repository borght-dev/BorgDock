import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useBackgroundIndexer } from '../use-background-indexer';

const mocks = vi.hoisted(() => ({ read: vi.fn(), symbols: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.read }));
vi.mock('@/services/symbol-indexer', () => ({ indexSymbols: mocks.symbols }));
beforeEach(() => {
  vi.clearAllMocks();
});

it('indexes through the worker interface and publishes completed progress', async () => {
  mocks.read.mockResolvedValue('function demo() {}');
  mocks.symbols.mockResolvedValue([{ name: 'demo', rel_path: 'file.ts', line: 1 }]);
  const files = [{ rel_path: 'file.ts', size: 18 }];
  const { result } = renderHook(() => useBackgroundIndexer('/work', files));
  await waitFor(() => expect(result.current.processed).toBe(1));
  expect(result.current.indexing).toBe(false);
  expect(result.current.entries).toEqual([{ name: 'demo', rel_path: 'file.ts', line: 1 }]);
  expect(mocks.symbols).toHaveBeenCalledWith(
    'file.ts',
    'function demo() {}',
    expect.any(AbortSignal),
  );
});

it('discards a pending file read when the selected root changes', async () => {
  let finishOld!: (content: string) => void;
  mocks.read
    .mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finishOld = resolve;
      }),
    )
    .mockResolvedValue('new');
  mocks.symbols.mockResolvedValue([{ name: 'new', rel_path: 'file.ts', line: 1 }]);
  const files = [{ rel_path: 'file.ts', size: 3 }];
  const { result, rerender } = renderHook(({ root }) => useBackgroundIndexer(root, files), {
    initialProps: { root: '/old' },
  });
  rerender({ root: '/new' });
  await waitFor(() => expect(result.current.processed).toBe(1));
  finishOld('obsolete');
  await Promise.resolve();
  expect(mocks.symbols).toHaveBeenCalledOnce();
  expect(result.current.entries[0]?.name).toBe('new');
});
