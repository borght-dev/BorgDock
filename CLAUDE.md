# PRDock — Developer Guide for Claude

## IMPORTANT: Active Development Target

**All new development happens in `src/PRDock.Tauri/` (the Tauri + React rewrite). Do NOT modify files in `src/PRDock.App/` (the legacy WPF app) unless explicitly asked.** When the working directory is `src/PRDock.Tauri`, all features, fixes, and improvements go there.

## What is this?

A desktop app that monitors GitHub PRs as a docked sidebar on Windows. The legacy version is built with .NET 10/WPF; the active version is in `src/PRDock.Tauri/` using Tauri + React + TypeScript.

## Quick Commands

```bash
dotnet build                    # Build the solution
dotnet test                     # Run all tests (157 unit + 14 integration)
dotnet run --project src/PRDock.App  # Launch the app
```

## Project Layout

```
src/PRDock.App/           # Main WPF application
  Models/                 # AppSettings, PullRequest, CheckRun, CheckSuite, PullRequestWithChecks, ReviewStatus
  ViewModels/             # MainViewModel, PullRequestCardViewModel, RepoGroupViewModel (CommunityToolkit.Mvvm)
  Views/                  # SidebarWindow, PullRequestCard (chromeless WPF)
  Services/               # Settings, GitHubAuth, GitHub, GitHubActions, PRPolling services
  Infrastructure/         # ThemeManager, HotKeyManager, WorkAreaManager, GitHubHttpClient, AzureDevOpsHttpClient
  Converters/             # StatusToColorConverter, ExpanderArrowConverter
  Resources/Themes/       # LightTheme.xaml, DarkTheme.xaml
  App.xaml/.cs            # DI container, tray icon, lock file, hotkey registration

tests/PRDock.Tests/            # Unit tests (xUnit + NSubstitute + FluentAssertions)
tests/PRDock.IntegrationTests/ # Integration/smoke tests
```

## Critical Conventions

- **WinForms ambiguity**: Both `UseWPF` and `UseWindowsForms` are enabled (NotifyIcon needs WinForms). Always qualify or alias `Application` — use `System.Windows.Application` or `using WpfApplication = System.Windows.Application;` to avoid CS0104.
- **AppSettings property names**: `GitHub`, `UI` (uppercase), `Repos`, `Notifications`, `ClaudeCode`, `ClaudeReview`, `Updates`. The JSON uses camelCase via `JsonNamingPolicy.CamelCase`, but C# properties are PascalCase.
- **Entry point**: Explicit `Program.Main()` in `Program.cs` — required by Velopack (`VelopackApp.Build().Run()` must run before WPF). `App.xaml` is a `Page`, not `ApplicationDefinition`.
- **Velopack UpdateManager**: Uses lazy initialization to avoid requiring `VelopackApp.Build()` in tests. `UpdateManager?` is nullable — when null (dev/test mode), all update operations are no-ops.
- **App shutdown mode**: `ShutdownMode="OnExplicitShutdown"` — the tray icon keeps the app alive when the sidebar is hidden.
- **Single instance**: Named mutex `PRDock_SingleInstance` prevents duplicate launches.
- **File paths**:
  - Settings: `%APPDATA%\PRDock\settings.json`
  - Lock file: `%APPDATA%\PRDock\prdock.lock`
  - Work area state: `%APPDATA%\PRDock\workarea.json`
  - Logs: `%APPDATA%\PRDock\logs\prdock-{date}.log`

## Implementation Status

- **Phase 1 COMPLETE**: Core skeleton (sidebar, DI, settings, tray, hotkey, themes, work area, 70 tests)
- **Phase 2 COMPLETE**: GitHub integration (auth, HTTP client, PR fetching, check suites/runs, PR card UI, polling loop, grouping/sorting/filtering, 171 tests)
- **Phase 3 COMPLETE**: Failure details (LogParserService, GitHub Actions extensions, CheckDetailPanel, 505 tests)
- **Phase 4 COMPLETE**: Claude Code integration (WorktreeService, ClaudeCodeLauncher, ProcessTracker, prompt generation)
- **Phase 5 COMPLETE**: Claude review panel (ClaudeReviewComment, MarkdownRenderer, severity grouping)
- **Phase 6 COMPLETE**: Polish (NotificationService, FloatingBadge, auto-hide animation, SettingsFlyout, SetupWizard, keyboard nav, WorktreePruneDialog, recently closed PRs, merge conflict indicators)
- **Phase 7 COMPLETE**: Hardening (RetryHandler, rate limit display, adaptive polling, graceful degradation)
- **Auto-update COMPLETE**: Velopack integration (UpdateService, Settings UI, GitHub Actions release workflow)
- **Phase 8: Azure DevOps COMPLETE**: Work items from saved queries, CRUD, query browser with favorites, filtering (state/assignedTo), attachment downloads, section switcher in sidebar

Full spec: `PRDock-Implementation-Plan.md`

## Test Conventions

- Unit tests in `tests/PRDock.Tests/{subfolder}/` matching source structure
- Integration tests in `tests/PRDock.IntegrationTests/`
- Use FluentAssertions for assertions, NSubstitute for mocks
- Test projects target `net10.0-windows` with `UseWPF=true`

## Self-Improvement

Whenever you learn something new that is important to remember, run into the same issue twice, or encounter an issue that might happen again — update this CLAUDE.md so the next session avoids the same pitfalls.
