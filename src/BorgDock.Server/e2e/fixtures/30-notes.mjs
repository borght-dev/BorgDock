// BorgDock's sample data for widgets, Live Activities, the daily note's digest, reference chips and search
// (iPhone slice I3). Mirrors shared/src/borgdock.ts; writes are recorded in `writes`.
const at = (hours) => new Date(Date.now() - hours * 3600000).toISOString();

const widgets = () => ({
  generatedAt: at(0),
  focus: {
    needYou: 3,
    ready: 2,
    waiting: 5,
    top: [
      { key: 'shop/shop#3712', number: 3712, title: 'Checkout: keep the basket on a payment timeout', segments: ['success', 'success', 'failure', 'failure'], age: '2 h' },
      { key: 'borght-dev/BorgDock#108', number: 108, title: 'Activity: one summary per burst', segments: ['success', 'success', 'success', 'success'], age: '40m' },
      { key: 'shop/orders#2291', number: 2291, title: 'Orders: fix VAT rounding on refunds', segments: ['success', 'success', 'success', 'pending'], age: '1 d' },
    ],
  },
  agents: { waitingOnYou: 2, running: 4 },
  master: { state: 'failing', repo: 'shop/shop', job: 'e2e / checkout', since: at(0.4), prsHit: 3, claimedBy: 'Lars Janssen' },
});

const digest = (since) => ({
  since,
  lines: [
    { text: 'Merged shop#3690 and BorgDock#106', refs: ['shop#3690', 'BorgDock#106'] },
    { text: 'AB#61002 moved to Code Review', refs: ['AB#61002'] },
    { text: 'Agent finished AB#60988, opened #2296', refs: ['AB#60988'] },
    { text: 'CI broke on master: e2e / checkout', refs: [] },
  ],
});

// Live state per ref, as `POST /api/refs/resolve` answers it. Short refs (AB#123, repo#12) as notes write them,
// and the contract's identities as workstreams store them.
const refs = {
  'shop#3690': { title: 'Coupon codes', state: 'merged', tone: 'ok', url: 'https://github.com/shop/shop/pull/3690', live: true },
  'borgdock#106': { title: 'Description-only proof', state: 'merged', tone: 'ok', url: 'https://github.com/borght-dev/BorgDock/pull/106', live: true },
  'shop#3712': { title: 'Checkout: keep the basket on a payment timeout', state: '2 failing', tone: 'bad', url: 'https://github.com/shop/shop/pull/3712', live: true },
  'AB#61002': { title: 'Gift card balance on the receipt', state: 'Code Review', tone: 'run', url: null, live: true },
  'AB#60988': { title: 'Refund email sent twice', state: 'Done', tone: 'ok', url: null, live: true },
  'AB#61044': { title: 'Offline basket storage', state: 'Your turn', tone: 'bad', url: null, live: true },
  'gh:github.com/shop/shop#3650': { title: 'Basket: persist across restarts', state: 'merged', tone: 'ok', url: 'https://github.com/shop/shop/pull/3650', live: true },
  'ado:acme#60940': { title: 'Refresh prices on reconnect', state: 'Done', tone: 'ok', url: null, live: false },
  'ado:acme#61044': { title: 'Replay offline changes', state: 'your turn', tone: 'bad', url: null, live: true },
  'gh:github.com/shop/shop#3712': { title: 'Checkout: keep the basket on timeout', state: 'CI red', tone: 'bad', url: 'https://github.com/shop/shop/pull/3712', live: true },
  't3:mac-mini/thread-newest': { title: 'Newest line wins', state: 'settled', tone: 'mute', url: null, live: true },
  't3:mac-mini/thread-server': { title: 'Server wins', state: 'settled', tone: 'mute', url: null, live: true },
};

const workflow = ['New', 'Development In Progress', 'Code Review', 'Ready For QA', 'Done'];
const item = (id, title, type, state) => ({ id, title, type, typeName: type, state, stateCategory: 'InProgress', workflow, sprint: '5.2.8', dueDate: null, priority: 2, tags: [], assignedTo: 'Koen van der Borght', assignedToMe: true, url: `https://dev.azure.com/acme/Shop/_workitems/edit/${id}` });
const pr = (number, title, state, failed = 0, mergedAt = null) => ({
  key: `shop/shop#${number}`, owner: 'shop', repo: 'shop', number, title, state, isDraft: false, mergedAt, updatedAt: at(2),
  checks: { total: 18, passed: 18 - failed, failed, pending: 0, skipped: 0, segments: [] },
});
const thread = (id, title, worktree) => ({ id, title, worktree, branch: null, status: 'running', createdAt: at(30), lastActivityAt: at(1), model: 'gpt-6.1-sol', questionRequestId: null, questions: [], lastAgentMessage: null, link: 'https://example.invalid', appLink: null });

const searchIndex = {
  pullRequests: [
    pr(3712, 'Checkout: keep the basket when the payment times out', 'open', 2),
    pr(3655, 'Checkout: Apple Pay button', 'merged', 0, '2026-10-12T10:00:00Z'),
    pr(3690, 'Coupon codes in the checkout summary', 'merged', 0, '2026-10-29T15:00:00Z'),
    pr(3715, 'Search: keep filters in the URL', 'open', 1),
  ],
  items: [
    item(61021, 'Basket empties after a payment timeout', 'Bug', 'Code Review'),
    item(60971, 'Gift cards in checkout', 'PBI', 'Development In Progress'),
    item(61044, 'Offline basket storage for checkout', 'PBI', 'Development In Progress'),
  ],
  threads: [
    thread('t-61021', 'Fix the checkout timeout', 'mac-mini · shop'),
    thread('t-61044', 'Offline basket for checkout', 'mac-mini · shop'),
  ],
};

function search(q) {
  const text = q.trim().toLowerCase();
  const number = /^(?:ab)?#?(\d+)$/.exec(text)?.[1];
  if (number) {
    const n = Number(number);
    return { query: q, pullRequests: searchIndex.pullRequests.filter(p => p.number === n), items: searchIndex.items.filter(i => i.id === n), threads: [] };
  }
  const words = text.split(/\s+/).filter(Boolean);
  const matches = (title) => words.every(w => title.toLowerCase().includes(w));
  return {
    query: q,
    pullRequests: searchIndex.pullRequests.filter(p => matches(p.title)).slice(0, 2),
    items: searchIndex.items.filter(i => matches(i.title)).slice(0, 2),
    threads: searchIndex.threads.filter(t => matches(t.title)),
  };
}

export function handle({ path, method, query, body, writes }) {
  if (path === '/api/widgets' && method === 'GET') return widgets();
  if (path === '/api/activity/digest' && method === 'GET') return digest(query.get('since') ?? at(24));
  if (path === '/api/refs/resolve' && method === 'POST') {
    const answer = {};
    for (const ref of body.refs ?? []) {
      const known = refs[ref] ?? refs[ref.toLowerCase()];
      if (known) answer[ref] = known;
    }
    return answer;
  }
  if (path === '/api/search' && method === 'GET') return search(query.get('q') ?? '');
  if (path === '/api/live-activities/start-token' && method === 'POST') {
    writes.push({ path, body });
    return { ok: true };
  }
  if (path === '/api/live-activities' && method === 'POST') {
    writes.push({ path, body });
    return { ok: true };
  }
  if (path.startsWith('/api/live-activities/') && method === 'DELETE') {
    writes.push({ path });
    return { ok: true };
  }
  return undefined;
}
