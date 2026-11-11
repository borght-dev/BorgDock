import {
  finishRiskAssessment,
  planRiskPrompt,
  type RiskAssessment,
  readRiskAnswer,
} from '@/services/risk-assessment';
import type { DiffFile, PullRequest } from '@/types';

/**
 * A made-up shop ("acme") whose refund code is changed in a pull request,
 * with the answers a summary agent could give about its regression risk.
 * Everything here is invented: code, people, commits and findings.
 */
export const REFUND_HEAD = '9c41e7a2b6d0f3c8e5a14b7d9f02c6e8a3b5d7f1';
export const REFUND_NEXT_HEAD = '2be03f1c7d9a4e6b8f0a2c4e6d8b0f2a4c6e8d0b';

function file(
  filename: string,
  status: DiffFile['status'],
  patch: string | undefined,
  extra: Partial<DiffFile> = {},
): DiffFile {
  const lines = (patch ?? '').split('\n');
  return {
    filename,
    status,
    patch,
    additions: lines.filter((l) => l.startsWith('+')).length,
    deletions: lines.filter((l) => l.startsWith('-')).length,
    isBinary: false,
    isTruncated: false,
    sha: filename,
    ...extra,
  };
}

const LOCK_LINES = Array.from(
  { length: 160 },
  (_, i) => `+  acme-dep-${i}@1.${i}.0:\n+    resolution: {integrity: sha512-${'x'.repeat(40)}}`,
).join('\n');

