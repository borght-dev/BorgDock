import { describe, expect, it } from 'vitest';
import { assessWorkstream } from '../attention';
import { addOutcome, addRelation, confirmOutcome, decide, openDecision } from '../edits';
import { outcomeKey, refKey } from '../identity';
import { resolveMember } from '../resolve';
import { evaluateRule } from '../rules';
import { suggestMembers } from '../suggest';
import type { EvidenceRule, WorkstreamDocument } from '../types';
import { CONTEXT, item, member, ok, pr, thread, workstream } from './fixtures';
import {
  host,
  lookedUp,
  makeItem,
  makeKnownPr,
  makeThread,
  overviews,
  polled,
  SNAPSHOT_NOW,
  snapshot,
  threadMap,
} from './snapshot';

const options = { now: SNAPSHOT_NOW, device: 'Laptop' };

function withOutcome(
  document: WorkstreamDocument,
  rules: Omit<EvidenceRule, 'id'>[],
  required = true,
) {
  const added = addOutcome(document, 'Shipped', required, rules, CONTEXT);
  return { document: ok(added), outcomeId: added.outcomeId! };
}

describe('resolving members', () => {
  it('tells PR #12 of two repositories apart', () => {
    const sources = snapshot({
      polled: new Map([
        polled('acme', 'shop', 12, { title: 'Shop queue' }),
        polled('acme', 'warehouse', 12, { title: 'Warehouse fix', state: 'merged' }),
      ]),
    });
    const shop = resolveMember(member(pr('shop', 12)), sources);
    const warehouse = resolveMember(member(pr('warehouse', 12)), sources);
    expect([shop.title, shop.stateLabel]).toEqual(['Shop queue', 'Open']);
    expect([warehouse.title, warehouse.stateLabel, warehouse.resolved]).toEqual([
      'Warehouse fix',
      'Merged',
      true,
    ]);
  });

  it('tells one raw thread id on two T3 installs apart', () => {
    const local = makeThread({ id: 't1', title: 'Laptop thread', hostId: 'local' });
    const remote = makeThread({
      id: 'mini:t1',
      title: 'Mini thread',
      hostId: 'mini',
      status: 'running',
    });
    const sources = snapshot({
      threads: threadMap([local, remote]),
      hosts: [host('local', 'env-laptop'), host('mini', 'env-mini')],
      configuredHosts: new Set(['local', 'mini']),
    });
    expect(resolveMember(member(thread('t1', 'env-laptop')), sources).title).toBe('Laptop thread');
    expect(resolveMember(member(thread('t1', 'env-mini', 'mini')), sources).title).toBe(
      'Mini thread',
    );
  });

  it('finds a thread again on a host added back under another id', () => {
    const readded = makeThread({ id: 'mini-2:t1', title: 'Still here', hostId: 'mini-2' });
    const sources = snapshot({
      threads: threadMap([readded]),
      hosts: [host('local', 'env-laptop'), host('mini-2', 'env-mini')],
      configuredHosts: new Set(['local', 'mini-2']),
    });
    const resolved = resolveMember(member(thread('t1', 'env-mini', 'mini')), sources);
    expect([resolved.freshness, resolved.title]).toEqual(['live', 'Still here']);
  });

  it('says a thread host that left settings is not connected, and an offline one offline', () => {
    const gone = resolveMember(member(thread('t1', 'env-mini', 'mini')), snapshot());
    expect(gone.freshness).toBe('not-connected');
    const offline = resolveMember(
      member(thread('t1', 'env-mini', 'mini')),
      snapshot({
        hosts: [host('local', 'env-laptop'), host('mini', null, { ok: false, error: 'timeout' })],
        configuredHosts: new Set(['local', 'mini']),
      }),
    );
    expect(offline.freshness).toBe('offline');
  });

  it('asks to relink a thread whose host now runs another T3', () => {
    const resolved = resolveMember(
      member(thread('t1', 'env-old', 'local')),
      snapshot({ hosts: [host('local', 'env-new')] }),
    );
    expect(resolved.freshness).toBe('not-connected');
    expect(resolved.reason).toMatch(/Relink/);
  });

  it('calls a deleted thread missing', () => {
    expect(resolveMember(member(thread('gone')), snapshot()).freshness).toBe('missing');
  });

  it('keeps one item id in two organizations apart', () => {
    const sources = snapshot({ items: overviews([makeItem({ id: 5, title: 'Acme item' })]) });
    expect(resolveMember(member(item(5)), sources).title).toBe('Acme item');
    expect(resolveMember(member(item(5, 'globex')), sources).freshness).toBe('not-connected');
  });

  it('calls a deleted item missing and an unread one unread', () => {
    const sources = snapshot({ missingItemIds: new Set([7]) });
    expect(resolveMember(member(item(7)), sources).freshness).toBe('missing');
    expect(resolveMember(member(item(8)), sources).freshness).toBe('unread');
  });

  it('says a pull request in a repository that went private is not connected', () => {
    const sources = snapshot({
      lookedUp: new Map([
        lookedUp('acme', 'secret', 3, { status: 'no-access', checkedAt: 1, error: 'no access' }),
      ]),
    });
    expect(resolveMember(member(pr('secret', 3)), sources).freshness).toBe('not-connected');
  });

  it('shows the last seen title of a record it can not read', () => {
    const key = refKey(pr('shop', 99));
    const sources = snapshot({
      gitHub: { configured: true, lastPollAt: null, pollMs: 60_000 },
      cache: { [key]: { title: 'Seen yesterday', stateLabel: 'Open', at: '2026-10-25T12:00:00Z' } },
    });
    const resolved = resolveMember(member(pr('shop', 99), { label: '' }), sources);
    expect([resolved.freshness, resolved.title, resolved.asOf]).toEqual([
      'unread',
      'Seen yesterday',
      '2026-10-25T12:00:00Z',
    ]);
  });

  it('marks a polled pull request out of date when the poll stopped', () => {
    const sources = snapshot({
      polled: new Map([polled('acme', 'shop', 12, { polledAt: '2026-10-26T11:00:00Z' })]),
      gitHub: {
        configured: true,
        lastPollAt: new Date(SNAPSHOT_NOW - 10 * 60_000).toISOString(),
        pollMs: 60_000,
      },
    });
    expect(resolveMember(member(pr('shop', 12)), sources).freshness).toBe('stale');
  });
});

