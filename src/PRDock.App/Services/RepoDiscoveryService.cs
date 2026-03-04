using System.IO;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace PRDock.App.Services;

public sealed partial class RepoDiscoveryService : IRepoDiscoveryService
{
    private readonly ILogger<RepoDiscoveryService> _logger;
    private const int MaxDepth = 5;

    public RepoDiscoveryService(ILogger<RepoDiscoveryService> logger)
    {
        _logger = logger;
    }

    public async Task<IReadOnlyList<DiscoveredRepo>> DiscoverReposAsync(
        IEnumerable<string> scanPaths,
        CancellationToken ct = default)
    {
        var repos = new List<DiscoveredRepo>();

        await Task.Run(() =>
        {
            foreach (var root in scanPaths)
            {
                ct.ThrowIfCancellationRequested();
                if (!Directory.Exists(root))
                {
                    _logger.LogDebug("Scan path does not exist: {Path}", root);
                    continue;
                }
                ScanDirectory(root, 0, repos, ct);
            }
        }, ct);

        return repos
            .GroupBy(r => $"{r.Owner}/{r.Name}", StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderBy(r => r.Owner, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private void ScanDirectory(string path, int depth, List<DiscoveredRepo> results, CancellationToken ct)
    {
        if (depth > MaxDepth) return;
        ct.ThrowIfCancellationRequested();

        var gitDir = Path.Combine(path, ".git");
        if (Directory.Exists(gitDir))
        {
            var repo = TryParseGitHubRepo(path, gitDir);
            if (repo is not null)
            {
                results.Add(repo);
                _logger.LogDebug("Discovered GitHub repo: {Owner}/{Name} at {Path}", repo.Owner, repo.Name, repo.LocalPath);
            }
            return;
        }

        try
        {
            foreach (var subDir in Directory.EnumerateDirectories(path))
            {
                ct.ThrowIfCancellationRequested();
                var dirName = Path.GetFileName(subDir);
                if (dirName.StartsWith('.') ||
                    dirName.Equals("node_modules", StringComparison.OrdinalIgnoreCase) ||
                    dirName.Equals("bin", StringComparison.OrdinalIgnoreCase) ||
                    dirName.Equals("obj", StringComparison.OrdinalIgnoreCase) ||
                    dirName.Equals("$Recycle.Bin", StringComparison.OrdinalIgnoreCase) ||
                    dirName.Equals("Windows", StringComparison.OrdinalIgnoreCase) ||
                    dirName.Equals("Program Files", StringComparison.OrdinalIgnoreCase) ||
                    dirName.Equals("Program Files (x86)", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                ScanDirectory(subDir, depth + 1, results, ct);
            }
        }
        catch (UnauthorizedAccessException) { }
        catch (IOException) { }
    }

    internal static DiscoveredRepo? TryParseGitHubRepo(string repoPath, string gitDirPath)
    {
        var configPath = Path.Combine(gitDirPath, "config");
        if (!File.Exists(configPath)) return null;
        try
        {
            var configText = File.ReadAllText(configPath);
            return ParseGitHubRemote(configText, repoPath);
        }
        catch (IOException) { return null; }
    }

    internal static DiscoveredRepo? ParseGitHubRemote(string gitConfigText, string localPath)
    {
        var match = HttpsRemoteRegex().Match(gitConfigText);
        if (!match.Success)
            match = SshRemoteRegex().Match(gitConfigText);
        if (!match.Success) return null;

        var owner = match.Groups["owner"].Value;
        var name = match.Groups["name"].Value;
        if (name.EndsWith(".git", StringComparison.OrdinalIgnoreCase))
            name = name[..^4];

        return new DiscoveredRepo
        {
            Owner = owner,
            Name = name,
            LocalPath = localPath,
            RemoteUrl = match.Value
        };
    }

    [GeneratedRegex(@"url\s*=\s*https://github\.com/(?<owner>[^/]+)/(?<name>[^\s]+)", RegexOptions.Multiline)]
    private static partial Regex HttpsRemoteRegex();

    [GeneratedRegex(@"url\s*=\s*git@github\.com:(?<owner>[^/]+)/(?<name>[^\s]+)", RegexOptions.Multiline)]
    private static partial Regex SshRemoteRegex();
}
