# BorgDock — GitHub PR Monitor & Auto-Fix Tool

## Project Overview

Build a lightweight Windows desktop application that displays all open pull requests from configurable GitHub repositories as a docked sidebar overlay. The app surfaces CI check status, review state, and Claude Code review findings at a glance. Failed checks can be inspected inline (parsed errors + raw logs), and with one click, a Claude Code session spawns in a standalone terminal to automatically fix the failure — finding the right git worktree or creating a new one.

**Tech stack:** .NET 10 + WPF (WinUI-inspired styling), targeting Windows 10/11.

**Scope:** Personal tool for a developer with a handful of repos and ≤10 open PRs at a time. Not designed for enterprise scale.

> **IMPORTANT — Latest versions only:** Always use the absolute latest stable versions of .NET (10.x), all NuGet packages, and all tooling. Before adding any dependency, check NuGet.org for the current latest version. Do NOT hardcode or assume version numbers from training data — they are likely outdated. Run `dotnet add package <name>` without specifying a version to automatically pull the latest, or verify with `dotnet package search <name>` first.

---

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│  BorgDock.App (WPF)                                           │
│  ├── Views/          — XAML views (sidebar, settings, etc.) │
│  ├── ViewModels/     — MVVM view models                     │
│  ├── Services/                                              │
│  │   ├── GitHubService          — REST API polling          │
│  │   ├── GitHubActionsService   — Workflow run & log fetch  │
│  │   ├── LogParserService       — Error extraction/parsing  │
│  │   ├── WorktreeService        — Git worktree discovery    │
│  │   ├── ClaudeCodeLauncher     — Terminal session spawning │
│  │   ├── NotificationService    — Windows toast manager     │
│  │   ├── SettingsService        — JSON config read/write    │
│  │   └── RepoDiscoveryService   — Scan local paths for git repos │
│  ├── Models/         — PR, Check, WorkflowRun, Settings     │
│  └── Infrastructure/ — HTTP client, caching, logging        │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

- **MVVM with CommunityToolkit.Mvvm** — for source-generated observable properties and relay commands.
- **Microsoft.Extensions.DependencyInjection** — full DI container for service registration in App.xaml.cs.
- **Single-process, no background service** — the app IS the process; system tray keeps it alive when minimized.
- **Minimal dependencies** — avoid heavy frameworks. Use `System.Net.Http` + `System.Text.Json` directly for GitHub API, no Octokit bloat.
- **Async-first** — all API calls via `HttpClient` with `CancellationToken` support. Never block the UI thread.
- **Resource-light** — target <50MB RAM, <1% CPU at idle. Use `Timer`-based polling, not continuous loops.
- **Modern C#** — use the latest C# language version (shipped with .NET 10). Leverage primary constructors, collection expressions, `field` keyword, pattern matching, raw string literals, and other modern features throughout.

---

## Settings System

### Config File

Location: `%APPDATA%\BorgDock\settings.json`

```jsonc
{
  "github": {
    "authMethod": "ghCli", // "ghCli" | "pat"
    "personalAccessToken": null, // used only if authMethod is "pat" — stored plain text
    "pollIntervalSeconds": 60,
    "username": "koen-dev" // for "my PRs" highlighting
  },
  "repos": [
    {
      "owner": "example",
      "name": "example-repo",
      "enabled": true,
      "worktreeBasePath": "D:\\example-repo",
      "worktreeSubfolder": ".worktrees", // worktrees created under {basePath}\{subfolder}\{branch-name}
      "fixPromptTemplate": null // optional per-repo prompt additions for Claude Code
    },
    {
      "owner": "example",
      "name": "fsp-portal",
      "enabled": true,
      "worktreeBasePath": "D:\\FSP-Portal",
      "worktreeSubfolder": ".worktrees",
      "fixPromptTemplate": null
    }
  ],
  "ui": {
    "sidebarEdge": "right", // "left" | "right"
    "sidebarMode": "pinned", // "pinned" | "autohide"
    "sidebarWidthPx": 420,
    "theme": "system", // "system" | "dark" | "light"
    "globalHotkey": "Ctrl+Win+Shift+G",
    "editorCommand": "code" // for opening files from review comments — supports "code", "rider", etc.
  },
  "notifications": {
    "toastOnCheckStatusChange": true,
    "toastOnNewPR": false,
    "toastOnReviewUpdate": true
  },
  "claudeCode": {
    "defaultPostFixAction": "commitAndNotify", // "autoPush" | "commitAndNotify" | "askEachTime"
    "claudeCodePath": null // auto-detect from PATH, or explicit override
  },
  "claudeReview": {
    "botUsername": "claude[bot]" // username to detect Claude Code review comments
  }
}
```