export const REFUND_FILES: DiffFile[] = [
  file(
    'src/refunds/calculate.ts',
    'modified',
    [
      '@@ -1,4 +1,5 @@',
      " import { Money, sum } from '../money';",
      " import type { Order, RefundRequest } from '../orders/types';",
      "-import { lineRemaining, refundableLines } from './refundable-lines';",
      "+import { allocateShipping } from './allocate-shipping';",
      "+import { lineRemaining } from './refundable-lines';",
      ' ',
      '@@ -136,5 +137,9 @@ export function refundableTotal',
      " /** What a refund request may return, in the order's currency. */",
      ' export function refundableTotal(order: Order, request: RefundRequest): Money {',
      '-  const lines = refundableLines(order).filter((l) => request.lineIds.includes(l.id));',
      '-  return sum(lines.map(lineRemaining));',
      '+  const remaining = sum(order.lines.map(lineRemaining));',
      '+  const shipped = order.lines.filter((l) => l.shippedQty > 0);',
      '+  const lines = order.lines.filter((l) => request.lineIds.includes(l.id));',
      '+  const requested = sum(lines.map(lineRemaining));',
      '+  const shipping = allocateShipping(order, shipped, request);',
      '+  return Money.min(requested.plus(shipping), remaining.plus(order.shippingTotal));',
      ' }',
    ].join('\n'),
  ),
  file(
    'src/refunds/allocate-shipping.ts',
    'added',
    [
      '@@ -0,0 +1,10 @@',
      "+import { Money } from '../money';",
      "+import type { Order, OrderLine, RefundRequest } from '../orders/types';",
      '+',
      '+/** Shipping a refund returns: an equal share per shipped line. */',
      '+export function allocateShipping(order: Order, shipped: OrderLine[], request: RefundRequest): Money {',
      '+  if (!request.includeShipping || shipped.length === 0) return Money.zero(order.currency);',
      '+  const perLine = Math.round(order.shippingTotal.cents / shipped.length);',
      '+  const picked = shipped.filter((l) => request.lineIds.includes(l.id));',
      '+  return Money.fromCents(perLine * picked.length, order.currency);',
      '+}',
    ].join('\n'),
  ),
  file(
    'src/api/refunds.controller.ts',
    'modified',
    [
      '@@ -54,6 +54,8 @@ export async function createRefund',
      '   const refundable = refundableTotal(order, body);',
      '   const requested = Money.of(body.amount, order.currency);',
      '   if (requested.gt(refundable)) {',
      "-    return reply.code(400).send({ error: 'amount_exceeds_refundable' });",
      '+    return reply',
      '+      .code(422)',
      "+      .send({ error: 'amount_exceeds_refundable', refundable: refundable.toJSON() });",
      '   }',
      '   return refunds.create(order, requested, body);',
    ].join('\n'),
  ),
  file(
    'src/refunds/__tests__/calculate.test.ts',
    'modified',
    [
      "@@ -96,3 +96,40 @@ describe('refundableTotal'",
      '     expect(refundableTotal(order, all(order))).toEqual(eur(84.5));',
      '   });',
      ' ',
      "+  describe('partly shipped orders', () => {",
      "+    it('refunds only the lines picked', () => {",
      '+      const order = orderWith([shipped(2, 19.99), unshipped(1, 5)]);',
      '+      expect(refundableTotal(order, pick(order, 0))).toEqual(eur(39.98));',
      '+    });',
      "+    it('splits shipping over two shipped lines', () => {",
      '+      const order = orderWith([shipped(1, 10), shipped(1, 10)], { shipping: 4.99 });',
      '+      expect(refundableTotal(order, pick(order, 0, { shipping: true }))).toEqual(eur(12.5));',
      '+    });',
      '+  });',
      '+',
      "+  describe('shipping', () => {",
      "+    it('returns none when the request leaves it out', () => {",
      '+      const order = orderWith([shipped(1, 10)], { shipping: 4.99 });',
      '+      expect(refundableTotal(order, pick(order, 0))).toEqual(eur(10));',
      '+    });',
      "+    it('returns none when nothing shipped', () => {",
      '+      const order = orderWith([unshipped(2, 10)], { shipping: 4.99 });',
      '+      expect(refundableTotal(order, pick(order, 0, { shipping: true }))).toEqual(eur(20));',
      '+    });',
      "+    it('returns all of it for the one shipped line', () => {",
      '+      const order = orderWith([shipped(1, 10)], { shipping: 4.99 });',
      '+      expect(refundableTotal(order, pick(order, 0, { shipping: true }))).toEqual(eur(14.99));',
      '+    });',
      "+    it('never returns more than was paid', () => {",
      '+      const order = orderWith([shipped(1, 10)], { shipping: 4.99, refunded: 10 });',
      '+      expect(refundableTotal(order, pick(order, 0, { shipping: true }))).toEqual(eur(4.99));',
      '+    });',
      "+    it('keeps the currency of the order', () => {",
      "+      const order = orderWith([shipped(1, 10)], { currency: 'GBP' });",
      "+      expect(refundableTotal(order, pick(order, 0)).currency).toBe('GBP');",
      '+    });',
      "+    it('refunds a line once', () => {",
      '+      const order = orderWith([shipped(1, 10, { refunded: 1 })]);',
      '+      expect(refundableTotal(order, pick(order, 0))).toEqual(eur(0));',
      '+    });',
      '+  });',
    ].join('\n'),
  ),
  file(
    'db/migrations/20261108_refund_shipping.sql',
    'added',
    [
      '@@ -0,0 +1,3 @@',
      '+-- Refunds can now return part of the shipping.',
      '+ALTER TABLE refunds',
      '+  ADD COLUMN shipping_cents integer NULL;',
    ].join('\n'),
  ),
  file(
    'pnpm-lock.yaml',
    'modified',
    `@@ -1,2 +1,320 @@\n ${'lockfileVersion: 9.0'}\n${LOCK_LINES}`,
  ),
];

/** The files outside the diff the answer cites, as they are at the head commit. */
export const REFUND_SOURCES: Record<string, string> = {
  'src/refunds/refundable-lines.ts': [
    "import { Money } from '../money';",
    "import type { Order, OrderLine } from '../orders/types';",
    '',
    '// Lines are refunded at their unit price, never more than once.',
    '',
    '',
    '',
    '',
    '',
    '/** Lines a customer can still get money back for. */',
    'export function refundableLines(order: Order): OrderLine[] {',
    "  return order.lines.filter((l) => l.status !== 'cancelled' && lineRemaining(l).cents > 0);",
    '}',
    '',
    'export function lineRemaining(line: OrderLine): Money {',
    '  return line.unitPrice.times(line.quantity - line.refunded);',
    '}',
  ].join('\n'),
  'web/src/account/refund-form.tsx': [
    ...Array.from({ length: 82 }, (_, i) => (i === 0 ? "import { api } from '../api';" : '')),
    '  async function submit() {',
    '    const res = await api.post(refundsUrl(orderId), { amount, lineIds });',
    '    if (res.ok) return onDone();',
    '    if (res.status === 400) {',
    "      return setError(t('refund.tooMuch'));",
    '    }',
    "    setError(t('refund.generic'));",
    '  }',
  ].join('\n'),
};

