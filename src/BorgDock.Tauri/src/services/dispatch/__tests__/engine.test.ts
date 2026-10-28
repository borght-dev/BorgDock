import { describe, expect, it } from 'vitest';
import { buildOverview, type EngineInput } from '../engine';
import { guessItem, linkThreads, referencedItemIds } from '../link';
import { makeItem, makeKnownPr, makeThread, makeThreadPr } from './fixtures';

const NOW = new Date('2026-10-02T12:00:00Z');

function input(overrides: Partial<EngineInput>): EngineInput {
  return {
    items: [],
    threads: [],
    pullRequests: [],
    queued: new Set(),
    hiddenSuggestions: new Set(),
    manualLinks: new Map(),
    now: NOW,
    ...overrides,
  };
}

const overviewOf = (overrides: Partial<EngineInput>) => buildOverview(input(overrides)).overview;

describe('referencedItemIds', () => {
  const mine = new Set([59541, 59463, 404]);
  const ids = (thread: Parameters<typeof makeThread>[0]) =>
    [...referencedItemIds(makeThread(thread), mine, new Map([[4466, [59567]]]))].sort();

  it('reads AB# references from the title', () => {
    expect(ids({ id: 'a', title: 'AB#59463 renew certs' })).toEqual([59463]);
  });

  it('reads references from later user and assistant messages', () => {
    expect(
      ids({
        id: 'later',
        conversationReferences: { explicitIds: [59463], mentionedIds: [59541, 12345] },
      }),
    ).toEqual([59463, 59541]);
  });

  it('reads an id from a branch, with or without the AB prefix', () => {
    expect(ids({ id: 'b', branch: 'fix/AB58930-debundle' })).toEqual([58930]);
    expect(ids({ id: 'c', branch: 'feat/59458-route-hosts' })).toEqual([59458]);
  });

  it('counts a bare number only when it is one of my items', () => {
    expect(ids({ id: 'd', firstUserMessage: 'Please pick up 59541 and 12345' })).toEqual([59541]);
  });

  it('ignores a short number in a branch unless it is one of my items', () => {
    expect(ids({ id: 'e', branch: 'release/2026-10' })).toEqual([]);
    expect(ids({ id: 'f', branch: 'fix/404-not-found' })).toEqual([404]);
  });

  it('follows the pull requests an item links', () => {
    expect(
      ids({ id: 'g', pullRequests: [makeThreadPr({ number: 4466, state: 'merged' })] }),
    ).toEqual([59567]);
  });
});

