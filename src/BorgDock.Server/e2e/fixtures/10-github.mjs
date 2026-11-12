// Sample GitHub data for the iPhone's Focus, pull request, Quick Review and CI screens (the mockups' PRs:
// acme/shop #3712, borght-dev/BorgDock #108, acme/shop-api #2291, …). Writes stay in memory.
import { deflateSync } from 'node:zlib';

const at = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const person = (login, name) => ({ login, name, avatarUrl: null });
const people = {
  koen: person('koenvdb', 'Koen van der Borght'),
  sanne: person('sanne', 'Sanne de Vries'),
  tom: person('tompeeters', 'Tom Peeters'),
  ines: person('ines-m', 'Ines Moreau'),
  lars: person('larsj', 'Lars Janssen'),
  milan: person('milan', 'Milan Bakker'),
};

// ---------------------------------------------------------------------------------------------------------------
// Files: real unified diffs. Counts come from the patches.

const stats = (patch) => ({
  additions: patch.split('\n').filter((l) => l.startsWith('+')).length,
  deletions: patch.split('\n').filter((l) => l.startsWith('-')).length,
});
const file = (path, patch, extra = {}) => ({ path, previousPath: null, status: 'modified', patch, changedSinceReview: false, ...stats(patch ?? ''), ...extra });
const added = (path, lines, extra = {}) =>
  file(path, `@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}`, { status: 'added', ...extra });

