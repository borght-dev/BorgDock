// src/components/flyout/__fixtures__/flyout-data.ts

import type { FlyoutData, FlyoutPr } from '../FlyoutGlance';
import type { ToastAction, ToastPayload } from '../flyout-mode';

export function makeFlyoutPr(overrides: Partial<FlyoutPr> = {}): FlyoutPr {
  return {
    number: 1,
    title: 'Add storybook scaffold',
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    authorLogin: 'octocat',
    authorAvatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
    overallStatus: 'green',
    reviewStatus: 'approved',
    failedCount: 0,
    failedCheckNames: [],
    pendingCount: 0,
    passedCount: 4,
    totalChecks: 4,
    commentCount: 0,
    isMine: true,
    htmlUrl: 'https://github.com/borght-dev/BorgDock/pull/1',
    headRef: 'feature/storybook',
    isDraft: false,
    mergeScore: 92,
    mergeable: true,
    ...overrides,
  };
}

export function makeFlyoutData(overrides: Partial<FlyoutData> = {}): FlyoutData {
  return {
    pullRequests: [],
    failingCount: 0,
    pendingCount: 0,
    passingCount: 0,
    totalCount: 0,
    focusCount: 0,
    username: 'octocat',
    theme: 'system',
    lastSyncAgo: 'just now',
    hotkey: 'Ctrl+Win+Shift+G',
    ...overrides,
  };
}

export function makeToast(overrides: Partial<ToastPayload> = {}): ToastPayload {
  return {
    id: overrides.id ?? `toast-${Math.random().toString(36).slice(2, 8)}`,
    severity: 'info',
    title: 'Something happened',
    body: 'A neutral message body to occupy roughly two lines so the layout is exercised.',
    actions: [],
    ...overrides,
  };
}

export function makeAction(overrides: Partial<ToastAction> = {}): ToastAction {
  return {
    label: 'Open',
    action: 'open-url',
    url: 'https://github.com',
    ...overrides,
  };
}

// Curated sets

export const passingPrs: FlyoutPr[] = Array.from({ length: 5 }, (_, i) =>
  makeFlyoutPr({
    number: 100 + i,
    title: `Passing PR #${100 + i}`,
    overallStatus: 'green',
    failedCount: 0,
    pendingCount: 0,
    passedCount: 4,
    totalChecks: 4,
  }),
);

export const failingPrs: FlyoutPr[] = Array.from({ length: 5 }, (_, i) =>
  makeFlyoutPr({
    number: 200 + i,
    title: `Failing PR #${200 + i}`,
    overallStatus: 'red',
    failedCount: 2,
    failedCheckNames: ['ci/build', 'ci/test'],
    pendingCount: 0,
    passedCount: 2,
    totalChecks: 4,
    mergeScore: 24,
  }),
);

export const mixedPrs: FlyoutPr[] = [
  makeFlyoutPr({ number: 301, title: 'Mixed: green', overallStatus: 'green' }),
  makeFlyoutPr({
    number: 302,
    title: 'Mixed: yellow (pending)',
    overallStatus: 'yellow',
    pendingCount: 2,
    passedCount: 1,
    totalChecks: 3,
  }),
  makeFlyoutPr({
    number: 303,
    title: 'Mixed: red',
    overallStatus: 'red',
    failedCount: 1,
    failedCheckNames: ['ci/lint'],
    passedCount: 2,
    totalChecks: 3,
  }),
  makeFlyoutPr({
    number: 304,
    title: 'Mixed: gray (no checks)',
    overallStatus: 'gray',
    passedCount: 0,
    totalChecks: 0,
  }),
];

export const draftPrs: FlyoutPr[] = Array.from({ length: 3 }, (_, i) =>
  makeFlyoutPr({
    number: 400 + i,
    title: `Draft PR #${400 + i}`,
    isDraft: true,
    overallStatus: 'gray',
  }),
);

export const longTitlePrs: FlyoutPr[] = [
  makeFlyoutPr({
    number: 501,
    title:
      'feat(some-very-large-package-name): add an extremely long title that goes past the visible row width to exercise truncation in the FlyoutPrRow component',
  }),
  makeFlyoutPr({
    number: 502,
    title: 'fix: another exceptionally lengthy title that should also wrap or truncate',
  }),
];

export const longAuthorPrs: FlyoutPr[] = [
  makeFlyoutPr({
    number: 601,
    authorLogin: 'a-deliberately-long-github-username-for-layout-testing',
  }),
];

// Sparse — omits htmlUrl/headRef/isDraft/mergeScore/mergeable
export const sparsePrs: FlyoutPr[] = [
  {
    number: 701,
    title: 'Sparse payload — synthetic test seed shape',
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    authorLogin: 'octocat',
    authorAvatarUrl: '',
    overallStatus: 'green',
    reviewStatus: 'pending',
    failedCount: 0,
    failedCheckNames: [],
    pendingCount: 0,
    passedCount: 0,
    totalChecks: 0,
    commentCount: 0,
    isMine: false,
  },
];

export const manyPrs: FlyoutPr[] = Array.from({ length: 28 }, (_, i) =>
  makeFlyoutPr({
    number: 1000 + i,
    title: `Bulk PR #${1000 + i}`,
    overallStatus: ['green', 'yellow', 'red', 'gray'][i % 4] as FlyoutPr['overallStatus'],
  }),
);

export const mergeReadyPrs: FlyoutPr[] = [
  makeFlyoutPr({ number: 801, mergeScore: 95, mergeable: true, overallStatus: 'green' }),
  makeFlyoutPr({ number: 802, mergeScore: 88, mergeable: true, overallStatus: 'green' }),
];

export const mergeConflictPrs: FlyoutPr[] = [
  makeFlyoutPr({
    number: 901,
    mergeScore: 50,
    mergeable: false,
    overallStatus: 'yellow',
  }),
];
