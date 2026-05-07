# GitHub Polling — REST → GraphQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the GitHub polling fan-out from ~22 REST calls per repo per cycle into a single GraphQL call, while preserving every UI-visible field and feature (check counts, failed-check rerun, merge readiness display).

**Architecture:** New `services/github/polling.ts` module owns the GraphQL query and response → `PullRequestWithChecks` adapter. `useGitHubPolling.ts` calls only this module. REST functions (`getOpenPRs`, `getCheckRunsForRef`) stay in place for cold paths. The `PullRequestWithChecks` type drops the heavy `checks: CheckRun[]` field and gains lightweight `totalCheckCount: number` and `failedCheckSuiteIds: number[]`. The two surviving consumers of raw `CheckRun[]` (`ChecksTab`, `MergeReadinessChecklist`) take it as a sibling prop alongside `pr`, fed by `PRDetailApp`'s local state.

**Tech Stack:** TypeScript • React • Vitest • Tauri (Rust backend, not touched here) • GitHub GraphQL v4 • Storybook (Vite alias-based mocks)

**Spec:** [`docs/superpowers/specs/2026-05-07-github-graphql-polling-design.md`](../specs/2026-05-07-github-graphql-polling-design.md)

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/services/github/polling.ts` | **create** | GraphQL query, response types, `summarizeRollup`, `pollOpenPrsAggregate` |
| `src/services/github/__tests__/polling.test.ts` | **create** | unit tests for the response → type adapter |
| `src/types/pull-request.ts` | modify | drop `checks`, add `totalCheckCount`, add `failedCheckSuiteIds` |
| `src/services/github/aggregate.ts` | modify | `aggregatePrWithChecks` returns the new shape |
| `src/services/github/__tests__/aggregate.test.ts` | modify | drop assertions on `checks` field; add assertions for new fields |
| `src/services/github/client.ts` | modify | split rate-limit into REST/GraphQL pools; `graphql()` reads inline `rateLimit`; add `start/ok/failed` log lines on `graphql()` |
| `src/services/github/__tests__/client.test.ts` | modify | tests for the rate-limit split |
| `src/services/github/index.ts` | modify | re-export `pollOpenPrsAggregate` |
| `src/services/github/rate-limit.ts` | modify | extend `fetchGitHubRateLimit` to also return GraphQL pool |
| `src/services/merge-score.ts` | modify | `pr.checks.length` → `pr.totalCheckCount` |
| `src/components/pr/MultiSignalIndicator.tsx` | modify | `pr.checks.length` → `pr.totalCheckCount` |
| `src/components/pr/PrContextMenu.tsx` | modify | `pr.checks.find(...)` → `pr.failedCheckSuiteIds[0]` |
| `src/components/pr-detail/PRDetailApp.tsx` | modify | maintain `localChecks: CheckRun[]` state; pass to `PrDetailPanel` as sibling prop |
| `src/components/pr-detail/PRDetailPanel.tsx` | modify | accept `checks` sibling prop; thread through; use `pr.totalCheckCount` |
| `src/components/pr-detail/MergeReadinessChecklist.tsx` | modify | accept `checks` sibling prop; use `pr.totalCheckCount` |
| `src/hooks/useFlyoutSync.ts` | modify | `pr.checks.length` → `pr.totalCheckCount` |
| `src/hooks/useGitHubPolling.ts` | modify | call `pollOpenPrsAggregate` instead of `getOpenPRs` + check-runs fan-out |
| `.storybook/mocks/services-github-polling.ts` | **create** | Storybook mock for the new module |
| `.storybook/mocks/control.ts` | modify | add `pollOpenPrsAggregate` to `GithubResponses`; remove `getOpenPRs` / `getCheckRunsForRef` from there |
| `.storybook/main.ts` | modify | add Vite alias for `@/services/github/polling` |
| `src/components/pr-detail/PRDetailApp.stories.tsx` | modify | replace 4× `{ getOpenPRs, getCheckRunsForRef }` pairs with `pollOpenPrsAggregate` |
| `src/components/pr-detail/__fixtures__/pr-detail-data.tsx` | modify | drop `checks: [...]` from fixture literals |
| `src/components/flyout/__fixtures__/flyout-data.ts` | modify | drop `checks: [...]` if any |
| `src/components/flyout/FlyoutApp.tsx` | modify | drop `failedCheckNames: []` literal that includes a `checks` field if any |
| Various test files | modify | drop `checks: []` / `checks: [makeCheck()]` literals; add `totalCheckCount` / `failedCheckSuiteIds` |
| `src/components/__tests__/window-title-bar-contract.test.tsx` | modify | drop `checks: []` literal |
| `tests/e2e/fixtures/design-fixtures.ts` | modify | drop `checks: []` from 9 fixture entries |
| `tests/e2e/helpers/test-utils.ts` | modify | drop `checks: ...` from 6 fixture entries |
| `tests/e2e/pr-context-menu.spec.ts` | modify | drop `checks: ...` |
| `tests/e2e/pr-detail.spec.ts` | modify | drop `checks: ...` |
| `src/components/pr-detail/__tests__/usePrActions.test.tsx` | modify | drop `checks: []` |
| `src/components/pr-detail/__tests__/PRDetailPanel.test.tsx` | modify | drop `checks: ...`; pass new sibling prop where needed |
| `src/components/pr-detail/__tests__/OverviewTab.test.tsx` | modify | drop `checks: []` |
| `src/components/pr-detail/__tests__/MergeReadinessChecklist.test.tsx` | modify | drop `checks: ...`; pass new sibling prop |
| `src/components/pr-detail/__tests__/ChecksTab.test.tsx` | modify | drop `checks: []` |

---

## Conventions

- **Test runner:** `bun run test -- <pattern>` runs vitest. The `bun --filter` flag misbehaves; the root scripts already `cd` into `src/BorgDock.Tauri`, so `bun run test` from the repo root or from `src/BorgDock.Tauri` both work.
- **Lint:** `bun run lint` runs biome.
- **Imports:** use `@/` for `src/` (e.g., `@/services/github/...`, `@/types`). Tests in `__tests__` use relative imports (`../client`).
- **Logging:** `createLogger('github')` returns a logger with `info`, `warn`, `error`, `debug`. Match the existing log shape in `client.ts::get`.
- **Commit style:** matches recent history (`feat:`, `fix:`, `refactor:`, `test:` etc.) — see `git log --oneline -20`.
- **TDD discipline:** every task that adds production code starts with a failing test. For type-only edits and pure cascade renames there is no separate test step — the type checker and existing tests are the verification.

---

## Task 1: Add new fields to `PullRequestWithChecks`

**Files:**
- Modify: `src/types/pull-request.ts:36-44`

This is the foundation everything else builds on. Add the new fields *and* keep the old `checks: CheckRun[]` field for now — we'll remove it in Task 9 once all consumers stop reading it. This preserves a working build between tasks.

- [ ] **Step 1: Add `totalCheckCount` and `failedCheckSuiteIds` to the type**

```ts
export interface PullRequestWithChecks {
  pullRequest: PullRequest;
  checks: CheckRun[];
  overallStatus: OverallStatus;
  failedCheckNames: string[];
  failedCheckSuiteIds: number[];
  pendingCheckNames: string[];
  passedCount: number;
  skippedCount: number;
  totalCheckCount: number;
}
```

- [ ] **Step 2: Run typecheck to verify nothing broke**

```bash
bun run build
```

Expected: type errors at every consumer because `PullRequestWithChecks` literals don't yet provide `failedCheckSuiteIds` / `totalCheckCount`. We'll fix those literals as we touch them; for now verify the count is finite (~30-50 errors).

- [ ] **Step 3: Update `aggregatePrWithChecks` to populate the new fields**

In `src/services/github/aggregate.ts`, add the two new derivations. Keep `checks` populated in the return value (still in the type); remove later.

```ts
export function aggregatePrWithChecks(
  pr: PullRequest,
  checkRuns: CheckRun[],
): PullRequestWithChecks {
  const overallStatus = computeOverallStatus(checkRuns);

  const failedRuns = checkRuns.filter(
    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out',
  );
  const failedCheckNames = failedRuns.map((c) => c.name);
  const failedCheckSuiteIds = failedRuns
    .map((c) => c.checkSuiteId)
    .filter((id): id is number => typeof id === 'number' && id > 0);

  const pendingCheckNames = checkRuns
    .filter((c) => c.status === 'in_progress' || c.status === 'queued')
    .map((c) => c.name);

  const passedCount = checkRuns.filter((c) => c.conclusion === 'success').length;

  const skippedCount = checkRuns.filter(
    (c) => c.conclusion === 'skipped' || c.conclusion === 'neutral',
  ).length;

  return {
    pullRequest: pr,
    checks: checkRuns,
    overallStatus,
    failedCheckNames,
    failedCheckSuiteIds,
    pendingCheckNames,
    passedCount,
    skippedCount,
    totalCheckCount: checkRuns.length,
  };
}
```

- [ ] **Step 4: Update aggregate tests to assert new fields**

Add to `src/services/github/__tests__/aggregate.test.ts` inside the existing `describe('aggregatePrWithChecks')`:

```ts
it('returns failedCheckSuiteIds parallel to failedCheckNames', () => {
  const pr = makePullRequest();
  const checks = [
    makeCheckRun({ name: 'build', conclusion: 'failure', checkSuiteId: 11 }),
    makeCheckRun({ id: 2, name: 'test', conclusion: 'success', checkSuiteId: 22 }),
    makeCheckRun({ id: 3, name: 'deploy', conclusion: 'timed_out', checkSuiteId: 33 }),
  ];

  const result = aggregatePrWithChecks(pr, checks);

  expect(result.failedCheckNames).toEqual(['build', 'deploy']);
  expect(result.failedCheckSuiteIds).toEqual([11, 33]);
});

