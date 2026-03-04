# PRDock — Developer Guide for Claude

## What is this?

A WPF desktop app that monitors GitHub PRs as a docked sidebar on Windows. Built with .NET 10, WPF, CommunityToolkit.Mvvm, and Microsoft.Extensions.DI.

## Quick Commands

```bash
dotnet build                    # Build the solution
dotnet test                     # Run all tests (56 unit + 14 integration)
dotnet run --project src/PRDock.App  # Launch the app
```

## Project Layout

```
src/PRDock.App/           # Main WPF application
  Models/                 # AppSettings.cs (settings model)
  ViewModels/             # MainViewModel.cs (CommunityToolkit.Mvvm source generators)
  Views/                  # SidebarWindow.xaml/.cs (chromeless WPF window)
  Services/               # ISettingsService + SettingsService (JSON read/write)
  Infrastructure/         # ThemeManager, HotKeyManager, WorkAreaManager (P/Invoke)
  Resources/Themes/       # LightTheme.xaml, DarkTheme.xaml
  App.xaml/.cs            # DI container, tray icon, lock file, hotkey registration

tests/PRDock.Tests/            # Unit tests (xUnit + NSubstitute + FluentAssertions)
tests/PRDock.IntegrationTests/ # Integration/smoke tests
```

## Critical Conventions

- **WinForms ambiguity**: Both `UseWPF` and `UseWindowsForms` are enabled (NotifyIcon needs WinForms). Always qualify or alias `Application` — use `System.Windows.Application` or `using WpfApplication = System.Windows.Application;` to avoid CS0104.
- **AppSettings property names**: `GitHub`, `UI` (uppercase), `Repos`, `Notifications`, `ClaudeCode`, `ClaudeReview`. The JSON uses camelCase via `JsonNamingPolicy.CamelCase`, but C# properties are PascalCase.
- **App shutdown mode**: `ShutdownMode="OnExplicitShutdown"` — the tray icon keeps the app alive when the sidebar is hidden.
- **Single instance**: Named mutex `PRDock_SingleInstance` prevents duplicate launches.
- **File paths**:
  - Settings: `%APPDATA%\PRDock\settings.json`
  - Lock file: `%APPDATA%\PRDock\prdock.lock`
  - Work area state: `%APPDATA%\PRDock\workarea.json`
  - Logs: `%APPDATA%\PRDock\logs\prdock-{date}.log`

## Implementation Status

- **Phase 1 COMPLETE**: Core skeleton (sidebar, DI, settings, tray, hotkey, themes, work area, 70 tests)
- **Phase 2 TODO**: GitHub integration (auth, PR fetching, polling, PR cards)
- **Phase 3 TODO**: Failure details (log parsing, check detail panel)
- **Phase 4 TODO**: Claude Code integration (worktrees, prompt generation, session tracking)
- **Phase 5 TODO**: Claude review panel
- **Phase 6 TODO**: Polish (notifications, floating badge, auto-hide animation, settings UI, setup wizard)
- **Phase 7 TODO**: Hardening (rate limits, error handling, graceful degradation)

Full spec: `PRDock-Implementation-Plan.md`

## Test Conventions

- Unit tests in `tests/PRDock.Tests/{subfolder}/` matching source structure
- Integration tests in `tests/PRDock.IntegrationTests/`
- Use FluentAssertions for assertions, NSubstitute for mocks
- Test projects target `net10.0-windows` with `UseWPF=true`

## Self-Improvement

Whenever you learn something new that is important to remember, run into the same issue twice, or encounter an issue that might happen again — update this CLAUDE.md so the next session avoids the same pitfalls.
