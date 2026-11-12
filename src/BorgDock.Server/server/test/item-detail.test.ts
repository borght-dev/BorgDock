import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrSummary } from '../../shared/src/api.ts';
import { adoAttachment, attachmentHeaders, AttachmentSigner } from '../src/ado/attachments.ts';
import { pullRequestLinkOf, type AdoComment, type AdoItemRead } from '../src/ado/client.ts';
import { historyOf, type RawUpdate } from '../src/ado/history.ts';
import { ItemDetails, type ItemDetailSources } from '../src/borgdock/item-detail.ts';
import { itemPullRequests, learnRepositories, type CandidatePullRequest } from '../src/borgdock/item-pull-requests.ts';
import { openDb } from '../src/db.ts';
import { item } from './fixtures.ts';

const GUID = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';
const SHOP_REPO_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const T0 = Date.parse('2026-11-12T10:00:00Z');

test('ADO pull request links carry ADO\'s repository id, in either case of %2f', () => {
  assert.deepEqual(pullRequestLinkOf(`vstfs:///GitHub/PullRequest/${SHOP_REPO_ID.toUpperCase()}%2f412`), { repositoryId: SHOP_REPO_ID, number: 412 });
  assert.deepEqual(pullRequestLinkOf(`vstfs:///GitHub/PullRequest/${SHOP_REPO_ID}%2F7`), { repositoryId: SHOP_REPO_ID, number: 7 });
  assert.equal(pullRequestLinkOf('vstfs:///Git/Commit/x%2fy'), null);
});

test('history: created, state moves, assignments and linked pull requests, newest first', () => {
  const updates: RawUpdate[] = [
    { rev: 1, revisedBy: { displayName: 'Lena' }, revisedDate: '2026-11-01T09:00:00Z', fields: {
      'System.State': { newValue: 'New' }, 'System.CreatedDate': { newValue: '2026-11-01T09:00:00Z' }, 'System.ChangedDate': { newValue: '2026-11-01T09:00:00Z' },
      'System.AssignedTo': { newValue: { displayName: 'Koen' } },
    } },
    { rev: 2, revisedBy: { displayName: 'Priya' }, fields: { 'System.ChangedDate': { oldValue: '2026-11-01T09:00:00Z', newValue: '2026-11-08T10:00:00Z' } },
      relations: { added: [{ rel: 'ArtifactLink', url: `vstfs:///GitHub/PullRequest/${SHOP_REPO_ID}%2f412` }, { rel: 'AttachedFile', url: `https://dev.azure.com/acme/_apis/wit/attachments/${GUID}` }] } },
    { rev: 3, revisedBy: { displayName: 'Koen' }, fields: {
      'System.ChangedDate': { newValue: '2026-11-09T10:00:00Z' }, 'System.State': { oldValue: 'Code Review', newValue: 'Testing' },
      'System.AssignedTo': { oldValue: { displayName: 'Koen' }, newValue: { displayName: 'Lena' } },
    } },
    { rev: 4, revisedBy: { displayName: 'Lena' }, revisedDate: '9999-01-01T00:00:00Z', fields: {
      'System.ChangedDate': { newValue: '2026-11-11T08:00:00Z' }, 'System.State': { oldValue: 'Testing', newValue: 'Testing Failed' }, 'System.Title': { oldValue: 'a', newValue: 'b' },
    } },
  ];
  assert.deepEqual(historyOf(updates), [
    { at: '2026-11-11T08:00:00Z', by: 'Lena', kind: 'state', from: 'Testing', to: 'Testing Failed' },
    { at: '2026-11-09T10:00:00Z', by: 'Koen', kind: 'assigned', from: 'Koen', to: 'Lena' },
    { at: '2026-11-09T10:00:00Z', by: 'Koen', kind: 'state', from: 'Code Review', to: 'Testing' },
    { at: '2026-11-08T10:00:00Z', by: 'Priya', kind: 'pullRequest', from: null, to: null, pullRequest: 412 },
    { at: '2026-11-01T09:00:00Z', by: 'Lena', kind: 'created', from: null, to: 'New' },
  ]);
});

