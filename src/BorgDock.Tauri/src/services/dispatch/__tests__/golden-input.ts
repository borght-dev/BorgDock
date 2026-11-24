import type { EngineInput } from '../engine';
import { makeItem, makeKnownPr, makeThread, makeThreadPr } from './fixtures';

/**
 * One fixed set of items, threads and pull requests: an item with a running
 * thread, a queued one, one whose pull request merged, and two that share a
 * plan pull request naming neither.
 */
export function goldenInput(): EngineInput {
  return {
    items: [
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
      makeItem({
        id: 104,
        state: 'Development In Progress',
        linkedPullRequests: [{ repositoryId: 'r', number: 11 }],
      }),
      makeItem({
        id: 105,
        state: 'New',
        linkedPullRequests: [{ repositoryId: 'r', number: 11 }],
      }),
    ],
    threads: [
      makeThread({ id: 't1', title: 'AB#101 queue', status: 'running', projectId: 'p-w1' }),
      makeThread({
        id: 't2',
        title: 'AB#103 and AB#900 together',
        projectId: 'p-w2',
        pullRequests: [makeThreadPr({ number: 9, title: 'AB#103 fix' })],
      }),
      makeThread({ id: 't3', title: 'Unrelated triage', projectId: 'p-w0' }),
      makeThread({ id: 't4', title: 'AB#102 first look', status: 'your-turn', projectId: 'p-w3' }),
    ],
    pullRequests: [
      makeKnownPr({ number: 7, workItemIds: [101], title: 'AB#101 queue' }),
      makeKnownPr({
        number: 9,
        state: 'merged',
        workItemIds: [103, 900],
        title: 'Plan for the epic',
      }),
      makeKnownPr({ number: 11, workItemIds: [104, 105], title: 'Plan for the checkout' }),
    ],
    queued: new Set([102]),
    hiddenSuggestions: new Set(),
    manualLinks: new Map(),
    now: new Date('2026-10-02T12:00:00Z'),
  };
}
