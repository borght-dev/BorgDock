import { describe, expect, it } from 'vitest';
import { fixLabel, monitorLabel, terminalAgent } from '../agent-labels';

describe('agent labels', () => {
  it('name the agent that runs, and a T3 thread when T3 is the provider', () => {
    expect(['claude', 'codex', 't3'].map((p) => fixLabel(p as 'claude'))).toEqual([
      'Fix with Claude',
      'Fix with Codex',
      'Start thread in T3',
    ]);
    expect(monitorLabel('t3')).toBe('Monitor in T3');
    expect(monitorLabel('codex')).toBe('Monitor with Codex');
  });

  it('fall back to Claude Code where only a terminal can run', () => {
    expect(terminalAgent('t3')).toBe('claude');
    expect(terminalAgent('codex')).toBe('codex');
  });
});
