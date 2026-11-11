// src/components/pr/__fixtures__/pr-overview-data.ts
//
// The 23 open pull requests of the PR overview mockup
// (design/pr-overview/mockups.html) across four made-up `acme` repositories,
// with the three shared CI failures that block six of them. Plain data with
// no store access, so stories and tests share it.

import { makeGroup } from '@/services/ci-failures/__fixtures__/store';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import type { PrReview, PrReviewState, PullRequestWithChecks, ReviewStatus } from '@/types';
import { FIXTURE_ME } from './pr-list-data';

const MINUTE = 60 * 1000;
const H = 60;
const D = 24 * H;

interface OverviewSpec {
  n: number;
  repo: 'shop-web' | 'shop-api' | 'mobile' | 'infra';
  title: string;
  /** `me` is `FIXTURE_ME`. */
  author: 'me' | 'vera' | 'maria' | 'jonas' | 'dependabot';
  /** Passed, failed, running checks. */
  checks: [number, number, number];
  review: ReviewStatus;
  reviews?: [string, PrReviewState][];
  requested?: string[];
  createdMin: number;
  updatedMin: number;
  additions: number;
  deletions: number;
  draft?: boolean;
  conflicts?: boolean;
  labels?: string[];
  /** Failed job ids, matching a shared group's `prJobIds`. */
  jobs?: number[];
}

const login = (who: string) => (who === 'me' ? FIXTURE_ME : who);

