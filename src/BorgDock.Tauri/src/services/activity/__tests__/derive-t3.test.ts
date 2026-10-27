import { describe, expect, it } from 'vitest';
import { deriveT3, ordinalOf, type T3Observation, type T3ThreadFacts } from '../derive/t3';
import { context, seedContext } from './context';

function thread(overrides: Partial<T3ThreadFacts> = {}): T3ThreadFacts {
  return {
    rawId: 'a',
    title: 'Fix login',
    slot: 'W3',
    createdAt: '2026-10-01T09:00:00.000Z',
    runId: 'run:thread:a:ordinal:3',
    runCompletedAt: '2026-10-27T07:00:00.000Z',
    runStatus: 'completed',
    stopRequested: false,
    lastError: null,
    lastErrorClass: null,
    pendingRequest: null,
    hasPlan: false,
    limitRecovery: null,
    lastVisitedAt: '2026-10-27T07:00:01.000Z',
    subagent: false,
    itemIds: [42],
    prUrls: [],
    detail: null,
    ...overrides,
  };
}

function observe(threads: T3ThreadFacts[], overrides: Partial<T3Observation> = {}): T3Observation {
  return {
    hostId: 'local',
    hostLabel: 'This laptop',
    threads,
    complete: true,
    seenInT3: true,
    ...overrides,
  };
}

function seeded(threads: T3ThreadFacts[] = [thread()]) {
  return deriveT3(seedContext(), null, observe(threads)).baseline;
}

const running = (ordinal: number) =>
  thread({ runId: `run:thread:a:ordinal:${ordinal}`, runStatus: 'running', runCompletedAt: null });
const completed = (ordinal: number, at = '2026-10-27T09:30:00.000Z') =>
  thread({ runId: `run:thread:a:ordinal:${ordinal}`, runStatus: 'completed', runCompletedAt: at });