### Settings UI

A flyout panel inside the sidebar (gear icon) that reads/writes the JSON. Sections:

1. **GitHub** — Auth method toggle (gh CLI / PAT input), username, poll interval slider (15s–300s).
2. **Repositories** — List with add/remove/toggle. Per-repo: owner, name, worktree base path (folder picker), worktree subfolder name, optional fix prompt template.
3. **Appearance** — Sidebar edge, mode toggle, width, theme, editor command.
4. **Notifications** — Checkboxes for each toast event type.
5. **Claude Code** — Post-fix action dropdown, path override.
6. **Worktree Management** — "Prune worktrees" button (see Worktree Cleanup section).

---

## First-Run Experience

When no `settings.json` exists, BorgDock launches a multi-step setup wizard:

1. **Authentication** — Auto-detect `gh` CLI. If `gh auth token` succeeds, show "Authenticated via gh CLI ✓". If not, prompt for a PAT. Show a note that PAT is stored in plain text and gh CLI is preferred.
2. **Repository Discovery** — Scan `D:\` and `C:\Dev` for git repositories with GitHub remotes. Present a checklist of discovered repos (showing `owner/name` and local path). User selects which to monitor.
3. **Worktree Paths** — For each selected repo, auto-fill the `worktreeBasePath` from the discovered clone path. User confirms or edits. Set default `worktreeSubfolder` to `.worktrees`.
4. **Sidebar Preference** — Choose sidebar edge (left/right) and mode (pinned/auto-hide).
5. **Done** — Start polling immediately.

---

## GitHub API Integration

### Authentication

Support two methods:

1. **GitHub CLI (`gh`)** — Preferred. Shell out to `gh auth token` to retrieve the token at startup. Validate with a test API call. If `gh` is not installed or not authenticated, fall back to prompting for PAT.
2. **Personal Access Token** — Stored in settings JSON (plain text). Scopes needed: `repo`, `read:org`, `workflow` (for re-running workflows).

### Endpoints Used

| Purpose | Endpoint | Frequency |
|---------|----------|-----------|
| List open PRs | `GET /repos/{owner}/{repo}/pulls?state=open` | Every poll interval |
| PR reviews | `GET /repos/{owner}/{repo}/pulls/{number}/reviews` | Per PR, every poll |
| Check suites | `GET /repos/{owner}/{repo}/commits/{sha}/check-suites` | Per PR, every poll |
| Check runs | `GET /repos/{owner}/{repo}/check-suites/{id}/check-runs` | Per PR, every poll |
| Workflow run logs | `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` | On-demand (click) |
| Job log | `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` | On-demand (click) |
| Re-run workflow | `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun` | On-demand (click) |
| PR comments | `GET /repos/{owner}/{repo}/issues/{number}/comments` | Per PR, every poll |
| Review comments | `GET /repos/{owner}/{repo}/pulls/{number}/comments` | Per PR, every poll |
| Merge conflict | Check `mergeable` field from `GET /repos/{owner}/{repo}/pulls/{number}` | Per PR, every poll |
| PR changed files | `GET /repos/{owner}/{repo}/pulls/{number}/files` | Per PR, on-demand for diff-aware error parsing |

### Rate Limit Strategy

- Use conditional requests (`If-None-Match` / ETags) to minimize quota usage — GitHub returns `304 Not Modified` and doesn't count against the rate limit.
- Batch requests per repo, stagger repos across the poll interval to avoid bursts.
- Show remaining rate limit in the sidebar header status bar (small text).
- If approaching limit (<500 remaining), automatically increase poll interval and show a warning badge.

### Data Caching

- Keep an in-memory dictionary of `PR number → last known state`.
- On each poll, diff against cached state to detect transitions (for toast notifications).
- Cache ETag headers per endpoint for conditional requests.

---

## Sidebar Header

The sidebar header contains (top to bottom):

1. **Title row** — "BorgDock" label, pin/unpin toggle, minimize-to-badge button, settings gear icon.
2. **Status bar** — Small text: "Last polled 30s ago · Rate limit: 4,850/5,000". Updates in real-time.
3. **Filter chips** — Quick filter buttons: "My PRs", "Failing", "All". Active filter is highlighted. Filters are combinable (e.g., "My PRs" + "Failing" = only my failing PRs).

---

## PR Card Design

Each PR is rendered as a compact card in the sidebar list. Cards for the configured user's PRs get a subtle left-border accent.

### PR Grouping

PRs are grouped by repository with collapsible section headers:

```
▼ example/example-repo (5)
─────────────────────────
  [PR Card 1]
  [PR Card 2]
  ...

