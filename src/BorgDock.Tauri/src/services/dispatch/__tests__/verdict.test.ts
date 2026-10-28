import { describe, expect, it } from 'vitest';
import type {
  AgentThread,
  DispatchItem,
  LinkedPullRequest,
  UnitPullRequest,
  WorkflowState,
} from '../types';
import { driftOf, evidenceOf, type ItemFacts, latestMessage, verdictOf } from '../verdict';
import { makeItem, makeThread } from './fixtures';

const NOW = new Date('2026-10-13T12:00:00Z');

const FLOW: WorkflowState[] = [
  { name: 'New', category: 'Proposed' },
  { name: 'Development In Progress', category: 'InProgress' },
  { name: 'Testing Failed', category: 'InProgress' },
  { name: 'Needs Human', category: 'InProgress' },
  { name: 'Code Review', category: 'Resolved' },
  { name: 'Ready For QA', category: 'Resolved' },
  { name: 'Done', category: 'Completed' },
];

function item(overrides: Partial<DispatchItem> & { id?: number } = {}): DispatchItem {
  return makeItem({ id: 60107, states: FLOW, changedAt: '2026-10-12T09:00:00Z', ...overrides });
}

function links(...numbers: number[]): LinkedPullRequest[] {
  return numbers.map((number) => ({ repositoryId: 'shop', number }));
}

function pr(overrides: Partial<UnitPullRequest> & { number: number }): UnitPullRequest {
  return {
    url: `https://github.com/acme/shop/pull/${overrides.number}`,
    state: 'open',
    title: '',
    isDraft: false,
    branch: null,
    checks: null,
    approved: false,
    shared: false,
    mergedAt: null,
    ...overrides,
  };
}

function facts(
  itemOverrides: Partial<DispatchItem>,
  rest: { threads?: AgentThread[]; pullRequests?: UnitPullRequest[] } = {},
): ItemFacts {
  const found: ItemFacts = {
    item: item(itemOverrides),
    threads: rest.threads ?? [],
    pullRequests: rest.pullRequests ?? [],
    now: NOW,
  };
  return { ...found, drift: driftOf(found) };
}

const GREEN = { passed: 12, failed: 0, pending: 0, total: 12 };
const RED = { passed: 10, failed: 2, pending: 0, total: 12 };
const RUNNING = { passed: 4, failed: 0, pending: 8, total: 12 };

