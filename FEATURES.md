# BorgDock — Complete Feature List

A catalog of every feature in BorgDock, the developer desktop app for keeping on top of GitHub pull requests, Azure DevOps work items, worktrees, and SQL Server — from one window, a tray flyout, and a set of hotkey palettes. Built with Tauri 2 + React 19 + TypeScript + Rust.

Current as of **2.3.1** (2026-09-15). `/CHANGELOG.md` records what changed per release; this file describes what exists now. Settings that are stored but not yet wired up are listed under [Known gaps](#known-gaps) rather than as features.

---

## 1. Main Window & Tray

### Main Window
- Regular resizable window (default 1400×900, minimum 1200×720) with a custom title bar — no docked sidebar
- Sections: **Focus** (with count), **PRs**, **Work Items**; last section remembered
- Title bar: open-PR pill, section tabs, status dot (red when any PR is failing), refresh, settings, min/max/close
- Status bar per section:
  - Focus — Quick Review hint
  - PRs — last sync time, tightest GitHub rate-limit pool, palette hotkey hints
  - Work Items — ADO org/project, palette hint
- Closing hides to tray; single-instance (a second launch focuses the existing window)
- Window size and position restored per window, DPI-safe across mixed-DPI monitors, only onto connected displays
- Start minimized to tray and run at startup

### System Tray
- Rendered tray icon showing open-PR count on a worst-state color (failing / pending / passing), pulsing while loading, with summary tooltip
- Left-click shows/focuses the main window (hides it if already in front)
- Right-click menu: **Show flyout**, **Show BorgDock**, **Settings**, **What's new…**, **Quit**

### Tray Flyout
- Borderless always-on-top panel anchored near the tray, toggled by its own global hotkey (default Ctrl+Win+Shift+F) or the tray menu; closes on click-outside
- Header: open count, refresh, open main window, settings
- Summary strip with failing / running / passing counts and a **Focus N** shortcut
- PR rows match the main window's comfortable rows (readiness ring, +/− lines, labels, repo when several are monitored); j/k navigation; hover action bar with smart primary action (Re-run / Merge / Review / Checkout / Open), Checkout, Review, More
- Row context menu: open in GitHub or detail window, copy branch / URL / errors for Claude, checkout, open T3 thread, rerun failed checks, merge, fix / monitor with agent
- Skeleton placeholder while data is still loading
- Hosts BorgDock's notification toasts (see §8)

---

## 2. Pull Request List

### Filtering, Search & Layout
- Filter chips with counts: **All**, **Needs Review** (includes team review requests), **Mine**, **Failing**, **Ready**, **Review**, **Closed**
- Debounced search across title, author, branch, owner/repo, and labels
- Group by author, repository, or status (segmented control); collapsible groups (E collapses all)
- Sort by updated, created, or title (menu button)
- Density (Settings → Appearance): **Comfortable** two-line rows or **Compact** single-line table with Author / Pull request / Review / Checks / Δ lines / # / Ready columns
- Per-author strip with PR and failing counts
- Pinned **Needs Your Review** section in the All view
- **Recently Closed** section

### PR Row
- Rows sit in one hairline-separated panel per section; author initials avatar, title, review-state pill (approved / changes / commented / review needed)
- PR number, author, CI summary (N failing / in progress / x/y passing)
- Draft, conflicts, merged, closed pills
- +/− lines; base branch only when it isn't main/master (repo, head branch, commit/file/comment counts are hidden)
- Labels, worktree name, merge-readiness ring (0–100)
- Linked Azure DevOps work-item badges
- Live T3 session chips (running, approval needed, input needed, settled)
- Review wait badge (e.g. `<1h`, `5h`, `2d`) on PRs awaiting your review
- Hover action bar: smart primary action, Checkout, Review, Resolve Conflicts (when conflicting), More
- Click opens the PR detail window

### Context Menu
- Open in GitHub / open in detail window
- Copy branch name, PR URL, errors for Claude, fix prompt, monitor prompt
- Checkout branch
- Open a new thread in T3
- Mark as ready / mark as draft (confirmed)
- Rerun failed checks
- Fix with / Monitor with the default agent (Claude or Codex)
- Merge, Bypass merge (admin, confirmed), Close PR (confirmed)

### Review SLA & Team Review Load
- SLA tiers: fresh (<4h), aging (4–24h), stale (>24h) — drive wait badges, Focus scoring, and nudges
- **Review Load** panel: pending reviews per teammate with green/yellow/red bar and stale count; collapsible; click to filter Needs Review by that reviewer

---

## 3. Focus Tab & Quick Review

### Focus Queue
- Ranks open PRs by priority score; shows only PRs scoring above zero; others' drafts excluded
- Header summary: "Showing X of Y — N failing, N waiting on you, N stale"
- **Why not the others?** breakdown of excluded PRs with reasons and counts
- Rows: the same PR rows as the PR list (density setting, hover action bar, context menu, click opens detail), ranked top to bottom, plus repo name, primary reason pill, and priority points
- Keyboard: `r` reviews selected PR, `m` merges with a 3-second Undo toast, `Shift+R` starts Quick Review over everything waiting on you
- First-run overlay, inline hint, and "new" feature badges

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

Ties break on oldest update, then smallest PR.

### Quick Review (Guided)
- Full-window overlay over one PR or a queue of PRs
- Guided path: PR description first, then one file at a time — source files grouped by folder, then documentation, generated files & lockfiles, and tests last
- Path rail marks reviewed files and files with drafts
- Navigation: Review later, Previous, Next, Mark reviewed & next, Finish review (`n` / `p` / `v` / `Esc`); previous PR within a multi-PR session
- **Inline comment drafts** beside diff lines — save, edit, delete; drafts on changed code are flagged outdated and can be re-anchored
- Finish step: Approve / Comment / Request changes with an overall comment (required for Request changes); posts as a single GitHub review
- Drafts, reviewed files, and position persisted per account and PR; reconciled against file fingerprints with a "New changes are available" reload prompt
- Comments pane: newest first, filter Everyone / PR author / Other commenters with counts, refresh, view on GitHub
- Screenshots in comments render inline; click to open full size
- Session summary screen

---

## 4. PR Detail Window

### Header & Action Bar
- Pop-out window (appears in taskbar / Alt+Tab)
- Header: readiness ring; Merged / Closed / Mergeable / Conflicts / Draft / review-state pills; passed and running counts; branch, age, +/−, file / commit / comment counts
- Sticky action bar available from every tab:
  - **Merge** when ready, otherwise **Review** (opens Quick Review for this PR)
  - Open in browser, Copy branch, Checkout, Open in T3
  - Mark ready / draft, Resolve Conflicts (when conflicting)
  - Bypass merge and Close PR (both confirmed)
- Checks strip (passed / running / failing) that jumps to the Checks tab

### Checkout Panel
- Detects a worktree that already has the branch and goes straight to launch actions
- Otherwise pick an existing worktree (favorites, favorites-only toggle) or create a new one with an editable name and path preview; main worktree hidden behind an explicit "unsafe" toggle
- Live step-by-step git output (fetch, checkout / worktree add)
- Launch buttons: Explorer, Terminal, Claude, VS Code, T3

### Tabs
- **Overview**
  - Merged / Closed state card ("Merged 3h ago")
  - Merge readiness checklist
  - Linked T3 sessions and work items
  - **Summarize with AI** — headless Claude or Codex, cached per head commit, with Regenerate
  - Markdown description (links open in the OS browser)
- **Commits** — short SHA, first line of the message, author, relative date
- **Files**
  - Collapsible groups with readable names and tests last; toggleable file tree
  - Unified / split diff (Ctrl+Shift+M, remembered)
  - Expand / collapse all; filter all / added / modified / deleted; per-commit view
  - Per file: previous / next hunk, copy path, open on GitHub; `[` / `]` jump between files
  - Review threads inline under the diff lines they refer to
  - Review composer in the diff toolbar
  - Large-PR warning above 300 files
- **Checks**
  - Progress bar with passed / failed / in-progress / skipped / cancelled counts
  - Pinned "In progress" group; failures sorted first, with durations
  - Per-check **Fix** with the default agent; click a check to open it on GitHub
  - Cancelled checks treated as non-blocking
- **Discussion**
  - Single chronological timeline of reviews, comments, and code threads
  - Filter chips: All / Reviews / Comments / On code, show or hide resolved
  - Composer for plain comments or reviews (Approve / Comment / Request changes)
  - Code threads support reply, resolve / unresolve, and **View in Files** (scrolls to and highlights the line)

### Merge Celebration
- Merges made in-app or detected by polling trigger a "🎉 PR merged" toast with optional tada sound (deduplicated)

---

## 5. Coding Agents & T3 Code

### Agent Actions
- Default provider: **Claude Code** or **Codex**, with configurable binary paths, not-found warnings, and Codex model
- **Fix** — reuses or creates a worktree for the PR branch, writes a prompt with failing checks, changed files, and the repo's custom prompt template, then instructs the agent to commit, push, and watch CI
- **Monitor** — launches the agent to watch the PR's checks and fix regressions
- **Resolve Conflicts** — merge-base-and-push prompt in the PR's worktree
- Sessions launch in a Windows Terminal tab (configurable profile)
- Copy helpers: errors for Claude (failed checks as Markdown), fix prompt, monitor prompt

### T3 Code
- **Open a new thread in T3** from the detail window, PR list, or flyout
- Uses the worktree that already has the branch, or opens the checkout picker first
- Creates an empty PR-linked thread through T3's orchestration API, applying your T3 model defaults, then brings T3 to the front
- Pairing in Settings → Agents (paste pairing link or raw token); token kept in the OS keychain
- Linked T3 sessions polled every 15s and shown as status chips; click to focus T3
- Unpaired T3 is only activated, with a toast pointing to pairing

---

## 6. Worktrees & Repositories

### Worktree Palette (Ctrl+F7)
- Frameless, resizable window; size and position remembered
- Hotkey hides a focused palette, raises a buried one, or opens it fresh
- Filter by branch, folder, or repo; grouped by repo, main worktree first, natural folder ordering
- Star favorites and toggle favorites-only (main worktree always shown)
- Row actions: open terminal (click / Enter), open folder, open in VS Code
- **Remote Mac worktrees** over SSH, shown beside local ones with host labels, a "remote" pill, and view-only controls (starrable)

### Worktree Management
- Shallow worktree creation for PR branches (fetch `--depth 1`, `worktree add -B`)
- Shared, event-driven worktree cache refreshed at startup, every 5 minutes, and after create / checkout / remove; failed repos keep their last good list
- Worktree status in the checkout panel: clean / dirty / conflict, uncommitted count, ahead / behind
- **Prune worktrees** (Settings → Maintenance): classifies worktrees as Open PR / Closed / Orphaned, estimates size, bulk removal with progress

### Repositories
- Add a repo by folder picker, or **Scan folder…** to discover every git repo up to 4 levels deep and read owner/name from `origin` (HTTPS, SSH, and SSH host aliases)
- **Per-repo GitHub account**: pick a `gh` account or auto-detect which account can access the repo — personal and enterprise repos poll side by side without switching `gh`
- Remote worktree repos: label, SSH target, owner/name, remote path, optional private key
- Setup wizard auto-discovers repos in common folders (`~/source/repos`, `~/repos`, `~/projects`, `~/dev`, `~/code`, `~/git`, `~/Documents/GitHub`)

---

## 7. Azure DevOps

### Work Items Workspace
- Three panes in the main window:
  - **Left** — favorite and personal queries, plus a full query browser
  - **Middle** — matching items with title/ID filter; state, assignee, and tracking filters
  - **Right** — work item detail
- Tracked and Working On toggles per item
- Selection kept across tab switches; query re-run on a configurable poll interval (30–900s)

### Work Item Palette (Ctrl+F9)
- Empty query shows **Working On**, **Assigned to Me**, and **Recent** sections
- Search by ID prefix or title / assignee text
- Operator chips: `state:`, `type:`, `assignee:`, `iter:`, `@name`, `@me`
- Filter chips: All / Open / Mine / Testing Failed
- Group by none / state / owner / iteration, collapsible groups, preferences remembered
- Keyboard navigation; opens items in pop-out detail windows with prev / next through the list

### Work Item Detail
- Editable with auto-save: title, state (valid states for the type), priority, assignee, iteration
- Read-only rail: severity, reporter, area, backlog priority, found-in, tags, linked PRs
- Tabs: Overview, pages from the work item type's ADO form layout, Links, Attachments (download)
- Comments rail: view and add
- Rich HTML fields with authenticated ADO images
- Copy ID, open in ADO, delete

### Authentication
- Azure CLI (`az`, auto-selected when installed) or Personal Access Token
- Connection test with specific errors (not installed / not logged in / token failure)
- Expired sessions prompt a single sign-in warning

---

## 8. Notifications

### Toasts
- Rendered in the tray flyout's toast area near the tray, or as an in-flyout banner when the flyout is open
- Up to 3 at a time; auto-dismiss after 7s (8s for merges), paused on hover
- Severity stripe and icon: error, warning, success, info, merged

### Events
- Check failed — Open in GitHub, Fix with Claude
- All checks passed
- Changes requested
- Review requested
- PR ready to merge — Merge, Open in GitHub
- PR merged — View on GitHub, optional tada sound
- Deduplicated within 60s

### Review Nudges
- Reminders for pending reviews every 15m / 30m / 1h / 2h / 4h while BorgDock is not in view
- Optional escalation

### Settings
- Check status changes, review updates, PR becomes mergeable, merge sound, only my PRs
- Nudge interval and escalation
- Test notification button

---

## 9. SQL Server Query Tool (Ctrl+F10)

### Editor
- CodeMirror 6 with MSSQL dialect and schema-aware table/column autocomplete (schema cached, refreshable)
- Ctrl+Enter runs the selection, or the whole script when nothing is selected
- **Snippets rail**: filter, star, rename, duplicate, delete; resizable and collapsible
- Snippet shortcuts: new, save (Ctrl+S), save as (Ctrl+Shift+S); unsaved-changes indicator

### Results
- Virtualized grid — 10,000-row result sets scroll smoothly
- Row numbers and NULL markers
- Multiple result sets
- Execution time; per result set cap of 10,000 rows with a truncated marker
- No query timeout (connect timeout 10s)
- Affected-row counts for UPDATE / INSERT / DELETE / MERGE / DDL / GRANT / REVOKE
- Row selection: click, Ctrl-click, Shift-click; click a selected row to deselect; click outside to clear
- Copy values, values + headers, or all including the query (tab-separated)
- Unsupported column types (`geography`, `geometry`, `hierarchyid`, CLR UDTs) return a friendly error instead of crashing

### Connections
- Named connection profiles: server, port (default 1433), database, trust server certificate
- Windows Integrated (SSPI) or SQL Server authentication; passwords in the OS keychain
- Add / edit dialog with inline connection test and status pill

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
- Copy relative path via row button, Ctrl+C, or context menu (also open in new window, open containing folder)
- Preview:
  - Syntax highlighting, match highlighting, Ctrl+F find, copy all
  - **F12** jumps to the symbol under the cursor
  - UTF-16 decoding (SSMS `.sql` files); 1 MB limit; binaries skipped
- Diff preview vs HEAD or base: unified / split (Ctrl+/), hunk navigation, copy patch

### File Viewer
- Pop-out window with vs HEAD / vs base / file modes
- Unified / split (Ctrl+Shift+M)
- Ctrl+D switches baseline, Ctrl+W closes
- Copy all, open in editor

### Syntax Highlighting
- Tree-sitter (`web-tree-sitter` 0.26) with grammars compiled from source into `public/grammars/`: `tsx`, `typescript`, `javascript`, `rust`, `c_sharp`, `sql`, `json`, `yaml`, `toml`, `css`, `html`
- Used by the file palette, file viewer, and diff views; falls back to plain text if a grammar fails to load
- CSP includes `'wasm-unsafe-eval'` so grammars instantiate in packaged builds

---

## 11. Settings

### Settings Window
- Dedicated resizable window (remembers size and position)
- Navigation rail:
  - **Data sources** — GitHub, Repositories, Azure DevOps, SQL Server
  - **Application** — Appearance, Notifications
  - **AI** — Agents
  - **System** — Updates, Maintenance
- **Ctrl+K search** across every field by label, hint, and keywords; jumps to, scrolls to, and highlights the field
- Deep links to a section; last section remembered
- Auto-save with 300ms debounce, flushed on close

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
  - Theme (System / Light / Dark)
  - Main window and flyout hotkey recorders, Windows Terminal profile
  - Run at startup, start minimized to tray
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
- Three steps:
  1. **Connect to GitHub** — GitHub CLI or PAT, validated, username detected
  2. **Select repositories** — auto-discovery, add by path or owner/name, select / deselect all
  3. **Appearance** — theme
- Shown when setup is incomplete, no repos are configured, or PAT mode has no token

### Onboarding
- First-run overlay and inline hints on the Focus tab
- "New" feature badges (Focus, Quick Review, PR summary), dismissible and remembered

---

## 13. Theme & Visual Design

- System, Light, and Dark themes; follows OS changes live
- Theme shared with pop-out windows
- CSS custom-property design system (surfaces, text tiers, status colors, accents)
- Lucide icon set across every window
- Animated tabs, toasts, dialogs, status dots, and loading skeletons
- Merge celebration toast with shimmer and optional sound
- WebView2 default context menu disabled in release builds

---

## 14. Keyboard Shortcuts

### Global Hotkeys
| Shortcut | Action |
|---|---|
| Ctrl+Win+Shift+G (configurable) | Toggle main window |
| Ctrl+Win+Shift+F (configurable) | Toggle tray flyout |
| Ctrl+F7 | Worktree palette |
| Ctrl+F8 | File palette |
| Ctrl+F9 | Work item palette |
| Ctrl+F10 | SQL window |

Palette hotkeys hide a focused palette, raise a buried one without losing input, or open it fresh. Each hotkey registers independently, so one conflict doesn't block the rest.

### In-App
- **PR list / Focus**
  - `↑`/`↓` or `j`/`k` move, `Esc` deselects
  - `o` opens in browser, `Ctrl+R` refreshes, `e` collapses groups
  - `r` Quick Review selected, `m` merge (Focus), `Shift+R` Quick Review queue
- **Quick Review** — `n` next, `p` previous, `v` mark reviewed, `Esc` exit
- **PR Files tab** — `Ctrl+Shift+M` unified / split, `[` / `]` previous / next file
- **File palette / viewer**
  - `Ctrl+C` copy path, `F12` go to symbol, `Ctrl+F` find
  - `Ctrl+/` diff mode (palette), `Ctrl+D` baseline and `Ctrl+W` close (viewer)
- **SQL** — `Ctrl+Enter` run, `Ctrl+S` save snippet, `Ctrl+Shift+S` save as snippet
- **Settings** — `Ctrl+K` search

---

## 15. Polling, Caching & Persistence

### GitHub Polling
- One GraphQL query per repo per cycle fetches open PRs, check rollup, latest reviews, and counts
- Repos polled in parallel, each with its own `gh` account
- A failing repo keeps its last known state
- Adaptive backoff: interval doubles when either the REST or GraphQL pool runs low
- ETag conditional requests for REST calls, persisted across restarts
- State-transition detection between polls drives notifications and merge celebrations
- Recently closed PRs fetched at startup (30 per repo)

### Caching
- SQLite cache (`prcache.db`): PRs, tab data, ETags, SQL schema, SQL snippets
- Warm start: cached PRs render immediately while the network refresh runs in the background
- Lazy-loaded Markdown, changelog content, and secondary windows

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
- OS notifications for update available / ready

### What's New Window
- Opens automatically after an update that includes new or improved highlights; "don't auto-open" option
- Release accordion with Storybook-captured hero screenshots, highlight cards, and "also fixed" lists
- Generated at build time from `/CHANGELOG.md`
- Reopen from the tray menu or Settings → Updates

---

## 17. Reliability & Diagnostics

- Blocking file, git, cache, settings, SQL, and auth work runs off the GUI thread; window operations use bounded waits so a stalled WebView can't freeze IPC
- Structured log at `<config dir>/BorgDock/logs/borgdock.log` (5 MB rotation)
- Panic hook writes a flushed `borgdock-panic.log` with backtrace
- Release profile uses `panic = "unwind"` so decoder panics in SQL queries surface as errors
- Hang watchdog script (`scripts/diag/hang-watchdog.ps1`) captures thread stacks and a minidump when the app stops responding
- Console windows suppressed for spawned processes on Windows
- Pop-out windows stay hidden until first paint

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

Code or settings that exist but aren't connected to anything yet:

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
- **CI log parsing** (MSBuild, dotnet test, TypeScript/ESLint, Playwright, GitHub Actions annotations) is implemented in `services/log-parser.ts` but no UI or prompt uses it; the check detail / log viewer components aren't rendered
- **Hidden-window polling slowdown** (`PollingManager.setHidden`) is never called
- **7-day cache cleanup** command is never invoked
- **Maintenance "Reset onboarding"** doesn't replay the setup wizard, despite its description
- **Settings window** doesn't load the theme bootstrap or the context-menu blocker used by other windows
- **Worktree changes panel** (`components/worktree-changes`) is built but not mounted
- **ADO Activity tab** is a "coming soon" placeholder

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2.11 |
| Frontend | React 19.2, TypeScript 6.0, Vite 8, React Compiler, Tailwind CSS 4 |
| State | Zustand 5 |
| UI libraries | lucide-react, CodeMirror 6, @tanstack/react-virtual, focus-trap-react |
| Markdown | react-markdown 10, remark-gfm, rehype-raw, rehype-sanitize, DOMPurify |
| Syntax highlighting | web-tree-sitter 0.26 (grammars built from source) |
| Backend | Rust, Tokio, reqwest, git2, ignore / grep-searcher, keyring |
| Data | SQLite via rusqlite (cache, snippets); SQL Server via tiberius |
| APIs | GitHub GraphQL + REST, GitHub CLI, Azure DevOps REST, Azure CLI, T3 orchestration API |
| Testing & tooling | Vitest 4, Playwright (+ axe-core), Storybook 10, Biome 2 |
| Tauri plugins | global-shortcut, notification, shell, dialog, autostart, single-instance, updater, store, clipboard-manager, opener, fs, log, os |
