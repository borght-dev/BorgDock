# Changelog

## 1.2.0 — 2026-04-30

### New Features

- Inline diff in the file palette — Selecting a changed file now renders the diff right inside the palette window. Toggle vs HEAD / vs main, switch between Unified and Split views (Ctrl+/), step through hunks with Prev / Next, copy the patch, or pop the diff out into a real file viewer window if you want to keep reading while you keep navigating.
- Find in file — Press Ctrl+F inside the palette's preview pane to open a find strip. The match counter shows your position, Enter / Shift+Enter step through matches, Esc closes the strip without closing the palette. Matches highlight inline alongside syntax colors.
- Scope chips in palette search — A chip strip above the search input lets you flip between All / Changes / Filename / Content / Symbol. The chip is the source of truth for what you see — clicking Changes hides results, clicking Filename / Content / Symbol hides the Changes section. Typing `>` or `@` still works as a keyboard shortcut to flip the chip.
- Worktree change-count badges — Each worktree row in the Roots column shows how many uncommitted files it has so you can spot which trees have work in progress at a glance. Counts refresh on window focus and when you switch active root.
- Status bar at the bottom of the palette — Shows the active root, indexed file count, current change count, and total +/- across visible groups. Keyboard hints (↑↓, Enter, Tab, Ctrl+/, Esc) live on the right so the shortcuts are always one glance away.
- SQL editor with schema autocomplete — The query editor is now CodeMirror-based with proper syntax highlighting, schema-aware autocomplete (table names, column names, even joining tables in your FROM clause), and Tab / Shift-Tab navigation through the completion popup. Schema is cached locally so suggestions appear instantly the next time you open the window.
- SQL snippets rail — Save the active query as a named snippet, load it back, star favorites, rename, duplicate, and delete. The rail is collapsible and resizable; snippets persist across sessions.
- Merge celebrations — When a PR you're tracking lands — whether you merged it from BorgDock, your teammate merged it on GitHub, or it merged through the flyout — you get a celebration animation with a satisfying tada sound. Toggle the sound under Settings → Notifications.
- Worktree-aware diff overlay — The worktree palette now has a Worktrees / Changes tab strip; the Changes tab opens an inline diff overlay against HEAD or the merge base, so you can review what's about to ship without leaving the palette.
- Streamlined PR cards — PR cards now hover-reveal their action bar instead of cluttering the row with always-visible buttons. The flyout uses a "smart primary" action that adapts to context: Merge when the PR is ready, Review when you're being asked, etc.
- PR detail redesign — The PR detail window adopted the streamlined design: header now hoists author, branch, dates, and review score into a single panel; the review composer moved to the Files tab next to the diff so you can comment as you read.
- Refresh button in the flyout — Manual refresh with a spinning icon while the fetch is in flight.
- Add and remove custom palette roots without leaving the window — `+` button in the toolbar opens the directory picker, dashed "Add directory…" button at the end of the Custom dirs section, `×` on a row removes that root.
- Cross-window notification toasts — Pop-out windows now surface their toasts in the main sidebar instead of swallowing them, so notifications you trigger from a detail or work-item window still show up where you're watching.

### Improvements

- File palette window default size is now 1280×760 and user-resizable.
- Per-file +N / −N stats in the Changes section, with totals in the section header.
- vs HEAD / vs main / Both tri-toggle in the Changes section replaces the older paired collapse buttons.
- Sidebar docks flush to the screen edge — The window shadow that used to leave a one-pixel gap is gone; the dock edge is the screen edge.
- Sidebar opens on your primary monitor — Used to attach to whichever monitor was last active; now it goes where you expect.
- Auto-detect merge method on GitHub — If your repo only allows squash, BorgDock no longer fails with a 405; it picks the available method instead.
- SQL window has a brand icon, syntax highlighting in the editor, a "New query" affordance, and shows the Ctrl+F10 keyboard shortcut in the title bar.
- Run-selection works correctly in the SQL editor — Select a portion of your query and Ctrl+Enter executes just that part. (Polished and now robust.)
- Worktree palette polish — Folder and editor actions actually work; visuals match the streamlined design.
- Per-PR refresh after action — Merging, closing, marking draft, or submitting a review now refreshes that one PR immediately instead of waiting for the next polling cycle.
- Faster cold-cache palette feel — File-index cache landing is groundwork for further polish (a persistent SQLite cache for the file index is designed and ready to ship).
- Settings: new "Play merge celebration sound" toggle under Notifications.

