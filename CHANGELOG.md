# Changelog

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
