# Activity: since you last checked (issue #88)

Baseline: `origin/master` at `c90eb35c`, BorgDock 4.7.0. Paths are relative to `src/BorgDock.Tauri/`.

Decisions taken on 2026-10-26:

- Activity gets its own rail section. It goes last, so the keys of the existing sections stay the same. Workstreams took key `6` in 4.7.0, so Activity is key `7`. Focus gets a "Since you last checked" card. The rail, tray flyout and taskbar show the count of unread entries that need you.
- Phone. A thread opened in T3 on the phone marks its entries read on the laptop (T3's `lastVisitedAt`, verified, section 4.5). A webhook channel, Home Assistant first, pushes "needs you" entries that are still unread once I have been away from the laptop for a while, and clears them from the phone once they are handled.
- Deployments are in scope. That covers PR heads deployed to staging and merged PRs reaching dev, acceptance and production. The code lives in `src/services/delivery/` so #87 builds on it instead of starting over.
- Every OS popup comes from a committed journal entry. The four popup paths that exist now go away (section 9).
- Vera's ADO comments are a category, informational, with popup and push off. Review after a week of use.

## What changed in this revision (2026-10-27)

Workstreams (#86, PR #94) and related CI failures (#90, PR #93) shipped in 4.7.0. They change the plan in these places:

- Two more sources. CI failures already publishes `CiFailureEvent` with a stable id per transition, and its comment names this digest as a reader. Workstreams publish attention entries (unblocked, invalidated, reopened, conflict, proposals, ready). Both become Activity sources (sections 6.5 and 6.6).
- Two more popup paths. `services/ci-failures/notify.ts` and `services/workstreams/notifier.ts` join `useStateTransitions` and the Dispatch notifier. All four keep their dedup state in memory. Section 9 removes all four.
- The Rust store has a pattern to follow. `src-tauri/src/ci_failures/store/` opens SQLite on a blocking thread, migrates by `PRAGMA user_version`, opens a newer schema read-only and moves a corrupt file aside. Slice 1 extracts that into a shared module instead of writing it twice, and `reset_all_settings` must clear `activity.db` the way it clears `ci-failures.db`.
- GitHub sync now records which repositories a poll read fresh (`markReposPolled`, `repoPolledAt` in `pr-store.ts`). That solves half of finding 3. The other half, telling REST reads from GraphQL reads, is still open.
- The PR poll now carries `ciJobs` with check-run `databaseId`, run id, run number and `completedAt`. Check entries use them, and CI failures' per-PR signals give them a readable detail.
- `services/github/pr-lookup.ts` reads PRs by number with a cache and the account budget. Merge verification uses it, after `mergeCommit` and `mergedBy` are added to its query.
- T3 hosts now report their install id (`t3Environment`, `HostStatus.environmentId`). It becomes the T3 source's config key, so an address that points at a different T3 install starts a new baseline.
- CLAUDE.md changes: the React Compiler is active (select derived values inside Zustand selectors), and `bun run bindings` must follow every Rust command change. `docs/performance/runtime.md` sets the polling rules the delivery poller must follow.

## 1. What I get

A seventh section, Activity, works like an inbox. Each entry says what changed in one sentence, where it happened (T3 host, repository and account, ADO project, workstream) and when, and offers one action that fits it, such as "Answer: Option A", "Approve plan", "Open thread", "Review", "Fix checks", "Open failure group", "Open workstream", "Open run log" or "Open item". Entries stay until I read or dismiss them, across restarts. j/k moves, Enter acts, `e` marks read, `#` dismisses, `z` undoes.

The categories:

- agent questions, plans and approval requests
- finished turns
- failures, interruptions I did not ask for, and usage-limit stops (with the time the agent resumes)
- reviews on my PRs, plus new Claude findings, grouped per review
- review requests for me
- checks failing or recovering on my PRs, ready to merge, merge conflicts, merged and closed
- shared CI failures: a group reaching the threshold with no owner, an investigation gone quiet, a fix merged, a fixed failure coming back, a group resolved
- workstreams unblocked, invalidated, reopened, changed on another machine, ready to complete, or with agent proposals waiting
- my PR heads deployed to a staging environment, and my merged PRs reaching dev, acceptance or production, or failing to
- ADO items assigned to me or moved by someone else, comments from others, and Vera's reports

Focus opens with a card listing unread counts per category since I last opened Activity, plus the five newest entries that need me. It sits above the Dispatch, Workstreams and CI failure cards.

Popups come from the same entries. A restart never sets off a burst. After time away I get one popup ("While you were away: 3 turns finished, 1 question, #412 reached acc") instead of twenty. When I watched a turn finish in T3 I get no popup and no unread entry, because T3 already saw me there.

## 2. Review of the plan in the issue

Worth keeping: source-scoped baselines, a quiet first sync, read state kept apart from popups, no automatic actions, short summaries only, actions checked again before they run, and treating a host that went offline as "status unavailable" instead of "done".

What it misses or gets wrong, checked against 4.7.0:

1. Storage. It puts a journal of up to 5,000 entries, the per-source baselines and the read state in one `activity-state.json` through `utils/tauri-persist.ts`. Plugin-store rewrites the whole file on every `save()` and has no transactions, so "commit the event and its checkpoint together" cannot be guaranteed, and every mark-read rewrites megabytes. CI failures already chose SQLite for its durable history, and Activity should do the same with the same code.
2. T3 already gives native identities. The shell (`GET /api/orchestration/shell`, checked live) carries `latestRunId` (`run:thread:<id>:ordinal:<n>`), `latestRunCompletedAt`, the raw run status (`completed`, `failed`, `interrupted`, `cancelled`, `queued`, `running`, `waiting`, `idle`), `lastError`, `lastErrorClass`, `lastErrorCode`, `latestRunStopRequested`, `limitRecovery { requestId, runId, resetAt, autoResume }`, `lastVisitedAt` and `goal`. `src-tauri/src/t3/shell.rs` still reads only some of them and folds the rest into seven statuses. With them, a finished turn is keyed by its run id, a missed turn shows up as an ordinal gap, an interruption I asked for is not "unexpectedly stopped", and `lastVisitedAt` gives cross-device read state for free. The issue plans snapshot fingerprints instead.
3. A failed repository looks fresh. Partly fixed in 4.7.0. `github-sync.ts` now lists the repositories a poll read fresh and stores the time in `repoPolledAt`, so a repository that kept its old PRs is recognizable. What is still missing is the read path. The REST fallback drops `latestReviews` when the head moved, so a REST read must not count for review entries.
4. A PR that leaves the open list has not been merged. `getClosedPRs` still runs once when sync starts, so a merge during the session is only a disappearance. It needs a verification read, and `pr-lookup.ts` now provides one.
5. Popups come from four paths with in-memory dedup: `hooks/useStateTransitions.ts` (skips the first poll, 60-second window), `services/dispatch/notifier.ts` (a `Set` for the session), `services/ci-failures/notify.ts` (fed by `CiEventTracker`, whose baseline is the first snapshot after startup), and `services/workstreams/notifier.ts` (a `Set` that forgets a key once it stops holding, so a flapping state notifies again). The issue adds a fifth path and asks it not to double the others. Merging them is simpler and fixes restart bursts and lost transitions.
6. Threads without an ADO item are invisible. `noticesFor` walks `overview.items` only, so a thread without a work item never notifies, and that covers every BorgDock thread and most ad-hoc ones.
7. The phone is ignored. The problem statement opens with checking sessions from a phone, and the plan answers "no mobile UI promise". `lastVisitedAt` and a push channel cover most of it without a phone app.
8. Deployments are deferred. fsp-horizon writes to the GitHub Deployments API about 400 times a day, to `dev`, `staging-1`..`6`, `selecta-a` and the release environments, each with a status id and `log_url`. Those records are native and trustworthy, so there is nothing to wait for.
9. The notification channel toggles do nothing. `channels.tray`, `system`, `sound` and `emailDigest` in Settings, Notifications, are read nowhere.
10. Account identity. An empty `githubAccount` means "whichever account gh has active", and that changes under us; it flipped mid-loop before. CI failures' `scopeOf` keeps the account empty for the default one. A source id built that way would reuse one account's baseline for another, so Activity resolves the empty account to the login the client actually reads with.

## 3. Architecture

```
accepted reads                         pure (TS)                         Rust, one writer               what reads it
github-sync onResult (per repo) ---+
dispatch sync pollHost/readDetails-+-> adapter -> observation -> derive(baseline, observation) -> activity_commit (1 transaction)
dispatch sync loadItems -----------+                              entries, resolutions,            entries + baseline + outbox
ci-failures store (groups) --------+                              seen marks, next baseline              |
workstreams sync (assessments) ----+                                                                     +-> activity-changed event
delivery poller -------------------+                                                                     |     -> activity-store (main, flyout)
                                                                                                         |     -> rail / tray / taskbar counts
                                                                                                         +-> popup outbox -> policy -> show_flyout_toast
                                                                                                         +-> push outbox  -> idle check -> webhook
```

New modules:

| Where | What |
|---|---|
| `src-tauri/src/sqlite_store.rs` | Moved out of `ci_failures/store/connection.rs` and `mod.rs`: lazy open on a blocking thread, `user_version` migrations, newer schema opens read-only, corrupt file moved aside, `with_store` and `with_writer`. `CiStore` and `ActivityDb` both use it |
| `src-tauri/src/activity/mod.rs` | State (`ActivityDb`), `activity.db` in `app_data::directory()`, so isolated profiles stay isolated |
| `src-tauri/src/activity/schema.rs` | Migrations, append only |
| `src-tauri/src/activity/commands.rs` | `activity_open_source`, `activity_baselines`, `activity_commit`, `activity_list`, `activity_counts`, `activity_mark`, `activity_restore`, `activity_outbox_take`, `activity_outbox_ack`, `activity_clear`, `activity_export`, `activity_prune` |
| `src-tauri/src/activity/push.rs` | Webhook sender, Home Assistant preset, retries, clear messages, payload privacy |
| `src-tauri/src/platform/idle.rs` | Seconds since last input (`GetLastInputInfo`) |
| `src/services/activity/types.ts` | Entry, category, action target, observation, baseline types |
| `src/services/activity/sources.ts` | Source ids, generations, per-source serial queue |
| `src/services/activity/derive/{t3,github,delivery,ado,ci,workstreams}.ts` | Pure derivation per source |
| `src/services/activity/ingest.ts` | Holds baselines in memory, calls derive and commit, drives the popup outbox |
| `src/services/activity/actions.ts` | Action targets, revalidation, running them through existing services |
| `src/services/activity/policy.ts` | Popup and push decisions per category, summary popups |
| `src/services/activity/copy.ts` | The sentence for each category |
| `src/services/delivery/{deployments,inclusion}.ts` | Deployment facts and "is this merge in that deploy" with a cache; #87 extends it |
| `src/runtime/activity-sync.ts` | Starts the adapters, the delivery poller and the outbox drain; started by `application-runtime.ts` next to `startCiFailuresSync` |
| `src/stores/activity-store.ts` | Read side: counts, current page, filters, selection, undo stack |
| `src/components/activity/` | `ActivitySection`, `ActivityRow`, `ActivityFilters`, `SinceLastCheckedCard`, `activity.css`, stories, fixtures |

Conventions from CLAUDE.md and `docs/performance/runtime.md` that apply throughout:

- Every Rust command is `async` and does its database work through `with_store` or `with_writer`, never on the GUI thread.
- Commands register in the one command registry and come out in `src/generated/commands.ts`. Run `bun run bindings` after every change. `cargo test --lib` fails on drift.
- Synchronization stays in `application-runtime.ts`. No component starts a poller.
- Pollers use `PollingManager` with `trackPolling`, so they slow to every fourth interval while every window is hidden.
- GitHub requests go through the account clients, which share four transport slots per account.
- Zustand selectors in `activity-store.ts` return derived values directly, because the React Compiler memoizes components.

## 4. Data model

### 4.1 Sources, generations, revisions

A source is one independent origin with its own baseline:

| Source id | Scope | Config key |
|---|---|---|
| `t3:<hostId>` | One T3 host (local or remote) | The host's `environmentId` |
| `gh:<scope>` | One repository binding | The scope with the resolved login |
| `deploy:<scope>` | Deployments of one repository | Same |
| `ci:<scope>` | CI failure groups of one repository | Same |
| `ado:<org>/<project>` | One ADO project | Organization, project, auth method |
| `workstreams:local` | The workstreams on this machine | The sync folder path |

`<scope>` is `scopeOf` from `services/ci-failures/identity.ts` (`github.com|<login>|<owner>/<repo>`, lower case), with the empty default account replaced by the login the client resolved. Move `scopeOf` and `parseScope` to `services/github/scope.ts` so both features import it from GitHub. CI failure events carry CI's own scope, with the empty account, and the CI adapter resolves it the same way.

`activity_open_source(sourceId, configKey)` returns the generation. Rust keeps it, so it survives restarts. It goes up when `configKey` changes. In-session invalidation calls it again: `followHostList`, a new `environmentId` for a host, the GitHub key change in `application-runtime.ts`, the connection change in `syncItems`. A commit that carries an older generation is rejected, so a delayed response from a previous account, address or install can never write.

The revision orders observations within a generation. For T3 it is the shell's `snapshotSequence`. For CI failures it is the store's `revision` (in its `meta` table). For the other sources it is the time the read started, in milliseconds. Rust rejects a revision at or below the stored one. Reads are already serialized per source (`HostState.inFlight`, `itemsInFlight`, `PollingManager`). On top of that the ingest queue keeps one observation in flight per source and drops a waiting one when a newer one arrives.

A revision that moves backwards on a successful full read means the source was reset (T3 database wiped, CI history cleared, clock moved). Ingest then asks for a new generation and seeds again quietly, and logs why.

### 4.2 Baselines

Each source has one baseline, an opaque JSON blob that Rust stores next to the generation and revision. Per entity it holds only the facts the rules compare:

- T3 thread: `runId`, `ordinal`, `runStatus`, `requestId`, `planRunId`, `errorKey`, `limitRequestId`, `lastVisitedAt`, `createdAt`.
- Pull request: `state`, `mergedAt`, `headSha`, `reviewIds`, `requestedMe`, failing check-run ids per head, `mergeable`, `ready`, `findingsWatermark`.
- Deployments: the last status id per deployment, and per merged PR the environments it reached.
- ADO item: `rev`, `state`, `assignedToMe`, `newestCommentId`.
- CI failure group: the previous `CiGroupSummary` per group, as `eventsBetween` needs it (section 6.5).
- Workstream: the attention ids that held at the last observation, each with its episode number (section 6.6).

An entity missing from a complete observation is kept with `missingSince` and creates no entry. One missing from an incomplete part (a repo that failed, a host that did not answer) stays as it was.

The first commit for a source seeds. It writes the baseline and adds no entries, because Focus, Dispatch, Workstreams and the CI failure card already show what is waiting at that moment. An entity seen for the first time after seeding creates entries only when it was created after the seed (thread `createdAt`, PR `createdAt`, deployment `created_at`, group `firstObservedAt`). A thread I started from the phone while the laptop was closed therefore shows its finished turn, while a source that comes back with 700 threads it never reported stays quiet.

### 4.3 Entries

```ts
interface ActivityEntry {
  id: string;                 // `${sourceId}|${nativeKey}`: the same fact always gets the same id
  schema: 1;
  sourceId: string;
  entity: {
    kind: 'thread' | 'pr' | 'deployment' | 'workitem' | 'ci-group' | 'workstream';
    key: string;
    title: string;
    url: string | null;
  };
  category: ActivityCategory;
  severity: 'info' | 'success' | 'warning' | 'error';
  needsYou: boolean;
  status: 'open' | 'resolved' | 'superseded';
  resolvedBy: string | null;  // entry id or a short reason ("answered", "checks passed")
  sourceAt: string | null;    // when it happened, from the source
  observedAt: string;
  coverage: 'live' | 'catch-up';
  summary: string;            // one sentence, at most 160 characters
  detail: string | null;      // question text, first line of the agent's message, top 3 findings; at most 600 characters
  action: ActionTarget | null;
  links: { itemIds: number[]; prUrls: string[]; workstreamIds: string[]; ciGroupIds: string[] };
  read: 'unread' | 'read' | 'dismissed';
  readReason: 'user' | 'action' | 'viewed' | 'seen-in-t3' | 'bulk' | 'rolled-up' | null;
  readAt: string | null;
  version: number;            // bumps on every change, for optimistic writes from two windows
}
```

Entity keys are scoped so that the same thread id on two hosts, or the same PR number in two repositories, can never meet: `t3:<hostId>:thread:<rawId>`, `gh:<owner>/<repo>#<n>`, `deploy:<owner>/<repo>:<deploymentId>`, `ado:<org>/<project>:<id>`, `ci:<groupId>`, `workstream:<documentId>`. A PR key leaves out the account, because `owner/repo#n` names one PR on github.com whichever account reads it.

`coverage` is `catch-up` for the first commit of a source in an app session, and for the first commit after the source failed for more than two poll intervals. Times stay exact where the source provides them (run completion, review submission, deployment status, a group's `fixMergedAt`). Catch-up only changes how popups behave and adds "noticed after reconnect" where the source has no timestamp.

### 4.4 Categories and their keys

| Category | Rule | Native key | Needs you | Resolved or superseded when |
|---|---|---|---|---|
| `agent.question` | Thread waits for user input | `thread:<id>:request:<requestId>` (`:run:<runId>:question` until the detail read gives the id; the detail read then enriches the same entry) | yes | Request gone or thread running, "answered" |
| `agent.plan` | `hasActionableProposedPlan` on a new run | `thread:<id>:plan:<runId>` | yes | Thread running again |
| `agent.approval` | `pendingRuntimeRequest` of another kind | `thread:<id>:approval:<runId>` | yes | Request gone |
| `agent.turn` | Run status `completed` for a run id not in the baseline | `thread:<id>:run:<runId>:completed` | no | Next turn finished (superseded) |
| `agent.turns-missed` | Ordinal moved by more than 1 between observations | `thread:<id>:runs:<from>-<to>` | no | |
| `agent.failed` | Run status `failed` | `thread:<id>:run:<runId>:failed`, detail `lastErrorClass` | yes | A later run completes |
| `agent.interrupted` | `interrupted` and `latestRunStopRequested` is false | `thread:<id>:run:<runId>:interrupted` | yes | A later run completes |
| `agent.limited` | `limitRecovery` appears | `limit:<requestId>`; summary names `resetAt` and whether it resumes on its own | only when `autoResume` is false | The run resumes |
| `agent.report` | ADO comment signed `Vera · <kind>` | `ado-comment:<commentId>` | no | |
| `pr.review` | New review id on my PR, by someone else, not the Claude bot | `review:<databaseId>` | for `changesRequested` | A later review by the same person |
| `pr.findings` | New Claude review comments on my PR | `findings:<reviewId or newest comment id>`; detail lists the top 3 by severity | when any is critical | |
| `pr.review-request` | I become a requested reviewer (directly or by team) | `review-request:<owner>/<repo>#<n>:<requestedAt>` | yes | I reviewed or the request was removed |
| `pr.checks-failed` | My PR's head gets failing `ciJobs` | `checks:<headSha>:failed`; detail names the jobs and, when CI failures read their logs, the first signal; a job in a shared group names the group | yes, unless every failing job sits in a group someone owns | Same or newer head passes |
| `pr.checks-passed` | My PR's head turns green after a failure entry | `checks:<headSha>:passed` | no | |
| `pr.ready` | My PR becomes ready to merge (`isReadyToMerge`) | `ready:<headSha>` | no | Merged, or no longer ready |
| `pr.conflict` | `mergeable` goes from true to false on my PR | `conflict:<headSha>` | yes | Mergeable again |
| `pr.merged`, `pr.closed` | Verified after the PR left the open list | `merged`, `closed` | no | |
| `ci.group-grew` | CI event `group-grew` | the CI event id | yes | Group claimed or resolved |
| `ci.owner-stale` | CI event `owner-stale` | the CI event id | yes | Claim renewed, released or resolved |
| `ci.fix-merged` | CI event `fix-merged` | the CI event id | when one of my PRs is still red in the group | Group resolved |
| `ci.seen-after-fix` | CI event `seen-after-fix` | the CI event id | yes | Group resolved |
| `ci.resolved` | CI event `resolved` | the CI event id | no | |
| `workstream.unblocked` | Attention `unblocked:<relationId>` starts holding | `<documentId>:<attentionId>#<episode>` | yes | Attention stops holding |
| `workstream.invalidated` | Attention `invalidated:<outcomeId>` | same | yes | same |
| `workstream.reopened` | Attention `reopened:<outcomeId>` | same | yes | same |
| `workstream.conflict` | Attention `conflict` (changed on another machine) | same | yes | same |
| `workstream.proposal` | Attention `proposal:<proposalId>` | same | yes | Proposal accepted or rejected |
| `workstream.ready` | Attention `ready` | same | no | Completed |
| `deploy.pr` | Terminal status on a deployment of my PR's head | `deployment-status:<statusId>` | on failure | A later success to the same environment |
| `deploy.reached` | A successful deployment includes my merged PR | `reached:<owner>/<repo>#<n>:<environment>` | no | |
| `deploy.failed` | A failed deployment that would have carried my merged PR | `deployment-status:<statusId>` | yes | `deploy.reached` for that PR and environment |
| `ado.assigned` | An item becomes mine through someone else's change | `item:<id>:rev:<rev>:assigned` | yes | |
| `ado.state` | Someone else moves my item | `item:<id>:rev:<rev>:state` | when it moves backwards in its workflow | |
| `ado.comment` | Newest comment is someone else's, unsigned | `ado-comment:<commentId>` | yes | I reply, or the entry is read |

"Mine" for a PR means its author is the login of the account that reads that repository, not `settings.gitHub.username`. Reviews and findings count only on my PRs. Review requests count on anyone's PR. CI group events count when one of my PRs is in the group, when I own its claim, or when the group crossed the threshold (shared work nobody owns). The existing `onlyMyPRs` setting no longer applies to activity, because each category already has a fixed audience.

Not every fact becomes an entry. Checks passing without an earlier failure entry, a thread starting, a PR I opened, my own reviews and comments, and workstream attention without a category above (`stalled`, `no-next-action`, `cycle`, `checks`, `needs-you`, `decision`, `unavailable`) are left out. Those last ones stay on the workstream itself.

### 4.5 Read state, resolution, automatic reads

Read state and status are separate. A resolved question I never saw stays unread, but it leaves the "needs you" count and its action, and shows "Answered 14:02".

Things that mark entries read without me pressing anything:

- Seen in T3. When an observation shows `lastVisitedAt` moving forward for a thread, every unread entry of that thread with `sourceAt <= lastVisitedAt` becomes read, reason `seen-in-t3`. An entry that arrives already covered by `lastVisitedAt` is stored read and gets no popup. A setting, `seenInT3`, turns this off.

  Verified on 2026-10-26 against the local host. A client that shows a thread sends `visitThread` every 10 seconds and stops when it no longer shows it. Opening a thread on the iPhone moved its `lastVisitedAt` (19:44:06 to 21:01:10). The visit reached the server through the laptop's T3 desktop client (`t3code.client.surface: desktop`), not from a phone client. Scheduled-task messages and runs do not move it. A turn that completes after the last visit stays unread, which is right: I left before it finished. One side effect to accept is that a T3 window left open on a thread marks that thread's entries read, because T3 cannot tell an unattended window from one I'm reading.
- Action. Taking an entry's action marks that entry read.
- Viewed. Opening a PR's detail, showing an item in Dispatch, opening a workstream (`showWorkstream`) or opening a CI failure group marks that entity's unread entries with `sourceAt <= now` read (`viewed`). A setting, `markReadOnOpen`, turns this off. Entries of other entities never change this way.

"Mark shown read" sends the ids of the entries in the current filter as loaded at the moment of the click. Entries that arrive during the write stay unread, because the command lists ids instead of a time. Every bulk change keeps the previous states for Undo (`activity_restore`).

## 5. Storage in Rust

Slice 1 first moves the open, migrate, read-only and quarantine logic out of `ci_failures/store/connection.rs` and `mod.rs` into `src-tauri/src/sqlite_store.rs`, without changing what CI failures does (its tests must pass unchanged). `ActivityDb` then uses the same module. `activity.db` lives next to `ci-failures.db` and `prcache.db`. It is a separate file so `cache_cleanup` and the CI retention never touch it. `reset_all_settings` in `maintenance.rs` closes and deletes it (with `-wal` and `-shm`) the way it does `ci-failures.db`.

Schema v1, migrated by `PRAGMA user_version` like the CI store:

```sql
CREATE TABLE sources (source_id TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT NOT NULL,
                      config_key TEXT NOT NULL, generation INTEGER NOT NULL, revision INTEGER NOT NULL,
                      baseline TEXT NOT NULL, seeded_at TEXT NOT NULL, committed_at TEXT NOT NULL,
                      retired_at TEXT);
CREATE TABLE entries (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, entity_key TEXT NOT NULL,
                      category TEXT NOT NULL, severity TEXT NOT NULL, needs_you INTEGER NOT NULL,
                      status TEXT NOT NULL, resolved_by TEXT, source_at TEXT, observed_at TEXT NOT NULL,
                      coverage TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT, payload TEXT NOT NULL,
                      read TEXT NOT NULL, read_reason TEXT, read_at TEXT, version INTEGER NOT NULL);
CREATE INDEX entries_inbox  ON entries (read, needs_you, observed_at DESC);
CREATE INDEX entries_entity ON entries (entity_key, source_at);
CREATE INDEX entries_source ON entries (source_id);
CREATE TABLE outbox  (entry_id TEXT NOT NULL, channel TEXT NOT NULL, state TEXT NOT NULL,
                      attempts INTEGER NOT NULL, next_at TEXT NOT NULL, PRIMARY KEY (entry_id, channel));
```

`activity_commit` takes `{ sourceId, generation, revision, seed, baseline, entries, enrichments, resolutions, seen, outbox }` and, in one transaction:

1. rejects an older generation or a revision at or below the stored one, and answers `{ accepted: false, reason }`;
2. inserts entries that are not there yet (`INSERT OR IGNORE`), so replaying the same observation adds nothing;
3. applies enrichments (summary, detail, action) to existing rows only, and never to their read state;
4. applies resolutions and `seen` marks;
5. adds outbox rows for the entries it actually inserted;
6. writes the baseline, revision and `committed_at`;
7. emits `activity-changed { revision, counts }` after the commit.

The in-memory baseline in `ingest.ts` advances only when the commit was accepted. When a commit fails (disk full, locked file), the source keeps its old baseline and the next observation derives the same transitions again. Because ids are stable, nothing doubles. A failure after commit but before the popup leaves an outbox row behind, so the popup is sent later or folded into a summary, never lost and never sent twice. Repeated commit failures show a banner in Activity with the error and a Retry button.

Capacity and retention:

- Read and dismissed entries older than 90 days are pruned at startup and once a day.
- Unread entries are never dropped quietly. Past 5,000 unread, the oldest unread entries that do not need me are folded per source into one entry ("212 older updates from fsp-horizon") and marked `rolled-up`. If entries that need me alone pass the limit, ingestion stops adding entries that do not need me, and Activity shows a banner with Export and Clear.
- Clear history per source (from Settings and from the source filter) and Clear all. Export writes JSON through the dialog plugin. The main window's capability file must allow `dialog:default`; check it.

Recovery comes from the shared module. A missing file starts clean. An older schema migrates in order. A newer schema opens read-only, Activity shows "Written by a newer BorgDock" and ingestion stops. A corrupt file is moved aside to `activity.db.corrupt-<timestamp>`, a new one starts, and a banner says so.

## 6. Source adapters

All adapters hook into reads the app already accepts. None adds a poller, except the deployment list, which has no feed today.

### 6.1 T3

Rust (`src-tauri/src/t3/shell.rs`): add `latest_run_id`, `latest_run_completed_at`, `run_status` (the raw status), `last_error_class`, `last_error_code`, `latest_run_stop_requested`, `last_visited_at`, `limit_recovery` and `pending_request_kind` to `ShellThread` and `ThreadDto`. Extend the read-only live test (`t3::commands::tests::live`) to print them. Add the fields to `AgentThread` in `src/services/dispatch/types.ts`, and have `toAgentThread` copy them.

Ingest (`src/services/dispatch/sync.ts`; Dispatch stays the only shell poller):

- `pollHost` calls `ingestT3(host, generation, snapshot.sequence, threads, { complete: true })` after `setHostSnapshot`. An unchanged snapshot is not ingested. A failed poll is not ingested, and the host's status is enough for entries to show "Mac mini offline since 12:03" on their actions.
- The generation comes from `activity_open_source` with the host's `environmentId` as config key. `readEnvironment` learns it once per address; until then the host is not ingested. A new environment id or address asks for a new generation.
- `readDetails` sends enrichments (question text and options, request id, last agent message) for the entries already created. It creates no new ones.
- Threads without an ADO item are included. Entries carry the item ids Dispatch linked at the time, and the UI joins with the current overview when it renders.
- Subagents create nothing. Their root thread is the one that waits.
- An ordinal gap during catch-up creates one `agent.turns-missed` entry. If T3 changes the run id format, the parser gives up on gaps and nothing else breaks.

### 6.2 GitHub pull requests

- Read path. `github-sync.ts` already collects `freshRepos` and calls `markReposPolled`. Extend that with the path each repository took (`graphql` or `rest`) and hand the list to `ingestGitHub` from `onResult`. A repository that is not fresh is not ingested. A `rest` repository is ingested for state, checks and mergeability, but not for reviews.
- `services/github/polling.ts`: add `databaseId` to the `latestReviews` nodes and keep it on `PrReview` as `id`.
- Checks. `ciJobs` gives the failing check-run ids of the head. The detail names the jobs. When CI failures read their logs, `ci-failures-store` gives the first signal per job, and `sharedGroupsByPr` tells whether a job sits in a shared group. In that case the entry names the group, and its action opens the group instead of "Fix checks". The launch guard in `useClaudeActions` still warns before a duplicate fix either way.
- Merge verification. A PR that leaves the open list on a fresh read goes through `lookUpPullRequests` in `services/github/pr-lookup.ts`, which batches per repository, caches, and uses the account budget. Add `mergeCommit { oid }` and `mergedBy { login }` to its query, so `pr.merged` gets the real `mergedAt` and author, and delivery gets the merge commit. Verified PRs also go into `closedPullRequests`, so Dispatch and workstreams see the merge without waiting for a restart.
- Findings. When the Claude bot's review or the comment count changes on one of my PRs, fetch review comments `since` the stored watermark through `services/github/reviews.ts`, at most three PRs per poll and the rest on later polls. Severity comes from `splitStructuredReview`. One review becomes one entry, so a count never poses as a single finding.
- Review requests use `myReviewRequestedAt` and team membership, like `needsMyReview`.
- `detectStateTransitions` moves into `derive/github.ts`. `services/notification.ts` keeps the builders, the popup copy and `sendOsNotification`.

### 6.3 Delivery and deployments

PR heads. The poll query gains `commits(last: 1) { nodes { commit { deployments(last: 10) { nodes { databaseId environment latestStatus { databaseId state createdAt logUrl environmentUrl } } } } } }`. It costs no extra requests, but measure its GraphQL points per poll before merging. Terminal statuses (`success`, `failure`, `error`) on my PR's head create `deploy.pr`. `in_progress`, `queued` and `inactive` create nothing.

Merged PRs reaching environments (`src/services/delivery/`):

- A repository opts in with `RepoSettings.deployments = { enabled, environments: string[] }`. The environments are glob patterns such as `dev`, `*-a`, `acc*`, `prod*`. The setup step reads the environments seen in the last 100 deployments and suggests them. Add the field to `src-tauri/src/settings/models.rs` too, because typed Rust structs drop unknown fields on save.
- A `PollingManager` with `trackPolling` runs every 2 minutes (every 8 while all windows are hidden): `GET /repos/{o}/{r}/deployments?per_page=100` with the ETag `client.ts` already handles; a 304 does not count against the rate limit. New deployments to followed environments get their statuses (one request each), with at most 10 per cycle and the rest queued.
- For each terminal deployment, and each of my PRs merged in the last 14 days that has not reached that environment yet, `GET /repos/{o}/{r}/compare/{mergeCommitSha}...{deploySha}`. `identical` or `ahead` means included. Compare results are cached per pair, a PR stops being checked for an environment once it reached it, and calls are capped at 10 per cycle.
- `deploy.reached` takes its `sourceAt` from the status. A failed deployment whose commit includes my merge creates `deploy.failed`.
- `delivery/` exposes `DeploymentFact` and `InclusionFact` with the cache. #87 reads them for its delivery section and adds release inclusion and verification. A workstream evidence rule such as `deployed-to` (next to `pr-merged` and `pr-checks-green` in `services/workstreams/rules.ts`) can read them later.

### 6.4 Azure DevOps

- `services/dispatch/items.ts` keeps `rev`, `System.ChangedBy` and the newest comment's `id` (the ADO comment already carries it) on `DispatchItem`.
- `loadItems` calls `ingestAdo` after `setItems` succeeds, for the items Dispatch lists. The context items workstreams ask for (`contextItems`) are not ingested: they belong to other people or are done.
- Changes made by me (`ChangedBy` is my identity) create nothing, and comments posted from my account count only when Vera signed them (`agent.report`). Items that leave my query create nothing.

### 6.5 CI failures

- The adapter reads the group summaries `useCiFailuresStore` holds after each refresh, per scope, with the CI store's `revision` as the observation revision.
- Its baseline is the previous `CiGroupSummary` list per scope, so `eventsBetween` from `services/ci-failures/events.ts` runs unchanged against a baseline that survives restarts. `CiEventTracker` keeps its in-memory baseline only for the live listeners, and its notification listener goes away (section 9).
- Event ids from `eventsBetween` are already stable per transition (`<groupId>:<kind>:<key>`), so they become native keys as they are. `sourceAt` comes from the group (`fixMergedAt`, `lastObservedAt`) where the event's own `at` is only the observation time.
- Actions open the group (`GroupDetail`), or the PR list narrowed to it (`setRelatedFailure`).

### 6.6 Workstreams

- The adapter runs after `recomputeWorkstreams` produces assessments, in place of `notifyWorkstreams`. It reads the attention entries the categories in section 4.4 name.
- Attention ids such as `ready` and `conflict` repeat when a state comes back, so the baseline keeps the ids that held at the last observation with an episode number. An id that starts holding again gets the next episode, and a new entry. An id that stops holding resolves the open entry.
- The sync folder can bring changes from another machine. `workstream.conflict` covers the case where both changed. Remote edits that merged cleanly create nothing, because they are my own work.
- Workstreams stay quiet while sources are still loading. The adapter keeps the same gate (`everySourceRead`, the first pass after loading) for its first observation in a session, and after that relies on the persisted baseline.

## 7. Actions

```ts
type ActionTarget =
  | { kind: 'answer'; hostId: string; threadId: string; requestId: string; option: string | null }
  | { kind: 'approve-plan'; hostId: string; threadId: string; runId: string }
  | { kind: 'open-thread'; hostId: string; threadId: string }
  | { kind: 'open-item'; itemId: number }
  | { kind: 'open-pr'; owner: string; repo: string; number: number; tab?: 'checks' | 'reviews' }
  | { kind: 'review-pr'; owner: string; repo: string; number: number }
  | { kind: 'fix-checks'; owner: string; repo: string; number: number; headSha: string }
  | { kind: 'merge'; owner: string; repo: string; number: number; headSha: string }
  | { kind: 'open-ci-group'; scope: string; groupId: string }
  | { kind: 'open-workstream'; id: string; tab?: string }
  | { kind: 'open-url'; url: string };
```

Before an action runs, `activity/actions.ts` checks it against the stores. An answer runs only while the thread still asks with the same `questionRequestId`. "Approve plan" runs only while the thread still shows the plan of that `runId`. A merge runs only on the same head while it is still ready. "Fix checks" runs only while that head still fails, and goes through the CI launch guard. When the check fails, the row says what changed ("Answered on another device", "New commits since", "Owned by W3 since 10:12") and offers Open instead. Actions run through the code that exists: `dispatchActions.answer`, `approvePlan` and `openInT3` (they take an `AgentThread`, so unlinked threads work), `showDispatchItem`, `showPr`, `showWorkstream`, the CI group detail, Quick Review, and the `borgdock://fix` and `borgdock://merge` routes. Inline answering reuses `AgentSays` from `components/dispatch/`. Reading an entry never starts anything.

## 8. UI

Activity section (`components/activity/ActivitySection.tsx`):

- `ActiveSection` gains `activity`. `SECTION_ORDER` appends it after `worktrees`, so `useKeyboardNav` gives it key `7` and `ui-state.json` accepts it. Update the rail's comment that names keys 1 to 6. `SectionView` loads it lazily, like Dispatch and Workstreams. The rail shows the unread needs-you count.
- The header is a summary line ("Since you last checked: 2 questions, 1 failure, 5 turns finished, #412 reached acc"), filters (Needs you, Unread, All), category chips (Agents, Pull requests, CI, Workstreams, Deployments, Work items), a source menu (host, repository and account, ADO project, with Clear history there), and search.
- The list is grouped by day and virtualized with `@tanstack/react-virtual`. Entries of one entity within a day fold into one row with "3 updates", which expands.
- A row has a category icon, the sentence, a source chip, the time (with "noticed after reconnect" when the time is the observation), a status chip for resolved or superseded, the primary action, and a menu (mark read or unread, dismiss, open source). Selecting a row expands its detail: the question with options, the agent's last message, the findings, the failing jobs and their signal, the environment and run log of a deployment.
- Keys: j/k, Enter (primary action), `e` (read), `u` (unread), `#` (dismiss), `z` (undo), Shift+E (mark shown read), handled the way `handleWorkstreamsKey` plugs into `useKeyboardNav`. Focus stays on the next row after a row leaves the filter.
- States: loading, empty ("Nothing new since 09:12"), every source quiet, a commit error banner with Retry, the newer-schema banner, the capacity banner, a host offline chip per source.
- Floating parts (row menu, undo toast) use `--color-modal-bg` or `--color-toast-bg` (CLAUDE.md, "Floating surfaces").

Focus: `SinceLastCheckedCard` sits first in `FocusList.tsx`, above `DispatchFocusCard`, `WorkstreamsFocusCard` and `CiFailuresFocusCard`. "Since" is the last time Activity was open (`ui-state.json`, `activityVisitedAt`). It shows counts per category and the five newest entries that need me, each with its action. "Open Activity" goes to the section. The card renders nothing when nothing is unread.

Tray flyout: `FlyoutData` gains `activity?: { needsYou: number; unread: number; top: FlyoutActivity[] }`. The glance shows the top three with their action. The flyout reads its own snapshot through `activity_list`, which keeps the main runtime the only writer.

Taskbar: Windows overlay icon with the needs-you count (1 to 9, then "9+"). `WebviewWindow::set_overlay_icon` exists in Tauri 2.11. Dispatch it on the main thread with the shared timeout, following the window-command pattern. A setting turns it off.

Toast actions: `activity-open` (url is the entry id) brings the main window forward and selects the entry. `activity-act` runs its action after revalidation. Both are handled in `FlyoutApp.tsx` next to `dispatch-show`, `dispatch-act` and `workstream-show`, and forwarded to the main window as events, the way those are.

## 9. Popups and phone push

Popup policy (`services/activity/policy.ts`):

- Settings move to `notifications.activity.categories: Record<ActivityCategory, { popup: boolean; push: boolean }>`. A Rust `settings::migrate` step seeds them from the old toggles and then drops those fields:

  | Old setting | Seeds |
  |---|---|
  | `toastOnCheckStatusChange` | `pr.checks-*` |
  | `toastOnReviewUpdate` | `pr.review`, `pr.review-request`, `pr.findings` |
  | `toastOnMergeable` | `pr.ready` |
  | `agents.dispatchNotifications` | `agent.*` |
  | `ciFailureGroupGrows` | `ci.group-grew` |
  | `ciFailureOwnerStale` | `ci.owner-stale` |
  | `ciFailureFixMerged` | `ci.fix-merged`, `ci.seen-after-fix` |
  | `workstreams.notifications` | `workstream.*` |

  New settings go into `src-tauri/src/settings/models.rs` too, because typed Rust structs drop unknown fields on save.
- Live entries pop up one by one, with the copy and actions the existing builders produce (`services/notification.ts`, the CI `message()`, the workstream titles). Merged PRs keep the celebration sound.
- Catch-up entries, and more than four live entries in one commit, become one summary popup with "Open Activity".
- The drain sends popups only for entries still unread and open, then acks the outbox. Popup rows older than 2 minutes at startup are folded into the summary.
- Removed:
  - `hooks/useStateTransitions.ts` and its use in `App.tsx`
  - `services/dispatch/notifier.ts`, plus `notices.ts`, whose question and plan logic moves to `derive/t3.ts`
  - the `notifyNew` call in `recomputeOverview`
  - `services/ci-failures/notify.ts` and `followCiNotifications`, keeping `eventsBetween`
  - `services/workstreams/notifier.ts` and the `notifyWorkstreams` call in `workstreams-sync.ts`
- Review nudges stay, because they are reminders on a timer and not events.
- Channels. `tray`, `system` and `emailDigest` go away. `sound` starts working (merged, error). A "Phone" card replaces the email chip.

Phone push (`src-tauri/src/activity/push.rs`):

- Settings, Notifications, Phone: preset, URL, optional token, "Push after I'm away for [10] minutes", "Hide titles" (sends "W3 asks a question" without the item title), category toggles (defaults to the needs-you categories), and a Test button. The URL and token live in the keychain as `borgdock:activity-push`, like the other secrets.
- Home Assistant is the first preset, and the only one slice 10 must ship. BorgDock posts JSON to a webhook trigger, `POST <ha>/api/webhook/<webhook_id>`, with `{ title, message, url, tag, group, severity }`. `tag` is the entry's entity key and `group` its category. An automation calls `notify.mobile_app_<phone>`, and the plan ships that automation as YAML in `docs/`. Because notifications carry a tag, BorgDock also posts `{ tag, clear: true }` when a pushed entry is read, resolved or dismissed, and the automation turns that into `message: clear_notification`. The phone notification then disappears once I handle the entry on the laptop or answer in T3. ntfy, Pushover and plain JSON are later presets on the same sender.
- `activity_commit` adds a `push` outbox row for categories with push on. A Rust task wakes on commit and every 60 seconds. It pushes rows whose entry is still unread and open once `idle.rs` reports at least the threshold since the last input. A locked screen counts as idle. Rows whose entry was read, resolved or dismissed in the meantime are skipped. More than three ready rows go in one message. Retries back off up to 6 hours, and rows older than 12 hours are dropped.
- Click links go to the GitHub or ADO page. For T3 threads the link depends on whether T3's web client has a URL per thread (to verify, section 14). Without one, the push says which host and slot to open.
- The privacy note in the card says that titles and summaries leave the machine.

Limit to state in the UI: BorgDock records and pushes only while the laptop is awake. When it wakes, the catch-up commit produces the summary popup, and a push if I'm still away. What happened while it slept shows up through T3 run ordinals, review and deployment timestamps, ADO revisions and the CI history, so turns, reviews and CI transitions are not lost. Intermediate states with no history (a question asked and answered while the laptop slept) leave no trace, and the empty state says so.

## 10. Boundaries, privacy, failure handling

- Each host, repository binding, ADO project and the workstreams folder is a separate source with its own generation. A host that is offline or failing blocks nothing for the others. Outside the workstream adapter's first pass there is no global "every source read" gate.
- When a source is removed from settings, its entries stay with actions disabled ("Mac mini removed") until cleared, and the source row gets `retired_at`. Adding it back with the same config continues from its baseline. A different config key seeds it again.
- An account switch for a repository gives it a new source id, so the new account starts with a quiet baseline. Entries of the old account keep their links.
- Losing access, a failed read, or a host going away never creates "finished", "merged" or "resolved". Only a positive observation does.
- Long-running work never counts as stopped because of time alone. Only `failed`, `interrupted` without a stop request, or `limitRecovery` produce a stop entry. A quiet CI investigation is CI failures' own rule (`owner-stale`, with its lease), not Activity's.
- Stored text is limited to a summary (at most 160 characters) and a detail (at most 600): a question, the first line of a message, finding titles, a CI signal title (already sanitized by `ci_failures/sanitize.rs`). No transcripts, logs, diffs or tokens. The database is plain text in the app data folder. Settings says so next to Clear history.
- Windows other than main read through `activity_list` and `activity_counts` and write read state through `activity_mark`. Only the main window ingests.

## 11. Implementation slices

Each slice is one PR against `master` with its own tests. Sizes are rough. Every slice runs the proof commands from `docs/performance/runtime.md`: `bun run bindings`, `bun run build`, `bun run lint`, `bun run test`, `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`.

1. Activity store in Rust (M). Extract `sqlite_store.rs` from the CI store first, with its tests unchanged. Then the activity module, schema v1, every command, outbox, `activity-changed` event, `reset_all_settings`, prune and capacity. Done when Rust tests prove that a replayed commit inserts nothing, an old generation or revision is rejected, entries, baseline and outbox land together or not at all, capacity folding never drops unread entries that need me, and the CI store still opens, migrates and recovers as before.
2. Model and pure derivation (M). `types.ts`, `sources.ts`, `copy.ts`, `services/github/scope.ts`, and `derive/*` for all six sources against fixtures, with no wiring. Done when tests show that the same observation twice gives nothing new, a disappearance gives nothing, the first observation seeds quietly, a late detail enriches instead of adding, an ordinal gap gives one entry, a workstream attention that comes back gets a new episode, resolution and supersession follow the table, two hosts with the same thread id stay apart, and two repositories with the same PR number stay apart.
3. T3 adapter (M). Shell fields with the live test, `AgentThread` fields, ingest from `pollHost` and `readDetails`, environment ids as config keys, seen-in-T3. Done when sync tests cover an offline host not blocking a healthy one, a restart catching up from the stored baseline, a host whose environment id changed, and a regressed sequence reseeding. A manual check on the Mac mini host confirms that opening one of its threads on the phone marks it read on the laptop.
4. GitHub adapter (L). Read path per repository, review `databaseId`, checks from `ciJobs` with CI signals, merge verification through `pr-lookup.ts` feeding `closedPullRequests`, ready, conflict, review requests, and the bounded findings fetch. Done when tests show that a stale repository adds nothing, REST data adds no review entries, the same PR number on two accounts stays apart, verification and findings stay within their per-poll caps, and an account switch seeds quietly.
5. ADO adapter (S). `rev`, `ChangedBy`, comment id, Vera reports, context items left out. Done when my own changes add nothing and someone else's state change and comment add one entry each.
6. CI failure and workstream adapters (S). The persisted CI baseline around `eventsBetween`, the workstream episodes, actions to the group and the workstream. Done when a restart between two CI snapshots still produces the `fix-merged` entry, and a `ready` that flaps produces one entry per episode, not one per assessment.
7. Delivery and deployments (L). Head-commit deployments in the poll, the opt-in per repository with suggested environments, the deployment poller, statuses, the compare cache, and `deploy.*` entries. Done when fixtures built from fsp-horizon responses give the right entries, and a test proves the request ceiling per cycle (statuses at most 10, compares at most 10, the deployment list once per repository) and the hidden-window interval.
8. Activity UI (L). Section, rows, filters, grouping, keyboard, Focus card, rail count, flyout glance, taskbar overlay, toast actions, revalidated actions, undo. Storybook stories for every state with fixtures from slice 2, so this slice can start right after slice 2. Done when a Playwright test proves that "mark shown read" during an arriving commit leaves the new entry unread, undo restores the exact previous states, and a stale answer action falls back to Open. Screenshots in both themes of the empty, loading, error, long-title, narrow-width and 2,000-entry states have been inspected and fixed.
9. One popup pipeline (M). Policy, outbox drain, summary popups, the settings migration in TS and Rust, the Notifications settings rework, and removal of the four old paths. Done when a restart with unchanged sources sends zero popups, a catch-up sends one summary, a thread watched in T3 sends none, and no `sendOsNotification` call for these events remains outside `policy.ts`.
10. Phone push (M). Home Assistant preset with tags and clearing, the automation YAML, keychain, idle detection, outbox task, retries, hide titles, Test button. Done when Rust tests cover skip-if-read, batching, backoff, expiry and the clear message, and a real push arrives on the iPhone with the laptop locked, then disappears after the entry is marked read on the laptop.
11. Release (S). CHANGELOG entry with hero screenshots from Storybook (`design/whats-new/<version>.heroes.json`), the Activity screen in `design/site/screens.json`, and a CLAUDE.md section on the journal: entry ids, generations, "only positive observations create completions", the outbox, the shared SQLite module, and where to add a category.

Order: 1, then 2, then 3, 4, 5 and 6 in parallel (separate worktrees), then 7. Slice 8 can start after 2. Slice 9 needs 3 to 6, and 10 needs 9. 11 comes last.

## 12. Tests and verification

- Pure derivation: fixtures per category, including equal timestamps, out-of-order revisions, deleted questions, a run id that does not parse, a PR that is merged and reopened, a CI group resolved and seen again, and a workstream document edited on another machine.
- Rust: commit contract, migrations, recovery through the shared module, prune, capacity, outbox, push task with a fake clock and a fake HTTP server.
- Runtime (vitest): the GitHub, T3, ADO, CI and workstream paths with mocked `invoke`, asserting that the commit happened before any timing assertion. Hooks in tests get block bodies (CLAUDE.md, "Vitest").
- Live, read-only: the T3 live test prints the new fields. Never run launch, respond or settle from a test.
- UI: Storybook stories and screenshots in both themes; Playwright with `mock-tauri` for the section, keys and undo. Stop the main checkout's dev server first, so e2e tests the worktree.
- Load: 5,000 entries in the database. The section opens in under 150 ms on the work laptop, marking 500 read takes one transaction, and the existing 200-PR navigation budget (100 ms in `perf.spec.ts`) still holds.

## 13. Acceptance criteria

| Criterion in #88 | Covered by |
|---|---|
| Meaningful changes survive restart and remain until read or dismissed | SQLite journal (5), read state (4.5), capacity rule that never drops unread entries needing me (5), slice 1 tests |
| Refreshing the same source does not duplicate entries or mark unseen work read | Stable ids and `INSERT OR IGNORE` (4.3, 5), enrichments never touch read state (5), automatic reads limited to T3 visits, actions and opening the entity (4.5), slice 2 and 3 tests |
| First sync, offline recovery and out-of-order updates do not create misleading events | Quiet seeding and the creation-time rule (4.2), generations, environment ids and revisions (4.1), the read path per repository (6.2), merge verification (6.2), only positive observations (10), slice 2 to 6 tests |
| The digest respects account and host boundaries and links to existing actions | Source and entity keys (4.1, 4.3), resolved logins (2, item 10), revalidated actions through existing services (7), slice 4 tests with two accounts and two hosts |

## 14. Check before building

Settled on 2026-10-26: a phone visit moves `lastVisitedAt` on the local host (section 4.5). Home Assistant is the first push preset (section 9). Vera's reports ship as an informational category with popup and push off, visible under the Agents filter and switchable off in settings. Review after a week of use whether it earns its place or goes back to Dispatch only.

Still open:

1. The same visit check on the Mac mini host. A thread there, opened on the phone, should move its `lastVisitedAt` in the mini's shell. That holds if the mini's T3 desktop app relays visits the way the laptop's did.
2. Whether the shell's `pendingRuntimeRequest` carries its request id. If it does, question entries get their final key before the detail read.
3. The GraphQL points that head-commit deployments add to each poll (`request-budget.ts` logs them). The 4.7.0 poll already grew by the CI fields.
4. Whether T3's web client has a URL per thread that a push can link to.
5. The shape of T3's `goal`, to decide whether "goal reached" deserves its own category. A finished turn is not a finished goal, so until then the copy says "finished its turn".

## 15. Not in this feature

- Read state shared between machines. BorgDock ships for Windows only and runs on one laptop. If that changes, the workstreams sync folder (one file per document, three-way merge) is the pattern to copy.
- Recording while the laptop sleeps. That needs an always-on host, such as BorgDock headless on the Mac mini.
- Exits of terminal agents (Fix, Resolve, Monitor). They are launched without process tracking.
- Release inclusion and runtime verification (#87), and the launch queue (#89). Both can add categories through `derive/` and `delivery/` later.