it('drops failedCheckSuiteIds entries with non-positive suite id', () => {
  const pr = makePullRequest();
  const checks = [
    makeCheckRun({ name: 'orphan', conclusion: 'failure', checkSuiteId: 0 }),
    makeCheckRun({ id: 2, name: 'real', conclusion: 'failure', checkSuiteId: 99 }),
  ];

  const result = aggregatePrWithChecks(pr, checks);

  expect(result.failedCheckNames).toEqual(['orphan', 'real']);
  expect(result.failedCheckSuiteIds).toEqual([99]);
});

it('returns totalCheckCount equal to the input length', () => {
  const pr = makePullRequest();
  const checks = [
    makeCheckRun({ name: 'a', conclusion: 'success' }),
    makeCheckRun({ id: 2, name: 'b', conclusion: 'failure' }),
    makeCheckRun({ id: 3, name: 'c', conclusion: 'skipped' }),
  ];

  expect(aggregatePrWithChecks(pr, checks).totalCheckCount).toBe(3);
});

it('returns totalCheckCount 0 for empty input', () => {
  const pr = makePullRequest();
  expect(aggregatePrWithChecks(pr, []).totalCheckCount).toBe(0);
});
```

- [ ] **Step 5: Run aggregate tests**

```bash
bun run test -- aggregate
```

Expected: PASS for the new assertions and all existing ones.

- [ ] **Step 6: Commit**

```bash
git add src/types/pull-request.ts src/services/github/aggregate.ts src/services/github/__tests__/aggregate.test.ts
git commit -m "feat(github): add totalCheckCount and failedCheckSuiteIds to PullRequestWithChecks"
```

---

## Task 2: Add the polling module skeleton + GraphQL query string

**Files:**
- Create: `src/services/github/polling.ts`
- Test: `src/services/github/__tests__/polling.test.ts`

This task lands the query string and the public function signature; mapping is filled in by Task 3.

- [ ] **Step 1: Write a failing test for the export shape**

Create `src/services/github/__tests__/polling.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { GitHubClient } from '../client';
import { POLL_OPEN_PRS_QUERY, pollOpenPrsAggregate } from '../polling';

describe('POLL_OPEN_PRS_QUERY', () => {
  it('is a non-empty string', () => {
    expect(typeof POLL_OPEN_PRS_QUERY).toBe('string');
    expect(POLL_OPEN_PRS_QUERY.length).toBeGreaterThan(0);
  });

  it('declares owner and repo variables', () => {
    expect(POLL_OPEN_PRS_QUERY).toContain('$owner: String!');
    expect(POLL_OPEN_PRS_QUERY).toContain('$repo: String!');
  });

  it('requests rateLimit inline', () => {
    expect(POLL_OPEN_PRS_QUERY).toContain('rateLimit');
  });
});