describe('verdictOf', () => {
  it('puts an agent that waits on you above everything', () => {
    const thread = makeThread({ id: 't', status: 'question' });
    expect(verdictOf(facts({ state: 'Code Review' }, { threads: [thread] }))).toEqual({
      label: 'Agent asks',
      tone: 'bad',
    });
  });

  it('counts the days Needs Human has waited since the last comment', () => {
    const lastComment = {
      author: 'Vera · plan',
      at: '2026-10-07T11:31:00Z',
      text: 'I need your decision.',
      byMe: false,
    };
    expect(verdictOf(facts({ state: 'Needs Human', lastComment }))).toEqual({
      label: 'Waiting on you · 6 days',
      tone: 'bad',
    });
  });

  it('calls Needs Human answered once the newest comment is mine', () => {
    const lastComment = {
      author: 'Me',
      at: '2026-10-13T11:34:00Z',
      text: 'Fix all 66.',
      byMe: true,
    };
    expect(verdictOf(facts({ state: 'Needs Human', lastComment }))).toEqual({
      label: 'You answered',
      tone: 'mute',
    });
  });

  it('flags an overdue item that is not yet resolved', () => {
    expect(
      verdictOf(facts({ state: 'Development In Progress', dueDate: '2026-09-23T15:00:00Z' })),
    ).toEqual({ label: 'Overdue · 20 days', tone: 'bad' });
  });

  it('ignores the due date once the item is in review', () => {
    const merged = pr({ number: 4908, state: 'merged' });
    expect(
      verdictOf(
        facts(
          { state: 'Code Review', dueDate: '2026-09-23T15:00:00Z' },
          { pullRequests: [merged] },
        ),
      ).label,
    ).toBe('Out of sync');
  });

  describe('in Code Review', () => {
    it('is out of sync when a pull request merged and none is open', () => {
      const merged = pr({ number: 4908, state: 'merged' });
      expect(verdictOf(facts({ state: 'Code Review' }, { pullRequests: [merged] }))).toEqual({
        label: 'Out of sync',
        tone: 'warn',
      });
    });

    it('is red while the open pull request fails its checks', () => {
      const open = pr({ number: 4909, checks: RED });
      expect(verdictOf(facts({ state: 'Code Review' }, { pullRequests: [open] })).label).toBe(
        'CI red',
      );
    });

    it('is ready to merge when approved and green', () => {
      const open = pr({ number: 4898, checks: GREEN, approved: true });
      expect(verdictOf(facts({ state: 'Code Review' }, { pullRequests: [open] }))).toEqual({
        label: 'Ready to merge',
        tone: 'ok',
      });
    });

    it('waits while checks run', () => {
      const open = pr({ number: 4062, checks: RUNNING, approved: true });
      expect(verdictOf(facts({ state: 'Code Review' }, { pullRequests: [open] })).label).toBe(
        'Checks running',
      );
    });

    it('asks for a look when no pull request is known', () => {
      expect(verdictOf(facts({ state: 'Code Review' })).label).toBe('No open PR');
    });
  });

  it('calls anything past review With QA', () => {
    expect(verdictOf(facts({ state: 'Ready For QA' }))).toEqual({ label: 'With QA', tone: 'mute' });
  });

  describe('in development', () => {
    it('is fine while an agent runs', () => {
      const thread = makeThread({ id: 't', status: 'running' });
      expect(verdictOf(facts({ state: 'Development In Progress' }, { threads: [thread] }))).toEqual(
        { label: 'Agent on it', tone: 'run' },
      );
    });

    it('bounces back from Testing Failed', () => {
      expect(verdictOf(facts({ state: 'Testing Failed' }))).toEqual({
        label: 'Bounced back',
        tone: 'bad',
      });
    });

    it('is out of sync once a ready pull request is open', () => {
      const open = pr({ number: 4928, checks: RED });
      expect(
        verdictOf(facts({ state: 'Development In Progress' }, { pullRequests: [open] })).label,
      ).toBe('Out of sync');
    });

    it('asks for the next step when every pull request is merged and no agent works on it', () => {
      expect(
        verdictOf(
          facts({ state: 'Development In Progress', linkedPullRequests: links(4871, 4872) }),
        ),
      ).toEqual({ label: 'Next step?', tone: 'warn' });
    });

    it('says nobody is on an item without pull request, agent, notes or comments', () => {
      expect(verdictOf(facts({ state: 'Development In Progress' })).label).toBe('Nobody on it');
    });

    it('goes quiet after five days without a sign of life', () => {
      const notes = { text: 'Design.', date: '2026-10-01' };
      expect(
        verdictOf(
          facts({ state: 'Development In Progress', notes, changedAt: '2026-10-01T09:00:00Z' }),
        ).label,
      ).toBe('Quiet · 12 days');
    });

    it('is in progress while notes keep coming', () => {
      const notes = { text: 'Built, pushed, no PR yet.', date: '2026-10-13' };
      expect(verdictOf(facts({ state: 'Development In Progress', notes }))).toEqual({
        label: 'In progress',
        tone: 'mute',
      });
    });
  });

  it('has not started a New item', () => {
    expect(verdictOf(facts({ state: 'New' }))).toEqual({ label: 'Not started', tone: 'mute' });
  });
});

describe('evidenceOf', () => {
  it('lists the open and the merged pull request, the agent and the due date', () => {
    const open = pr({ number: 4928, checks: RED });
    const merged = pr({ number: 4871, state: 'merged', mergedAt: '2026-10-12T13:24:00Z' });
    const thread = makeThread({ id: 't', status: 'running', place: 'W4' });
    expect(
      evidenceOf(
        facts(
          { state: 'Development In Progress', dueDate: '2026-11-06T16:00:00Z', priority: 1 },
          { pullRequests: [open, merged], threads: [thread] },
        ),
      ),
    ).toEqual([
      { label: '#4928 · checks failing', tone: 'bad' },
      { label: '#4871 merged yesterday', tone: null },
      { label: 'agent running · W4', tone: 'run' },
      { label: 'due 6 Nov', tone: null },
      { label: 'P1', tone: 'warn' },
    ]);
  });

  it('says what is missing on an item in development', () => {
    expect(evidenceOf(facts({ state: 'Development In Progress' }))).toEqual([
      { label: 'no PR', tone: null },
      { label: 'no agent', tone: null },
    ]);
  });

  it('counts linked pull requests BorgDock does not poll', () => {
    expect(evidenceOf(facts({ state: 'Code Review', linkedPullRequests: links(1, 2, 3) }))).toEqual(
      [{ label: '3 linked PRs', tone: null }],
    );
  });
});

