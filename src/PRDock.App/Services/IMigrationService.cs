using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IMigrationService : IDisposable
{
    Task<MigrationInfo?> CheckForTauriReleaseAsync(CancellationToken ct = default);
    Task<string> DownloadInstallerAsync(MigrationInfo info, IProgress<int>? progress = null, CancellationToken ct = default);
    void LaunchInstallerAndExit(string installerPath);
    void StartPeriodicChecks();
    void StopPeriodicChecks();
    event Action<MigrationInfo>? MigrationAvailable;
}