const SPECS: OverviewSpec[] = [
  {
    n: 6398,
    repo: 'shop-api',
    title:
      'fix(grids): answer filter values too long for a LIKE pattern instead of a 500 (AB#61313)',
    author: 'me',
    checks: [17, 0, 2],
    review: 'commented',
    reviews: [['maria', 'commented']],
    createdMin: 26 * H,
    updatedMin: 2,
    additions: 42,
    deletions: 8,
  },
  {
    n: 6388,
    repo: 'shop-api',
    title:
      'fix(mobile-api): bound the inbound shadow predecessor wait inside the device cap (AB#61901)',
    author: 'me',
    checks: [61, 1, 0],
    review: 'commented',
    reviews: [['jonas', 'commented']],
    createdMin: 2 * D,
    updatedMin: 4,
    additions: 120,
    deletions: 35,
    jobs: [8201],
  },
  {
    n: 6382,
    repo: 'shop-api',
    title: 'feat(teams): check environment, fixes and existing items before filing a Teams request',
    author: 'me',
    checks: [60, 0, 2],
    review: 'none',
    requested: ['maria', 'jonas'],
    createdMin: 3 * D,
    updatedMin: 6,
    additions: 410,
    deletions: 52,
  },
  {
    n: 6397,
    repo: 'shop-api',
    title:
      'fix(orders): void a margin acceptance when the cost of an order that sells nothing changes (AB#60469)',
    author: 'me',
    checks: [45, 0, 1],
    review: 'none',
    requested: ['maria'],
    createdMin: D,
    updatedMin: 10,
    additions: 88,
    deletions: 12,
  },
  {
    n: 6377,
    repo: 'shop-web',
    title:
      'fix(profitability): show item names, not translation keys, in the profitability sections (AB#60468)',
    author: 'me',
    checks: [50, 5, 0],
    review: 'none',
    requested: ['jonas'],
    createdMin: 4 * D,
    updatedMin: 9,
    additions: 64,
    deletions: 20,
    jobs: [8401, 8402, 8403, 8404, 8405],
  },
  {
    n: 1268,
    repo: 'mobile',
    title: 'AB#61881 Quote pricing keeps its ten-minute wait on Android',
    author: 'me',
    checks: [5, 0, 0],
    review: 'none',
    requested: ['maria'],
    createdMin: 2 * D,
    updatedMin: 2 * H,
    additions: 30,
    deletions: 6,
  },
  {
    n: 6365,
    repo: 'shop-api',
    title: 'docs(plans): record the decisions for the Teams integration plan',
    author: 'me',
    checks: [2, 0, 0],
    review: 'approved',
    reviews: [['maria', 'approved']],
    createdMin: D,
    updatedMin: 5 * H,
    additions: 210,
    deletions: 0,
  },
  {
    n: 6298,
    repo: 'shop-web',
    title: 'test(e2e): pick usable planboard engineers, not the top rows',
    author: 'me',
    checks: [40, 2, 0],
    review: 'commented',
    reviews: [['jonas', 'commented']],
    createdMin: 9 * D,
    updatedMin: 22 * H,
    additions: 56,
    deletions: 40,
    conflicts: true,
    jobs: [8301, 8302],
  },
  {
    n: 1226,
    repo: 'mobile',
    title: 'AB#60455 Price imported line items on the server for item-pricing organisations',
    author: 'me',
    checks: [5, 0, 0],
    review: 'none',
    requested: ['jonas'],
    createdMin: 6 * D,
    updatedMin: D,
    additions: 140,
    deletions: 22,
  },
  {
    n: 6368,
    repo: 'shop-web',
    title: 'fix(search): resolve configured custom-field filter aliases (AB#61472)',
    author: 'vera',
    checks: [54, 1, 0],
    review: 'commented',
    reviews: [['me', 'commented']],
    createdMin: 2 * D,
    updatedMin: 1,
    additions: 76,
    deletions: 14,
    jobs: [8101],
  },
  {
    n: 6403,
    repo: 'shop-api',
    title: 'fix(users): exempt system accounts from licence limits (AB#61804)',
    author: 'vera',
    checks: [21, 0, 7],
    review: 'none',
    requested: ['me'],
    createdMin: 3 * H,
    updatedMin: 1,
    additions: 48,
    deletions: 9,
  },
  {
    n: 6395,
    repo: 'shop-web',
    title:
      'fix(planboard): load the order list when customer number and a custom field are combined (AB#61576)',
    author: 'vera',
    checks: [16, 0, 6],
    review: 'none',
    requested: ['me'],
    createdMin: D,
    updatedMin: 3,
    additions: 132,
    deletions: 41,
  },
  {
    n: 6396,
    repo: 'shop-web',
    title:
      'docs(customer): Quotes bundle: corrected list guide, help, tour and screenshots (AB#61948)',
    author: 'vera',
    checks: [53, 2, 0],
    review: 'commented',
    reviews: [['me', 'commented']],
    createdMin: D,
    updatedMin: 5,
    additions: 620,
    deletions: 180,
    jobs: [8102, 8105],
  },
  {
    n: 6402,
    repo: 'shop-web',
    title:
      'fix(planboard): unplan at once with a working Ctrl+Z, and say so in the guide (AB#61610)',
    author: 'vera',
    checks: [55, 1, 0],
    review: 'none',
    requested: ['me'],
    createdMin: 2 * D,
    updatedMin: 7,
    additions: 94,
    deletions: 30,
    jobs: [8103],
  },
  {
    n: 6400,
    repo: 'shop-web',
    title: 'fix(planboard): 2 Days view shows the configured working hours (AB#61750)',
    author: 'vera',
    checks: [56, 0, 0],
    review: 'approved',
    reviews: [['me', 'approved']],
    createdMin: 3 * D,
    updatedMin: 40,
    additions: 38,
    deletions: 12,
  },
  {
    n: 6385,
    repo: 'shop-web',
    title:
      'fix(planboard): keep timeline travel buffers inside the gap to the neighbouring order (AB#61563)',
    author: 'vera',
    checks: [56, 0, 0],
    review: 'none',
    requested: ['me'],
    createdMin: 4 * D,
    updatedMin: 3 * H,
    additions: 71,
    deletions: 18,
  },
  {
    n: 6255,
    repo: 'shop-web',
    title: 'fix(grid): keep group headers under column filters (AB#61627)',
    author: 'vera',
    checks: [55, 1, 0],
    review: 'changesRequested',
    reviews: [['me', 'changesRequested']],
    createdMin: 12 * D,
    updatedMin: 9 * D,
    additions: 160,
    deletions: 66,
    jobs: [8104],
  },
  {
    n: 6371,
    repo: 'shop-web',
    title: 'feat(reports): export the margin report as CSV',
    author: 'maria',
    checks: [58, 0, 0],
    review: 'approved',
    reviews: [
      ['jonas', 'approved'],
      ['me', 'approved'],
    ],
    createdMin: 2 * D,
    updatedMin: 3 * H,
    additions: 180,
    deletions: 12,
    labels: ['reports'],
  },
  {
    n: 6390,
    repo: 'shop-api',
    title: 'refactor(pricing): split the order pricing service',
    author: 'jonas',
    checks: [3, 0, 0],
    review: 'none',
    createdMin: 5 * D,
    updatedMin: D,
    additions: 1240,
    deletions: 980,
    draft: true,
  },
  {
    n: 6359,
    repo: 'shop-web',
    title: 'chore(deps): bump vite from 7.1.2 to 7.1.5',
    author: 'dependabot',
    checks: [58, 0, 0],
    review: 'none',
    requested: ['me'],
    createdMin: D,
    updatedMin: 20 * H,
    additions: 6,
    deletions: 6,
    labels: ['dependencies'],
  },
  {
    n: 6360,
    repo: 'shop-web',
    title: 'chore(deps): bump @sentry/browser from 10.3.0 to 10.4.1',
    author: 'dependabot',
    checks: [57, 1, 0],
    review: 'none',
    requested: ['me'],
    createdMin: D,
    updatedMin: 20 * H,
    additions: 6,
    deletions: 6,
    labels: ['dependencies'],
    jobs: [8501],
  },
  {
    n: 412,
    repo: 'infra',
    title: 'ci: cache Playwright browsers between runs',
    author: 'jonas',
    checks: [4, 0, 5],
    review: 'none',
    requested: ['me', 'maria'],
    createdMin: 5 * H,
    updatedMin: 30,
    additions: 44,
    deletions: 3,
  },
  {
    n: 415,
    repo: 'infra',
    title: 'feat(k8s): add a staging-6 namespace',
    author: 'maria',
    checks: [2, 0, 0],
    review: 'none',
    createdMin: 15 * D,
    updatedMin: 11 * D,
    additions: 96,
    deletions: 0,
    draft: true,
  },
];