▼ example/example-repo-2 (3)
─────────────────────────
  [PR Card 3]
  ...

▼ Recently Closed
─────────────────────────
  [PR Card — Merged ✓]
  [PR Card — Closed]
```

- Group headers show repo name and PR count.
- Click header to collapse/expand the group.
- Within each group, my PRs sort first, then by last-updated descending.

### Recently Closed Section

When a PR is merged or closed on GitHub, it moves to a collapsible "Recently Closed" section at the bottom of the sidebar. Cards show a "Merged ✓" or "Closed" badge. Auto-pruned after 24 hours.

### Card Layout

```
┌──────────────────────────────────────────┐
│ 🟢 Fix customer address validation #1234 │  ← status dot (green/red/yellow/gray)
│ feature/address-fix → main               │  ← branch → target
│ by koen-dev · 2d ago                     │  ← author + age
│                                          │
│ ✅ 6 passed · ❌ lint · ⏳ deploy        │  ← check chips (grouped by status)
│                                          │
│ 👀 Changes requested · 💬 3 · 🏷 bugfix │  ← review + comments + labels
│ ⚠️ Merge conflict · 🤖 2 critical       │  ← conflict + Claude review summary
│                                          │
│ [ 🔄 Re-run ] [ 🔧 Fix ] [ 🔀 Resolve ]│  ← action buttons
└──────────────────────────────────────────┘
```

### Check Run Chips — Grouped by Status

Instead of showing every individual check as a chip, group by status:

- **Failed checks** — Show each individually with name: `❌ lint`, `❌ build`. These are what matter most.
- **Pending checks** — Show each individually: `⏳ deploy`.
- **Passing checks** — Collapse into a single summary: `✅ 6 passed`. Click to expand and see all names.

This keeps cards compact even when PRs have 8-12 checks.

### Card States

- **All checks passing** — Green dot, no fix button.
- **Checks pending** — Yellow dot, spinner on pending checks.
- **Checks failed** — Red dot, fix button + re-run button visible.
- **Mixed** — Red dot (any failure takes priority).
- **Merge conflict** — ⚠️ badge, "Resolve conflict" button visible.
- **Claude Code fixing** — "🔧 Fixing..." badge while a session is active.

### Visual Hierarchy

- **My PRs** — Highlighted with a colored left border (using Brand Blue `#204C9C` or the system accent color).
- **Others' PRs** — Neutral card, slightly muted text.
- **Sort order** — My PRs first, then by last-updated descending. Allow re-sorting by: status (failures first), age, author.

### Action Buttons

Each PR card can show up to three action buttons depending on state:

- **🔄 Re-run** — Visible when any check has failed. Triggers `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun` via GitHub API. Useful for infrastructure/transient failures without wasting a Claude Code session.
- **🔧 Fix with Claude** — Visible when checks have failed. Launches Claude Code with error context.
- **🔀 Resolve Conflict** — Visible when merge conflict is detected. Launches Claude Code with merge-specific prompt.

---

## Failed Check Detail View

When clicking a failed check chip (e.g., the `❌ lint` chip), a detail panel slides in or expands inline.

### Parsed Error View (Default)

The `LogParserService` downloads the job log and extracts structured errors.

**Diff-aware error tagging:** Cross-reference parsed errors with the PR's changed files list (from `GET /repos/{owner}/{repo}/pulls/{number}/files`). File-level matching:
- Errors in files changed by the PR → tagged as "Introduced in this PR" with accent color.
- Errors in unchanged files → tagged as "Pre-existing" with muted styling.

**Parsing strategies (applied in order):**

1. **MSBuild / `dotnet build`** — Regex for `error CS\d{4}:` pattern, extract file, line, message.
2. **Test failures (`dotnet test`)** — Parse TRX-style output or console output for `Failed <TestName>`, assertion messages.
3. **ESLint / TypeScript** — Parse `file(line,col): error` patterns.
4. **Generic fallback** — Look for lines containing `error`, `Error`, `FAILED`, `fatal`, `exception` (case-insensitive). Show surrounding context (±3 lines).

**Display:**

```
❌ lint (failed in 42s)
─────────────────────────
📄 src/Components/OrderHeader.tsx:47:12  [Introduced]
   error TS2345: Argument of type 'string' is not
   assignable to parameter of type 'number'.

📄 src/Components/OrderHeader.tsx:89:5  [Introduced]
   error no-unused-vars: 'tempValue' is defined but
   never used.

  [ Show full log ▼ ]     [ 🔧 Fix with Claude ]
```

