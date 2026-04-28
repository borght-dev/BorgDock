import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  listWorktreeChanges, diffWorktreeVsHead, diffWorktreeVsBase,
  unifiedDiffToDiffFile,
} from '../worktree-changes';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('worktree-changes service', () => {
  beforeEach(() => { vi.mocked(invoke).mockReset(); });

  it('listWorktreeChanges invokes the matching Tauri command', async () => {
    vi.mocked(invoke).mockResolvedValue({
      vsHead: [], vsBase: [], baseBranch: 'main',
      baseBranchSource: 'fallback-main', detachedHead: false,
      mergeBaseUnavailable: false,
    });
    const out = await listWorktreeChanges('/wt');
    expect(invoke).toHaveBeenCalledWith('list_worktree_changes', { worktreePath: '/wt' });
    expect(out.baseBranch).toBe('main');
  });

  it('diffWorktreeVsHead invokes diff_worktree_vs_head', async () => {
    vi.mocked(invoke).mockResolvedValue({
      filePath: 'a', previousPath: null, hunks: [], binary: null, isSubmodule: false,
    });
    await diffWorktreeVsHead('/wt', 'a.ts');
    expect(invoke).toHaveBeenCalledWith('diff_worktree_vs_head', {
      worktreePath: '/wt', filePath: 'a.ts',
    });
  });

  it('diffWorktreeVsBase invokes diff_worktree_vs_base', async () => {
    vi.mocked(invoke).mockResolvedValue({
      filePath: 'a', previousPath: null, hunks: [], binary: null, isSubmodule: false,
    });
    await diffWorktreeVsBase('/wt', 'main', 'a.ts');
    expect(invoke).toHaveBeenCalledWith('diff_worktree_vs_base', {
      worktreePath: '/wt', baseBranch: 'main', filePath: 'a.ts',
    });
  });

  it('unifiedDiffToDiffFile prepends a hunk-header DiffLine and maps add/delete/context', () => {
    const out = unifiedDiffToDiffFile({
      filePath: 'src/a.ts',
      previousPath: 'src/old.ts',
      hunks: [{
        header: '@@ -1 +1,2 @@', oldStart: 1, oldCount: 1, newStart: 1, newCount: 2,
        lines: [
          { kind: 'context', content: 'a', oldLineNumber: 1, newLineNumber: 1 },
          { kind: 'add', content: 'b', oldLineNumber: null, newLineNumber: 2 },
        ],
      }],
      binary: null,
      isSubmodule: false,
    });
    expect(out.filename).toBe('src/a.ts');
    expect(out.previousFilename).toBe('src/old.ts');
    expect(out.status).toBe('renamed');
    expect(out.hunks?.length).toBe(1);
    // Frontend renderer expects each hunk's first DiffLine to be a hunk-header carrying the @@ string:
    const firstLine = out.hunks?.[0]?.lines[0];
    expect(firstLine?.type).toBe('hunk-header');
    expect(firstLine?.content).toBe('@@ -1 +1,2 @@');
    // Then the actual lines:
    const second = out.hunks?.[0]?.lines[1];
    expect(second?.type).toBe('context');
    const third = out.hunks?.[0]?.lines[2];
    expect(third?.type).toBe('add');
    // Stat counts:
    expect(out.additions).toBe(1);
    expect(out.deletions).toBe(0);
  });

  it('unifiedDiffToDiffFile sets isBinary when binary marker is present', () => {
    const out = unifiedDiffToDiffFile({
      filePath: 'a.bin', previousPath: null, hunks: [],
      binary: { oldSize: 1024, newSize: 2048 }, isSubmodule: false,
    });
    expect(out.isBinary).toBe(true);
  });
});