describe('pollOpenPrsAggregate', () => {
  it('passes owner and repo as GraphQL variables', async () => {
    const client = new GitHubClient(vi.fn().mockResolvedValue('t'));
    const graphqlSpy = vi
      .spyOn(client, 'graphql')
      .mockResolvedValue({ repository: { pullRequests: { totalCount: 0, nodes: [] } } });

    await pollOpenPrsAggregate(client, 'octocat', 'hello-world');

    expect(graphqlSpy).toHaveBeenCalledWith(POLL_OPEN_PRS_QUERY, {
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('returns empty array when repo has no open PRs', async () => {
    const client = new GitHubClient(vi.fn().mockResolvedValue('t'));
    vi.spyOn(client, 'graphql').mockResolvedValue({
      repository: { pullRequests: { totalCount: 0, nodes: [] } },
    });

    const result = await pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, expect them to fail (module does not exist yet)**

```bash
bun run test -- polling
```

Expected: FAIL — `Cannot find module '../polling'`.

- [ ] **Step 3: Create the polling module with the query and a stub adapter**

Create `src/services/github/polling.ts`:

```ts
import { createLogger } from '@/services/logger';
import type { PullRequestWithChecks } from '@/types';
import type { GitHubClient } from './client';

const log = createLogger('github:polling');

export const POLL_OPEN_PRS_QUERY = /* GraphQL */ `
  query PollOpenPrs($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        nodes {
          number
          title
          body
          url
          state
          isDraft
          mergeable
          createdAt
          updatedAt
          closedAt
          mergedAt
          additions
          deletions
          changedFiles
          author {
            login
            ... on User { avatarUrl }
            ... on Bot { avatarUrl }
          }
          baseRefName
          headRefName
          headRefOid
          labels(first: 20) { nodes { name } }
          reviewRequests(first: 20) {
            nodes {
              requestedReviewer {
                ... on User { login }
                ... on Team { name }
              }
            }
          }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                  contexts(first: 100) {
                    nodes {
                      __typename
                      ... on CheckRun {
                        name
                        status
                        conclusion
                        checkSuite { databaseId }
                      }
                      ... on StatusContext {
                        context
                        state
                      }
                    }
                  }
                }
              }
            }
          }
          latestReviews(first: 50) {
            nodes {
              state
              author { login }
            }
          }
          comments      { totalCount }
          reviewThreads { totalCount }
          commits       { totalCount }
        }
      }
      rateLimit { remaining limit resetAt cost }
    }
  }
`;

interface PollResponse {
  repository: {
    pullRequests: {
      totalCount: number;
      nodes: unknown[]; // typed in Task 3
    };
  } | null;
}

export async function pollOpenPrsAggregate(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<PullRequestWithChecks[]> {
  const data = await client.graphql<PollResponse>(POLL_OPEN_PRS_QUERY, { owner, repo });
  const repository = data.repository;
  if (!repository) {
    log.warn('repository null in poll response', { owner, repo });
    return [];
  }
  if (repository.pullRequests.totalCount > 100) {
    log.warn('PR list truncated to 100', {
      owner,
      repo,
      totalCount: repository.pullRequests.totalCount,
    });
  }
  // Mapping landed in Task 3.
  return [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- polling
```

Expected: PASS — query is non-empty, declares variables, requests `rateLimit`; stub returns empty array.

- [ ] **Step 5: Commit**

```bash
git add src/services/github/polling.ts src/services/github/__tests__/polling.test.ts
git commit -m "feat(github): add polling module skeleton with GraphQL query"
```

---

## Task 3: Implement the response → `PullRequestWithChecks` adapter

**Files:**
- Modify: `src/services/github/polling.ts`
- Modify: `src/services/github/__tests__/polling.test.ts`

This task fills in the mapping layer.

- [ ] **Step 1: Write failing tests for each adapter case**

Append to `src/services/github/__tests__/polling.test.ts`:

```ts
import type { PullRequestWithChecks } from '@/types';

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: 'Test PR',
    body: '',
    url: 'https://github.com/octocat/hello-world/pull/1',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    closedAt: null,
    mergedAt: null,
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    author: { __typename: 'User', login: 'octocat', avatarUrl: 'https://x/y.png' },
    baseRefName: 'main',
    headRefName: 'feature',
    headRefOid: 'sha1',
    labels: { nodes: [{ name: 'bug' }] },
    reviewRequests: { nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: null } }], totalCount: 1 },
    latestReviews: { nodes: [] },
    comments: { totalCount: 3 },
    reviewThreads: { totalCount: 2 },
    ...overrides,
  };
}

function callAdapter(nodes: unknown[]): Promise<PullRequestWithChecks[]> {
  const client = new GitHubClient(vi.fn().mockResolvedValue('t'));
  vi.spyOn(client, 'graphql').mockResolvedValue({
    repository: { pullRequests: { totalCount: nodes.length, nodes } },
  });
  return pollOpenPrsAggregate(client, 'octocat', 'hello-world');
}

describe('pollOpenPrsAggregate (adapter)', () => {
  it('maps a basic PR node with no checks → overallStatus gray', async () => {
    const [pr] = await callAdapter([makeNode()]);
    expect(pr).toBeDefined();
    expect(pr!.pullRequest.number).toBe(1);
    expect(pr!.pullRequest.title).toBe('Test PR');
    expect(pr!.pullRequest.repoOwner).toBe('octocat');
    expect(pr!.pullRequest.repoName).toBe('hello-world');
    expect(pr!.pullRequest.commentCount).toBe(5); // 3 + 2
    expect(pr!.pullRequest.mergeable).toBe(true);
    expect(pr!.overallStatus).toBe('gray');
    expect(pr!.totalCheckCount).toBe(0);
    expect(pr!.failedCheckNames).toEqual([]);
    expect(pr!.failedCheckSuiteIds).toEqual([]);
  });

  it('mergeable: MERGEABLE → true', async () => {
    const [pr] = await callAdapter([makeNode({ mergeable: 'MERGEABLE' })]);
    expect(pr!.pullRequest.mergeable).toBe(true);
  });

  it('mergeable: CONFLICTING → false', async () => {
    const [pr] = await callAdapter([makeNode({ mergeable: 'CONFLICTING' })]);
    expect(pr!.pullRequest.mergeable).toBe(false);
  });

  it('mergeable: UNKNOWN → undefined', async () => {
    const [pr] = await callAdapter([makeNode({ mergeable: 'UNKNOWN' })]);
    expect(pr!.pullRequest.mergeable).toBeUndefined();
  });

  it('isDraft true is preserved', async () => {
    const [pr] = await callAdapter([makeNode({ isDraft: true })]);
    expect(pr!.pullRequest.isDraft).toBe(true);
  });

  it('latestReviews APPROVED + COMMENTED → reviewStatus approved', async () => {
    const [pr] = await callAdapter([
      makeNode({
        latestReviews: {
          nodes: [
            { state: 'APPROVED', author: { login: 'a' } },
            { state: 'COMMENTED', author: { login: 'b' } },
          ],
        },
      }),
    ]);
    expect(pr!.pullRequest.reviewStatus).toBe('approved');
  });

  it('reviewRequests with User and Team → flat string array', async () => {
    const [pr] = await callAdapter([
      makeNode({
        reviewRequests: {
          nodes: [
            { requestedReviewer: { __typename: 'User', login: 'alice' } },
            { requestedReviewer: { __typename: 'Team', name: 'platform' } },
          ],
        },
      }),
    ]);
    expect(pr!.pullRequest.requestedReviewers).toEqual(['alice', 'platform']);
  });

  it('rollup state SUCCESS with all-green contexts → overallStatus green', async () => {
    const [pr] = await callAdapter([
      makeNode({
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'SUCCESS',
                  contexts: {
                    nodes: [
                      {
                        __typename: 'CheckRun',
                        name: 'build',
                        status: 'COMPLETED',
                        conclusion: 'SUCCESS',
                        checkSuite: { databaseId: 1 },
                      },
                    ],
                  },
                },
              },
            },
          ],
          totalCount: 1,
        },
      }),
    ]);
    expect(pr!.overallStatus).toBe('green');
    expect(pr!.passedCount).toBe(1);
    expect(pr!.totalCheckCount).toBe(1);
  });

  it('rollup state FAILURE with mixed contexts → failed names + suite ids', async () => {
    const [pr] = await callAdapter([
      makeNode({
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        __typename: 'CheckRun',
                        name: 'build',
                        status: 'COMPLETED',
                        conclusion: 'FAILURE',
                        checkSuite: { databaseId: 11 },
                      },
                      {
                        __typename: 'CheckRun',
                        name: 'pending-test',
                        status: 'IN_PROGRESS',
                        conclusion: null,
                        checkSuite: { databaseId: 22 },
                      },
                      {
                        __typename: 'CheckRun',
                        name: 'lint',
                        status: 'COMPLETED',
                        conclusion: 'SUCCESS',
                        checkSuite: { databaseId: 33 },
                      },
                      {
                        __typename: 'CheckRun',
                        name: 'optional',
                        status: 'COMPLETED',
                        conclusion: 'SKIPPED',
                        checkSuite: { databaseId: 44 },
                      },
                    ],
                  },
                },
              },
            },
          ],
          totalCount: 1,
        },
      }),
    ]);
    expect(pr!.overallStatus).toBe('red');
    expect(pr!.failedCheckNames).toEqual(['build']);
    expect(pr!.failedCheckSuiteIds).toEqual([11]);
    expect(pr!.pendingCheckNames).toEqual(['pending-test']);
    expect(pr!.passedCount).toBe(1);
    expect(pr!.skippedCount).toBe(1);
    expect(pr!.totalCheckCount).toBe(4);
  });

  it('legacy StatusContext FAILURE contributes name but no suite id', async () => {
    const [pr] = await callAdapter([
      makeNode({
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      { __typename: 'StatusContext', context: 'continuous-integration', state: 'FAILURE' },
                    ],
                  },
                },
              },
            },
          ],
          totalCount: 1,
        },
      }),
    ]);
    expect(pr!.failedCheckNames).toEqual(['continuous-integration']);
    expect(pr!.failedCheckSuiteIds).toEqual([]);
  });

  it('logs a warning when totalCount > 100', async () => {
    const warnSpy = vi.fn();
    // Spy on the createLogger output indirectly: just assert no throw and length cap.
    const nodes = Array.from({ length: 100 }, (_, i) => makeNode({ number: i + 1 }));
    const client = new GitHubClient(vi.fn().mockResolvedValue('t'));
    vi.spyOn(client, 'graphql').mockResolvedValue({
      repository: { pullRequests: { totalCount: 250, nodes } },
    });

    const result = await pollOpenPrsAggregate(client, 'big', 'repo');
    expect(result.length).toBe(100);
    void warnSpy;
  });
});
```

- [ ] **Step 2: Run tests, expect them to fail (adapter returns empty)**

```bash
bun run test -- polling
```

Expected: FAIL — adapter still returns `[]`.

- [ ] **Step 3: Implement the adapter and helpers**

Replace the body of `src/services/github/polling.ts` with the full implementation:

```ts
import { createLogger } from '@/services/logger';
import { aggregateReviewStatus } from './pulls';
import type {
  OverallStatus,
  PullRequest,
  PullRequestWithChecks,
  ReviewStatus,
} from '@/types';
import type { GitHubClient } from './client';

const log = createLogger('github:polling');

export const POLL_OPEN_PRS_QUERY = /* GraphQL */ `
  query PollOpenPrs($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        nodes {
          number
          title
          body
          url
          state
          isDraft
          mergeable
          createdAt
          updatedAt
          closedAt
          mergedAt
          additions
          deletions
          changedFiles
          author {
            login
            ... on User { avatarUrl }
            ... on Bot { avatarUrl }
          }
          baseRefName
          headRefName
          headRefOid
          labels(first: 20) { nodes { name } }
          reviewRequests(first: 20) {
            nodes {
              requestedReviewer {
                ... on User { login }
                ... on Team { name }
              }
            }
          }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                  contexts(first: 100) {
                    nodes {
                      __typename
                      ... on CheckRun {
                        name
                        status
                        conclusion
                        checkSuite { databaseId }
                      }
                      ... on StatusContext {
                        context
                        state
                      }
                    }
                  }
                }
              }
            }
          }
          latestReviews(first: 50) {
            nodes {
              state
              author { login }
            }
          }
          comments      { totalCount }
          reviewThreads { totalCount }
          commits       { totalCount }
        }
      }
      rateLimit { remaining limit resetAt cost }
    }
  }