### Bug Fixes

- SQL autocomplete now actually fires column suggestions from the table named in your FROM clause — the source was wired up but the override registration was incorrect, so completions always fell back to keyword-only.
- SQL identifier quoting respects MSSQL bracket form (`[name]`) instead of using ANSI double-quotes that SQL Server rejects.
- SQL editor typing lag eliminated — The schema autocomplete source was triggering a cascade of expensive recomputations on every keystroke.
- Schema cache write failures no longer poison the fetch path — A failed `cache_save_sql_schema` used to bubble up and abort the whole schema refresh.
- File palette Add Directory dialog now opens — The palette window's capability file was missing a grant for the dialog plugin, so the "Add" button silently did nothing.
- File palette: cancellation closure threaded through search instead of the prior global flag, eliminating a race when switching roots mid-search.
- File palette: drive-letter paths normalize case-insensitively on Windows so two roots that differ only by `C:` vs `c:` aren't double-listed.
- Theme accessibility — `--color-text-muted` darkened to pass WCAG 2.1 AA contrast.
- Polling resilience — GitHub polling now waits for app init to complete before firing its first request, avoiding a noisy "not ready" error in logs on slow startups.
- Wizard: Access Token method-picker subtitle disambiguated so the choice is clear during onboarding.
- Onboarding store guards against missing Tauri runtime so the persisted-state hook doesn't throw in dev / test contexts.
- File viewer: classes renamed from `fv-*` to `bd-fv-*` to match the rest of the codebase's namespace.
- File viewer's split layout remembers your choice across sessions and opens at a balanced 50/50 split.
- Flyout cancellation guard on init — A blur during palette-open used to cause a stale-state warning; the cancelled-flag pattern now matches the rest of the windows.
- Work-item detail invoke effect cancellation guard — Same fix applied to the work-item detail window.
- ClaudeReview count badge styled as a Pill instead of a non-existent Chip.
- PR action bar restored — The "Resolve Conflicts" button is always visible when relevant; comment counts render correctly; layout no longer collapses on narrow widths.
- Flyout's hover-revealed Fix / Monitor row actions restored after a regression in the streamlined redesign.
- PRCard keyboard activation works on the review-pill, closed, and worktree branches; tests now cover those.
- FeatureBadge dismissal works again, and the focus-count badge has tests covering the dismiss flow.

## 1.1.0 — 2026-04-23

### New Features

- Tray-first workflow — BorgDock now stays out of your way by default. The sidebar no longer auto-opens on launch; the tray icon is your constant presence. Use `Ctrl+Win+Shift+F` (configurable in Settings) to pop up the tray flyout for a quick glance, or `Ctrl+Win+Shift+G` to summon the full sidebar when you want to dig in. Right-click the tray for Show flyout / Show sidebar / Settings / What's new / Quit.
- In-app notification toasts — Notifications now appear as styled BorgDock toasts near the tray instead of landing in Windows Action Center. Each toast shows title, severity, and inline action buttons (Fix with Claude, Open) so you can react without opening the sidebar. Toasts auto-hide after 7 seconds, pause on hover, and stack up to three when multiple events fire close together.
- First-run setup wizard as a modal — New users see a centered modal wizard on first launch instead of the docked sidebar; subsequent launches go straight into the tray-first experience.
- Changes section in the file palette — Press `Ctrl+F8` and you'll see modified/added/deleted files from the current worktree grouped at the top of the results, before any search query. Jump from palette to diff without context-switching.
- Worktree-aware PR checkout — Checking out a PR now honors the correct git worktree and preloads its baseline for the file viewer, so you see the exact change set instead of raw file contents.
- Deep-linkable file viewer — The file viewer can open with a specific baseline via URL query param, making viewer windows shareable across palette → viewer handoffs.

### Improvements