describe('deriveT3', () => {
  it('seeds quietly', () => {
    const result = deriveT3(seedContext(), null, observe([thread({ runStatus: 'failed' })]));
    expect(result.entries).toEqual([]);
    expect(result.resolutions).toEqual([]);
    expect(result.baseline.threads.a?.runStatus).toBe('failed');
  });

  it('gives nothing new for the same observation twice', () => {
    const first = deriveT3(context(), seeded(), observe([running(4)]));
    const finished = deriveT3(context(), first.baseline, observe([completed(4)]));
    expect(finished.entries.map((e) => e.category)).toEqual(['agent.turn']);
    const again = deriveT3(context(), finished.baseline, observe([completed(4)]));
    expect(again.entries).toEqual([]);
  });

  it('keys a finished turn by its run and supersedes the previous one', () => {
    const result = deriveT3(context(), seeded(), observe([completed(4)]));
    const [turn] = result.entries;
    expect(turn?.id).toBe('t3:local|thread:a:run:run:thread:a:ordinal:4:completed');
    expect(turn?.sourceAt).toBe('2026-10-27T09:30:00.000Z');
    expect(turn?.needsYou).toBe(false);
    expect(result.resolutions).toContainEqual(
      expect.objectContaining({
        entityKey: 't3:local:thread:a',
        categories: ['agent.turn'],
        status: 'superseded',
      }),
    );
  });

  it('gives one entry for an ordinal gap', () => {
    const result = deriveT3(context({ coverage: 'catch-up' }), seeded(), observe([completed(7)]));
    expect(result.entries.map((e) => e.category).sort()).toEqual([
      'agent.turn',
      'agent.turns-missed',
    ]);
    const missed = result.entries.find((e) => e.category === 'agent.turns-missed');
    expect(missed?.id).toBe('t3:local|thread:a:runs:4-6');
    expect(missed?.summary).toContain('3 more turns');
    expect(missed?.coverage).toBe('catch-up');
  });

  it('counts the running run in the gap when it was never seen to finish', () => {
    const base = deriveT3(context(), seeded(), observe([running(4)])).baseline;
    const result = deriveT3(context(), base, observe([completed(6)]));
    expect(result.entries.find((e) => e.category === 'agent.turns-missed')?.id).toBe(
      't3:local|thread:a:runs:4-5',
    );
  });

  it('gives up on gaps when the run id does not parse, and still reports the turn', () => {
    expect(ordinalOf('run-42')).toBeNull();
    const base = seeded([thread({ runId: 'run-41' })]);
    const result = deriveT3(
      context(),
      base,
      observe([thread({ runId: 'run-42', runCompletedAt: '2026-10-27T09:00:00.000Z' })]),
    );
    expect(result.entries.map((e) => e.category)).toEqual(['agent.turn']);
  });

  it('makes a question that the detail read fills in later', () => {
    const asking = thread({
      runStatus: 'waiting',
      runId: 'run:thread:a:ordinal:4',
      pendingRequest: { id: 'req-1', kind: 'user_input', createdAt: '2026-10-27T09:10:00.000Z' },
    });
    const first = deriveT3(context(), seeded(), observe([asking]));
    expect(first.entries).toHaveLength(1);
    const [question] = first.entries;
    expect(question?.id).toBe('t3:local|thread:a:request:req-1');
    expect(question?.category).toBe('agent.question');
    expect(question?.needsYou).toBe(true);
    expect(question?.detail).toBeNull();

    const detailed = {
      ...asking,
      detail: {
        questionRequestId: 'req-1',
        lastAgentMessage: 'Which one?',
        questions: [
          {
            question: 'Use option A or B?',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
            recommended: 0,
            multiSelect: false,
          },
        ],
      },
    };
    const second = deriveT3(context(), first.baseline, observe([detailed]));
    expect(second.entries).toEqual([]);
    expect(second.enrichments).toHaveLength(1);
    expect(second.enrichments[0]).toMatchObject({
      id: 't3:local|thread:a:request:req-1',
      summary: 'W3 asks: Use option A or B?',
      action: { kind: 'answer', hostId: 'local', threadId: 'a', requestId: 'req-1', option: 'A' },
    });
    expect(second.enrichments[0]?.detail).toContain('• B');
    expect(deriveT3(context(), second.baseline, observe([detailed])).enrichments).toEqual([]);
  });

  it('resolves a question once the request is gone, and a deleted question too', () => {
    const asking = thread({
      runStatus: 'waiting',
      pendingRequest: { id: 'req-1', kind: 'user_input', createdAt: null },
    });
    const base = deriveT3(context(), seeded(), observe([asking])).baseline;
    const answered = deriveT3(context(), base, observe([running(4)]));
    expect(answered.resolutions).toContainEqual(
      expect.objectContaining({ ids: ['t3:local|thread:a:request:req-1'], resolvedBy: 'answered' }),
    );
    const gone = deriveT3(context(), base, observe([thread({ pendingRequest: null })]));
    expect(gone.resolutions).toContainEqual(
      expect.objectContaining({ ids: ['t3:local|thread:a:request:req-1'] }),
    );
  });

  it('makes a plan instead of a turn, and resolves it when the thread runs again', () => {
    const planned = thread({ ...completed(4), hasPlan: true });
    const result = deriveT3(context(), seeded(), observe([planned]));
    expect(result.entries.map((e) => e.category)).toEqual(['agent.plan']);
    expect(result.entries[0]?.action).toEqual({
      kind: 'approve-plan',
      hostId: 'local',
      threadId: 'a',
      runId: 'run:thread:a:ordinal:4',
    });
    const approved = deriveT3(context(), result.baseline, observe([running(5)]));
    expect(approved.resolutions).toContainEqual(
      expect.objectContaining({
        ids: ['t3:local|thread:a:plan:run:thread:a:ordinal:4'],
        resolvedBy: 'running again',
      }),
    );
  });

  it('reports failures, and interruptions only when nobody asked for them', () => {
    const failed = deriveT3(
      context(),
      seeded(),
      observe([
        thread({
          ...completed(4),
          runStatus: 'failed',
          lastErrorClass: 'provider_error',
          lastError: 'Out of context\nmore',
        }),
      ]),
    );
    expect(failed.entries[0]).toMatchObject({
      category: 'agent.failed',
      needsYou: true,
      detail: 'provider_error: Out of context',
    });

    const stopped = deriveT3(
      context(),
      seeded(),
      observe([thread({ ...completed(4), runStatus: 'interrupted', stopRequested: true })]),
    );
    expect(stopped.entries).toEqual([]);
    const interrupted = deriveT3(
      context(),
      seeded(),
      observe([thread({ ...completed(4), runStatus: 'interrupted' })]),
    );
    expect(interrupted.entries.map((e) => e.category)).toEqual(['agent.interrupted']);

    const recovered = deriveT3(context(), failed.baseline, observe([completed(5)]));
    expect(recovered.resolutions).toContainEqual(
      expect.objectContaining({
        categories: ['agent.failed', 'agent.interrupted'],
        resolvedBy: 'a later run completed',
      }),
    );
  });

  it('reports a usage limit once and resolves it when the run moves on', () => {
    const limit = {
      requestId: 'limit-1',
      runId: 'run:thread:a:ordinal:4',
      resetAt: '2026-10-27T12:00:00.000Z',
      autoResume: true,
    };
    const limited = deriveT3(
      context(),
      seeded(),
      observe([
        thread({
          ...completed(4),
          runStatus: 'interrupted',
          stopRequested: true,
          limitRecovery: limit,
        }),
      ]),
    );
    expect(limited.entries.map((e) => e.category)).toEqual(['agent.limited']);
    expect(limited.entries[0]?.needsYou).toBe(false);
    const resumed = deriveT3(
      context(),
      limited.baseline,
      observe([thread({ ...completed(5), limitRecovery: limit })]),
    );
    expect(resumed.resolutions).toContainEqual(
      expect.objectContaining({ ids: ['t3:local|limit:limit-1'], resolvedBy: 'resumed' }),
    );
    expect(resumed.entries.map((e) => e.category)).toEqual(['agent.turn']);
  });

  it('ignores an old limit T3 keeps after the run resumed', () => {
    const limit = {
      requestId: 'limit-1',
      runId: 'run:thread:a:ordinal:2',
      resetAt: '2026-10-27T12:00:00.000Z',
      autoResume: false,
    };
    const result = deriveT3(
      context(),
      seeded(),
      observe([thread({ ...completed(4), limitRecovery: limit })]),
    );
    expect(result.entries.map((e) => e.category)).toEqual(['agent.turn']);
  });

  it('marks what a visit in T3 covered read', () => {
    const watched = {
      ...completed(4, '2026-10-27T09:30:00.000Z'),
      lastVisitedAt: '2026-10-27T09:30:05.000Z',
    };
    const result = deriveT3(context(), seeded(), observe([watched]));
    expect(result.entries).toHaveLength(1);
    expect(result.seen).toEqual([
      { entityKey: 't3:local:thread:a', before: '2026-10-27T09:30:05.000Z', reason: 'seen-in-t3' },
    ]);
    const off = deriveT3(context(), seeded(), observe([watched], { seenInT3: false }));
    expect(off.seen).toEqual([]);
  });

  it('keeps two hosts with the same thread id apart', () => {
    const local = deriveT3(context(), seeded(), observe([completed(4)]));
    const mini = deriveT3(
      context({ sourceId: 't3:mini' }),
      seeded(),
      observe([completed(4)], { hostId: 'mini', hostLabel: 'Mac mini' }),
    );
    expect(local.entries[0]?.id).not.toBe(mini.entries[0]?.id);
    expect(local.entries[0]?.entity.key).toBe('t3:local:thread:a');
    expect(mini.entries[0]?.entity.key).toBe('t3:mini:thread:a');
  });

  it('stays quiet about threads it never saw unless they were created after the seed', () => {
    const old = thread({
      rawId: 'old',
      createdAt: '2026-01-01T00:00:00.000Z',
      runId: 'run:thread:old:ordinal:9',
    });
    const fresh = thread({
      rawId: 'new',
      createdAt: '2026-10-27T09:00:00.000Z',
      runId: 'run:thread:new:ordinal:1',
    });
    const result = deriveT3(context(), { threads: {} }, observe([old, fresh]));
    expect(result.entries.map((e) => e.entity.key)).toEqual(['t3:local:thread:new']);
  });

  it('creates nothing for subagents or a thread that disappeared', () => {
    const sub = thread({ rawId: 'sub', subagent: true, createdAt: '2026-10-27T09:00:00.000Z' });
    expect(deriveT3(context(), seeded(), observe([sub])).entries).toEqual([]);
    const gone = deriveT3(context(), seeded(), observe([]));
    expect(gone.entries).toEqual([]);
    expect(gone.resolutions).toEqual([]);
    expect(gone.baseline.threads.a?.missingSince).toBe('2026-10-27T10:00:00.000Z');
    const partial = deriveT3(context(), seeded(), observe([], { complete: false }));
    expect(partial.baseline.threads.a?.missingSince).toBeUndefined();
  });

  it('handles equal timestamps without repeating', () => {
    const at = '2026-10-27T09:30:00.000Z';
    const watched = { ...completed(4, at), lastVisitedAt: at };
    const result = deriveT3(context(), seeded(), observe([watched]));
    expect(result.seen[0]?.before).toBe(at);
    expect(deriveT3(context(), result.baseline, observe([watched])).seen).toEqual([]);
  });
});