/**
 * What the agent answers for the refunds PR. It names files by path, which the
 * parser accepts too, so the answer holds whatever order the prompt numbered them in.
 */
export const REFUND_ANSWER = {
  verdict: 'assessed',
  unknownWhy: '',
  headline:
    'A refund that names a cancelled line pays it out in full, and no test builds an order with one.',
  reasons: [
    {
      effect: 'raises',
      severity: 'medium',
      title: 'Shipping refunds split over three or more lines',
      because:
        'Shipping is shared per shipped line and rounded per line, so the shares can add up to a cent more or less than was charged. 5.00 over 3 lines returns 5.01 once all three are refunded.',
      why: 'A cent per refund, and only when shipping is refunded.',
      test: {
        status: 'partial',
        note: 'Tested with two shipped lines only.',
        cite: {
          file: 'src/refunds/__tests__/calculate.test.ts',
          lines: [104, 106],
          quote: "it('splits shipping over two shipped lines'",
        },
      },
      cites: [
        {
          file: 'src/refunds/allocate-shipping.ts',
          lines: [7, 9],
          quote: 'const perLine = Math.round',
        },
      ],
    },
    {
      effect: 'raises',
      severity: 'high',
      title: 'Refunds on orders with a cancelled line',
      because:
        'The new code picks lines from order.lines instead of refundableLines(), which left cancelled lines out. A request that names a cancelled line pays it out in full, and remaining grows by the same amount, so the cap does not stop it.',
      why: 'It pays out money, on a path no test covers.',
      test: { status: 'none', note: 'No test builds an order with a cancelled line.', cite: null },
      cites: [
        {
          file: 'src/refunds/calculate.ts',
          lines: [139, 141],
          quote: 'const remaining = sum(order.lines.map(lineRemaining));',
        },
        { file: 'src/refunds/calculate.ts', old: [138, 138], quote: 'refundableLines(order)' },
        {
          path: 'src/refunds/refundable-lines.ts',
          lines: [12, 12],
          quote: "return order.lines.filter((l) => l.status !== 'cancelled'",
        },
      ],
    },
    {
      effect: 'raises',
      severity: 'medium',
      title: 'The storefront\'s "too much" refund message',
      because:
        'Over-refunds now answer 422 instead of 400. The refund form checks for 400, so customers get the generic error instead.',
      why: 'Customers see a vaguer message. No money moves.',
      test: null,
      cites: [
        { file: 'src/api/refunds.controller.ts', lines: [57, 59], quote: 'return reply' },
        {
          path: 'web/src/account/refund-form.tsx',
          lines: [86, 87],
          quote: 'if (res.status === 400) {',
        },
      ],
    },
    {
      effect: 'lowers',
      title: 'The refund paths tested before still are',
      because:
        'The cases for partly shipped orders are added after the existing ones, which stay as they were.',
      why: 'What worked and was tested before keeps its tests.',
      test: null,
      cites: [
        {
          file: 'src/refunds/__tests__/calculate.test.ts',
          lines: [96, 97],
          quote: 'expect(refundableTotal(order, all(order))).toEqual(eur(84.5));',
        },
      ],
    },
    {
      effect: 'lowers',
      title: 'Existing refunds keep their data',
      because: 'The migration only adds a nullable column. No existing row or reader changes.',
      why: 'Nothing already stored is rewritten.',
      test: null,
      cites: [
        {
          file: 'db/migrations/20261108_refund_shipping.sql',
          lines: [2, 3],
          quote: 'ALTER TABLE refunds',
        },
        {
          file: 'src/refunds/calculate.ts',
          lines: [900, 901],
          quote: 'export function refundableTotal',
        },
      ],
    },
  ],
};

