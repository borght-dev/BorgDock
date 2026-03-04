using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IGitHubService
{
    Task<IReadOnlyList<PullRequest>> GetOpenPullRequestsAsync(string owner, string repo, CancellationToken ct = default);
}
