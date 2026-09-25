// src/components/pr/__fixtures__/pr-list-data.ts
//
// PR list fixtures for the Workbench rows: the 18 open pull requests of the
// iteration-2 mockup (design/mockups/borgdock-redesign-iteration-2.html)
// across three repositories, including 80-check PRs and stale ones, plus
// recently closed ones. Plain data with no store access, so unit tests and
// stories share it.

import type { PullRequestWithChecks, ReviewStatus } from '@/types';

/** The signed-in user in every fixture. */
export const FIXTURE_ME = 'koen';

const HOUR = 60 * 60 * 1000;

export interface ListPrChecks {
  total: number;
  fail?: number;
  run?: number;
  skip?: number;
}

export interface ListPrSpec {
  number: number;
  title: string;
  /** `owner/name`. */
  repo: string;
  author?: string;
  reviewStatus?: ReviewStatus;
  /** Logins still requested as reviewers. */
  requestedReviewers?: string[];
  isDraft?: boolean;
  mergeable?: boolean;
  checks?: ListPrChecks;
  /** Age of the last update. */
  updatedHoursAgo?: number;
  mergedHoursAgo?: number;
  closedHoursAgo?: number;
  labels?: string[];
}

function checkNames(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
}

/** One `PullRequestWithChecks` from a compact spec, with times relative to `now`. */
export function listPr(spec: ListPrSpec, now: number = Date.now()): PullRequestWithChecks {
  const [repoOwner = 'borght-dev', repoName = 'BorgDock'] = spec.repo.split('/');
  const checks = spec.checks ?? { total: 6 };
  const fail = checks.fail ?? 0;
  const run = checks.run ?? 0;
  const skip = checks.skip ?? 0;
  const ok = Math.max(0, checks.total - fail - run - skip);
  const at = (hours: number) => new Date(now - hours * HOUR).toISOString();
  const updatedHoursAgo = spec.updatedHoursAgo ?? 2;
  const closed = spec.mergedHoursAgo !== undefined || spec.closedHoursAgo !== undefined;
  return {
    pullRequest: {
      number: spec.number,
      title: spec.title,
      headRef: `feature/${spec.number}`,
      headSha: `sha${spec.number}`,
      baseRef: 'main',
      authorLogin: spec.author ?? FIXTURE_ME,
      authorAvatarUrl: '',
      state: closed ? 'closed' : 'open',
      createdAt: at(updatedHoursAgo + 30),
      updatedAt: at(updatedHoursAgo),
      isDraft: spec.isDraft ?? false,
      mergeable: spec.mergeable ?? true,
      htmlUrl: `https://github.com/${repoOwner}/${repoName}/pull/${spec.number}`,
      body: '',
      repoOwner,
      repoName,
      reviewStatus: spec.reviewStatus ?? 'none',
      commentCount: 0,
      labels: spec.labels ?? [],
      additions: 120,
      deletions: 30,
      changedFiles: 4,
      commitCount: 2,
      mergedAt: spec.mergedHoursAgo === undefined ? undefined : at(spec.mergedHoursAgo),
      closedAt:
        spec.closedHoursAgo !== undefined
          ? at(spec.closedHoursAgo)
          : spec.mergedHoursAgo !== undefined
            ? at(spec.mergedHoursAgo)
            : undefined,
      requestedReviewers: spec.requestedReviewers ?? [],
    },
    overallStatus: fail > 0 ? 'red' : run > 0 ? 'yellow' : checks.total > 0 ? 'green' : 'gray',
    failedCheckNames: checkNames('Failing check', fail),
    failedCheckSuiteIds: fail > 0 ? [9000 + spec.number] : [],
    pendingCheckNames: checkNames('Running check', run),
    passedCount: ok,
    skippedCount: skip,
    totalCheckCount: checks.total,
  };
}

const BIG = 80;
const SITE = 12;
const FSP = 24;

