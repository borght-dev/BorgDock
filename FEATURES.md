# PRDock — Complete Feature List

A comprehensive catalog of every feature in PRDock, the developer desktop app that monitors GitHub PRs as a docked sidebar. Built with Tauri 2 + React 19 + TypeScript + Rust.

---

## 1. Pull Request Monitoring & Display

### PR Listing & Organization
- Real-time polling of open pull requests across multiple configured repositories
- PR grouping by repository (owner/name) with collapsible section headers
- Free-text search across PR title, author, branch name, PR number, and labels
- Sort pull requests by: last updated, created date, or title
- SQLite cache for instant startup loading with background refresh

### PR Filtering Tabs
- **All** — Show all open PRs
- **Mine** — Filter to PRs authored by current user
- **Failing** — PRs with failed CI checks
- **Ready** — PRs that are approved, passing all checks, not draft, and mergeable
- **Reviewing** — PRs with a non-approved review status (pending, commented, or changes requested)
- **Needs Review** — PRs requesting review from current user (longest-waiting first)
- **Closed** — Recently closed/merged PRs (7-day window)
- Filter counts displayed on each tab

### PR Card Display
- PR number and title
- Author with avatar (2-letter initials, color-coded: green for own PRs, purple for others)
- Status dot indicator (green/yellow/red/gray)
- Branch info (source -> target) on expand
- CI check summary (X/Y passed, grouped chips by status)
- Merge readiness score badge (0-100): CI checks 25% + review 25% + no conflicts 25% + not draft 25%
- Label badges with color coding
- Draft / Merged / Closed status badges
- Merge conflict indicator
- Visual accent border for user's own PRs
- Multi-signal readiness indicators with configurable display style (Segment Ring or Signal Dots)
- Worktree badges on PR cards
- Copy errors for Claude action (formats failed checks as markdown for clipboard)
- Right-click context menu with actions
- Keyboard focus ring and full keyboard navigation

---

## 2. PR Detail Panel

### Multi-Tab Interface
- **Overview** — PR description (Markdown rendered), merge actions, review submission, draft toggle, post comment
- **Commits** — Commit history with SHA, message, author, and date
- **Files** — Changed files with per-file additions/deletions and status (added/modified/removed/renamed)
- **Checks** — All CI checks with status, duration, and rerun capability
- **Reviews** — Submitted reviews with verdict and body
- **Comments** — All PR comments with rich author coloring, Markdown rendering, reply capability, and grouped conversations

### Overview Tab Actions
- Merge PR (squash merge strategy)
- Bypass merge (when allowed)
- Toggle draft status (mark ready / mark draft)
- Submit review: Approve, Request Changes with comment, or Comment
- Post quick comment (separate from review submission)
- Checkout PR branch locally (git fetch + checkout)
- Open in GitHub browser
- Copy branch name to clipboard
- Merge readiness checklist (visual summary of all merge criteria)
- One-click conflict resolution with Claude
- Merge celebration animation on successful merge

### Reviews Tab
- Sort by: newest, oldest, severity, or file
- Show review verdict with avatar and reviewer name
- Relative timestamp display
- Full review body with Markdown rendering

### Commits Tab
- Commit SHA (short form), message, author with avatar, and date

### Files Tab
- File status color coding (added/modified/removed/renamed)
- Per-file addition/deletion counts
- Total change summary

---

## 3. CI/CD Check Management

### Check Display
- View all GitHub Actions checks for a PR
- Group checks by check suite
- Per-check status: passed, failed, pending, skipped, cancelled, neutral, timed out
- Check duration (start to completion)
- Live progress tracking for in-progress checks

### Check Actions
- **Rerun Failed Checks** — One-click rerun of failed workflows via GitHub API
- **Fix with Claude** — Launch Claude Code with auto-generated fix prompt
- **Resolve Conflicts** — Claude-assisted merge conflict resolution

### Log Parsing & Error Extraction
- Automatic parsing of GitHub Actions log output
- Multi-format CI log parsing:
  - MSBuild / dotnet build errors
  - dotnet test failures (TRX and console output)
  - ESLint / TypeScript lint errors
  - Playwright test failures with browser/test info
  - Generic fallback (error, FAILED, exception patterns with context)