const shopFiles = [
  file('src/checkout/basket-store.ts', `@@ -38,16 +38,22 @@ export function createBasketStore(api: BasketApi) {
   async function settle(result: PaymentResult) {
     if (result.kind === 'paid') {
       basket.clear();
       return;
     }
-    if (result.kind !== 'paid') {
+    if (result.kind === 'timeout') {
+      // The provider may still capture the payment; keep the basket and let the shopper retry.
+      basket.markPending(result.reference);
+      return;
+    }
     if (result.kind === 'declined') {
       basket.clear();
     }
+    if (result.kind === 'aborted') {
+      basket.markPending(null);
+    }
     emit('settled', result);
   }

-  return { settle };
+  return { settle, keep: basket.markPending };
 }`),
  added('src/checkout/RetryBanner.tsx', [
    "import { useTranslation } from '../i18n';",
    '',
    'type Props = { onRetry: () => void; waitedSeconds?: number };',
    '',
    'export function RetryBanner({ onRetry, waitedSeconds }: Props) {',
    '  const t = useTranslation();',
    '  return (',
    '    <div className="retry-banner" role="status">',
    "      <p>{t('checkout.timeout.title')}</p>",
    "      {waitedSeconds ? <small>{t('checkout.timeout.waited', { seconds: waitedSeconds })}</small> : null}",
    '      <button type="button" onClick={onRetry}>',
    "        {t('checkout.timeout.retry')}",
    '      </button>',
    '    </div>',
    '  );',
    '}',
  ]),
  file('src/checkout/payment-client.ts', `@@ -12,11 +12,19 @@ const PROVIDER_TIMEOUT_MS = 30_000;
 export async function pay(order: Order, signal?: AbortSignal): Promise<PaymentResult> {
-  const response = await fetch(\`\${PSP_URL}/payments\`, { method: 'POST', body: JSON.stringify(order), signal });
-  if (!response.ok) return { kind: 'declined', reason: response.statusText };
-  return response.json();
+  try {
+    const response = await withTimeout(fetch(\`\${PSP_URL}/payments\`, { method: 'POST', body: JSON.stringify(order), signal }), PROVIDER_TIMEOUT_MS);
+    if (!response.ok) return { kind: 'declined', reason: response.statusText };
+    return response.json();
+  } catch (error) {
+    if (error instanceof TimeoutError) return { kind: 'timeout', reference: order.reference };
+    if (signal?.aborted) return { kind: 'aborted' };
+    throw error;
+  }
 }

 export type PaymentResult =
   | { kind: 'paid'; reference: string }
-  | { kind: 'declined'; reason: string };
+  | { kind: 'declined'; reason: string }
+  | { kind: 'timeout'; reference: string }
+  | { kind: 'aborted' };`),
  added('src/checkout/timeouts.ts', [
    'export class TimeoutError extends Error {',
    "  readonly name = 'TimeoutError';",
    '}',
    '',
    'export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {',
    '  return new Promise((resolve, reject) => {',
    '    const timer = setTimeout(() => reject(new TimeoutError(`No answer in ${ms} ms`)), ms);',
    '    promise.then(',
    '      (value) => { clearTimeout(timer); resolve(value); },',
    '      (error) => { clearTimeout(timer); reject(error); },',
    '    );',
    '  });',
    '}',
  ]),
  file('src/checkout/BasketRecovery.tsx', `@@ -32,9 +32,18 @@ export function BasketRecovery
 export function BasketRecovery({ order }) {
   const basket = useBasket();
-  useEffect(() => basket.clear(), [failed]);
+  const timedOut = order.kind === 'timeout';
+
+  useEffect(() => {
+    if (failed && !timedOut) basket.clear();
+  }, [failed, timedOut]);
+
+  if (timedOut) {
+    return <RetryBanner onRetry={retry} waitedSeconds={order.waitedSeconds} />;
+  }
   return <Summary basket={basket} />;
 }
@@ -80,6 +89,11 @@ describe('checkout timeout')
   it('keeps the basket', async () => {
+    await payWith(psp.timeout());
+    expect(screen.getByRole('status')).toHaveTextContent('Still waiting');
+  });
+
+  it('clears on a hard decline', async () => {
     await payWith(psp.declined());
     expect(basket.items).toHaveLength(0);
   });`),
  file('src/checkout/CheckoutPage.tsx', `@@ -54,7 +54,9 @@ export function CheckoutPage() {
   const { order, retry } = useCheckout();
   return (
     <Page title={t('checkout.title')}>
-      <BasketSummary basket={basket} />
+      <BasketRecovery order={order} onRetry={retry}>
+        <BasketSummary basket={basket} />
+      </BasketRecovery>
       <PaymentMethods onPay={pay} />
     </Page>
   );`),
  file('src/i18n/en.json', `@@ -41,6 +41,11 @@
   "checkout.title": "Checkout",
   "checkout.pay": "Pay now",
+  "checkout.timeout.title": "Still waiting for your bank. Your basket is safe.",
+  "checkout.timeout.waited": "Waited {seconds} s so far",
+  "checkout.timeout.retry": "Try again",
   "checkout.declined": "Your payment was declined.",
   "checkout.empty": "Your basket is empty."`),
  file('src/i18n/nl.json', `@@ -41,6 +41,9 @@
   "checkout.title": "Afrekenen",
   "checkout.pay": "Nu betalen",
+  "checkout.timeout.title": "We wachten nog op je bank. Je mandje is veilig.",
+  "checkout.timeout.waited": "Al {seconds} s gewacht",
+  "checkout.timeout.retry": "Opnieuw proberen",
   "checkout.declined": "Je betaling is geweigerd."`),
  added('src/styles/retry-banner.css', [
    '.retry-banner {',
    '  display: flex;',
    '  gap: 12px;',
    '  align-items: center;',
    '  padding: 12px 16px;',
    '  border-radius: 12px;',
    '  background: var(--color-warning-soft);',
    '}',
    '',
    '@media (max-width: 380px) {',
    '  .retry-banner { flex-direction: column; }',
    '}',
  ]),
  file('src/checkout/__tests__/basket-store.test.ts', `@@ -20,6 +20,22 @@ describe('basket store', () => {
     expect(store.basket.items).toHaveLength(0);
   });

+  it('keeps the basket when the provider times out', async () => {
+    const store = createBasketStore(fakeApi());
+    store.basket.add(item('socks'));
+    await store.settle({ kind: 'timeout', reference: 'r1' });
+    expect(store.basket.items).toHaveLength(1);
+    expect(store.basket.pending).toBe('r1');
+  });
+
+  it('keeps the basket when 3-D Secure is aborted', async () => {
+    const store = createBasketStore(fakeApi());
+    store.basket.add(item('socks'));
+    await store.settle({ kind: 'aborted' });
+    expect(store.basket.items).toHaveLength(1);
+  });
+
   it('clears after a decline', async () => {`),
  file('src/api/orders.ts', `@@ -205,9 +205,11 @@ export async function refund(orderId: string, lines: RefundLine[]) {
   const order = await orders.get(orderId);
-  const total = lines.reduce((sum, line) => sum + line.amount, 0);
+  const total = roundCents(lines.reduce((sum, line) => sum + line.amount, 0));
+  const reference = order.payment?.reference;
   return psp.refund({
-    reference: order.payment.reference,
+    reference,
     amount: total,
   });
 }`),
  file('docs/checkout.md', `@@ -18,4 +18,10 @@ ## Payment results
 - **paid**: the basket clears and the order page opens.
 - **declined**: the basket clears and the shopper sees why.
+- **timeout**: the provider took longer than 30 s. The basket stays, a retry banner shows,
+  and the webhook settles the order if the payment went through after all.
+- **aborted**: the shopper closed 3-D Secure. The basket stays.
+
+Never clear the basket on a timeout: the provider may still capture the payment.`),
  file('package.json', `@@ -31,7 +31,7 @@
     "test": "vitest run",
     "e2e": "playwright test"
   },
   "dependencies": {
-    "@acme/psp-client": "4.2.0",
+    "@acme/psp-client": "4.3.1",
     "react": "19.2.0"
   }`),
  file('tests/e2e/checkout-timeout.spec.ts', `@@ -70,8 +70,20 @@ test.describe('checkout timeout', () => {
   test('keeps the basket on timeout', async ({ page, psp }) => {
     await page.goto('/checkout');
     await addToBasket(page, ['socks', 'scarf', 'hat']);
-    await psp.respondWith('declined');
+    await psp.respondWith('timeout');
     await page.getByRole('button', { name: 'Pay now' }).click();
+
+    await expect(page.getByRole('status')).toContainText('Still waiting');
+    await expect(page.basket)
+      .toHaveText('Basket (3)');
+  });
+
+  test('retries after a timeout', async ({ page, psp }) => {
+    await psp.respondWith('timeout', 'paid');
+    await page.goto('/checkout');
+    await page.getByRole('button', { name: 'Try again' }).click();
+    await expect(page).toHaveURL(/orders/);
   });
 });`),
];

