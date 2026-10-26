# Workstreams: the rules

A workstream is a goal you curate. It holds ADO items, T3 threads, GitHub pull requests and links
(members), the relations between them, the decisions between alternative approaches, and the
outcomes the goal needs with the evidence behind each. This file lists the rules the code keeps.
Plan and reasons: `docs/superpowers/plans/2026-10-26-workstreams.md` (issue #86).

Change a rule in its code and in this table together. Code: `src/services/workstreams/`.

## Identity (`identity.ts`)

| Kind | `RefKey` | Parsed from |
| --- | --- | --- |
| GitHub pull request | `gh:github.com/<owner>/<repo>#<n>`, lower case | PR address, `owner/repo#n` |
| ADO item | `ado:<organization>#<id>` | item address, `AB#<id>` (the configured organization) |
| T3 thread | `t3:<environmentId>/<threadId>` | `t3code://threads/<environmentId>/<threadId>` |
| Link | `url:<normalized address>` | any other `http(s)` address |

A thread is found by the environment id of the T3 install that holds it, never by a host label.
A document never stores what a source says (titles, states, checks). The device cache
`workstreams-cache.json` keeps the last seen title.

## Freshness (`resolve.ts`)

Freshness belongs to each member, not to the workstream.

| Source | Live | Stale | Offline | Missing |
| --- | --- | --- | --- | --- |
| ADO item of Dispatch | ADO answered within 3 poll intervals | ADO answered longer ago | ADO failing | ADO answered without it |
| ADO item read only for workstreams (context) | its own read (`contextStatus`) answered within 3 poll intervals | older | that read failed | ADO answered without it |
| PR polled by BorgDock | its repository answered within 3 poll intervals (`repoPolledAt`) | its repository failed since | | |
| PR looked up | read within 15 min (open), 3 h (closed), any time (merged), and the last read didn't fail | older, or the last read failed | GitHub failing, never read | GitHub said "no such PR" twice in a row |
| T3 thread | its host answered | | host not answering, last state shown | the host answered without it |

`not-connected` (the organization, account or host isn't configured) and `unread` (not read on this
device yet) show the label the document stores. Neither counts as evidence.

Looked-up PRs are read again every 5 min (open), every hour (closed), never (merged), every minute
after a failure (`pr-lookup.ts` `isDue`).

## Rules (`rules.ts`)

Each rule evaluates to `met`, `unmet` or `unknown`. Only `live` members give `met` or `unmet`.

| Rule | Met when | Unmet when |
| --- | --- | --- |
| `pr-merged(pr, into?)` | merged, into `into` when given | open, closed, or merged elsewhere |
| `pr-checks-green(pr)` | every check passed, none pending | a check failed or runs |
| `pr-approved(pr)` | the review decision is approved | anything else |
| `item-state(item, state)` | the item is in `state` or later in its workflow | earlier |
| `item-category(item, category)` | its state category is `Resolved` or `Completed` (or later) | earlier |
| `item-delivered(item)` | the item's own PR, as Dispatch picks it, is merged and read live | no PR, only a shared plan PR, or the PR is open or closed |

A PR linked on several items that names none of them (`shared`) never delivers one of them.
Shared flags count the items only workstreams read too (`overview.combinedPullRequests`).

A rule kind written by a newer BorgDock evaluates to `unknown` and keeps its data.

## Outcome states (`attention.ts`, `edits.ts`)

| State | When | Written by |
| --- | --- | --- |
| Unverified | no rule met yet, or no rules and no confirmation | |
| Verified | every rule met by live evidence | BorgDock, with device, time and the facts it saw |
| Confirmed | you confirmed it, with at least one piece of evidence and a note (500 characters max) | you |
| Invalidated | it was verified and a rule now reads `unmet` from live evidence | BorgDock |

A verified outcome whose source goes offline stays verified. Only a contradiction invalidates. An
agent never verifies or confirms: its proposals wait for you.

## Blocking and completion

- `blocks` from A holds while A is unresolved. A member is resolved when its PR is merged or
  closed, its item is `Resolved` or later, or its thread is settled. An outcome is resolved when
  verified or confirmed, a decision when decided.
- Superseded members never block.
- `blocks` and `supersedes` stay acyclic each (`graph.ts` refuses the edge). A merge can still make
  a circle. It shows as attention, nothing is dropped.
- Progress is "N of M required outcomes", counting verified and confirmed outcomes with no open
  blocker.
- Ready to complete: every required outcome counts, none is invalidated, and no decision on a
  required outcome is open. You press Complete. A completed workstream whose outcome is invalidated
  shows as attention.

## Attention (`attention.ts`)

First match first. The rail count and the Focus card use the `bad` ones.

| # | When | Tone |
| --- | --- | --- |
| 1 | the workstream changed on another machine as well (conflict) | bad |
| 2 | completed, and an outcome no longer holds | bad |
| 3 | an outcome is invalidated | bad |
| 4 | a member waits on you (thread needs you, or the item's Dispatch verdict is `bad`); an item that waits through its own thread shows once | bad |
| 5 | an open decision (bad when it blocks a required outcome) | bad / warn |
| 6 | a member PR fails checks or has merge conflicts | bad |
| 7 | a required outcome reads a member that can't be read | warn |
| 8 | two relations make a circle | warn |
| 9 | a blocker resolved since the next action was set | ok |
| 10 | no next action, or the next action is 7 days old and nothing moved | warn |
| 11 | every required outcome verified | ok |

## Storage (`storage.rs`, `workstreams-store.ts`, `merge.ts`)

- One `<id>.json` per workstream, local or in `<sync folder>/BorgDock Workstreams/`. Writes are
  atomic, keep a `.bak` and succeed only over the revision the writer last read. Delete moves the
  file to `.trash/` for 30 days.
- A file that doesn't parse twice in a row shows as unreadable, with Restore previous version. It
  is never written over. A newer schema is read-only. Unknown fields survive a round trip.
- Text edits write after 400 ms, structural edits at once, one queue per workstream. A failed write
  keeps the edit and shows Retry.
- Merge is three-way on the shared base. Collections merge by id, a removal wins only if the other
  side didn't change the entry. Scalars take the side that changed; both changed is a conflict you
  choose per field. Verification is one field, except that two machines verifying by rule agree on
  the earlier one.
- The base moves only when a conflict is resolved. A sync client's conflict copy is merged as
  theirs. A file deleted elsewhere is let go after two scans, unless it has unsaved edits.
- Undo merges its own change back out, so edits from another machine since stay.

## Agent runs (`brief.ts`, `runs.ts`, `proposals.ts`)

- Review with agent: a T3 thread gets the brief (16 000 characters max) and answers with a
  ```` ```borgdock-proposal ```` block. BorgDock reads it when the thread settles or waits on you and
  shows each proposed member, relation, outcome, decision or next action for you to accept or
  reject.
- Work next action: a T3 thread gets the brief and the next action. It is linked to no item.
- Both prompts are in Settings → Agents and are filled with `{brief}`, `{nextAction}`, `{title}`.
