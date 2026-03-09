using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IPRCacheService
{
    Task<IReadOnlyList<PullRequestWithChecks>> LoadCachedAsync();
    Task SaveAsync(IReadOnlyList<PullRequestWithChecks> results);
    Task<IReadOnlyList<PullRequest>> LoadClosedCachedAsync();
    Task SaveClosedAsync(IReadOnlyList<PullRequest> closedPrs);
}