export function refundPr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 4821,
    title: 'Split refund calculation for partly shipped orders',
    headRef: 'feat/partial-refunds',
    headSha: REFUND_HEAD,
    baseRef: 'main',
    authorLogin: 'mira-k',
    authorAvatarUrl: 'https://example.com/avatar.png',
    state: 'open',
    createdAt: '2026-11-09T09:00:00Z',
    updatedAt: '2026-11-11T09:00:00Z',
    isDraft: false,
    mergeable: true,
    htmlUrl: 'https://github.com/acme/shop/pull/4821',
    body: 'Refunds for orders that shipped in parts.\n\nShipping is returned per shipped line.',
    repoOwner: 'acme',
    repoName: 'shop',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: REFUND_FILES.reduce((n, f) => n + f.additions, 0),
    deletions: REFUND_FILES.reduce((n, f) => n + f.deletions, 0),
    changedFiles: REFUND_FILES.length,
    commitCount: 5,
    requestedReviewers: [],
    ...overrides,
  };
}

const MINUTE = 60_000;

/** The refunds PR's assessment, through the same plan, parse and checks as a real run. */
export function refundAssessment(
  options: { headSha?: string; minutesAgo?: number; answer?: unknown } = {},
): RiskAssessment {
  const pr = refundPr({ headSha: options.headSha ?? REFUND_HEAD });
  const input = { pr, files: REFUND_FILES, commits: [], checkout: '/repos/shop' };
  return finishRiskAssessment(
    readRiskAnswer(JSON.stringify(options.answer ?? REFUND_ANSWER)),
    planRiskPrompt(input),
    new Map(Object.entries(REFUND_SOURCES)),
    {
      headSha: pr.headSha ?? '',
      baseSha: 'b1a5e0c',
      provider: 'claude',
      model: 'sonnet',
      durationMs: 48_000,
      createdAt: new Date(Date.now() - (options.minutesAgo ?? 6) * MINUTE).toISOString(),
    },
  );
}

/** The same PR read by an agent that found nothing to raise the risk. */
export const LOW_ANSWER = {
  verdict: 'assessed',
  unknownWhy: '',
  headline: 'Only adds a column and a helper nothing calls yet; existing refunds work as before.',
  reasons: REFUND_ANSWER.reasons.filter((r) => r.effect === 'lowers'),
};

/** The agent judged it could not tell. */
export const UNKNOWN_ANSWER = {
  verdict: 'unknown',
  unknownWhy: 'The refund paths it would need are in files cut at the prompt budget.',
  headline: 'Too little of the refund path was shown to judge it.',
  reasons: [REFUND_ANSWER.reasons[0]],
};

/** The review guide the summary agent writes for the refunds PR. */
export const REFUND_GUIDE = {
  summary:
    'Refunds can now return part of the shipping, and orders that shipped in parts refund only the lines picked.',
  chapters: [
    {
      title: 'Shipping share per line',
      intent: 'Splits the shipping a refund returns over the shipped lines.',
      check: 'Rounding when the share does not divide evenly.',
      files: [
        { path: 'db/migrations/20261108_refund_shipping.sql', why: 'stores the shipping refunded' },
        { path: 'src/refunds/allocate-shipping.ts', why: 'the per-line share' },
      ],
    },
    {
      title: 'Refund total',
      intent: 'What a request may return, capped by what is left.',
      check: 'Which lines a request may name.',
      files: [
        { path: 'src/refunds/calculate.ts', why: 'adds shipping, picks lines' },
        { path: 'src/refunds/__tests__/calculate.test.ts', why: 'partly shipped cases' },
      ],
    },
    {
      title: 'API answer',
      intent: 'Over-refunds say how much is refundable.',
      check: '',
      files: [{ path: 'src/api/refunds.controller.ts', why: '422 with the refundable amount' }],
    },
  ],
  focus: ['Refunds that name cancelled lines.'],
};

export const BUMP_HEAD = '5d0a3be8c1f2e4d6a8b0c2e4f6a8b0d2c4e6f8a0';

export const BUMP_BODY = [
  'Bumps money-fmt from 2.4.1 to 3.0.0.',
  '',
  'Release notes',
  '3.0.0',
  'Breaking',
  '- round() now rounds half to even. Pass { mode: "half-up" } for the old behaviour.',
  '- formatMoney() drops the symbolFirst option; the locale decides where the sign goes.',
].join('\n');

