import { describe, expect, it } from 'vitest';
import { buildOverview, type EngineInput } from '../engine';
import { guessItem, linkThreads, referencedItemIds } from '../link';
import { makeItem, makeKnownPr, makeThread, makeThreadPr, PROJECTS } from './fixtures';

const NOW = new Date('2026-10-02T12:00:00Z');

function input(overrides: Partial<EngineInput>): EngineInput {
  return {
    items: [],
    threads: [],
    projects: PROJECTS,
    pullRequests: [],
    queued: new Set(),
    hiddenSuggestions: new Set(),
    manualLinks: new Map(),
    slotPattern: /^W\d+$/,
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
      id: '59567:merged:4466',
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
          status: 'settled',
          open: false,
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
          status: 'running',
          title: 'AB#50001',
          pullRequests: [makeThreadPr({ number: 7, title: 'AB#50001' })],
        }),
      ],
    });
    expect(overview.items[0]?.suggestion?.to).toBe('Code Review');
  });

  it('does not suggest Code Review for a draft', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 50001, state: 'Development In Progress' })],
      threads: [makeThread({ id: 't', status: 'running', title: 'AB#50001' })],
      pullRequests: [makeKnownPr({ number: 7, isDraft: true, workItemIds: [50001] })],
    });
    expect(overview.items[0]?.suggestion).toBeNull();
  });

  it('flags in-progress items that are stale or untouched, without a target state', () => {
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
    expect(stale.items[0]?.suggestion?.to).toBeNull();
    expect(stale.items[0]?.suggestion?.reason).toMatch(/no agent activity since 2026-09-20/);

    const untouched = overviewOf({
      items: [makeItem({ id: 50003, state: 'Development In Progress' })],
    });
    expect(untouched.items[0]?.suggestion?.id).toBe('50003:untouched:Development In Progress');

    const onHold = overviewOf({ items: [makeItem({ id: 50004, state: 'On Hold' })] });
    expect(onHold.items[0]?.suggestion).toBeNull();
  });

  it('keeps a hidden suggestion hidden until the evidence changes', () => {
    const base = {
      items: [makeItem({ id: 50001, state: 'New' })],
      threads: [makeThread({ id: 't', title: 'AB#50001', status: 'running' as const })],
    };
    const hidden = overviewOf({ ...base, hiddenSuggestions: new Set(['50001:started']) });
    expect(hidden.items[0]?.suggestion).toBeNull();
    const other = overviewOf({ ...base, hiddenSuggestions: new Set(['50001:merged:9']) });
    expect(other.items[0]?.suggestion?.id).toBe('50001:started');
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
      threads: [makeThread({ id: 't', title: 'AB#50001', status: 'question', slot: 'W1' })],
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

describe('buildOverview slots', () => {
  it('marks slots free, mine, or busy with other work', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 50001 })],
      threads: [
        makeThread({
          id: 'a',
          projectId: 'p-w0',
          slot: 'W0',
          title: 'AB#50001',
          status: 'question',
        }),
        makeThread({
          id: 'b',
          projectId: 'p-w1',
          slot: 'W1',
          title: 'AB#99999 not mine',
          status: 'running',
        }),
        makeThread({
          id: 'c',
          projectId: 'p-w2',
          slot: 'W2',
          title: 'AB#50001 old',
          status: 'settled',
          open: false,
        }),
      ],
    });
    expect(overview.slots.map((s) => [s.name, s.state, s.itemId, s.needsYou])).toEqual([
      ['W0', 'mine', 50001, true],
      ['W1', 'busy', null, false],
      ['W2', 'free', null, false],
    ]);
  });

  it('leaves out projects and threads outside the slot pattern', () => {
    const projects = [
      ...PROJECTS,
      {
        id: 'p-notes',
        hostId: 'local',
        hostLabel: 'This machine',
        available: true,
        title: 'notes',
        workspaceRoot: '/work/notes',
      },
    ];
    const thread = makeThread({ id: 'n', projectId: 'p-notes', slot: 'notes', title: 'AB#50001' });
    const filtered = overviewOf({ items: [makeItem({ id: 50001 })], projects, threads: [thread] });
    expect(filtered.slots.map((s) => s.name)).toEqual(['W0', 'W1', 'W2']);
    expect(filtered.items[0]?.threads).toEqual([]);

    const all = overviewOf({
      items: [makeItem({ id: 50001 })],
      projects,
      threads: [thread],
      slotPattern: null,
    });
    expect(all.slots.map((s) => s.name)).toContain('notes');
    expect(all.items[0]?.threads.map((t) => t.id)).toEqual(['n']);
  });
});
