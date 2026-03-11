using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class AzureDevOpsPollingService : IAzureDevOpsPollingService
{
    private readonly IAzureDevOpsService _adoService;
    private readonly ISettingsService _settingsService;
    private readonly ILogger<AzureDevOpsPollingService> _logger;

    private CancellationTokenSource? _cts;
    private PeriodicTimer? _timer;
    private bool _disposed;

    public AzureDevOpsPollingService(
        IAzureDevOpsService adoService,
        ISettingsService settingsService,
        ILogger<AzureDevOpsPollingService> logger)
    {
        _adoService = adoService;
        _settingsService = settingsService;
        _logger = logger;
    }

    public bool IsPolling { get; private set; }
    public Guid? CurrentQueryId { get; private set; }

    public event Action<IReadOnlyList<WorkItem>>? PollCompleted;
    public event Action<Exception>? PollFailed;

    public void StartPolling(Guid queryId)
    {
        StopPolling();

        CurrentQueryId = queryId;
        var interval = TimeSpan.FromSeconds(
            _settingsService.CurrentSettings.AzureDevOps.PollIntervalSeconds);
        _cts = new CancellationTokenSource();
        _timer = new PeriodicTimer(interval);
        IsPolling = true;

        _logger.LogInformation("ADO polling started for query {QueryId} with interval {Interval}s",
            queryId, interval.TotalSeconds);
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
        CurrentQueryId = null;

        _logger.LogInformation("ADO polling stopped");
    }

    public async Task PollNowAsync(CancellationToken ct = default)
    {
        if (CurrentQueryId is null) return;

        try
        {
            var ids = await _adoService.ExecuteQueryAsync(CurrentQueryId.Value, ct);
            var workItems = await _adoService.GetWorkItemsAsync(ids, ct);
            PollCompleted?.Invoke(workItems);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ADO poll cycle failed");
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

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        StopPolling();
    }
}
