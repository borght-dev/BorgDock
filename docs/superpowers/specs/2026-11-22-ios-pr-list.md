# iPhone pull request list: the desktop's views, filters, groups and order

Mockup: `design/ios-pr-list/mockups.html`. Desktop rules: `2026-11-11-pr-overview.md`.

## Decided (2026-11-22)

- **The phone matches the desktop.** Tabs All, Your turn, Mine, Failing, Ready to merge, Stale. No Waiting tab and no
  "Dependency updates as one group". Your pull requests first and the Drafts switch go (`-is:draft` is a filter).
- **The phone derives the facts itself.** The server sends what GitHub says (reviewers asked, teams asked, each
  reviewer's latest review, your teams, the stale threshold); `PrList.swift` ports `services/pr-list/` (facts, query,
  facets, groups, sort, display) one to one. Logic moves to the phone, not the server: the long-term aim is a phone
  that needs no server.
- **Priority's tie-break stays on the server for now**: `PrSummary.priorityScore` is Focus's score. It needs when your
  review was first requested, which only a poller knows; it moves to the phone with the polling.
- **Focus's Waiting on others row opens its own list** (yours under review, ones you reviewed), not a tab.
- **New installs start like the desktop**: grouped by status, by priority, most urgent first.
- **Saved views sync between the desktop and the phone** through the server (below).
- **E2E reports and shared CI failures** clear a red PR on the phone as on the desktop (below). The parsing and
  judging are ported to Swift; the server only fetches.

## Saved view sync

The server keeps one list: `GET /api/pr-views` → `{ revision, views, updatedAt }`, `PUT /api/pr-views`
`{ baseRevision, views }` → the new list, or 409 `{ error, current }` when `baseRevision` is not the current revision.
The server never merges; it compares and sets. Both a phone session and a linked desktop session may call both.

Each client keeps:

- its views (desktop: `ui-state.json` `prSavedViews`; phone: `UserDefaults`);
- the **base**: the revision and the views it last read from or wrote to the server.

Which view is on screen stays per device.

**Merge** (pure, the same on both sides: `mergeViews(base, mine, theirs)`), views compared by id and by their JSON:

1. Start from `theirs` in its order.
2. A view in `mine` and not in `base` was added here: append it (unless `theirs` has that id, then rule 4).
3. A view in `base` and not in `mine` was deleted here: drop it.
4. A view in `mine` that differs from its `base` copy was edited here: it replaces `theirs`' copy, or comes back at the
   end if `theirs` deleted it.
5. Everything else is `theirs`.

**Pull** (desktop every 60 s while linked, phone when the list appears and on refresh): read the server. Nothing
changed here since the base → take `theirs` and make it the base. Changed here → merge, PUT over `theirs.revision`.

**Push** (after a local change, debounced): PUT over the base revision. 409 → merge with `current`, PUT again. A
success makes the answer the base.

A view's `display` keeps fields the client doesn't know. The phone writes the desktop's defaults for layout and
columns when it creates a view.

If the active view disappears in a pull, the list goes back to All. If it changed in a pull and you had not edited
it, the list shows the new version.

## Quick Review next

Mockup section 05. Desktop: `services/author-run.ts`, `author-run-session.ts`, `services/e2e/`, `ci-failures/lens.ts`,
`components/focus/QuickReviewSummary.tsx`.

- **Review on a pull request reviews it alone**: a row's swipe and long-press, the PR page's Start review. Focus's Start
  review still runs the whole queue.
- **The end card** (`ReviewEndCard`) lists every pull request this Quick Review showed with its decision (approved,
  commented, skipped, walked; request changes counts as commented, as on the desktop), counts them when there is more
  than one, lists what an author run left out with the reason, and offers Next from the author (`nextFromAuthor`: passing
  checks first, then the oldest without conflicts or requested changes; it starts that author's run) and Review next
  (Focus's review queue, then the rest, passing checks first, never the same author). The highlighted button goes to the
  same author unless only the other has passing checks. Done closes.
- **Author run** (long-press "Review <name>'s PRs, oldest first", and an author group's Review all): the pressed pull
  request opens at once; the rest of the author's open, non-draft pull requests you haven't approved at their head fill
  in once their E2E reports are read, leaving out conflicts, requested changes and red ones that are their own doing. A
  report still unread when the run fills leaves its pull request out ("E2E report not read"). On your own pull request
  the item is Walk through this PR: the decide sheet offers Comment and Done, never a verdict.
- **What the server sends, raw**: `PrSummary.failedChecks` (name, job id, run id and number, completion time; GraphQL
  `workflowRun.runNumber`) and `CiFailureGroup.facts` (tier, repositories, pull requests, their job ids, base-branch
  runs, retries that passed, catalog ids, failed steps) over every failure the server keeps, not only the live
  `branches`. The report comes from `/comments` and the changed files from `/files`; the phone reads them only for an
  author run (`E2eReports`), with up to 12 neighbours' reports for shared failing tests.
- **What the phone derives**: `E2eReport` (parse, `coveredChecks`, the verdict), `CiLens` (shared groups, the outside
  cause, blocked counts; `PrFactsContext.ciOf`), `AuthorRun`. The server has no classifications or resolved groups, so a
  group's cause is always its strongest hypothesis. A red pull request a shared failure clears shows the desktop's
  marker ("not this PR", "shared ×N", "also on main") and a "Red, but not its doing" banner in the run.
- **Not on the phone yet**: the desktop's Approve & merge past such failures (`gh pr merge --admin`). The phone keeps
  Approve & auto-merge.
