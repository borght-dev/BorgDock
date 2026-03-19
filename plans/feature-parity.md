# PRDock Feature Parity: WPF vs Tauri

> Generated: 2026-03-19
> Methodology: Exhaustive file-by-file code review of both `src/PRDock.App/` (WPF) and `src/PRDock.Tauri/src/` (Tauri)

## Legend

| Symbol | Meaning |
|--------|---------|
| Y | Fully implemented |
| P | Partially implemented (details in notes) |
| N | Not implemented |

---

## 1. Windows / Entry Points

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Main sidebar window | Y | Y | WPF: `SidebarWindow.xaml`. Tauri: `main.tsx` + `App.tsx` + `Sidebar.tsx` |
| Floating badge window | Y | Y | WPF: `FloatingBadgeWindow.xaml`. Tauri: `badge-main.tsx` + `BadgeApp.tsx` |
| PR detail pop-out window | Y | P | WPF: `PRDetailWindow.xaml` (standalone window). Tauri: `PRDetailPanel.tsx` (overlay inside sidebar, not a separate OS window) |
| Work item detail pop-out | Y | Y | WPF: `WorkItemDetailWindow.xaml`. Tauri: `workitem-detail-main.tsx` |
| Setup wizard | Y | Y | WPF: `SetupWizardWindow.xaml`. Tauri: `SetupWizard.tsx` (4 steps: Auth/Repos/Position/Done) |
| Command palette window | N | Y | **Tauri-only.** `palette-main.tsx` — Ctrl+F9 ADO work item search by ID/text, pop-out detail |
| Badge showcase window | Y | N | WPF: `BadgeShowcaseWindow.xaml` (`--showcase` dev flag). Not in Tauri |
| Worktree prune dialog | Y | Y | WPF: `WorktreePruneDialog.xaml`. Tauri: `WorktreePruneDialog.tsx` |
| Notification bubble window | Y | Y | WPF: `NotificationBubbleWindow.xaml`. Tauri: `NotificationBubble.tsx` |

---

## 2. Pull Request Monitoring

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| GitHub polling (open PRs) | Y | Y | Both: configurable interval, adaptive backoff |
| GitHub polling (closed PRs) | Y | Y | WPF: 24h window. Tauri: 7-day window |
| Rate limit tracking & display | Y | Y | Both show remaining/total in status bar |
| Adaptive polling (rate limit) | Y | Y | Both double interval when rate limit low |
| Staggered repo polling | Y | N | WPF staggers 500ms between repos. Tauri polls all at once |
| PR cache (instant startup) | Y | Y | WPF: SQLite via `PRCacheService`. Tauri: SQLite via Rust `cache_*` commands |
| Search (title/author/branch/number/labels) | Y | Y | Both support free-text search across all fields |
| Filter: All/Mine/Failing/Ready/Reviewing/Closed | Y | Y | Both have identical filter chips with count badges |
| Sort by updated/created/title | Y | Y | Both support sort modes |
| Group by repo (collapsible) | Y | Y | Both group PRs by repository |
| Recently closed PR tracking | Y | Y | Both track recently closed/merged PRs |

---

## 3. Pull Request Card

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Status dot (green/yellow/red/gray) | Y | Y | |
| Multi-signal indicator (SegmentRing/SignalDots) | Y | Y | Both support indicator style setting |
| Title + PR number badge | Y | Y | |
| Draft/Merged/Closed badges | Y | Y | |
| Author avatar (2-letter initials) | Y | Y | |
| Repo name, branch name (mono font) | Y | Y | |
| Labels as color badges | Y | Y | |
| Check summary (X/Y passed) | Y | Y | |
| Review status badge | Y | Y | Approved/Changes Requested/Pending/Commented |
| Merge score badge (0-100) | Y | Y | Both: checks 40% + review 40% + mergeable 20% |
| Merge conflict indicator | Y | Y | |
| Comment count display | Y | P | WPF shows explicit comment count. Tauri doesn't show count on card |
| Additions/Deletions stats on card | Y | N | WPF shows +/- on card. Tauri only in detail panel |
| Commit count on card | Y | N | WPF shows on card. Tauri only in detail panel |
| Inline card expansion | Y | N | WPF: `ToggleExpanded` for inline detail. Tauri: no inline expand, uses overlay panel instead |
| Action: Rerun failed checks | Y | Y | Both on card hover + context menu |
| Action: Fix with Claude | Y | Y | Both on card hover + context menu |
| Action: Monitor with Claude | Y | Y | Both on card hover + context menu |
| Action: Copy errors for Claude | Y | Y | Both on card hover + context menu |
| Context menu (right-click) | Y | Y | |
| Context: Open in GitHub | Y | Y | |
| Context: Copy branch name | Y | Y | |
| Context: Copy PR URL | Y | Y | |
| Context: Checkout branch | Y | Y | Both use git fetch + checkout |
| Context: Toggle draft | Y | Y | Both use GraphQL mutations |
| Context: Merge | Y | Y | WPF has Merge + BypassMerge. Tauri has Merge only |
| Context: Bypass merge (admin) | Y | N | WPF: `BypassMergeRequested` event. Not in Tauri |
| Keyboard focus ring | Y | Y | Both show focus indicator |
| My PR visual distinction | Y | Y | WPF: different expansion/style. Tauri: different border color |

