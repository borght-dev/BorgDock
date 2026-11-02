// BorgDock platform sample data: machines and sources, the states walk on the overview, thread detail, launch
// targets and branches, activity pages and preferences. Mirrors the iPhone mockups (design/ios-app/mockups.html,
// sections 4, 5 and 8). Writes stay in memory and show up in /preview/writes.
const at = (hours) => new Date(Date.now() - hours * 3600000).toISOString();

const workflow = ['New', 'Development In Progress', 'Code Review', 'Testing Failed', 'Needs Human', 'Ready For QA', 'Done'];
const category = (state) => (state === 'New' ? 'Proposed' : state === 'Done' ? 'Completed' : 'InProgress');
const item = (id, title, type, state, extra = {}) => ({
  id, title, type, typeName: type, state, stateCategory: category(state), workflow, sprint: '2026.22', dueDate: null,
  priority: 2, tags: [], assignedTo: 'Koen van der Borght', assignedToMe: true,
  url: `https://dev.azure.com/acme/Shop/_workitems/edit/${id}`, ...extra,
});
const thread = (id, title, branch, status, hours, lastAgentMessage = null, environment = 'mac-mini') => ({
  id: `sample-${id}`, title, worktree: branch, branch, status, createdAt: at(hours + 2), lastActivityAt: at(hours),
  model: 'claude-opus-5-5', questionRequestId: null, questions: [], lastAgentMessage, environmentId: environment,
  environmentLabel: environment, available: true, link: `https://example.invalid/thread/${id}`,
  appLink: `t3code://threads/${environment}/sample-${id}`,
});
const pr = (number, state, title, branch, checks = null) => ({ number, state, title, branch, isDraft: false, checks, url: `https://github.com/acme/shop/pull/${number}` });
const entry = (workItem, bay, threads, pullRequest, walk, suggestion = null) => ({ item: workItem, bay, threads, pullRequest, suggestion, waitingFor: null, queuedAt: null, walk });
const verdict = (label, tone) => ({ label, tone });
const evidence = (label, tone, kind) => ({ label, tone, kind });

const planMessage = `**Plan**

1. Persist the basket in IndexedDB (\`basket-db.ts\`), one store per device.
2. Queue adds and removes while offline; replay them on reconnect.
3. Merge server and local lines by line id, newest change wins.
4. Show a banner when the basket came from offline.
5. Specs: offline add, reconnect merge, conflict.

Touches \`basket-store.ts\` and 2 new files.`;

const items = [
  entry(item(61021, 'Basket empties after a payment timeout', 'Bug', 'Code Review'), 'waiting',
    [thread(61021, 'Basket timeout', 'basket-timeout', 'settled', 1, 'Pushed the banner and a spec')],
    pr(3712, 'open', 'Checkout: keep the basket on a payment timeout', 'basket-timeout', 'failure'),
    { verdict: verdict('CI red', 'bad'), evidence: [evidence('#3712 open', null, 'pr'), evidence('basket-timeout', null, 'agent')],
      latest: { by: 'Vera · qa-check', text: 'e2e fails on the timeout path, the banner never renders. Back to you.', at: at(0.67), source: 'comment' } }),
  entry(item(61002, 'Export orders to CSV', 'PBI', 'Code Review'), 'drift', [], pr(3701, 'open', 'Export orders to CSV', 'export-csv', 'success'),
    { verdict: verdict('Ready to merge', 'ok'), evidence: [evidence('#3701 approved', 'ok', 'pr')], latest: null },
    { id: 's-61002', to: 'Ready For QA', reason: '#3701 is approved and green. ADO still says Code Review.' }),
  entry(item(61044, 'Offline basket for the mobile app', 'PBI', 'Development In Progress'), 'waiting',
    [thread(61044, 'Offline basket for the mobile app', 'offline-basket', 'your-turn', 48, planMessage)], null,
    { verdict: verdict('Waiting on you · 2 d', 'bad'), evidence: [],
      latest: { by: 'Agent', text: 'Plan ready: 5 steps, IndexedDB store per device, replay on reconnect.', at: at(48), source: 'agent' } }),
  entry(item(60988, 'Refund email sent twice', 'Bug', 'Development In Progress'), 'working',
    [thread(60988, 'Refund email sent twice', 'refund-email', 'running', 0.2, null, 'workstation')], null,
    { verdict: verdict('Agent on it', 'run'), evidence: [], latest: null }),
  entry(item(60950, 'Coupon codes rejected after midnight', 'Bug', 'Testing Failed'), 'drift', [],
    pr(3690, 'merged', 'Coupon field accepts lowercase codes', 'coupon-case'),
    { verdict: verdict('Back from QA', 'warn'), evidence: [evidence('#3690 merged', 'ok', 'merged'), evidence('Due Fri', 'warn', 'due')],
      latest: { by: 'Sanne', text: 'Still fails for codes entered between 00:00 and 00:05.', at: at(20), source: 'comment' } },
    { id: 's-60950', to: 'Development In Progress', reason: 'QA sent it back. ADO says Testing Failed.' }),
  entry(item(61063, 'Address form loses focus on rotate', 'Bug', 'New'), 'idle', [], null,
    { verdict: verdict('Not started', 'mute'), evidence: [evidence('P1', 'warn', 'priority')], latest: null }),
  entry(item(61070, 'Saved addresses on the checkout page', 'PBI', 'New'), 'drift', [], null,
    { verdict: verdict('Not started', 'mute'), evidence: [], latest: null },
    { id: 's-61070', to: null, reason: 'A branch exists but ADO says New.' }),
];