describe('freshness of what BorgDock read', () => {
  it('a polled pull request of a repository that failed its poll is out of date', () => {
    const sources = snapshot({
      polled: new Map([polled('acme', 'shop', 12, { polledAt: '2026-10-25T00:00:00Z' })]),
    });
    expect(resolveMember(member(pr('shop', 12)), sources).freshness).toBe('stale');
  });

  it('a looked-up open pull request is out of date once it is not read again', () => {
    const found = (readAt: number) =>
      snapshot({
        lookedUp: new Map([
          lookedUp('acme', 'shop', 12, {
            status: 'found',
            readAt,
            checkedAt: readAt,
            failing: null,
            pullRequest: { state: 'open', nameWithOwner: 'acme/shop', number: 12 } as never,
          }),
        ]),
      });
    expect(resolveMember(member(pr('shop', 12)), found(SNAPSHOT_NOW - 60_000)).freshness).toBe(
      'live',
    );
    expect(resolveMember(member(pr('shop', 12)), found(SNAPSHOT_NOW - 60 * 60_000)).freshness).toBe(
      'stale',
    );
  });

  it('a context item whose read failed is out of date, whatever ADO said of the rest', () => {
    const sources = snapshot({
      items: overviews([], [], [], [makeItem({ id: 900, state: 'Done' })]),
      contextIds: new Set([900]),
      contextStatus: { ok: false, at: '2026-10-25T00:00:00Z', error: 'timeout' },
    });
    expect(resolveMember(member(item(900)), sources).freshness).toBe('offline');
  });
});