describe('linkThreads', () => {
  it('keeps whole-conversation triage threads out of individual work', () => {
    const items = [50001, 50002, 50003, 50004].map((id) => makeItem({ id }));
    const thread = makeThread({
      id: 'triage',
      conversationReferences: { explicitIds: [], mentionedIds: items.map((i) => i.id) },
    });
    expect(
      [...linkThreads(items, [thread], new Map()).threadsByItem.values()].every(
        (list) => list.length === 0,
      ),
    ).toBe(true);
  });
  it('links a thread that names many items to none of them', () => {
    const items = [1, 2, 3, 4].map((n) => makeItem({ id: 50000 + n }));
    const triage = makeThread({
      id: 't',
      firstUserMessage: 'AB#50001 AB#50002 AB#50003 AB#50004',
    });
    const links = linkThreads(items, [triage], new Map());
    expect([...links.threadsByItem.values()].every((list) => list.length === 0)).toBe(true);
    expect(links.unlinked).toHaveLength(0);
  });

  it('lets a manual link win, and a manual unlink hide the thread', () => {
    const items = [makeItem({ id: 50001 }), makeItem({ id: 50002 })];
    const thread = makeThread({ id: 't', title: 'AB#50001 work' });
    const linked = linkThreads(items, [thread], new Map([['t', 50002]]));
    expect(linked.threadsByItem.get(50002)?.map((t) => t.id)).toEqual(['t']);
    expect(linked.threadsByItem.get(50001)).toEqual([]);

    const loose = makeThread({ id: 'u', title: 'loose end' });
    expect(linkThreads(items, [loose], new Map([['u', null]])).unlinked).toHaveLength(0);
  });

  it('links an epic-wide thread to what it names itself when its conversation names too much', () => {
    const items = [58918, 58919, 60236].map((id) => makeItem({ id, parentId: 58917 }));
    const epic = makeThread({
      id: 'epic',
      title: 'Plan Epic 58917 PBI Breakdown',
      branch: 'feat/60236-dated-cost-prices',
      conversationReferences: {
        explicitIds: [55965, 58335, 58917, 58918, 58919, 59530, 60236, 60237],
        mentionedIds: [],
      },
    });
    const links = linkThreads(items, [epic], new Map());
    expect(
      [...links.threadsByItem.entries()].map(([id, list]) => [id, list.map((t) => t.id)]),
    ).toEqual([
      [58918, ['epic']],
      [58919, ['epic']],
      [60236, ['epic']],
    ]);
  });

  it('counts an epic and its PBIs as one topic, however many of them a thread names', () => {
    const pbis = [58918, 58919, 58920, 60236, 60237];
    const items = [...pbis.map((id) => makeItem({ id, parentId: 58917 })), makeItem({ id: 50001 })];
    const epic = makeThread({
      id: 'epic',
      pullRequests: pbis.map((id, n) =>
        makeThreadPr({ number: 5020 + n, headBranch: `feat/${id}-cost-prices` }),
      ),
    });
    const links = linkThreads(items, [epic], new Map());
    expect(pbis.map((id) => links.threadsByItem.get(id)?.length)).toEqual([1, 1, 1, 1, 1]);
    expect(links.threadsByItem.get(50001)).toEqual([]);
  });

  it('gives the items a subagent works on to the thread it works for', () => {
    const items = [makeItem({ id: 58918 }), makeItem({ id: 50002 })];
    const root = makeThread({ id: 'root', title: 'Quote improvements', status: 'running' });
    const subagent = makeThread({
      id: 'sub',
      title: 'Research custom quote lines',
      subagentOf: 'root',
      open: false,
      status: 'settled',
      conversationReferences: { explicitIds: [59970], mentionedIds: [58918] },
    });
    const links = linkThreads(items, [root, subagent], new Map());
    expect(links.threadsByItem.get(58918)?.map((t) => t.id)).toEqual(['root']);
    expect(links.threadsByItem.get(50002)).toEqual([]);
    expect(links.unlinked).toEqual([]);
    expect(links.itemOfThread.get('root')).toBe(58918);
  });

  it('offers an open thread without any reference as unlinked', () => {
    const links = linkThreads([makeItem({ id: 50001 })], [makeThread({ id: 'u' })], new Map());
    expect(links.unlinked.map((t) => t.id)).toEqual(['u']);
  });
});

describe('guessItem', () => {
  const items = [
    makeItem({ id: 59464, title: 'Deploy the mobile API front door for legacy hostnames' }),
  ];

  it('guesses by shared title words', () => {
    expect(guessItem(makeThread({ id: 'x', title: 'Mobile API front door overlays' }), items)).toBe(
      59464,
    );
  });

  it('does not guess without overlap', () => {
    expect(guessItem(makeThread({ id: 'y', title: 'Hue remote control' }), items)).toBeNull();
  });
});

