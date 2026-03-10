using System.Text.Json.Serialization;

namespace PRDock.App.Models;

public sealed class AppSettings
{
    public bool SetupComplete { get; set; }
    public GitHubSettings GitHub { get; set; } = new();
    public List<RepoSettings> Repos { get; set; } = [];
    public UiSettings UI { get; set; } = new();
    public NotificationSettings Notifications { get; set; } = new();
    public ClaudeCodeSettings ClaudeCode { get; set; } = new();
    public ClaudeReviewSettings ClaudeReview { get; set; } = new();
    public UpdateSettings Updates { get; set; } = new();
}

public sealed class GitHubSettings
{
    public string AuthMethod { get; set; } = "ghCli";
    public string? PersonalAccessToken { get; set; }
    public int PollIntervalSeconds { get; set; } = 60;
    public string Username { get; set; } = "";
}

public sealed class RepoSettings
{
    public string Owner { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public string WorktreeBasePath { get; set; } = "";
    public string WorktreeSubfolder { get; set; } = ".worktrees";
    public string? FixPromptTemplate { get; set; }
}

public sealed class UiSettings
{
    public string SidebarEdge { get; set; } = "right";
    public string SidebarMode { get; set; } = "pinned";
    public int SidebarWidthPx { get; set; } = 800;
    public string Theme { get; set; } = "system";
    public string GlobalHotkey { get; set; } = "Ctrl+Win+Shift+G";
    public string EditorCommand { get; set; } = "code";
    public bool RunAtStartup { get; set; }
    public string BadgeStyle { get; set; } = "GlassCapsule";
    public string IndicatorStyle { get; set; } = "SegmentRing";
}

public sealed class NotificationSettings
{
    public bool ToastOnCheckStatusChange { get; set; } = true;
    public bool ToastOnNewPR { get; set; }
    public bool ToastOnReviewUpdate { get; set; } = true;
}

public sealed class ClaudeCodeSettings
{
    public string DefaultPostFixAction { get; set; } = "commitAndNotify";
    public string? ClaudeCodePath { get; set; }
}

public sealed class ClaudeReviewSettings
{
    public string BotUsername { get; set; } = "claude[bot]";
}

public sealed class UpdateSettings
{
    public bool AutoCheckEnabled { get; set; } = true;
    public bool AutoDownload { get; set; } = true;
}