- File path and line:column extraction
- Diff-aware error tagging (introduced in PR vs pre-existing)
- Categorized error card display

---

## 4. Claude Code Integration

### Claude-Powered Actions
- **Fix with Claude** — Auto-generate targeted fix prompt from failed check context
  - Creates or reuses git worktree for PR branch
  - Generates prompt with: check failures, parsed errors, changed files, raw log (last 200 lines)
  - Per-repo custom prompt template injection
  - Opens Claude Code in terminal session
- **Monitor PR** — Launch Claude with monitoring prompt for ongoing work
- **Resolve Conflicts** — Dedicated merge conflict resolution with merge-specific prompt

### Post-Fix Actions (Configurable)
- Commit & Notify
- Commit Only
- Notify Only
- None

### Process Management
- Track active Claude Code sessions (PID, PR number, description)
- Multiple concurrent session support
- Session cleanup on process exit
- Kill session capability

### Claude Review Panel
- Detect and display Claude bot review comments
- Group by severity: Critical (red), Suggestion (yellow), Praise (green), Other
- Collapsible severity groups
- Full Markdown rendering of review bodies

### Settings
- Claude Code binary path configuration
- Default post-fix action selection

---

## 5. Git & Worktree Management

### Worktree Operations
- **List Worktrees** — View all git worktrees with detailed status
- **Create Worktree** — Auto-create worktrees for PR branches (shallow clone: --depth 1, --no-tags)
- **Remove Worktree** — Delete worktrees with confirmation
- **Prune Worktrees** — Bulk cleanup dialog for stale worktrees
- **Open in Terminal** — Launch system terminal at worktree path
- **Open in Editor** — Open worktree in VS Code

### Worktree Status Information
- Branch name per worktree
- Status: clean, dirty, or conflict
- Uncommitted file count
- Commits ahead/behind upstream
- Current commit SHA (short form)
- Main worktree indicator

### Worktree Palette (Ctrl+F7)
- Quick worktree selection floating window
- Worktree badges displayed on PR cards

### Git Operations
- Fetch from origin
- Checkout branches
- Current branch detection
- Repository path resolution and validation
- Branch name sanitization (removes invalid chars, collapses dashes)

### Repository Auto-Discovery
- Scans common directories for git repositories:
  - ~/source/repos, ~/repos, ~/projects, ~/dev, ~/code, ~/git, ~/Documents/GitHub
- Identifies GitHub-hosted repos from remote URLs
- Extracts owner/name from HTTPS and SSH remote URLs
- Deduplication of discovered repos

### Repository Configuration
- Worktree base path per repository
- Worktree subfolder configuration (default: `.worktrees`)
- Repository enable/disable toggle
- Custom fix prompt template per repo

---

## 6. Azure DevOps Integration

### Work Item Browser
- **Command Palette** (Ctrl+F9) — Quick search by work item ID
  - "Working On" items section
  - "Assigned to Me" items section
  - "Recent" items section
  - Keyboard navigation (up/down/enter/escape)

### Work Item Detail View
- Standard fields: Title, State, Type, Priority, Assigned To, Tags
- Available states dropdown based on work item type
- Editable fields with auto-save
- Rich HTML field rendering: Description, Repro Steps, Acceptance Criteria
- Custom Azure DevOps fields display and edit
- Attachments with download and metadata
- Comments: view and add with timestamps
- History: full edit history with revision tracking
- Open in browser link
- ADO image authentication (auto-inject auth headers for private image URLs)

### Work Item Browsing & Filtering
- Query browser with favorites (star icon, favorites section)
- Last selected query persistence
- Query result caching with periodic polling
- Filter by: state, assigned-to, free-text search, tracking status (all/tracked/working on)
- Tracked / Working On checkboxes per work item
- Worktree assignment per work item

### ADO Settings
- Organization name
- Project name
- Personal Access Token (with show/hide toggle)
- Poll interval (30-600 seconds)
- Connection testing with validation feedback
- Favorite queries list management

---

## 7. SQL Server Query Tool

### Connection Management
- Multiple named connection profiles
- Windows Integrated Authentication (SSPI) support
- SQL Server authentication (username/password) support
- Connection testing
- Per-connection: server, port (default 1433), database, trust server certificate toggle

