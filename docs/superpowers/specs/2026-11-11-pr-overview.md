# Pull requests overview: views, filters, grouping, board

Design: `design/pr-overview/mockups.html` (artboards A–E). Proof: `docs/proof/pr-overview/`.

## Why

The list showed 93 PRs as one long scroll. Group and sort hid behind an unlabelled icon, the shared
CI failure cards took a third of the screen, "Needs you" matched 65 of 93 PRs, and every row
spread its status over a check count and a chip that did not say who had to act.

## Model

Everything the list shows comes from one pure function, `buildPrListModel`
(`src/BorgDock.Tauri/src/services/pr-list/model.ts`), over per-PR facts (`facts.ts`). The list,
the board and `J`/`K` read the same result, so what the keys walk is what is on screen.

- **Facts are derived once per poll** (`buildFacts`): bucket, review state, next step, size, age,
  stale, work items, the CI failure store's view of a red PR.
- **The query string is the only filter state.** Chips are a view of its qualifiers; picking a
  value or removing a chip rewrites the string (`setTerm`, `removeTerm`). A saved view stores the
  string.
- **Display** (`display.ts`) is one object: layout, grouping and sub-grouping, order and direction,
  switches, columns. `sanitizeDisplay` reads it back from disk with defaults for anything missing.

## Rules

### Your turn

Any of these makes a PR yours:

1. A review is requested from you, personally or through one of your teams.
2. Your PR fails a check, unless every failed check sits in a shared failure that is not its doing
   (`PrCiFacts.outside`; the base branch, infrastructure or a flaky test).
3. Your PR has conflicts, changes requested, or comments.

A draft is never your turn, not even someone else's draft that asks for your review.

### Status buckets (first match)

Draft → Your turn → Ready to merge (approved, green, mergeable) → Failing → Waiting for review.

### Next step (first match)

| Condition | Mine | Someone else's |
|---|---|---|
| Draft | Finish the draft | Draft · author |
| My PR has conflicts | Resolve conflicts | |
| My review is requested | | Your review |
| Conflicts | | Conflicts · author |
| A failure that is the PR's own | Fix checks | Fix checks · author |
| Changes requested | Address changes | Address changes · author |
| Comments on my PR | Reply to comments | |
| Failures that are not its doing | Blocked by shared CI | Blocked by shared CI |
| Checks running | Checks running | Checks running |
| Ready | Merge | Merge · author |
| Reviewers still asked | Review · names | Review · names |
| Approved, checks unknown | Checks unknown | Checks unknown |
| Commented, nobody asked | | Reply · author |
| Nobody asked | Request a review | Needs a reviewer |

"Waiting on" groups and the `waiting:` qualifier use the step's actor: you, the author, reviewers,
CI.

### Priority order

Bucket rank (Your turn, Ready, Failing, Waiting, Draft), then Focus's priority score, then the
oldest PR first. Ties in every other order go to the higher PR number, so rows do not jump between
polls.

### Grouping

- Fixed groupings keep their own order and, with "Show empty groups", their empty groups: status,
  review state, waiting on, age, size.
- Author: you first, then most PRs. Repository: repositories with your PRs first, then by name.
  Work item, label, base branch: most PRs first, the "none" group last. A PR with several labels
  or work items is grouped once, under the first.
- A pinned "Your turn" group sits above the other groups on the All tab, unless the grouping is
  Status, Author or none, or the layout is the board.
- "Collapse groups with nothing for you" folds groups without a Your turn PR until you open one;
  your manual folds and opens are session state.
- The board ignores sub-groups and folding.

### Views

- Built-in tabs: All, Your turn, Mine, Failing, Ready to merge, Stale. Counts ignore the query and
  follow "Hide failing" (Failing keeps its own count).
- A saved view keeps its tab, query and display. While it is on screen, display changes are its
  own until **Update view**; leaving it for a built-in tab drops its query and brings back the
  built-in tabs' display.
- Display, saved views, the active view and the CI summary switch persist in `ui-state.json`
  (`prListDisplay`, `prSavedViews`, `prActiveView`, `prCiSummary`).

### Changes and animation

A filter, group or sort change waits for the leaving rows to fade (FLIP). Until then the stores
hold the old state, so a second quick change or saving a view applies the waiting change first
(`services/pr-list/pending-change.ts`). Without that, Group then Sort dropped the grouping.

## Not built

From the mockups: Workstream grouping, Workstream / T3 thread / Risk / Labels / Work item columns
(labels and `AB#` items sit on the title line instead), and the search box's coloured tokens.
