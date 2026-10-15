import { describe, expect, it } from 'vitest';
import {
  configuredPrompts,
  currentIteration,
  DEFAULT_LAUNCH_PROMPTS,
  itemLines,
  suggestPrompt,
  syncPrompt,
} from '../launch';
import type { ItemOverview } from '../types';
import { makeItem } from './fixtures';

function unit(id: number, state: string, title: string): ItemOverview {
  return {
    item: makeItem({ id, state, title }),
    bay: 'drift',
    waitingFor: null,
    suggestion: null,
    pullRequest: null,
    pullRequests: [],
    threads: [],
    queued: false,
    verdict: { label: 'Ready for QA', tone: 'ok' },
    evidence: [{ label: '#4908 merged today', tone: 'ok' }],
    latest: null,
  };
}

describe('sync prompt', () => {
  it('lists each item with its state, verdict and evidence', () => {
    expect(itemLines([unit(60107, 'Code Review', 'Replace ImageSharp')])).toBe(
      '- AB#60107 Replace ImageSharp (Code Review): Ready for QA; #4908 merged today',
    );
  });

  it('fills {items} and points the agent at the repository skills', () => {
    const prompt = syncPrompt(
      [unit(60107, 'Code Review', 'Replace ImageSharp')],
      DEFAULT_LAUNCH_PROMPTS,
    );
    expect(prompt).toContain('- AB#60107 Replace ImageSharp (Code Review)');
    expect(prompt).toContain('ado-update-for-qa');
    expect(prompt).not.toContain('{items}');
  });

  it('names the state the evidence points to, or the one I asked for', () => {
    const drifting: ItemOverview = {
      ...unit(60107, 'Code Review', 'Replace ImageSharp'),
      verdict: { label: 'Out of sync', tone: 'warn' },
      suggestion: {
        id: '60107:merged:4908:Ready For QA',
        to: 'Ready For QA',
        reason: 'PR 4908 is merged. ADO still says Code Review.',
      },
    };
    expect(itemLines([drifting])).toBe(
      '- AB#60107 Replace ImageSharp (Code Review): Out of sync; #4908 merged today. Move it to Ready For QA: PR 4908 is merged. ADO still says Code Review.',
    );
    expect(itemLines([drifting], { kind: 'item', itemId: 60107, to: 'Ready For QA' })).toBe(
      itemLines([drifting]),
    );
    expect(itemLines([drifting], { kind: 'item', itemId: 60107, to: 'Done' })).toMatch(
      /\. Move it to Done: I asked for this\.$/,
    );
  });

  it('uses the template from Settings when there is one', () => {
    const prompts = configuredPrompts({ sync: 'Do these:\n{items}' });
    expect(syncPrompt([unit(1, 'Code Review', 'One')], prompts)).toBe(
      'Do these:\n- AB#1 One (Code Review): Ready for QA; #4908 merged today',
    );
  });
});

describe('suggest prompt', () => {
  const items = [
    makeItem({ id: 1, state: 'New', iterationPath: 'Shop\\Release 5\\Sprint 12' }),
    makeItem({ id: 2, state: 'Code Review', iterationPath: 'Shop\\Release 5\\Sprint 12' }),
    makeItem({ id: 3, state: 'New', iterationPath: 'Shop\\Release 5\\Sprint 11' }),
    makeItem({ id: 4, state: 'New', sprint: 'Backlog', iterationPath: 'Shop' }),
    makeItem({ id: 5, state: 'New', assignedToMe: false, title: 'Starred, not mine' }),
  ];

  it('takes the sprint most of my items are in, leaving the backlog out', () => {
    expect(currentIteration(items)).toBe('Shop\\Release 5\\Sprint 12');
    expect(currentIteration([items[3]!])).toBeNull();
  });

  it('names the sprint and my open items', () => {
    const prompt = suggestPrompt(items, DEFAULT_LAUNCH_PROMPTS);
    expect(prompt).toContain('current sprint (Shop\\Release 5\\Sprint 12)');
    expect(prompt).toContain('- AB#2 Item 2 (Code Review)');
    expect(prompt).not.toContain('Starred, not mine');
  });
});
