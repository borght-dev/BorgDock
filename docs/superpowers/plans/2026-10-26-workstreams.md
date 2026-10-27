# Workstreams: implementation plan

Date: 2026-10-26 · Issue: #86 · Baseline: `origin/master` at `3f0964d2` (4.6.0) · Status: planned, nothing built

The MVP plan that used to be in the issue body is replaced by this full-feature plan. Paths are relative to
`src/BorgDock.Tauri/` unless they start with `src-tauri/` (which is also under it) or `docs/`.

## Why

Related work spreads over several epics, T3 threads, branches and pull requests. Today nothing in
BorgDock answers three questions about it:

1. Which implementation do I keep?
2. What is left before the goal is reached?
3. Which decision unblocks it?

A workstream is a goal you curate by hand. It links ADO items, T3 threads and GitHub pull requests
from any configured repository and host. It records dependencies, open decisions between
alternative approaches, an editable next action and the outcomes the goal needs, each backed by
evidence.

## Decisions

Koen chose these on 2026-10-26:

- **Own rail section.** Workstreams sits after Dispatch in the rail (keys 1 to 6). Dispatch rows,
  PR cards, work item detail and thread rows get a membership chip and an "Add to workstream"
  action. It works without ADO.
- **Optional sync folder.** Workstreams are local by default. Settings can point them at a folder
  that a sync client (OneDrive, Syncthing) shares between machines. One file per workstream. A
  conflicting edit shows both versions and never overwrites silently.
- **Agents review and work.** "Review with agent" starts one T3 thread that reads every linked
  record and proposes a next action, decision outcomes and outcome evidence. You accept each
  proposal separately. "Work next action" starts a thread with a workstream brief.
- **Rules verify.** An outcome can carry evidence rules (PR merged into `master`, item reaches
  Done, checks green). When every rule is met by fresh evidence the outcome is verified by rule,
  with provenance. An outcome without rules needs your confirmation with evidence and a note.

I made these. Veto any of them before slice 1 starts:

- **Decisions are first-class.** "Alternative to" is not a loose edge. It is an open decision with
  two or more options. Choosing one marks the others superseded and records why. This is the
  answer to "which implementation do I keep".
- **A thread never verifies an outcome.** An agent saying "done" is not proof. Threads are context
  and supporting evidence only.
- **Superseding never writes by itself.** After a decision BorgDock offers cleanup through existing
  actions (close the PR with a comment, settle the thread, move the item through the run sheet).
  Each one asks first.
- **Inferred members are suggestions.** Children of a linked epic, threads Dispatch links to a
  member item, PRs a member thread opened. Nothing joins a workstream until you add it.
- **No team sharing.** Markdown export covers handing a workstream to someone.
- **No new source polling loop.** ADO items ride the ADO poll, PR lookups ride the GitHub poll,
  threads come from the T3 polls that already run. The only new timer lists the storage folder.
- **Hidden until finished.** One constant (`WORKSTREAMS_ENABLED` in
  `src/services/workstreams/feature.ts`) keeps the rail entry and the chips out of releases until
  slice 11 flips it. A patch release in between ships nothing half-built.

## The model

`src/services/workstreams/types.ts` (sketch, names final in slice 1):

```ts
interface Workstream {
  id: string;                 // crypto.randomUUID()
  title: string;              // ≤ 200
  goal: string;               // markdown, ≤ 10 000
  status: 'active' | 'paused' | 'done' | 'archived';
  pinned: boolean;
  members: Member[];          // ≤ 200
  outcomes: Outcome[];        // ordered, ≤ 50
  relations: Relation[];      // ≤ 300
  decisions: Decision[];      // ≤ 50
  nextAction: NextAction | null;
  proposals: Proposal[];      // from review runs, newest first, ≤ 20
  runs: WorkstreamRun[];      // threads started from this workstream
  dismissedSuggestions: string[];
  log: LogEntry[];            // ≤ 500, oldest dropped
  createdAt: string;
  completedAt: string | null;
}

interface Member {
  key: RefKey;                // identity, see below
  ref: SourceRef;
  role: 'primary' | 'supporting' | 'context' | 'superseded';
  label: string;              // title when linked, editable; shown when the source can't be read
  note: string;               // ≤ 500
  addedAt: string;
  addedBy: 'you' | 'suggestion' | 'agent' | 'run';
}

type NodeKey = RefKey | `outcome:${string}` | `decision:${string}`;

interface Relation {
  id: string;
  kind: 'blocks' | 'supersedes';
  from: NodeKey;
  to: NodeKey;
  note: string;
}

interface Decision {
  id: string;
  question: string;           // "Keep the queue rewrite or the patch?"
  options: RefKey[];          // ≥ 2 members: the alternatives
  status: 'open' | 'decided';
  chosen: RefKey | null;
  rationale: string;
  decidedAt: string | null;
  /** Roles of the options before the decision, so reopening restores them. */
  rolesBefore: Record<RefKey, Member['role']>;
}

interface Outcome {
  id: string;
  title: string;
  required: boolean;
  rules: EvidenceRule[];
  verification: Verification; // see "Evidence and verification"
}

interface NextAction {
  text: string;               // ≤ 500
  target: NodeKey | null;     // the member or outcome it is about
  setAt: string;
  setBy: 'you' | 'agent' | 'suggestion';
}
```

