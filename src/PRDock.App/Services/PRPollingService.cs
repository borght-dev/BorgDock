using System.Net.Http;
using Microsoft.Extensions.Logging;
using PRDock.App.Infrastructure;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class PRPollingService : IPRPollingService
{
    private readonly IGitHubService _gitHubService;
    private readonly IGitHubActionsService _actionsService;
    private readonly ISettingsService _settingsService;
    private readonly IPRCacheService _cacheService;
    private readonly GitHubHttpClient _httpClient;
    private readonly ILogger<PRPollingService> _logger;

    private CancellationTokenSource? _cts;
    private PeriodicTimer? _timer;
    private bool _disposed;

    private static readonly TimeSpan RepoStaggerDelay = TimeSpan.FromMilliseconds(500);

    public PRPollingService(
        IGitHubService gitHubService,
        IGitHubActionsService actionsService,
        ISettingsService settingsService,
        IPRCacheService cacheService,
        GitHubHttpClient httpClient,
        ILogger<PRPollingService> logger)
    {
        _gitHubService = gitHubService;
        _actionsService = actionsService;
        _settingsService = settingsService;
        _cacheService = cacheService;
        _httpClient = httpClient;
        _logger = logger;
    }

    public bool IsPolling { get; private set; }

    public event Action<IReadOnlyList<PullRequestWithChecks>>? PollCompleted;
    public event Action<Exception>? PollFailed;

    public void StartPolling()
    {
        if (IsPolling) return;

        var interval = GetEffectivePollInterval();
        _cts = new CancellationTokenSource();
        _timer = new PeriodicTimer(interval);
        IsPolling = true;

        _logger.LogInformation("Polling started with interval {Interval}s", interval.TotalSeconds);
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

        _logger.LogInformation("Polling stopped");
    }

    public async Task PollNowAsync(CancellationToken ct = default)
    {
        try
        {
            var results = await ExecutePollCycleAsync(ct);
            PollCompleted?.Invoke(results);

            // Persist to SQLite cache (fire-and-forget, non-blocking)
            _ = _cacheService.SaveAsync(results);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Network/API error during poll cycle: {Message}", ex.Message);
            PollFailed?.Invoke(ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Poll cycle failed");
            PollFailed?.Invoke(ex);
        }
    }

    private async Task PollLoopAsync(CancellationToken ct)
    {
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
        }
    }

    private async Task<IReadOnlyList<PullRequestWithChecks>> ExecutePollCycleAsync(CancellationToken ct)
    {
        var results = new List<PullRequestWithChecks>();
        var enabledRepos = _settingsService.CurrentSettings.Repos.Where(r => r.Enabled).ToList();

        if (enabledRepos.Count == 0)
        {
            _logger.LogDebug("No enabled repos configured, skipping poll cycle");
            return results;
        }

        var errors = new List<Exception>();

        for (int i = 0; i < enabledRepos.Count; i++)
        {
            var repo = enabledRepos[i];

            if (i > 0)
            {
                await Task.Delay(RepoStaggerDelay, ct);
            }

            try
            {
                var prs = await _gitHubService.GetOpenPullRequestsAsync(repo.Owner, repo.Name, ct);

                foreach (var pr in prs)
                {
                    // Enrich with detail stats (additions, deletions, changed_files, commits)
                    try
                    {
                        var detail = await _gitHubService.GetPullRequestAsync(repo.Owner, repo.Name, pr.Number, ct);
                        pr.Additions = detail.Additions;
                        pr.Deletions = detail.Deletions;
                        pr.ChangedFiles = detail.ChangedFiles;
                        pr.CommitCount = detail.CommitCount;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Failed to fetch PR detail for #{Number}, stats will be 0", pr.Number);
                    }

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
            catch (HttpRequestException ex) when (!ct.IsCancellationRequested)
            {
                _logger.LogWarning(ex, "Failed to fetch PRs for {Owner}/{Repo}, skipping", repo.Owner, repo.Name);
                errors.Add(ex);
            }
        }

        // If all enabled repos failed, re-throw so PollFailed fires
        if (errors.Count > 0 && errors.Count == enabledRepos.Count)
        {
            throw errors.Count == 1 ? errors[0] : new AggregateException(errors);
        }

        _logger.LogInformation("Poll cycle completed: {Count} PRs across {RepoCount} enabled repos", results.Count, enabledRepos.Count);
        return results;
    }

    private TimeSpan GetEffectivePollInterval()
    {
        var baseSeconds = _settingsService.CurrentSettings.GitHub.PollIntervalSeconds;

        if (_httpClient.IsRateLimitLow)
        {
            _logger.LogWarning("Rate limit low ({Remaining}), doubling poll interval to {Interval}s",
                _httpClient.RateLimitRemaining, baseSeconds * 2);
            return TimeSpan.FromSeconds(baseSeconds * 2);
        }

        return TimeSpan.FromSeconds(baseSeconds);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        StopPolling();
    }
}