const candidate = (o: Partial<CandidatePullRequest> & { number: number }): CandidatePullRequest => ({
  repository: 'acme/shop', url: `https://github.com/acme/shop/pull/${o.number}`, title: `Change ${o.number}`, branch: null, state: 'open', isDraft: false,
  checks: null, author: 'Priya', updatedAt: '2026-11-08T10:00:00Z', mentions: [], onItemThread: false, ...o,
});

test('pull requests: its own first, a plan PR on several items is shared, numbers from ADO count only in a known repository', () => {
  const repositories = new Map([[SHOP_REPO_ID, 'acme/shop']]);
  const rows = itemPullRequests({
    itemId: 61021,
    links: [{ repositoryId: SHOP_REPO_ID, number: 398 }, { repositoryId: 'unknown-repo', number: 77 }],
    myItems: [{ id: 61021, links: [] }, { id: 61022, links: [{ repositoryId: SHOP_REPO_ID, number: 398 }] }, { id: 61023, links: [] }],
    candidates: [
      candidate({ number: 398, title: 'Checkout totals plan', mentions: [61022, 61023] }),
      candidate({ number: 412, title: 'Round totals per line AB#61021', state: 'merged' }),
      candidate({ number: 420, title: 'Tidy the invoice export', branch: 'fix/61021-invoice' }),
      candidate({ number: 430, title: 'Unrelated', mentions: [] }),
      candidate({ number: 77, repository: 'globex/portal', url: 'https://github.com/globex/portal/pull/77', title: 'Same number, other repository' }),
      candidate({ number: 501, title: 'Mentions it in the body', mentions: [61021] }),
      candidate({ number: 502, title: 'Names AB#61022 too', mentions: [61021, 61022] }),
    ],
    repositories,
  });
  assert.deepEqual(rows.map((r) => [r.number, r.own, r.shared]), [[420, true, false], [412, true, false], [502, false, false], [501, false, false], [398, false, true]]);
  assert.equal(rows[0].repository, 'acme/shop');
});

test('a thread on the item links its pull request by number alone, as the overview does; only there', () => {
  const rows = itemPullRequests({
    itemId: 61021, links: [{ repositoryId: 'unknown-repo', number: 9 }], myItems: [], repositories: new Map(),
    candidates: [candidate({ number: 9, title: 'Agent work', onItemThread: true }), candidate({ number: 9, repository: 'globex/portal', url: 'https://github.com/globex/portal/pull/9' })],
  });
  assert.deepEqual(rows.map((r) => r.url), ['https://github.com/acme/shop/pull/9']);
});

test('an ADO repository id is learned from a pull request with its number that names the item', () => {
  const links = [{ repositoryId: SHOP_REPO_ID, number: 412 }, { repositoryId: 'b-repo', number: 5 }];
  const learned = learnRepositories(61021, links, [
    candidate({ number: 412, title: 'Round totals AB#61021' }),
    candidate({ number: 5, title: 'Names nothing' }),
    candidate({ number: 5, repository: 'globex/portal', title: 'AB#61021 here', url: 'https://github.com/globex/portal/pull/5' }),
    candidate({ number: 5, repository: 'globex/api', title: 'AB#61021 there', url: 'https://github.com/globex/api/pull/5' }),
  ], new Map());
  assert.deepEqual([...learned], [[SHOP_REPO_ID, 'acme/shop']], 'two repositories with #5 naming the item: not learned');
});

