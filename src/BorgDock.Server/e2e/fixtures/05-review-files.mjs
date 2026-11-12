// Quick Review's file mixes (design/ios-flow/mockups.html, sections 05 and 06): acme/shop #412 has 52 files of every
// kind (10 source, 2 docs, 31 tests, 9 generated), #405 has 8 source, 14 tests and 2 generated. Runs before
// 10-github.mjs, so its /files wins for these pull requests wherever they're defined; 90-review-queue.mjs lists them
// when no other module does.
//
// GET /preview/fail-files[?pr=acme/shop%23401] makes that PR's /files answer 502 until /preview/fail-files-off.

// ---------------------------------------------------------------------------------------------------------------
// Files. The category follows the server's rules (server/src/github/file-category.ts): generated first, then tests,
// docs, else source.

function category(path) {
  const name = path.split('/').pop();
  if (/^(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|Package\.resolved|Podfile\.lock)$/.test(name) || name.endsWith('.lock.json')) return 'generated';
  if (/(^|\/)generated\//.test(path) || /\.(generated|g)\.\w+$/.test(name) || name.endsWith('.snap') || /__snapshots__\/|-snapshots\//.test(path)) return 'generated';
  if (/(^|\/)(__tests__|tests?|e2e|fixtures|__fixtures__|test-fixtures|__mocks__)\//.test(path) || /\.(test|spec|stories)\.\w+$/.test(name)) return 'tests';
  if (/(^|\/)(docs?|documentation)\//.test(path) || /\.(md|mdx|rst)$/.test(name)) return 'docs';
  return 'source';
}

const stats = (patch) => ({
  additions: patch.split('\n').filter((l) => l.startsWith('+')).length,
  deletions: patch.split('\n').filter((l) => l.startsWith('-')).length,
});
const file = (path, patch, extra = {}) => ({ path, previousPath: null, status: 'modified', patch, changedSinceReview: false, category: category(path), ...stats(patch), ...extra });

/** A patch with exactly `adds` added and `dels` removed lines of plausible TypeScript, for files nobody reads closely. */
function sized(path, adds, dels, extra = {}) {
  const name = path.split('/').pop().replace(/\.\w+$/, '').replace(/[^A-Za-z0-9]/g, '');
  const prose = /\.(md|mdx)$/.test(path);
  const removed = Array.from({ length: dels }, (_, i) => `-  const ${name}${i} = legacy.${name}(input, ${i});`);
  const addedLines = Array.from({ length: adds }, (_, i) => prose
    ? (i % 6 === 0 ? `+## Rounding, part ${i / 6 + 1}` : `+Each line is rounded to cents before the total adds it (case ${i}).`)
    : (i % 5 === 0 ? `+  // ${name}: step ${i / 5 + 1}` : `+  const ${name}${i} = next.${name}(input, { index: ${i}, round: 'line' });`));
  const patch = [`@@ -1,${dels + 3} +1,${adds + 3} @@ export function ${name || 'module'}(input: Input) {`, ' import { next, legacy } from "./core";', ' ', ...removed, ...addedLines, ' }'].join('\n');
  return file(path, patch, { status: dels === 0 ? 'added' : 'modified', ...extra });
}

const totalPatch = `@@ -8,14 +8,18 @@ export function orderTotal
 import { Money } from '../money';

-export function orderTotal(lines: Line[]) {
-  const raw = lines.reduce((s, l) => s + l.qty * l.price, 0);
-  return Money.round(raw);
+export function lineTotal(line: Line) {
+  return Money.round(line.qty * line.price);
+}
+
+export function orderTotal(lines: Line[]) {
+  let total = Money.zero;
+  for (const line of lines)
+    total = total.add(lineTotal(line));
+  return total;
 }

@@ -41,6 +45,9 @@ export function receiptLines
   return lines.map((line) => ({
-    total: line.qty * line.price,
+    total: lineTotal(line),
     vat: vatOf(line),
   }));
 }
@@ -60,12 +67,30 @@ export function discountedTotal
 export function discountedTotal(lines: Line[], discount: Discount) {
-  const total = orderTotal(lines);
-  if (discount.kind === 'percent') return total * (1 - discount.value / 100);
-  return total - discount.value;
-}
+  const total = orderTotal(lines);
+  switch (discount.kind) {
+    case 'percent':
+      return lines
+        .map((line) => Money.round(lineTotal(line).times(1 - discount.value / 100)))
+        .reduce((sum, part) => sum.add(part), Money.zero);
+    case 'amount':
+      return total.minus(Money.of(discount.value));
+    case 'none':
+      return total;
+  }
+}
+
+/** Rounds each line to cents first, like the receipt and the invoice. */
+export function roundedLines(lines: Line[]) {
+  return lines.map((line) => ({ ...line, total: lineTotal(line) }));
+}
+
+export function totalsMatch(receipt: Receipt, invoice: Invoice) {
+  return receipt.total.equals(invoice.total);
+}
+
+export function differenceInCents(a: Money, b: Money) {
+  return Math.abs(a.cents - b.cents);
+}`;

const roundingFiles = [
  sized('src/cart/line.ts', 12, 0),
  sized('src/cart/money.ts', 4, 1),
  sized('src/cart/basket.ts', 9, 6),
  file('src/cart/total.ts', totalPatch),
  sized('src/invoice/export.ts', 22, 18),
  sized('src/invoice/pdf.ts', 8, 3),
  sized('src/receipt/render.ts', 15, 9),
  sized('src/receipt/totals.ts', 11, 4),
  sized('src/tax/vat.ts', 6, 2),
  sized('src/tax/rounding.ts', 18, 0),
  sized('docs/rounding.md', 24, 0),
  sized('CHANGELOG.md', 3, 0),
  sized('src/cart/__tests__/total.test.ts', 64, 12),
  sized('src/cart/__tests__/receipt.test.ts', 38, 0),
  sized('src/invoice/__tests__/export.test.ts', 21, 4),
  sized('e2e/checkout.spec.ts', 112, 30),
  sized('e2e/receipt.spec.ts', 47, 0),
  sized('e2e/helpers/basket.ts', 19, 2),
  // The other 25 tests: +541 −72 between them, so the step reads +842 −120.
  ...[
    ['src/cart/__tests__/line.test.ts', 31, 4], ['src/cart/__tests__/money.test.ts', 18, 2], ['src/cart/__tests__/basket.test.ts', 27, 6],
    ['src/cart/__tests__/discount.test.ts', 44, 8], ['src/invoice/__tests__/pdf.test.ts', 16, 3], ['src/invoice/__tests__/vat.test.ts', 22, 4],
    ['src/receipt/__tests__/render.test.ts', 35, 5], ['src/receipt/__tests__/totals.test.ts', 26, 3], ['src/tax/__tests__/vat.test.ts', 19, 2],
    ['src/tax/__tests__/rounding.test.ts', 41, 0], ['e2e/invoice.spec.ts', 38, 9], ['e2e/discounts.spec.ts', 29, 4],
    ['e2e/refunds.spec.ts', 21, 3], ['e2e/helpers/invoice.ts', 12, 1], ['e2e/helpers/money.ts', 9, 0],
    ['e2e/fixtures/orders.json', 24, 2], ['e2e/fixtures/price-lists.json', 18, 0], ['src/cart/__fixtures__/lines.ts', 14, 1],
    ['src/cart/__fixtures__/discounts.ts', 11, 0], ['src/receipt/__mocks__/printer.ts', 8, 2], ['src/cart/total.stories.tsx', 17, 3],
    ['src/receipt/render.stories.tsx', 15, 2], ['e2e/a11y.spec.ts', 12, 4], ['e2e/smoke.spec.ts', 9, 2], ['src/tax/__fixtures__/rates.ts', 25, 2],
  ].map(([path, adds, dels]) => sized(path, adds, dels)),
  sized('bun.lock', 14, 9),
  sized('src/generated/api.ts', 38, 12),
  sized('src/generated/schema.ts', 22, 6),
  sized('src/cart/__tests__/__snapshots__/total.test.ts.snap', 40, 18),
  sized('src/receipt/__tests__/__snapshots__/render.test.ts.snap', 26, 11),
  sized('e2e/checkout.spec.ts-snapshots/receipt-chromium.png.txt', 4, 4),
  sized('src/generated/routes.ts', 9, 2),
  sized('src/generated/messages.ts', 12, 3),
  sized('src/invoice/__tests__/__snapshots__/export.test.ts.snap', 18, 7),
];

const webhookFiles = [
  sized('src/webhooks/retry.ts', 63, 12),
  sized('src/webhooks/schedule.ts', 33, 16),
  sized('src/webhooks/deliver.ts', 22, 28),
  sized('src/webhooks/types.ts', 12, 2),
  sized('src/webhooks/admin/log.tsx', 26, 10),
  sized('src/webhooks/admin/dead-letter.ts', 22, 0),
  sized('src/webhooks/store/delivery.ts', 18, 6),
  sized('src/webhooks/store/migration.ts', 15, 0),
  ...['retry', 'schedule', 'deliver', 'log', 'dead-letter', 'delivery', 'backoff', 'jitter'].map((name, i) => sized(`src/webhooks/__tests__/${name}.test.ts`, 8 + i * 2, i % 3)),
  sized('e2e/webhooks.spec.ts', 22, 4),
  sized('e2e/webhook-admin.spec.ts', 14, 2),
  sized('e2e/helpers/webhook-server.ts', 9, 1),
  sized('e2e/fixtures/deliveries.json', 8, 0),
  sized('src/webhooks/__fixtures__/events.ts', 6, 0),
  sized('src/webhooks/__mocks__/clock.ts', 5, 1),
  sized('bun.lock', 6, 4),
  sized('src/generated/webhook-events.ts', 11, 3),
];

export const filesByKey = {
  'acme/shop#412': { headSha: '4f2c1a9b7e3d5c1f0a8e6d4b2c9a7f5e3d1b0c8a', reviewedHeadSha: null, files: roundingFiles },
  'acme/shop#405': { headSha: '9d0e4b1c7a2f8e6d5c4b3a2f1e0d9c8b7a6f5e4d', reviewedHeadSha: null, files: webhookFiles },
};

export const genericFiles = (summary) => ({
  headSha: summary.headSha,
  reviewedHeadSha: null,
  files: [
    sized(`src/${summary.headRef}/index.ts`, 14, 6),
    sized(`src/${summary.headRef}/import.ts`, 22, 4),
    sized(`src/${summary.headRef}/__tests__/import.test.ts`, 30, 0),
  ],
});

let failingFiles = null;

export function handle({ path, method, query }) {
  if (path === '/preview/fail-files') {
    failingFiles = query?.get('pr') ?? 'acme/shop#401';
    return { ok: true, failing: failingFiles };
  }
  if (path === '/preview/fail-files-off') {
    failingFiles = null;
    return { ok: true };
  }
  const match = method === 'GET' && path.match(/^\/api\/prs\/([^/]+)\/([^/]+)\/(\d+)\/files$/);
  if (!match) return undefined;
  const key = `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}#${match[3]}`;
  if (failingFiles === key) return { httpStatus: 502, error: 'GitHub took longer than 30 seconds.' };
  return filesByKey[key];
}