const overview = () => ({
  generatedAt: at(0),
  items,
  unlinkedThreads: [{ ...thread(70001, 'Spike: faster product search', 'search-spike', 'your-turn', 5, 'The trigram index halves the query time.'), guessItemId: null }],
  worktrees: [],
  sources: { ado: { ok: true, at: at(0), error: null }, t3: { ok: true, at: at(0), error: null } },
  walk: {
    lanes: [
      { state: 'Code Review', itemIds: [61021, 61002], tone: 'bad', summary: '1 needs you' },
      { state: 'Development In Progress', itemIds: [61044, 60988], tone: 'bad', summary: '1 needs you' },
      { state: 'Testing Failed', itemIds: [60950], tone: 'warn', summary: '1 back from QA' },
      { state: 'New', itemIds: [61063, 61070], tone: null, summary: '' },
    ],
    briefing: { needYou: 2, outOfSync: 3, running: 4 },
  },
});

const threadDetails = {
  'sample-61044': {
    thread: items[2].threads[0], itemId: 61044, place: 'offline-basket', machine: 'mac-mini',
    messages: [
      { id: 'm1', role: 'user', text: 'Implement AB#61044: keep the basket on the phone while offline and replay it when the connection is back. Plan first.', at: at(50) },
      { id: 'm2', role: 'assistant', text: planMessage, at: at(48) },
    ],
    activity: { reads: 23, commands: 4, minutes: 3 },
    planReady: true,
  },
};
// A sync run's report: a table, a quote and a rule, the markdown the thread screen has to lay out.
const syncReport = `Moved AB#61002 to Ready For QA; the other items keep their state.

| Item | State now | Evidence recorded |
|---|---|---|
| AB#61002 | **Ready For QA** | Both pull requests merged; proof verified on staging |
| AB#61044 | Development In Progress | Offline replay works; conflict handling still open |
| AB#60950 | Testing Failed | QA found the refund rounding off by one cent |

> Developer Notes updated on all three; QA Notes left alone.

---

Verification: tracker reconciliation only, no repository changes.`;
threadDetails['sample-sync'] = {
  thread: { ...thread('sync', 'Fix out of sync', 'sync-ado', 'settled', 1, syncReport) },
  itemId: null, place: 'sync-ado', machine: 'mac-mini',
  messages: [
    { id: 'u', role: 'user', text: 'Bring the out-of-sync items in line with their pull requests and threads.', at: at(2) },
    { id: 'a', role: 'assistant', text: syncReport, at: at(1) },
  ],
  activity: { reads: 0, commands: 63, minutes: 5 },
  planReady: false,
};
const threadDetail = (id) => {
  if (threadDetails[id]) return threadDetails[id];
  const found = items.flatMap((e) => e.threads.map((t) => ({ t, itemId: e.item.id }))).find(({ t }) => t.id === id);
  const t = found?.t ?? { ...thread(70001, 'Spike: faster product search', 'search-spike', 'your-turn', 5, 'The trigram index halves the query time.'), id };
  return {
    thread: t, itemId: found?.itemId ?? null, place: t.branch, machine: t.environmentLabel,
    messages: [
      { id: 'u', role: 'user', text: `Work on ${t.title}.`, at: at(6) },
      { id: 'a', role: 'assistant', text: t.lastAgentMessage ?? 'Working on it.', at: t.lastActivityAt },
    ],
    activity: { reads: 12, commands: 3, minutes: 9 },
    planReady: false,
  };
};

