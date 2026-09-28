# BorgDock — Complete Feature List

A catalog of every feature in BorgDock, the developer desktop app for keeping on top of GitHub pull requests, Azure DevOps work items, worktrees, and SQL Server — from one window, a tray flyout, and a set of hotkey tool windows. Built with Tauri 2 + React 19 + TypeScript + Rust.

Current as of **3.0.0** (2026-09-25). `/CHANGELOG.md` records what changed per release; this file describes what exists now. Settings that are stored but not yet wired up, and known defects, are listed under [Known gaps](#known-gaps) rather than as features.

---

## 1. Main Window & Tray

### Main Window
- Regular resizable window (default 1400×900, minimum 1200×720) with a custom title bar
- **Rail** on the left:
  - BorgDock logo and name
  - Sections **Focus**, **Pull requests**, **Work items**, **Worktrees** (keys `1`–`4`), with a sliding highlight on the active one
  - Counts: Pull requests always (red when any PR is failing); Focus, Work items and Worktrees when above zero
  - Sync block: "Syncing…" / "Synced 12 s ago" (updates every 10 s), a GitHub rate meter (marked low under 10%) and "N of M requests left (GraphQL|REST)" for the tightest pool across accounts
  - Last section remembered (default Focus)
- Title bar: the section name, or "Pull request" / "Work item" when a detail view is open; status dot (red when any PR is failing), **Open window** launcher, Refresh, Settings, min/max/close
- Status bar per view:

  | View | Left | Right |
  |---|---|---|
  | Focus | focus computed · weights from settings | List: `R` Quick Review · `Ctrl+R` refresh. Board: `J K` move · `H L` columns · `R` Quick Review · `Ctrl+R` refresh |
  | Pull requests | synced time · rate for the tightest account and pool | `/` search · `R` refresh · `Ctrl+F7` worktrees · `Ctrl+F8` files · `Ctrl+F9` ADO |
  | Work items | `ado: org/project` | `/` search · `R` refresh · `J K` move · `Enter` open |
  | Worktrees | worktrees from every watched repository | `/` search · `R` refresh · `J K` move · `Enter` changes · `T` T3 · `O` terminal · `F` favourite · `Ctrl+F7` window |
  | PR / work item detail | `owner/repo #n` / `work item AB#id` | `Esc` back · `Alt+←` back |

- **Open window** launcher (also in the flyout): Worktrees, Files, Work items, SQL (with their hotkeys), Settings, What's new
- Closing hides to tray (tool windows hide too and reopen fast); single-instance (a second launch focuses the existing window)
- Window size and position restored per window, DPI-safe across mixed-DPI monitors, only onto connected displays
- Start minimized to tray and run at startup

### Full-Screen Detail & Back
- Clicking a PR or work item row (or `Enter`) opens it full screen over the list
- Opening a PR switches to Pull requests, except from Focus or Worktrees, which stay put so Back returns there; opening another PR replaces the view instead of stacking
- Back button, `Esc` (no text field focused, no dialog, menu or Quick Review open), `Alt+←` or the mouse back button return to the list
- The list stays mounted while hidden, so scroll position and selection survive the round trip; focus returns to where it was
- The row's title and avatar morph into the header (View Transitions); clicking a rail section from a detail view goes straight to that list
- **Open in window**: Ctrl/Cmd+click, middle-click or `Ctrl+Enter` on a PR row or Focus card, the header button, or the context menu open the PR in a separate window. Work items open in place only (the work item palette still opens pop-outs).

### Toasts
- In-window toasts at the bottom right of the main window: tone stripe, optional action, Dismiss
- Default 5 s; at most 3 shown, plain toasts hidden first so an Undo stays reachable
- Undo for queued merges (`M` in Focus, 3 s) and snoozes (Later on the Focus board)
- Errors such as "Failed to merge PR #n: …" and "Review not submitted: …"

### System Tray
- Tray icon drawn at runtime: a flat square in the worst state's colour (failing red, pending amber, passing green) with the open-PR count in dark ink under a small BorgDock mark (`99+` above 99)
- With nothing to count, or while loading, the BorgDock mark on indigo; the icon pulses while loading
- T3 sessions waiting for input add to the count and force the pending colour
- Tooltip: "BorgDock — N open PRs · X failing · Y pending · Z T3 sessions waiting"
- Left-click shows/focuses the main window (hides it if already in front)
- Right-click menu: **Show flyout**, **Show BorgDock**, **Settings**, **What's new…**, **Quit**

### Tray Flyout
- Borderless always-on-top panel anchored near the tray, toggled by its own global hotkey (default Ctrl+Win+Shift+F) or the tray menu; closes on click-outside or focus loss
- Header: logo, open count, Refresh, **Open window** launcher, open main window, Settings
- Summary strip with failing / running / passing counts and a **Focus N** shortcut
- Compact PR rows (avatar, title, check bar, review chip, number) with **Review** or **Merge** and **More actions**; `j`/`k` navigation
- Clicking a PR brings the main window to the front and opens the PR there
- Row context menu: Review, Open in GitHub, Open pull request, copy branch / URL / errors for Claude, checkout, open T3 thread, rerun failed checks, merge, fix / monitor with Claude
- Skeleton ("Loading pull requests…") while data is still loading
- Hosts BorgDock's notification toasts (see §8)

---

## 2. Pull Request List

### Filtering, Search & Layout
- Segmented filter with counts: **All**, **Needs you**, **Mine**, **Failing**
  - Needs you: a review requested from you or your team, or your own PR that is failing, has changes requested, or has comments to answer
- Debounced search ("Search pull requests") across title, author, head branch, owner/repo, labels and PR number; `/`, `Ctrl+K` or `Ctrl+F` focus it, `Esc` clears then blurs; search also filters Needs you and Recently closed
- **Group and sort** menu:
  - Group by Author (default; heading with avatar and "(you)"), Repo, or Status (Failing, Waiting on me, Ready, In review, Draft, Other)
  - Sort by Updated, Created or Title; your PRs first and drafts last before the chosen sort
- Click a group heading to collapse it; `E` collapses every group on screen
- Density (Settings → Appearance → Pull request density): **Comfortable** 42 px rows with a meta line, or **Compact** 32 px title-only rows
- Pinned **Needs you** group in the All view (each PR shown once), headed with the oldest request's wait badge (`<1h`, `5h`, `2d`)
- **Review load** group: one row per reviewer with pending and stale counts and a load bar (green up to 2, yellow up to 4, red above)
- **Recently closed** group with count (virtualized above 50 rows)

### PR Row
- Avatar, title, one meta line ("koen in BorgDock, updated 2 h ago, stale"; merged or closed PRs say when), check bar (tooltip holds the summary), one chip, `#number`
- The chip, first match wins: Merged, Closed, Conflicts, Draft, Approved, Changes requested, Review requested, Commented, No review yet
- One trailing action on hover, keyboard focus and selection: **Review** (opens Quick Review; wins when your review is requested) or **Merge** (Merging → Merged); none for failing, closed or your-only PRs
- Click, `Enter` or `Space` opens the PR full screen; Ctrl/Cmd+click, middle-click or `Ctrl+Enter` opens the pop-out window
- Labels, linked work items and T3 sessions live in the detail view, not the row

### Context Menu
Also on Focus rows and board cards.
- Open in GitHub, Open in window
- Copy branch name, Copy PR URL, Copy errors for Claude, Copy monitor prompt, Copy fix prompt
- Checkout branch, Open a new thread in T3
- Mark as ready / Mark as draft (confirmed)
- Rerun failed checks, Fix with / Monitor with the default agent (Claude or Codex)
- Merge, Bypass merge (admin, confirmed), Close PR (confirmed)
- Items are disabled when they can't apply (no failing checks, no worktree path, PR not mergeable)

### Rerun Failed Checks
- From the context menu, the Focus board and the detail view
- Reads the head commit's failed check runs (failure, timed out, startup failure); reruns the failed jobs of each GitHub Actions workflow run once, and re-requests each other app's check suite once
- "No failed checks to re-run" when nothing failed

### Review SLA
- Tiers: fresh (<4h), aging (4–24h), stale (>24h) — drive the Needs you wait badge, Focus scoring, and nudges

---

## 3. Focus & Quick Review

### Focus
- Header: "Focus", a **Merged today** tally, **List / Board** toggle (also Settings → Appearance → Focus layout), **Start Quick Review** (everything waiting on your review, or all of Focus if nothing is)
- Summary: "Showing all N open pull requests." or "Showing N of M open pull requests; the rest stay in Pull requests."
- **Why not the others?** breakdown of excluded PRs with reasons and counts
- Contents: every PR with a priority score above zero (others' drafts get none), plus any Needs you PR that scored zero
- Buckets, assigned in order: **Stale** (no update in the "Stale after" setting's days), **Needs you** (snoozed PRs go to waiting), **Ready to merge**, **Waiting on others**
- **List**: a count strip to filter by bucket or Everything; rows are comfortable PR rows whose meta line reads "repo · reason"
- **Board**: the four buckets side by side; stale cards are compact without actions
- Reason sentences, e.g. "mira asked for your review 2 d ago.", "Your PR, 2 checks failing.", "Approved and all N checks passed.", "No update in N days.", "Snoozed until tomorrow."
- Board card actions:
  - Ready: **Merge**, **Open**
  - Your failing PR: **Fix with Claude**, **Rerun**
  - Review waiting on you: **Review**, **Later**
  - Changes or comments on yours: **Open comments**, **Checkout**
  - Anything else: **Open**
- **Later** snoozes until midnight ("#N snoozed until tomorrow", Undo); snoozes persist; **Bring back** on snoozed cards and rows
- Keys: `R` Quick Review for the selected PR, `M` merge (ready PRs only, squash, after a 3 s Undo toast), `Shift+R` Quick Review over everything waiting on you (any section), `O` open on GitHub, `H`/`L` or `←`/`→` move between board columns

### Priority Factors
| Signal | Points |
|---|---|
| Your PR is ready to merge | 45 |
| Your PR's build is failing | 20 |
| Changes requested on your PR | 15 |
| Your PR is unreviewed | 10 after 8h, 15 after 24h |
| Unanswered comments on your PR | 12 |
| Your PR is stale (>24h) with an open problem | +10 |
| Review requested from you / your team | 15 |
| Review aging / overdue | +7 / +8 |
| Updated since your last review | 8 |
| General staleness | 2–10 |
| Someone else's build failing | 5 |

Ties break on oldest update, then smallest PR. The weights are fixed in code.

### Quick Review
- Opens from a row's Review, the board, the detail view, the tray flyout, `R`, `Shift+R` or Start Quick Review
- Card deck: the current PR on top with the next two behind; title bar "Quick review", "PR i / n" with progress, **Previous PR**, Close
- PR card: description (Show more), branch into base, file and commit counts, +/−, review chip, **Files by folder** ("N of M to review, K generated"), check bar
  - Buttons: **Review later**, **Review files** (or Continue reviewing / Review files again), **Write review**, **Approve**
  - **Approve** unlocks once every non-generated file is marked reviewed; otherwise it says how many are left
  - Keys: `→` approve, `←` review later, `Enter` review files, `Esc` close
- File walk: source files grouped by folder, then Documentation, Generated & lockfiles, Tests; the PR description is a collapsible item above the diff
  - Path rail marks reviewed files and files with drafts
  - **Skip generated** (lockfiles, `*.generated.*`, `*.g.*`, `generated/`, snapshots, minified files, source maps, root `dist/` / `obj/`), **Previous**, **Next file**, **Mark reviewed and next**, **Finish review**; footer "X of Y reviewed, Z to go"
  - Keys: `v` mark reviewed, `n`/`j` next, `p`/`k` previous, `Esc` back to the card
- **Inline comment drafts** beside diff lines — save, edit, delete; drafts on changed code are flagged outdated and can be re-anchored with "Choose new line"
- **Write review** ("Your review"): Approve / Comment / Request changes with an overall comment (required for Request changes); posts as a single GitHub review
- Drafts, reviewed files, and position persisted per account and PR ("Drafts saved on this device"); reconciled against file fingerprints with "New changes are available." and **Reload files**
- Comments pane: newest first, filter Everyone / PR author / Other commenters with counts, refresh, view on GitHub; screenshots render inline and open full size
- Session summary ("Review Complete") with approved / commented / skipped counts

---

## 4. Pull Request Detail

The same detail opens full screen in the main window (default) or in a pop-out window (Ctrl+click, **Open in window**).

### Header
- **Full screen**: Back, `owner/repo #n`, **Open in window**, avatar and title, "author wants to merge head into base +a −d, N files", and a readiness sentence ("Ready to merge: approved, all checks passed", "Not ready: 2 checks failing and merge conflicts with main", "Waiting: N checks still running", "Waiting for review", …)
- **Pop-out window** (appears in taskbar / Alt+Tab, one window per PR): readiness ring; Merged / Closed / Mergeable / Conflicts / Draft / review-state pills; passed and running counts; branch, age, +/−, file / commit / comment counts; a checks strip that jumps to the Checks tab

### Action Bar
- **Full screen**:
  - Primary action: **Rerun failed** when checks are red, else **Merge** when ready (repo's merge method), else **Review** when your review is requested, else **Checkout** for your own PR, else **Open in GitHub**
  - **Fix with Claude** when checks fail; **Checkout**, **Open in T3**, **Open in GitHub**; **Resolve conflicts** when conflicting
  - **More actions** menu with the row context menu's items
  - Keys: `R` rerun failed checks and `F` fix (both when checks fail), `J`/`K` switch tabs
- **Pop-out window**: **Merge** (squash) when ready, otherwise **Review**; Open in Browser, Copy Branch, Checkout, Open in T3; Mark Ready / Mark Draft; Resolve Conflicts when conflicting; Bypass Merge and Close PR (both confirmed)

### Checkout Panel
- Detects a worktree that already has the branch ("Already checked out") and goes straight to launch actions
- Otherwise pick an existing worktree (favorites, favorites-only toggle) or create a new one with an editable name and path preview; main worktree hidden behind "show main worktree (unsafe)"
- Shows the planned git commands while running and the step log afterwards
- Launch buttons: Explorer, Terminal, Claude, VSCode, T3

### Tabs
Full screen: Overview, Checks, Files, Commits, Discussion. Pop-out: Overview, Commits, Files, Checks, Discussion. Tabs show counts.
- **Overview**
  - Merged / Closed state card ("Merged 3h ago")
  - Description, clamped to 6 lines with Show more (links open in the OS browser)
  - Linked work items and T3 sessions
  - **Merge Readiness** checklist (checks passed, approved, no conflicts, not draft) with a score
  - **Summarize with AI** — headless Claude or Codex, cached per head commit, with Regenerate
- **Checks**
  - Full screen: "Checks — X of Y passed in N suites", grouped by suite (failing suites open), **Rerun** per failing suite, **Fix with Claude** per failed check, and a **First failure** excerpt parsed from the job log
  - Pop-out: progress bar with passed / failed / in-progress / skipped / cancelled counts, pinned "In progress" group, failures first with durations, per-check **Fix**, click a check to open it on GitHub
- **Files**
  - File tree with "Filter files...", Flat list / Grouped view (source first, tests last); visibility remembered
  - Unified / split diff (`Ctrl+Shift+M`, remembered)
  - Expand / collapse all; filter all / added / modified / deleted; per-commit view
  - Per file: previous / next hunk (`p` / `n`), copy path, open on GitHub; `[` / `]` jump between files
  - Review threads inline under the diff lines they refer to
  - Review composer in the diff toolbar
  - Large-PR warning above 300 files
- **Commits** — short SHA, first line of the message, author, relative date
- **Discussion**
  - Single chronological timeline of reviews, comments, and code threads
  - Filter chips: All / Reviews / Comments / On code, Show / Hide resolved
  - Composer for plain comments or reviews (Approve / Comment only / Request changes)
  - Code threads support resolve / unresolve and **View in Files** (scrolls to and highlights the line)

### Merge Celebration
- Merges made in-app or detected by polling trigger a "🎉 PR #N merged!" toast with View on GitHub and optional tada sound (deduplicated; polling-detected merges respect "only my PRs")

---

## 5. Coding Agents & T3 Code

### Agent Actions
- Default provider: **Claude Code** or **Codex**, with configurable binary paths, not-found warnings, and Codex model
- **Fix** — reuses or creates a worktree for the PR branch, writes a prompt with the failing checks and the repo's custom prompt template, then instructs the agent to commit, push, and watch CI (up to 5 cycles)
- **Monitor** — launches the agent to watch the PR's checks and fix regressions
- **Resolve Conflicts** — merge-base-and-push prompt in the PR's worktree
- Sessions launch in a new Windows Terminal tab
- Copy helpers: errors for Claude (failed checks as Markdown), fix prompt, monitor prompt

### T3 Code
- **Open a new thread in T3** from the detail view, PR list, Worktrees section, or flyout
- Uses the worktree that already has the branch, or opens the checkout picker first
- Creates an empty PR-linked thread through T3's orchestration API (creating the T3 project if needed), using the project's default model, then the last thread's, then your T3 model setting; brings T3 to the front
- Pairing in Settings → Agents (paste pairing link or raw token); token kept in the OS keychain
- Linked T3 sessions polled every 15s (and on window focus) and shown as status chips in the detail Overview; click to focus T3
- Unpaired T3 is only activated, with a toast pointing to pairing

---

## 6. Worktrees & Repositories

### Worktrees Section
- Rail section listing every worktree of every configured repo (local and remote), grouped by repo with a count and an error pill for repos that failed to load
- Header: "Worktrees", count, search ("Search worktrees"), favourites-only star, **Prune**, Refresh, open the worktrees window (`Ctrl+F7`)
- Row: star (branch icon on the main worktree), branch name, meta line (folder, main worktree / remote, clean / N changed / conflicts, last used), and the linked PR as a check bar and `#number` that opens the PR full screen
- Hover actions: open a T3 thread for the linked PR, open terminal, open folder, open in editor
- Click or `Enter` opens a **changes pane** beside the list: "Uncommitted" and "Ahead of <base>" groups; click a file for its diff; `Esc` or X closes it
- Keys: `J`/`K` move, `Enter` changes, `T` T3, `O` terminal, `F` favourite, `Esc` steps back
- Favourites shared with the worktrees window; Refresh also rescans worktrees

### Worktrees Window (Ctrl+F7)
- Frameless, resizable window with the same list; size and position remembered
- Hotkey hides a focused window, raises a buried one, or opens it fresh
- Filter by branch, folder, or repo; grouped by repo, main worktree first, natural folder ordering
- Star favorites and toggle favorites-only (main worktree always shown)
- Row actions: open terminal (click / Enter), open folder, open in VS Code
- **Remote Mac worktrees** over SSH, shown beside local ones with host labels, a "remote" chip, and view-only rows (starrable)

### Worktree Management
- Shallow worktree creation for PR branches (fetch `--depth 1`, `worktree add -B`)
- Shared, event-driven worktree cache refreshed at startup, every 5 minutes, and after create / checkout / remove; failed repos keep their last good list
- Worktree status in the checkout panel: clean / dirty / conflict, uncommitted count, ahead / behind
- **Prune worktrees**: classifies worktrees as Open PR / Closed / Orphaned from the Worktrees section's **Prune**; bulk removal with progress. From Settings → Maintenance, PR states are unknown and nothing is marked orphaned.

### Repositories
- **+ Add repository** by folder picker, or **Scan folder…** to discover every git repo up to 4 levels deep and read owner/name from `origin` (HTTPS, SSH, and SSH host aliases)
- **Per-repo GitHub account**: pick a `gh` account or **Detect** which account can access the repo — personal and enterprise repos poll side by side without switching `gh`
- Remote worktree repos: host label, SSH target, owner/name, remote path, optional private key
- Setup wizard auto-discovers repos in common folders (`~/source/repos`, `~/repos`, `~/projects`, `~/dev`, `~/code`, `~/git`, `~/Documents/GitHub`)

---

## 7. Azure DevOps

### Work Items Section
- Rail section with a header: "Work items", query picker, search ("Search work items", matches title, tags and ID), filter button
- Query picker adapts: a segmented control for 1–4 favourites, a single select for up to 12 queries, otherwise a queries rail (Favorites, My Queries) beside the list; **Browse all queries** opens the full query browser
- Filter popover: State, Assignee (Anyone, @Me, names), Tracking (All, Tracked, Working on)
- Items grouped by state, in the order states appear in the results ("No state" for the rest); row = type pill, `AB#id`, title, "State, P2"; density follows the Pull request density setting
- Per row: ★ Track / Untrack and ● Start / Stop working on
- Click, `Enter` or `Space` opens the item full screen; Back returns to the list
- Selection kept across section switches; query re-run on a configurable poll interval (30–900s)

### Work Item Palette (Ctrl+F9)
- Empty query shows **Working On**, **Assigned to Me**, and **Recent** sections
- Search by ID prefix or title / assignee text
- Operator chips: `state:`, `type:`, `assignee:`, `iter:`, `@name`, `@me`
- Filter chips: All / Open / Mine / Testing Failed
- Group by none / state / owner / iteration, collapsible groups, preferences remembered
- Keyboard navigation; opens items in pop-out detail windows with prev / next through the list

### Work Item Detail
- Full screen in the main window, or a pop-out window from the palette
- Editable with auto-save ("Auto-saves on blur", "Saving…", "Saved Ns ago"): title (click to edit), State, Priority, Assigned to, Iteration
- Track / Tracked and Start working / Working on it in the action bar
- Read-only rail: severity, type, reporter, area, backlog priority, found-in, tags, linked PRs
- Tabs: Overview, pages from the work item type's ADO form layout, Activity (placeholder), Links (including open PRs that mention `AB#id`), Attachments (download); `J`/`K` switch tabs
- Comments rail: view and add
- Rich HTML fields with authenticated ADO images
- Copy id (`AB#id`), Open in ADO, Delete (returns to the list)

### Authentication
- Azure CLI (`az`, auto-selected when installed) or Personal Access Token
- Connection test with specific errors (not installed / not logged in / token failure)
- Expired sessions prompt a single sign-in warning

---

## 8. Notifications

### Toasts
- Rendered in the tray flyout's toast area near the tray, or as an in-flyout banner when the flyout is open
- Up to 3 at a time; auto-dismiss after 7s (8s for merges), paused on hover; clicking a toast opens the PR in the main window
- Severity stripe and icon: error, warning, success, info, merged
- In-window toasts with Undo are separate (see §1)

### Events
- Check failed — Open in GitHub, Fix with Claude
- All checks passed
- Changes requested
- Review requested
- PR ready to merge — Merge, Open in GitHub
- PR merged — View on GitHub, optional tada sound
- Update available / update ready
- Deduplicated within 60s

### Review Nudges
- Reminders for pending reviews every 15 minutes / 30 minutes / 1 hour / 2 hours / 4 hours while BorgDock is not in view, with a **Start Review** action
- Optional escalation: nudges come more often as a review ages; stale ones are marked "Urgent: "

### Settings
- Check status changes, review updates, PR becomes mergeable, play sound on merge, only notify for my PRs
- Nudge for pending reviews, remind every, escalate urgency over time
- **Test notification** button

---

## 9. SQL Server Query Tool (Ctrl+F10)

### Editor
- CodeMirror 6 with MSSQL dialect and schema-aware table/column autocomplete (schema cached, refreshable)
- `Ctrl+Enter` runs the selection, or the whole script when nothing is selected
- **Snippets rail**: filter, star, rename, duplicate, delete; resizable and collapsible
- Snippet shortcuts: New, Save (`Ctrl+S`), Save as snippet (`Ctrl+Shift+S`); unsaved-changes indicator
- `Esc` closes the window

### Results
- Virtualized grid — 10,000-row result sets scroll smoothly
- Row numbers and NULL markers
- Multiple result sets
- Status bar with rows, time, columns and selection, or "N rows affected"; per result set cap of 10,000 rows with a truncated marker
- No query timeout (connect timeout 10s)
- Affected-row counts for UPDATE / INSERT / DELETE / MERGE / DDL / GRANT / REVOKE
- Row selection: click, Ctrl-click, Shift-click; click a selected row to deselect; click outside to clear
- Copy Values, + Headers, or All including the query (tab-separated)
- Unsupported column types (`geography`, `geometry`, `hierarchyid`, CLR UDTs) return a friendly error instead of crashing

### Connections
- Named connection profiles: server, port (default 1433), database, trust server certificate
- Windows Integrated (SSPI) or SQL Server authentication; passwords in the OS keychain
- Add / edit dialog with inline connection test and status pill; the list refreshes when the window reopens

### Persistence
- Last query and active snippet
- Rail and editor sizes
- Window position

---

## 10. File Palette (Ctrl+F8) & File Viewer

### Search
- Scope chips: All / Changes / Filename / Content / Symbol
- **Filename** — substring match over a `.gitignore`-aware index
- **Content** (`>` prefix) — regex search, smart case, match previews
- **Symbol** (`@` prefix) — Tree-sitter definitions for TS / JS / C# / Rust with indexing progress

### Roots & Changes
- Roots column: all worktrees plus custom folders; favorites and favorites-only; collapsible; active root remembered; change counts per root
- **Changes** section: files changed vs HEAD, vs base branch, or both; refreshed on focus

### Results & Preview
- Single-click previews, double-click / Enter opens the File Viewer
- Copy relative path via row button, `Ctrl+C`, or context menu (also open in new window, open containing folder)
- Preview:
  - Syntax highlighting, match highlighting, `Ctrl+F` find, copy all (`Ctrl+Shift+C`)
  - **F12** jumps to the symbol under the cursor
  - UTF-16 decoding (SSMS `.sql` files); 1 MB limit; binaries skipped
- Diff preview vs HEAD or base: unified / split (`Ctrl+/`), hunk navigation, copy patch

### File Viewer
- Pop-out window with vs HEAD / vs base / file modes
- Unified / split (`Ctrl+Shift+M`)
- `Ctrl+D` switches baseline, `Ctrl+W` closes
- Copy all, open in editor

### Syntax Highlighting
- Tree-sitter (`web-tree-sitter` 0.26) with grammars compiled from source into `public/grammars/`: `tsx`, `typescript`, `javascript`, `rust`, `c_sharp`, `sql`, `json`, `yaml`, `toml`, `css`, `html`
- Used by the file palette, file viewer, and diff views; falls back to plain text if a grammar fails to load
- CSP includes `'wasm-unsafe-eval'` so grammars instantiate in packaged builds

---

## 11. Settings

### Settings Window
- Dedicated resizable window (remembers size and position), same title bar, status bar and theme as the rest of the app
- Navigation rail:
  - **Data sources** — GitHub, Repositories, Azure DevOps, SQL Server
  - **Application** — Appearance, Notifications
  - **AI** — Agents
  - **System** — Updates, Maintenance
- **Ctrl+K search** across indexed fields by label, hint, and keywords; jumps to, scrolls to, and highlights the field
- Deep links to a section; last section remembered
- Auto-save with 300ms debounce, flushed on close; theme and motion changes apply to every window at once

### Sections
- **GitHub**
  - GitHub CLI (multi-account) or PAT
  - Username, poll interval (15–600s)
  - Separate REST and GraphQL rate-limit bars
  - Test connection
- **Repositories** — tracked repos, per-repo GitHub account, scan folder, remote worktree repos
- **Azure DevOps**
  - Organization, project, Azure CLI or PAT
  - Poll interval (30–900s), test connection
- **SQL Server** — connection profiles with add / edit / delete
- **Appearance**
  - Look and layout: Theme (System / Light / Dark), **Reduce motion**, Focus layout (List / Board), Pull request density (Comfortable / Compact), Stale after (days)
  - Hotkeys: main window and flyout hotkey recorders
  - Terminal & startup: Windows Terminal profile, run at startup, start minimized to tray
- **Notifications** — see §8
- **Agents**
  - Default provider, Claude / Codex paths, Codex model
  - T3 path, model, and pairing
  - PR summary provider and model
- **Updates**
  - Auto-check and auto-download
  - Check / install with progress
  - View release notes, three most recent releases with the installed one marked
- **Maintenance**
  - Prune worktrees
  - Clear cache (shows current size)
  - Reset onboarding hints
  - Reset all settings (with confirmation)
  - Diagnostics: copy diagnostic info, open log folder, run self-test (gh token, az on PATH, cache DB)

---

## 12. Setup Wizard & Onboarding

### Setup Wizard
- Three steps (Connect, Repositories, Look) with a sliding progress track:
  1. **Connect to GitHub** — GitHub CLI or access token, validated, username detected
  2. **Pick the repositories to watch** — auto-discovery, add by path or owner/name, Select all / Clear all
  3. **Pick your look** — theme
- Shown when setup is incomplete, no repos are configured, or PAT mode has no token

### Onboarding
- Inline hint and "new" badge on **Summarize with AI** in the PR detail Overview, dismissible and remembered

---

## 13. Theme & Visual Design

- Graphite dark, porcelain light, or follow the system; follows OS changes live
- One theme for every window: a pre-paint script in every window prevents a flash of the other theme, and changes apply everywhere at once
- **Reduce motion** (Settings → Appearance, or the OS setting): views, filters and lists switch instantly and looping animations stop
- Inter for lists and chrome, Instrument Sans for reading views (PR and work item detail, Quick Review, What's new), JetBrains Mono for code; all bundled
- One indigo accent for selection and the primary action; red, amber and green for status
- Short purposeful motion: view push / pop, section crossfade, sliding highlights, row reorders, tool windows fading in on first paint
- Lucide icon set across every window
- WebView2 default context menu disabled in release builds (except the Settings and worktrees windows); browser shortcuts (find bar, print, reload, zoom, devtools) disabled in every window
- Details: `DESIGN-SYSTEM.md`

---

## 14. Keyboard Shortcuts

### Global Hotkeys
| Shortcut | Action |
|---|---|
| Ctrl+Win+Shift+G (configurable) | Toggle main window |
| Ctrl+Win+Shift+F (configurable) | Toggle tray flyout |
| Ctrl+F7 | Worktrees window |
| Ctrl+F8 | File palette |
| Ctrl+F9 | Work item palette |
| Ctrl+F10 | SQL window |

Tool-window hotkeys hide a focused window, raise a buried one without losing input, or open it fresh. Each hotkey registers independently, so one conflict doesn't block the rest.

### Main Window
- **Anywhere**: `Ctrl+K` / `Ctrl+F` focus the section's search (from a detail view, back to the list first; from Focus, the Pull requests search); `Ctrl+R` refreshes
- **Lists**:
  - `1`–`4` switch sections, `/` search
  - `J`/`K` or `↓`/`↑` move, `Enter` open full screen, `Ctrl+Enter` open in window, `Esc` clear the selection
  - `O` open on GitHub, `E` collapse groups, `R` refresh, `Shift+R` Quick Review over everything waiting on you
  - Focus: `R` Quick Review for the selected PR, `M` merge with Undo, `H`/`L` or `←`/`→` board columns
  - Worktrees: `Enter` changes, `T` T3, `O` terminal, `F` favourite, `Esc` step back
- **Detail views**: `Esc`, `Alt+←` or mouse back to go back, `J`/`K` switch tabs; PR detail `R` rerun failed and `F` fix when checks fail
- **Quick Review**: card `→` approve, `←` review later, `Enter` review files, `Esc` close; file walk `v` mark reviewed, `n`/`j` next, `p`/`k` previous, `Esc` back to the card
- **PR Files tab**: `Ctrl+Shift+M` unified / split, `[` / `]` previous / next file, `p` / `n` previous / next hunk

### Tool Windows
- **File palette / viewer**
  - `Ctrl+C` copy path, `Ctrl+Shift+C` copy file, `F12` go to symbol, `Ctrl+F` find
  - `Ctrl+/` unified / split in the palette's diff preview; `Ctrl+Shift+M` unified / split, `Ctrl+D` baseline and `Ctrl+W` close in the viewer
- **SQL** — `Ctrl+Enter` run, `Ctrl+S` save snippet, `Ctrl+Shift+S` save as snippet, `Esc` close
- **Settings** — `Ctrl+K` search

---

## 15. Polling, Caching & Persistence

### GitHub Polling
- One GraphQL query per repo per cycle fetches open PRs, check rollup, latest reviews, and counts
- Repos polled in parallel, each with its own `gh` account
- A failing repo keeps its last known state
- Adaptive backoff: interval doubles when either the REST or GraphQL pool drops below 500
- ETag conditional requests for REST calls, persisted across restarts
- State-transition detection between polls drives notifications and merge celebrations
- Recently closed PRs fetched at startup (30 per repo)

### Caching
- SQLite cache (`prcache.db`): PRs, tab data, ETags, SQL schema, SQL snippets
- Warm start: cached PRs render immediately while the network refresh runs in the background
- Changelog content loaded on demand; vendor code split into chunks

### Settings & Credentials
- `settings.json` in the app config dir (`%APPDATA%\BorgDock` on Windows, `~/Library/Application Support/BorgDock` on macOS, `~/.config/BorgDock` on Linux)
- Atomic writes (temp file + rename) with `.bak` backup and fallback on corruption
- Schema migrations
- `settings.dev.json` overlay in debug builds
- Secrets (GitHub PAT, ADO PAT, SQL passwords, T3 token) stored in the OS keychain and stripped from the JSON

---

## 16. Updates & What's New

### Auto-Updates
- Tauri updater plugin with signed releases from GitHub (`latest.json`)
- First check 10s after launch, then every 4 hours when auto-check is on
- Optional auto-download with progress; installs on restart
- Flyout toasts for update available / ready

### What's New Window
- Opens automatically after an update that includes new or improved highlights; "don't auto-open" option
- Release accordion with Storybook-captured hero screenshots, highlight cards, and "also fixed" lists; shows how many versions behind you are
- Generated at build time from `/CHANGELOG.md`
- Reopen from the tray menu, the **Open window** launcher, or Settings → Updates

---

## 17. Reliability & Diagnostics

- Blocking file, git, cache, settings, SQL, and auth work runs off the GUI thread; window operations use bounded waits so a stalled WebView can't freeze IPC
- Tool windows are hidden and reused instead of destroyed and rebuilt
- Structured log at `<config dir>/BorgDock/logs/borgdock.log` (5 MB rotation)
- Panic hook writes a flushed `borgdock-panic.log` with backtrace
- Release profile uses `panic = "unwind"` so decoder panics in SQL queries surface as errors
- Hang watchdog script (`src/BorgDock.Tauri/scripts/diag/hang-watchdog.ps1`) captures thread stacks and a minidump when the app stops responding
- Console windows suppressed for spawned processes on Windows
- Pop-out windows stay hidden until first paint
- Perf budget e2e test for the detail push

---

## 18. Platform

- **Windows** — primary and only packaged target (NSIS installer)
- **macOS / Linux** — code paths exist for theme, logging, terminals, keychain, and autostart, but no release builds are published
- Integrations:
  - GitHub CLI and REST / GraphQL APIs
  - Azure CLI and Azure DevOps REST
  - SQL Server via TDS
  - T3 Code orchestration API
  - Claude Code and Codex CLIs
  - Windows Terminal, VS Code, Explorer, OS browser, clipboard

---

## Known Gaps

Code or settings that exist but aren't connected to anything yet, and known defects:

- **Settings stored but unused:**
  - Quick Review hotkey, "Restore last selection"
  - Notification channel chips and "New pull requests" toggle
  - Post-fix action
  - ADO link-matching options
  - SQL read-only by default, confirm destructive without WHERE, default connection
  - Editor command (always VS Code)
- **Last-used SQL connection** is read at startup but never saved
- **Work item palette operators** also pass their raw tokens into the ADO text search, which can suppress results
- **Toast buttons** "Fix with Claude" and "Merge" use `borgdock://` URLs with no handler; toasts fail silently if the flyout window hasn't been created yet
- **Hidden-window polling slowdown** (`PollingManager.setHidden`) is never called
- **7-day cache cleanup** command is never invoked
- **Maintenance "Reset onboarding"** says it replays the welcome wizard but only resets hints and badges
- **Settings and worktrees windows** don't install the context-menu blocker used by other windows
- **Settings search** misses most Agents fields and still lists removed Sidebar edge / mode / width entries
- **ADO Activity tab** is a "coming soon" placeholder
- **Code thread Reply** (Discussion tab) renders but posts nothing; inline threads in the Files tab have no Resolve or Reply
- **"Fix with Claude"** labels in the full-screen detail and on Focus cards stay "Claude" when Codex is the default provider (the action itself uses the default)
- **Fix prompts** never include changed files or error logs; callers pass them empty
- **Agent sessions** ignore the Windows Terminal profile setting (only the checkout panel's Claude button uses it)
- **Focus "weights from settings"** in the status bar: the weights are fixed in code
- **Review load**: clicking a reviewer searches for that login, which matches PRs they authored, not PRs waiting on them
- **Flyout "Focus N"** switches the section but leaves an open detail view on top
- **Stale onboarding hint ids** (`focus-priority-ranking`, `review-mode-shortcuts`) are defined but never rendered

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2.11 |
| Frontend | React 19.2, TypeScript 6.0, Vite 8, Tailwind CSS 4, clsx |
| Fonts | Inter, Instrument Sans, JetBrains Mono (`@fontsource-variable`, bundled) |
| State | Zustand 5 |
| UI libraries | lucide-react, CodeMirror 6, @tanstack/react-virtual, focus-trap-react |
| Markdown | react-markdown 10, remark-gfm, rehype-raw, rehype-sanitize, DOMPurify |
| Syntax highlighting | web-tree-sitter 0.26 (grammars built from source) |
| Backend | Rust, Tokio, reqwest, git2, ignore / grep-searcher, keyring |
| Data | SQLite via rusqlite (cache, snippets); SQL Server via tiberius |
| APIs | GitHub GraphQL + REST, GitHub CLI, Azure DevOps REST, Azure CLI, T3 orchestration API |
| Testing & tooling | Vitest 4, Playwright (+ axe-core), Storybook 10, Biome 2 |
| Tauri plugins | global-shortcut, notification, shell, dialog, autostart, single-instance, updater, store, clipboard-manager, opener, fs, log, os |

`babel-plugin-react-compiler` is configured in `vite.config.ts` but inactive under `@vitejs/plugin-react` 6.
