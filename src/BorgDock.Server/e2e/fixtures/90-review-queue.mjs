// Quick Review's queue (design/ios-flow/mockups.html, sections 05 and 06): acme/shop #412, #405 and #401 and
// acme/storefront #377, for the walk, the brief, the decision and the load that fails. Only answers for pull requests
// no earlier module defines; 10-github.mjs lists them in Focus (globalThis.borgdockReviewQueue) unless it has its own.
// Their files come from 05-review-files.mjs. Writes stay in memory.
import { deflateSync } from 'node:zlib';
import { filesByKey, genericFiles } from './05-review-files.mjs';

const at = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const person = (login, name) => ({ login, name, avatarUrl: null });
const people = {
  priya: person('priya-s', 'Priya Shah'),
  sam: person('sokafor', 'Sam Okafor'),
  milan: person('milan', 'Milan Bakker'),
  tom: person('tompeeters', 'Tom Peeters'),
};
const sum = (files, field) => files.reduce((n, f) => n + f[field], 0);

// ---------------------------------------------------------------------------------------------------------------
// Pull requests

const checks = (passed, failed = 0, pending = 0) => ({
  total: passed + failed + pending, passed, failed, pending, skipped: 0,
  segments: [...Array(failed).fill('failure'), ...Array(pending).fill('pending'), ...Array(passed).fill('success')].slice(0, 12),
});
const pr = (repo, number, fields) => ({
  owner: 'acme', repo, number, key: `acme/${repo}#${number}`, account: 'koenvdb',
  url: `https://github.com/acme/${repo}/pull/${number}`, isMine: false, isDraft: false, state: 'open', baseRef: 'main',
  headSha: `${number}0c3d0e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2`.slice(0, 40), createdAt: at(72), mergedAt: null,
  labels: [], reviewDecision: 'review_required', approvedBy: [], mergeable: 'mergeable', workItemIds: [], snoozedUntil: null,
  autoMerge: false, reviewedHeadSha: null, bucket: 'you', ...fields,
});
const withFiles = (summary) => {
  const files = filesByKey[summary.key]?.files ?? genericFiles(summary).files;
  return { ...summary, headSha: filesByKey[summary.key]?.headSha ?? summary.headSha, additions: sum(files, 'additions'), deletions: sum(files, 'deletions'), changedFiles: files.length };
};

const pullRequests = [
  pr('shop', 412, {
    title: 'Checkout: round totals per line instead of per order', author: people.priya, headRef: 'priya/round-lines', updatedAt: at(1),
    checks: checks(14, 2), workItemIds: [61031],
    reason: { text: 'Priya asked for your review', tone: 'run', icon: 'review' },
  }),
  pr('shop', 405, {
    title: 'Webhook retries back off exponentially', author: people.sam, headRef: 'sam/webhook-backoff', updatedAt: at(72),
    checks: checks(12), workItemIds: [61002],
    reason: { text: 'Review requested · 8 files', tone: 'run', icon: 'review' },
  }),
  pr('shop', 401, {
    title: 'Price list import accepts semicolons', author: people.milan, headRef: 'milan/semicolon-import', updatedAt: at(5),
    checks: checks(10, 1), workItemIds: [61050],
    reason: { text: 'Milan asked for your review', tone: 'run', icon: 'review' },
  }),
  pr('storefront', 377, {
    title: 'Show stock per warehouse', author: people.tom, headRef: 'tom/stock-per-warehouse', updatedAt: at(26),
    checks: checks(12), workItemIds: [61055],
    reason: { text: 'Tom asked for your review', tone: 'run', icon: 'review' },
  }),
].map(withFiles);

/** Read by 10-github.mjs's Focus list. */
globalThis.borgdockReviewQueue = pullRequests;

