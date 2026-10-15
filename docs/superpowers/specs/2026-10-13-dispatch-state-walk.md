# Dispatch: walk the states

Date: 2026-10-13 · Branch: `feat/dispatch-state-walk` · Prototype: brainstorm round 2 (T3 thread)

## Why

Dispatch sorts items into its own buckets (Waiting on you, Out of sync, Agents working, …). The
morning routine it should replace walks ADO states instead:

1. **Code Review**: is the PR merged? Then the item goes to Ready For QA, with Developer Notes.
2. **Development In Progress**: is it really in progress, or is there already a PR or a merge?
3. **Testing Failed**: pick it up, fix, PR.
4. **Needs Human**: read what Vera asks and answer.
5. **New**: choose what to start.
6. Nothing New: pick the first sensible unassigned item from the current sprint.

The buckets don't map onto that walk, so the routine still happens in ADO and GitHub side by side.

## What changes

A new default view, **States**, next to List and Board.

- **Overview grid**, collapsible. One row per state and one square per item, colored by verdict.
  Collapsed, it is one line of colored pips per state. Clicking a square selects the item and
  scrolls to it.
- **One section per ADO state**, in walk order: Code Review, Development In Progress, Testing
  Failed, Needs Human, New. These five always show, even when empty ("Nothing bounced back from
  QA"). Any other state an item is in follows them, ordered by its workflow category.
- **A row** carries: type pill, id, title · verdict · state menu. Below that: evidence chips (PR,
  checks, agent, due date). Below that: the **latest message**. For items waiting on you the
  latest message is shown in full as a quote. Clicking a row opens the existing item detail in
  a drawer, as the board already does.
- **State menu on every row**: every state of the item's workflow (grouped by category, Done
  included). Picking one opens the run sheet for that item: an agent makes the move.
- **Out of sync**: when the evidence contradicts the ADO state (see *Drift*), the row says so and
  offers **Move to <state>**, which also opens the run sheet for that one item. BorgDock never
  changes a state itself: a move needs Developer Notes, QA notes and required fields, which the
  repository's skills describe.
- **Sync with agent** on every section that has items, **Fix out of sync (N)** and **Sync all
  (N)** in the header. Each starts **one T3 thread** that works through the chosen items one by
  one, following the repository's own ADO skills (for FSP-Horizon: `ado-update-for-qa`,
  `ado-dev-in-progress`, the post-merge rules of `/ado-fix`). BorgDock does not write Developer
  Notes itself: in most cases they need a rewrite that only an agent can do.
- **Schedule**: Sync all (every item) can repeat on chosen weekdays at a time of day. It runs while
  BorgDock is open, in the slot and model of the last sync.
- **Next pickup**: "Suggest my next item" starts a T3 thread that reads the unassigned New items of
  the current sprint and recommends one. Its answer shows in Dispatch when the thread finishes.
- **Merge** is not done from Dispatch. "Ready to merge" offers "Open #N", which opens the PR in
  BorgDock.
- **Focus**: the strip becomes a card showing the shape of the work (one bar segment per state) and
  the items that wait on you, each with its latest message.

## Rules

### Latest message

The newest of:

- the item's newest ADO comment. A comment that starts `Vera · <kind> —` is attributed to Vera, as
  `Vera · <kind>`, even when it was posted with someone else's account,
- the newest block of Developer Notes (`Custom.DeveloperNotes`, newest first by the repo's prepend
  rule), dated from the first `YYYY-MM-DD` in the block,
- the agent's last message in the item's current thread (known for threads that stopped).

### Pull requests of an item

- Found three ways: the pull requests of the item's threads that name it or that ADO links, the
  pull requests BorgDock polls that name it, and every pull request ADO links on it. The last
  ones are read from GitHub by number (`linked-prs.ts`): merged and closed ones once, open ones
  again after five minutes.
- ADO names a linked pull request's repository by an id of its own. Which GitHub repository that
  is gets learned once and kept (`linkedRepositories` in `dispatch-state.json`): the configured
  repository whose pull requests name the items that link them.