describe('latestMessage', () => {
  const lastComment = {
    author: 'Vera · proof',
    at: '2026-10-12T17:57:00Z',
    text: 'After: owned output.',
    byMe: false,
  };

  it('takes notes dated after the newest comment', () => {
    const notes = { text: 'Update (2026-10-13) - merged.', date: '2026-10-13' };
    expect(latestMessage(item({ notes, lastComment }), [])).toEqual({
      source: 'notes',
      author: 'Developer Notes',
      at: '2026-10-13',
      text: 'Update (2026-10-13) - merged.',
    });
  });

  it('prefers a comment made the same day as the notes', () => {
    const notes = { text: 'Update.', date: '2026-10-12' };
    expect(latestMessage(item({ notes, lastComment }), [])?.source).toBe('comment');
  });

  it('takes the agent when it spoke last', () => {
    const thread = makeThread({
      id: 't',
      place: 'W4',
      lastActivityAt: '2026-10-13T11:22:00Z',
      lastAgentMessage: 'Found a semantic\n\nmerge conflict.',
    });
    expect(latestMessage(item({ lastComment }), [thread])).toEqual({
      source: 'agent',
      author: 'Agent · W4',
      at: '2026-10-13T11:22:00Z',
      text: 'Found a semantic merge conflict.',
    });
  });

  it('is null when nothing was said', () => {
    expect(latestMessage(item(), [])).toBeNull();
  });
});

describe('driftOf', () => {
  const BUG_FLOW: WorkflowState[] = [
    { name: 'New', category: 'Proposed' },
    { name: 'Plan Review', category: 'Proposed' },
    { name: 'Development In Progress', category: 'InProgress' },
    { name: 'Needs Human', category: 'InProgress' },
    { name: 'Code Review', category: 'Resolved' },
    { name: 'Ready For QA', category: 'Resolved' },
    { name: 'Test In Progress', category: 'Resolved' },
    { name: 'Done', category: 'Completed' },
  ];
  const drift = (
    state: string,
    rest: { threads?: AgentThread[]; pullRequests?: UnitPullRequest[] } = {},
  ) => facts({ state, states: BUG_FLOW }, rest).drift;

  it('moves a merged item on to QA', () => {
    expect(drift('Code Review', { pullRequests: [pr({ number: 4908, state: 'merged' })] })).toEqual(
      {
        to: 'Ready For QA',
        reason: 'PR 4908 is merged. ADO still says Code Review.',
        evidence: 'merged:4908',
      },
    );
  });

  it('moves an item with an open pull request to Code Review, never Plan Review', () => {
    expect(drift('New', { pullRequests: [pr({ number: 5004 })] })?.to).toBe('Code Review');
  });

  it('leaves an item that is already past the state the evidence asks for', () => {
    const merged = pr({ number: 4908, state: 'merged' });
    expect(drift('Test In Progress', { pullRequests: [merged] })).toBeNull();
    expect(drift('Code Review', { pullRequests: [pr({ number: 5004 })] })).toBeNull();
  });

  it('leaves a state a person put the item in', () => {
    expect(drift('Needs Human', { pullRequests: [pr({ number: 5004 })] })).toBeNull();
  });

  it('names the move while the agent runs, under the verdict of the agent', () => {
    const running = makeThread({ id: 't', status: 'running' });
    const found = facts(
      { state: 'Development In Progress', states: BUG_FLOW },
      { pullRequests: [pr({ number: 5002 })], threads: [running] },
    );
    expect(found.drift?.to).toBe('Code Review');
    expect(verdictOf(found).label).toBe('Agent on it');
  });

  it('takes no pull request shared with other items as evidence', () => {
    const plan = pr({ number: 4991, state: 'merged', shared: true });
    expect(drift('Development In Progress', { pullRequests: [plan] })).toBeNull();
  });

  it('moves a new item an agent stopped on to Development In Progress', () => {
    const stopped = makeThread({ id: 't', status: 'your-turn', place: 'W3' });
    expect(drift('New', { threads: [stopped] })).toMatchObject({
      to: 'Development In Progress',
      reason: 'An agent works on it in W3. ADO still says New.',
    });
  });
});
