using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IPRPollingService : IDisposable
{
    void StartPolling();
    void StopPolling();
    Task PollNowAsync(CancellationToken ct = default);
    event Action<IReadOnlyList<PullRequestWithChecks>>? PollCompleted;
    event Action<Exception>? PollFailed;
    bool IsPolling { get; }
}