---

## 4. PR Detail Panel / Window

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Tab: Overview/Description | Y | Y | Both show title, body, stats, branches, dates |
| Tab: Commits | Y | Y | SHA, message, author, date |
| Tab: Files | Y | Y | Changed files with +/- stats, patch/diff |
| Tab: Checks | Y | Y | Check runs with status, duration, drill-down |
| Tab: Reviews | Y | Y | WPF within detail. Tauri: separate Reviews tab |
| Tab: Comments | Y | Y | Both load all comments, with inline reply |
| Animated tab underline | Y | Y | WPF: fade transition. Tauri: sliding underline |
| Markdown rendering | Y | Y | WPF: custom MarkdownRenderer → FlowDocument. Tauri: react-markdown + remark-gfm |
| Merge readiness checklist | Y | Y | Both: checks passed, review approved, no conflicts, not draft |
| Submit review (Approve/Request Changes) | Y | Y | Both call GitHub review API |
| Post comment | Y | Y | Both call GitHub issues/comments API |
| Review sort modes (newest/oldest/severity/file) | Y | N | WPF: `ReviewSortMode`. Tauri: chronological only |
| Claude Review Panel (severity grouping) | Y | Y | Both: `ClaudeReviewPanel` with critical/suggestion/praise grouping |
| Check detail panel (parsed errors) | Y | Y | Both: `CheckDetailPanel` with `ParsedErrorCard` |
| Raw log viewer | Y | Y | Both: `LogViewer` / raw log display |
| Open file in editor from error | Y | P | WPF: `OpenFileInEditor` command with file:line:col. Tauri: has editor command setting but unclear if wired in error cards |
| Lazy tab loading | Y | Y | Both load tab data on first click |
| Eager parallel tab loading | Y | N | WPF eagerly loads all tabs after init. Tauri: lazy only |
| Separate pop-out window | Y | N | WPF: `PRDetailWindow` is its own OS window. Tauri: overlay inside sidebar only |

---

## 5. Floating Badge

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Compact pill (status counts) | Y | Y | |
| Badge styles (GlassCapsule/MinimalNotch/FloatingIsland/LiquidMorph/SpectralBar) | Y | Y | Both support all 5 styles |
| Color states (red/yellow/green) | Y | Y | |
| Status text ("all clear", "X failing") | Y | Y | |
| Health fraction visualization | Y | Y | |
| Expand/collapse to full panel | Y | Y | |
| Auto-detect expand direction (up/down) | Y | Y | |
| Expanded: My PRs / Team PRs columns | Y | Y | |
| Click PR to open in sidebar | Y | Y | |
| Hover scale animation on pill | Y | Y | |
| Breathing animation | Y | Y | |
| Glow shadow by status color | Y | Y | |
| Toast notifications on badge | Y | Y | WPF: on badge window. Tauri: via badge-update event |
| Badge ↔ sidebar sync | Y | Y | WPF: events. Tauri: `useBadgeSync` with Tauri events |
| Draggable badge | Y | P | WPF: explicit drag support. Tauri: limited to window drag |

---

## 6. Sidebar Behavior

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Dock left/right | Y | Y | Both via settings |
| Configurable width | Y | Y | Both: slider in settings |
| Pinned mode | Y | Y | |
| Floating mode | Y | Y | |
| Auto-hide (floating mode) | Y | Y | WPF: `SidebarWindow` animation. Tauri: `useAutoHide` hook (3s delay) |
| Hide on mouse leave | Y | Y | |
| Hide on window blur | Y | Y | Both handle blur with exceptions for minimize/drag |
| Show on window focus | Y | Y | |
| Work area reservation (desktop space) | Y | Y | WPF: Win32 SPI_SETWORKAREA. Tauri: Rust `reserve_work_area` command |
| Work area crash recovery | Y | P | WPF: persists to disk, restores on restart. Tauri: has restore command but crash recovery unclear |
| Slide-in/out animation | Y | Y | |
| Header with drag region | Y | Y | |
| Section switcher (PRs / Work Items) | Y | Y | Both: tabs in header |
| Refresh button | Y | Y | |
| Minimize to badge button | Y | Y | |
| Settings button | Y | Y | |