### Query Execution
- SQL query input with execute shortcut (Ctrl+Enter)
- Open via Ctrl+F10 hotkey
- Results in table format with column headers
- Multiple result sets support
- Execution time display
- Row count tracking with truncation at 10,000 rows
- Null value handling
- Comprehensive SQL type conversion (string, int, float, decimal, UUID, datetime, date, time, binary)

### Persistence
- Save last executed query to local storage
- Window position persistence
- Last used connection name persistence

---

## 8. Notifications & Alerts

### Toast Notification Types
- Check failed (was passing)
- All checks passed (was failing)
- Review with changes requested
- Review requested from current user
- PR merged

### Notification Display
- Up to 3 visible notifications with overflow queue
- Color-coded severity: error (red), warning (yellow), success (green), info (blue), merged (purple)
- Auto-dismiss with progress bar countdown
- Hover to pause dismiss timer
- Manual dismiss button
- Clickable notification actions

### Notification Actions
- Open in GitHub
- Fix with Claude
- Custom action URL support

### Notification Settings
- Enable/disable check status notifications
- Enable/disable new PR notifications
- Enable/disable review update notifications
- Filter to only notify for own PRs
- Test notification button (sends test for each severity)

### Review Nudge System
- Periodic nudge notifications for pending reviews
- Configurable interval: 30 min, 1 hour, 2 hours, 4 hours
- Escalation mode: increase urgency over time
- Enable/disable toggle

---

## 9. Review SLA & Team Review Load

### Review SLA Tiers
- Fresh: review requested less than 4 hours ago
- Aging: review requested 4-24 hours ago
- Stale: review requested more than 24 hours ago
- SLA indicator component on PR cards

### Team Review Load Indicator
- Display pending review count per team member
- Visual progress bar for review load (normalized to 6 reviews max)
- Color coding: green (0-2 reviews), yellow (3-4), red (5+)
- Stale PR count per reviewer
- Click to filter: jumps to "Needs Review" tab + search by reviewer name
- Collapsible team load panel
- Real-time updates as review state changes

---

## 10. Sidebar & Window Management

### Sidebar
- Dockable to left or right screen edge
- Draggable header for repositioning
- Adjustable width (200-1200px)
- Pinned mode (always visible, reserves desktop work area)
- Floating mode (auto-hide when focus lost, 4px edge strip to reveal)
- Section tabs: PRs / Work Items
- Status bar: polling status, last update time, rate limit info

### Header
- Open PR count badge
- Section switcher (PRs / Work Items)
- Manual refresh button
- Minimize to badge button
- Settings button
- Status indicator with polling animation

### Floating Badge
- Always-on-top badge when sidebar is hidden
- Five selectable styles:
  - **Glass Capsule** — Frosted glass with pulsing status ring
  - **Minimal Notch** — Compact with thin accent bar and per-PR status pips
  - **Floating Island** — Info-dense with author avatars and mini bar chart
  - **Liquid Morph** — Animated morphing ring with action tag
  - **Spectral Bar** — Two-panel dashboard layout with health progress bar
- Status indicator: green (all clear), yellow (pending), red (failing)
- Notification badge for critical alerts
- Expandable panel showing My PRs and Team PRs columns
- Click to toggle sidebar visibility
- Pulse animation on state transition (3s settle)
- Glow shadow by status color

### Window Management
- Global hotkey toggle (customizable, default: Ctrl+Win+Shift+G)
- Minimize to badge on demand
- Open PR detail as separate pop-out window
- Work area reservation and crash recovery (Windows)
- Single-instance enforcement (prevents duplicate windows)

---

## 11. System Tray

- Theme-aware tray icon (light icon on dark OS theme and vice versa)
- Tray menu items:
  - **Show** — Toggle sidebar visibility
  - **Settings** — Open settings flyout
  - **Quit** — Exit application
- Menu-driven interaction (Show/Settings/Quit)

---

## 12. Settings & Configuration

### Settings Flyout
- Right-side slide-in panel with scrollable sections
- Auto-save with 300ms debounce
- Save on close guarantee
- Atomic settings persistence with backup (.bak file)