const activityDir = 'src/BorgDock.Tauri/src/services/activity/';
const borgdockFiles = [
  file(`${activityDir}derive/github.ts`, `@@ -40,22 +40,51 @@ export function deriveGithub(previous: Baseline, read: GithubRead): Derived {
   const entries: ActivityEntry[] = [];
-  for (const pr of read.merged) {
-    entries.push(mergedEntry(pr));
-  }
+  const bursts = groupBursts(read.merged, BURST_WINDOW_MS);
+  for (const burst of bursts) {
+    if (burst.length === 1) {
+      entries.push(mergedEntry(burst[0]));
+      continue;
+    }
+    entries.push({
+      id: \`\${SOURCE}|burst|\${burst[0].mergedAt}\`,
+      category: 'merge',
+      title: summaryTitle(burst),
+      detail: burst.map((pr) => \`#\${pr.number}\`).join(', '),
+      at: burst.at(-1)!.mergedAt,
+      tone: 'ok',
+    });
+  }
   return { entries, baseline: next(previous, read) };
 }
+
+/** Merges closer than the window to the one before them form one burst. */
+export function groupBursts(prs: MergedPr[], windowMs: number): MergedPr[][] {
+  const sorted = [...prs].sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
+  const bursts: MergedPr[][] = [];
+  for (const pr of sorted) {
+    const last = bursts.at(-1);
+    const gap = last ? Date.parse(pr.mergedAt) - Date.parse(last.at(-1)!.mergedAt) : Infinity;
+    if (last && gap <= windowMs) last.push(pr);
+    else bursts.push([pr]);
+  }
+  return bursts;
+}`, { changedSinceReview: true }),
  file(`${activityDir}policy.ts`, `@@ -12,15 +12,24 @@ export const CATEGORY_DEFAULTS: Record<ActivityCategory, Delivery> = {
-const MAX_POPUPS = 4;
+const MAX_POPUPS = 4;
+const BURST_WINDOW_MS = 10 * 60_000;

 export function drainPopups(rows: OutboxRow[]): Popup[] {
-  if (rows.length > MAX_POPUPS) return [summary(rows)];
-  return rows.map(single);
+  const live = rows.filter((row) => !row.catchUp);
+  const catchUp = rows.filter((row) => row.catchUp);
+  const popups = live.length > MAX_POPUPS ? [summary(live)] : live.map(single);
+  if (catchUp.length > 0) popups.push(summary(catchUp));
+  return popups;
 }
+
+export function isBurst(rows: OutboxRow[]): boolean {
+  return rows.length > 1 && rows.every((row) => row.category === 'merge');
+}`, { changedSinceReview: true }),
  file(`${activityDir}copy.ts`, `@@ -8,6 +8,11 @@ export const SUMMARY_NOUNS: Record<ActivityCategory, [string, string]> = {
   merge: ['merge', 'merges'],
+};
+
+export function summaryTitle(prs: { number: number }[]): string {
+  return prs.length === 1 ? \`#\${prs[0].number} merged\` : \`\${prs.length} pull requests merged\`;
 };`, { changedSinceReview: true }),
  added(`${activityDir}__tests__/policy.test.ts`, [
    "import { describe, expect, it } from 'vitest';",
    "import { drainPopups, isBurst } from '../policy';",
    '',
    "describe('drainPopups', () => {",
    "  it('folds a burst of merges into one summary', () => {",
    "    const rows = [1, 2, 3, 4, 5].map((n) => row('merge', n));",
    '    expect(drainPopups(rows)).toHaveLength(1);',
    '  });',
    '',
    "  it('keeps catch-up rows out of the live popups', () => {",
    "    const rows = [row('merge', 1), { ...row('ci', 2), catchUp: true }];",
    '    expect(drainPopups(rows)).toHaveLength(2);',
    '  });',
    '});',
    '',
    "describe('isBurst', () => {",
    "  it('needs more than one merge', () => {",
    "    expect(isBurst([row('merge', 1)])).toBe(false);",
    "    expect(isBurst([row('merge', 1), row('merge', 2)])).toBe(true);",
    '  });',
    '});',
    '',
    "function row(category: string, n: number) {",
    '  return { id: `r${n}`, category, catchUp: false } as never;',
    '}',
  ], { changedSinceReview: true }),
  file(`${activityDir}types.ts`, `@@ -30,6 +30,8 @@ export type OutboxRow = {
   category: ActivityCategory;
   entryId: string;
+  /** Rows from before a restart or a long read: never popped up one by one. */
+  catchUp: boolean;
   createdAt: string;
 };`, { changedSinceReview: true }),
  file(`${activityDir}labels.ts`, `@@ -4,5 +4,5 @@ export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
   review: 'Reviews',
   ci: 'Checks',
-  merge: 'Merged',
+  merge: 'Merges',
   agent: 'Agents',`, { changedSinceReview: true }),
  file(`${activityDir}sources.ts`, `@@ -18,4 +18,5 @@ export const CATEGORY_GROUP: Record<ActivityCategory, Group> = {
   merge: 'github',
+  // Bursts are derived in derive/github.ts.
   comment: 'github',`),
  file(`src/BorgDock.Tauri/src/components/activity/icons.ts`, `@@ -9,3 +9,3 @@ export const ICONS = {
-  merge: GitMerge,
+  merge: GitMergeIcon,
 };`),
  file('CHANGELOG.md', `@@ -1,5 +1,9 @@
 # Changelog

+## Unreleased
+
+- **One summary per burst of merges** — merging a stack no longer buzzes your phone five times.
+
 ## 4.9.4 — 2026-10-30`),
];