File paths in the parsed error view are clickable — clicking opens the file at the specific line in the configured editor (via `{editorCommand} --goto file:line:col`).

### Raw Log View (Expandable)

A scrollable, monospace text view showing the last 200 lines of the job log. Errors highlighted with a red background. Searchable with `Ctrl+F`.

---

## Claude Review Panel

### Detection

Detect Claude Code review comments by matching the `botUsername` setting (default: `claude[bot]`) against review comment authors.

### Display — Full Inline Rendering

Parse and render Claude review comments with full markdown support:

- **Code blocks** with syntax highlighting.
- **File paths** as clickable links (opens in configured editor at the specific line).
- **Severity indicators** extracted from comment content:
  - 🔴 Critical — red accent
  - 🟡 Suggestion — yellow accent
  - 🟢 Praise — green accent (or omit from summary)

### Card Summary

On the PR card, show a compact summary: `🤖 2 critical · 3 suggestions`. Click to expand the full review panel.

### Review Panel Layout

```
🤖 Claude Code Review
─────────────────────────
🔴 Critical — src/Services/OrderService.cs:142
   SQL injection vulnerability in query builder.
   The `orderId` parameter is concatenated directly...
   ```csharp
   // Suggested fix:
   var cmd = new SqlCommand("SELECT * FROM Orders WHERE Id = @id");
   cmd.Parameters.AddWithValue("@id", orderId);
   ```

🟡 Suggestion — src/Models/Customer.cs:28
   Consider using `required` keyword instead of
   null-checking in the constructor...
```

---

## Worktree Discovery & Management

### WorktreeService

Responsible for finding existing worktrees and creating new ones.

**Discovery logic (per repo config):**

1. Run `git worktree list --porcelain` from the repo's `worktreeBasePath`.
2. Parse output to build a map of `branch name → worktree path`.
3. When the user clicks "Fix with Claude" for a PR on branch `feature/xyz`:
   - **If a worktree for `feature/xyz` already exists** → use that path.
   - **If not** → create a new worktree:
     ```
     git worktree add {basePath}\{subfolder}\{sanitized-branch-name} origin/{branch-name}
     ```
   - Sanitize branch name for filesystem: replace `/` with `-`, strip special chars.

**Edge cases:**
- If the branch doesn't exist locally, fetch first: `git fetch origin {branch}`.
- If the worktree subfolder doesn't exist, create it.

### Local Change Warning

Before creating a worktree, check if the PR's branch is currently checked out in the main repo and if there are uncommitted changes (via `git status --porcelain`). If so, show a warning: "Branch `feature/xyz` has uncommitted changes in the main checkout — the worktree will use the remote version." User can proceed or cancel.

### Worktree Cleanup

Manual-only via a "Prune Worktrees" button in the settings flyout:

1. Click "Prune Worktrees" → shows a dialog listing all worktrees with their status:
   - Branch name, worktree path, disk size.
   - PR status: "PR #1234 — Merged ✓", "PR #567 — Closed", "PR #890 — Open".
2. User selects which worktrees to remove via checkboxes.
3. BorgDock runs `git worktree remove {path}` for each selected worktree.
4. Pre-selects worktrees for merged/closed PRs by default.

---

## Claude Code Launcher

### ClaudeCodeLauncher Service

Spawns a standalone Windows Terminal tab running Claude Code with context about the failure. Supports multiple concurrent sessions.

**Launch sequence:**

1. Determine worktree path (via WorktreeService). Show inline progress on the PR card:
   - "Fetching branch..." → "Creating worktree..." → "Launching Claude Code..."
2. Build a prompt file (`.md`) and save to `%APPDATA%\BorgDock\prompts\{timestamp}-PR{number}-{check_name}.md`. Contents:
   - PR title, number, URL.
   - Failed check name and job name.
   - Parsed error output (structured errors from LogParserService) with diff-aware tags (introduced vs pre-existing).
   - List of files changed in the PR.
   - Full raw log (truncated to last 500 lines if very long).
   - Per-repo custom prompt template (from `fixPromptTemplate` setting), if configured.
   - Instruction: "Fix the failing CI check. The errors above come from the `{check_name}` workflow. Analyze the errors, make the necessary code changes, and run the relevant checks locally to verify."
3. Spawn process via Windows Terminal (required):
   ```
   wt.exe -w 0 new-tab --title "CC: PR #{number}" -- claude --cwd "{worktreePath}" --prompt-file "{promptFilePath}"
   ```
   If `wt.exe` is not found on PATH, show an error with Windows Terminal install instructions.
