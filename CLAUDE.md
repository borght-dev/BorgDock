# PRDock — Developer Guide for Claude

## What is this?

A desktop app that monitors GitHub PRs as a docked sidebar. Built with Tauri + React + TypeScript in `src/PRDock.Tauri/`.

## Quick Commands

```bash
cd src/PRDock.Tauri
npm install                     # Install dependencies
npm run dev                     # Dev mode with hot reload
npm run build                   # Production build
npm run tauri dev               # Launch Tauri dev window
```

## Project Layout

```
src/PRDock.Tauri/         # Tauri + React application
```

## Implementation Status (Legacy WPF — completed before Tauri rewrite)

- **Phase 1 COMPLETE**: Core skeleton (sidebar, DI, settings, tray, hotkey, themes, work area)
- **Phase 2 COMPLETE**: GitHub integration (auth, HTTP client, PR fetching, check suites/runs, PR card UI, polling loop, grouping/sorting/filtering)
- **Phase 3 COMPLETE**: Failure details (log parsing, GitHub Actions extensions, check detail panel)
- **Phase 4 COMPLETE**: Claude Code integration (worktrees, launcher, process tracking, prompt generation)
- **Phase 5 COMPLETE**: Claude review panel (review comments, Markdown rendering, severity grouping)
- **Phase 6 COMPLETE**: Polish (notifications, floating badge, auto-hide, settings flyout, setup wizard, keyboard nav, worktree pruning, recently closed PRs, merge conflict indicators)
- **Phase 7 COMPLETE**: Hardening (retry handling, rate limit display, adaptive polling, graceful degradation)
- **Phase 8 COMPLETE**: Azure DevOps (work items, CRUD, query browser, filtering, attachments, section switcher)

Full spec: `PRDock-Implementation-Plan.md`

## Self-Improvement

Whenever you learn something new that is important to remember, run into the same issue twice, or encounter an issue that might happen again — update this CLAUDE.md so the next session avoids the same pitfalls.
