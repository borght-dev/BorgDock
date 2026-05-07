# GitHub Polling — REST → GraphQL migration

**Status:** design • **Date:** 2026-05-07 • **Branch context:** `fix/flyout-state-desync`

## Background

Each minute the GitHub polling loop fans out roughly **22 REST requests per repo**: 1 list call, 2 per open PR (detail + reviews), and 1 per open PR for `commits/<sha>/check-runs` (multi-page on busy repos). For a 7-PR repo that's `1 + 7×2 + 7 = 22` round trips, plus another list call for closed PRs on the slower cycle. The log file shows this as a steady stream of `[github] GET …` lines, each decrementing the REST rate-limit counter and re-running the ETag/cache plumbing per request.

GraphQL solves this directly: the same data is reachable in **one** query per repo per cycle. The transport already exists in this codebase — `GitHubClient.graphql()` is in production use by `reviewThreads.ts` and `mutations.ts::toggleDraft`.

## Goal

Cut the polling fan-out for **open PRs + their reviews + their check status** from ~22 REST calls per repo to **1 GraphQL call** per repo, without losing any field the PR list / flyout UI consumes.

Cold paths (PR detail tabs, single-PR refresh after a mutation, closed PR list, file/commit fetches, mutations) stay on REST. Their ETag caches keep working; they're not the source of the noise.

## Non-goals