4. Track the spawned process ID in the app state.

### Prompt File Storage

Prompt files are stored in `%APPDATA%\BorgDock\prompts\` with timestamps for debugging and history. Files older than 7 days are automatically pruned on app startup.

### Custom Prompts — Layered Approach

Claude Code prompts are layered:

1. **Repo's own `CLAUDE.md`** — Claude Code reads this automatically from the worktree root. BorgDock doesn't need to do anything.
2. **Per-repo `fixPromptTemplate`** — If configured in settings, BorgDock injects this text into the prompt file. Example: "Always run `pnpm test` after fixing. Use pnpm, not npm."
3. **BorgDock's standard error context** — PR details, parsed errors, raw log.

### Post-Fix Action (Configurable)

The prompt file's instructions vary based on the setting:

- **`autoPush`** — Prompt includes: "After fixing, commit with message `fix: resolve {check_name} failure in PR #{number}` and push to `origin/{branch}`."
- **`commitAndNotify`** — Prompt includes: "After fixing, commit locally with a descriptive message. Do NOT push. Notify that the fix is ready for review."
- **`askEachTime`** — Before launching, show a small dialog: "Auto-push after fix?" with Yes/No/Cancel.

### Session Tracking

- **Multiple concurrent sessions** — Each PR can have its own Claude Code session running in a separate Windows Terminal tab. No limit on concurrent sessions.
- The PR card shows a "🔧 Fixing..." badge while a Claude Code process is running for that PR.
- Monitor sessions via two mechanisms:
  - **Process handle** — Poll the process; when it exits, update badge to "Fix applied" (exit code 0) or "Fix failed" (non-zero).
  - **Git monitoring** — Poll `git log` in the worktree to detect new commits. Show "Fix committed" as soon as a new commit appears, even before Claude exits.
- Optionally re-poll the GitHub checks after a push is detected (if auto-push mode).
- **System tray shows active session count** — Tray tooltip updates to: "BorgDock — 12 PRs, 2 fixing".

### Conflict Resolution (Separate Action)

When the user clicks "🔀 Resolve Conflict" on a PR card:

1. Same worktree discovery and creation flow as "Fix with Claude".
2. Prompt file contains:
   - PR title, number, branch, target branch.
   - Instruction: "Merge `origin/{target_branch}` into this branch, resolve all merge conflicts preserving the PR's intent, run tests to verify, then commit the merge and push to `origin/{branch}`."
3. Always uses the `autoPush` behavior for conflict resolution (merge + resolve + push).

---

## Sidebar Shell & Window Management

### Docking Behavior

The sidebar is a `Window` with:
- `WindowStyle="None"` — no title bar.
- `Topmost="True"` — always on top (toggleable).
- `ShowInTaskbar="False"` — lives in system tray instead.
- Positioned at the screen edge using `SystemParameters.WorkArea` to respect the taskbar.

**Pinned mode:**
- Reserves screen space by adjusting the desktop work area via `SystemParametersInfo(SPI_SETWORKAREA, ...)` P/Invoke — so maximized windows don't overlap. Remove the reservation on close/minimize.
- **Work area save/restore:** On pin, read the current `WorkArea` value and store it. On unpin (or clean shutdown), restore the saved value. This avoids conflicts with other tools that also modify the work area.
- **Crash recovery:** On startup, check for a previous instance that didn't exit cleanly (via a named mutex + lock file). If detected, restore the work area to the saved value before re-reserving.

**Auto-hide mode:**
- A thin 4px hit-test strip remains at the screen edge.
- On mouse enter (or hotkey), animate slide-in using `CompositionTarget.Rendering` with custom ease-out (200ms).
- On mouse leave (after 500ms delay), animate slide-out using the same approach.
- No work area reservation.
- **Animation:** Frame-by-frame via `CompositionTarget.Rendering` for smooth, custom-eased animations. Not WPF Storyboards.

**Toggle between modes** via a pin/unpin icon in the sidebar header.

### Floating Widget Mode

A small summary badge showing: `3 PRs · 1 failing` that can be dragged anywhere.

- **Color-coded background**: Green (all passing), yellow (pending), red (any failing). Subtle pulse animation on state transition that settles after 3 seconds.
- Click to expand back to full sidebar.
- Right-click for context menu: Dock Left, Dock Right, Settings, Quit.

### Global Hotkey

Register `Ctrl+Win+Shift+G` via `RegisterHotKey` P/Invoke.
- If sidebar is hidden → show and focus.
- If sidebar is visible → hide.
- If in floating mode → expand to sidebar.

### System Tray

