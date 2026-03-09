using System.Reflection;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;
using Velopack;
using Velopack.Sources;
using VelopackUpdateInfo = Velopack.UpdateInfo;

namespace PRDock.App.Services;

public sealed class UpdateService : IUpdateService
{
    private const string GitHubRepoUrl = "https://github.com/borght-dev/PRDock";
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(4);

    private readonly Lazy<UpdateManager?> _updateManagerLazy;
    private readonly ISettingsService _settingsService;
    private readonly ILogger<UpdateService> _logger;

    private CancellationTokenSource? _periodicCts;
    private VelopackUpdateInfo? _pendingUpdate;
    private bool _isUpdateReady;
    private bool _disposed;

    public UpdateService(
        ISettingsService settingsService,
        ILogger<UpdateService> logger,
        UpdateManager? updateManager = null)
    {
        _settingsService = settingsService;
        _logger = logger;

        if (updateManager is not null)
        {
            _updateManagerLazy = new Lazy<UpdateManager?>(() => updateManager);
        }
        else
        {
            _updateManagerLazy = new Lazy<UpdateManager?>(() =>
            {
                try
                {
                    var source = new GithubSource(GitHubRepoUrl, null, false);
                    return new UpdateManager(source);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Could not initialize UpdateManager (dev mode)");
                    return null;
                }
            });
        }
    }

    private UpdateManager? Manager => _updateManagerLazy.Value;

    public bool IsInstalled => Manager?.IsInstalled == true;

    public string CurrentVersion
    {
        get
        {
            if (IsInstalled && Manager!.CurrentVersion is { } ver)
                return ver.ToString();

            // Fall back to assembly version for dev mode
            var asm = Assembly.GetEntryAssembly() ?? Assembly.GetExecutingAssembly();
            return asm.GetName().Version?.ToString(3) ?? "0.0.0";
        }
    }

    public bool IsUpdateReady => _isUpdateReady;

    public event Action<Models.UpdateInfo>? UpdateAvailable;
    public event Action? UpdateReady;
    public event Action<int>? DownloadProgress;

    public async Task<Models.UpdateInfo?> CheckForUpdateAsync(CancellationToken ct = default)
    {
        if (!IsInstalled)
        {
            _logger.LogDebug("Not installed via Velopack — skipping update check");
            return null;
        }

        try
        {
            var update = await Manager!.CheckForUpdatesAsync();
            if (update is null)
            {
                _logger.LogDebug("No updates available");
                return null;
            }

            _pendingUpdate = update;
            var info = new Models.UpdateInfo
            {
                Version = update.TargetFullRelease.Version.ToString(),
                ReleaseNotes = update.TargetFullRelease.NotesMarkdown
            };

            _logger.LogInformation("Update available: {Version}", info.Version);
            UpdateAvailable?.Invoke(info);

            if (_settingsService.CurrentSettings.Updates.AutoDownload)
            {
                await DownloadUpdateAsync(ct);
            }

            return info;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Failed to check for updates");
            return null;
        }
    }

    public async Task DownloadUpdateAsync(CancellationToken ct = default)
    {
        if (!IsInstalled || _pendingUpdate is null)
            return;

        try
        {
            await Manager!.DownloadUpdatesAsync(
                _pendingUpdate,
                progress => DownloadProgress?.Invoke(progress),
                ct);

            _isUpdateReady = true;
            _logger.LogInformation("Update downloaded and ready to install");
            UpdateReady?.Invoke();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Failed to download update");
        }
    }

    public void ApplyUpdateAndRestart()
    {
        if (!IsInstalled || !_isUpdateReady || _pendingUpdate is null)
            return;

        _logger.LogInformation("Applying update and restarting...");
        Manager!.ApplyUpdatesAndRestart(_pendingUpdate.TargetFullRelease);
    }

    public void StartPeriodicChecks()
    {
        if (_periodicCts is not null)
            return;

        _periodicCts = new CancellationTokenSource();
        _ = RunPeriodicChecksAsync(_periodicCts.Token);
    }

    public void StopPeriodicChecks()
    {
        _periodicCts?.Cancel();
        _periodicCts?.Dispose();
        _periodicCts = null;
    }

    private async Task RunPeriodicChecksAsync(CancellationToken ct)
    {
        // Initial check after a short delay
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            await CheckForUpdateAsync(ct);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        using var timer = new PeriodicTimer(CheckInterval);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(ct))
                    break;

                await CheckForUpdateAsync(ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        StopPeriodicChecks();
    }
}