- Migrating PR detail tabs (Files / Commits / Discussion / Checks) to GraphQL.
- ETag-equivalent caching for GraphQL (GitHub doesn't honor `If-None-Match` on the GraphQL endpoint; we accept a full payload per poll).
- Switching to GitHub's Events API as a polling tripwire.
- Backwards-compatibility shims. The repo has no external users yet; breaking type changes are acceptable.

## Design

### 1. Module surface

New module: `src/services/github/polling.ts`.

```ts
export async function pollOpenPrsAggregate(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<PullRequestWithChecks[]>
```

Single GraphQL query per call, returns the same `PullRequestWithChecks[]` the polling hook produces today (with one field removed — see §3).

**Unchanged surfaces:**

- `GitHubClient.graphql()` — already wired, already used.
- `services/github/pulls.ts::getOpenPRs` — REST, retained for cold-path callers (`getPRWithChecks`).
- `services/github/checks.ts::getCheckRunsForRef` — REST, retained for cold-path callers (PR detail Checks tab, `getPRWithChecks`).

**Changed surfaces:**

- `src/hooks/useGitHubPolling.ts` — replaces the two-step `getOpenPRs` + `Promise.allSettled(getCheckRunsForRef)` fan-out with one `pollOpenPrsAggregate(client, repo.owner, repo.name)` call.
- `src/types/PullRequestWithChecks` — drops `checks: CheckRun[]` (see §3).
- `src/services/github/aggregate.ts::aggregatePrWithChecks` — its callers change shape (see §3).

**Pagination posture.** GraphQL caps `pullRequests(first: 100)` at 100 and `statusCheckRollup.contexts(first: 100)` at 100. Today's REST polling silently caps at 30 PRs per repo (the default `per_page` for `/pulls?state=open`). The GraphQL cap is therefore a strict improvement; we don't paginate. If `pullRequests.totalCount > 100`, we log a single warning per cycle per repo and continue with the truncated set.

### 2. The query

```graphql
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
        mergeable                       # MERGEABLE | CONFLICTING | UNKNOWN
        createdAt
        updatedAt
        closedAt
        mergedAt
        additions
        deletions
        changedFiles
        author { login ... on User { avatarUrl } ... on Bot { avatarUrl } }
        baseRefName
        headRefName
        headRefOid
        labels(first: 20)         { nodes { name } }
        reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } ... on Team { name } } } }
        commits(last: 1) {
          nodes { commit {
            statusCheckRollup {
              state               # SUCCESS | FAILURE | PENDING | EXPECTED | ERROR
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun     { name status conclusion }
                  ... on StatusContext { context state }
                }
              }
            }
          } }
        }
        latestReviews(first: 50) {
          nodes { state author { login } }
        }
        comments      { totalCount }
        reviewThreads { totalCount }
        commits       { totalCount }
      }
    }
    rateLimit { remaining limit resetAt cost }
  }
}
```

**Response → existing-types adapter** (`mapResponseToPullRequestWithChecks`):

| Existing field | Source |
|---|---|
| `mergeable: boolean \| undefined` | `MERGEABLE → true`, `CONFLICTING → false`, `UNKNOWN → undefined` |
| `reviewStatus` | feed `latestReviews.nodes` (mapped to the `{state,user.login}` shape) into existing `aggregateReviewStatus` |
| `commentCount` | `comments.totalCount + reviewThreads.totalCount` |
| `commitCount` | `commits.totalCount` |
| `requestedReviewers` | flatten reviewer logins (User) and team names (Team) |
| `overallStatus` | derive from `statusCheckRollup.state` directly |
| `failedCheckNames` / `pendingCheckNames` / `passedCount` / `skippedCount` | walk `statusCheckRollup.contexts.nodes`, branching on `__typename` |

**Edge cases handled in the adapter:**

- `statusCheckRollup === null` (brand-new PR with no checks recorded yet) → `overallStatus = 'gray'`, all check arrays empty.
- `commits.last(1).nodes[]` empty → same as `statusCheckRollup === null`.
- Mixed `CheckRun` and `StatusContext` contexts → both produce names (`name` and `context` respectively) and contribute to the failed/pending/passed/skipped buckets.

### 3. Type changes

`PullRequestWithChecks` loses its `checks: CheckRun[]` field. Across the codebase `pr.checks` is read in 8 places (verified by grep on `\.checks\b` across `src/`):

- **As a count (7 sites)** — `useFlyoutSync.ts:67`, `MultiSignalIndicator.tsx:33`, `PRDetailPanel.tsx:272,438`, `MergeReadinessChecklist.tsx:47,58,61,62`, `merge-score.ts:5`. All of these read `pr.checks.length` (sometimes minus `skippedCount`). Replaceable with a derived field.
- **For a failing-check suite ID** — `PrContextMenu.tsx:113-170` does `pr.checks.find(failed)` to pick a failed check's `checkSuiteId` for the "rerun checks" action. Replaceable with a parallel array of failed-check suite IDs.
- **As Checks-tab data source** — `PRDetailPanel.tsx:487` does `<ChecksTab checks={pr.checks} pr={pr} />`. The Checks tab is the only consumer that needs the full per-`CheckRun` data (`id`, `name`, `status`, `conclusion`, `startedAt`, `completedAt`, `htmlUrl`). Today, `PRDetailApp.tsx:144-155` *already* fetches this via `getCheckRunsForRef` + `aggregatePrWithChecks` — so the Checks tab gets its data from a local fetch, not from the polling output. Restructure: `PRDetailApp` keeps `checks: CheckRun[]` as a separate state field (no longer folded into the `PullRequestWithChecks` shape) and threads it as a sibling prop next to `pr` down through `PRDetailPanel` to `ChecksTab` / `MergeReadinessChecklist` (which also benefits from access to the raw checks for its merge-readiness display).

**New fields on `PullRequestWithChecks`:**

```diff
 export interface PullRequestWithChecks {
   pullRequest: PullRequest;
-  checks: CheckRun[];
   overallStatus: OverallStatus;
   failedCheckNames: string[];
+  failedCheckSuiteIds: number[];
   pendingCheckNames: string[];
   passedCount: number;
   skippedCount: number;
+  totalCheckCount: number;
 }
```

`failedCheckSuiteIds` is parallel to `failedCheckNames`: same length, same order. Each entry is the `check_suite.id` (REST) or `checkSuite.databaseId` (GraphQL) of the failed check. Surfaced to enable `PrContextMenu`'s rerun action without exposing full `CheckRun` shape.

`totalCheckCount` is the size of the rollup's contexts list (or REST `CheckRun[]` length on the cold path).

**GraphQL query addendum.** The `statusCheckRollup.contexts.nodes` `... on CheckRun` selection set extends to fetch the suite's database ID:

```graphql
... on CheckRun { name status conclusion checkSuite { databaseId } }
```

`StatusContext` (legacy commit statuses) doesn't have a check suite — those failed contexts contribute no entry to `failedCheckSuiteIds`, so `failedCheckSuiteIds.length` may be ≤ `failedCheckNames.length`. `PrContextMenu`'s rerun handler already gates on `failedCheckSuiteIds[0] !== undefined`, so this is fine.

**Two summarizers — `summarizeRollup` (GraphQL) and `aggregatePrWithChecks` (REST):**

- `polling.ts::summarizeRollup(rollup: GqlStatusCheckRollup | null)` returns `{ overallStatus, failedCheckNames, failedCheckSuiteIds, pendingCheckNames, passedCount, skippedCount, totalCheckCount }`. Used only by the GraphQL adapter.
- `aggregate.ts::aggregatePrWithChecks(pr, checks: CheckRun[])` is rewritten to return `PullRequestWithChecks` without assigning a `checks` field. Derives the same seven summary fields from REST `CheckRun[]` (failedCheckSuiteIds via `c.checkSuiteId`).
- `aggregate.ts::computeOverallStatus(checks: CheckRun[])` stays as-is.

**Call-site cascade** (mechanical, no logic changes):

| File:line | Before | After |
|---|---|---|
| `useFlyoutSync.ts:67` | `totalChecks: pr.checks.length` | `totalChecks: pr.totalCheckCount` |
| `MultiSignalIndicator.tsx:33` | `pr.checks.length === 0` | `pr.totalCheckCount === 0` |
| `PrContextMenu.tsx:113-170` | `const failedCheck = pr.checks.find(...); ... failedCheck.checkSuiteId` | `const failedSuiteId = pr.failedCheckSuiteIds[0]` |
| `PRDetailPanel.tsx:272` | `pr.checks.length - pr.skippedCount` | `pr.totalCheckCount - pr.skippedCount` |
| `PRDetailPanel.tsx:438` | `pr.checks.length > 0` | `pr.totalCheckCount > 0` |
| `PRDetailPanel.tsx:487` | `<ChecksTab checks={pr.checks} pr={pr} />` | `<ChecksTab checks={localChecks} pr={pr} />` (new sibling prop) |
| `MergeReadinessChecklist.tsx:47,58,61,62` | `pr.checks.length` | `pr.totalCheckCount`; if MergeReadinessChecklist needs the raw `CheckRun[]`, accept a sibling `checks: CheckRun[]` prop |
| `merge-score.ts:5` | `pr.checks.length - pr.skippedCount` | `pr.totalCheckCount - pr.skippedCount` |
| `PRDetailApp.tsx:144-155` | `setPr(aggregatePrWithChecks(pr, checks))` | `setPr(aggregatePrWithChecks(pr, checks)); setLocalChecks(checks)` (separate state) |

### 4. Rate-limit handling

REST and GraphQL have separate 5000/h pools on GitHub. Today `GitHubClient.parseRateLimitHeaders` is shared between both transports — after this migration, GraphQL responses would clobber the REST counter on every poll cycle and the displayed value would become meaningless.

**Changes in `client.ts`:**

- Split the single `rateLimit` field into `restRateLimit` and `graphqlRateLimit`.
- `getRateLimit()` keeps its existing behavior (returns REST). Add `getGraphqlRateLimit()`.
- `isRateLimitLow` returns true if **either** pool is below 500 remaining.
- REST verbs (`get/post/put/patch/getRaw`) use a renamed `parseRestRateLimitHeaders`.
- `graphql()` first tries to read `data.rateLimit { remaining limit resetAt }` from the response body (the `PollOpenPrs` query requests it inline), and falls back to header parsing if absent.

**UI implication.** The flyout/header rate-limit display reads from `getRateLimit()` (REST) today. After migration, REST `remaining` will sit near 5000 indefinitely while GraphQL `remaining` decrements with each poll. We change the display to show `min(restRemaining, graphqlRemaining)` with a tooltip exposing both. The badge's "low rate limit" warning uses `isRateLimitLow`, which now considers both pools.

`services/github/rate-limit.ts::fetchGitHubRateLimit` (the periodic `/rate_limit` poller) is extended to also pull `body.resources.graphql` so the rate-limit panel reflects truth even before the first GraphQL poll lands.

### 5. Storybook

Add one new module mock and rewire one existing story.

**New mock:** `.storybook/mocks/services-github-polling.ts`

```ts
import type { PullRequestWithChecks } from '../../src/types';
import { getControl } from './control';

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

**`.storybook/main.ts`:** add the alias entry next to the other GitHub aliases. Sub-module aliases must come before the bare-`@` catch-all (existing convention, documented in the file's comments).

```ts
{ find: '@/services/github/polling', replacement: resolve(here, 'mocks/services-github-polling.ts') },
```

**`.storybook/mocks/control.ts`:** add to `GithubResponses`:

```ts
pollOpenPrsAggregate?:
  | PullRequestWithChecks[]
  | ((args: { owner: string; repo: string }) =>
      PullRequestWithChecks[] | Promise<PullRequestWithChecks[]> | Promise<never>);
```

`getOpenPRs` and `getCheckRunsForRef` keys stay in `GithubResponses` because `getPRWithChecks` (the cold-path single-PR refresh) still drives REST through them.

**Story to update:** `src/components/pr-detail/PRDetailApp.stories.tsx` is the only story with `githubResponses.getOpenPRs` / `getCheckRunsForRef` references. Each `{ getOpenPRs: [pr], getCheckRunsForRef: checks }` pair becomes `{ pollOpenPrsAggregate: [openPr] }` where `openPr` is already `PullRequestWithChecks`-shaped. The pending-promise variant (`getOpenPRs: () => new Promise(() => {})`) becomes `pollOpenPrsAggregate: () => new Promise(() => {})`.

**Fixtures to update:** any `__fixtures__/*.ts` that constructs `PullRequestWithChecks` literals must drop the `checks: [...]` field. Verified candidates: `src/components/flyout/__fixtures__/flyout-data.ts`. Quick grep + delete.

### 6. Error handling and logging

**Error paths.** `client.graphql()` already throws `GitHubApiError` on HTTP failure and on non-empty `result.errors[]`. The polling hook's existing per-repo `try/catch` (`useGitHubPolling.ts:90`) already logs `poll: repo failed` and continues to the next repo, so no new error code path is added.

| Failure | Treatment |
|---|---|
| Network / auth / rate-limit failure | Bubbles up; existing per-repo catch handles it. |
| `data.repository === null` (lost access) | Surfaced via `result.errors[]`; `client.graphql()` throws; same path as network failure. |
| `statusCheckRollup === null` on a node | Adapter treats as `overallStatus = 'gray'`, empty arrays. |
| `pullRequests.totalCount > 100` | Single `log.warn` per repo per cycle: `"PR list truncated to 100; repo has N open PRs"`. No retry, no crash. |

**Logging changes.** Today's per-request log spam comes from `client.get`'s three lines (`GET start`, `GET ok`/`304 cached`/`GET failed`) firing for each of the ~22 calls per cycle. Two changes:

1. `client.graphql()` gains the same logging shape: `start` / `ok` / `failed` with `path: 'graphql'`, `query: 'PollOpenPrs'`, `durationMs`, `cost`, `rateLimitRemaining`. Single line per call.
2. The polling hook's existing `poll cycle start` / `poll: repo fetched` / `poll cycle done` lines are unchanged.

Net log volume per poll cycle, single repo: **3 lines** instead of ~25.

### 7. Testing

**Unit tests** for `polling.ts::pollOpenPrsAggregate` mock `client.graphql` and assert the response → type mapping for:

- Rollup `null` → `overallStatus = 'gray'`, empty arrays.
- Rollup with mixed `CheckRun` and `StatusContext` contexts (failed + pending + passing + skipped).
- `mergeable: UNKNOWN` → `pr.mergeable === undefined`.
- Draft PR (`isDraft: true`).
- Requested reviewers split across `User` and `Team` types.
- `pullRequests.totalCount > 100` → emits the truncation warning and returns 100 mapped PRs.
- `latestReviews.nodes` empty → `reviewStatus = 'none'`.

**Existing tests** for `aggregate.ts::computeOverallStatus` and `aggregateReviewStatus` keep passing — both functions still exist and are now consumed by both the REST and GraphQL paths.

**Manual verification** before close-out: run the app against the user's two configured repos, watch the log for one poll cycle, confirm the request count per cycle is `1 × repoCount` (plus ~1 closed-PR REST call on the slower cycle, unchanged), and confirm the flyout PR list still shows the expected `overallStatus` colors and `failedCheckNames`.

## Rollout

A single PR. Land in this order to keep each commit bisectable:

1. Add `polling.ts` + `summarizeRollup` + unit tests. Pure addition; no consumers.
2. Drop `checks: CheckRun[]` from `PullRequestWithChecks`. Fix `aggregate.ts::aggregatePrWithChecks` to no longer assign that field. Fix any fixture file that sets it. (Grep target: `\.checks` and `checks:` in `**/*.ts`/`**/*.tsx`.)
3. Update `getPRWithChecks` (cold-path single-PR refresh in `pulls.ts`) so its return shape matches the slimmed `PullRequestWithChecks`.
4. Switch `useGitHubPolling.ts` to call `pollOpenPrsAggregate`. Delete the per-PR `getCheckRunsForRef` fan-out from the polling hook (the function itself stays — Checks tab and `getPRWithChecks` still use it).
5. Update Storybook: new alias, new mock, new control-surface key, fix `PRDetailApp.stories.tsx`.
6. Split rate-limit counters in `client.ts`. Wire the UI display to `min(rest, graphql)`.
7. Add `client.graphql` logging.

Steps 1–4 leave the app working with the new transport. Steps 5–7 are polish that can land in the same PR or a follow-up.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| GraphQL query cost spikes against the 5000-point/h pool when many repos are configured | Query is a single repo per call; cost per call is bounded by `100 PRs × (50 reviews + 100 contexts + a handful of scalar fields)`. With the existing 60-second poll interval and 2 repos, well under the limit. The new rate-limit display surfaces the GraphQL pool, so a user with many repos sees the pressure. |
| Rollup contexts >100 on the head commit | Truncation warning logged; `failedCheckNames` is best-effort. In practice, a single commit rarely has >100 distinct contexts. |
| GraphQL schema field rename or type change upstream | Schema is stable; the fields used here have been on the PullRequest type for years. If GitHub deprecates one, the failure mode is a `result.errors[]` returned by `client.graphql()`, surfaced as a per-repo poll failure with full context in the log. |
| Cache lost: a poll cycle that returns the same data still pays full network bytes (no ETag) | Accepted. The win is round-trip count, not bytes. The poll loop already runs every 60s so the byte cost is bounded; the user's network is not a constraint. |

## Open questions

None.
