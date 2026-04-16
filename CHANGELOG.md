# Changelog

## 1.0.13 — 2026-04-16

### Bug Fixes

- **Worktree palette is styled again** — The Ctrl+F7 worktree palette shipped as unstyled raw HTML in v1.0.11 and v1.0.12: plain black text on white, no rows, no icons, no layout. Root cause was that the palette's stylesheet was stored as a React `<style>{...}</style>` child with a large inline string, and React 19 silently drops those in production builds. Moved the styles into a real `.css` file so Vite links them via `<link rel="stylesheet">`, which WebView2 always honors.
- **Theme respects your saved preference across all pop-out windows** — Pop-out windows (command palette, worktree palette, SQL, PR detail, work item detail, badge, flyout, What's new) were clobbering the user's saved `Light` / `Dark` preference on mount by re-reading the system preference and re-applying it — so if you picked Light on a dark-mode machine, every new window opened dark anyway. Removed the override; the HTML-level theme bootstrap (which already respects `localStorage`) is now the single source of truth for initial theme.

### Improvements

- **No more WebView2 right-click menu** — The default browser context menu (Inspect, Reload, Copy image address, …) no longer appears anywhere in PRDock. Components that render their own context menus still work.

## 1.0.12 — 2026-04-15

### Bug Fixes

- **Auto-updates actually check the latest release** — Every PRDock version since v1.0.8 silently failed to detect new releases. The updater asked GitHub for the full releases list and took the first entry with a `latest.json` asset, but GitHub's listing endpoint doesn't reliably sort by newest-first — duplicate tags and republished releases can bump an older version to the top. As a result the updater kept fetching an outdated `latest.json`, saw a version ≤ the installed one, and reported "You're on the latest version" forever. Switched to GitHub's canonical `/releases/latest` endpoint, which returns the single release GitHub marks as newest — plus added logging so the actual `current` vs `latest` versions are visible in `prdock.log` for future debugging. ![Auto-update fix](whats-new/1.0.12/auto-update-fix.png)

## 1.0.11 — 2026-04-15

### New Features

- **"What's new?" window** — PRDock now ships a dedicated release notes window that auto-opens the first time you launch a version with user-facing changes. It groups highlights by kind (New / Improved / Fixed), shows all missed releases in a collapsible accordion, and remembers what you've already seen. Reachable any time from the tray menu and Settings → Updates → "View release notes". ![What's new window hero](whats-new/1.0.11/whats-new-window.png)
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
- **Full brand icon set** — Added a complete set of PRDock icons (brand, dark, light, favicon, and transparent mark) in SVG and PNG at multiple sizes for a polished identity across all contexts.

## 1.0.0 — 2026-03-10

### New Features

- **Multi-signal merge readiness indicators** — PR cards now display multiple signal indicators (CI status, reviews, conflicts, draft state) at a glance, replacing the old single-score ring with a richer, more informative view.
- **Squash & merge from the sidebar** — Merge PRs directly from PRDock with one click. The PR list auto-refreshes after the merge completes.
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
- **Failure log analysis** — When a CI check fails, PRDock parses the logs and surfaces the relevant error so you can diagnose issues without leaving your desktop.
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
- **Auto-start on login** — Optionally launch PRDock when you sign in to Windows.
- **Auto-update** — Built-in update checking and installation powered by Velopack, with delta updates for fast upgrades.
