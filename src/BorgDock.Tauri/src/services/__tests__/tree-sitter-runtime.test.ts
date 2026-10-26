import { expect, it, vi } from 'vitest';
import { extractSymbols } from '../symbol-engine';
import { highlightLines } from '../syntax-engine';

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

it('initializes once per worker when highlighting and symbol extraction boot together', async () => {
  treeSitter.init.mockResolvedValue(undefined);
  treeSitter.load.mockResolvedValue({});
  await Promise.all([
    highlightLines('preview.ts', ['const x = 1;']),
    extractSymbols('file.ts', ['const x = 1;']),
  ]);
  expect(treeSitter.setLanguage).toHaveBeenCalledTimes(2);
  expect(treeSitter.init).toHaveBeenCalledTimes(1);
});
