import type { ActivityEntry } from '@/services/activity/types';

/**
 * The Recent card of design/rail-five/mockups.html (artboard C1), as journal
 * entries: three things that need you and a morning of things that do not.
 * Every name is made up. Times count back from `RECENT_NOW`, so the card
 * reads "14 min ago" and "10:02" whenever the story is opened. Plain data:
 * unit tests and stories share it.
 */
export const RECENT_NOW = new Date(2026, 10, 24, 11, 30);

/** When I last looked: "since 09:12". */
export const RECENT_LOOKED_AT = new Date(2026, 10, 24, 9, 12).toISOString();

export const RECENT_REPO = 'acme/storefront';
const REPO = RECENT_REPO;
const GH = `gh:github.com|koen|${REPO}`;
const NO_LINKS = { itemIds: [], prUrls: [], workstreamIds: [], ciGroupIds: [] };

const minutesAgo = (minutes: number) =>
  new Date(RECENT_NOW.getTime() - minutes * 60_000).toISOString();
const at = (hour: number, minute: number) => new Date(2026, 10, 24, hour, minute).toISOString();

function entry(
  overrides: Partial<ActivityEntry> & Pick<ActivityEntry, 'id' | 'category' | 'summary'>,
  when: string,
): ActivityEntry {
  return {
    schema: 1,
    sourceId: GH,
    entity: { kind: 'pr', key: `gh:${REPO}#0`, title: '', url: null },
    severity: 'info',
    needsYou: false,
    status: 'open',
    resolvedBy: null,
    sourceAt: when,
    observedAt: when,
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

function pr(number: number, title: string): ActivityEntry['entity'] {
  return {
    kind: 'pr',
    key: `gh:${REPO}#${number}`,
    title,
    url: `https://github.com/${REPO}/pull/${number}`,
  };
}

const checksFailed = entry(
  {
    id: `${GH}|#431:checks:f3a9:failed`,
    category: 'pr.checks-failed',
    severity: 'error',
    needsYou: true,
    summary: '3 checks failed on #431 Cart totals rounding',
    entity: pr(431, 'Cart totals rounding'),
    action: { kind: 'open-pr', owner: 'acme', repo: 'storefront', number: 431, tab: 'checks' },
  },
  minutesAgo(14),
);

const question = entry(
  {
    id: 't3:mini|thread:cart:request:req-7',
    sourceId: 't3:mini',
    category: 'agent.question',
    severity: 'warning',
    needsYou: true,
    summary: 'storefront asks: Which rounding rule should cart totals use?',
    entity: { kind: 'thread', key: 't3:mini:thread:cart', title: 'Fix cart totals', url: null },
    action: {
      kind: 'answer',
      hostId: 'mini',
      threadId: 'cart',
      requestId: 'req-7',
      option: 'Half up',
    },
  },
  minutesAgo(31),
);

const reviewRequest = entry(
  {
    id: `${GH}|review-request:${REPO}#428`,
    category: 'pr.review-request',
    severity: 'warning',
    needsYou: true,
    summary: 'dana asks for your review on #428 Gift card field',
    entity: pr(428, 'Gift card field'),
    action: { kind: 'review-pr', owner: 'acme', repo: 'storefront', number: 428 },
  },
  minutesAgo(62),
);

const merged = entry(
  {
    id: `${GH}|#412:merged`,
    category: 'pr.merged',
    severity: 'success',
    summary: '#412 Price table migration was merged',
    entity: pr(412, 'Price table migration'),
  },
  at(10, 2),
);

const reached = entry(
  {
    id: `deploy:github.com|koen|${REPO}|reached:${REPO}#412:staging`,
    sourceId: `deploy:github.com|koen|${REPO}`,
    category: 'deploy.reached',
    summary: 'Staging got #412 and #409',
    entity: pr(412, 'Price table migration'),
  },
  at(10, 20),
);

const report = entry(
  {
    id: 'ado:acme/shop|ado-comment:9001',
    sourceId: 'ado:acme/shop',
    category: 'agent.report',
    summary: 'Vera reported on 4821 Migrate price tables',
    entity: {
      kind: 'workitem',
      key: 'ado:acme/shop:4821',
      title: 'Migrate price tables',
      url: null,
    },
    links: { ...NO_LINKS, itemIds: [4821] },
  },
  at(10, 41),
);

function grew(group: string, when: string): ActivityEntry {
  return entry(
    {
      id: `ci:github.com|koen|${REPO}|${group}:group-grew:3:2026-11-24`,
      sourceId: `ci:github.com|koen|${REPO}`,
      category: 'ci.group-grew',
      severity: 'warning',
      summary: `${group} now fails on 3 PRs, and nobody owns it`,
      entity: { kind: 'ci-group', key: `ci:${group}`, title: group, url: null },
    },
    when,
  );
}

export const RECENT_NEEDS_YOU: ActivityEntry[] = [checksFailed, question, reviewRequest];

export const RECENT_EARLIER: ActivityEntry[] = [
  merged,
  reached,
  report,
  grew('Checkout spec times out', at(11, 5)),
  grew('Flaky price snapshot', at(11, 15)),
];

/** Eight things that need you: the card names five and counts the rest. */
export function manyNeedingYou(): ActivityEntry[] {
  const titles = ['Coupon stacking', 'Tax rounding', 'Wishlist sync', 'Address form', 'Order CSV'];
  return [
    ...RECENT_NEEDS_YOU,
    ...titles.map((title, index) =>
      entry(
        {
          id: `${GH}|review-request:${REPO}#${440 + index}`,
          category: 'pr.review-request',
          severity: 'warning',
          needsYou: true,
          summary: `sam asks for your review on #${440 + index} ${title}`,
          entity: pr(440 + index, title),
          action: { kind: 'review-pr', owner: 'acme', repo: 'storefront', number: 440 + index },
        },
        minutesAgo(90 + index * 7),
      ),
    ),
  ];
}

const LONG =
  ', which only shows on orders that mix a percentage coupon with a gift card and a tax-exempt address';

export function longSummaries(): ActivityEntry[] {
  return [...RECENT_NEEDS_YOU, ...RECENT_EARLIER].map((item) => ({
    ...item,
    summary: `${item.summary}${LONG}`,
  }));
}