const machines = [
  { id: 'mac-mini', label: 'mac-mini', kind: 'local', online: true, lastSeenAt: at(0), threads: 3, version: '1.0.0' },
  { id: 'workstation', label: 'workstation', kind: 'connector', online: true, lastSeenAt: at(0), threads: 1, version: '1.0.0' },
  { id: 'build-vm', label: 'build-vm', kind: 'ssh', online: false, lastSeenAt: at(2), threads: 0, version: '1.0.0' },
];

const targets = {
  machines,
  projects: [
    { id: 'p-shop', machineId: 'mac-mini', title: 'shop', repository: 'acme/shop', defaultBranch: 'master' },
    { id: 'p-api', machineId: 'mac-mini', title: 'api', repository: 'acme/api', defaultBranch: 'main' },
    { id: 'w-shop', machineId: 'workstation', title: 'shop', repository: 'acme/shop', defaultBranch: 'master' },
  ],
  threads: [
    { id: 'sample-61044', machineId: 'mac-mini', projectId: 'p-shop', title: 'Offline basket for the mobile app', place: 'offline-basket', status: 'your-turn' },
    { id: 'sample-61021', machineId: 'mac-mini', projectId: 'p-shop', title: 'Basket timeout', place: 'basket-timeout', status: 'settled' },
  ],
  models: [
    { id: 'claude/claude-opus-5-5', label: 'Opus 5.5', provider: 'Claude', recent: true, efforts: [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }], defaultEffort: 'high' },
    { id: 'codex/gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'Codex', recent: true, efforts: [{ id: 'high', label: 'High' }], defaultEffort: 'high' },
  ],
  defaultModel: 'claude/claude-opus-5-5',
};

const activityEntries = [
  ['a1', 'review', 'Tom approved shop #3698', 'Search: debounce the product filter', 0.4, false, 'ok', { kind: 'pr', key: 'acme/shop#3698' }],
  ['a2', 'ci', 'CI broke on master', 'e2e / checkout · also on #3712, #3715', 0.65, false, 'bad', { kind: 'ci', groupId: 'grp-checkout' }],
  ['a3', 'agent', 'Agent finished AB#60988', 'Opened #2296 · Refund email sent twice', 0.9, false, 'run', { kind: 'thread', id: 'sample-60988', itemId: 60988 }],
  ['a4', 'merge', 'Lars merged shop #3690', 'Coupon field accepts lowercase codes', 1.45, false, 'ok', { kind: 'pr', key: 'acme/shop#3690' }],
  ['a5', 'workitem', 'AB#61002 moved to Code Review', 'By the agent on export-csv', 1.75, false, 'mute', { kind: 'item', id: 61002 }],
  ['a6', 'comment', 'Sanne replied on #3712', 'It comes back as aborted, so it keeps retrying the payment', 3.2, false, 'mute', { kind: 'pr', key: 'acme/shop#3712' }],
  ['a7', 'review', 'Sanne asked for your review on shop #3715', 'Checkout: retry the payment once', 3.6, false, 'warn', { kind: 'pr', key: 'acme/shop#3715' }],
  ['a8', 'agent', 'Agent asks about AB#61044', 'Plan ready: 5 steps, IndexedDB store…', 4, false, 'bad', { kind: 'thread', id: 'sample-61044', itemId: 61044 }],
  ['a9', 'ci', 'Checks failed on shop #3712', 'e2e / checkout › keeps the basket on timeout', 4.2, false, 'bad', { kind: 'pr', key: 'acme/shop#3712' }],
  ['a10', 'merge', 'You merged shop #3688', 'Basket: keep line ids stable', 4.4, false, 'ok', { kind: 'pr', key: 'acme/shop#3688' }],
  ['a11', 'agent', 'Agent finished AB#61002', 'Opened #3701 · Export orders to CSV', 4.5, false, 'run', { kind: 'thread', id: 'sample-61002', itemId: 61002 }],
  ['a12', 'review', 'Tom requested changes on shop #3709', 'Orders: paginate the export', 4.6, false, 'warn', { kind: 'pr', key: 'acme/shop#3709' }],
  ['a13', 'workitem', 'AB#60950 moved to Testing Failed', 'By Sanne', 26, true, 'warn', { kind: 'item', id: 60950 }],
  ['a14', 'comment', 'Lars commented on #3701', 'Looks good, one nit on the header row', 28, true, 'mute', { kind: 'pr', key: 'acme/shop#3701' }],
].map(([id, category, title, detail, hours, read, tone, target]) => ({ id, category, title, detail, at: at(hours), read, tone, target }));