- A pull request is **shared** when several of my items have it and its title and branch name
  none of them (the plan of an epic, linked on every PBI). A shared pull request is shown, but it
  says nothing about the item's state.

### Drift: the state the evidence asks for

First rule that applies; never for Needs Human, Testing Failed, a hold, Done or Removed, and never
to a state the item is already past. It holds while the item's agent runs too.

| Evidence (own pull requests only) | Move to |
|---|---|
| A merged PR and none open | Ready For QA (else the first resolved state, else Done) |
| An open non-draft PR, item not yet resolved | Code Review (never Plan Review) |
| Not started, with an open thread | Development In Progress |

"Keep <state>" hides a drift until its evidence changes.

### Verdict (first rule that applies)

| Condition | Verdict | Tone |
|---|---|---|
| The current thread waits on you | Agent asks / Plan to review / … | bad |
| State is Needs Human | Waiting on you · N days | bad |
| Due date passed, not yet resolved | Overdue · N days | bad |
| The item's agent runs | Agent on it | run |
| A drift | Out of sync | warn |
| Resolved, review state, open PR with failing checks | CI red | bad |
| … open PR approved, checks green | Ready to merge | ok |
| … open PR, checks running | Checks running | run |
| … open PR otherwise | In review | mute |
| … merged, drift kept | Merged | mute |
| … no PR at all | No open PR | warn |
| Resolved, other state (Ready For QA, Test In Progress) | With QA | mute |
| Testing Failed | Bounced back | bad |
| In progress, open non-draft PR | PR open | warn |
| In progress, linked PRs, none open, no agent | Next step? | warn |
| In progress, no PR, no agent | Nobody on it | warn |
| In progress, quiet more than 5 days | Quiet · N days | warn |
| In progress otherwise | In progress | mute |
| Proposed with a thread | Agent started | run |
| Proposed | Not started | mute |

`mute` and `run` rows are dimmed: they need nothing now.

### Agent runs

- Prompt templates in Settings → Agents, next to the existing ones: **Sync** (`{items}` = one line
  per item: id, title, state, PR evidence) and **Suggest next** (`{iteration}` = the sprint most of
  my items are in, `{assigned}` = my open items).
- A run thread is linked to no item, so its many `AB#` mentions don't attach it to one. A run for
  one item (a move) is linked to that item, so its row shows the agent at work.
- Each line of `{items}` names the move: the one I picked in the state menu, else the drift with
  its reason.

### Threads of an item

- A thread names an item in its title, branch, pull requests or conversation. A thread that names
  more than three topics is an overview and belongs to none; when its conversation names too many,
  what it names itself (title, branch, pull requests) still counts.
- An epic and its PBIs are one topic, and a thread about an item's parent works on the item.
- A subagent's items belong to the thread it works for (T3's `lineage.rootThreadId`). A subagent
  never settles in T3, and its branch and pull requests are its checkout's, so Dispatch holds it
  as settled and reads only its conversation.
- Runs are remembered (`dispatch-state.json`), so the section can show "Agent syncing in W0" and,
  once the thread stops, its last message.

## Out of scope

- Items in another ADO project (BorgDock reads one project; 59685 lives in Gomocha Operations).
- Reading contradictions out of Developer Notes (for example "fleet NO-GO" while in Code Review).
  The latest-message line shows the text; judging it is the agent's job.
- Merging from Dispatch.

## Build order

1. Data: iteration path, Developer Notes and the newest comment on `DispatchItem`; review status on
   pull requests.
2. `verdict.ts`: latest message, verdict and evidence, pure and tested; the engine adds them to
   `ItemOverview`.
3. `walk.ts`: sections in walk order and the overview grid, pure and tested.
4. UI: `DispatchWalk` (grid, sections, rows, state menu, drawer), view mode States as default.
5. Runs: prompts, settings (TS + Rust), `startRun`, run sheet, run banner, Next pickup.
6. Schedule: setting, scheduler hook, controls in the run sheet.
7. Focus card.
8. Storybook story, screenshots, tests, lint, types.