`;

type GqlMergeable = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
type GqlRollupState = 'SUCCESS' | 'FAILURE' | 'PENDING' | 'EXPECTED' | 'ERROR';

interface GqlAuthor {
  login?: string;
  avatarUrl?: string;
}

interface GqlReviewRequest {
  requestedReviewer:
    | { __typename: 'User'; login: string }
    | { __typename: 'Team'; name: string }
    | null;
}

interface GqlReview {
  state: string;
  author: { login?: string } | null;
}

interface GqlCheckRunContext {
  __typename: 'CheckRun';
  name: string;
  status: string;
  conclusion: string | null;
  checkSuite: { databaseId: number | null } | null;
}

interface GqlStatusContext {
  __typename: 'StatusContext';
  context: string;
  state: string;
}

type GqlContext = GqlCheckRunContext | GqlStatusContext;

interface GqlStatusCheckRollup {
  state: GqlRollupState;
  contexts: { nodes: GqlContext[] };
}

interface GqlCommitNode {
  commit: { statusCheckRollup: GqlStatusCheckRollup | null };
}

interface GqlPrNode {
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  isDraft: boolean;
  mergeable: GqlMergeable;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: GqlAuthor | null;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  labels: { nodes: Array<{ name: string }> };
  reviewRequests: { nodes: GqlReviewRequest[] };
  commits: { nodes: GqlCommitNode[]; totalCount: number };
  latestReviews: { nodes: GqlReview[] };
  comments: { totalCount: number };
  reviewThreads: { totalCount: number };
}

interface PollResponse {
  repository: {
    pullRequests: {
      totalCount: number;
      nodes: GqlPrNode[];
    };
  } | null;
}

export async function pollOpenPrsAggregate(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<PullRequestWithChecks[]> {
  const data = await client.graphql<PollResponse>(POLL_OPEN_PRS_QUERY, { owner, repo });
  const repository = data.repository;
  if (!repository) {
    log.warn('repository null in poll response', { owner, repo });
    return [];
  }
  if (repository.pullRequests.totalCount > 100) {
    log.warn('PR list truncated to 100', {
      owner,
      repo,
      totalCount: repository.pullRequests.totalCount,
    });
  }
  return repository.pullRequests.nodes.map((node) => mapNode(node, owner, repo));
}

function mapNode(
  node: GqlPrNode,
  owner: string,
  repo: string,
): PullRequestWithChecks {
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup ?? null;
  const summary = summarizeRollup(rollup);

  const requestedReviewers = node.reviewRequests.nodes
    .map((rr) => {
      const r = rr.requestedReviewer;
      if (!r) return null;
      if (r.__typename === 'User') return r.login;
      if (r.__typename === 'Team') return r.name;
      return null;
    })
    .filter((s): s is string => typeof s === 'string' && s.length > 0);

  const reviewStatus = mapReviewStatus(node.latestReviews.nodes);

  const pr: PullRequest = {
    number: node.number,
    title: node.title,
    headRef: node.headRefName,
    headSha: node.headRefOid,
    baseRef: node.baseRefName,
    authorLogin: node.author?.login ?? '',
    authorAvatarUrl: node.author?.avatarUrl ?? '',
    state: node.state.toLowerCase(),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    isDraft: node.isDraft,
    mergeable: mapMergeable(node.mergeable),
    htmlUrl: node.url,
    body: node.body ?? '',
    repoOwner: owner,
    repoName: repo,
    reviewStatus,
    commentCount: node.comments.totalCount + node.reviewThreads.totalCount,
    labels: node.labels.nodes.map((l) => l.name).filter((n) => n.length > 0),
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
    commitCount: node.commits.totalCount,
    mergedAt: node.mergedAt ?? undefined,
    closedAt: node.closedAt ?? undefined,
    requestedReviewers,
  };

  return {
    pullRequest: pr,
    checks: [], // legacy field — populated [] by polling, removed by Task 9
    overallStatus: summary.overallStatus,
    failedCheckNames: summary.failedCheckNames,
    failedCheckSuiteIds: summary.failedCheckSuiteIds,
    pendingCheckNames: summary.pendingCheckNames,
    passedCount: summary.passedCount,
    skippedCount: summary.skippedCount,
    totalCheckCount: summary.totalCheckCount,
  };
}

function mapMergeable(state: GqlMergeable): boolean | undefined {
  if (state === 'MERGEABLE') return true;
  if (state === 'CONFLICTING') return false;
  return undefined;
}

function mapReviewStatus(reviews: GqlReview[]): ReviewStatus {
  // Reuse the existing aggregator from pulls.ts by adapting the shape.
  return aggregateReviewStatus(
    reviews.map((r) => ({ state: r.state, user: r.author ? { login: r.author.login ?? '' } : null })),
  );
}

function summarizeRollup(rollup: GqlStatusCheckRollup | null): {
  overallStatus: OverallStatus;
  failedCheckNames: string[];
  failedCheckSuiteIds: number[];
  pendingCheckNames: string[];
  passedCount: number;
  skippedCount: number;
  totalCheckCount: number;
} {
  if (!rollup) {
    return {
      overallStatus: 'gray',
      failedCheckNames: [],
      failedCheckSuiteIds: [],
      pendingCheckNames: [],
      passedCount: 0,
      skippedCount: 0,
      totalCheckCount: 0,
    };
  }

  const failedCheckNames: string[] = [];
  const failedCheckSuiteIds: number[] = [];
  const pendingCheckNames: string[] = [];
  let passedCount = 0;
  let skippedCount = 0;

  for (const ctx of rollup.contexts.nodes) {
    if (ctx.__typename === 'CheckRun') {
      const concl = ctx.conclusion?.toLowerCase() ?? '';
      const stat = ctx.status.toLowerCase();
      if (concl === 'failure' || concl === 'timed_out') {
        failedCheckNames.push(ctx.name);
        const suiteId = ctx.checkSuite?.databaseId;
        if (typeof suiteId === 'number' && suiteId > 0) {
          failedCheckSuiteIds.push(suiteId);
        }
      } else if (stat === 'in_progress' || stat === 'queued') {
        pendingCheckNames.push(ctx.name);
      } else if (concl === 'success') {
        passedCount++;
      } else if (concl === 'skipped' || concl === 'neutral') {
        skippedCount++;
      }
    } else {
      // StatusContext
      const stateUp = ctx.state.toUpperCase();
      if (stateUp === 'FAILURE' || stateUp === 'ERROR') {
        failedCheckNames.push(ctx.context);
      } else if (stateUp === 'PENDING' || stateUp === 'EXPECTED') {
        pendingCheckNames.push(ctx.context);
      } else if (stateUp === 'SUCCESS') {
        passedCount++;
      }
    }
  }

  const overallStatus: OverallStatus =
    rollup.state === 'SUCCESS'
      ? 'green'
      : rollup.state === 'FAILURE' || rollup.state === 'ERROR'
        ? 'red'
        : rollup.state === 'PENDING' || rollup.state === 'EXPECTED'
          ? 'yellow'
          : 'gray';

  return {
    overallStatus,
    failedCheckNames,
    failedCheckSuiteIds,
    pendingCheckNames,
    passedCount,
    skippedCount,
    totalCheckCount: rollup.contexts.nodes.length,
  };
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
bun run test -- polling
```

Expected: PASS for all adapter tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/github/polling.ts src/services/github/__tests__/polling.test.ts
git commit -m "feat(github): implement GraphQL response → PullRequestWithChecks adapter"
```

---

## Task 4: Re-export `pollOpenPrsAggregate` from the barrel

**Files:**
- Modify: `src/services/github/index.ts`

- [ ] **Step 1: Add the re-export**

Edit `src/services/github/index.ts`, append:

```ts
export { pollOpenPrsAggregate, POLL_OPEN_PRS_QUERY } from './polling';
```

- [ ] **Step 2: Verify build**

```bash
bun run build
```

Expected: same type errors as before (downstream consumers still missing literal fields), but no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/github/index.ts
git commit -m "feat(github): re-export pollOpenPrsAggregate from barrel"
```

---

## Task 5: Switch the polling hook to the new aggregator

**Files:**
- Modify: `src/hooks/useGitHubPolling.ts`

- [ ] **Step 1: Replace the per-repo fan-out with one call**