Every document on disk also carries `schema`, `revision`, `updatedAt` and
`writtenBy: { deviceId, deviceLabel }`.

Source metadata (title, state, checks) is never written into the document. It changes on every
poll, and writing it would bump revisions and cause conflicts between machines. A per-device cache
(`workstreams-cache.json`) keeps the last seen metadata per `RefKey` instead. The document keeps
only `label` and verification provenance.

## Identity

A reference is a discriminated `SourceRef`. Its `RefKey` is the identity. Display names and URLs are
kept for showing and opening, never for matching.

| Kind | `SourceRef` | `RefKey` | Resolved through |
| --- | --- | --- | --- |
| GitHub PR | `{ kind: 'github-pr', owner, repo, number, repositoryId? }` | `gh:github.com/<owner>/<repo>#<n>`, lower-case | the repo's bound `gh` account; else the account of a configured repo with the same owner; else the default; else "not connected: pick an account" (stored as `binding.account`) |
| ADO item | `{ kind: 'ado-item', organization, project, id }` | `ado:<organization>#<id>` (ids are unique per organization) | the configured organization; another one shows "not connected" |
| T3 thread | `{ kind: 't3-thread', environmentId, threadId, hostId }` | `t3:<environmentId>/<threadId>`, raw thread id | the configured host whose environment id matches, never its label |
| Link | `{ kind: 'link', url, title }` | `url:<normalized url>` | nothing, evidence only |

Consequences:

- PR #12 in two repositories are two members. A PR is never identified by number alone.
- `repositoryId` (the GraphQL node id) is stored once resolved. After a rename or transfer GitHub
  redirects, the node id still matches, and BorgDock updates `owner/repo` and the key with a log
  entry.
- Two hosts can hold the same raw thread id. The environment id keeps them apart.
- A host removed and added again under a new id resolves again, because its environment id is
  unchanged. A reinstalled T3 has a new environment id. Its threads show as missing, and relinking
  is explicit.
- BorgDock learns each host's environment id from `GET /.well-known/t3/environment`, which
  `src-tauri/src/t3/commands.rs::environment_id` already reads. Slice 3 exposes it as a command
  and records it on `HostStatus`.

`identity.ts` parses pasted input:

- `https://github.com/<owner>/<repo>/pull/<n>[/...]` and `<owner>/<repo>#<n>`
- `https://dev.azure.com/<org>/<project>/_workitems/edit/<id>`, `https://<org>.visualstudio.com/...`,
  `AB#<id>` and `#<id>` (the last two use the configured organization)
- `t3code://threads/<environmentId>/<threadId>` (the link `src-tauri/src/t3/desktop.rs::thread_link`
  builds)
- any other `https://` URL becomes a link

## Evidence and verification

### Freshness

Freshness belongs to each resolved reference, not to the workstream.

| Source | Live | Stale | Offline | Missing |
| --- | --- | --- | --- | --- |
| ADO item | ADO answered within 3 poll intervals and returned the item | ADO answered longer ago ("as of 10:42") | ADO failing | ADO answered without the item (deleted, or no access) |
| PR polled by BorgDock | the GitHub poll is current | poll failing ("as of") | | |
| PR looked up | open: read within 5 min; merged: final; closed: read within 1 h | older | GitHub failing | GitHub answered null for it two reads in a row |
| T3 thread | its host answered | | host not answering, last known state shown | the host answered twice without the thread |

Two more states sit beside these. `not-connected` means the organization, account or host isn't
configured. `unread` means the source hasn't been read on this device yet. The document's `label`
shows for both, and neither counts as evidence.

### Rules

`rules.ts` evaluates each rule to `met`, `unmet` or `unknown`.

| Rule | Met when | Unknown when |
| --- | --- | --- |
| `pr-merged(pr, into?)` | merged, into `into` when given | PR not live |
| `pr-checks-green(pr)` | every check on the head passed, none pending | checks not read, PR not live |
| `pr-approved(pr)` | review decision is approved | PR not live |
| `item-state(item, state)` | the item is in `state`, or later in its workflow | item not live |
| `item-category(item, category)` | the item's state category is `Resolved` or `Completed` (or later) | item not live |
| `item-delivered(item)` | the item's own PR, as Dispatch picks it (`pullRequest` with `shared: false`), is merged | item or PR not live |