const activityPage = (query) => {
  const category = query.get('category');
  const before = query.get('before');
  const limit = Number(query.get('limit') ?? 50);
  const unreadByCategory = Object.fromEntries(['review', 'ci', 'agent', 'merge', 'workitem', 'comment'].map((c) => [c, activityEntries.filter((e) => e.category === c && !e.read).length]));
  const entries = activityEntries.filter((e) => (!category || e.category === category) && (!before || e.at < before)).slice(0, limit);
  const unread = activityEntries.filter((e) => !e.read).length;
  return { entries, unread, unreadByCategory, away: unread ? { from: at(4.75), to: at(0.3), merged: 2, ciFailures: 2, agentsDone: 3, other: 5 } : null };
};

// Linked BorgDock desktops, shared with 00-server.mjs (account devices). /preview/desktop-off unlinks them all,
// /preview/desktop-on brings the sample back. Approving a code links "Home laptop"; DELETE on its session unlinks it.
const sampleDesktop = () => ({ sessionId: 's-desk-1', name: 'Work laptop', lastSeenAt: at(0.02), atDesk: true, createdAt: at(72) });
globalThis.borgdockDesktops = [sampleDesktop()];
const desktops = () => globalThis.borgdockDesktops.map(({ createdAt, ...desktop }) => desktop);

const sources = {
  github: [
    { login: 'koen', via: 'account', machine: null, ok: true, error: null, polledAt: at(0) },
    { login: 'koen-acme', via: 'machine', machine: 'mac-mini', ok: true, error: null, polledAt: at(0) },
  ],
  ado: { org: 'acme', project: 'Shop', via: 'machine', machine: 'mac-mini', ok: true, error: null },
  machines,
};

const preferences = {
  categories: { review: 'immediate', ci: 'immediate', agent: 'immediate', merge: 'summary', workitem: 'summary', comment: 'off' },
  quietAtDesk: true,
  faceIdForActions: true,
};

const itemDetail = (id) => {
  const found = items.find((e) => e.item.id === id);
  if (!found) return undefined;
  const descriptions = {
    61021: 'Pay with the test provider set to a 35 s delay. After the timeout the header shows <b>Basket (0)</b> and the lines are gone; refreshing doesn\'t bring them back.',
  };
  return {
    item: found.item,
    description: descriptions[id] ?? `${found.item.title}. Sample description for the screenshots.`,
    acceptanceCriteria: 'The basket keeps its lines after a payment timeout.',
    reproSteps: '',
    qaNotes: '',
    comments: [{ by: 'Vera', at: at(0.67), text: 'e2e fails on the timeout path, the banner never renders. Back to you.' }],
  };
};