describe('buildOverview suggestions', () => {
  it('suggests Ready For QA when a pull request for the item is merged', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 59567, state: 'Code Review' })],
      threads: [
        makeThread({
          id: 't',
          status: 'settled',
          open: false,
          title: 'AB#59567',
          pullRequests: [
            makeThreadPr({ number: 4466, state: 'merged', title: 'fix: lock order (AB#59567)' }),
          ],
        }),
      ],
    });
    expect(overview.items[0]?.bay).toBe('drift');
    expect(overview.items[0]?.suggestion).toEqual({
      id: '59567:merged:4466:Ready For QA',
      to: 'Ready For QA',
      reason: 'PR 4466 is merged. ADO still says Code Review.',
    });
  });

  it('falls back to the completed state in a workflow without a resolved one', () => {
    const states = [
      { name: 'New', category: 'Proposed' as const },
      { name: 'Committed', category: 'InProgress' as const },
      { name: 'Done', category: 'Completed' as const },
    ];
    const overview = overviewOf({
      items: [makeItem({ id: 70001, state: 'Committed', states })],
      pullRequests: [makeKnownPr({ number: 12, state: 'merged', workItemIds: [70001] })],
    });
    expect(overview.items[0]?.suggestion?.to).toBe('Done');
  });

  it('does not take a pull request that does not name the item as evidence', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 59463, state: 'New' })],
      threads: [
        makeThread({
          id: 't',
          firstUserMessage: 'see 59463',
          pullRequests: [
            makeThreadPr({
              number: 4350,
              state: 'merged',
              title: 'automate renewals',
              headBranch: 'feat/renewals',
            }),
          ],
        }),
      ],
    });
    expect(overview.items[0]?.suggestion?.to).toBe('Development In Progress');
  });

  it('suggests Code Review for an open pull request', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 50001, state: 'Development In Progress' })],
      threads: [
        makeThread({
          id: 't',
          title: 'AB#50001',
          status: 'settled',
          open: false,
          pullRequests: [makeThreadPr({ number: 7, title: 'AB#50001' })],
        }),
      ],
    });
    expect(overview.items[0]?.suggestion?.to).toBe('Code Review');
    expect(overview.items[0]?.verdict.label).toBe('Out of sync');
  });

  it('suggests Code Review, not Plan Review, for a bug with an open pull request', () => {
    const states = [
      { name: 'New', category: 'Proposed' as const },
      { name: 'Plan Review', category: 'Proposed' as const },
      { name: 'Development In Progress', category: 'InProgress' as const },
      { name: 'Code Review', category: 'Resolved' as const },
      { name: 'Ready For QA', category: 'Resolved' as const },
    ];
    const overview = overviewOf({
      items: [makeItem({ id: 60275, typeName: 'Bug', state: 'New', states })],
      pullRequests: [makeKnownPr({ number: 5004, workItemIds: [60275] })],
    });
    expect(overview.items[0]?.suggestion).toMatchObject({
      to: 'Code Review',
      reason: 'PR 5004 is open. ADO still says New.',
    });
  });

  it('suggests the move while the agent runs, which stays the verdict', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 58138, state: 'Development In Progress' })],
      threads: [makeThread({ id: 't', status: 'running', branch: 'feat/58138-ai-summary' })],
      pullRequests: [makeKnownPr({ number: 5002, workItemIds: [58138] })],
    });
    expect(overview.items[0]?.suggestion?.to).toBe('Code Review');
    expect(overview.items[0]?.verdict.label).toBe('Agent on it');
  });

  it('ignores a pull request shared by several items that names none of them', () => {
    const overview = overviewOf({
      items: [50001, 50002].map((id) => makeItem({ id, state: 'Development In Progress' })),
      pullRequests: [
        makeKnownPr({
          number: 4991,
          state: 'merged',
          title: 'docs(plans): plan the quote improvements',
          branch: 'plan/58917-quote-improvements',
          workItemIds: [50001, 50002],
        }),
        makeKnownPr({
          number: 5030,
          state: 'merged',
          title: 'feat(quotes): cost and margin (AB#50002)',
          workItemIds: [50001, 50002],
        }),
      ],
    });
    const [first, second] = overview.items;
    expect(first?.pullRequests.every((pr) => pr.shared)).toBe(true);
    expect(first?.suggestion).toBeNull();
    expect(second?.pullRequests.map((pr) => [pr.number, pr.shared])).toEqual([
      [5030, false],
      [4991, true],
    ]);
    expect(second?.suggestion?.to).toBe('Ready For QA');
  });

  it('does not suggest Code Review for a draft', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 50001, state: 'Development In Progress' })],
      threads: [makeThread({ id: 't', status: 'running', title: 'AB#50001' })],
      pullRequests: [makeKnownPr({ number: 7, isDraft: true, workItemIds: [50001] })],
    });
    expect(overview.items[0]?.suggestion).toBeNull();
  });

  it('calls a quiet or untouched item in progress by its verdict, not out of sync', () => {
    const stale = overviewOf({
      items: [makeItem({ id: 50002, state: 'Development In Progress' })],
      threads: [
        makeThread({
          id: 't',
          open: false,
          status: 'settled',
          title: 'AB#50002',
          lastActivityAt: '2026-09-20T00:00:00Z',
        }),
      ],
    });
    expect(stale.items[0]?.suggestion).toBeNull();
    expect(stale.items[0]?.bay).toBe('paused');

    const untouched = overviewOf({
      items: [makeItem({ id: 50003, state: 'Development In Progress' })],
    });
    expect(untouched.items[0]?.suggestion).toBeNull();
    expect(untouched.items[0]?.verdict.label).toBe('Nobody on it');
  });

  it('keeps a hidden suggestion hidden until the evidence changes', () => {
    const base = {
      items: [makeItem({ id: 50001, state: 'New' })],
      threads: [makeThread({ id: 't', title: 'AB#50001' })],
    };
    const kept = '50001:started:Development In Progress';
    const hidden = overviewOf({ ...base, hiddenSuggestions: new Set([kept]) });
    expect(hidden.items[0]?.suggestion).toBeNull();
    expect(hidden.items[0]?.verdict.label).not.toBe('Out of sync');
    const other = overviewOf({ ...base, hiddenSuggestions: new Set(['50001:merged:9:Done']) });
    expect(other.items[0]?.suggestion?.id).toBe(kept);
  });
});