`item-delivered` keeps Dispatch's rule about shared plan PRs. A PR linked on several items that names
none of them never proves one of them done.

Rule kinds come from a registry (`rules.ts` exports `registerRule`), so #87 can add
`deployed(environment, ref)` later without touching the resolver. An unknown kind (written by a
newer BorgDock on another machine) evaluates to `unknown` and keeps its data.

### Outcome states

- **Unverified.** No rule met yet, or no rules and no confirmation.
- **Verified by rule.** Every rule is met by live evidence. BorgDock writes a `Verification` with
  `at`, device and the facts it saw (`{ ruleId, result, observedAt, sourceKey, summary }`). Another
  machine without access to the source still shows "verified on Laptop, 24 Oct, PR merged into
  master".
- **Confirmed by you.** For an outcome without rules, or to override `unknown`. Needs at least one
  piece of evidence (a member or a link) and a note of up to 500 characters. Labelled "Confirmed by
  you" with device and date.
- **Invalidated.** It was verified, and a rule no longer holds (the item was reopened, the PR was
  reverted and re-opened). Needs attention until you re-verify, confirm, or change the rules.

A verified outcome whose source later goes offline stays verified and shows "source not reachable
since". Staleness never removes a verification. A contradiction does.

### Blocking and completion

- A `blocks` relation from A to an outcome holds while A is unresolved. A member is resolved when
  its PR is merged or closed, its item is in category `Resolved` or later, or its thread is settled.
  An outcome is resolved when verified or confirmed. A decision is resolved when decided.
- An outcome with an unresolved blocker shows "met, blocked by …" and doesn't count toward
  progress.
- Superseded members never block. Their edges stay visible, greyed.
- `blocks` and `supersedes` must each stay acyclic. `graph.ts` refuses an edge that closes a cycle.
  A merge from another machine can still produce one. That edge is marked conflicting and shows as
  attention instead of being dropped.
- Progress reads "N of M required outcomes verified". It counts verified and confirmed outcomes
  without open blockers.
- A workstream is ready to complete when every required outcome counts, none is invalidated and no
  decision on a required outcome is open. You press Complete. BorgDock never completes one by itself.
  A completed workstream whose outcome is invalidated later reopens as attention.

## Attention and the next action

`attention.ts` derives attention from the resolved workstream. Each entry has a tone, a reason and a
suggested next action. First match first:

1. A sync conflict on this workstream: "Changed on Mac mini. Choose what to keep."
2. An outcome invalidated: "Re-check: AB#123 left Done."
3. A member waits on you: a thread in `NEEDS_YOU`, or the item's Dispatch verdict has tone `bad`.
   "Answer the agent in M2."
4. An open decision blocks a required outcome: "Decide between owner/repo#12 and owner/repo#15."
5. The primary PR fails checks or has a merge conflict: "Fix failing checks on #12."
6. A required outcome depends on a member that is missing or not connected: "Relink the thread (its
   host is not configured)."
7. A blocker resolved since the next action was set: "Unblocked: release notes."
8. The next action is older than 7 days and no member moved since: "Stalled for 9 days."
9. Ready to complete.

The next action is yours and stays as typed. The card under it lists the suggested actions with
"Use", which copies one into the next action (`setBy: 'suggestion'`). Every change of the next
action goes to the log.

### Inferred members

`suggest.ts` proposes members, never adds them:

- children of a linked epic or PBI (ADO `System.LinkTypes.Hierarchy-Forward`), and its parent
- threads Dispatch links to a member item
- PRs Dispatch attributes to a member item, without shared ones
- PRs a member thread opened
- the PR whose head branch a member thread runs on

Each suggestion names why ("child of AB#100"). A dismissed suggestion stays dismissed for that
workstream (`dismissedSuggestions`).

## Architecture

### New code

```
src/services/workstreams/
  feature.ts      WORKSTREAMS_ENABLED
  types.ts        model above
  identity.ts     RefKey, parsing pasted input, URLs to open
  schema.ts       validation, limits, migrations, unknown fields kept
  graph.ts        cycle checks, topological order, layered layout for the Map
  rules.ts        rule registry and evaluation
  resolve.ts      members against source snapshots: state, freshness, display
  attention.ts    attention, suggested next actions, readiness, progress
  suggest.ts      inferred members
  merge.ts        three-way merge of two revisions of one document
  brief.ts        the brief agents get; parsing their proposals
  export.ts       Markdown and JSON export, JSON import
  sources.ts      which ADO ids and PRs the workstreams need read
  actions.ts      the only code that acts on T3, GitHub or ADO for a workstream
src/stores/workstreams-store.ts
src/runtime/workstreams-sync.ts
src/components/workstreams/
src-tauri/src/workstreams/{mod.rs, storage.rs, commands.rs}
```