// BorgDock's Clerk development app (the key is public), so the simulator shows the real Clerk sign-in;
// 00-server.mjs reads it for /api/server. /preview/clerk-off shows the passkey fallback instead.
const sampleClerk = { publishableKey: 'pk_test_cmVsZXZhbnQtZ3JvdXNlLTg1NzIuY2xlcmsuYWNjb3VudHMuZGV2JA', frontendApi: 'https://relevant-grouse-8572.clerk.accounts.dev' };
globalThis.borgdockClerk = sampleClerk;

export function handle({ path, method, query, body, writes }) {
  if (path === '/preview/clerk-off') { globalThis.borgdockClerk = null; return { ok: true }; }
  if (path === '/preview/clerk-on') { globalThis.borgdockClerk = sampleClerk; return { ok: true }; }
  if (path === '/api/overview' || path === '/api/refresh') return overview();
  if (path === '/api/sources') return { ...sources, desktops: desktops() };
  if (path === '/preview/desktop-off') { globalThis.borgdockDesktops = []; return { ok: true }; }
  if (path === '/preview/desktop-on') { globalThis.borgdockDesktops = [sampleDesktop()]; return { ok: true }; }
  if (path === '/api/desktop/links/approve' && method === 'POST') {
    writes.push({ path, body });
    const desktop = { sessionId: `s-desk-${globalThis.borgdockDesktops.length + 2}`, name: 'Home laptop', lastSeenAt: null, atDesk: false, createdAt: at(0) };
    globalThis.borgdockDesktops.push(desktop);
    return { deviceName: desktop.name, sessionId: desktop.sessionId };
  }
  const sessionMatch = path.match(/^\/api\/auth\/sessions\/([^/]+)$/);
  if (sessionMatch && method === 'DELETE') {
    writes.push({ path });
    globalThis.borgdockDesktops = globalThis.borgdockDesktops.filter((d) => d.sessionId !== decodeURIComponent(sessionMatch[1]));
    return { ok: true };
  }
  if (path === '/api/preferences') {
    if (method === 'PUT') { Object.assign(preferences, body); writes.push({ path, body }); }
    return preferences;
  }
  if (path === '/api/agents/targets') return targets;
  if (path === '/api/agents/branches') return { branches: ['master', 'release/2026.22', 'offline-basket', 'basket-timeout'], defaultBranch: 'master' };
  if (path === '/api/agents/launch' && method === 'POST') {
    writes.push({ path, body });
    return { threadId: 'sample-61044', link: 'https://example.invalid/thread/started', appLink: 't3code://threads/mac-mini/sample-61044', adoState: body.moveAdoTo, warning: null };
  }
  if (path === '/api/activity') return activityPage(query);
  if (path === '/api/activity/read' && method === 'POST') {
    writes.push({ path, body });
    for (const e of activityEntries) if (body.all || body.ids?.includes(e.id)) e.read = true;
    return { unread: activityEntries.filter((e) => !e.read).length };
  }
  if (path === '/api/machines/pair' && method === 'POST') {
    writes.push({ path, body });
    return { id: 'laptop', label: 'laptop', kind: 'connector', online: true, lastSeenAt: at(0), threads: 0, version: '1.0.0' };
  }
  if (path === '/api/auth/clerk' && method === 'POST') {
    writes.push({ path, body: { ...body, clerkToken: '<redacted>' } });
    return { token: 'sample-token-for-fixture-only-123', sessionId: 's1', owner: { clerkUserId: 'user_sample', name: 'Koen', email: null, imageUrl: null } };
  }
  const threadMatch = path.match(/^\/api\/threads\/([^/]+)(\/[a-z-]+)?$/);
  if (threadMatch && method === 'GET' && !threadMatch[2]) return threadDetail(decodeURIComponent(threadMatch[1]));
  if (threadMatch && method === 'POST' && ['/messages', '/approve-plan'].includes(threadMatch[2])) {
    writes.push({ path, body });
    return { ok: true };
  }
  const itemMatch = path.match(/^\/api\/items\/(\d+)$/);
  if (itemMatch && method === 'GET') return itemDetail(Number(itemMatch[1]));
  return undefined;
}
