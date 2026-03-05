using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IPRCacheService
{
    Task<IReadOnlyList<PullRequestWithChecks>> LoadCachedAsync();
    Task SaveAsync(IReadOnlyList<PullRequestWithChecks> results);
}