Everything from `types.ts` to `export.ts` is pure and tested without a store.

### Data flow

```
ADO poll ─────► dispatch-store.items (+ context items) ─┐
GitHub poll ──► pr-store ─────────────────────────────┤
PR lookup ────► workstream PR cache ──────────────────┤──► resolve.ts ──► attention.ts ──► UI
T3 polls ─────► dispatch-store.threads, hosts ────────┤
storage ──────► workstreams-store (documents) ────────┘
```

`workstreams-store` holds a `resolved` map rebuilt by `recomputeWorkstreams()`, on the same pattern
as `recomputeOverview()` in `src/services/dispatch/sync.ts`. It compares input identities and does
nothing when none changed.

### Changes to existing code

- **`src/services/dispatch/engine.ts`.** `EngineInput.contextItems` holds the ADO items only
  workstreams need: done items, items of others, epics. The engine builds their `ItemOverview`s in a
  second `linkThreads` pass and returns them as `overview.context`. Dispatch's own linking runs
  unchanged, so `overview.items`, slots, notifications and `dequeue` don't move. A golden test
  pins that the existing fixtures give the same overview with and without context items.
- **`src/services/dispatch/items.ts`.** `loadDispatchItems` takes `contextIds` next to `extraIds`
  and reports the ids ADO did not return. Those become `missing`.
- **`src/services/ado/workitems.ts`.** `getWorkItems` sends no `errorPolicy`. Without it ADO
  rejects the whole batch when one id is deleted or out of reach. If that holds, one deleted
  starred item already blanks Dispatch today, and workstream ids would make it more likely. Slice 3
  checks this against ADO, adds `errorPolicy=Omit` and drops the `null` entries it returns.
- **`src/services/dispatch/sync.ts`.** `syncItems` passes the workstream ADO ids. A new ADO member
  triggers `syncItems()`, the way a newly starred item does in `src/runtime/dispatch-sync.ts`.
  `everySourceRead` is exported for the workstream notifications.
- **`src/services/dispatch/linked-prs.ts`.** Its cache and `fetchFromGitHub` move to
  `src/services/github/pr-lookup.ts`. Linked PRs and workstream PRs share one cache. Workstream
  lookups add `id`, `baseRefName`, `headRefOid`, `mergeable` and the head commit's
  `statusCheckRollup` to the fields. The existing linked-PR tests keep passing.
- **`src/runtime/workstreams-sync.ts`.** It subscribes to `pr-store` and `dispatch-store`. After
  the GitHub poll is accepted it looks up the workstream PRs the poll doesn't cover, batched per
  repository (50 per GraphQL query, as now). It also lists the storage folder while the window is
  visible (`src/runtime/visibility.ts`) and on focus. `src/runtime/application-runtime.ts` starts it
  next to Dispatch.
- **`src/stores/dispatch-store.ts`.** `HostStatus.environmentId`.
- **`src/stores/ui-store.ts`.** `ActiveSection` gains `'workstreams'` after `'dispatch'` in
  `SECTION_ORDER`. `MainView` gains `{ kind: 'workstream'; id; tab? }`.
- **`src/components/layout/Rail.tsx`, `src/hooks/useKeyboardNav.ts`.** Keys 1 to 6, and a rail badge
  with the count of workstreams whose attention has tone `bad`.
- **`src/services/navigation.ts`.** `showWorkstream(id, tab?)` pushes the detail view.
- **Settings.** A Workstreams section (`src/components/settings/WorkstreamsSection.tsx`, plus
  `sections-catalog.ts` and `settings-search-index.ts` entries) holds the storage folder, the device
  label and notifications. The two prompts sit with the Dispatch prompts in `AgentSection.tsx`
  (`agents.dispatchPrompts.workstreamReview`, `.workstreamWork`).

## Persistence

### On disk

- The folder is `%APPDATA%/BorgDock/workstreams/`, or `<sync folder>/BorgDock Workstreams/`.
- Each workstream is one file, `<id>.json`. Saving keeps the previous revision as `<id>.json.bak`.
- A deleted workstream moves to `.trash/<id>.json` and stays restorable for 30 days. Archive is the
  normal way out. Delete is only offered from the archive.
- `workstreams-device.json` (plugin-store, never in the sync folder) holds the device id and label.
  The label defaults to the computer name.
- `workstreams-cache.json` (plugin-store, per device) holds the last seen source metadata.
- `workstreams-pending.json` (plugin-store) holds edits not yet written, so a crash or failed write
  loses nothing.

### Rust commands

