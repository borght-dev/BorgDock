using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IGitHubActionsService
{
    Task<IReadOnlyList<CheckSuite>> GetCheckSuitesAsync(string owner, string repo, string sha, CancellationToken ct = default);
    Task<IReadOnlyList<CheckRun>> GetCheckRunsAsync(string owner, string repo, long checkSuiteId, CancellationToken ct = default);
}