export const BUMP_FILES: DiffFile[] = [
  file(
    'package.json',
    'modified',
    [
      '@@ -38,4 +38,4 @@ "dependencies"',
      '     "fastify": "^4.28.1",',
      '     "kysely": "^0.27.4",',
      '-    "money-fmt": "^2.4.1",',
      '+    "money-fmt": "^3.0.0",',
      '     "pino": "^9.4.0",',
    ].join('\n'),
  ),
  file(
    'pnpm-lock.yaml',
    'modified',
    [
      '@@ -1184,4 +1184,5 @@',
      '-  money-fmt@2.4.1:',
      '-    resolution: {integrity: sha512-Qm3dX0a1Q==}',
      '+  money-fmt@3.0.0:',
      '+    resolution: {integrity: sha512-8vXk2Lk9w==}',
      "+    engines: {node: '>=20'}",
      ' ',
      '   pino@9.4.0:',
    ].join('\n'),
  ),
];

export const BUMP_SOURCES: Record<string, string> = {
  'src/invoices/totals.ts': [
    ...Array.from({ length: 73 }, (_, i) => (i === 0 ? "import { round } from 'money-fmt';" : '')),
    '  for (const line of invoice.lines) {',
    '    const net = line.unitPrice.times(line.quantity);',
    '    // VAT per line, as it is printed on the invoice.',
    '    const vat = round((net.cents * line.vatRate) / 100, 0);',
    '    totals.vat = totals.vat.plus(Money.fromCents(vat, invoice.currency));',
    '  }',
  ].join('\n'),
  'src/catalog/price-label.tsx': [
    "import { formatMoney } from 'money-fmt';",
    '',
    'interface Props {',
    '  price: Price;',
    '  locale: string;',
    '}',
    'const LOCALE_OPTS: Record<string, unknown> = {',
    "  'en-US': {},",
    "  'nl-NL': { symbolFirst: true },",
    '};',
  ].join('\n'),
  '.nvmrc': '22.11.0',
};

export const BUMP_ANSWER = {
  verdict: 'assessed',
  unknownWhy: '',
  headline: 'money-fmt 3 rounds half to even, and invoice VAT rounds with it.',
  reasons: [
    {
      effect: 'raises',
      severity: 'high',
      title: 'Invoice VAT on amounts that end in half a cent',
      because:
        'The release notes say round() now rounds half to even. Invoice totals round VAT per line with it, so 2.50 at 21% VAT (52.5 cents) becomes 52 cents instead of 53.',
      why: 'Amounts on invoices you send change.',
      test: { status: 'none', note: 'No invoice test has a half-cent amount.', cite: null },
      cites: [
        { file: 'package.json', lines: [40, 40], quote: '"money-fmt": "^3.0.0"' },
        { description: [6, 6], quote: 'round() now rounds half to even' },
        { path: 'src/invoices/totals.ts', lines: [77, 77], quote: 'const vat = round(' },
      ],
    },
    {
      effect: 'raises',
      severity: 'medium',
      title: 'Where the currency sign goes in Dutch prices',
      because:
        '3.0 drops symbolFirst. The price label passes it for nl-NL through an untyped object, so the compiler will not flag it, and Dutch prices show the sign after the amount.',
      why: 'Visible on every Dutch price. No amount changes.',
      test: { status: 'partial', note: 'Price label stories cover en-US only.', cite: null },
      cites: [
        {
          path: 'src/catalog/price-label.tsx',
          lines: [9, 9],
          quote: "'nl-NL': { symbolFirst: true }",
        },
        { description: [7, 7], quote: 'drops the symbolFirst option' },
      ],
    },
    {
      effect: 'lowers',
      title: 'Nothing else in the lockfile moves',
      because:
        'Only money-fmt changes. Its new Node floor (20) is below the 22 the project runs on.',
      why: 'No other package changes under you.',
      test: null,
      cites: [
        { file: 'pnpm-lock.yaml', lines: [1184, 1186], quote: 'money-fmt@3.0.0' },
        { path: '.nvmrc', lines: [1, 1], quote: '22.11.0' },
      ],
    },
  ],
};
