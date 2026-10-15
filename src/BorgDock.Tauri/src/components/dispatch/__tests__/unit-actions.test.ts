import { describe, expect, it, vi } from 'vitest';
import { makeItem, makeThread } from '@/services/dispatch/__tests__/fixtures';
import type { AgentThread, ItemOverview } from '@/services/dispatch/types';
import { type DispatchActions, unitActions } from '../unit-actions';
import { dueLabel, shortAge, whyLine } from '../unit-copy';

function makeOverview(overrides: Partial<ItemOverview> = {}): ItemOverview {
  return {
    item: makeItem({ id: 60201 }),
    bay: 'idle',
    waitingFor: null,
    suggestion: null,
    pullRequest: null,
    pullRequests: [],
    threads: [],
    queued: false,
    verdict: { label: 'Not started', tone: 'mute' },
    evidence: [],
    latest: null,
    ...overrides,
  };
}

function questionThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return makeThread({
    id: 't',
    status: 'question',
    questionRequestId: 'req',
    questions: [
      {
        id: 'q',
        question: 'Row id or pixel offset?',
        options: [
          { label: 'Restore by row id', value: 'row-id' },
          { label: 'Restore by pixel offset', value: 'offset' },
        ],
        recommended: 0,
        allowCustomAnswer: true,
        multiSelect: false,
      },
    ],
    ...overrides,
  });
}

const ids = (overview: ItemOverview) => unitActions(overview).map((a) => a.id);
const primary = (overview: ItemOverview) => unitActions(overview).find((a) => a.primary)?.id;

function spyActions(): DispatchActions {
  return {
    answer: vi.fn(),
    approvePlan: vi.fn(),
    settle: vi.fn(),
    openInT3: vi.fn(),
    move: vi.fn(),
    hideSuggestion: vi.fn(),
    start: vi.fn(),
    queue: vi.fn(),
    unqueue: vi.fn(),
    openInAdo: vi.fn(),
    openPullRequest: vi.fn(),
  };
}

describe('unitActions', () => {
  it('offers Start and Up next for an item nobody started', () => {
    expect(ids(makeOverview())).toEqual(['start', 'queue']);
    expect(primary(makeOverview())).toBe('start');
  });

  it('swaps Up next for its removal once the item is queued', () => {
    expect(ids(makeOverview({ bay: 'next', queued: true }))).toEqual(['start', 'unqueue']);
  });

  it('answers a question with the recommended option', () => {
    const thread = questionThread();
    const overview = makeOverview({ bay: 'waiting', threads: [thread] });
    expect(ids(overview)).toEqual(['answer-recommended', 'open-t3']);
    const actions = spyActions();
    unitActions(overview)[0]?.run(actions);
    expect(actions.answer).toHaveBeenCalledWith(thread, { q: 'row-id' });
  });

  it('does not answer for you when the agent recommends nothing', () => {
    const thread = questionThread();
    thread.questions[0]!.recommended = null;
    expect(ids(makeOverview({ bay: 'waiting', threads: [thread] }))).toEqual(['open-t3']);
  });

  it('approves a plan, with T3 one click away', () => {
    const overview = makeOverview({
      bay: 'waiting',
      threads: [makeThread({ id: 't', status: 'plan' })],
    });
    expect(ids(overview)).toEqual(['approve-plan', 'open-t3']);
    expect(primary(overview)).toBe('approve-plan');
  });

  it('moves the item first when the agent finished and ADO lags behind', () => {
    const overview = makeOverview({
      bay: 'waiting',
      threads: [makeThread({ id: 't', status: 'your-turn' })],
      suggestion: { id: 's', to: 'Code Review', reason: 'PR 7 is open.' },
    });
    expect(ids(overview)).toEqual(['move', 'keep', 'settle', 'open-t3']);
    expect(primary(overview)).toBe('move');
  });

  it('settles a finished thread when there is nothing to move', () => {
    const overview = makeOverview({
      bay: 'waiting',
      threads: [makeThread({ id: 't', status: 'your-turn' })],
    });
    expect(primary(overview)).toBe('settle');
  });

  it('sends a failed agent to T3', () => {
    const overview = makeOverview({
      bay: 'waiting',
      threads: [makeThread({ id: 't', status: 'failed' })],
    });
    expect(ids(overview)).toEqual(['open-t3', 'settle']);
  });

  it('leaves only ADO for an item that was handed off', () => {
    expect(ids(makeOverview({ bay: 'handed' }))).toEqual(['open-ado']);
  });

  it('does not act on a thread whose host is offline', () => {
    const overview = makeOverview({
      bay: 'waiting',
      threads: [makeThread({ id: 't', status: 'plan', available: false })],
    });
    expect(ids(overview)).toEqual(['open-t3']);
  });
});

describe('unit copy', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');

  it('writes short ages', () => {
    expect(shortAge('2026-10-12T11:59:40Z', now)).toBe('just now');
    expect(shortAge('2026-10-12T11:56:00Z', now)).toBe('4 min');
    expect(shortAge('2026-10-12T09:00:00Z', now)).toBe('3 h');
    expect(shortAge('2026-10-09T12:00:00Z', now)).toBe('3 d');
  });

  it('flags a due date that has passed', () => {
    expect(dueLabel('2026-10-14T00:00:00Z', now)).toEqual({ label: 'Due 14 Oct', overdue: false });
    expect(dueLabel('2026-10-10T00:00:00Z', now)?.overdue).toBe(true);
    expect(dueLabel(null, now)).toBeNull();
  });

  it('says why a waiting item waits', () => {
    const overview = makeOverview({
      bay: 'waiting',
      threads: [
        makeThread({
          id: 't',
          status: 'question',
          slot: 'W3',
          lastActivityAt: '2026-10-12T11:56:00Z',
        }),
      ],
    });
    expect(whyLine(overview, now)).toBe('Agent asks in W3, 4 min ago');
  });

  it('gives the state, priority and due date of an item nobody started', () => {
    const overview = makeOverview({
      item: makeItem({ id: 1, priority: 1, dueDate: '2026-10-14T00:00:00Z' }),
    });
    expect(whyLine(overview, now)).toBe('New, P1, Due 14 Oct');
  });

  it('repeats the reason of an item that is out of sync', () => {
    const overview = makeOverview({
      bay: 'drift',
      suggestion: {
        id: 's',
        to: 'Ready For QA',
        reason: 'PR 9 is merged. ADO still says Code Review.',
      },
    });
    expect(whyLine(overview, now)).toBe('PR 9 is merged. ADO still says Code Review.');
  });
});