### GitHub Settings
- Authentication method: GitHub CLI or Personal Access Token
- PAT input with show/hide toggle
- Username configuration
- Poll interval: 30-600 seconds
- Test GitHub connection button

### Repository Settings
- Add/remove repositories dynamically
- Per-repo: owner, name, enabled toggle
- Per-repo: worktree base path, worktree subfolder
- Per-repo: custom fix prompt template

### Appearance Settings
- Theme: System, Light, Dark
- Sidebar edge: Left or Right
- Sidebar mode: Pinned or Floating
- Sidebar width: 200-1200px slider
- Badge style: 5 selectable styles
- Indicator style: Segment Ring or Signal Dots
- Global hotkey: interactive hotkey recorder
- Run at startup toggle

### Notification Settings
- Toast on check status change
- Toast on new PR
- Toast on review update
- Only notify for own PRs
- Review nudge enable/disable
- Review nudge interval selector
- Review nudge escalation toggle
- Test notification buttons

### Claude Code Settings
- Default post-fix action selector
- Claude Code binary path

### Azure DevOps Settings
- Organization, project, PAT (with show/hide)
- Poll interval: 30-600 seconds
- Test ADO connection button

### SQL Server Settings
- Multiple connection profiles
- Per-connection: name, server, port, database
- Authentication type: Windows Integrated or SQL Server
- SQL username/password (conditional)
- Trust server certificate toggle
- Test connection button
- Add/remove connections

### Updates Settings
- Auto-check for updates toggle
- Auto-download updates toggle
- Manual check button
- Update progress bar
- Install button when update available
- Current version display

---

## 13. First-Run Setup Wizard

- Multi-step guided setup (4 steps):
  1. **Authentication** — GitHub CLI auto-detection with validation, PAT fallback, username capture
  2. **Repository Discovery** — Auto-scan filesystem for git repos with GitHub remotes, multi-select checklist, worktree subfolder config
  3. **Position** — Sidebar edge selection (left/right), theme selection (system/light/dark)
  4. **Done** — Setup completion summary, launch to main app
- Validation at each step with status feedback

---

## 14. Theme System

- Light mode
- Dark mode
- System theme auto-detection (macOS: AppleInterfaceStyle, Windows: registry, Linux: gsettings)
- Dynamic theme switching
- CSS custom property design system:
  - Background, surface, and raised surface colors
  - Text colors: primary, secondary, muted, ghost, tertiary
  - Status colors: red, green, yellow, gray
  - Border and separator colors
  - Accent colors
  - Filter chip colors
  - Hover state colors
- Theme-aware tray icon variants

---

## 15. Keyboard Navigation & Shortcuts

### Global Hotkeys
- **Configurable global hotkey** (default: Ctrl+Win+Shift+G) — Toggle sidebar
- **Ctrl+F7** — Worktree palette
- **Ctrl+F9** — ADO command palette
- **Ctrl+F10** — SQL query window
- Interactive hotkey recorder with visual feedback

### In-App Keyboard Navigation
- Arrow Up/Down — Navigate between PR cards
- j/k — Vim-style navigation
- Enter — Expand/collapse PR card or select item
- Escape — Close panels, close settings, dismiss dialogs
- Tab — Cycle through action buttons
- Ctrl+R — Refresh PR list
- E — Collapse all repository groups
- Ctrl+Enter — Execute SQL query

---

## 16. Polling & Sync

### GitHub Polling
- Configurable poll interval (30-600 seconds)
- ETag-based conditional requests (If-None-Match) for API efficiency
- Rate limit awareness: tracks remaining quota, displays in status bar
- Adaptive polling: doubles interval when approaching rate limit
- PR state transition detection between polls (triggers notifications)
- Closed PR fetching and separate storage

### Azure DevOps Polling
- Configurable poll interval (30-600 seconds)
- Query result caching

### Polling Optimizations
- Staggered repo polling (500ms between repos to reduce API burst)
- ETag caching for conditional requests

### Real-Time Updates
- Badge data synced on every PR change
- Status indicators update in real-time
- Review request timestamp tracking (for SLA calculation)

---

## 17. Caching & Persistence