- Tray icon with tooltip showing summary: "BorgDock — 12 open PRs, 2 failing" (+ ", 1 fixing" if Claude Code sessions are active).
- Small badge on the tray icon when Claude Code sessions are running.
- Left click → toggle sidebar.
- Right click → context menu: Show, Settings, Quit.

### Keyboard Navigation

Full keyboard support within the sidebar:

- **Arrow keys** — Navigate between PR cards (up/down). Focus ring visible on active card.
- **Enter** — Expand/collapse the detail panel for the focused PR card.
- **Tab** — Cycle through action buttons within a focused card (Re-run, Fix, Resolve).
- **Escape** — Close expanded panels, or close settings flyout.
- **Ctrl+F** — Focus search/filter (in raw log view, activates search).
- Proper focus management with visual focus indicators throughout.

---

## Notifications

### Windows Toast Notifications

Use `CommunityToolkit.WinUI.Notifications` for rich toast support.

**Trigger events:**

| Event | Toast Content |
|-------|---------------|
| Check failed (was passing) | "❌ PR #1234: `lint` check failed" + Click → open detail view |
| Check passed (was failing) | "✅ PR #1234: All checks passing" |
| New review with changes requested | "👀 PR #1234: Changes requested by {reviewer}" |
| Claude review critical finding | "🤖 PR #1234: Claude found critical issues" |
| Claude Code fix applied | "🔧 PR #1234: Fix committed, ready for review" |

**Toast actions:**
- Click → bring sidebar to front, scroll to that PR.
- "Open in GitHub" button → launch browser to PR URL.
- "Fix with Claude" button (on failure toasts) → trigger Claude Code launcher directly.

---

## Theme System

Follow `SystemParameters` and listen for `SystemEvents.UserPreferenceChanged` to detect Windows theme changes.

**Color tokens (semantic):**

| Token | Light | Dark |
|-------|-------|------|
| `Background` | `#FAFAFA` | `#1E1E1E` |
| `CardBackground` | `#FFFFFF` | `#2D2D2D` |
| `CardBorderMyPR` | `#204C9C` | `#4A8AE6` |
| `TextPrimary` | `#1A1A1A` | `#E0E0E0` |
| `TextSecondary` | `#666666` | `#999999` |
| `StatusGreen` | `#1EAF12` | `#2ED61E` |
| `StatusRed` | `#D32F2F` | `#F44336` |
| `StatusYellow` | `#F9A825` | `#FFD54F` |
| `StatusGray` | `#9E9E9E` | `#757575` |

Use `DynamicResource` bindings throughout XAML so theme switches are instant.

---

## Project Structure

```
BorgDock/
├── BorgDock.sln
├── src/
│   └── BorgDock.App/
│       ├── BorgDock.App.csproj          (.NET 10, WPF, single-file publish)
│       ├── App.xaml / App.xaml.cs     (DI container setup, service registration)
│       ├── Models/
│       │   ├── PullRequest.cs
│       │   ├── CheckRun.cs
│       │   ├── WorkflowJob.cs
│       │   ├── ReviewStatus.cs
│       │   ├── ClaudeReviewComment.cs
│       │   ├── ParsedError.cs
│       │   └── AppSettings.cs
│       ├── ViewModels/
│       │   ├── MainViewModel.cs
│       │   ├── PullRequestCardViewModel.cs
│       │   ├── CheckDetailViewModel.cs
│       │   ├── ClaudeReviewViewModel.cs
│       │   ├── SettingsViewModel.cs
│       │   ├── SetupWizardViewModel.cs
│       │   └── FloatingBadgeViewModel.cs
│       ├── Views/
│       │   ├── SidebarWindow.xaml
│       │   ├── FloatingBadgeWindow.xaml
│       │   ├── SetupWizardWindow.xaml
│       │   ├── PullRequestCard.xaml     (UserControl)
│       │   ├── CheckDetailPanel.xaml    (UserControl)
│       │   ├── ClaudeReviewPanel.xaml   (UserControl)
│       │   ├── SettingsFlyout.xaml      (UserControl)
│       │   ├── WorktreePruneDialog.xaml (Window)
│       │   └── RawLogViewer.xaml        (UserControl)
│       ├── Services/
│       │   ├── IGitHubService.cs + GitHubService.cs
│       │   ├── IGitHubActionsService.cs + GitHubActionsService.cs
│       │   ├── ILogParserService.cs + LogParserService.cs
│       │   ├── IWorktreeService.cs + WorktreeService.cs
│       │   ├── IClaudeCodeLauncher.cs + ClaudeCodeLauncher.cs
│       │   ├── INotificationService.cs + NotificationService.cs
│       │   ├── ISettingsService.cs + SettingsService.cs
│       │   └── IRepoDiscoveryService.cs + RepoDiscoveryService.cs
│       ├── Infrastructure/
│       │   ├── GitHubHttpClient.cs     (ETag caching, rate limit tracking)
│       │   ├── HotKeyManager.cs        (P/Invoke RegisterHotKey)
│       │   ├── WorkAreaManager.cs      (P/Invoke SPI_SETWORKAREA, save/restore)
│       │   ├── ThemeManager.cs
│       │   ├── MarkdownRenderer.cs     (for Claude review comment rendering)
│       │   └── ProcessTracker.cs       (Claude Code session monitoring)
│       ├── Converters/
│       │   └── StatusToColorConverter.cs (etc.)
│       ├── Resources/
│       │   ├── Themes/
│       │   │   ├── LightTheme.xaml
│       │   │   └── DarkTheme.xaml
│       │   └── Icons/                  (embedded SVG or PathGeometry icons)
│       └── Assets/
│           └── tray-icon.ico
└── tests/
    └── BorgDock.Tests/
        ├── LogParserServiceTests.cs
        ├── WorktreeServiceTests.cs
        └── GitHubServiceTests.cs
```