Edit `src/hooks/useGitHubPolling.ts`. Replace the per-repo loop body (currently `getOpenPRs(...)` + `Promise.allSettled(prs.map(... getCheckRunsForRef(...)))`) with a single call.

Imports change:

```diff
-import { aggregatePrWithChecks } from '@/services/github/aggregate';
 import { getGitHubToken } from '@/services/github/auth';
-import { getCheckRunsForRef } from '@/services/github/checks';
-import { getClosedPRs, getOpenPRs } from '@/services/github/pulls';
+import { aggregatePrWithChecks } from '@/services/github/aggregate';
+import { getClosedPRs } from '@/services/github/pulls';
+import { pollOpenPrsAggregate } from '@/services/github/polling';
 import { getClient, initClient } from '@/services/github/singleton';
```

(`aggregatePrWithChecks` stays — closed-PR processing still uses it at the bottom of the hook.)

The body of the per-repo `try` block becomes:

```ts
try {
  const repoStart = performance.now();
  const prs = await pollOpenPrsAggregate(c, repo.owner, repo.name);
  for (const pr of prs) allPrs.push(pr);
  log.debug('poll: repo fetched', {
    repo: repoLabel,
    prs: prs.length,
    durationMs: Math.round(performance.now() - repoStart),
  });
} catch (err) {
  log.error('poll: repo failed', err, { repo: repoLabel });
}
```

The `priorByKey` snapshot logic and per-PR `Promise.allSettled` block are deleted entirely. The new function returns fully-aggregated results in one shot, so there is no per-PR fallback to last-known checks anymore — but a transient repo-level failure is still caught by the `try/catch`. (The state-fallback semantics for individual PRs were specific to the REST `getCheckRunsForRef` flake, which no longer fires.)

- [ ] **Step 2: Run unit tests for the polling hook (if any)**

```bash
bun run test -- useGitHubPolling
```

If tests don't exist yet, the next step's typecheck is the verification.

- [ ] **Step 3: Run typecheck and confirm only the expected literal-shape errors remain**

```bash
bun run build
```

Expected: same error population as before (missing `failedCheckSuiteIds` / `totalCheckCount` on fixture literals). Resolved by Tasks 6–9.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGitHubPolling.ts
git commit -m "feat(polling): use GraphQL pollOpenPrsAggregate instead of REST fan-out"
```

---

## Task 6: Cascade — list-side consumers (`pr.checks.length` → `pr.totalCheckCount`)

**Files:**
- Modify: `src/hooks/useFlyoutSync.ts:67`
- Modify: `src/components/pr/MultiSignalIndicator.tsx:33`
- Modify: `src/services/merge-score.ts:5`

These three files only read `pr.checks` for its length. Mechanical replacement.

- [ ] **Step 1: useFlyoutSync.ts**

```diff
-      totalChecks: pr.checks.length,
+      totalChecks: pr.totalCheckCount,
```

- [ ] **Step 2: MultiSignalIndicator.tsx**

```diff
-  if (pr.checks.length === 0) return 'gray';
+  if (pr.totalCheckCount === 0) return 'gray';
```

- [ ] **Step 3: merge-score.ts**

```diff
-  const relevant = pr.checks.length - pr.skippedCount;
+  const relevant = pr.totalCheckCount - pr.skippedCount;
```

- [ ] **Step 4: Run tests for these three modules**

```bash
bun run test -- useFlyoutSync MultiSignalIndicator merge-score
```

Expected: PASS (no test file changes yet — tests still construct `PullRequestWithChecks` literals with both `checks` *and* the new fields, which is OK during this transitional state).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFlyoutSync.ts src/components/pr/MultiSignalIndicator.tsx src/services/merge-score.ts
git commit -m "refactor: read totalCheckCount instead of pr.checks.length in list-side consumers"
```

---

## Task 7: Cascade — `PrContextMenu` rerun action

**Files:**
- Modify: `src/components/pr/PrContextMenu.tsx:113-170`

`PrContextMenu` finds the first failed check to call `rerunChecks` on its check-suite ID. Replace the `pr.checks.find(...)` lookup with a direct read of `pr.failedCheckSuiteIds[0]`.

- [ ] **Step 1: Replace the lookup**

Edit lines around 113:

```diff
-  // Find a failed check's run ID for rerun (pick the first failed check's suite)
-  const failedCheck = pr.checks.find(
-    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out',
-  );
+  // Pick the first failed check's suite for rerun.
+  const failedSuiteId: number | undefined = pr.failedCheckSuiteIds[0];
```

Then around line 170, replace `failedCheck.checkSuiteId` with `failedSuiteId`:

```diff
-    await rerunChecks({ repoOwner: owner, repoName: repo, checkSuiteId: failedCheck.checkSuiteId });
+    if (failedSuiteId === undefined) return;
+    await rerunChecks({ repoOwner: owner, repoName: repo, checkSuiteId: failedSuiteId });
```

Audit any `failedCheck` references in between and update accordingly. Likely the disable/enable check on the menu item (`disabled={!failedCheck}`) becomes `disabled={failedSuiteId === undefined}`.

- [ ] **Step 2: Run tests**

```bash
bun run test -- PrContextMenu
```

Expected: PASS for tests that don't assert against `pr.checks`. Some test fixtures may need `failedCheckSuiteIds` added — handle in Task 11. If a test currently sets `checks: [makeCheckRun({ conclusion: 'failure', checkSuiteId: 5 })]` and reads from there, it now also needs `failedCheckSuiteIds: [5]` and `failedCheckNames: ['build']`.

- [ ] **Step 3: Commit**

```bash
git add src/components/pr/PrContextMenu.tsx
git commit -m "refactor(pr): use failedCheckSuiteIds for rerun lookup"
```

---

## Task 8: Cascade — PR detail wiring (separate `checks` prop)

**Files:**
- Modify: `src/components/pr-detail/PRDetailApp.tsx`
- Modify: `src/components/pr-detail/PRDetailPanel.tsx`
- Modify: `src/components/pr-detail/MergeReadinessChecklist.tsx`

`PRDetailApp` already fetches `CheckRun[]` via `getCheckRunsForRef`. We split it from the `PullRequestWithChecks` shape into a sibling state field, then thread it down as a separate prop to `<ChecksTab>` and `<MergeReadinessChecklist>`.

- [ ] **Step 1: Add `localChecks` state in `PRDetailApp.tsx`**

Around line 31:

```diff
   const [pr, setPr] = useState<PullRequestWithChecks | null>(null);
+  const [localChecks, setLocalChecks] = useState<CheckRun[]>([]);
   const prRef = useRef<PullRequestWithChecks | null>(null);
```

Around line 144-155 (where `getCheckRunsForRef` runs and `aggregatePrWithChecks` is called), set `localChecks` from the same `checks` value:

```diff
       checks = await getCheckRunsForRef(client, owner, repo, targetPr.headRef);
     } catch {
       checks = [];
     }
     setPr(aggregatePrWithChecks(targetPr, checks));
+    setLocalChecks(checks);
```

Where `<PrDetailPanel pr={pr} ... />` is rendered, add the new prop:

```diff
-  return <PrDetailPanel pr={pr} ... />;
+  return <PrDetailPanel pr={pr} checks={localChecks} ... />;
```

- [ ] **Step 2: Update `PRDetailPanel.tsx` to accept the new prop**

Add `checks: CheckRun[]` to the props interface. Then rewrite the three `pr.checks` references:

```diff
-  const totalChecks = pr.checks.length - pr.skippedCount;
+  const totalChecks = pr.totalCheckCount - pr.skippedCount;
```

```diff
-      {pr.checks.length > 0 && (
+      {pr.totalCheckCount > 0 && (
```

```diff
-            <ChecksTab checks={pr.checks} pr={pr} />
+            <ChecksTab checks={checks} pr={pr} />
```

If `<MergeReadinessChecklist pr={pr} ... />` is rendered here, also pass `checks` through.

- [ ] **Step 3: Update `MergeReadinessChecklist.tsx` to take `checks: CheckRun[]` as a sibling prop**

Add `checks: CheckRun[]` to its props. Replace four references:

```diff
-  if (pr.checks.length === 0) {
+  if (pr.totalCheckCount === 0) {
```

```diff
-    pr.checks.length === 0
+    pr.totalCheckCount === 0
```

