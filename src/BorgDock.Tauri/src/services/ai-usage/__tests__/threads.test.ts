import { describe, expect, it } from 'vitest';
import type { AgentThread } from '@/services/dispatch/types';
import { CLAUDE_OPS, CODEX_ACME } from '../__fixtures__/accounts';
import { threadsStoppedOn } from '../threads';

const LIMIT = { requestId: 'r1', runId: 'run:ordinal:4', resetAt: '2026-11-26T09:00:00Z' };

function thread(overrides: Partial<AgentThread> & { runStatus?: string; runId?: string } = {}) {
  const { runStatus = 'completed', runId = 'run:ordinal:4', ...rest } = overrides;
  return {
    id: 't1',
    hostId: 'local',
    open: true,
    modelInstance: 'claudeAgent_ops',
    run: { id: runId, status: runStatus, limitRecovery: LIMIT },
    ...rest,
  } as unknown as AgentThread;
}

describe('threadsStoppedOn', () => {
  it("counts an open thread whose newest run stopped on the account's limit", () => {
    expect(threadsStoppedOn(CLAUDE_OPS, [thread()])).toHaveLength(1);
  });

  it('leaves out a thread that works again or ran again after the limit', () => {
    expect(threadsStoppedOn(CLAUDE_OPS, [thread({ runStatus: 'running' })])).toEqual([]);
    expect(threadsStoppedOn(CLAUDE_OPS, [thread({ runId: 'run:ordinal:5' })])).toEqual([]);
  });

  it('leaves out settled threads, other accounts and other machines', () => {
    expect(threadsStoppedOn(CLAUDE_OPS, [thread({ open: false })])).toEqual([]);
    expect(threadsStoppedOn(CLAUDE_OPS, [thread({ modelInstance: 'claudeAgent' })])).toEqual([]);
    expect(threadsStoppedOn(CLAUDE_OPS, [thread({ hostId: 'mini' })])).toEqual([]);
  });

  it('counts nothing for an account T3 Code does not run on', () => {
    expect(threadsStoppedOn(CODEX_ACME, [thread({ modelInstance: 'codex_acme' })])).toEqual([]);
  });
});