### SQLite PR Cache
- Initialize and manage cache database (~/.config/PRDock/prcache.db)
- Save/load PRs per repository with timestamps
- Age-based cleanup (entries older than 7 days)
- Instant startup from cache while background refresh runs

### Settings Persistence
- JSON config file (~/.config/PRDock/settings.json)
- Atomic writes with temp file + rename pattern
- Backup file (.bak) for recovery
- Development overlay support (settings.dev.json)
- Auto-load on startup with defaults fallback

### Local Storage
- Recent work items list
- SQL window position
- Last executed SQL query
- UI state preferences

---

## 18. Auto-Updates

- Check GitHub releases for newer versions
- Semver comparison (filters to v* tags, excludes wpf-v* tags)
- Private repository support (authenticated downloads)
- CDN pre-signed URL generation for release assets
- Download progress tracking with event emission
- Local HTTP server for Tauri updater plugin integration
- Auto-check on configurable interval
- Auto-download when enabled
- Manual check button
- Install button when update ready
- Current version display

---

## 19. PR Context Menu

- Open in GitHub
- Copy branch name
- Copy PR URL
- Checkout branch
- Fix with Claude
- Monitor with Claude
- Copy errors for Claude (formats failed check names as markdown, copies to clipboard)
- Rerun checks
- Merge (default merge strategy)
- Bypass merge (when allowed)
- Close PR (with confirmation)
- Open PR detail window

---

## 20. Confirmation Dialogs

- Close PR confirmation
- Bypass merge confirmation

---

## 21. Error Handling & Resilience

- Graceful degradation (no network, API errors, missing tools)
- Retry logic with exponential backoff
- Crash recovery for work area reservation (persisted to workarea.json)
- Atomic settings save with backup
- Error notifications to user
- Structured logging to ~/.config/PRDock/logs/prdock.log (5MB rotation, all rotations kept)
- GitHub auth validation
- PAT token validation
- ADO connection validation
- SQL connection validation
- Repository path validation

---

## 22. External Integrations

- **GitHub CLI** — Authentication token extraction, arbitrary gh command execution
- **GitHub REST API** — PRs, checks, reviews, comments, files, merges, rerun workflows
- **Azure DevOps REST API** — Work items, queries, attachments, comments, CRUD
- **SQL Server** — TDS 7.3+ protocol, Windows and SQL auth, query execution
- **Editor Integration** — Open worktrees in VS Code
- **Terminal Integration** — Open worktrees in system terminal (cross-platform)
- **Browser** — Open URLs via system default browser
- **Clipboard** — Copy branch names, PR URLs, PR numbers

---

## 23. Platform & System Integration

- **Cross-platform**: macOS, Windows, and Linux (with Linux support stubs for some features)
- **Auto-start** on login (Tauri autostart plugin)
- **Single-instance** enforcement (prevents duplicate app windows)
- **System theme detection**: macOS (AppleInterfaceStyle), Windows (registry), Linux (gsettings)
- **Work area reservation**: Windows (Win32 SystemParametersInfoW)
- **System notifications**: Windows WinRT toast notifications with action buttons
- **Console window hiding**: suppresses flashing terminal windows on Windows

---

## 24. Animations & Visual Polish

- Sidebar slide-in/out animations
- PR card expand/collapse animations
- Tab switching and underline sliding animations
- Badge pulse animation on state transitions (3s settle)
- Badge breathing animation and glow shadow by status color
- Toast notification fade-and-slide with progress bar
- Status dot pulse animations
- Check chip animations
- Dialog entrance animations
- Merge celebration animation on successful merge
- Loading spinners and skeleton loaders
- Hover animations and transitions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri 2 |
| Frontend | React 19, TypeScript 5.8, Tailwind CSS 4 |
| State Management | Zustand 5 |
| Backend | Rust with Tokio async runtime |
| Database | SQLite (PR cache), SQL Server (external via Tiberius TDS client) |
| Markdown | react-markdown + remark-gfm |
| HTTP | Reqwest (Rust), GitHub CLI |
| Serialization | Serde JSON |
| Testing | Vitest, Playwright |
| Tauri Plugins | global-shortcut, notification, shell, dialog, autostart, single-instance, updater, store, clipboard-manager, opener, fs, log, os |