`src-tauri/src/workstreams/commands.rs`. All are `async` and do their file I/O in
`tokio::task::spawn_blocking` (see "Tauri sync commands and main-thread operations" in CLAUDE.md):

- `workstreams_list(dir)` returns `{ id, revision, schema, mtime, size, readable }` per file. It also
  finds conflict copies a sync client made (`<id>-<suffix>.json`, `<id> (1).json`).
- `workstreams_read(dir, id)` returns the document as JSON, or why it can't be read.
- `workstreams_write(dir, id, document, expectedRevision)` returns the new revision, or
  `Conflict { disk }` when the file's revision isn't `expectedRevision`. It writes a temp file in the
  same folder, flushes it and renames it over the target. `std::fs::rename` replaces on Windows. A
  per-folder mutex serializes writes.
- `workstreams_trash(dir, id)` and `workstreams_restore(dir, id)`.

Temp files start with `.tmp-` and `workstreams_list` skips them.

### Rules the store keeps

- **Revisions.** Each document carries `revision`. The store remembers per workstream the revision
  it last read or wrote. That is the base for writes and merges.
- **Serialized writes.** One queue per workstream. Text edits are debounced (400 ms). Structural
  edits (add, remove, relate, decide, verify) write at once.
- **Hydration can't win.** A read that started before an edit never replaces the edit. The store
  compares revisions and pending edits, and a slow read can't bring back a removed link.
- **Failures show.** A failed write keeps the edit in `workstreams-pending.json` and shows a banner on
  the workstream with Retry. Nothing is dropped quietly.
- **Malformed files stay.** A file that doesn't parse shows as "Can't read this workstream" with Open
  folder and Restore previous version (`.bak`). It is never rewritten or moved. A sync client may be
  writing it, so it counts as malformed only after two failed reads in a row.
- **Newer schema is read-only.** "Made by a newer BorgDock. Update to edit." Unknown fields in a
  readable document survive a round trip, so two versions on two machines don't strip each other's
  data.
- **Undo.** Remove, unlink, delete outcome and reopen decision show a toast with Undo for the
  session.

### Sync folder and conflicts

- Picking a folder in Settings, when both sides hold workstreams, offers "Merge both" (same id
  merges with `merge.ts`), "Use the folder's" or Cancel. Going back to local copies the folder's
  workstreams to local.
- `workstreams-sync` lists the folder every 15 s while the window is visible, and on focus. A file
  with a new revision is read. Without pending local edits it replaces the in-memory document.
  With pending edits `merge.ts` merges.
- `merge.ts` does a three-way merge on base, mine and theirs:
  - Collections with ids (members by key, outcomes, relations, decisions, proposals, log) merge as
    sets. Additions on both sides are kept. A removal wins only if the other side didn't change that
    entry since the base.
  - Scalar fields (title, goal, status, next action, one outcome's verification, one decision's
    choice) take the side that changed. When both changed differently, the field is a conflict.
  - The merged result is validated again. Cycles are flagged, not dropped.
- A conflict opens a merge view on the workstream: each conflicting field with mine, theirs and
  which device wrote it. You pick per field. Nothing is written until you finish.
- A conflict copy from the sync client opens the same view, with the copy as theirs. Finishing
  trashes the copy.

## UI