describe('rules', () => {
  const merged = snapshot({
    polled: new Map([polled('acme', 'shop', 12, { state: 'merged', baseRefName: 'release' })]),
  });

  it('checks the branch a pull request was merged into', () => {
    const resolved = resolveMember(member(pr('shop', 12)), merged);
    const rule = (value: string | null): EvidenceRule => ({
      id: 'r',
      kind: 'pr-merged',
      target: resolved.member.key,
      value,
    });
    expect(evaluateRule(rule(null), resolved).result).toBe('met');
    expect(evaluateRule(rule('release'), resolved).result).toBe('met');
    expect(evaluateRule(rule('master'), resolved).result).toBe('unmet');
  });

  it('never says yes or no from evidence that is not live', () => {
    const stale = snapshot({
      polled: new Map([
        polled('acme', 'shop', 12, { state: 'merged', polledAt: '2026-10-01T00:00:00Z' }),
      ]),
      gitHub: { configured: true, lastPollAt: '2026-10-01T00:00:00Z', pollMs: 60_000 },
    });
    const resolved = resolveMember(member(pr('shop', 12)), stale);
    expect(
      evaluateRule({ id: 'r', kind: 'pr-merged', target: resolved.member.key }, resolved).result,
    ).toBe('unknown');
  });

  it('a shared plan pull request never delivers an item', () => {
    const items = [
      makeItem({ id: 201, linkedPullRequests: [{ repositoryId: 'r', number: 50 }] }),
      makeItem({ id: 202, linkedPullRequests: [{ repositoryId: 'r', number: 50 }] }),
      makeItem({ id: 203, linkedPullRequests: [{ repositoryId: 'r', number: 50 }] }),
    ];
    const plan = makeKnownPr({
      number: 50,
      state: 'merged',
      title: 'Plan for the epic',
      workItemIds: [201, 202, 203],
    });
    const sources = snapshot({ items: overviews(items, [plan]) });
    const resolved = resolveMember(member(item(201)), sources);
    const outcome = evaluateRule(
      { id: 'r', kind: 'item-delivered', target: resolved.member.key },
      resolved,
    );
    expect(outcome).toEqual({ result: 'unmet', summary: 'AB#201 has only a shared plan PR' });
  });

  it('an item is delivered by its own pull request as Dispatch picks it, read live', () => {
    const items = overviews(
      [
        makeItem({
          id: 210,
          linkedPullRequests: [
            { repositoryId: 'r', number: 60 },
            { repositoryId: 'r', number: 61 },
          ],
        }),
      ],
      [
        makeKnownPr({ number: 60, state: 'merged', title: 'AB#210 first try', workItemIds: [210] }),
        makeKnownPr({ number: 61, state: 'open', title: 'AB#210 second try', workItemIds: [210] }),
      ],
    );
    const rule = (key: string): EvidenceRule => ({ id: 'r', kind: 'item-delivered', target: key });
    const open = resolveMember(
      member(item(210)),
      snapshot({ items, polled: new Map([polled('acme', 'shop', 61)]) }),
    );
    expect(evaluateRule(rule(open.member.key), open)).toEqual({
      result: 'unmet',
      summary: "AB#210's #61 is open",
    });
    const unread = resolveMember(member(item(210)), snapshot({ items }));
    expect(evaluateRule(rule(unread.member.key), unread).result).toBe('unknown');
  });

  it('an item reaches a state once it is there or later in its workflow', () => {
    const sources = snapshot({ items: overviews([makeItem({ id: 9, state: 'Ready For QA' })]) });
    const resolved = resolveMember(member(item(9)), sources);
    const rule = (value: string): EvidenceRule => ({
      id: 'r',
      kind: 'item-state',
      target: resolved.member.key,
      value,
    });
    expect(evaluateRule(rule('Code Review'), resolved).result).toBe('met');
    expect(evaluateRule(rule('Done'), resolved).result).toBe('unmet');
    expect(evaluateRule(rule('Nonsense'), resolved).result).toBe('unknown');
  });

  it('a rule kind from a newer BorgDock is unknown', () => {
    const resolved = resolveMember(member(pr('shop', 12)), merged);
    expect(
      evaluateRule({ id: 'r', kind: 'deployed', target: resolved.member.key }, resolved).result,
    ).toBe('unknown');
  });
});