- BorgDock brand — The product is now BorgDock (renamed from PRDock). Tray icon, settings, logs, and AppData paths all follow the new name.
- Faster file palette startup — File index now persists across sessions in a SQLite-backed cache with in-flight deduplication, so the palette opens instantly on repeat use instead of rescanning your worktrees every time.
- DPI-correct flyout positioning — The flyout now sits cleanly above the taskbar at any display scale. No more slight overlap at 125% / 150% scaling on Windows.
- Tray icon shows a loading state — While BorgDock fetches your PRs on startup, the tray icon gently breathes with a "BorgDock — loading…" tooltip. You can tell at a glance whether data is current.
- Cross-platform tray positioning — On macOS and Linux (GNOME/Ubuntu), the flyout now anchors to the top-right near the menu bar/indicator area. Windows keeps its bottom-right anchor.
- Debounced Azure DevOps settings — Connection fields now debounce as you type, and a new "Open Settings" shortcut jumps directly to the ADO section.
- Polling resilience — When a poll fails, previously-fetched check statuses are preserved instead of being cleared. Your PR list stays informative through transient network hiccups.
- Configurable flyout hotkey — The flyout's global shortcut is now user-configurable alongside the existing sidebar hotkey in Settings → Appearance.
- Marketing site rebuilt — The public site is now a typed Astro + React project with design-system-aligned mockups and mobile-responsive layouts.
- Release pipeline modernized — Releases now run on GitHub-hosted runners with the Tauri updater v2 format, simplifying the updater plugin and removing CI cruft.

### Bug Fixes

- Split view in the file viewer now remembers its choice across sessions and opens at a proper 50/50 layout instead of an unbalanced default.
- File palette search results scroll correctly when long, and favorites are used as the default root when available.
- Corrupt file-palette cache database is auto-quarantined and rebuilt instead of breaking palette load.
- File palette's selected index now correctly offsets when the Changes section is present, so arrow-key navigation lands on the right row.
- Palette focus handoff is driven from the frontend handshake, avoiding a race that could leave palettes out of focus on open.

## 1.0.16 — 2026-04-22

### Bug Fixes

- Syntax highlighting works in installed builds — Tree-sitter grammars were silently failing to load in packaged releases because the app's Content Security Policy blocked WebAssembly compilation. The CSP now allows `wasm-unsafe-eval` so diffs, the file palette preview, and the file viewer all render with proper syntax colors again.

## 1.0.15 — 2026-04-22

### New Features

- **File palette (Ctrl+F8)** — A new palette for finding files across your git worktrees and custom roots. Three search modes: filename search by default, `> foo` for content search (ripgrep-backed regex), and `@bar` to jump to a function/class/symbol via Tree-sitter. Arrow keys navigate; a live preview pane renders the file with syntax highlighting; F12 inside the preview jumps to the symbol's implementation; Enter pops out a dedicated viewer window. Favorites, collapsible roots, and remembered layout preferences round it out. ![File palette](whats-new/1.0.15/file-palette.png)
- Panic log for post-mortem crash diagnostics — Unexpected crashes now write a synchronously-flushed stack trace to `%APPDATA%\BorgDock\logs\borgdock-panic.log`, so you can share the file if BorgDock ever disappears on you.

### Improvements

