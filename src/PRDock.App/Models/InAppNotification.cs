namespace PRDock.App.Models;

public sealed class InAppNotification
{
    public required string Title { get; init; }
    public required string Message { get; init; }

    /// <summary>"error", "success", "warning", "info"</summary>
    public string Severity { get; init; } = "info";

    public string? LaunchUrl { get; init; }
    public int? PrNumber { get; init; }
    public string? RepoFullName { get; init; }

    /// <summary>Label/URL pairs for action buttons shown in the bubble.</summary>
    public List<(string Label, string Url)> Actions { get; init; } = [];
}