---

## 7. Settings

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Settings flyout (slide-in panel) | Y | Y | |
| Save/Cancel with validation | Y | Y | |
| **GitHub Section** | | | |
| Auth method (gh CLI / PAT) | Y | Y | |
| PAT input (masked) | Y | Y | |
| PAT validation (ghp_/github_pat_) | Y | Y | |
| Poll interval slider | Y | Y | |
| **Repos Section** | | | |
| Add/remove repositories | Y | Y | |
| Per-repo worktree base path | Y | Y | |
| Per-repo worktree subfolder | Y | Y | |
| Per-repo fix prompt template | Y | Y | |
| **Appearance Section** | | | |
| Theme (system/light/dark) | Y | Y | |
| Sidebar edge (left/right) | Y | Y | |
| Sidebar mode (pinned/floating) | Y | Y | |
| Sidebar width slider | Y | Y | |
| Global hotkey (with recorder) | Y | Y | Both: `HotkeyRecorder` component |
| Badge style selector | Y | Y | |
| Indicator style selector | Y | Y | |
| Editor command | Y | Y | |
| Run at startup | Y | Y | WPF: Windows registry. Tauri: @tauri-apps/plugin-autostart |
| **Notifications Section** | | | |
| Toast on check status change | Y | Y | |
| Toast on new PR | Y | Y | |
| Toast on review update | Y | Y | |
| **Claude Code Section** | | | |
| Default post-fix action | Y | Y | |
| Claude Code path | Y | Y | |
| **Azure DevOps Section** | | | |
| Organization/project | Y | Y | |
| PAT input (masked) | Y | Y | |
| Poll interval slider | Y | Y | |
| Test connection button | Y | Y | |
| Clear/disconnect button | Y | Y | |
| **Updates Section** | | | |
| Auto-check enabled | Y | Y | |
| Auto-download | Y | Y | |
| Manual check button | Y | Y | |
| Current version display | Y | Y | |
| Download progress | Y | Y | |
| **Maintenance** | | | |
| Prune worktrees button | Y | Y | |
| Migrate to Tauri | Y | N | WPF-only: `MigrateToTauri` command (not needed in Tauri) |

---

## 8. Azure DevOps / Work Items

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Query browser (tree view) | Y | Y | Both: hierarchical folder/query tree |
| Favorite queries | Y | Y | Both: star icon, favorites section |
| Auto-load on query select | Y | Y | |
| Periodic polling | Y | Y | |
| Work item card list | Y | Y | |
| Work item detail panel | Y | Y | |
| Filter: state | Y | Y | |
| Filter: assigned to | Y | Y | |
| Filter: search text | Y | Y | |
| Filter: tracking (all/tracked/working on) | Y | Y | |
| Tracked/Working On checkboxes | Y | Y | |
| Worktree assignment per work item | Y | Y | |
| Work item CRUD (create/read/update/delete) | Y | Y | |
| Rich text HTML field rendering | Y | Y | WPF: `HtmlFieldRenderer`. Tauri: HTML rendering + `useAdoImageAuth` |
| ADO image authentication (blob URLs) | P | Y | Tauri: `useAdoImageAuth` hook replaces img src with authed blob URLs. WPF: `HtmlWebView` may handle differently |
| Attachments with download | Y | Y | |
| Standard fields display | Y | Y | |
| Custom fields display | Y | Y | |
| Last selected query persistence | Y | Y | Both restore on reload |
| Command palette (Ctrl+F9 search) | N | Y | **Tauri-only.** Separate window for quick ID/text search |
| Work item detail pop-out window | Y | Y | Both support standalone detail window |

---