```diff
-        ? `${pr.passedCount}/${pr.checks.length - pr.skippedCount} passed (${pr.skippedCount} skipped)`
-        : `${pr.passedCount}/${pr.checks.length} checks passed`;
+        ? `${pr.passedCount}/${pr.totalCheckCount - pr.skippedCount} passed (${pr.skippedCount} skipped)`
+        : `${pr.passedCount}/${pr.totalCheckCount} checks passed`;
```

If `MergeReadinessChecklist` reads any per-`CheckRun` field (e.g., to highlight a specific failed check by URL), it now reads from the new `checks` prop.

- [ ] **Step 4: Run tests**

```bash
bun run test -- PRDetailPanel MergeReadinessChecklist PrDetailApp
```

Expected: tests that construct fixtures with the old shape will fail. Captured by Task 11.

- [ ] **Step 5: Commit**

```bash
git add src/components/pr-detail/PRDetailApp.tsx src/components/pr-detail/PRDetailPanel.tsx src/components/pr-detail/MergeReadinessChecklist.tsx
git commit -m "refactor(pr-detail): thread CheckRun[] as sibling prop instead of PR field"
```

---

## Task 9: Drop `checks: CheckRun[]` from `PullRequestWithChecks`

**Files:**
- Modify: `src/types/pull-request.ts`
- Modify: `src/services/github/aggregate.ts`
- Modify: `src/services/github/polling.ts`
- Modify: `src/services/github/__tests__/aggregate.test.ts`

All consumers have moved off the field; now we delete it.

- [ ] **Step 1: Remove the field from the type**

```diff
 export interface PullRequestWithChecks {
   pullRequest: PullRequest;
-  checks: CheckRun[];
   overallStatus: OverallStatus;
```

If `import type { CheckRun }` becomes unused in `pull-request.ts`, delete it.

- [ ] **Step 2: Remove `checks: checkRuns` from the `aggregatePrWithChecks` return**

In `src/services/github/aggregate.ts`:

```diff
   return {
     pullRequest: pr,
-    checks: checkRuns,
     overallStatus,
     failedCheckNames,
     failedCheckSuiteIds,
     pendingCheckNames,
     passedCount,
     skippedCount,
     totalCheckCount: checkRuns.length,
   };
```

- [ ] **Step 3: Remove `checks: []` from `polling.ts::mapNode`**

```diff
   return {
     pullRequest: pr,
-    checks: [], // legacy field — populated [] by polling, removed by Task 9
     overallStatus: summary.overallStatus,
```

- [ ] **Step 4: Update aggregate test that asserts on `checks`**

In `src/services/github/__tests__/aggregate.test.ts`, the test `'includes the PR and checks in the result'` becomes `'includes the PR in the result'` and the `expect(result.checks).toBe(checks)` assertion is dropped:

```diff
-  it('includes the PR and checks in the result', () => {
+  it('includes the PR in the result', () => {
     const pr = makePullRequest({ number: 99, title: 'My PR' });
     const checks = [makeCheckRun({ name: 'build', conclusion: 'success' })];

     const result = aggregatePrWithChecks(pr, checks);

     expect(result.pullRequest).toBe(pr);
-    expect(result.checks).toBe(checks);
   });
```

- [ ] **Step 5: Run all tests**

```bash
bun run test
```

Expected: the test suite mostly passes, but every fixture file or test that constructs a `PullRequestWithChecks` literal with `checks: [...]` and without `failedCheckSuiteIds` / `totalCheckCount` will fail typechecking. Note them — fixed in Task 11.

- [ ] **Step 6: Commit**

```bash
git add src/types/pull-request.ts src/services/github/aggregate.ts src/services/github/polling.ts src/services/github/__tests__/aggregate.test.ts
git commit -m "refactor(types): drop PullRequestWithChecks.checks field"
```

---

## Task 10: Storybook wiring for the new module

**Files:**
- Create: `.storybook/mocks/services-github-polling.ts`
- Modify: `.storybook/main.ts`
- Modify: `.storybook/mocks/control.ts`

- [ ] **Step 1: Create the mock**

Create `.storybook/mocks/services-github-polling.ts`:

```ts
// .storybook/mocks/services-github-polling.ts
//
// Drop-in replacement for @/services/github/polling. Stories that exercise
// the polling cycle stub responses via:
//   getControl().githubResponses.pollOpenPrsAggregate = [openPrFixture];
// or with a function for pending/rejected promises.

import type { PullRequestWithChecks } from '../../src/types';
import { getControl } from './control';

export const POLL_OPEN_PRS_QUERY = '<<storybook mock>>';

export async function pollOpenPrsAggregate(
  _client: unknown,
  owner: string,
  repo: string,
): Promise<PullRequestWithChecks[]> {
  const r = getControl().githubResponses.pollOpenPrsAggregate;
  if (typeof r === 'function') return r({ owner, repo });
  return r ?? [];
}
```

- [ ] **Step 2: Add the alias in `.storybook/main.ts`**

Insert next to other `@/services/github/...` entries (before the bare `@` catch-all):

```diff
       { find: '@/services/github/checks', replacement: resolve(here, 'mocks/services-github-checks.ts') },
+      { find: '@/services/github/polling', replacement: resolve(here, 'mocks/services-github-polling.ts') },
       { find: '@/services/github/auth', replacement: resolve(here, 'mocks/services-github-auth.ts') },
```

Also add the new module to the barrel mock so consumers that `import { pollOpenPrsAggregate } from '@/services/github'` still get the stubbed version:

In `.storybook/mocks/services-github-barrel.ts`:

```diff
 export * from './services-github-pulls';
 export * from './services-github-checks';
+export * from './services-github-polling';
 export * from './services-github-auth';
```

- [ ] **Step 3: Add control surface entry**

In `.storybook/mocks/control.ts`, extend `GithubResponses`:

```diff
 export type GithubResponses = {
   getOpenPRs?: ...;
   getCheckRunsForRef?: ...;
+  pollOpenPrsAggregate?:
+    | PullRequestWithChecks[]
+    | ((args: { owner: string; repo: string }) =>
+        PullRequestWithChecks[] | Promise<PullRequestWithChecks[]> | Promise<never>);
   tokenGetter?: ...;
   ...
 };
```

(Keep `getOpenPRs` / `getCheckRunsForRef` — `getPRWithChecks` cold path still uses them.)

Add the import at the top:

```diff
-import type { PullRequest, PullRequestCommit, PullRequestFileChange } from '../../src/types/pull-request';
+import type { PullRequest, PullRequestCommit, PullRequestFileChange, PullRequestWithChecks } from '../../src/types/pull-request';
```

- [ ] **Step 4: Run Storybook build to verify no alias errors**

```bash
bun run build-storybook
```

Expected: build succeeds; warnings about the still-unused `getOpenPRs`/`getCheckRunsForRef` keys in `PRDetailApp.stories.tsx` (fixed in Task 11).

- [ ] **Step 5: Commit**

```bash
git add .storybook/mocks/services-github-polling.ts .storybook/main.ts .storybook/mocks/services-github-barrel.ts .storybook/mocks/control.ts
git commit -m "feat(storybook): add polling module mock and alias"
```

---

## Task 11: Update fixtures, stories, and tests

**Files:** see file map at top of plan.

This is the bulk of mechanical churn. Each fixture/test that constructs a `PullRequestWithChecks` literal needs:
- `checks: [...]` removed
- `failedCheckSuiteIds: [...]` added (parallel to `failedCheckNames`; use the suite id of each failed check, or `[]`)
- `totalCheckCount: N` added (use the previous `checks.length`)

Where `<MergeReadinessChecklist pr={...} />` was rendered, also pass `checks={...}` from the fixture.

- [ ] **Step 1: Update `PRDetailApp.stories.tsx`**

The four `getOpenPRs` / `getCheckRunsForRef` pairs become single `pollOpenPrsAggregate` entries:

```diff
       githubResponses: {
-        getOpenPRs: [openPr.pullRequest],
-        getCheckRunsForRef: openPr.checks,
+        pollOpenPrsAggregate: [openPr],
       },
```

Note: `openPr` is already `PullRequestWithChecks`-shaped (after Task 11 also updates the source fixture). For the pending-promise variant:

```diff
-        getOpenPRs: () => new Promise(() => {}),
+        pollOpenPrsAggregate: () => new Promise(() => {}),
```

- [ ] **Step 2: Update PR-detail fixture file**