describe('assessWorkstream', () => {
  const A = pr('shop', 12);
  const B = pr('shop', 15);
  const C = pr('shop', 18);

  it('verifies an outcome by rule once its evidence is live, with provenance', () => {
    const { document } = withOutcome(workstream({ members: [member(A)] }), [
      { kind: 'pr-merged', target: refKey(A) },
    ]);
    const sources = snapshot({
      polled: new Map([polled('acme', 'shop', 12, { state: 'merged' })]),
    });
    const assessment = assessWorkstream(document, sources, options);
    expect(assessment.progress).toEqual({ counted: 1, required: 1 });
    expect(assessment.transitions).toHaveLength(1);
    expect(assessment.transitions[0]!.verification).toMatchObject({
      state: 'verified',
      device: 'Laptop',
      facts: [
        expect.objectContaining({ result: 'met', summary: 'acme/shop#12 merged into master' }),
      ],
    });
    expect(assessment.ready).toBe(true);
  });

  it('never counts unknown evidence as verified', () => {
    const { document } = withOutcome(workstream({ members: [member(A)] }), [
      { kind: 'pr-merged', target: refKey(A) },
    ]);
    const assessment = assessWorkstream(document, snapshot(), options);
    expect(assessment.progress).toEqual({ counted: 0, required: 1 });
    expect(assessment.transitions).toEqual([]);
  });

  it('invalidates a verified outcome when live evidence contradicts it', () => {
    const { document, outcomeId } = withOutcome(workstream({ members: [member(item(9))] }), [
      { kind: 'item-category', target: refKey(item(9)), value: 'Completed' },
    ]);
    const verified = {
      ...document,
      outcomes: document.outcomes.map((o) => ({
        ...o,
        verification: { ...o.verification, state: 'verified' as const },
      })),
    };
    const sources = snapshot({
      items: overviews([], [], [], [makeItem({ id: 9, state: 'Development In Progress' })]),
    });
    const assessment = assessWorkstream(verified, sources, options);
    expect(assessment.transitions).toEqual([
      { outcomeId, verification: expect.objectContaining({ state: 'invalidated' }) },
    ]);
    expect(assessment.attention[0]).toMatchObject({ id: `invalidated:${outcomeId}`, tone: 'bad' });
  });

  it('keeps a verification when its source goes offline', () => {
    const { document } = withOutcome(workstream({ members: [member(A)] }), [
      { kind: 'pr-merged', target: refKey(A) },
    ]);
    const verified = {
      ...document,
      outcomes: document.outcomes.map((o) => ({
        ...o,
        verification: { ...o.verification, state: 'verified' as const },
      })),
    };
    const assessment = assessWorkstream(
      verified,
      snapshot({ gitHub: { configured: true, lastPollAt: null, pollMs: 60_000 } }),
      options,
    );
    expect(assessment.progress.counted).toBe(1);
    expect(assessment.transitions).toEqual([]);
  });

  it('a dependency keeps an outcome from counting until it resolves', () => {
    let { document, outcomeId } = withOutcome(workstream({ members: [member(A), member(B)] }), []);
    document = ok(confirmOutcome(document, outcomeId, [refKey(A)], 'tried it', CONTEXT));
    document = ok(addRelation(document, 'blocks', refKey(B), outcomeKey(outcomeId), '', CONTEXT));
    const open = snapshot({
      polled: new Map([polled('acme', 'shop', 12), polled('acme', 'shop', 15)]),
    });
    const blocked = assessWorkstream(document, open, options);
    expect(blocked.outcomes[0]!.blockers.map((b) => b.key)).toEqual([refKey(B)]);
    expect(blocked.progress.counted).toBe(0);
    const mergedB = snapshot({
      polled: new Map([
        polled('acme', 'shop', 12),
        polled('acme', 'shop', 15, { state: 'merged' }),
      ]),
    });
    expect(assessWorkstream(document, mergedB, options).progress.counted).toBe(1);
  });

  it('a superseded member in a blocker chain never blocks', () => {
    let document = workstream({
      members: [member(A), member(B, { role: 'superseded' }), member(C)],
    });
    document = ok(addRelation(document, 'blocks', refKey(A), refKey(B), '', CONTEXT));
    document = ok(addRelation(document, 'blocks', refKey(B), refKey(C), '', CONTEXT));
    const sources = snapshot({
      polled: new Map([
        polled('acme', 'shop', 12),
        polled('acme', 'shop', 15),
        polled('acme', 'shop', 18),
      ]),
    });
    const assessment = assessWorkstream(document, sources, options);
    expect(assessment.blockedBy.get(refKey(C))).toBeUndefined();
    expect(assessment.blockedBy.get(refKey(B))?.map((b) => b.key)).toEqual([refKey(A)]);
  });

  it('an open decision stays visible and blocks the outcome it is about', () => {
    let { document, outcomeId } = withOutcome(workstream({ members: [member(A), member(B)] }), []);
    const opened = openDecision(document, 'Rewrite or patch?', [refKey(A), refKey(B)], CONTEXT);
    document = ok(opened);
    document = ok(
      addRelation(
        document,
        'blocks',
        `decision:${opened.decisionId}`,
        outcomeKey(outcomeId),
        '',
        CONTEXT,
      ),
    );
    const assessment = assessWorkstream(document, snapshot(), options);
    expect(assessment.openDecisions).toHaveLength(1);
    expect(
      assessment.attention.find((a) => a.id === `decision:${opened.decisionId}`),
    ).toMatchObject({ tone: 'bad' });
    const decided = ok(decide(document, opened.decisionId!, refKey(B), 'smaller', CONTEXT));
    const after = assessWorkstream(decided, snapshot(), options);
    expect(after.openDecisions).toEqual([]);
    expect(after.members.get(refKey(A))!.member.role).toBe('superseded');
  });

  it('proposals an agent left open ask for attention', () => {
    const document = workstream({
      proposals: [
        {
          id: 'p1',
          runKey: refKey(thread('t1')),
          at: '2026-10-25T00:00:00Z',
          items: [
            {
              id: 'i1',
              kind: 'next-action',
              status: 'open',
              why: 'unblocks it',
              text: 'Merge #12',
            },
            { id: 'i2', kind: 'next-action', status: 'dismissed', why: '', text: 'x' },
          ],
          dropped: [],
        },
      ],
    });
    expect(assessWorkstream(document, snapshot(), options).attention).toContainEqual(
      expect.objectContaining({ id: 'proposal:p1', reason: 'An agent proposes 1 change.' }),
    );
  });

  it('a required outcome that reads an unavailable member asks for attention', () => {
    const { document, outcomeId } = withOutcome(workstream({ members: [member(item(7))] }), [
      { kind: 'item-delivered', target: refKey(item(7)) },
    ]);
    const assessment = assessWorkstream(
      document,
      snapshot({ missingItemIds: new Set([7]) }),
      options,
    );
    expect(
      assessment.attention.some((a) => a.id === `unavailable:${outcomeId}:${refKey(item(7))}`),
    ).toBe(true);
    expect(assessment.ready).toBe(false);
  });

  it('flags a circle two machines made between them', () => {
    const document = workstream({
      members: [member(A), member(B)],
      relations: [
        { id: 'r1', kind: 'blocks', from: refKey(A), to: refKey(B), note: '' },
        { id: 'r2', kind: 'blocks', from: refKey(B), to: refKey(A), note: '' },
      ],
    });
    const assessment = assessWorkstream(document, snapshot(), options);
    expect([...assessment.cyclic]).toEqual(['r2']);
    expect(assessment.attention.some((a) => a.id === 'cycle:r2')).toBe(true);
  });

  it('asks you first when a member thread waits on you', () => {
    const asking = makeThread({
      id: 't1',
      status: 'question',
      place: 'W2',
      title: 'Queue rewrite',
    });
    const document = workstream({ members: [member(thread('t1'))] });
    const assessment = assessWorkstream(
      document,
      snapshot({ threads: threadMap([asking]) }),
      options,
    );
    expect(assessment.attention[0]).toMatchObject({
      tone: 'bad',
      action: 'Answer the agent in W2 (Queue rewrite).',
    });
  });

  it('says a stalled next action is stalled', () => {
    const document = workstream({
      members: [member(A)],
      nextAction: {
        text: 'Review the queue',
        target: null,
        setAt: '2026-10-01T00:00:00Z',
        setBy: 'you',
      },
    });
    const sources = snapshot({
      polled: new Map([polled('acme', 'shop', 12, { updatedAt: '2026-09-30T00:00:00Z' })]),
    });
    expect(
      assessWorkstream(document, sources, options).attention.some((a) => a.id === 'stalled'),
    ).toBe(true);
  });

  it('says what unblocked since the next action was set', () => {
    let { document, outcomeId } = withOutcome(workstream({ members: [member(A), member(B)] }), []);
    document = ok(addRelation(document, 'blocks', refKey(B), outcomeKey(outcomeId), '', CONTEXT));
    document = {
      ...document,
      nextAction: {
        text: 'Wait for #15',
        target: null,
        setAt: '2026-10-20T00:00:00Z',
        setBy: 'you',
      },
    };
    const sources = snapshot({
      polled: new Map([
        polled('acme', 'shop', 15, { state: 'merged', mergedAt: '2026-10-25T00:00:00Z' }),
      ]),
    });
    const unblocked = assessWorkstream(document, sources, options).attention.find((a) =>
      a.id.startsWith('unblocked:'),
    );
    expect(unblocked).toMatchObject({ tone: 'ok' });
  });

  it('learns a repository rename and offers the relink', () => {
    const document = workstream({ members: [member(pr('shop', 12))] });
    const sources = snapshot({
      lookedUp: new Map([
        lookedUp('acme', 'shop', 12, {
          status: 'found',
          readAt: SNAPSHOT_NOW,
          checkedAt: SNAPSHOT_NOW,
          failing: null,
          pullRequest: {
            number: 12,
            url: 'https://github.com/acme/storefront/pull/12',
            title: 'Queue',
            state: 'open',
            isDraft: false,
            mergedAt: null,
            closedAt: null,
            headRefName: 'f',
            baseRefName: 'master',
            headSha: null,
            approved: false,
            conflicting: false,
            checks: null,
            repositoryId: 'R_1',
            nameWithOwner: 'acme/storefront',
          },
        }),
      ]),
    });
    expect(assessWorkstream(document, sources, options).relinks).toEqual([
      {
        key: refKey(pr('shop', 12)),
        ref: expect.objectContaining({ owner: 'acme', repo: 'storefront', repositoryId: 'R_1' }),
      },
    ]);
  });
});

describe('suggestMembers', () => {
  it('offers an epic’s children, its pull requests and its threads, but never one dismissed', () => {
    const epic = makeItem({ id: 300, typeName: 'Epic', childIds: [301, 302] });
    const child = makeItem({ id: 301, title: 'Child one', parentId: 300 });
    const linkedThread = makeThread({ id: 't9', title: 'AB#300 plan', hostId: 'local' });
    const items = overviews(
      [epic, child],
      [makeKnownPr({ number: 70, workItemIds: [300], title: 'AB#300 plan' })],
      [linkedThread],
    );
    const document = workstream({
      members: [member(item(300))],
      dismissedSuggestions: [refKey(item(302))],
    });
    const assessment = assessWorkstream(
      document,
      snapshot({ items, threads: threadMap([linkedThread]) }),
      options,
    );
    const suggestions = suggestMembers(document, assessment, {
      items,
      hosts: [host('local', 'env-laptop')],
    });
    expect(suggestions.map((s) => [s.id, s.why])).toEqual([
      [refKey(item(301)), 'Child of AB#300'],
      [refKey(thread('t9')), 'Dispatch links it to AB#300'],
      [refKey(pr('shop', 70)), 'Pull request of AB#300'],
    ]);
  });
});
