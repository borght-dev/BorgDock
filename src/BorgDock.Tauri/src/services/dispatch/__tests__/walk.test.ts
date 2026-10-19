import { describe, expect, it } from 'vitest';
import type { ItemOverview, StateCategory, Tone } from '../types';
import {
  type BriefFilter,
  briefing,
  groupByTarget,
  laneSummary,
  laneTone,
  matchesBrief,
  needingYou,
  preselected,
  runProgress,
  syncCandidates,
  syncLabel,
  syncTarget,
  WALK_ORDER,
  walkLanes,
} from '../walk';
import { makeItem, makeThread } from './fixtures';

function overview(
  id: number,
  state: string,
  verdict: [string, Tone],
  stateCategory: StateCategory = 'InProgress',
): ItemOverview {
  return {
    item: makeItem({ id, state, stateCategory }),
    bay: 'idle',
    waitingFor: null,
    suggestion: null,
    pullRequest: null,
    pullRequests: [],
    threads: [],
    queued: false,
    verdict: { label: verdict[0], tone: verdict[1] },
    evidence: [],
    latest: null,
  };
}

describe('walkLanes', () => {
  it('always shows the walk, in walk order, even its empty states', () => {
    const lanes = walkLanes([overview(1, 'New', ['Not started', 'mute'], 'Proposed')]);
    expect(lanes.map((lane) => lane.state)).toEqual(WALK_ORDER);
    expect(lanes.find((lane) => lane.state === 'Testing Failed')?.rows).toEqual([]);
  });

  it('adds every other state after the walk: under way, not started, then with QA', () => {
    const lanes = walkLanes([
      overview(1, 'Ready For QA', ['With QA', 'mute'], 'Resolved'),
      overview(2, 'To Do', ['Not started', 'mute'], 'Proposed'),
      overview(3, 'On Hold', ['On Hold', 'mute'], 'InProgress'),
    ]);
    expect(lanes.slice(WALK_ORDER.length).map((lane) => [lane.state, lane.inWalk])).toEqual([
      ['On Hold', false],
      ['To Do', false],
      ['Ready For QA', false],
    ]);
  });

  it('sorts a lane by how much each item asks', () => {
    const lane = walkLanes([
      overview(1, 'Code Review', ['In review', 'mute'], 'Resolved'),
      overview(2, 'Code Review', ['Ready for QA', 'ok'], 'Resolved'),
      overview(3, 'Code Review', ['CI red', 'bad'], 'Resolved'),
    ]).find((l) => l.state === 'Code Review');
    expect(lane?.rows.map((o) => o.item.id)).toEqual([3, 2, 1]);
  });
});

describe('laneSummary', () => {
  it('counts the verdicts that ask something, most urgent first, then the fine ones', () => {
    expect(
      laneSummary([
        overview(1, 'Code Review', ['Ready for QA', 'ok']),
        overview(2, 'Code Review', ['CI red', 'bad']),
        overview(3, 'Code Review', ['Checks running', 'run']),
        overview(4, 'Code Review', ['Ready for QA', 'ok']),
      ]),
    ).toBe('1 CI red · 2 Ready for QA · 1 fine');
  });

  it('is empty when nothing asks', () => {
    expect(laneSummary([overview(1, 'New', ['Not started', 'mute'])])).toBe('');
  });
});

describe('needingYou', () => {
  it('keeps only what asks for you now', () => {
    expect(
      needingYou([
        overview(1, 'Needs Human', ['Waiting on you', 'bad']),
        overview(2, 'Code Review', ['Ready for QA', 'ok']),
      ]).map((o) => o.item.id),
    ).toEqual([1]);
  });
});

describe('syncs', () => {
  const review = overview(1, 'Code Review', ['Out of sync', 'warn'], 'Resolved');
  review.suggestion = { id: '1:merged:7:Ready For QA', to: 'Ready For QA', reason: 'Merged.' };
  const working = overview(2, 'Development In Progress', ['Agent on it', 'run']);
  working.threads = [makeThread({ id: 't', status: 'running' })];
  const fresh = overview(3, 'New', ['Not started', 'mute'], 'Proposed');
  const items = [review, working, fresh];
  const ids = (list: readonly ItemOverview[]) => list.map((o) => o.item.id);

  it('takes the items of a state, every item, the ones out of sync, or one', () => {
    expect(ids(syncCandidates(items, { kind: 'state', state: 'New' }))).toEqual([3]);
    expect(ids(syncCandidates(items, { kind: 'all' }))).toEqual([1, 2, 3]);
    expect(ids(syncCandidates(items, { kind: 'drift' }))).toEqual([1]);
    expect(ids(syncCandidates(items, { kind: 'item', itemId: 2, to: null }))).toEqual([2]);
  });

  it('starts with the items out of sync or without an agent of their own, all for a fix', () => {
    const stopped = { ...review, threads: [makeThread({ id: 'r', status: 'your-turn' })] };
    expect(preselected([stopped, working, fresh], { kind: 'all' })).toEqual([1, 3]);
    expect(preselected([working], { kind: 'item', itemId: 2, to: 'Code Review' })).toEqual([2]);
  });

  it('asks for the move I picked over the one the evidence points to', () => {
    expect(syncTarget(review, { kind: 'all' })).toBe('Ready For QA');
    expect(syncTarget(review, { kind: 'item', itemId: 1, to: 'Done' })).toBe('Done');
    expect(syncTarget(fresh, { kind: 'all' })).toBeNull();
  });

  it('names the run after what it covers', () => {
    expect(syncLabel({ kind: 'state', state: 'Code Review' }, 4)).toBe('Sync Code Review (4)');
    expect(syncLabel({ kind: 'all' }, 30)).toBe('Sync all (30)');
    expect(syncLabel({ kind: 'drift' }, 6)).toBe('Fix out of sync (6)');
    expect(syncLabel({ kind: 'item', itemId: 60107, to: 'Ready For QA' }, 1)).toBe(
      'Move 60107 to Ready For QA',
    );
  });
});

