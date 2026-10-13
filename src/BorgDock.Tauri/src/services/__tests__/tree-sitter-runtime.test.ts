import { renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useBackgroundIndexer } from '@/components/file-palette/use-background-indexer';
import { highlightLines } from '../syntax-highlighter';

const treeSitter = vi.hoisted(() => ({ init: vi.fn(), setLanguage: vi.fn(), load: vi.fn() }));
vi.mock('web-tree-sitter', () => ({
  Parser: class {
    static init = treeSitter.init;
    setLanguage = treeSitter.setLanguage;
    parse() {
      return null;
    }
    delete() {}
  },
  Language: { load: treeSitter.load },
  Query: class {
    delete() {}
  },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue('const x = 1;') }));

it('initializes once when highlighting and symbol indexing boot together', async () => {
  treeSitter.init.mockResolvedValue(undefined);
  treeSitter.load.mockResolvedValue({});
  const files = [{ rel_path: 'file.ts', size: 12 }];
  const { result } = renderHook(() => useBackgroundIndexer('/work', files));
  await highlightLines('preview.ts', ['const x = 1;']);
  await waitFor(() => expect(result.current.indexing).toBe(false));
  expect(result.current.processed).toBe(1);
  expect(treeSitter.setLanguage).toHaveBeenCalledTimes(2);
  expect(treeSitter.init).toHaveBeenCalledTimes(1);
});