/** The mockup's 18 open PRs: BorgDock, site and fsp-horizon. */
export const WORKBENCH_PR_SPECS: ListPrSpec[] = [
  {
    number: 471,
    title: 'SQL: virtualize the results grid',
    repo: 'borght-dev/BorgDock',
    reviewStatus: 'changesRequested',
    checks: { total: BIG, fail: 2 },
    updatedHoursAgo: 2,
  },
  {
    number: 482,
    title: 'T3 Code: live agent sessions on pull requests',
    repo: 'borght-dev/BorgDock',
    reviewStatus: 'approved',
    checks: { total: BIG },
    updatedHoursAgo: 3,
  },
  {
    number: 479,
    title: 'GraphQL polling: one call per repo',
    repo: 'borght-dev/BorgDock',
    author: 'mira',
    requestedReviewers: [FIXTURE_ME],
    checks: { total: BIG },
    updatedHoursAgo: 5,
  },
  {
    number: 88,
    title: 'Marketing site: real, sourced changelog page',
    repo: 'borght-dev/site',
    author: 'sasha',
    requestedReviewers: [FIXTURE_ME],
    checks: { total: SITE, run: 5 },
    updatedHoursAgo: 26,
  },
  {
    number: 86,
    title: 'Hero pipeline: capture screenshots from Storybook',
    repo: 'borght-dev/site',
    reviewStatus: 'commented',
    checks: { total: SITE },
    updatedHoursAgo: 28,
  },
  {
    number: 84,
    title: 'Bump deps: Vite 8, Vitest 4, Storybook 10',
    repo: 'borght-dev/site',
    author: 'renovate',
    isDraft: true,
    checks: { total: SITE },
    updatedHoursAgo: 50,
  },
  {
    number: 478,
    title: 'Worktree palette: remember favourites per repo',
    repo: 'borght-dev/BorgDock',
    requestedReviewers: ['mira'],
    checks: { total: BIG },
    updatedHoursAgo: 52,
  },
  {
    number: 476,
    title: 'Settings: per-repository poll interval',
    repo: 'borght-dev/BorgDock',
    author: 'jules',
    reviewStatus: 'commented',
    mergeable: false,
    checks: { total: BIG },
    updatedHoursAgo: 74,
  },
  {
    number: 3668,
    title: 'Offer Save and Approve when finishing an order',
    repo: 'Gomocha-FSP/fsp-horizon',
    author: 'sander',
    requestedReviewers: [FIXTURE_ME],
    checks: { total: FSP },
    updatedHoursAgo: 76,
  },
  {
    number: 474,
    title: 'ADO: attachments tab in the detail window',
    repo: 'borght-dev/BorgDock',
    author: 'mira',
    reviewStatus: 'changesRequested',
    checks: { total: BIG, fail: 1 },
    updatedHoursAgo: 98,
  },
  {
    number: 3655,
    title: 'Order list: keep scroll position after refresh',
    repo: 'Gomocha-FSP/fsp-horizon',
    author: 'sander',
    reviewStatus: 'approved',
    checks: { total: FSP },
    updatedHoursAgo: 122,
  },
  {
    number: 470,
    title: 'Renovate: tauri 2.9 and plugins',
    repo: 'borght-dev/BorgDock',
    author: 'renovate',
    checks: { total: BIG, skip: 4 },
    updatedHoursAgo: 146,
  },
  {
    number: 462,
    title: 'Flyout: show failing checks first',
    repo: 'borght-dev/BorgDock',
    checks: { total: BIG },
    updatedHoursAgo: 9 * 24,
  },
  {
    number: 458,
    title: 'SQL: export results to CSV',
    repo: 'borght-dev/BorgDock',
    author: 'jules',
    requestedReviewers: [FIXTURE_ME],
    checks: { total: BIG },
    updatedHoursAgo: 12 * 24,
  },
  {
    number: 451,
    title: 'Docs: agent recipes for the vera CLI',
    repo: 'borght-dev/BorgDock',
    author: 'sasha',
    reviewStatus: 'commented',
    checks: { total: BIG },
    updatedHoursAgo: 14 * 24,
  },
  {
    number: 3601,
    title: 'Inventory: barcode scan on the mobile client',
    repo: 'Gomocha-FSP/fsp-horizon',
    author: 'sander',
    reviewStatus: 'changesRequested',
    checks: { total: FSP },
    updatedHoursAgo: 17 * 24,
  },
  {
    number: 440,
    title: 'Spike: WebView2 hang watchdog in-app',
    repo: 'borght-dev/BorgDock',
    isDraft: true,
    checks: { total: BIG },
    updatedHoursAgo: 21 * 24,
  },
  {
    number: 433,
    title: 'Theme: high-contrast variant',
    repo: 'borght-dev/BorgDock',
    author: 'mira',
    checks: { total: BIG },
    updatedHoursAgo: 26 * 24,
  },
];

