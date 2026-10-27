import type { ActivityEntry } from '../types';

/**
 * Realistic entries for every category group, for stories and UI tests.
 * Times are relative to `FIXTURE_NOW`.
 */
export const FIXTURE_NOW = new Date('2026-10-27T15:30:00.000Z');

const at = (minutesAgo: number) =>
  new Date(FIXTURE_NOW.getTime() - minutesAgo * 60_000).toISOString();

const NO_LINKS = { itemIds: [], prUrls: [], workstreamIds: [], ciGroupIds: [] };

function entry(
  overrides: Partial<ActivityEntry> & Pick<ActivityEntry, 'id' | 'category' | 'summary'>,
): ActivityEntry {
  return {
    schema: 1,
    sourceId: 't3:local',
    entity: { kind: 'thread', key: 't3:local:thread:a', title: 'Fix login', url: null },
    severity: 'info',
    needsYou: false,
    status: 'open',
    resolvedBy: null,
    sourceAt: at(5),
    observedAt: at(5),
    coverage: 'live',
    detail: null,
    action: null,
    links: NO_LINKS,
    read: 'unread',
    readReason: null,
    readAt: null,
    version: 1,
    ...overrides,
  };
}

export const questionEntry = entry({
  id: 't3:local|thread:a:request:req-1',
  category: 'agent.question',
  severity: 'warning',
  needsYou: true,
  summary: 'W3 asks: Keep the old session cookie for one release, or drop it now?',
  detail:
    'Keep the old session cookie for one release, or drop it now?\n• Keep it for one release\n• Drop it now',
  action: {
    kind: 'answer',
    hostId: 'local',
    threadId: 'a',
    requestId: 'req-1',
    option: 'Keep it for one release',
  },
  links: { ...NO_LINKS, itemIds: [41250] },
  sourceAt: at(3),
  observedAt: at(3),
});

export const planEntry = entry({
  id: 't3:mini|thread:b:plan:run:thread:b:ordinal:4',
  sourceId: 't3:mini',
  entity: { kind: 'thread', key: 't3:mini:thread:b', title: 'Split the invoice export', url: null },
  category: 'agent.plan',
  severity: 'warning',
  needsYou: true,
  summary: 'M2 has a plan for Split the invoice export',
  detail: 'Plan: move the CSV writer behind an interface, then add the XLSX one.',
  action: { kind: 'approve-plan', hostId: 'mini', threadId: 'b', runId: 'run:thread:b:ordinal:4' },
  sourceAt: at(12),
  observedAt: at(12),
});

export const turnEntry = entry({
  id: 't3:local|thread:c:run:run:thread:c:ordinal:9:completed',
  entity: {
    kind: 'thread',
    key: 't3:local:thread:c',
    title: 'Rename the planning board',
    url: null,
  },
  category: 'agent.turn',
  severity: 'success',
  summary: 'W1 finished its turn on Rename the planning board',
  detail: 'Renamed the board and updated 14 references. Tests pass.',
  action: { kind: 'open-thread', hostId: 'local', threadId: 'c' },
  sourceAt: at(26),
  observedAt: at(26),
  read: 'read',
  readReason: 'seen-in-t3',
  readAt: at(20),
});

export const failedEntry = entry({
  id: 't3:local|thread:d:run:run:thread:d:ordinal:2:failed',
  entity: { kind: 'thread', key: 't3:local:thread:d', title: 'Fix flaky upload test', url: null },
  category: 'agent.failed',
  severity: 'error',
  needsYou: true,
  summary: 'W2 stopped with an error on Fix flaky upload test',
  detail: 'provider_error: Insufficient context allowance for the provider handoff.',
  action: { kind: 'open-thread', hostId: 'local', threadId: 'd' },
  sourceAt: at(41),
  observedAt: at(41),
});

export const reviewEntry = entry({
  id: 'gh:github.com|koen|acme/app|#412:review:991',
  sourceId: 'gh:github.com|koen|acme/app',
  entity: {
    kind: 'pr',
    key: 'gh:acme/app#412',
    title: 'Faster login',
    url: 'https://github.com/acme/app/pull/412',
  },
  category: 'pr.review',
  severity: 'warning',
  needsYou: true,
  summary: 'ann requested changes on #412 Faster login',
  action: { kind: 'open-pr', owner: 'acme', repo: 'app', number: 412, tab: 'reviews' },
  links: { ...NO_LINKS, prUrls: ['https://github.com/acme/app/pull/412'] },
  sourceAt: at(55),
  observedAt: at(54),
});

