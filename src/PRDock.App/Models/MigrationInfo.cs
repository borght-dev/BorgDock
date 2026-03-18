namespace PRDock.App.Models;

public sealed class MigrationInfo
{
    public string Version { get; init; } = "";
    public string DownloadUrl { get; init; } = "";
    public string InstallerFileName { get; init; } = "";
    public string? ReleaseNotes { get; init; }
}