## 9. Notifications

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| In-app toast notifications | Y | Y | |
| OS (native) notifications | Y | Y | |
| Check failure notification | Y | Y | |
| All checks passed notification | Y | Y | |
| Review changes requested | Y | Y | |
| Claude review critical | Y | Y | |
| New PR notification | Y | Y | |
| State transition detection | Y | Y | Both compare old vs new poll results |
| Auto-dismiss timer | Y | Y | WPF: 8s. Tauri: 5s |
| Progress bar on dismiss | Y | Y | Both: shrinking bar |
| Hover to pause timer | Y | Y | Both: pause on mouseenter, resume on mouseleave |
| Action buttons on notification | Y | Y | Primary/secondary action links |
| Notification queue (FIFO) | Y | Y | |
| Celebration notification (PR merged) | Y | P | WPF: explicit `PrClosedOrMerged` event. Tauri: state transitions handle merged, but no explicit celebration |

---

## 10. Claude Code Integration

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Fix with Claude (failing checks) | Y | Y | Both generate prompt + launch Claude Code |
| Monitor PR | Y | Y | |
| Resolve merge conflicts | Y | Y | Both: `resolveConflicts` / `LaunchConflictResolutionAsync` |
| Worktree create/reuse | Y | Y | |
| Prompt file generation | Y | Y | WPF: `%APPDATA%\PRDock\prompts\`. Tauri: via Rust temp files |
| Process tracking (active sessions) | Y | Y | WPF: `ProcessTracker`. Tauri: Rust `get_active_sessions` / `kill_session` |
| Prompt cleanup (old files) | Y | P | WPF: 7-day cleanup. Tauri: unclear if automated |

---

## 11. Keyboard Navigation

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Global hotkey (toggle sidebar) | Y | Y | Both: configurable, registered via platform API |
| Arrow Up/Down navigate PR list | Y | Y | |
| j/k navigate PR list | N | Y | **Tauri-only.** Vim-style navigation |
| Enter to select/open PR | Y | Y | |
| Escape to deselect/close | Y | Y | |
| Ctrl+R to refresh | N | Y | **Tauri-only.** |
| E to collapse all | Y | N | WPF: CollapseAll command. Not in Tauri |
| Ctrl+F9 command palette | N | Y | **Tauri-only.** |
| Focus follows scroll | Y | Y | Both scroll focused card into view |

---

## 12. Themes & Styling

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Light theme | Y | Y | |
| Dark theme | Y | Y | |
| System theme detection | Y | Y | WPF: Windows registry. Tauri: `matchMedia` + `window.theme()` |
| Dynamic theme switching | Y | Y | |
| CSS custom properties (design tokens) | N/A | Y | Tauri uses CSS variables extensively |
| XAML resource dictionaries | Y | N/A | WPF approach |

---

## 13. Infrastructure / Platform

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Single instance enforcement | Y | P | WPF: named mutex. Tauri: likely via Tauri plugin (not explicitly verified) |
| Lock file | Y | N | WPF: `prdock.lock` in AppData. Not found in Tauri |
| Serilog file logging | Y | N | WPF: rolling file logs. Tauri: console.error only (no file logging found) |
| ETag caching (conditional requests) | Y | Y | Both: cache ETag + body, send If-None-Match, return cached on 304 |
| Retry handler (exponential backoff) | Y | N | WPF: `RetryHandler` with Retry-After header support. Tauri: no explicit retry wrapper found |
| System tray icon | Y | Y | WPF: WinForms NotifyIcon. Tauri: `@tauri-apps/plugin-notification` / system tray |
| Tray right-click menu (Show/Settings/Quit) | Y | P | WPF: full context menu. Tauri: may be configured in Rust but not verified in frontend code |
| Tray tooltip with PR count | Y | P | WPF: updates tooltip text. Tauri: unclear |
| Theme-aware tray icon | Y | N | WPF: switches between light/dark PNG variants |
| Auto-update (background check) | Y | Y | WPF: Velopack. Tauri: `useAutoUpdate` hook (4h interval) |
| Repo discovery (filesystem scan) | Y | Y | WPF: `RepoDiscoveryService`. Tauri: Rust `discover_repos` command |
| Atomic settings write (backup) | Y | P | WPF: writes .bak file. Tauri: Rust save_settings (atomicity unclear) |
| Settings dev overlay | Y | N | WPF: `settings.dev.json` merge. Not in Tauri |

---

## 14. Data Models

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| PullRequest | Y | Y | Same fields |
| PullRequestWithChecks | Y | Y | Same structure |
| CheckRun / CheckSuite | Y | Y | |
| ReviewStatus | Y | Y | |
| ClaudeReviewComment (severity) | Y | Y | |
| ParsedError (from CI logs) | Y | Y | |
| WorkItem (ADO) | Y | Y | |
| AdoQuery / QueryTreeNode | Y | Y | |
| AppSettings (full hierarchy) | Y | Y | Same sections |
| InAppNotification | Y | Y | |
| WorktreeInfo | Y | Y | |
| UpdateInfo | Y | Y | |
| MigrationInfo | Y | N/A | WPF-only (for Tauri migration) |

---

## 15. Value Converters / Utility Logic

| Feature | WPF | Tauri | Notes |
|---------|-----|-------|-------|
| Status → color | Y | Y | WPF: converter. Tauri: inline JS |
| Merge score → color | Y | Y | |
| Merge score → arc geometry | Y | N | WPF: `ScoreToArcGeometryConverter`. Tauri uses simpler badge |
| Segment ring arc geometry | Y | P | WPF: `SegmentArcConverter`. Tauri: `MultiSignalIndicator` (CSS-based) |
| Work item state → color | Y | Y | |
| Priority → icon | Y | Y | |
| Initials → avatar color | Y | Y | Both hash login → palette |
| Relative time formatting | Y | Y | Both: "just now", "5m ago", "2h ago", etc. |

---

## Summary

### Overall Parity Assessment: ~92%

The Tauri rewrite covers the vast majority of WPF features. The remaining gaps are mostly:

### Features Missing in Tauri (present in WPF)

| Priority | Feature | Impact |
|----------|---------|--------|
| **Medium** | PR detail as separate pop-out window | Users can't undock PR details to a second monitor |
| **Medium** | Retry handler (exponential backoff) | API failures not retried gracefully; WPF retries on 429/500/502/503 with Retry-After header support |
| **Low** | Bypass merge (admin) | WPF: `gh pr merge --admin`. Power-user feature, rarely used |
| **Low** | Review sort modes (newest/oldest/severity/file) | WPF: `ReviewSortMode` property. Minor UX convenience |
| **Low** | Inline card expansion | Different UX approach (Tauri uses panel overlay instead) |
| **Low** | Batch worktree assignment | WPF: `ApplyWorktreeToAllWorkingOnAsync()` assigns active worktree to all working-on items |
| **Low** | Staggered repo polling | Burst avoidance, may not matter for most users |
| **Low** | Eager parallel tab loading | Minor perceived latency difference |
| **Low** | File logging (Serilog) | No persistent file logs for debugging in Tauri |
| **Low** | Lock file | WPF: `prdock.lock` with PID. Tauri may handle single-instance differently |
| **Low** | Settings dev overlay | WPF: `settings.dev.json` merge in DEBUG builds. Developer convenience only |
| **Low** | Badge showcase window | WPF: `--showcase` flag. Developer tool only |
| **Low** | Theme-aware tray icon | WPF: switches light/dark PNG variants. Cosmetic |
| **Low** | Comment count on PR card | Minor info density |
| **Low** | Additions/Deletions on PR card | Minor info density |
| **Low** | Commit count on PR card | Minor info density |
| **Low** | E key to collapse all | Minor keyboard shortcut |

### Features Only in Tauri (not in WPF)

| Priority | Feature | Impact |
|----------|---------|--------|
| **High** | Command palette (Ctrl+F9) | Quick ADO work item search + pop-out detail |
| **Medium** | j/k vim-style navigation | Power-user keyboard nav |
| **Medium** | Ctrl+R refresh shortcut | Convenience |
| **Medium** | ADO image auth (blob URLs) | Correctly renders authenticated ADO images |
| **High** | Cross-platform (macOS) | WPF is Windows-only |

### Architectural Differences (not gaps)

These are implementation differences that achieve the same end result:

| Area | WPF | Tauri |
|------|-----|-------|
| State management | CommunityToolkit.Mvvm (MVVM) | Zustand stores (React) |
| UI framework | WPF/XAML | React + Tailwind CSS |
| HTTP client | Custom `GitHubHttpClient` / `AzureDevOpsHttpClient` | Fetch-based `GitHubClient` / `AdoClient` |
| Platform APIs | Win32 P/Invoke | Tauri Rust commands |
| Auto-update | Velopack (GitHub source) | Tauri updater plugin |
| Startup registration | Windows registry | @tauri-apps/plugin-autostart |
| Markdown rendering | Custom `MarkdownRenderer` → FlowDocument | react-markdown + remark-gfm |
| HTML rendering | Custom `HtmlFieldRenderer` | dangerouslySetInnerHTML + useAdoImageAuth |
| Animations | WPF Storyboard + AnimationHelper | CSS transitions + Tailwind |
| Tray icon | WinForms NotifyIcon | Tauri system tray plugin |
| PR cache | SQLite via C# | SQLite via Rust commands |
