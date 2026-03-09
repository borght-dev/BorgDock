using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IUpdateService : IDisposable
{
    string CurrentVersion { get; }
    bool IsUpdateReady { get; }
    bool IsInstalled { get; }
    void StartPeriodicChecks();
    void StopPeriodicChecks();
    Task<UpdateInfo?> CheckForUpdateAsync(CancellationToken ct = default);
    Task DownloadUpdateAsync(CancellationToken ct = default);
    void ApplyUpdateAndRestart();
    event Action<UpdateInfo>? UpdateAvailable;
    event Action? UpdateReady;
    event Action<int>? DownloadProgress;
}