describe('briefing', () => {
  it('counts what waits on you, every item a fix takes, what is worth a look and the rest', () => {
    const drifted = {
      ...overview(2, 'Code Review', ['Out of sync', 'warn']),
      suggestion: { id: 'qa', to: 'Ready For QA', reason: 'merged' },
    };
    const waitingAndDrifted = {
      ...overview(3, 'Code Review', ['Your turn', 'bad']),
      suggestion: { id: 'qa', to: 'Ready For QA', reason: 'merged' },
    };
    const counts = briefing([
      overview(1, 'Needs Human', ['Your turn', 'bad']),
      drifted,
      waitingAndDrifted,
      overview(4, 'Development In Progress', ['Quiet · 9 d', 'warn']),
      overview(5, 'Code Review', ['Ready to merge', 'ok']),
      overview(6, 'New', ['Not started', 'mute']),
      overview(7, 'Development In Progress', ['Agent on it', 'run']),
    ]);
    expect(counts).toEqual({ needsYou: 2, outOfSync: 2, worthALook: 1, fine: 3 });
  });
});

describe('matchesBrief', () => {
  const waiting = overview(1, 'Needs Human', ['Your turn', 'bad']);
  const waitingAndDrifted = {
    ...overview(2, 'Code Review', ['Your turn', 'bad']),
    suggestion: { id: 'qa', to: 'Ready For QA', reason: 'merged' },
  };
  const quiet = overview(3, 'Development In Progress', ['Quiet · 9 d', 'warn']);
  const working = {
    ...overview(4, 'Development In Progress', ['Agent on it', 'run']),
    threads: [makeThread({ id: 'w', status: 'running' })],
  };
  const inRun = overview(5, 'Code Review', ['Ready to merge', 'ok']);
  const items = [waiting, waitingAndDrifted, quiet, working, inRun];
  const running = new Map([[5, 'W7']]);
  const shown = (filter: BriefFilter) =>
    items.filter((o) => matchesBrief(o, filter, running)).map((o) => o.item.id);

  it('shows the items each count of the briefing counts', () => {
    expect(shown('needsYou')).toEqual([1, 2]);
    expect(shown('outOfSync')).toEqual([2]);
    expect(shown('worthALook')).toEqual([3]);
    expect(shown('fine')).toEqual([4, 5]);
    expect(briefing(items)).toEqual({
      needsYou: shown('needsYou').length,
      outOfSync: shown('outOfSync').length,
      worthALook: shown('worthALook').length,
      fine: shown('fine').length,
    });
  });

  it('shows the items an agent of their own or a running sync works on', () => {
    expect(shown('working')).toEqual([4, 5]);
  });
});

describe('groupByTarget', () => {
  const move = (id: number, to: string) => ({
    ...overview(id, 'Development In Progress', ['Out of sync', 'warn']),
    suggestion: { id: `${id}`, to, reason: 'merged' },
  });
  const groups = (list: ItemOverview[]) =>
    groupByTarget(list, { kind: 'all' }).map((g) => [g.to, g.rows.map((o) => o.item.id)]);

  it('groups by the state each item moves to, the biggest first and the checks last', () => {
    const checked = overview(9, 'New', ['Not started', 'mute']);
    expect(
      groups([checked, move(1, 'Code Review'), move(2, 'Ready For QA'), move(3, 'Ready For QA')]),
    ).toEqual([
      ['Ready For QA', [2, 3]],
      ['Code Review', [1]],
      [null, [9]],
    ]);
  });
});

describe('laneTone', () => {
  it('is the most urgent verdict of the lane, null when it is empty', () => {
    expect(laneTone([])).toBeNull();
    expect(
      laneTone([overview(1, 'New', ['Not started', 'mute']), overview(2, 'New', ['P1', 'warn'])]),
    ).toBe('warn');
  });
});

describe('runProgress', () => {
  const items = [
    overview(1, 'Ready For QA', ['With QA', 'mute']),
    overview(2, 'Code Review', ['Out of sync', 'warn']),
  ];

  it('counts the items whose state changed since the run started', () => {
    const progress = runProgress(
      { itemIds: [1, 2, 3], fromStates: { 1: 'Code Review', 2: 'Code Review', 3: 'Code Review' } },
      items,
    );
    expect(progress.moved).toBe(2);
    expect(progress.items).toEqual([
      { id: 1, moved: true },
      { id: 2, moved: false },
      { id: 3, moved: true },
    ]);
  });

  it('shows nothing moved for a run that recorded no states', () => {
    expect(runProgress({ itemIds: [1, 2] }, items).moved).toBe(0);
  });
});