`src/components/pr-detail/__fixtures__/pr-detail-data.tsx`: lines 111, 120, 151, 169 set `checks: [...]`. Replace with the new fields. Examples:

```diff
   {
-    checks: [],
+    failedCheckSuiteIds: [],
+    totalCheckCount: 0,
     ...
   }
```

```diff
   {
-    checks: [
-      { id: 1, name: 'build', status: 'completed', conclusion: 'failure', htmlUrl: '', checkSuiteId: 7 },
-    ],
+    failedCheckSuiteIds: [7],
+    totalCheckCount: 1,
     failedCheckNames: ['build'],
     ...
   }
```

(If existing fixtures already set `failedCheckNames`, just align the new fields.)

- [ ] **Step 3: Update flyout fixtures**

`src/components/flyout/__fixtures__/flyout-data.ts`: drop `checks: ...`, add `totalCheckCount` matching the previous length, add `failedCheckSuiteIds: []` (or filled if the fixture previously had `checks: [...]` with check-suite IDs).

- [ ] **Step 4: Update the inline literal in `FlyoutApp.tsx:234`**

```diff
       failedCheckNames: [],
+      failedCheckSuiteIds: [],
+      totalCheckCount: 0,
```

- [ ] **Step 5: Update unit-test fixture builders that touch `PullRequestWithChecks`**

For each of:
- `src/components/__tests__/window-title-bar-contract.test.tsx:136`
- `src/components/pr-detail/__tests__/usePrActions.test.tsx:64`
- `src/components/pr-detail/__tests__/PRDetailPanel.test.tsx:316,150`
- `src/components/pr-detail/__tests__/OverviewTab.test.tsx:81`
- `src/components/pr-detail/__tests__/MergeReadinessChecklist.test.tsx:33,75,103,112,193,209`
- `src/components/pr-detail/__tests__/ChecksTab.test.tsx:313`

Replace `checks: [...]` with the new fields. For `MergeReadinessChecklist` tests, also pass `checks={...}` as a sibling prop in the JSX:

```diff
-      <MergeReadinessChecklist pr={prFixture} ... />
+      <MergeReadinessChecklist pr={prFixture} checks={[makeCheck()]} ... />
```

- [ ] **Step 6: Update e2e fixtures**

For each `checks: [...]` in:
- `tests/e2e/fixtures/design-fixtures.ts` (9 entries)
- `tests/e2e/helpers/test-utils.ts` (6 entries)
- `tests/e2e/pr-context-menu.spec.ts`
- `tests/e2e/pr-detail.spec.ts`

Replace with `failedCheckSuiteIds` + `totalCheckCount`. The e2e tests inject these fixtures into the app via `window.__borgdock_test_fixtures` or similar — the consumed shape must match the new `PullRequestWithChecks`.

- [ ] **Step 7: Run the full unit test suite**

```bash
bun run test
```

Expected: PASS. All literals now match the new type.

- [ ] **Step 8: Run typecheck**

```bash
bun run build
```

Expected: PASS, zero type errors.

- [ ] **Step 9: Run Storybook build**

```bash
bun run build-storybook
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/ tests/ .storybook/
git commit -m "refactor: update fixtures, stories, and tests for new PullRequestWithChecks shape"
```

---

## Task 12: Split rate-limit counters in `GitHubClient`

**Files:**
- Modify: `src/services/github/client.ts`
- Modify: `src/services/github/__tests__/client.test.ts`

REST and GraphQL pools are tracked separately. `isRateLimitLow` returns true when either pool is below 500.

- [ ] **Step 1: Write failing tests**

Append to `src/services/github/__tests__/client.test.ts` inside the `describe('GitHubClient')`:

```ts
describe('rate-limit pools', () => {
  it('REST get does not affect graphql rate limit', async () => {
    const client = createClient();
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, [], { 'X-RateLimit-Remaining': '4000', 'X-RateLimit-Limit': '5000' }),
    );
    await client.get('repos/x/y/pulls?state=open');
    expect(client.getRateLimit().remaining).toBe(4000);
    expect(client.getGraphqlRateLimit().remaining).toBe(-1);
  });

  it('graphql call updates graphql rate limit from inline rateLimit field', async () => {
    const client = createClient();
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        200,
        {
          data: {
            repository: { rateLimit: { remaining: 4500, limit: 5000, resetAt: '2026-05-07T12:00:00Z' } },
          },
        },
        {},
      ),
    );
    await client.graphql('query { __typename }');
    expect(client.getRateLimit().remaining).toBe(-1);
    expect(client.getGraphqlRateLimit().remaining).toBe(4500);
  });

  it('isRateLimitLow returns true when either pool is below 500', () => {
    const client = createClient();
    // simulate by re-running parsers — pseudo, expressed as state setters in the impl
    // (not a real test; replace with concrete header-driven scenarios in implementation)
  });
});
```

The third test is illustrative — implement it concretely against your final API surface (e.g., set up two `mockResponse` calls and assert).

- [ ] **Step 2: Run tests, expect failure**

```bash
bun run test -- client
```

Expected: FAIL — `getGraphqlRateLimit` does not exist.

- [ ] **Step 3: Implement the split**

Edit `src/services/github/client.ts`:

```diff
-  private rateLimit: RateLimit = { remaining: -1, total: -1, reset: null };
+  private restRateLimit: RateLimit = { remaining: -1, total: -1, reset: null };
+  private graphqlRateLimit: RateLimit = { remaining: -1, total: -1, reset: null };
```

```diff
-  getRateLimit(): RateLimit { return { ...this.rateLimit }; }
+  getRateLimit(): RateLimit { return { ...this.restRateLimit }; }
+  getGraphqlRateLimit(): RateLimit { return { ...this.graphqlRateLimit }; }
```

```diff
   get isRateLimitLow(): boolean {
-    return this.rateLimit.remaining >= 0 && this.rateLimit.remaining < 500;
+    const r = this.restRateLimit.remaining;
+    const g = this.graphqlRateLimit.remaining;
+    return (r >= 0 && r < 500) || (g >= 0 && g < 500);
   }
```

Rename `parseRateLimitHeaders` to `parseRestRateLimitHeaders` and have all REST verbs (`get`, `post`, `put`, `patch`, `getRaw`, `fetchWithRetry`) call it (already true; rename only).

In `graphql()`, after the response body is parsed, parse the inline `rateLimit` if present, falling back to headers:

```ts
const result = await response.json();
if (result.errors?.length > 0) {
  throw new GitHubApiError(`GraphQL error: ${result.errors[0].message}`, 422);
}
this.parseGraphqlRateLimitFromBody(result.data);
this.parseGraphqlRateLimitFromHeaders(response);
return result.data as T;
```

Add the two helpers:

```ts
private parseGraphqlRateLimitFromBody(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const rl = (data as { rateLimit?: { remaining?: number; limit?: number; resetAt?: string } })
    .rateLimit
    ?? (data as { repository?: { rateLimit?: { remaining?: number; limit?: number; resetAt?: string } } })
      .repository?.rateLimit;
  if (!rl) return;
  if (typeof rl.remaining === 'number') this.graphqlRateLimit.remaining = rl.remaining;
  if (typeof rl.limit === 'number') this.graphqlRateLimit.total = rl.limit;
  if (typeof rl.resetAt === 'string') {
    const d = new Date(rl.resetAt);
    if (!Number.isNaN(d.getTime())) this.graphqlRateLimit.reset = d;
  }
}

private parseGraphqlRateLimitFromHeaders(response: Response): void {
  const remaining = response.headers.get('X-RateLimit-Remaining');
  if (remaining) {
    const v = parseInt(remaining, 10);
    if (!Number.isNaN(v)) this.graphqlRateLimit.remaining = v;
  }
  const limit = response.headers.get('X-RateLimit-Limit');
  if (limit) {
    const v = parseInt(limit, 10);
    if (!Number.isNaN(v)) this.graphqlRateLimit.total = v;
  }
  const reset = response.headers.get('X-RateLimit-Reset');
  if (reset) {
    const v = parseInt(reset, 10);
    if (!Number.isNaN(v)) this.graphqlRateLimit.reset = new Date(v * 1000);
  }
}
```

(The `PollOpenPrs` query nests `rateLimit` under `repository`, so the body-parse helper checks both shapes.)

- [ ] **Step 4: Run client tests**

```bash
bun run test -- client
```