Every floating surface uses `--color-modal-bg` or `--color-toast-bg` (see "Floating surfaces need an
opaque token" in CLAUDE.md). Styles go in `src/styles/workstreams.css` with the existing tokens.

### Section list

`WorkstreamsSection.tsx`:

- Head: title, `Seg2` for Active, Paused, Done and Archived, search, New (key N).
- One card per workstream (`WorkstreamCard.tsx`): title and pin, the goal's first line, the next
  action (editable in place, key E), `SegmentedProgress` with "3 of 5 required outcomes verified",
  the top attention reason with its count, member counts per kind ("2 items · 3 PRs · 4 threads"),
  a health dot per source involved (an offline T3 host is yellow) and "updated 2 h ago on Mac mini".
- Order: pinned, then attention tone, then last update.
- Cards for unreadable files, newer schema and conflicts.
- Empty state: New workstream, and a line saying a Dispatch item or PR can start one ("Add to
  workstream" there).

### Detail view

`WorkstreamDetail.tsx`, pushed with `showWorkstream` so Back returns to where you came from. Tabs
Overview, Members, Map and Activity.

- **Header.** Editable title, status pill, Work next action, Review with agent, and a menu with
  Pause, Complete, Export Markdown, Export JSON, Archive and Delete.
- **Overview.** The goal (Markdown, edit and preview with `src/components/shared/Markdown.tsx`). The
  next action card with its target and the suggestions. Attention. Outcomes, ordered, reordered with
  move up and down (keyboard too), each with its rules as chips coloured by result, the verification
  line with provenance, and Confirm, Add rule, Unconfirm. Decisions, open first, each option a member
  row with Choose. Agent proposals from the newest review run.
- **Members.** A table grouped by role; Superseded is collapsed. Columns:
  - source icon and identity (`owner/repo#12`, `AB#123`, `Mac mini · thread title`)
  - title
  - state, reusing Dispatch's pieces (`ThreadStatusPill`, the verdict tone, PR state with
    `CheckBar`)
  - freshness: live, "as of 10:42", "offline since 09:10", missing, not connected
  - relations: "blocks 2 · blocked by 1"
  - row menu: Open, Role, Add relation, the source's own actions, Remove

  Open goes to the original record: a polled PR opens with `showPr`, another PR in the browser, an
  item with `showWorkItem` or in ADO, a thread in T3 (`t3ShowThread`). Inferred suggestions show as
  a band above the table with Add and Dismiss.
- **Map.** A layered graph of the non-context members, the outcomes and the decisions. `blocks` is
  a solid arrow, `supersedes` dashed, a decision links to its options. Drag from a node's handle to
  another node to add a `blocks` edge. Without a mouse, select a node, press B and pick the target.
  An edge that closes a cycle is refused with the path it would close. A node opens the same panel
  as its member row. The layout is in-house (`graph.ts`: longest-path layers, barycenter ordering).
  Workstreams hold at most 200 members, so a layout library isn't worth a dependency.
- **Activity.** The log, newest first, filtered by kind.

### Adding records

`LinkPicker.tsx` is one dialog with one input:

- Pasted input is parsed with `identity.ts`. A parsed reference the sources can't resolve still
  links, as not connected or unread, with the reason.
- Typed text searches known records: Dispatch items and context items, every PR in `pr-store`
  across repositories, threads of every host (open first).
- Several can be picked at once, with a role (Supporting by default) and a note.

### Across BorgDock

- **Membership chips.** On Dispatch rows (`WalkRow.tsx`, `DispatchRow.tsx`, the board card),
  `DispatchDetail.tsx`, PR cards, the PR detail header and work item detail. At most two chips and
  "+n". A chip opens the workstream.
- **"Add to workstream…".** In the same places and on Dispatch's unlinked threads, it opens a menu
  of recent workstreams plus New workstream. The pop-out PR and work item windows emit
  `workstreams-add` to the main window, which owns every write. That follows `OPEN_PR_DETAIL_EVENT`
  in `src/services/navigation.ts`.
- **Focus.** A card with the next actions of workstreams that need attention, the top three, next
  to `DispatchFocusCard`.
- **Notifications.** Setting `workstreams.notifications`, on by default. BorgDock notifies when a
  workstream is unblocked, an outcome is invalidated, a sync conflict appears or a review run has
  proposals. It stays quiet until every source was read once, as Dispatch does (`everySourceRead`).
- **Keys.** In the section: J/K, Enter opens, N new, E next action, L add, R review with agent, W
  work next action. Enter inside a text field keeps its normal behaviour.

## Agent runs

### Brief

`brief.ts` builds the Markdown brief both runs start with: goal, outcomes with their rules and
results, members with identity, URL, role, state and freshness, decisions, relations and the next
action. It ends with the rule "Propose; don't change ADO states, close PRs or settle threads". It
stays under the 20 000 characters `startRun` allows: context members are dropped first, then notes,
and the brief says what it left out.

### Review with agent

- The run sheet opens with `RunIntent { kind: 'workstream-review', workstreamId }`. Slot, model and
  effort come from `LaunchChoiceFields` and `useLaunchChoice` (`LaunchChoice.tsx`), which
  `RunSheet.tsx` and `LaunchSheet.tsx` already share.
- The thread is called `Workstream: <title>`. `linkThread(threadId, null)` keeps Dispatch from
  attaching it to an item through its `AB#` mentions, the same as `startRun`. It joins the
  workstream as a context member (`addedBy: 'run'`), and `runs` records it, so the run follows the
  workstream to the other machine.
- The prompt (`agents.dispatchPrompts.workstreamReview`, placeholders `{brief}` and `{title}`) asks
  the agent to read every linked record, then end with one fenced block:

  ````
  ```borgdock-proposal
  { "version": 1,
    "nextAction": { "text": "...", "target": "gh:github.com/owner/repo#12" },
    "decisions": [{ "decision": "<id>", "choose": "<RefKey>", "rationale": "..." }],
    "outcomes": [{ "outcome": "<id>", "evidence": ["<RefKey>"], "note": "..." }],
    "members": [{ "add": "<url>", "role": "supporting", "why": "..." },
                { "key": "<RefKey>", "role": "superseded", "why": "..." }],
    "newOutcomes": [{ "title": "...", "rules": [...] }],
    "risks": ["..."] }
  ```
  ````

- When the thread stops (a `NEEDS_YOU` status, or settled), BorgDock reads its last agent message.
  `readDetails` in `sync.ts` reads only `NEEDS_YOU` threads today. Slice 9 reads run threads once
  more when they settle. `brief.ts` parses the last proposal block, drops references the workstream
  doesn't know (the proposal says so) and stores it in `proposals`.
- Each proposal has Accept and Dismiss. Accepting goes through the same store action as a hand edit,
  with provenance "proposed by the agent in <thread>". Accepting a proposed confirmation is your
  confirmation. An agent never verifies anything by itself.
- A reply without a proposal block shows the agent's last message with Open in T3.

### Work next action

- The launch sheet opens for the workstream. You pick slot, model, effort and plan first.
- The first message is `agents.dispatchPrompts.workstreamWork` with `{brief}` and `{nextAction}`.
- When the next action targets an ADO item, the thread is called `AB#<id> <title>` and is linked to
  that item (`linkThread(threadId, itemId)`), so Dispatch shows the agent on that row. Without an
  item target it goes through `startRun` and is linked to nothing.
- The thread joins as a supporting member.

### Acting on members

`actions.ts` is the only workstream code that writes to T3, GitHub or ADO. It resolves the target
again right before it acts. If the target is no longer live, or no longer in the state the button
showed, the action doesn't run and says why. That is the same guard `runItemAction` in
`src/services/dispatch/actions.ts` uses.

- An item uses `unitActions(overview)` from Dispatch, matched by action id.
- A thread uses `dispatchActions` on the freshly resolved `AgentThread`.
- A PR uses `src/services/pr-actions.ts`.
- After a decision, "Clean up superseded work" lists per superseded member what can be done. An
  open PR can be closed with a comment ("Superseded by owner/repo#12." by default, editable). The
  workstream's title and goal are never put in it unless you type them. An open thread can be
  settled. An item can be moved through Dispatch's run sheet, because a move needs the repository's
  skills. Each action asks in a `ConfirmDialog`.

## Slices

Each slice is one PR to `master`. Slices 1 to 4 change nothing visible. Slice 5 is the first one you
can see while `WORKSTREAMS_ENABLED` is on in dev. Slice 11 turns it on for the release.

- [ ] **1. Model, identity, schema, graph.** `types.ts`, `identity.ts`, `schema.ts`, `graph.ts`,
  `feature.ts` and tests. Done when keys never collide across hosts, repositories and organizations;
  every input form in the parsing table parses; validation enforces the limits, keeps unknown fields
  and flags a newer schema; cycles are refused and found in loaded documents.
- [ ] **2. Storage and store.** `src-tauri/src/workstreams/`, registered in `src-tauri/src/lib.rs`;
  `workstreams-store.ts` with create, edit, pin, pause, archive, restore, trash, revisions, write
  queue, pending edits, undo and device id. Rust tests cover atomic write, conflict, `.bak`, a
  malformed file left in place, skipped temp files and conflict copy detection. Vitest covers a
  restart round trip with every field, a delayed read that can't bring back a removed link, and a
  failed write that keeps the edit and retries.
- [ ] **3. Sources.** The engine's `contextItems` pass with the golden test, `contextIds` and missing
  ids in `items.ts`, `pr-lookup.ts` taken out of `linked-prs.ts`, `HostStatus.environmentId`,
  `workstreams-sync.ts` lookups and the per-device cache. Done when the Dispatch fixtures give the
  same overview as before; a Done item and a merged PR in an accessible repository that BorgDock
  doesn't follow resolve; a deleted item and a deleted thread are missing; a removed repository or
  host is not connected.
- [ ] **4. Resolver, rules, attention, suggestions.** `resolve.ts`, `rules.ts`, `attention.ts`,
  `suggest.ts` with the fixtures below. Done when unknown never counts as verified; a shared plan PR
  never satisfies `item-delivered`; blockers keep outcomes from counting; superseded members never
  block; alternatives stay visible; freshness is per reference; a merged cycle shows as attention.
- [ ] **5. Section, list and detail.** The rail entry, `ui-store`, `useKeyboardNav`,
  `showWorkstream`, `WorkstreamsSection`, `WorkstreamCard`, `WorkstreamDetail` with Overview (goal,
  next action, attention) and Members, `LinkPicker`, opening members, stories in
  `src/components/workstreams/*.stories.tsx` and in `MainWindow.stories.tsx`. Done when a user
  without ADO creates a workstream from GitHub PRs and T3 threads and inspects it; Dispatch is
  unchanged; screenshots in both themes, normal and narrow, have been read and fixed.
- [ ] **6. Outcomes, rules, decisions, relations.** `OutcomeList`, `RuleEditor`,
  `ConfirmOutcomeDialog`, `DecisionPanel`, `RelationDialog`, the store actions and their log
  entries. Done when confirming needs evidence and a note; rules verify with provenance and
  invalidate; a cyclic `blocks` is refused with its path; deciding marks the other options
  superseded and reopening restores their roles.
- [ ] **7. Map and Activity.** The layered layout in `graph.ts` (pure, tested), `MapTab` (SVG, focus
  order, drag and key B to link), `ActivityTab`. Done when a 200-member workstream lays out without
  crossings it could avoid, and every map action also works from the keyboard.
- [ ] **8. Across BorgDock.** Chips and "Add to workstream…" in Dispatch, PRs and work item detail,
  the pop-out window events, the Focus card, the rail badge, notifications and the inferred
  suggestions band. Done when a PR detail pop-out adds its PR to a workstream; notifications stay
  quiet on first sync and after a host comes back.
- [ ] **9. Agent runs.** `brief.ts` with proposal parsing, the review run sheet, the work launch,
  the two prompts in settings, the extra detail read for run threads, the proposals panel, guarded
  member actions and the superseded cleanup. Tests never launch, answer or settle against a real T3
  (CLAUDE.md, "Checking against the real T3"). Before release Koen runs one review and one work
  launch against his own T3.
- [ ] **10. Sync folder.** `WorkstreamsSection` in settings (folder picker through
  `@tauri-apps/plugin-dialog`; the settings window already has `dialog:default`), the storage
  switch with merge, folder listing, `merge.ts`, the merge view and conflict copies. Done when two
  stores on one folder never lose an edit: different fields merge, the same field asks.
- [ ] **11. Export, docs, release.** `export.ts` (Markdown to clipboard or file, JSON export and
  import with merge), a "Workstreams" section in `CLAUDE.md` with what bites, the rules section of
  this plan moved to `docs/superpowers/specs/2026-10-26-workstreams.md`, the e2e spec
  `tests/e2e/workstreams.spec.ts`, `CHANGELOG.md` with heroes (`design/whats-new/<version>.heroes.json`),
  site screens, and `WORKSTREAMS_ENABLED` turned on.

Slices 6, 7 and 8 depend on 5 but not on each other. Slices 9 and 10 depend on 4 and 5 only.

## Fixtures

`src/services/workstreams/__tests__/fixtures.ts`, all names invented (BorgDock is public):

- two repositories, each with PR #12
- two T3 hosts holding the same raw thread id
- one ADO id in two organizations
- a shared plan PR linked on three PBIs of one epic
- a repository removed from settings, and a host removed from settings
- a host removed and added again under a new id with the same environment id
- a deleted ADO item, a deleted thread and a PR in a repository that went private
- a workstream whose required outcome depends on an unavailable member
- two alternatives under one open decision, then decided, then reopened
- a blocker chain of three, the middle one superseded
- two revisions merged into a `blocks` cycle
- a file written by schema 2, a malformed file and a OneDrive conflict copy

## UI verification

Stories cover the empty, populated, attention, archived, offline, unreadable, newer-schema,
conflict, proposals and map states. Capture each with `scripts/screenshot-stories.mjs` in both
themes, at the normal main window width and at the narrow sidebar width, read every image and fix
what looks wrong. Check the light theme's floating surfaces, long titles and goals, focus return
after every dialog and the merge view, contrast of the result chips, and that Enter in the goal and
next action fields inserts a line or saves as they say.

## Privacy

- Logs name workstreams by id only. Titles, goals, notes and next actions never reach
  `borgdock.log`.
- Exports and PR comments carry only what you see in the dialog before it goes out.
- BorgDock reads no thread transcript for a workstream. Only the agent of a review run does, and
  only the threads in its brief.

## Risks

- **T3 writes.** Launch and settle were never run against a real T3 in tests, the same as in
  Dispatch. Slice 9 ends with Koen's manual check.
- **GitHub rate limit.** Lookups are batched per repository, merged PRs are read once and open ones
  every 5 minutes. 200 members at most bounds the cost.
- **Sync clients.** A partial file during a sync client's write is ignored until it parses or fails
  twice. The atomic rename means BorgDock itself never leaves one.
- **Engine change.** The context pass runs separately, and the golden test fails if Dispatch's own
  output moves.
- **Rail key shift.** Pull requests moves from key 3 to 4, Work items from 4 to 5 and Worktrees from
  5 to 6. The What's New entry says so.

## Not in this feature

- team sharing or several people editing one workstream (Markdown export covers handing one over)
- grouping without your say, and BorgDock closing, merging, moving or settling anything by itself
- posting workstream summaries to ADO or GitHub
- deployment evidence (#87) and digest entries (#88): rule kinds and log events are where they
  plug in