---

## NuGet Packages

> **Always install the latest stable version.** Run `dotnet add package <name>` without a version flag to pull the newest. Verify on NuGet.org if unsure. Never pin to a version from memory.

| Package | Purpose |
|---------|---------|
| `CommunityToolkit.Mvvm` | Source-generated MVVM (ObservableProperty, RelayCommand) |
| `Microsoft.Extensions.DependencyInjection` | DI container |
| `Microsoft.Extensions.Http` | `IHttpClientFactory` with named clients |
| `CommunityToolkit.WinUI.Notifications` | Windows toast notifications |
| `System.Text.Json` | JSON serialization (built into .NET 10, no extra package needed) |
| `Microsoft.Extensions.Logging` + `Serilog.Sinks.File` | Lightweight file logging |
| `Markdig` | Markdown parsing for Claude review comment rendering |

No Octokit, no Electron, no WebView. Pure WPF.

---

## Build & Distribution

- **Publish:** `dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true`
  - Framework-dependent to keep size small (~5-10MB).
  - Requires .NET 10 runtime on target machine.
- **Alternative:** Self-contained + trimmed for zero-dependency distribution (~30MB).
  - Use `<PublishTrimmed>true</PublishTrimmed>` and `<TrimMode>full</TrimMode>` in the csproj.
- **Startup:** Optional "Run on Windows startup" setting → creates a shortcut in `shell:startup`.
- **Auto-update:** Not in v1. Consider shipping via `winget` manifest or GitHub Releases with a manual "check for updates" button.

---

## Implementation Order (Phases)

### Phase 1 — Core Skeleton ✅ COMPLETE
1. ✅ WPF app shell with sidebar window (docking, positioning, hide/show).
2. ✅ Settings service (JSON read/write).
3. ✅ System tray icon with basic context menu.
4. ✅ Global hotkey registration.
5. ✅ DI container setup in App.xaml.cs.
6. ✅ Named mutex + lock file for crash recovery.
7. ✅ Theme system (light/dark/system with auto-detection).
8. ✅ Work area reservation for pinned mode (save/restore + crash recovery).
9. ✅ 70 tests (56 unit + 14 integration) — all passing.

### Phase 2 — GitHub Integration
7. GitHub auth (gh CLI token extraction + PAT fallback).
8. PR fetching with ETag caching.
9. Check suite/run fetching.
10. PR card rendering with status dots and grouped check chips.
11. Polling loop with configurable interval.
12. PR grouping by repo with collapsible headers.
13. "My PRs" highlighting and sort-to-top.

### Phase 3 — Failure Details
14. Workflow job + log fetching (on-demand).
15. Log parser service (MSBuild, dotnet test, ESLint, generic).
16. Diff-aware error tagging (file-level matching with PR changed files).
17. Check detail panel UI (parsed + raw views).
18. Clickable file paths → open in configured editor.
19. Re-run workflow button (via GitHub API).

### Phase 4 — Claude Code Integration
20. Worktree discovery service (`git worktree list`).
21. Worktree creation logic with fetch + checkout.
22. Local change warning before worktree creation.
23. Prompt file generation with error context + diff-aware tags + per-repo template.
24. Claude Code process spawning via Windows Terminal + tracking.
25. Multiple concurrent session support.
26. Git monitoring for commit detection in worktrees.
27. Post-fix action configuration.
28. Conflict resolution action with merge-specific prompt.
29. Inline progress on PR card during launch sequence.