test('attachment URLs are signed per item and hour, and refused when tampered with or expired', () => {
  const signer = new AttachmentSigner(Buffer.alloc(32, 7));
  assert.deepEqual(adoAttachment(`https://dev.azure.com/acme/0f1e/_apis/wit/attachments/${GUID.toUpperCase()}?fileName=invoice%20export.png`), { guid: GUID, name: 'invoice export.png' });
  assert.equal(adoAttachment('https://example.com/logo.png'), null);
  const path = signer.path(61021, GUID, 'invoice export.png', T0);
  assert.equal(path, signer.path(61021, GUID, 'invoice export.png', T0 + 30 * 60_000), 'the same URL within the hour, so images stay cached');
  const url = new URL(path, 'https://borgdock.test');
  assert.equal(url.pathname, `/api/items/61021/attachments/${GUID}`);
  const q = Object.fromEntries(url.searchParams);
  assert.equal(q.name, 'invoice export.png');
  assert.ok(signer.verify(61021, GUID, q.name, q.exp, q.sig, T0 + 24 * 3_600_000));
  assert.equal(signer.verify(61021, GUID, q.name, q.exp, q.sig, T0 + 26 * 3_600_000), false, 'expired');
  assert.equal(signer.verify(61022, GUID, q.name, q.exp, q.sig, T0), false, 'another item');
  assert.equal(signer.verify(61021, GUID, 'other.png', q.exp, q.sig, T0), false, 'another name');
  assert.equal(signer.verify(61021, GUID, q.name, String(Number(q.exp) + 3600), q.sig, T0), false, 'a later expiry');
  assert.equal(signer.verify(61021, GUID, q.name, q.exp, `${q.sig.slice(0, -1)}A`, T0), false);
  assert.equal(new AttachmentSigner(Buffer.alloc(32, 8)).verify(61021, GUID, q.name, q.exp, q.sig, T0), false, 'another server');
});

test('only raster images show inline; anything else downloads', () => {
  assert.equal(attachmentHeaders('shot.png', 'image/png', '12')['Content-Disposition'], "inline; filename*=UTF-8''shot.png");
  assert.equal(attachmentHeaders('shot.png', 'application/octet-stream', null)['Content-Type'], 'image/png');
  const page = attachmentHeaders('page.html', 'text/html', null);
  assert.deepEqual([page['Content-Type'], page['Content-Disposition'].split(';')[0]], ['application/octet-stream', 'attachment']);
  assert.equal(attachmentHeaders('logo.svg', 'image/svg+xml', null)['Content-Disposition'].split(';')[0], 'attachment');
  assert.equal(attachmentHeaders('shot.png', 'image/png', '12')['Cache-Control'], 'private, max-age=86400');
});

/* ---------- the item page ---------- */

const pr = (o: Partial<PrSummary> & { number: number }): PrSummary => ({
  owner: 'acme', repo: 'shop', key: `acme/shop#${o.number}`, account: 'koen', title: `Change ${o.number}`, url: `https://github.com/acme/shop/pull/${o.number}`,
  author: { login: 'priya', name: 'Priya', avatarUrl: null }, isMine: false, isDraft: false, state: 'open', headRef: `feat/${o.number}`, baseRef: 'main', headSha: 'h',
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-08T10:00:00Z', mergedAt: null, additions: 1, deletions: 1, changedFiles: 1, labels: [],
  checks: { total: 3, passed: 1, failed: 2, pending: 0, skipped: 0, segments: [] }, reviewDecision: null, approvedBy: [], mergeable: 'mergeable', bucket: 'you',
  reason: { text: '', tone: 'ok', icon: 'eye' }, workItemIds: [], snoozedUntil: null, autoMerge: false, reviewedHeadSha: null, ...o,
} as PrSummary);