describe('buildOverview pull requests', () => {
  it('prefers the live GitHub state and checks over the snapshot in the thread', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 50001, state: 'Code Review' })],
      threads: [
        makeThread({
          id: 't',
          title: 'AB#50001',
          status: 'settled',
          open: false,
          pullRequests: [makeThreadPr({ number: 7, title: 'AB#50001', state: 'open' })],
        }),
      ],
      pullRequests: [
        makeKnownPr({
          number: 7,
          state: 'merged',
          checks: { passed: 24, failed: 0, pending: 0, total: 24 },
        }),
      ],
    });
    expect(overview.items[0]?.pullRequest).toMatchObject({
      number: 7,
      state: 'merged',
      checks: { passed: 24, total: 24 },
    });
  });

  it('finds a pull request that names the item even without a thread', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 50001, state: 'Development In Progress' })],
      pullRequests: [makeKnownPr({ number: 9, workItemIds: [50001] })],
    });
    expect(overview.items[0]?.pullRequest?.number).toBe(9);
    expect(overview.items[0]?.suggestion?.to).toBe('Code Review');
  });

  it('takes the open pull request whose title names the item over one it shares', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 60097, state: 'Code Review' })],
      pullRequests: [
        makeKnownPr({
          number: 4898,
          title: 'fix: reject unsupported rule links (AB#60097)',
          workItemIds: [60097],
          approved: true,
          checks: { passed: 12, failed: 0, pending: 0, total: 12 },
        }),
        makeKnownPr({
          number: 4909,
          title: 'feat: edit advanced rules in legacy form (AB#60108)',
          workItemIds: [60108, 60097],
          checks: { passed: 10, failed: 2, pending: 0, total: 12 },
        }),
      ],
    });
    expect(overview.items[0]?.pullRequests.map((pr) => pr.number)).toEqual([4898, 4909]);
    expect(overview.items[0]?.verdict.label).toBe('Ready to merge');
  });
});

describe('buildOverview bays', () => {
  it('puts waiting before drift, and counts Needs Human as waiting', () => {
    const overview = overviewOf({
      items: [
        makeItem({ id: 50001, state: 'New' }),
        makeItem({
          id: 50002,
          state: 'Needs Human',
          states: [{ name: 'Needs Human', category: 'InProgress' }],
        }),
      ],
      threads: [makeThread({ id: 't', title: 'AB#50001', status: 'question', place: 'W1' })],
    });
    expect(overview.items[0]?.bay).toBe('waiting');
    expect(overview.items[0]?.waitingFor).toBe('Agent asks in W1');
    expect(overview.items[0]?.suggestion).not.toBeNull();
    expect(overview.items[1]?.waitingFor).toBe('ADO says Needs Human');
  });

  it('keeps queued items in Up next until an agent picks them up', () => {
    const queued = buildOverview(
      input({ items: [makeItem({ id: 50001 })], queued: new Set([50001]) }),
    );
    expect(queued.overview.items[0]?.bay).toBe('next');
    expect(queued.dequeue).toEqual([]);

    const started = buildOverview(
      input({
        items: [makeItem({ id: 50001 })],
        queued: new Set([50001]),
        threads: [makeThread({ id: 't', title: 'AB#50001', status: 'running' })],
      }),
    );
    expect(started.dequeue).toEqual([50001]);
    expect(started.overview.items[0]?.bay).toBe('drift');
  });

  it('sorts the rest into working, not started, paused and handed off', () => {
    const overview = overviewOf({
      items: [
        makeItem({ id: 50001, state: 'Development In Progress' }),
        makeItem({ id: 50002, state: 'New' }),
        makeItem({ id: 50003, state: 'On Hold' }),
        makeItem({ id: 50004, state: 'Ready For QA' }),
      ],
      threads: [
        makeThread({ id: 'a', title: 'AB#50001', status: 'running' }),
        makeThread({ id: 'c', title: 'AB#50003', status: 'settled', open: false }),
      ],
    });
    expect(overview.items.map((i) => i.bay)).toEqual(['working', 'idle', 'paused', 'handed']);
  });
});

describe('buildOverview threads', () => {
  it('takes the threads of every T3 project, whatever it is called', () => {
    const thread = makeThread({ id: 'n', projectId: 'p-notes', place: 'notes', title: 'AB#50001' });
    const overview = overviewOf({ items: [makeItem({ id: 50001 })], threads: [thread] });
    expect(overview.items[0]?.threads.map((t) => t.id)).toEqual(['n']);
  });
});