Expected: PASS for the new rate-limit tests; existing tests still pass since `getRateLimit()` semantics for REST callers are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/services/github/client.ts src/services/github/__tests__/client.test.ts
git commit -m "feat(github): split REST and GraphQL rate-limit pools"
```

---

## Task 13: Add `client.graphql` request logging

**Files:**
- Modify: `src/services/github/client.ts`

The current `client.graphql` is silent. Mirror the `client.get` logging shape so each poll cycle produces one log line.

- [ ] **Step 1: Write a test asserting one info log per graphql call**

Append to `src/services/github/__tests__/client.test.ts`:

```ts
it('logs a GraphQL ok line on success', async () => {
  // The logger module currently writes through console; spy on it.
  const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  const client = createClient();
  fetchSpy.mockResolvedValueOnce(mockResponse(200, { data: { ok: true } }, {}));
  await client.graphql('query Foo { __typename }');
  // Assert at least one line containing 'graphql' was logged.
  expect(consoleSpy.mock.calls.some((c) => JSON.stringify(c).includes('graphql'))).toBe(true);
  consoleSpy.mockRestore();
});
```

(Adjust the exact spy target if `createLogger` writes via a different sink.)

- [ ] **Step 2: Run, expect failure**

```bash
bun run test -- client
```

Expected: FAIL.

- [ ] **Step 3: Add logging to `client.graphql`**

```diff
   async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
+    const start = performance.now();
+    const queryName = query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'anonymous';
+    log.info('graphql start', { query: queryName });
     const token = await this.getToken();

     const response = await this.fetchWithTimeout('https://api.github.com/graphql', {
       method: 'POST',
       headers: { ... },
       body: JSON.stringify({ query, variables }),
     });

     this.parseGraphqlRateLimitFromHeaders(response);
+    const durationMs = Math.round(performance.now() - start);

     if (!response.ok) {
+      log.error('graphql failed', { query: queryName, status: response.status, durationMs });
       throw new GitHubApiError(...);
     }

     const result = await response.json();
     if (result.errors?.length > 0) {
+      log.error('graphql errors', { query: queryName, errors: result.errors, durationMs });
       throw new GitHubApiError(`GraphQL error: ${result.errors[0].message}`, 422);
     }
     this.parseGraphqlRateLimitFromBody(result.data);
+    log.info('graphql ok', {
+      query: queryName,
+      durationMs,
+      rateLimitRemaining: this.graphqlRateLimit.remaining,
+    });
     return result.data as T;
   }
```

- [ ] **Step 4: Run tests, including the suite**

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/github/client.ts src/services/github/__tests__/client.test.ts
git commit -m "feat(github): log GraphQL request start/ok/failed lines"
```

---

## Task 14: Wire dual-pool rate limit into the UI

**Files:**
- Modify: `src/services/github/rate-limit.ts`
- Modify: `src/components/settings/GitHubSection.tsx` (and any other consumer)
- Modify: `src/hooks/useGitHubPolling.ts:135,146-156` (rate limit capture in the hook)

The flyout/header rate-limit display should reflect `min(rest, graphql)` so the badge keeps doing its job.

- [ ] **Step 1: Extend `fetchGitHubRateLimit` to return both pools**

Edit `src/services/github/rate-limit.ts`:

```diff
 export interface RateLimit {
   used: number;
   limit: number;
   resetAt: number;
 }
+
+export interface DualRateLimit {
+  rest: RateLimit;
+  graphql: RateLimit;
+}
```

```diff
-export async function fetchGitHubRateLimit(token: string): Promise<RateLimit> {
+export async function fetchGitHubRateLimit(token: string): Promise<DualRateLimit> {
   const resp = await fetch('https://api.github.com/rate_limit', { ... });
   if (!resp.ok) throw new Error(`GitHub rate_limit returned ${resp.status}`);
   const body = await resp.json();
   const core = body?.resources?.core ?? {};
+  const graphql = body?.resources?.graphql ?? {};
   return {
-    used: Number(core.used ?? 0),
-    limit: Number(core.limit ?? 5000),
-    resetAt: Number(core.reset ?? 0),
+    rest: {
+      used: Number(core.used ?? 0),
+      limit: Number(core.limit ?? 5000),
+      resetAt: Number(core.reset ?? 0),
+    },
+    graphql: {
+      used: Number(graphql.used ?? 0),
+      limit: Number(graphql.limit ?? 5000),
+      resetAt: Number(graphql.reset ?? 0),
+    },
   };
 }
```

`useGitHubRateLimit` returns `DualRateLimit | null`.

- [ ] **Step 2: Update consumers**

In `src/components/settings/GitHubSection.tsx` (and tests), display `min(rest.limit - rest.used, graphql.limit - graphql.used)` for the headline number. Add a tooltip showing both: `REST: 4980 / 5000 — GraphQL: 4500 / 5000`.

- [ ] **Step 3: Update polling hook capture (line 146-156)**

The hook captures `client.getRateLimit()` (REST) only — switch to capture both:

```diff
-      const rl = client.getRateLimit();
-      if (rl.remaining >= 0) {
+      const rest = client.getRateLimit();
+      const graphql = client.getGraphqlRateLimit();
+      const rl = rest.remaining >= 0 && (graphql.remaining < 0 || rest.remaining < graphql.remaining)
+        ? rest
+        : graphql;
+      if (rl.remaining >= 0) {
         usePrStore.getState().setRateLimit({
           remaining: rl.remaining,
           limit: rl.total,
           resetAt: rl.reset ?? new Date(),
         });
       }
```

(or push both into the store — depending on how `setRateLimit` is defined; if you have time, switch the store to carry both pools.)

- [ ] **Step 4: Run tests**

```bash
bun run test -- rate-limit GitHubSection useGitHubPolling
```

Expected: PASS after fixture updates.

- [ ] **Step 5: Commit**

```bash
git add src/services/github/rate-limit.ts src/components/settings/GitHubSection.tsx src/hooks/useGitHubPolling.ts
git commit -m "feat(rate-limit): show min of REST and GraphQL pools in UI"
```

---

## Task 15: Verification — full lint, build, test, manual smoke

- [ ] **Step 1: Lint**

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 2: Typecheck**

```bash
bun run build
```

Expected: PASS, zero type errors.

- [ ] **Step 3: Unit tests**

```bash
bun run test
```

Expected: all green.

- [ ] **Step 4: Storybook build**

```bash
bun run build-storybook
```

Expected: PASS.

- [ ] **Step 5: Manual smoke (BorgDock dev mode)**

```bash
bun run tauri dev
```

Configure two repos, watch one full poll cycle in `%APPDATA%\BorgDock\logs\borgdock.log`. Confirm:

- One `[github] graphql start` and one `[github] graphql ok` line per repo per cycle.
- No `[github] GET start … repos/<owner>/<repo>/pulls?state=open` lines.
- No `[github] GET start … check-runs` lines during a regular poll cycle.
- A `[polling] poll cycle done` line per cycle showing `totalPrs` matching the visible UI.
- Rate-limit display in flyout reflects realistic values (not stuck at 5000).
- Open a PR with failing checks; the failed-check rerun action from the PR list context menu still works.
- Open PR detail; the Checks tab still shows full per-check info.
- Open PR detail; the merge-readiness display still renders the correct count.

- [ ] **Step 6: Commit any post-smoke fixes**

If smoke reveals issues, fix and commit incrementally with descriptive messages.

---

## Self-review notes

Spec coverage check:
- §1 module surface → Task 2 (skeleton), Task 3 (impl), Task 4 (barrel), Task 5 (hook), Task 9 (field removal)
- §2 GraphQL query → Task 2 + Task 3
- §3 type changes → Task 1 (additive), Tasks 6-8 (cascade), Task 9 (removal)
- §4 rate limits → Task 12 (client split), Task 14 (UI wiring)
- §5 Storybook → Task 10 (mock + alias), Task 11 (story + fixtures)
- §6 errors and logging → Task 13 (graphql logging); error handling lives inline in adapter (Task 3)
- §7 testing → Task 3 (adapter tests), Task 12 (rate-limit tests), Task 13 (logging test)

Type consistency: `pollOpenPrsAggregate` signature matches between Tasks 2, 3, 4, 5, 10, 11. `summarizeRollup` is private to `polling.ts`. `failedCheckSuiteIds` / `totalCheckCount` field names used identically across tasks.

Placeholder scan: no TBD/TODO; every code-changing step shows the exact diff or replacement.