function itemRead(): AdoItemRead {
  const html = (s: string) => `<div>${s}</div>`;
  return {
    item: { ...item({ id: 61021, state: 'Testing Failed' }), pullRequestLinks: [{ repositoryId: SHOP_REPO_ID, number: 412 }, { repositoryId: SHOP_REPO_ID, number: 380 }] },
    fields: {
      'System.Description': html('Totals are off by a cent.<br><img src="https://dev.azure.com/acme/0f1e/_apis/wit/attachments/' + GUID + '?fileName=invoice.png">'),
      'Microsoft.VSTS.Common.AcceptanceCriteria': '<ul><li>Basket</li><li>Invoice</li></ul>',
      'Microsoft.VSTS.TCM.ReproSteps': 'Already **markdown** ![shot](https://dev.azure.com/acme/0f1e/_apis/wit/attachments/' + GUID + '?fileName=shot.png)',
      'Custom.QANotes': html('Invoice export still rounds per order.'),
      'Microsoft.VSTS.Scheduling.StoryPoints': 3,
      'System.AreaPath': 'Shop\\Checkout',
    },
    relations: [
      { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/acme/_apis/wit/workItems/60990' },
      { rel: 'AttachedFile', url: `https://dev.azure.com/acme/_apis/wit/attachments/${GUID}`, attributes: { name: 'invoice-export.png', resourceSize: 245760 } },
    ],
    formats: { 'Microsoft.VSTS.TCM.ReproSteps': 'markdown' },
    comments: [
      { id: 3, text: '<div>Vera · test-report — 14 checks passed, <b>1 failed</b>.</div>', createdDate: '2026-11-11T09:00:00Z', createdBy: { displayName: 'Koen' } },
      { id: 2, text: 'Fix is in **#412**.', format: 'markdown', createdDate: '2026-11-08T11:00:00Z', createdBy: { displayName: 'Koen' } },
    ],
    updates: [{ rev: 1, revisedBy: { displayName: 'Lena' }, fields: { 'System.ChangedDate': { newValue: '2026-11-01T09:00:00Z' }, 'System.State': { newValue: 'New' } } }],
  };
}

function itemPage(overrides: Partial<ItemDetailSources> = {}) {
  const looked: string[] = [];
  const posted: { id: number; text: string }[] = [];
  const merged = pr({ number: 412, title: 'Round totals per line AB#61021', state: 'merged', checks: { total: 0, passed: 0, failed: 0, pending: 0, skipped: 0, segments: [] } as never });
  const sources: ItemDetailSources = {
    ado: {
      itemRead: async () => itemRead(),
      titles: async (ids) => ids.map((id) => ({ id, title: 'Checkout totals', typeName: 'Epic' })),
      addComment: async (id, text): Promise<AdoComment> => {
        posted.push({ id, text });
        return { id: 9, text, format: 'markdown', createdDate: '2026-11-12T10:00:00Z', createdBy: { displayName: 'Koen' } };
      },
      attachment: async () => new Response('png-bytes', { headers: { 'content-type': 'image/png', 'content-length': '9' } }),
    },
    signer: new AttachmentSigner(Buffer.alloc(32, 7)),
    db: openDb(mkdtempSync(join(tmpdir(), 'bd-item-'))),
    openPullRequests: () => [pr({ number: 398, title: 'Checkout totals plan', workItemIds: [61021, 61022] })],
    pullRequest: async (ref) => {
      looked.push(`${ref.owner}/${ref.repo}#${ref.number}`);
      if (ref.number === 412) return merged;
      throw new Error('not found');
    },
    threadPullRequests: () => [{ number: 412, url: 'https://github.com/acme/shop/pull/412', state: 'unknown', title: '', headBranch: 'fix/61021-round-totals', isDraft: false, checks: null }],
    myItems: () => [{ id: 61021, pullRequestLinks: [] }, { id: 61022, pullRequestLinks: [] }],
    ...overrides,
  };
  return { items: new ItemDetails(sources), looked, posted, sources };
}

test('the item page: markdown with signed images, history, every pull request, parent, effort, area and attachments', async () => {
  const { items, looked } = itemPage();
  const detail = await items.read(61021);
  assert.equal(detail.item.id, 61021);
  assert.ok(!('pullRequestLinks' in detail.item) && !('states' in detail.item), 'the summary only');
  assert.equal(detail.description, 'Totals are off by a cent.', 'the plain text stays for older apps');
  assert.match(detail.markdown!.description, new RegExp(`^Totals are off by a cent\\.  \\n!\\[\\]\\(/api/items/61021/attachments/${GUID}\\?name=invoice\\.png&exp=\\d+&sig=[\\w-]+\\)$`));
  assert.equal(detail.markdown!.acceptanceCriteria, '- Basket\n- Invoice');
  assert.match(detail.markdown!.reproSteps, new RegExp(`^Already \\*\\*markdown\\*\\* !\\[shot\\]\\(/api/items/61021/attachments/${GUID}\\?name=shot\\.png&`), 'ADO markdown keeps its text, links signed');
  assert.equal(detail.markdown!.developerNotes, '');
  assert.deepEqual(detail.history, [{ at: '2026-11-01T09:00:00Z', by: 'Lena', kind: 'created', from: null, to: 'New' }]);
  assert.deepEqual(detail.parent, { id: 60990, title: 'Checkout totals', typeName: 'Epic' });
  assert.equal(detail.effort, 3);
  assert.equal(detail.areaPath, 'Shop\\Checkout');
  assert.equal(detail.attachments!.length, 1);
  assert.deepEqual([detail.attachments![0].name, detail.attachments![0].size], ['invoice-export.png', 245760]);
  assert.match(detail.attachments![0].url, /^\/api\/items\/61021\/attachments\//);

  assert.deepEqual(detail.pullRequests!.map((p) => [p.number, p.state, p.own, p.shared, p.author]), [[412, 'merged', true, false, 'Priya'], [398, 'open', false, true, 'Priya']]);
  assert.equal(detail.pullRequests![1].checks, 'failing');
  assert.deepEqual(looked.sort(), ['acme/shop#380', 'acme/shop#412'], 'the merged one T3 knows, and ADO\'s other link once its repository is learned');
});

test('comments: id and markdown, a signed one is its signer\'s; posting sends markdown and answers the comment', async () => {
  const { items, posted } = itemPage();
  const detail = await items.read(61021);
  assert.deepEqual(detail.comments.map((c) => [c.id, c.by, c.text, c.markdown]), [
    [3, 'Vera · test-report', '14 checks passed, 1 failed.', '14 checks passed, **1 failed**.'],
    [2, 'Koen', 'Fix is in **#412**.', 'Fix is in **#412**.'],
  ]);
  const comment = await items.postComment(61021, 'Looks right on the **invoice** now.');
  assert.deepEqual(posted, [{ id: 61021, text: 'Looks right on the **invoice** now.' }]);
  assert.deepEqual([comment.id, comment.by, comment.markdown], [9, 'Koen', 'Looks right on the **invoice** now.']);
  await assert.rejects(items.postComment(61021, '  '), /empty/);
});

test('a GitHub that never answers leaves the pull requests it knows', async () => {
  const { items } = itemPage({ pullRequest: () => new Promise(() => {}), lookupMs: 50 });
  const detail = await Promise.race([items.read(61021), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))]);
  assert.ok(detail, 'answered within the lookup budget');
  assert.deepEqual(detail.pullRequests!.map((p) => [p.number, p.state]), [[412, 'unknown'], [398, 'open']]);
});

test('an attachment streams with a valid signature only', async () => {
  const { items, sources } = itemPage();
  const query = Object.fromEntries(new URL(sources.signer.path(61021, GUID, 'shot.png'), 'https://x').searchParams);
  const response = await items.attachment(61021, GUID, query);
  assert.equal(await response.text(), 'png-bytes');
  assert.equal(response.headers.get('content-type'), 'image/png');
  await assert.rejects(items.attachment(61021, GUID, { ...query, sig: 'forged' }), (e: { status: number }) => e.status === 403);
  await assert.rejects(items.attachment(61022, GUID, query), (e: { status: number }) => e.status === 403);
});
