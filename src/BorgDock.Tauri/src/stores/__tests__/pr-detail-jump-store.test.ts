import { beforeEach, describe, expect, it } from 'vitest';
import { usePrDetailJumpStore } from '../pr-detail-jump-store';

describe('pr-detail-jump-store', () => {
  beforeEach(() => {
    usePrDetailJumpStore.getState().clearJumpTarget();
  });

  it('starts with no target', () => {
    expect(usePrDetailJumpStore.getState().target).toBeNull();
  });

  it('setJumpTarget assigns a non-null target', () => {
    usePrDetailJumpStore.getState().setJumpTarget({
      filePath: 'a.ts',
      line: 12,
      threadId: 't1',
      ts: 1,
    });
    expect(usePrDetailJumpStore.getState().target).toEqual({
      filePath: 'a.ts',
      line: 12,
      threadId: 't1',
      ts: 1,
    });
  });

  it('repeated setJumpTarget with same coordinates produces a new ts so subscribers re-fire', () => {
    usePrDetailJumpStore.getState().setJumpTarget({
      filePath: 'a.ts',
      line: 12,
      ts: 1,
    });
    usePrDetailJumpStore.getState().setJumpTarget({
      filePath: 'a.ts',
      line: 12,
      ts: 2,
    });
    expect(usePrDetailJumpStore.getState().target?.ts).toBe(2);
  });

  it('clearJumpTarget resets to null', () => {
    usePrDetailJumpStore.getState().setJumpTarget({ filePath: 'a.ts', line: 1, ts: 1 });
    usePrDetailJumpStore.getState().clearJumpTarget();
    expect(usePrDetailJumpStore.getState().target).toBeNull();
  });
});
