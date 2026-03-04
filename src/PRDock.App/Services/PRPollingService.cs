using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class PRPollingService : IPRPollingService
{
    private readonly IGitHubService _gitHubService;
    private readonly IGitHubActionsService _actionsService;
    private readonly ISettingsService _settingsService;
    private readonly ILogger<PRPollingService> _logger;

    private CancellationTokenSource? _cts;
    private PeriodicTimer? _timer;
    private bool _disposed;

    public PRPollingService(
        IGitHubService gitHubService,
        IGitHubActionsService actionsService,
        ISettingsService settingsService,
        ILogger<PRPollingService> logger)
    {
        _gitHubService = gitHubService;
        _actionsService = actionsService;
        _settingsService = settingsService;
        _logger = logger;
    }

    public bool IsPolling { get; private set; }

    public event Action<IReadOnlyList<PullRequestWithChecks>>? PollCompleted;
    public event Action<Exception>? PollFailed;

    public void StartPolling()
    {
        if (IsPolling) return;

        var intervalSeconds = _settingsService.CurrentSettings.GitHub.PollIntervalSeconds;
        _cts = new CancellationTokenSource();
        _timer = new PeriodicTimer(TimeSpan.FromSeconds(intervalSeconds));
        IsPolling = true;

        _ = PollLoopAsync(_cts.Token);
    }

    public void StopPolling()
    {
        if (!IsPolling) return;

        _cts?.Cancel();
        _timer?.Dispose();
        _timer = null;
        _cts?.Dispose();
        _cts = null;
        IsPolling = false;
    }

    public async Task PollNowAsync(CancellationToken ct = default)
    {
        try
        {
            var results = await ExecutePollCycleAsync(ct);
            PollCompleted?.Invoke(results);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Cancellation requested, do not raise PollFailed
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Poll cycle failed");
            PollFailed?.Invoke(ex);
        }
    }

    private async Task PollLoopAsync(CancellationToken ct)
    {
        // Execute an immediate poll on start
        await PollNowAsync(ct);

        try
        {
            while (_timer is not null && await _timer.WaitForNextTickAsync(ct))
            {
                await PollNowAsync(ct);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Expected on stop
        }
    }

    private async Task<IReadOnlyList<PullRequestWithChecks>> ExecutePollCycleAsync(CancellationToken ct)
    {
        var results = new List<PullRequestWithChecks>();
        var enabledRepos = _settingsService.CurrentSettings.Repos.Where(r => r.Enabled);

        foreach (var repo in enabledRepos)
        {
            var prs = await _gitHubService.GetOpenPullRequestsAsync(repo.Owner, repo.Name, ct);

            foreach (var pr in prs)
            {
                var suites = await _actionsService.GetCheckSuitesAsync(repo.Owner, repo.Name, pr.HeadRef, ct);
                var allChecks = new List<CheckRun>();

                foreach (var suite in suites)
                {
                    var runs = await _actionsService.GetCheckRunsAsync(repo.Owner, repo.Name, suite.Id, ct);
                    allChecks.AddRange(runs);
                }

                results.Add(new PullRequestWithChecks
                {
                    PullRequest = pr,
                    Checks = allChecks
                });
            }
        }

        _logger.LogInformation("Poll cycle completed: {Count} PRs across enabled repos", results.Count);
        return results;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        StopPolling();
    }
}