// A small solid "screenshot" so the brief's Proof row has something to show without network access.
function png(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      [raw[o], raw[o + 1], raw[o + 2]] = paint(x, y);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const check = Buffer.alloc(4); check.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`;
}
const logShot = (accent) => png(300, 140, (x, y) => {
  if (y < 22) return [36, 38, 44];
  if (y % 20 > 13) return [24, 25, 29];
  if (x < 18 + ((y * 7) % 60)) return accent;
  return x < 220 - ((y * 13) % 90) ? [92, 96, 108] : [24, 25, 29];
});

function detail(summary) {
  const base = {
    ...summary,
    body: `${summary.title}.\n\nSmall, focused change. See the commits for the details.`,
    commits: 3,
    reviews: summary.approvedBy.map((login) => ({ author: person(login, login === 'koenvdb' ? 'Koen van der Borght' : null), state: 'approved', at: at(0.02), body: '' })),
    requestedReviewers: [person('koenvdb', 'Koen van der Borght')],
    requestedFromYou: summary.reviewDecision !== 'approved',
    checkRuns: [],
    proofImages: [],
    allowedMergeMethods: ['squash', 'merge', 'rebase'],
    defaultMergeMethod: 'squash',
    deleteBranchOnMerge: true,
    viewerCanMerge: true,
    workItems: [],
    threads: [],
  };
  const run = (id, name, workflow, state) => ({
    id, name, workflow, state, startedAt: at(0.5), completedAt: state === 'pending' ? null : at(0.4), durationSeconds: state === 'pending' ? null : 180,
    url: `https://github.com/acme/${summary.repo}/actions/runs/${id}/job/${id}`, runId: id, jobId: id, failure: null,
  });
  if (summary.number === 412) {
    return {
      ...base,
      body: 'Totals were rounded once per order, so a receipt with many lines could be a cent off from the invoice. Each line is now rounded to cents first, and the order total adds the rounded lines.\n\n- `lineTotal` rounds one line\n- The receipt, the invoice export and discounts all use it\n\nFixes AB#61031',
      commits: 6,
      checkRuns: [
        run(4121, 'e2e / checkout', 'e2e', 'failure'), run(4122, 'e2e / receipt', 'e2e', 'failure'),
        ...['lint', 'typecheck', 'unit', 'build'].map((name, i) => run(4130 + i, name, name, 'success')),
      ],
    };
  }
  if (summary.number === 405) {
    return {
      ...base,
      body: 'Failed webhooks were retried every 10 s, forever. They now back off 10 s, 30 s, 90 s and so on up to an hour, and stop after 12 tries.\n\n- Retry state lives on the delivery row\n- A dead delivery shows in the admin\'s webhook log\n- The schedule is configurable per endpoint\n\n## How to test\n\nPoint an endpoint at a server that answers 500 and watch the log.',
      commits: 4,
      checkRuns: ['lint', 'typecheck', 'unit', 'e2e', 'build'].map((name, i) => run(4050 + i, name, name, 'success')),
      proofImages: [
        { url: logShot([92, 201, 143]), alt: 'Retry schedule in the log' },
        { url: logShot([240, 97, 109]), alt: 'Gives up after 12 tries' },
      ],
    };
  }
  return base;
}

// ---------------------------------------------------------------------------------------------------------------

const prRoute = /^\/api\/prs\/acme\/([^/]+)\/(\d+)(?:\/(.*))?$/;

export function handle({ path, method, body, writes }) {
  const match = path.match(prRoute);
  if (!match) return undefined;
  const [, repo, number, rest = ''] = match;
  const summary = pullRequests.find((p) => p.repo === repo && p.number === Number(number));
  if (!summary) return undefined;
  if (method === 'GET' && rest === '') return detail(summary);
  if (method === 'GET' && rest === 'files') return genericFiles(summary);
  if (method === 'GET' && rest === 'comments') return { threads: [], comments: [] };
  if (method === 'POST') {
    writes.push({ path, body });
    if (rest === 'reviews') {
      if (body.event === 'APPROVE') Object.assign(summary, { reviewDecision: 'approved', approvedBy: [...new Set([...summary.approvedBy, 'koenvdb'])] });
      if (body.event === 'REQUEST_CHANGES') summary.reviewDecision = 'changes_requested';
      return { ok: true, reviewId: `R_${summary.number}` };
    }
    if (rest === 'merge') {
      const waits = summary.checks.failed > 0 || summary.checks.pending > 0;
      if (waits) summary.autoMerge = true;
      return { merged: !waits, autoMerge: waits, message: waits ? `#${summary.number} merges when its checks pass` : `Merged #${summary.number}` };
    }
    return { ok: true };
  }
  return undefined;
}
