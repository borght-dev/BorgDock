import { describe, expect, it } from 'vitest';
import { buildOverview, type EngineInput } from '../engine';
import { makeItem, makeKnownPr, makeThread, makeThreadPr, PROJECTS } from './fixtures';

const NOW = new Date('2026-10-02T12:00:00Z');

function input(overrides: Partial<EngineInput>): EngineInput {
  return {
    items: [],
    threads: [],
    projects: PROJECTS,
    pullRequests: [],
    queued: new Set([102]),
    hiddenSuggestions: new Set(),
    manualLinks: new Map(),
    slotPattern: /^W\d+$/,
    now: NOW,
    ...overrides,
  };
}

const items = [
  makeItem({
    id: 101,
    state: 'Development In Progress',
    linkedPullRequests: [{ repositoryId: 'r', number: 7 }],
  }),
  makeItem({ id: 102, state: 'New' }),
  makeItem({
    id: 103,
    state: 'Code Review',
    linkedPullRequests: [{ repositoryId: 'r', number: 9 }],
  }),
];
const threads = [
  makeThread({ id: 't1', title: 'AB#101 queue', status: 'running', projectId: 'p-w1' }),
  makeThread({
    id: 't2',
    title: 'AB#103 and AB#900 together',
    projectId: 'p-w2',
    pullRequests: [makeThreadPr({ number: 9, title: 'AB#103 fix' })],
  }),
  makeThread({ id: 't3', title: 'Unrelated triage', projectId: 'p-w0' }),
];
const pullRequests = [
  makeKnownPr({ number: 7, workItemIds: [101], title: 'AB#101 queue' }),
  makeKnownPr({ number: 9, state: 'merged', workItemIds: [103, 900], title: 'Plan for the epic' }),
];
const contextItems = [
  makeItem({ id: 900, state: 'Done' }),
  makeItem({ id: 901, state: 'New', assignedToMe: false }),
  // An item Dispatch lists already is not built twice.
  makeItem({ id: 101, state: 'Development In Progress' }),
];

describe('buildOverview with context items', () => {
  it('leaves what Dispatch shows exactly as it was', () => {
    const without = buildOverview(input({ items, threads, pullRequests }));
    const withContext = buildOverview(input({ items, threads, pullRequests, contextItems }));
    const { context, combinedPullRequests: _c, generatedAt: _a, ...rest } = withContext.overview;
    const { generatedAt: _b, ...before } = without.overview;
    expect(rest).toEqual(before);
    expect(withContext.dequeue).toEqual(without.dequeue);
    expect(context?.map((o) => o.item.id)).toEqual([900, 901]);
  });

  it('builds a done item, with its threads and pull requests', () => {
    const { overview } = buildOverview(input({ items, threads, pullRequests, contextItems }));
    const done = overview.context!.find((o) => o.item.id === 900)!;
    expect(done.item.state).toBe('Done');
    expect(done.threads.map((t) => t.id)).toEqual(['t2']);
    expect(done.pullRequests.map((pr) => pr.number)).toEqual([9]);
    expect(done.queued).toBe(false);
  });

  it('calls a pull request shared when it is linked on a Dispatch item and a context item', () => {
    const { overview } = buildOverview(input({ items, threads, pullRequests, contextItems }));
    const done = overview.context!.find((o) => o.item.id === 900)!;
    expect(done.pullRequests[0]!.shared).toBe(true);
    expect(done.pullRequest?.shared).toBe(true);
  });

  it('says which pull request of a Dispatch item is shared once the context items count', () => {
    const { overview } = buildOverview(input({ items, threads, pullRequests, contextItems }));
    expect(overview.items.find((o) => o.item.id === 103)!.pullRequests[0]!.shared).toBe(false);
    expect(overview.combinedPullRequests?.[103]?.[0]).toMatchObject({ number: 9, shared: true });
  });

  it('has no context without context items', () => {
    expect(buildOverview(input({ items, threads, pullRequests })).overview.context).toBeUndefined();
  });
});