### Phase 5 — Claude Review
30. Claude bot comment detection and fetching.
31. Markdown rendering for review comments (with Markdig).
32. Severity extraction and summary on PR card.
33. Clickable file paths in review comments.
34. Claude review panel UI.

### Phase 6 — Polish
35. Toast notifications with action buttons.
36. Theme system (light/dark/system).
37. Floating badge mode with color-coded background + pulse animation.
38. Auto-hide with CompositionTarget.Rendering animation.
39. Settings UI flyout.
40. Setup wizard for first run (with repo discovery scanning D:\ and C:\Dev).
41. PR sorting and filtering options + header filter chips.
42. Recently closed PRs section.
43. Merge conflict indicator.
44. Work area reservation for pinned mode (save/restore).
45. Full keyboard navigation (arrow keys, Enter, Tab, Escape).
46. Worktree prune dialog (manual, with PR status display).

### Phase 7 — Hardening
47. Rate limit management + adaptive polling.
48. Error handling + retry logic for API calls.
49. Graceful degradation (no network, API errors, wt.exe not found).
50. Unit tests for log parser, worktree service, settings.
51. Startup registration option.
52. Logging with Serilog.
53. Prompt file cleanup (auto-prune >7 days on startup).

---

## Resolved Design Decisions

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| PR grouping | Grouped by repo with collapsible headers | Better organization for multi-repo monitoring |
| Work area crash recovery | Named mutex + saved work area restore on startup | Prevents permanently shrunken desktop after crash |
| PAT storage | Plain text in settings.json | Personal tool; if attacker has file access, machine is already compromised |
| API scale | REST + ETags, no GraphQL | Personal tool with ≤10 PRs, won't hit rate limits |
| Claude Code concurrency | Multiple concurrent sessions, no limit | Each session runs in its own terminal tab independently |
| Fix detection | Process exit + git monitoring in worktree | Shows "Fix committed" immediately when commit appears |
| Check chip display | Group by status: show failed/pending individually, collapse passing | Keeps cards compact with many checks |
| Infra failures | Re-run button via GitHub API | User decides whether to re-run or fix; no heuristic detection needed |
| Multi-repo UX | Grouped with collapsible headers | Clear visual separation between repos |
| Inline fix progress | Show step-by-step on PR card | "Fetching branch..." → "Creating worktree..." → "Launching..." |
| Claude review display | Full markdown render with syntax highlighting | Rich inline review experience with clickable file paths |
| Conflict resolution | Separate action with merge+resolve+push prompt | Different intent than fixing CI; always pushes |
| Terminal | Windows Terminal required | New tab UX is superior; error if not installed |
| Animation approach | CompositionTarget.Rendering | Smoother custom-eased animations than WPF Storyboards |
| Session lifecycle | Independent; tray shows count | Sessions survive sidebar hide; tray tooltip shows "X fixing" |
| PR lifecycle | "Recently Closed" section, auto-prune 24h | Awareness of merged PRs without cluttering active list |
| Diff-aware errors | File-level matching | Simple, accurate enough; Claude gets full context anyway |
| Worktree cleanup | Manual only via settings dialog | User controls cleanup; shows PR status for informed decisions |
| Editor integration | Configurable `editorCommand` (default: "code") | Click file paths in errors/reviews to open in editor |
| First-run UX | Setup wizard with local repo scanning (D:\, C:\Dev) | Smooth onboarding with auto-discovery |
| Keyboard nav | Full support (arrows, Enter, Tab, Escape) | Efficient navigation without mouse |
| Custom prompts | Layered: repo CLAUDE.md + per-repo template in settings | Flexible without duplication |
| Prompt file storage | %APPDATA%\BorgDock\prompts\, auto-prune >7 days | Debugging history without unbounded growth |
| Local change warning | Check and warn before worktree creation | Prevents confusion when worktree differs from local checkout |
| Sidebar header | Title + pin + status bar + filter chips | Full information density without clutter |
| Floating badge | Color-coded (green/yellow/red) with pulse on transition | Instant visual status awareness |
| Re-run scope | Require `workflow` scope on token | Enables re-run button; most devs already have this scope |
| Multi-monitor | Default to primary, but could be configurable. | User decides, sane default is primary screen |

## Open Design Decisions (For Future)

- **Webhook mode**: Run a tiny local HTTP server + ngrok/Cloudflare tunnel to receive GitHub webhooks instead of polling. Would enable instant updates but adds complexity.
