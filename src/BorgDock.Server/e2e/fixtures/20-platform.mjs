// BorgDock platform sample data: machines and sources, the states walk on the overview, thread detail, launch
// targets and branches, activity pages and preferences. Mirrors the iPhone mockups (design/ios-app/mockups.html,
// sections 4, 5 and 8). Writes stay in memory and show up in /preview/writes.
import { deflateSync } from 'node:zlib';

const at = (hours) => new Date(Date.now() - hours * 3600000).toISOString();

const workflow = ['New', 'In Progress', 'Plan Review', 'Code Review', 'Testing', 'Testing Failed', 'Needs Human', 'Done'];
const category = (state) => ({ New: 'Proposed', Done: 'Completed', 'Code Review': 'Resolved', Testing: 'Resolved' })[state] ?? 'InProgress';
const item = (id, title, type, state, extra = {}) => ({
  id, title, type, typeName: type, state, stateCategory: category(state), workflow, sprint: '23', dueDate: null,
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

// The Work tab of design/ios-flow/mockups.html, section 07: 52 items, two back from QA, two that ask you something,
// nine in review, four agents running, the rest quiet. Lanes come in the server's walk order.
const latest = (by, text, hours, source = 'comment') => ({ by, text, at: at(hours), source });
const walked = (label, tone, evidenceList = [], message = null) => ({ verdict: verdict(label, tone), evidence: evidenceList, latest: message });
const quiet = (ids, titles, type, state, label, hours) => ids.map((id, i) => entry(item(id, titles[i % titles.length], type, state), 'idle', [], null,
  walked(label, 'mute', [], latest('Koen van der Borght', 'Moved it along.', hours + i * 3))));
const askingThread = { ...thread(61040, 'Webhook deliveries after a restart', 'webhook-retry', 'question', 0.5, 'Keep the old retry table, or migrate it?'),
  questionRequestId: 'r-61040',
  questions: [{ id: 'retry', question: 'Keep the old retry table, or migrate it?', options: [{ label: 'Keep it', value: 'keep' }, { label: 'Migrate it', value: 'migrate' }], recommended: 1, allowCustomAnswer: true, multiSelect: false }] };
const items = [
  entry(item(61021, 'Totals off by a cent on invoices with three or more lines', 'Bug', 'Testing Failed', { tags: ['invoice', 'rounding'] }), 'waiting',
    [thread(61021, 'Fix the invoice export rounding', 'invoice-rounding', 'running', 0.2)],
    pr(412, 'open', 'Round totals per line instead of per order', 'invoice-rounding', 'failure'),
    walked('Failed QA', 'bad', [evidence('#412 · checks failing', 'bad', 'pr')], latest('Lena (QA)', 'still € 0,01 off on the export', 23))),
  entry(item(61034, 'Customer price lists per group', 'PBI', 'Testing Failed'), 'waiting', [], pr(409, 'merged', 'Price lists per customer group', 'price-lists'),
    walked('Failed QA', 'bad', [evidence('#409 merged 3 d', 'ok', 'merged')], latest('Vera', '2 of 9 acceptance checks fail', 20))),
  entry(item(61050, 'Price import rejects semicolons', 'Bug', 'Code Review'), 'waiting', [], pr(401, 'open', 'Accept semicolons in the price import', 'price-import-csv', 'failure'),
    walked('CI red', 'bad', [evidence('#401 e2e red', 'bad', 'pr'), evidence('1 of 2 reviews', null, 'other')], latest('Tom', 'The e2e import spec times out.', 5))),
  entry(item(61051, 'Coupon codes per customer group', 'PBI', 'Code Review'), 'waiting', [], pr(404, 'open', 'Coupons per customer group', 'group-coupons', 'failure'),
    walked('CI red', 'bad', [evidence('#404 unit red', 'bad', 'pr')], null)),
  entry(item(61055, 'Show stock per warehouse', 'PBI', 'Code Review'), 'idle', [], pr(377, 'open', 'Stock per warehouse on the product page', 'stock-per-warehouse', 'success'),
    walked('Review', 'ok', [evidence('#377 checks pass', 'ok', 'pr')], null)),
  entry(item(61056, 'Refunds for split payments', 'PBI', 'Code Review'), 'idle', [], pr(395, 'open', 'Refund split payments', 'split-refunds'),
    walked('Waiting on review', 'mute', [], latest('Koen van der Borght', 'Ready for review.', 50))),
  entry(item(61057, 'Log the webhook payload size', 'Task', 'Code Review'), 'idle', [], pr(396, 'open', 'Log webhook payload sizes', 'webhook-size'),
    walked('Waiting', 'mute', [], latest('Koen van der Borght', 'Small one.', 26))),
  entry(item(61002, 'Export orders to CSV', 'PBI', 'Code Review'), 'drift', [], pr(3701, 'open', 'Export orders to CSV', 'export-csv', 'success'),
    walked('Waiting on review', 'mute', [], latest('Koen van der Borght', 'Ready for review.', 72)),
    { id: 's-61002', to: 'Testing', reason: '#3701 is approved and green. ADO still says Code Review.' }),
  ...quiet([61058, 61059, 61060], ['Paginate the order export', 'Search orders by phone number', 'Show the VAT number on receipts'], 'PBI', 'Code Review', 'Waiting on review', 75),
  entry(item(61040, 'Webhook deliveries stop after a restart', 'Bug', 'Needs Human'), 'waiting', [askingThread], null,
    walked('Answer', 'warn', [], latest('Agent', 'keep the old retry table, or migrate it?', 0.5, 'agent'))),
  entry(item(61044, 'Offline basket for the mobile app', 'PBI', 'Needs Human'), 'waiting',
    [thread(61044, 'Offline basket for the mobile app', 'offline-basket', 'plan', 48, planMessage)], null,
    walked('Plan to review', 'warn', [], latest('Agent', 'Plan ready: 5 steps, IndexedDB store per device, replay on reconnect.', 48, 'agent'))),
  entry(item(60988, 'Refund email sent twice', 'Bug', 'In Progress'), 'working',
    [thread(60988, 'Refund email sent twice', 'refund-email', 'running', 0.2, null, 'workstation')], null,
    walked('Agent on it', 'run', [evidence('refund-email', null, 'agent')])),
  ...[[61061, 'Delivery slots on the order page', 'delivery-slots'], [61062, 'Gift card balance in the app', 'gift-card-balance'], [61064, 'Faster product search on a cold cache', 'search-cache']]
    .map(([id, title, branch]) => entry(item(id, title, 'PBI', 'In Progress'), 'working', [thread(id, title, branch, 'running', 0.4)], null,
      walked('Agent on it', 'run', [evidence(branch, null, 'agent')]))),
  entry(item(61063, 'Address form loses focus on rotate', 'Bug', 'New'), 'drift', [], null, walked('Not started', 'mute'),
    { id: 's-61063', to: null, reason: 'A branch exists but ADO says New.' }),
  entry(item(61070, 'Saved addresses on the checkout page', 'PBI', 'New'), 'drift', [], null, walked('Not started', 'mute'),
    { id: 's-61070', to: null, reason: 'A branch exists but ADO says New.' }),
  ...quiet(Array.from({ length: 20 }, (_, i) => 61100 + i), ['Newsletter sign-up in the footer', 'Track and trace on the order page', 'Print a return label at home', 'Wishlist on the app', 'Sort reviews by date'], 'PBI', 'New', 'Not started', 100),
  ...quiet([61130, 61131, 61132, 61133, 61134], ['Plan: one checkout for B2B', 'Plan: stock reservations', 'Plan: price rules engine'], 'PBI', 'Plan Review', 'Plan review', 30),
  ...quiet([61140, 61141, 61142, 61143, 61144, 61145, 61146, 61147], ['Invoice PDF shows the old address', 'Delivery note on app orders', 'Order history in the app', 'Coupon field accepts lowercase codes'], 'Bug', 'Testing', 'With QA', 20),
];
for (const id of [61100, 61101, 61102, 61103]) items.find((e) => e.item.id === id).queuedAt = at(30);

const overview = () => ({
  generatedAt: at(0),
  items,
  unlinkedThreads: [
    { ...thread(70001, 'Bump the payment SDK to 7.2', 'deps/payment-sdk', 'running', 0.1), guessItemId: null },
    { ...thread(70002, 'Spike: faster price lookups', 'spike/price-cache', 'settled', 24, 'A cache in front of the price rules halves the lookups.'), guessItemId: null },
  ],
  worktrees: [],
  sources: { ado: { ok: true, at: at(0), error: null }, t3: { ok: true, at: at(0), error: null } },
  walk: {
    lanes: ['Testing Failed', 'Code Review', 'In Progress', 'Needs Human', 'New', 'Plan Review', 'Testing'].map((state) => {
      const rank = { bad: 0, warn: 1, ok: 2, run: 3, mute: 4 };
      const lane = items.filter((e) => e.item.state === state).sort((a, b) => rank[a.walk.verdict.tone] - rank[b.walk.verdict.tone]);
      return { state, itemIds: lane.map((e) => e.item.id), tone: lane[0]?.walk.verdict.tone ?? null, summary: '' };
    }),
    briefing: { needYou: 4, outOfSync: 3, running: 5 },
  },
});

const threadDetails = {
  'sample-61044': {
    thread: items.find((e) => e.item.id === 61044).threads[0], itemId: 61044, place: 'offline-basket', machine: 'mac-mini',
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
  const t = found?.t ?? overview().unlinkedThreads.find((u) => u.id === id) ?? { ...thread(70001, 'Bump the payment SDK to 7.2', 'deps/payment-sdk', 'running', 0.1), id };
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

// AB#61021 as design/ios-flow/mockups.html section 08 draws it: QA notes with a screenshot, repro steps with a table,
// two returns from QA, its own PR and an epic's shared one, and a Vera report among the comments.
const invoiceShot = `/api/items/61021/attachments/4b1d2c3e-0f6a-4e8b-9a77-1c2d3e4f5a6b?name=invoice-export.png&exp=${Date.now() + 86400000}&sig=sample`;
const itemComments = {
  61021: [
    { id: 1, by: 'Koen van der Borght', at: at(96), text: 'Fix is in #412; it rounds per line everywhere.', markdown: 'Fix is in #412; it rounds per line everywhere.' },
    { id: 2, by: 'Vera', at: at(26), text: 'Vera · test report — 14 checks passed, 1 failed: invoice totals round per line.', markdown: 'Vera · test report — 14 checks passed, 1 failed: `invoice totals round per line`.' },
    { id: 3, by: 'Lena (QA)', at: at(23), text: "Basket is fine now, the invoice export isn't. Steps are in QA notes.", markdown: "Basket is fine now, the **invoice export** isn't. Steps are in QA notes." },
  ],
};
const richDetails = {
  61021: {
    markdown: {
      qaNotes: `Basket totals are right now. The **invoice export** still rounds per order:\n\n1. Three lines of € 4,133\n2. Export the invoice as PDF\n3. Total says € 12,39, basket says € 12,40\n\n![invoice-export.png](${invoiceShot})`,
      description: '',
      reproSteps: '1. Add three lines of € 4,133 to a basket\n2. Check out and pay\n3. Open **Orders → Invoice**\n\n| | Expected | Actual |\n|---|---|---|\n| Basket | € 12,40 | € 12,40 |\n| Invoice | € 12,40 | € 12,39 |',
      acceptanceCriteria: '- Every total rounds per line: basket, receipt, invoice\n- Existing invoices keep their totals',
      developerNotes: '**12 Nov** Rounding moved to `LineTotal`; the PDF export still calls `OrderTotal.round()`.\n\n**8 Nov** Basket and receipt round per line (#412).',
    },
    description: '',
    reproSteps: 'Add three lines of € 4,133 to a basket. Check out and pay. Open Orders → Invoice.',
    qaNotes: 'Basket totals are right now. The invoice export still rounds per order.',
    acceptanceCriteria: 'Every total rounds per line: basket, receipt, invoice. Existing invoices keep their totals.',
    history: [
      { at: at(24), by: 'Lena (QA)', kind: 'state', from: 'Testing', to: 'Testing Failed' },
      { at: at(72), by: 'Koen van der Borght', kind: 'state', from: 'Code Review', to: 'Testing' },
      { at: at(97), by: 'Priya', kind: 'pullRequest', from: null, to: null, pullRequest: 412 },
      { at: at(150), by: 'Lena (QA)', kind: 'state', from: 'Testing', to: 'Testing Failed' },
      { at: at(170), by: 'Koen van der Borght', kind: 'state', from: 'Code Review', to: 'Testing' },
      { at: at(220), by: 'Mara Visser', kind: 'assigned', from: null, to: 'Koen van der Borght' },
      { at: at(240), by: 'Mara Visser', kind: 'created', from: null, to: 'New' },
    ],
    pullRequests: [
      { ...pr(412, 'open', 'Round totals per line instead of per order', 'invoice-rounding', 'failure'), repository: 'acme/shop', own: true, shared: false, author: 'Priya', updatedAt: at(96) },
      { ...pr(398, 'open', 'epic plan', 'checkout-totals-plan'), repository: 'acme/shop', own: false, shared: true, author: 'Mara Visser', updatedAt: at(300) },
    ],
    parent: { id: 60990, title: 'Checkout totals', typeName: 'Epic' },
    effort: 3,
    areaPath: null,
    attachments: [{ name: 'invoice-export.png', url: invoiceShot, size: 245760 }],
  },
};

const itemDetail = (id) => {
  const found = items.find((e) => e.item.id === id);
  if (!found) return undefined;
  const description = `${found.item.title}. Sample description for the screenshots.`;
  return {
    item: found.item,
    description,
    acceptanceCriteria: 'The change works on staging.',
    reproSteps: '',
    qaNotes: '',
    comments: itemComments[id] ?? [],
    markdown: { description, acceptanceCriteria: '- The change works on staging', reproSteps: '', qaNotes: '', developerNotes: '' },
    history: [{ at: at(200), by: 'Mara Visser', kind: 'created', from: null, to: 'New' }],
    pullRequests: found.pullRequest ? [{ ...found.pullRequest, repository: 'acme/shop', own: true, shared: false, author: 'Koen van der Borght', updatedAt: at(30) }] : [],
    parent: null,
    effort: null,
    areaPath: 'Shop\\Checkout',
    attachments: [],
    ...richDetails[id],
  };
};

// The screenshot behind invoiceShot: an invoice with its total row in red.
const invoicePng = (() => {
  const [width, height] = [360, 200];
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const line = y > 40 && y < 140 && (y - 40) % 24 < 10 && x > 20 && x < (y < 100 ? 340 : 220);
      const color = y < 26 ? [79, 70, 229] : y > 150 && y < 180 && x > 20 && x < 340 ? [251, 233, 236] : line ? [227, 228, 232] : [255, 255, 255];
      raw.set(color, y * (width * 3 + 1) + 1 + x * 3);
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();

const browseQueries = [
  { id: 'team-bugs', name: 'Team bugs', group: 'Shared Queries' },
  { id: 'qa-board', name: 'QA board', group: 'Shared Queries' },
];
const browse = (query) => {
  const search = query.get('search')?.toLowerCase();
  if (search) return { items: items.map((e) => e.item).filter((i) => i.title.toLowerCase().includes(search)), truncated: false };
  const picked = query.get('query') === 'team-bugs' ? items.filter((e) => e.item.type === 'Bug') : items.filter((e) => ['Testing', 'Testing Failed'].includes(e.item.state));
  return { items: picked.map((e) => e.item), truncated: false };
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
  const commentMatch = path.match(/^\/api\/items\/(\d+)\/comments$/);
  if (commentMatch && method === 'POST') {
    writes.push({ path, body });
    const comment = { id: Date.now(), by: 'Koen van der Borght', at: new Date().toISOString(), text: body.text, markdown: body.text };
    (itemComments[commentMatch[1]] ??= []).push(comment);
    return { comment };
  }
  if (/^\/api\/items\/\d+\/attachments\//.test(path)) return { contentType: 'image/png', rawBody: invoicePng };
  if (path === '/api/browse/queries') return browseQueries;
  if (path === '/api/browse') return browse(query);
  return undefined;
}
