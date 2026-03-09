# PRDock

A lightweight Windows desktop application that monitors GitHub pull requests as a docked sidebar overlay. PRDock surfaces CI check status, review state, and Claude Code review findings at a glance — and lets you launch automated fixes with one click.

## Features

- **PR Monitoring** — Polls GitHub for open pull requests across configurable repositories, displaying status, reviews, and CI checks in a compact sidebar.
- **Docked Sidebar** — A chromeless WPF overlay that pins to the left or right edge of your screen, with auto-hide and hotkey toggle (`Ctrl+Win+Shift+G`).
- **CI Check Details** — Inspect failed checks inline with parsed error messages extracted from GitHub Actions logs (supports build errors, test failures, lint warnings, and runtime exceptions).
- **Claude Code Integration** — One-click launch of a Claude Code terminal session to automatically fix CI failures. PRDock finds or creates a git worktree for the PR branch and generates a targeted fix prompt.
- **Claude Review Panel** — Surfaces review comments left by Claude Code's bot, grouped by severity, with full Markdown rendering.
- **Notifications** — Windows toast notifications for check status changes, new PRs, and review updates.
- **Floating Badge** — A minimal always-on-top badge showing failing PR count when the sidebar is hidden. Five selectable styles:

  | Style | Preview | Description |
  |-------|---------|-------------|
  | **Glass Capsule** | ![Glass Capsule](docs/GlassCapsule.png) | Frosted glass with pulsing status ring. Subtle, elegant. |
  | **Minimal Notch** | ![Minimal Notch](docs/MinimalNotch.png) | Thin colored accent bar + per-PR status pips. Most compact. |
  | **Floating Island** | ![Floating Island](docs/FloatingIsland.png) | Author avatars, mini bar chart, ambient glow. Most info-dense. |
  | **Liquid Morph** | ![Liquid Morph](docs/LiquidMorph.png) | Animated morphing ring with FIX/OK action tag. Playful. |
  | **Spectral Bar** | ![Spectral Bar](docs/SpectralBar.png) | Two-panel layout with health progress bar. Dashboard-like. |
- **Theme Support** — Light, dark, and system-following themes.
- **Setup Wizard** — First-run wizard that auto-detects `gh` CLI auth, scans for local GitHub repos, and configures worktree paths.
- **Adaptive Polling** — Rate-limit-aware polling with ETag-based conditional requests to minimize GitHub API quota usage.

## Requirements

- Windows 10 or 11
- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [GitHub CLI (`gh`)](https://cli.github.com/) (recommended) or a GitHub Personal Access Token

## Getting Started

```bash
# Clone the repository
git clone https://github.com/your-org/PRDock.git
cd PRDock

# Build
dotnet build

# Run
dotnet run --project src/PRDock.App
```

On first launch, the setup wizard will guide you through authentication and repository configuration.

## Configuration

Settings are stored in `%APPDATA%\PRDock\settings.json`. You can edit them through the in-app settings flyout (gear icon) or directly in the JSON file.

### Key settings

| Section | Options |
|---------|---------|
| **GitHub** | Auth method (`ghCli` or `pat`), poll interval (15–300s), username |
| **Repositories** | Owner/name pairs, worktree base paths, per-repo fix prompt templates |
| **UI** | Sidebar edge (left/right), mode (pinned/auto-hide), width, theme, editor command |
| **Notifications** | Toast toggles for check changes, new PRs, review updates |
| **Claude Code** | Post-fix action (auto-push, commit & notify, ask each time), path override |

## Authentication

PRDock supports two authentication methods:

1. **GitHub CLI (recommended)** — If `gh` is installed and authenticated, PRDock retrieves the token automatically via `gh auth token`.
2. **Personal Access Token** — Enter a PAT with `repo`, `read:org`, and `workflow` scopes. Note: the token is stored in plain text in the settings file.

## Project Structure

```
src/PRDock.App/
  Models/           Data models (PR, checks, settings, reviews)
  ViewModels/       MVVM view models (CommunityToolkit.Mvvm)
  Views/            WPF views (sidebar, cards, panels, dialogs)
  Services/         Business logic (GitHub API, polling, parsing, worktrees)
  Infrastructure/   Cross-cutting (HTTP client, themes, hotkeys, retry)
  Converters/       WPF value converters
  Resources/Themes/ Light and dark theme resource dictionaries

tests/PRDock.Tests/             Unit tests (xUnit + NSubstitute + FluentAssertions)
tests/PRDock.IntegrationTests/  Integration tests
```

## Running Tests

```bash
# All tests
dotnet test

# Unit tests only
dotnet test tests/PRDock.Tests

# Integration tests only
dotnet test tests/PRDock.IntegrationTests
```

## Tech Stack

- **.NET 10** / **WPF** with WinUI-inspired styling
- **CommunityToolkit.Mvvm** for source-generated MVVM
- **Microsoft.Extensions.DependencyInjection** for DI
- **Serilog** for structured logging
- **Markdig** for Markdown rendering
- **System.Text.Json** for GitHub API communication (no Octokit dependency)

## License

This is a personal developer tool. See [LICENSE](LICENSE) for details.