const filesByKey = {
  'acme/shop#3712': { headSha: '4f2a91c3d0e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4', reviewedHeadSha: null, files: shopFiles },
  'borght-dev/BorgDock#108': { headSha: 'c81d0aa49e2f3b1c0d9e8f7a6b5c4d3e2f1a0b9c', reviewedHeadSha: '7be3f0154a2c9d8e7f6a5b4c3d2e1f0a9b8c7d6e', files: borgdockFiles },
};

const genericFiles = (pr) => ({
  headSha: pr.headSha,
  reviewedHeadSha: null,
  files: [
    file(`src/${pr.headRef}/index.ts`, `@@ -1,6 +1,9 @@\n import { load } from './load';\n \n-export function run() {\n-  return load();\n+export async function run(options = {}) {\n+  const result = await load(options);\n+  if (!result.ok) throw new Error(result.error);\n+  return result.value;\n }\n`),
    added(`src/${pr.headRef}/README.md`, ['# Notes', '', `Changes for ${pr.title}.`]),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Pull requests

const sum = (files, field) => files.reduce((n, f) => n + f[field], 0);
const checks = (passed, failed = 0, pending = 0, skipped = 0) => ({
  total: passed + failed + pending + skipped,
  passed,
  failed,
  pending,
  skipped,
  segments: [...Array(failed).fill('failure'), ...Array(pending).fill('pending'), ...Array(passed).fill('success'), ...Array(skipped).fill('skipped')].slice(0, 12),
});
const pr = (owner, repo, number, fields) => {
  const key = `${owner}/${repo}#${number}`;
  return {
    owner,
    repo,
    number,
    key,
    account: 'koenvdb',
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
    isMine: false,
    isDraft: false,
    state: 'open',
    baseRef: 'master',
    headSha: `${number}a91c3d0e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4`.slice(0, 40),
    createdAt: at(30),
    mergedAt: null,
    changedFiles: 2,
    labels: [],
    reviewDecision: 'review_required',
    approvedBy: [],
    mergeable: 'mergeable',
    workItemIds: [],
    snoozedUntil: null,
    autoMerge: false,
    reviewedHeadSha: null,
    ...fields,
  };
};
const reason = (text, tone, icon) => ({ text, tone, icon });

const pullRequests = [
  pr('acme', 'shop', 3712, {
    title: 'Checkout: keep the basket when a payment times out',
    author: people.sanne,
    headRef: 'basket-timeout',
    headSha: filesByKey['acme/shop#3712'].headSha,
    updatedAt: at(2),
    createdAt: at(26),
    additions: sum(shopFiles, 'additions'),
    deletions: sum(shopFiles, 'deletions'),
    changedFiles: shopFiles.length,
    labels: [{ name: 'checkout', color: 'e8743b' }, { name: 'bug', color: 'e5484d' }, { name: 'needs-qa', color: '3e7bfa' }],
    checks: { ...checks(15, 2, 1), segments: ['success', 'success', 'success', 'failure', 'success', 'failure', 'success', 'success'] },
    approvedBy: ['tompeeters'],
    bucket: 'you',
    reason: reason('Sanne asked for your review', 'run', 'review'),
    workItemIds: [61021],
  }),
  pr('borght-dev', 'BorgDock', 108, {
    title: 'Activity: one summary per burst of merges',
    author: people.ines,
    headRef: 'activity-bursts',
    headSha: filesByKey['borght-dev/BorgDock#108'].headSha,
    updatedAt: at(0.67),
    additions: sum(borgdockFiles, 'additions'),
    deletions: sum(borgdockFiles, 'deletions'),
    changedFiles: borgdockFiles.length,
    checks: checks(6),
    approvedBy: ['larsj'],
    bucket: 'you',
    reason: reason('3 new commits since your review', 'run', 'rerun'),
    reviewedHeadSha: filesByKey['borght-dev/BorgDock#108'].reviewedHeadSha,
  }),
  pr('acme', 'shop-api', 2291, {
    title: 'Orders: fix VAT rounding on partial refunds',
    author: people.koen,
    isMine: true,
    headRef: 'vat-rounding',
    updatedAt: at(24),
    additions: 58,
    deletions: 17,
    checks: checks(5),
    reviewDecision: 'changes_requested',
    mergeable: 'conflicting',
    bucket: 'you',
    reason: reason('Tom requested changes', 'bad', 'comment'),
  }),
  // Every chip at once and a six-figure diff: the card's status line has to drop chips rather than overflow.
  pr('acme', 'shop-api', 2302, {
    title: 'Catalogue: import the supplier price lists from the 2026 export',
    author: people.koen,
    isMine: true,
    headRef: 'supplier-price-import',
    updatedAt: at(2),
    additions: 198437,
    deletions: 15976,
    checks: checks(13),
    reviewDecision: 'changes_requested',
    mergeable: 'conflicting',
    autoMerge: true,
    workItemIds: [61044],
    bucket: 'you',
    reason: reason('Ines requested changes', 'bad', 'comment'),
  }),
  pr('acme', 'shop', 3715, {
    title: 'Search: keep filters in the URL',
    author: people.milan,
    headRef: 'search-url-filters',
    updatedAt: at(3),
    additions: 64,
    deletions: 12,
    checks: checks(7, 1),
    bucket: 'wait',
    reason: reason('Waiting for Milan to fix the e2e run', 'warn', 'failing'),
  }),
  pr('acme', 'shop-api', 2296, {
    title: 'Refunds: send one email per refund',
    author: people.koen,
    isMine: true,
    headRef: 'refund-email-once',
    updatedAt: at(5),
    additions: 33,
    deletions: 9,
    checks: checks(9),
    bucket: 'wait',
    reason: reason('Waiting for Tom’s review', 'mute', 'clock'),
    workItemIds: [61044],
  }),
  pr('borght-dev', 'BorgDock', 110, {
    title: 'Notes: daily note links to yesterday',
    author: people.koen,
    isMine: true,
    isDraft: true,
    headRef: 'daily-links',
    updatedAt: at(7),
    additions: 120,
    deletions: 14,
    checks: checks(4, 0, 2),
    bucket: 'wait',
    reason: reason('Draft · checks running', 'run', 'clock'),
  }),
  pr('acme', 'shop', 3701, {
    title: 'Basket: show stock per size',
    author: people.tom,
    headRef: 'stock-per-size',
    updatedAt: at(20),
    additions: 210,
    deletions: 40,
    checks: checks(18),
    approvedBy: ['koenvdb'],
    bucket: 'wait',
    reason: reason('You approved · waiting for a second review', 'ok', 'approved'),
  }),
  pr('acme', 'shop', 3699, {
    title: 'Product page: lazy-load the reviews',
    author: people.sanne,
    headRef: 'lazy-reviews',
    updatedAt: at(28),
    additions: 75,
    deletions: 30,
    checks: checks(18),
    bucket: 'wait',
    reason: reason('Waiting for Sanne to answer your comment', 'mute', 'comment'),
  }),
  pr('acme', 'shop', 3698, {
    title: 'Search: debounce the product filter',
    author: people.koen,
    isMine: true,
    headRef: 'search-debounce',
    updatedAt: at(5),
    additions: 41,
    deletions: 12,
    checks: checks(18),
    reviewDecision: 'approved',
    approvedBy: ['tompeeters'],
    bucket: 'ready',
    reason: reason('Approved by Tom', 'ok', 'approved'),
  }),
  pr('borght-dev', 'BorgDock', 104, {
    title: 'Notes: open a note by title',
    author: people.koen,
    isMine: true,
    headRef: 'note-by-title',
    updatedAt: at(24),
    additions: 140,
    deletions: 22,
    checks: checks(4, 0, 1),
    reviewDecision: 'approved',
    approvedBy: ['ines-m'],
    bucket: 'ready',
    autoMerge: true,
    reason: reason('Approved by Ines · auto-merge on', 'ok', 'approved'),
  }),
  pr('acme', 'shop', 3620, {
    title: 'Docs: payment provider runbook',
    author: people.lars,
    headRef: 'psp-runbook',
    updatedAt: at(9 * 24),
    additions: 88,
    deletions: 0,
    checks: checks(3),
    bucket: 'stale',
    reason: reason('No activity for 9 days', 'mute', 'clock'),
  }),
];

const workItem = (id, title, type, state) => ({
  id, title, type, typeName: type, state, stateCategory: 'InProgress', workflow: ['New', 'Development In Progress', 'Code Review', 'Ready For QA', 'Done'],
  sprint: '5.2.8', dueDate: null, priority: 2, tags: [], assignedTo: 'Koen van der Borght', assignedToMe: true,
  url: `https://dev.azure.com/acme/Shop/_workitems/edit/${id}`,
});
const t3Thread = (id, title, status, hours, branch) => ({
  id, title, worktree: 'mac-mini', branch, status, createdAt: at(30), lastActivityAt: at(hours), model: 'claude-opus-5-5',
  questionRequestId: null, questions: [], lastAgentMessage: null, link: `https://example.invalid/thread/${id}`, appLink: null,
});

// A small solid "screenshot" so the Proof tab has something to show without network access.
function png(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
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
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
const screenshot = (banner) => png(120, 240, (x, y) => {
  if (y < 18) return [247, 247, 249];
  if (y > 150 && y < 176) return banner;
  if (y > 30 && y < 140 && x > 10 && x < 110) return (y % 24 < 14) ? [228, 230, 236] : [255, 255, 255];
  return [255, 255, 255];
});

const shopBody = `When the payment provider takes longer than 30 s we cleared the basket and sent people back to an empty cart. Timeouts now keep the basket and show a retry banner; hard declines still clear it.

## What changed
- \`payment-client.ts\` turns a provider timeout into a \`timeout\` result instead of a decline.
- The basket store keeps the basket on \`timeout\` and on a 3-D Secure \`aborted\`.
- New \`RetryBanner\` with the time we waited.

## Proof
![Retry banner on iPhone](proof-1)
![Retry banner on the desktop](proof-2)
![Basket after a retry](proof-3)

Fixes AB#61021`;

function detail(summary) {
  const base = {
    ...summary,
    body: `${summary.title}.\n\nSmall, focused change. See the commits for the details.`,
    commits: 2,
    reviews: summary.approvedBy.map((login) => ({ author: Object.values(people).find((p) => p.login === login) ?? person(login, null), state: 'approved', at: at(4), body: '' })),
    requestedReviewers: [],
    requestedFromYou: summary.bucket === 'you' && !summary.isMine,
    checkRuns: [],
    proofImages: [],
    allowedMergeMethods: ['squash', 'merge', 'rebase'],
    defaultMergeMethod: 'squash',
    deleteBranchOnMerge: true,
    viewerCanMerge: true,
    workItems: [],
    threads: [],
  };
  if (summary.key === 'acme/shop#3712') {
    return {
      ...base,
      body: shopBody,
      commits: 6,
      reviews: [{ author: people.tom, state: 'approved', at: at(3), body: 'Works for me. One question on the store.' }],
      requestedReviewers: [people.koen],
      requestedFromYou: true,
      checkRuns: [
        {
          id: 901, name: 'e2e / checkout', workflow: 'e2e', state: 'failure', startedAt: at(1.2), completedAt: at(1.13), durationSeconds: 252,
          url: 'https://github.com/acme/shop/actions/runs/1/job/901', runId: 1, jobId: 901,
          failure: {
            step: 'Run Playwright', summary: 'expect(basket).toHaveText()',
            snippet: 'expect(basket).toHaveText()\nExpected: "Basket (3)"\nReceived: "Basket (0)"',
            location: 'checkout-timeout.spec.ts:84', newInThisPr: true, alsoOnBase: null, groupId: 'ci-checkout-timeout',
          },
        },
        {
          id: 902, name: 'build / windows', workflow: 'build', state: 'failure', startedAt: at(1.2), completedAt: at(1.17), durationSeconds: 100,
          url: 'https://github.com/acme/shop/actions/runs/2/job/902', runId: 2, jobId: 902,
          failure: {
            step: 'tsc -b', summary: "TS2345: 'string | undefined' is not assignable to 'string'.",
            snippet: "TS2345: 'string | undefined' is not assignable to 'string'.",
            location: 'src/api/orders.ts:212', newInThisPr: false, alsoOnBase: { since: at(5), claimedBy: people.lars }, groupId: 'ci-orders-ts2345',
          },
        },
        { id: 903, name: 'e2e / search', workflow: 'e2e', state: 'pending', startedAt: at(0.034), completedAt: null, durationSeconds: null, url: 'https://github.com/acme/shop/actions/runs/3/job/903', runId: 3, jobId: 903, failure: null },
        ...['lint', 'typecheck', 'unit / node 22', 'unit / node 24', 'build / linux', 'build / macos', 'e2e / basket', 'e2e / account', 'e2e / orders', 'storybook', 'a11y', 'bundle size', 'licenses', 'codeql', 'deploy preview'].map((name, i) => ({
          id: 910 + i, name, workflow: name.split(' ')[0], state: 'success', startedAt: at(1.3), completedAt: at(1.2), durationSeconds: 40 + i * 13,
          url: `https://github.com/acme/shop/actions/runs/4/job/${910 + i}`, runId: 4, jobId: 910 + i, failure: null,
        })),
      ],
      proofImages: [
        { url: screenshot([251, 241, 220]), alt: 'Retry banner on iPhone' },
        { url: screenshot([230, 238, 252]), alt: 'Retry banner on the desktop' },
        { url: screenshot([227, 245, 236]), alt: 'Basket after a retry' },
      ],
      workItems: [workItem(61021, 'Basket empties after a payment timeout', 'Bug', 'Code Review')],
      threads: [t3Thread('t-basket', 'AB#61021 Basket empties after a payment timeout', 'settled', 1, 'basket-timeout')],
    };
  }
  if (summary.key === 'borght-dev/BorgDock#108') {
    return { ...base, body: 'Merging a stack of five pull requests no longer sends five pop-ups: merges closer than ten minutes become one summary.', commits: 9, reviews: [{ author: people.koen, state: 'approved', at: at(50), body: '' }, { author: people.lars, state: 'approved', at: at(20), body: '' }] };
  }
  if (summary.key === 'acme/shop#3698') {
    return { ...base, body: 'Typing in the filter now waits 250 ms before it queries, so the list stops flickering.', reviews: [{ author: people.tom, state: 'approved', at: at(6), body: 'Nice.' }] };
  }
  if (summary.key === 'acme/shop-api#2291') {
    return { ...base, reviews: [{ author: people.tom, state: 'changes_requested', at: at(20), body: 'Round per line, not on the total.' }] };
  }
  return base;
}

const conversations = {
  'acme/shop#3712': {
    threads: [
      {
        id: 'th-basket-48', path: 'checkout/basket-store.ts', line: 48, isResolved: false,
        diffHunk: "@@ -47,2 +47,3 @@\n   if (result.kind === 'declined') {\n+    basket.clear();\n   }",
        comments: [
          { id: 'c1', author: people.tom, body: "Does a 3-D Secure abort count as declined here? Then we'd still empty the basket.", at: at(3), reactions: [] },
          { id: 'c2', author: people.sanne, body: 'It comes back as `aborted`, so it keeps the basket. Added a case to the spec.', at: at(1), reactions: [] },
        ],
      },
      {
        id: 'th-banner-9', path: 'src/checkout/RetryBanner.tsx', line: 9, isResolved: false,
        diffHunk: "@@ -0,0 +1,10 @@\n+  return (\n+    <div className=\"retry-banner\" role=\"status\">\n+      <p>{t('checkout.timeout.title')}</p>",
        comments: [{ id: 'c3', author: people.tom, body: 'Should this be `role="alert"`? Screen readers would announce it right away.', at: at(2.5), reactions: [{ content: 'EYES', count: 1 }] }],
      },
      {
        id: 'th-resolved', path: 'src/checkout/timeouts.ts', line: 7, isResolved: true, diffHunk: null,
        comments: [{ id: 'c4', author: people.lars, body: 'Clear the timer on success too.', at: at(20), reactions: [] }],
      },
    ],
    comments: [
      { id: 'c5', author: people.ines, body: 'The retry banner covers the total on small screens. Screenshot in the Proof tab.', at: at(0.83), reactions: [{ content: 'THUMBS_UP', count: 2 }] },
    ],
  },
};

const ciGroups = {
  'ci-checkout-timeout': {
    id: 'ci-checkout-timeout',
    title: 'e2e / checkout › keeps the basket on timeout',
    signal: 'Expected: "Basket (3)"\nReceived: "Basket (0)"',
    location: 'checkout-timeout.spec.ts:84',
    firstFailedAt: at(3.2),
    lastFailedAt: at(1.13),
    failures: 4,
    branches: [
      { branch: 'master', prKey: null, title: null, failures: 1, sha: 'a7c03e1f9b', suspect: { sha: 'a7c03e1f9b', message: 'Merge #3690 coupon codes' } },
      { branch: 'basket-timeout', prKey: 'acme/shop#3712', title: 'Checkout: keep the basket when a payment times out', failures: 2, sha: '4f2a91c3d0' },
      { branch: 'search-url-filters', prKey: 'acme/shop#3715', title: 'Search: keep filters in the URL', failures: 1, sha: '9b10e2d4c1' },
    ],
    claim: { by: people.lars, at: at(0.67), note: 'The coupon merge changed the payment mock. Fix in a few minutes.' },
  },
  'ci-orders-ts2345': {
    id: 'ci-orders-ts2345',
    title: 'build / windows › tsc -b',
    signal: "src/api/orders.ts:212\nTS2345: 'string | undefined' is not assignable to 'string'.",
    location: 'src/api/orders.ts:212',
    firstFailedAt: at(5),
    lastFailedAt: at(1.17),
    failures: 3,
    branches: [
      { branch: 'master', prKey: null, title: null, failures: 2, sha: 'e91b2c0a77', suspect: { sha: 'e91b2c0a77', message: 'Bump @acme/psp-client to 4.3' } },
      { branch: 'basket-timeout', prKey: 'acme/shop#3712', title: 'Checkout: keep the basket when a payment times out', failures: 1, sha: '4f2a91c3d0' },
    ],
    claim: null,
  },
};

const agentsWaiting = [
  { itemId: 61050, threadId: 't-offline', title: 'Offline basket for the mobile app', detail: 'Plan ready · waiting 2 d', tone: 'run' },
  { itemId: 61060, threadId: 't-refund', title: 'Refund email sent twice', detail: 'Asks: keep the retry queue?', tone: 'warn' },
];

// ---------------------------------------------------------------------------------------------------------------

const prRoute = /^\/api\/prs\/([^/]+)\/([^/]+)\/(\d+)(?:\/(.*))?$/;
const snoozed = new Map();

function focus() {
  // 90-review-queue.mjs adds Quick Review's queue, where this file doesn't have those pull requests itself.
  const queue = (globalThis.borgdockReviewQueue ?? []).filter((q) => !pullRequests.some((p) => p.key === q.key));
  const visible = [...pullRequests, ...queue].filter((p) => !snoozed.has(p.key));
  const counts = { you: 0, wait: 0, ready: 0, stale: 0 };
  for (const p of visible) counts[p.bucket] += 1;
  return { generatedAt: at(0), counts, pullRequests: visible, agentsWaiting, accounts: [{ login: 'koenvdb', via: 'account', machine: null, ok: true, error: null, polledAt: at(0) }] };
}

export function handle({ path, method, body, writes }) {
  if (path === '/api/focus' && method === 'GET') return focus();

  const match = path.match(prRoute);
  if (match) {
    const [, owner, repo, number, rest = ''] = match;
    const key = `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}#${number}`;
    const summary = pullRequests.find((p) => p.key === key);
    if (!summary) return undefined;
    if (method === 'GET' && rest === '') return detail(summary);
    if (method === 'GET' && rest === 'files') return filesByKey[key] ?? genericFiles(summary);
    if (method === 'GET' && rest === 'comments') return conversations[key] ?? { threads: [], comments: [] };
    if (method === 'POST') {
      writes.push({ path, body });
      if (rest === 'merge') {
        if (summary.checks.pending) summary.autoMerge = true;
        return { merged: !summary.checks.pending, autoMerge: summary.checks.pending > 0, message: summary.checks.pending ? `#${number} merges when its checks pass` : `Merged #${number}` };
      }
      if (rest === 'reviews') {
        // A posted approval shows on the next read, as on GitHub: Quick Review reads the PR again after it posts.
        if (body.event === 'APPROVE') Object.assign(summary, { reviewDecision: 'approved', approvedBy: [...new Set([...summary.approvedBy, summary.account])] });
        return { ok: true, reviewId: 'R_sample' };
      }
      if (rest === 'rerun-failed') return { reruns: summary.checks.failed > 0 ? 2 : 0 };
      if (rest === 'snooze') {
        if (body.until) snoozed.set(key, body.until);
        else snoozed.delete(key);
        return { ok: true };
      }
      if (rest === 'comments') {
        const conversation = (conversations[key] ??= { threads: [], comments: [] });
        const comment = { id: `c${Date.now()}`, author: people.koen, body: body.body, at: at(0), reactions: [] };
        const thread = body.threadId && conversation.threads.find((t) => t.id === body.threadId);
        if (thread) thread.comments.push(comment);
        else conversation.comments.push(comment);
        return { ok: true };
      }
      if (rest.startsWith('threads/') && rest.endsWith('/resolve')) {
        const id = decodeURIComponent(rest.split('/')[1]);
        const thread = conversations[key]?.threads.find((t) => t.id === id);
        if (thread) thread.isResolved = true;
        return { ok: true };
      }
      return { ok: true };
    }
  }

  const ci = path.match(/^\/api\/ci\/groups(?:\/([^/]+))?(\/claim)?$/);
  if (ci) {
    const [, id, claim] = ci;
    if (!id) return Object.values(ciGroups);
    const group = ciGroups[decodeURIComponent(id)];
    if (!group) return undefined;
    if (claim && method === 'POST') {
      writes.push({ path, body });
      group.claim = { by: people.koen, at: at(0), note: body.note ?? null };
    } else if (claim && method === 'DELETE') {
      writes.push({ path, method });
      group.claim = null;
    }
    return group;
  }
  return undefined;
}
