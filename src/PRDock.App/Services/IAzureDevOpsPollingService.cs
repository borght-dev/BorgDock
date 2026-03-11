using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IAzureDevOpsPollingService : IDisposable
{
    void StartPolling(Guid queryId);
    void StopPolling();
    Task PollNowAsync(CancellationToken ct = default);
    event Action<IReadOnlyList<WorkItem>>? PollCompleted;
    event Action<Exception>? PollFailed;
    bool IsPolling { get; }
    Guid? CurrentQueryId { get; }
}