function toPr(spec: OverviewSpec, now: number): PullRequestWithChecks {
  const at = (minutes: number) => new Date(now - minutes * MINUTE).toISOString();
  const [ok, fail, run] = spec.checks;
  const jobs = spec.jobs ?? [];
  const reviews: PrReview[] = (spec.reviews ?? []).map(([who, state]) => ({
    authorLogin: login(who),
    state,
    commitSha: `sha${spec.n}`,
    submittedAt: at(Math.max(1, spec.updatedMin)),
  }));
  return {
    pullRequest: {
      number: spec.n,
      title: spec.title,
      headRef: `feature/${spec.n}`,
      headSha: `sha${spec.n}`,
      baseRef: 'main',
      authorLogin: login(spec.author),
      authorAvatarUrl: '',
      state: 'open',
      createdAt: at(spec.createdMin),
      updatedAt: at(spec.updatedMin),
      isDraft: spec.draft ?? false,
      mergeable: !spec.conflicts,
      htmlUrl: `https://github.com/acme/${spec.repo}/pull/${spec.n}`,
      body: '',
      repoOwner: 'acme',
      repoName: spec.repo,
      reviewStatus: spec.review,
      commentCount: 0,
      labels: spec.labels ?? [],
      additions: spec.additions,
      deletions: spec.deletions,
      changedFiles: Math.max(1, Math.round((spec.additions + spec.deletions) / 40)),
      commitCount: 2,
      requestedReviewers: (spec.requested ?? []).map(login),
      latestReviews: reviews,
    },
    overallStatus: fail > 0 ? 'red' : run > 0 ? 'yellow' : 'green',
    failedCheckNames: Array.from({ length: fail }, (_, i) => `e2e (shard ${i + 1})`),
    failedCheckSuiteIds: fail > 0 ? [9000 + spec.n] : [],
    pendingCheckNames: Array.from({ length: run }, (_, i) => `build ${i + 1}`),
    passedCount: ok,
    skippedCount: 0,
    totalCheckCount: ok + fail + run,
    ...(jobs.length > 0
      ? {
          ciJobs: jobs.map((id, i) => ({
            id,
            kind: 'actions' as const,
            name: `e2e (shard ${i + 1})`,
            runId: 70_000 + id,
            conclusion: 'failure',
          })),
        }
      : {}),
  };
}

/** The mockup's 23 open PRs, times relative to `now`. */
export function overviewPrs(now: number = Date.now()): PullRequestWithChecks[] {
  return SPECS.map((spec) => toPr(spec, now));
}

/** The three shared CI failures: four Vera PRs, one of mine (also on main), one of mine (not its doing). */
export function overviewCiGroups(now: number = Date.now()): CiGroupSummary[] {
  const ago = (minutes: number) => new Date(now - minutes * MINUTE).toISOString();
  return [
    makeGroup({
      id: 'g-artifacts',
      scope: 'github.com||acme/shop-web',
      title: 'No files were found at e2e/test-results. No artifacts will be uploaded.',
      classification: 'infrastructure',
      prNumbers: [6368, 6396, 6402, 6255],
      prJobIds: [8101, 8102, 8103, 8104],
      occurrenceCount: 6,
      runCount: 6,
      failedSteps: ['Upload test results'],
      firstObservedAt: ago(70),
      lastObservedAt: ago(4),
    }),
    makeGroup({
      id: 'g-playwright',
      scope: 'github.com||acme/shop-api',
      title: "The action 'Install Playwright browsers' has timed out after 10 minutes.",
      classification: 'infrastructure',
      prNumbers: [6388],
      prJobIds: [8201],
      defaultBranchRuns: [5101],
      occurrenceCount: 2,
      runCount: 2,
      failedSteps: ['Install Playwright browsers'],
      firstObservedAt: ago(65),
      lastObservedAt: ago(5),
    }),
    makeGroup({
      id: 'g-report',
      scope: 'github.com||acme/shop-web',
      title: 'Unhandled error: expected one completed Claude report for this run, found 0',
      classification: 'base-branch',
      prNumbers: [6298],
      prJobIds: [8301, 8302],
      defaultBranchRuns: [5201, 5202],
      occurrenceCount: 3,
      runCount: 3,
      failedSteps: ['Run e2e'],
      firstObservedAt: ago(2 * D),
      lastObservedAt: ago(22 * H),
    }),
  ];
}
