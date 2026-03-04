namespace PRDock.App.Services;

public sealed class DiscoveredRepo
{
    public string Owner { get; init; } = "";
    public string Name { get; init; } = "";
    public string LocalPath { get; init; } = "";
    public string RemoteUrl { get; init; } = "";
    public bool IsSelected { get; set; } = true;
}

public interface IRepoDiscoveryService
{
    Task<IReadOnlyList<DiscoveredRepo>> DiscoverReposAsync(
        IEnumerable<string> scanPaths,
        CancellationToken ct = default);
}