- **Run only the highlighted SQL** — Select a portion of your query and hit Run (or Ctrl+Enter) to execute just that part. Perfect for multi-statement scripts or trimming a WHERE clause to check the broader result. ![Run selected SQL](whats-new/1.0.15/sql-run-selection.png)
- SQL window has a taskbar entry and shows up in Alt-Tab — The SQL runner is now a real first-class window instead of a pop-out that vanishes from window switchers.
- **Confirm before Bypass Merge** — The PR detail window now asks for confirmation before bypassing required checks on a merge, so a stray click can't silently override branch protection. ![Bypass merge confirm dialog](whats-new/1.0.15/bypass-merge-confirm.png)
- Smarter row selection in SQL results — Click a selected row a second time to deselect it, or click anywhere outside the results to clear all row selections.
- Stronger syntax highlighting — Tree-sitter runtime upgraded to 0.26, and every grammar (TypeScript, Rust, C#, SQL, YAML, TOML, JSON, and more) is now compiled from source, fixing cases where files silently fell back to plain text.

### Bug Fixes

- SQL queries on spatial columns no longer crash BorgDock — Querying tables with `geography`, `geometry`, or `hierarchyid` columns (common in certain views) used to abort the whole app because Tiberius panics on unsupported SQL Server types. BorgDock now catches the panic and returns a friendly error suggesting you avoid `SELECT *`.
- File palette previews UTF-16 SQL Server scripts as text — `.sql` files saved from SSMS are UTF-16 encoded. The preview pane now decodes them correctly instead of treating them as binary.

## 1.0.14 — 2026-04-20

### New Features

- **Azure CLI authentication for Azure DevOps** — Connect to Azure DevOps using your existing `az login` session instead of minting and rotating Personal Access Tokens. Settings → Azure DevOps has a new auth-method toggle that defaults to Azure CLI when `az` is installed on your machine; BorgDock fetches a fresh bearer token on demand and transparently refreshes it when it expires. If you already have a PAT configured it keeps working unchanged — the PAT flow is still available for anyone without `az` installed. ![Azure CLI auth in settings](whats-new/1.0.14/azure-cli-auth.png)

## 1.0.13 — 2026-04-16

### Bug Fixes

- **Worktree palette is styled again** — The Ctrl+F7 worktree palette shipped as unstyled raw HTML in v1.0.11 and v1.0.12: plain black text on white, no rows, no icons, no layout. Root cause was that the palette's stylesheet was stored as a React `<style>{...}</style>` child with a large inline string, and React 19 silently drops those in production builds. Moved the styles into a real `.css` file so Vite links them via `<link rel="stylesheet">`, which WebView2 always honors.
- **Theme respects your saved preference across all pop-out windows** — Pop-out windows (command palette, worktree palette, SQL, PR detail, work item detail, badge, flyout, What's new) were clobbering the user's saved `Light` / `Dark` preference on mount by re-reading the system preference and re-applying it — so if you picked Light on a dark-mode machine, every new window opened dark anyway. Removed the override; the HTML-level theme bootstrap (which already respects `localStorage`) is now the single source of truth for initial theme.

### Improvements

- **No more WebView2 right-click menu** — The default browser context menu (Inspect, Reload, Copy image address, …) no longer appears anywhere in BorgDock. Components that render their own context menus still work.

## 1.0.12 — 2026-04-15

### Bug Fixes

- **Auto-updates actually check the latest release** — Every BorgDock version since v1.0.8 silently failed to detect new releases. The updater asked GitHub for the full releases list and took the first entry with a `latest.json` asset, but GitHub's listing endpoint doesn't reliably sort by newest-first — duplicate tags and republished releases can bump an older version to the top. As a result the updater kept fetching an outdated `latest.json`, saw a version ≤ the installed one, and reported "You're on the latest version" forever. Switched to GitHub's canonical `/releases/latest` endpoint, which returns the single release GitHub marks as newest — plus added logging so the actual `current` vs `latest` versions are visible in `borgdock.log` for future debugging. ![Auto-update fix](whats-new/1.0.12/auto-update-fix.png)

## 1.0.11 — 2026-04-15

### New Features

- **"What's new?" window** — BorgDock now ships a dedicated release notes window that auto-opens the first time you launch a version with user-facing changes. It groups highlights by kind (New / Improved / Fixed), shows all missed releases in a collapsible accordion, and remembers what you've already seen. Reachable any time from the tray menu and Settings → Updates → "View release notes". ![What's new window hero](whats-new/1.0.11/whats-new-window.png)
- **Close PRs from the detail panel** — Stop hopping to the browser for dead PRs. The PR detail window now has a Close PR button that closes the pull request and auto-refreshes the list so you don't have to re-poll. ![Close PR button](whats-new/1.0.11/close-pr.png)
- **Inline Fix-with-Claude on failing checks** — Failing check rows in the PR detail window now have a Fix with Claude button right there. One click spins up a worktree, generates a prompt from the check log, and launches Claude Code — no more scrolling up to the global button. ![Inline Fix with Claude](whats-new/1.0.11/fix-with-claude.png)
- **Tray flyout** — Left-click the system tray icon to pop up a rich flyout panel above the taskbar with your PR list, per-PR status, inline Fix and Monitor actions, and a direct path to expand the sidebar. No more opening the main window just to see what's happening. ![Tray flyout popping up above the system tray](whats-new/1.0.11/tray-flyout.png)
- **Floating badge is back** — The ambient floating badge is back, now as an optional companion to the tray flyout. Enable it in Settings → Appearance and pick from five styles (Glass Capsule, Minimal Notch, Floating Island, Liquid Morph, Spectral Bar). Drag it anywhere on your screen, click to expand the sidebar, expand it inline to see your full PR list. ![Floating badge glass capsule](whats-new/1.0.11/floating-badge.png)
- SQLite PR cache with startup hydration — fresh launches now load your last-seen PR list instantly from a local cache while the real data fetches in the background.
- Tactile button system — every button has pointer-cursor and press-feedback states so clickable vs non-clickable is unmistakable.
- Azure DevOps HTTP proxy via Rust — ADO calls route through a Rust reqwest proxy so CORS no longer blocks attachments, avatars, or signed queries.

### Improvements

- Keyboard shortcuts toggle their windows — Ctrl+F7 (worktrees), Ctrl+F9 (command palette), and Ctrl+F10 (SQL) now open on first press and close on the second press.
- Every pop-out window (PR detail, work item detail, What's New, SQL, worktree palette) now uses the same custom draggable title bar with matching minimize / maximize / close controls — the native OS title bar has been retired from every pop-out.
- Tray tooltip surfaces live open / failing / pending PR counts on hover.
- Sidebar position clamps to monitor bounds so it never drifts off-screen on multi-monitor setups.
- GitHub check runs are paginated (>100 checks per ref are now visible) and API errors surface the actual error body instead of a generic "request failed".
- Virtualized CI log viewer — large Playwright / CI logs no longer lock up the app when scrolled.
- Debounced badge / flyout updates and memoized PR card selectors cut background CPU usage significantly.
- Tray icon renders from a single shared brand waveform constant so every state stays pixel-identical.

### Bug Fixes

- **Credentials survive reboots** — GitHub, Azure DevOps, Claude API, and SQL passwords now live in the native OS keyring (Windows Credential Manager / macOS Keychain / libsecret) instead of in-memory only. No more re-authenticating after every restart. ![Credentials in Credential Manager](whats-new/1.0.11/credentials-keyring.png)
- PR detail pop-out no longer hangs on creation or produces a blank white window on Windows.
- Settings flyout no longer deadlocks on the worktree-prune dialog ("Maximum update depth exceeded" loop).
- Notifications fire even when the sidebar is auto-hidden.
- SQL queries now hydrate their password from the keychain before executing — fixes the "password is null" cold-start error.
- External links in review comments and PR descriptions open via the system browser and HTML in markdown renders correctly instead of showing as raw source.
- Floating badge window no longer clips when expanding upward.
- Settings writes are atomic with backup fallback on crash mid-save.
- Resolved 45+ pre-existing strict-mode type errors, lint warnings, and flaky tests so `npm run build` and `npm run lint` exit cleanly.

## 1.0.10 — 2026-04-01

### New Features

- **Actionable OS notifications** — Toast notifications now include **Merge**, **Approve changes**, and **Bypass Merge** buttons so you can act on PRs directly from the notification without opening the app.
- **Click notifications to open PR details** — Clicking any OS toast notification now opens the PR detail window for that pull request.

### Improvements

- **SQL runner shows all result sets** — Running multiple SQL statements now displays all result sets as labeled, stacked sections instead of only the first one. Selection and copy work across all result sets.

## 1.0.3 — 2026-03-10

### Improvements

- **Notifications now appear at the top-right of your screen** — The notification bubble has moved from the bottom-right to the top-right corner, making it much harder to miss. It's also larger and bolder, with a colored severity accent strip, bigger icons, and a stronger shadow for maximum visibility.

## 1.0.2 — 2026-03-10

### Bug Fixes

- **Notification windows are no longer transparent** — Floating notifications and badge toasts now have a solid background instead of being see-through, so they're readable regardless of what's behind them.

## 1.0.1 — 2026-03-10

### Improvements

- **Theme-aware tray icon** — The system tray icon now automatically switches between light and dark variants to match your current theme, so it always looks right on your taskbar.
- **Full brand icon set** — Added a complete set of BorgDock icons (brand, dark, light, favicon, and transparent mark) in SVG and PNG at multiple sizes for a polished identity across all contexts.

## 1.0.0 — 2026-03-10

### New Features

- **Multi-signal merge readiness indicators** — PR cards now display multiple signal indicators (CI status, reviews, conflicts, draft state) at a glance, replacing the old single-score ring with a richer, more informative view.
- **Squash & merge from the sidebar** — Merge PRs directly from BorgDock with one click. The PR list auto-refreshes after the merge completes.
- **Toggle draft / ready for review** — Switch a PR between draft and ready-for-review without leaving your desktop.
- **In-app notification bubbles** — Notifications now appear as polished in-app bubbles with smooth fade-and-slide animations, replacing the old OS toast popups.
- **Expandable floating badge** — The floating badge can now expand to show your full PR list, so you can check statuses without opening the sidebar. It also supports upward expansion for bottom-of-screen placement.
- **Manual refresh button** — A refresh button in the sidebar title bar lets you trigger an immediate data update anytime.

### Improvements

- **Polished animations throughout** — Sidebar slide-in, PR card expand, dialog entrances, badge fade, tab switching, and status dot pulse all have smooth, consistent motion powered by a centralized animation system.
- **Better status color contrast** — The yellow/orange status color has been tuned for better visibility next to red indicators.
- **Customizable indicator style** — Choose between different indicator display styles in Settings, with live preview as you switch.
- **Crisp SVG readiness icons** — Merge readiness icons now use sharp SVG paths with animated spinners for in-progress states.
- **Badge showcase mode** — Launch with `--showcase` to preview all floating badge variants side by side.

### Bug Fixes

- Fixed floating badge drifting out of position when expanding upward.
- Fixed Markdown pipe tables not rendering correctly in review comments.
- Fixed merge using the wrong strategy — now correctly uses squash merge to match repository settings.
- Removed a redundant "CHECKS" section that appeared in expanded PR cards.

## 0.0.9 — 2026-03-09

### New Features

- **Customizable floating badge styles** — Choose from 5 different floating badge designs (minimal, detailed, dot, icon-only, and compact) to match your desktop aesthetic.

### Improvements

- **Markdown tables in review comments** — AI review comments containing tables now render as proper formatted tables instead of raw Markdown syntax.
- **Sortable review comments** — Review comments can now be sorted by severity, file, or line number, making it easier to triage code review feedback.

## 0.0.8 — 2026-03-09

### New Features

- **Resizable PR detail window** — The PR detail panel now defaults to 800px wide and can be resized up to 1200px, giving you more room to review code changes, checks, and comments.

### Improvements

- **Wider sidebar by default** — The sidebar now starts at 800px wide (up from 420px) and can be expanded up to 1200px via the settings slider, so you can see more PR detail at a glance.
- **Faster "Fix with Claude" launch** — Worktree setup, file fetching, and log fetching now run in parallel, cutting the wait time before Claude Code opens.
- **Better worktree handling** — Existing worktrees are reused instead of failing, and the branch is always pulled to latest before launching Claude.

### Bug Fixes

- **"Fix with Claude" now works** — Fixed two invalid CLI flags (`--cwd` and `--prompt-file`) that prevented Claude Code from launching. The button now correctly opens a new terminal tab with Claude ready to fix your CI failures.
- **Auto-update now detects new versions** — Update checks were silently failing because the GitHub token wasn't being passed to the update checker. Private repo releases are now properly authenticated.
- **No more detached HEAD in worktrees** — Worktrees are now created with a proper local tracking branch instead of a detached HEAD state.

## 0.0.7 — 2026-03-09

### New Features

- **Monitor PR with Claude** — Launch a Claude Code session that watches your PR's CI pipeline, automatically fixes any failures, commits, pushes, and keeps checking until all checks pass. No more babysitting flaky builds.
- **Closed PRs filter tab** — A dedicated "Closed" filter lets you browse recently closed and merged PRs without cluttering your active PR list.
- **Playwright test failure parsing** — CI logs from Playwright test runs are now parsed and displayed with individual test names, browser info, error context, and a summary of passed/failed/flaky counts.

### Improvements

- **Smarter PR list ordering** — Your PRs always appear at the top, open PRs sort above drafts, and closed PRs are grouped at the bottom with a clear separator. At a glance, you can tell what's yours and what needs attention.
- **Visual "my PR" indicator** — Your own PRs now have an accent-colored left border so they stand out immediately in the list.
- **Redesigned PR detail window** — The detail view has been refreshed with improved layout and better AI review classification.
- **Copy for Claude auto-loads details** — The "Copy for Claude" button now automatically loads check details before copying, so you always get the full error context.

### Bug Fixes

- **Setup wizard no longer reappears after updates** — Previously, the first-run wizard would show again after Velopack auto-updates. This is now fixed.

## 0.0.6 — 2026-03-09

### Bug Fixes

- **Auto-updates now work correctly** — Fixed an issue where the update checker was pointing to the wrong GitHub repository, preventing automatic updates from being detected and installed.

## 0.0.5 — 2026-03-09

### New Features

- **Customizable global hotkey** — You can now record and assign your own keyboard shortcut to toggle the sidebar, right from the Settings panel.
- **Chromeless setup wizard** — The first-run setup experience now uses a sleek, borderless window that feels native to the app.

### Improvements

- **Releases are now auto-published** — Tags pushed to GitHub automatically build, package, and publish a full release with generated changelogs. No more manual uploads.

## 0.0.3 — 2026-03-09

### Improvements

- **Quick-action shortcut buttons on PR cards** — Checkout, open in browser, and other common actions are now just one click away directly on each PR card.
- **Reliable release pipeline** — The release workflow now runs on a self-hosted Windows runner with Velopack packaging, producing proper delta updates and Setup.exe installers.

### Bug Fixes

- Fixed an issue where fetching remote branches could fail silently during checkout.
- Fixed a false "you're on the latest version" message that appeared even when updates were available.

## 0.0.2 — 2026-03-09

### New Features

- **GitHub PR sidebar** — A docked desktop sidebar that monitors your GitHub pull requests in real time, with automatic polling and grouped-by-repo display.
- **Live CI/CD status** — See check suites and individual check runs directly on each PR card, with color-coded pass/fail indicators.
- **Failure log analysis** — When a CI check fails, BorgDock parses the logs and surfaces the relevant error so you can diagnose issues without leaving your desktop.
- **Claude Code integration** — Launch Claude Code fix sessions in isolated git worktrees directly from failed checks, with generated prompts and process tracking.
- **Claude review panel** — View AI-generated code review comments grouped by severity, rendered with full Markdown support.
- **Floating badge** — A minimal, always-visible status pill shows your PR health at a glance even when the sidebar is hidden.
- **Desktop notifications** — Get toast notifications when PR statuses change, checks complete, or reviews come in.
- **Settings flyout** — Configure repos, themes, polling intervals, notifications, and more from an in-app settings panel.
- **Setup wizard** — A guided first-run experience walks you through GitHub authentication and repository selection.
- **Light and dark themes** — Switch between carefully designed light and dark color palettes.
- **Auto-hide sidebar** — The sidebar smoothly animates out of view when not in focus, reclaiming your screen real estate.
- **Keyboard navigation** — Navigate between PR cards with keyboard shortcuts for a mouse-free workflow.
- **Worktree management** — Browse, inspect, and prune git worktrees created by Claude Code sessions.
- **Recently closed PRs** — Merged and closed PRs stay visible briefly so you don't lose track of recent activity.
- **Merge conflict indicators** — PRs with merge conflicts are clearly flagged so you know what needs attention.
- **Retry and rate limiting** — Automatic retry with exponential backoff, plus a live display of your GitHub API rate limit usage.
- **Atomic settings** — Settings are saved atomically with backup recovery, so a crash mid-save won't corrupt your config.
- **SQLite PR cache** — Previously fetched PRs load instantly on startup from a local cache while fresh data is fetched in the background.
- **Rich Markdown rendering** — Full AST-based Markdown rendering for review comments, with syntax highlighting and proper formatting.
- **PR detail view** — Drill into any PR to see commits, changed files, comments, and review threads.
- **Auto-start on login** — Optionally launch BorgDock when you sign in to Windows.
- **Auto-update** — Built-in update checking and installation powered by Velopack, with delta updates for fast upgrades.
