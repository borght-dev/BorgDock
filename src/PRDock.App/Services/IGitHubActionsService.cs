using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IGitHubActionsService
{
    Task<IReadOnlyList<CheckSuite>> GetCheckSuitesAsync(string owner, string repo, string sha, CancellationToken ct = default);
    Task<IReadOnlyList<CheckRun>> GetCheckRunsAsync(string owner, string repo, long checkSuiteId, CancellationToken ct = default);
    Task<IReadOnlyList<CheckRun>> GetCheckRunsForRefAsync(string owner, string repo, string gitRef, CancellationToken ct = default);
    Task<IReadOnlyList<WorkflowJob>> GetWorkflowJobsAsync(string owner, string repo, long runId, CancellationToken ct = default);
    Task<string> GetJobLogAsync(string owner, string repo, long jobId, CancellationToken ct = default);
    Task ReRunWorkflowAsync(string owner, string repo, long runId, CancellationToken ct = default);
    Task<IReadOnlyList<string>> GetPullRequestFilesAsync(string owner, string repo, int prNumber, CancellationToken ct = default);
}