export const checksEntry = entry({
  id: 'gh:github.com|koen|acme/app|#412:checks:abc123:failed',
  sourceId: 'gh:github.com|koen|acme/app',
  entity: reviewEntry.entity,
  category: 'pr.checks-failed',
  severity: 'error',
  needsYou: true,
  summary: 'build failed on #412 Faster login',
  detail: 'build: TS2322 Type string is not assignable to type number (src/login.ts)',
  action: { kind: 'fix-checks', owner: 'acme', repo: 'app', number: 412, headSha: 'abc123' },
  links: reviewEntry.links,
  sourceAt: at(70),
  observedAt: at(69),
});

export const reachedEntry = entry({
  id: 'deploy:github.com|koen|acme/app|reached:acme/app#398:acc',
  sourceId: 'deploy:github.com|koen|acme/app',
  entity: {
    kind: 'pr',
    key: 'gh:acme/app#398',
    title: 'Cache the tenant list',
    url: 'https://github.com/acme/app/pull/398',
  },
  category: 'deploy.reached',
  severity: 'success',
  summary: '#398 reached acc',
  action: { kind: 'open-url', url: 'https://github.com/acme/app/actions/runs/4047' },
  sourceAt: at(95),
  observedAt: at(93),
});

export const ciEntry = entry({
  id: 'ci:github.com|koen|acme/app|g1:group-grew:3',
  sourceId: 'ci:github.com|koen|acme/app',
  entity: { kind: 'ci-group', key: 'ci:g1', title: 'Login spec times out', url: null },
  category: 'ci.group-grew',
  severity: 'warning',
  needsYou: true,
  summary: 'Login spec times out now fails on 3 PRs, and nobody owns it',
  detail: 'PRs: #412, #415, #420',
  action: { kind: 'open-ci-group', scope: 'github.com||acme/app', groupId: 'g1' },
  sourceAt: at(130),
  observedAt: at(130),
});

export const workstreamEntry = entry({
  id: 'workstreams:local|ws1:unblocked:r1#1',
  sourceId: 'workstreams:local',
  entity: { kind: 'workstream', key: 'workstream:ws1', title: 'Checkout rewrite', url: null },
  category: 'workstream.unblocked',
  severity: 'success',
  needsYou: true,
  summary: 'Unblocked: Checkout rewrite. #401 merged, so the payment step can start',
  action: { kind: 'open-workstream', id: 'ws1' },
  sourceAt: null,
  observedAt: at(180),
  coverage: 'catch-up',
});

export const adoEntry = entry({
  id: 'ado:org/proj|ado-comment:9001',
  sourceId: 'ado:org/proj',
  entity: {
    kind: 'workitem',
    key: 'ado:org/proj:41250',
    title: 'Login fails on Safari',
    url: null,
  },
  category: 'ado.comment',
  severity: 'info',
  needsYou: true,
  summary: 'Ann de Vries commented on 41250 Login fails on Safari',
  detail: 'Can you check this on iOS 26 too? QA saw it there yesterday.',
  action: { kind: 'open-item', itemId: 41250 },
  sourceAt: at(60 * 20),
  observedAt: at(60 * 19),
});

export const answeredEntry = entry({
  ...questionEntry,
  id: 't3:local|thread:a:request:req-0',
  status: 'resolved',
  resolvedBy: 'answered',
  summary: 'W3 asks: Use the new date picker everywhere?',
  sourceAt: at(60 * 21),
  observedAt: at(60 * 21),
});

export const FIXTURE_ENTRIES: ActivityEntry[] = [
  questionEntry,
  planEntry,
  turnEntry,
  failedEntry,
  reviewEntry,
  checksEntry,
  reachedEntry,
  ciEntry,
  workstreamEntry,
  adoEntry,
  answeredEntry,
];

/** Many entries for the long-list story: the same few, repeated over two weeks. */
export function manyEntries(count: number): ActivityEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const base = FIXTURE_ENTRIES[i % FIXTURE_ENTRIES.length]!;
    const time = new Date(FIXTURE_NOW.getTime() - i * 9 * 60_000).toISOString();
    return {
      ...base,
      id: `${base.id}#${i}`,
      entity: { ...base.entity, key: `${base.entity.key}#${i % 40}` },
      sourceAt: time,
      observedAt: time,
      read: i % 3 === 0 ? 'unread' : 'read',
    };
  });
}
