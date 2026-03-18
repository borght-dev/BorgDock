using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed partial class MigrationService : IMigrationService
{
    private const string ReleasesUrl = "https://api.github.com/repos/borght-dev/PRDock/releases/latest";
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(4);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IGitHubAuthService _authService;
    private readonly ILogger<MigrationService> _logger;
    private CancellationTokenSource? _periodicCts;
    private bool _disposed;

    public event Action<MigrationInfo>? MigrationAvailable;

    public MigrationService(
        IHttpClientFactory httpClientFactory,
        IGitHubAuthService authService,
        ILogger<MigrationService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _authService = authService;
        _logger = logger;
    }

    public async Task<MigrationInfo?> CheckForTauriReleaseAsync(CancellationToken ct = default)
    {
        try
        {
            var client = _httpClientFactory.CreateClient("GitHub");
            var token = await _authService.GetTokenAsync(ct);

            using var request = new HttpRequestMessage(HttpMethod.Get, ReleasesUrl);
            if (!string.IsNullOrEmpty(token))
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await client.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogDebug("GitHub releases API returned {Status}", (int)response.StatusCode);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(ct);
            var release = JsonSerializer.Deserialize<GitHubRelease>(json, JsonOptions);
            if (release?.Assets is null)
                return null;

            // Look for a Tauri NSIS installer (e.g. PRDock_0.2.0_x64-setup.exe)
            var tauriAsset = release.Assets.FirstOrDefault(
                a => TauriInstallerRegex().IsMatch(a.Name));

            if (tauriAsset is null)
            {
                _logger.LogDebug("No Tauri installer found in release {Tag}", release.TagName);
                return null;
            }

            var info = new MigrationInfo
            {
                Version = release.TagName.TrimStart('v'),
                DownloadUrl = tauriAsset.BrowserDownloadUrl,
                InstallerFileName = tauriAsset.Name,
                ReleaseNotes = release.Body
            };

            _logger.LogInformation("Tauri release found: v{Version} ({Asset})", info.Version, info.InstallerFileName);
            MigrationAvailable?.Invoke(info);
            return info;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Failed to check for Tauri migration");
            return null;
        }
    }

    public async Task<string> DownloadInstallerAsync(
        MigrationInfo info,
        IProgress<int>? progress = null,
        CancellationToken ct = default)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), info.InstallerFileName);
        _logger.LogInformation("Downloading Tauri installer to {Path}", tempPath);

        var client = _httpClientFactory.CreateClient();
        using var response = await client.GetAsync(info.DownloadUrl, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();

        var totalBytes = response.Content.Headers.ContentLength ?? 0;
        await using var contentStream = await response.Content.ReadAsStreamAsync(ct);
        await using var fileStream = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);

        var buffer = new byte[8192];
        long totalRead = 0;
        int bytesRead;

        while ((bytesRead = await contentStream.ReadAsync(buffer, ct)) > 0)
        {
            await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead), ct);
            totalRead += bytesRead;
            if (totalBytes > 0)
                progress?.Report((int)(totalRead * 100 / totalBytes));
        }

        _logger.LogInformation("Tauri installer downloaded: {Bytes} bytes", totalRead);
        return tempPath;
    }

    public void LaunchInstallerAndExit(string installerPath)
    {
        _logger.LogInformation("Launching Tauri installer: {Path}", installerPath);
        Process.Start(new ProcessStartInfo
        {
            FileName = installerPath,
            UseShellExecute = true
        });
        System.Windows.Application.Current.Shutdown();
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
        // Initial check after 45 seconds (staggered from update check at 30s)
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(45), ct);
            await CheckForTauriReleaseAsync(ct);
        }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(CheckInterval);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(ct))
                    break;
                await CheckForTauriReleaseAsync(ct);
            }
            catch (OperationCanceledException) { break; }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        StopPeriodicChecks();
    }

    // Matches Tauri NSIS installer: PRDock_0.2.0_x64-setup.exe
    [GeneratedRegex(@"PRDock[_-][\d.]+[_-]x64[_-]setup\.exe$", RegexOptions.IgnoreCase)]
    private static partial Regex TauriInstallerRegex();

    // --- GitHub release DTOs ---

    private sealed class GitHubRelease
    {
        public string TagName { get; set; } = "";
        public string? Body { get; set; }
        public List<GitHubAsset>? Assets { get; set; }
    }

    private sealed class GitHubAsset
    {
        public string Name { get; set; } = "";
        public string BrowserDownloadUrl { get; set; } = "";
    }
}