export function workbenchPrs(now: number = Date.now()): PullRequestWithChecks[] {
  return WORKBENCH_PR_SPECS.map((spec) => listPr(spec, now));
}

/** Recently closed PRs: two merged, one closed. */
export function recentlyClosedPrs(now: number = Date.now()): PullRequestWithChecks[] {
  return [
    listPr(
      {
        number: 469,
        title: 'Status bar: keys for the current view',
        repo: 'borght-dev/BorgDock',
        reviewStatus: 'approved',
        checks: { total: BIG },
        updatedHoursAgo: 4,
        mergedHoursAgo: 4,
      },
      now,
    ),
    listPr(
      {
        number: 82,
        title: 'Site: drop the old download placeholders',
        repo: 'borght-dev/site',
        author: 'sasha',
        reviewStatus: 'approved',
        checks: { total: SITE },
        updatedHoursAgo: 20,
        mergedHoursAgo: 20,
      },
      now,
    ),
    listPr(
      {
        number: 3590,
        title: 'Experiment: offline order drafts',
        repo: 'Gomocha-FSP/fsp-horizon',
        author: 'sander',
        checks: { total: FSP, fail: 3 },
        updatedHoursAgo: 30,
        closedHoursAgo: 30,
      },
      now,
    ),
  ];
}

/** `count` merged PRs, enough to push Recently closed past the virtualization threshold. */
export function manyClosedPrs(count: number, now: number = Date.now()): PullRequestWithChecks[] {
  return Array.from({ length: count }, (_, i) =>
    listPr(
      {
        number: 1000 + i,
        title: `Merged change ${i + 1}`,
        repo: 'borght-dev/BorgDock',
        reviewStatus: 'approved',
        checks: { total: 6 },
        updatedHoursAgo: i + 1,
        mergedHoursAgo: i + 1,
      },
      now,
    ),
  );
}

const MANY_REPOS = ['borght-dev/BorgDock', 'Gomocha-FSP/fsp-horizon', 'Gomocha-FSP/fsp-portal'];

/**
 * `count` open PRs across three repositories: every fifth one failing, every
 * seventh waiting on my review, every third mine. Enough to push the open
 * list past `FLIP_MAX_ROWS` (the 200-PR performance fixture).
 */
export function manyOpenPrs(count: number, now: number = Date.now()): PullRequestWithChecks[] {
  return Array.from({ length: count }, (_, i) =>
    listPr(
      {
        number: 2000 + i,
        title: `Open change ${i + 1}`,
        repo: MANY_REPOS[i % MANY_REPOS.length]!,
        author: i % 3 === 0 ? FIXTURE_ME : `dev${i % 11}`,
        reviewStatus: i % 4 === 0 ? 'approved' : 'pending',
        requestedReviewers: i % 7 === 0 && i % 3 !== 0 ? [FIXTURE_ME] : [],
        checks: i % 5 === 0 ? { total: 12, fail: 2 } : { total: 12 },
        updatedHoursAgo: (i % 48) + 1,
      },
      now,
    ),
  );
}
